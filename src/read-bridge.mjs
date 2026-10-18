// Copyright 2026 DÉDALE / Dedale-Project
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { boundedCatalogBody, CATALOG_LIMITS } from './catalog-body.mjs';
import { readProfile, isReadV2Resource, READ_V2_RESOURCE_TEMPLATES } from './read-profiles.mjs';
import {
  CallToolRequestSchema, CallToolResultSchema, ErrorCode, ListToolsRequestSchema, ListToolsResultSchema, McpError, ResultSchema,
  ListResourcesRequestSchema, ListResourcesResultSchema, ListResourceTemplatesRequestSchema, ListResourceTemplatesResultSchema,
  ReadResourceRequestSchema, ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const READ_ENDPOINT = 'https://remnant.dedale-bi.com/mcp/chatgpt';
export const READ_TOOL_NAMES = Object.freeze([
  'try_remnant', 'search_memories', 'inspect_memory', 'find_agents',
  'inspect_agent', 'get_trust_passport', 'verify_trust_passport',
]);
export const BRIDGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const MAX_RETRY_AFTER_SECONDS = 3600;
export const READ_SUBSET_CONTRACT = 'remnant-read-subset-v2';
const MAX_RETRY_AFTER_LENGTH = 128;
const MAX_RPC_ERROR_BYTES = 16_384;
const ALLOWED_SOURCES = new Set(['stdio', 'glama', 'operator']);
const ALLOWED_HEADERS = new Set([
  'accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id',
]);

class BridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.code = code;
    for (const key of ['httpStatus', 'rpcCode', 'retryAfterSeconds', 'status', 'retryable']) {
      if (details[key] !== undefined) this[key] = details[key];
    }
  }
  publicDetails() {
    return { code: this.code, message: this.message,
      ...Object.fromEntries(['httpStatus', 'rpcCode', 'retryAfterSeconds', 'status', 'retryable']
        .filter(key => this[key] !== undefined).map(key => [key, this[key]])) };
  }
}

/** A bounded hint, never a retry instruction. Accept delta-seconds or canonical HTTP dates. */
export function parseRetryAfter(value, now = Date.now()) {
  if (typeof value !== 'string' || value.length > MAX_RETRY_AFTER_LENGTH) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) return Math.min(Number(text), MAX_RETRY_AFTER_SECONDS);
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text)) return undefined;
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toUTCString() !== text) return undefined;
  return Math.min(MAX_RETRY_AFTER_SECONDS, Math.max(0, Math.ceil((timestamp - now) / 1000)));
}

export function acquisitionSource(value = 'stdio') {
  if (!ALLOWED_SOURCES.has(value)) {
    throw new Error('REMNANT_ACQUISITION_SOURCE must be stdio, glama, or operator.');
  }
  return value;
}

function checkedCatalog(tools) {
  const names = new Set(tools.map(tool => tool.name));
  const selected = READ_TOOL_NAMES.map(name => tools.find(tool => tool.name === name));
  if (names.size !== tools.length
      || READ_TOOL_NAMES.some(name => !names.has(name))
      || selected.some(tool => tool.annotations?.readOnlyHint !== true
        || tool.annotations?.destructiveHint !== false)) {
    throw new BridgeError('UPSTREAM_CATALOG_CHANGED',
      'The upstream Read catalog no longer matches the seven supported read-only tools. Update or review this bridge before continuing.');
  }
  try {
    for (const tool of selected) {
      // Independent validators avoid cross-tool $id cache collisions. This is
      // local schema support, not validation of arbitrary future tools.
      new AjvJsonSchemaValidator().getValidator(tool.inputSchema);
      if (tool.outputSchema) new AjvJsonSchemaValidator().getValidator(tool.outputSchema);
    }
  } catch {
    throw new BridgeError('UPSTREAM_CATALOG_CHANGED',
      'A supported Read tool has a schema this bridge cannot compile. Review the bridge before continuing.');
  }
  return selected;
}

function publicError(error, signal) {
  if (signal.aborted || (error instanceof McpError && error.code === ErrorCode.RequestTimeout)) return {
    code: signal.aborted && signal.reason?.name !== 'TimeoutError' ? 'REQUEST_CANCELLED' : 'UPSTREAM_TIMEOUT',
    message: 'The Remnant Read request timed out or was cancelled. No automatic retry was made.',
  };
  if (error instanceof BridgeError) return error.publicDetails();
  if (error instanceof McpError && error.code === ErrorCode.InvalidParams) return {
    code: 'UPSTREAM_INVALID_PARAMS', rpcCode: ErrorCode.InvalidParams,
    message: 'The Remnant Read service rejected the tool parameters. Check the advertised schema before making a new request. No automatic retry was made.',
  };
  return {
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'The hosted Remnant Read service could not complete this request. Check its availability and retry later; this bridge has no local knowledge database.',
  };
}

/** V2 has one failure language; retain observations without treating a redirect as HTTP success. */
function v2Failure(failure) {
  const defaults = { UPSTREAM_INVALID_PARAMS: 400, REQUEST_CANCELLED: 499, UPSTREAM_TIMEOUT: 504,
    UPSTREAM_UNAVAILABLE: 503, BRIDGE_BUSY: 503, UPSTREAM_PROFILE_UNAVAILABLE: 503 };
  const status = failure.httpStatus >= 400 && failure.httpStatus <= 599 ? failure.httpStatus : defaults[failure.code] ?? 502;
  const category = ({ 400: 'validation', 401: 'authentication', 402: 'payment', 403: 'authorization',
    404: 'not_found', 409: 'conflict', 422: 'validation', 429: 'rate_limit' })[status] ?? 'server';
  const retryable = ['UPSTREAM_RATE_LIMITED', 'UPSTREAM_TIMEOUT', 'BRIDGE_BUSY'].includes(failure.code) ||
    failure.code === 'UPSTREAM_UNAVAILABLE' && (!failure.httpStatus || failure.httpStatus >= 500);
  return { status, code: failure.code, error: failure.message, category, retryable,
    ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }),
    ...(failure.rpcCode === undefined ? {} : { rpcCode: failure.rpcCode }),
    ...(failure.retryAfterSeconds === undefined ? {} : { retryAfter: failure.retryAfterSeconds }) };
}

/** Only resource RPC failures with the documented bounded shape may retain business identity. */
function resourceRpcFailure(error) {
  const data = error instanceof McpError ? error.data : undefined;
  const statuses = { RESOURCE_NOT_FOUND: 404, REMNANT_DISABLED: 403, INVALID_INPUT: 400,
    RATE_LIMITED: 429, REQUEST_TIMEOUT: 503, REQUEST_CANCELLED: 503, INTERNAL_ERROR: 500, INVALID_OUTPUT: 500 };
  if (!data || typeof data !== 'object' || !Object.hasOwn(statuses, data.code) || statuses[data.code] !== data.status ||
      typeof data.retryable !== 'boolean' || error.code !== (data.status === 404 ? -32002 : data.status === 400 ? -32602 : -32603)) return undefined;
  return new BridgeError(data.code, 'The selected public resource could not be read. No automatic retry was made.',
    { status: data.status, retryable: data.retryable, rpcCode: error.code,
      ...(Number.isInteger(data.retryAfter) && data.retryAfter >= 0 && data.retryAfter <= MAX_RETRY_AFTER_SECONDS ? { retryAfterSeconds: data.retryAfter } : {}) });
}

// HTTP 400 can carry the protocol's InvalidParams response. Read only a bounded
// JSON body and return its whitelisted code; server messages/data never escape.
async function invalidParamsResponse(response, requestBody, signal) {
  if (response.status !== 400 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return false;
  const advertised = Number(response.headers.get('content-length'));
  if (advertised > MAX_RPC_ERROR_BYTES || !response.body) return false;
  let request;
  try { request = JSON.parse(requestBody); } catch { return false; }
  if (!['string', 'number'].includes(typeof request?.id)) return false;
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RPC_ERROR_BYTES) return false;
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return result?.jsonrpc === '2.0' && result.id === request.id && !Object.hasOwn(result, 'result')
      && result.error?.code === ErrorCode.InvalidParams;
  } catch { signal.throwIfAborted(); return false; }
  finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
}

/** Create a server; fetchImpl and timeoutMs are injection points for offline contract tests. */
export function createReadBridge({ source = 'stdio', fetchImpl = globalThis.fetch, timeoutMs = 20_000, profile = 'full-v1' } = {}) {
  const selectedProfile = readProfile(profile), minimal = selectedProfile.resourcesRequired;
  const endpoint = new URL(selectedProfile.endpoint);
  endpoint.searchParams.set('source', acquisitionSource(source));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000) {
    throw new Error('Bridge timeout must be between 1 and 20000 milliseconds.');
  }
  const active = new Set();
  const server = new Server({ name: 'remnant-read-stdio', version: BRIDGE_VERSION }, {
    capabilities: { tools: {}, ...(minimal ? { resources: {} } : {}) },
    instructions: `Anonymous Remnant Read bridge to ${selectedProfile.endpoint}. `
      + (minimal ? 'This explicit v2 profile requires resources/read: follow returned evidence URIs for progressive details and existing signed artifacts. Host support is not established by this bridge. ' : '')
      + 'Tool arguments are sent to the hosted service; use sanitized technical inputs, never secrets or private logs. '
      + 'Operational telemetry can be recorded. Search then inspect evidence before relying on it; confidence is not truth. '
      + 'No publication, feedback, consumption, Candy, authentication or private-backend access is provided. '
      + 'The integration code is separate from the proprietary hosted Remnant service and its data.',
  });

  async function upstream(operation, parentSignal) {
    if (active.size >= 8) throw new BridgeError('BRIDGE_BUSY', 'At most eight Read requests can run concurrently. Retry after an existing request finishes.');
    const controller = new AbortController();
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = AbortSignal.any([controller.signal, deadline, ...(parentSignal ? [parentSignal] : [])]);
    active.add(controller);
    const client = new Client({ name: 'remnant-read-stdio', version: BRIDGE_VERSION });
    const catalogBudget = { bytes: 0, failure: undefined };
    const transport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { redirect: 'error' },
      reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
      fetch: async (url, init = {}) => {
        if (new URL(typeof url === 'string' || url instanceof URL ? url : url.url).href !== endpoint.href) {
          throw new BridgeError('UPSTREAM_REDIRECT_REFUSED', 'This bridge only connects to the canonical Remnant Read endpoint.');
        }
        const headers = new Headers();
        for (const [name, value] of new Headers(init.headers)) {
          if (ALLOWED_HEADERS.has(name)) headers.set(name, value);
        }
        // This exact marker is recognized by the hosted service as a diagnostic probe.
        if (source === 'operator') headers.set('x-remnant-probe', 'glama-directory-health');
        const response = await fetchImpl(endpoint, {
          method: init.method, headers, body: init.body,
          credentials: 'omit', redirect: 'error',
          signal: AbortSignal.any([signal, ...(init.signal ? [init.signal] : [])]),
        });
        // GET/DELETE 405 is a supported stateless-transport response. For other
        // HTTP failures, discard the body before the SDK can buffer/echo it.
        if (!response.ok && !(response.status === 405 && ['GET', 'DELETE'].includes(init.method))) {
          const invalidParams = await invalidParamsResponse(response, init.body, signal);
          void response.body?.cancel().catch(() => {});
          const details = { httpStatus: response.status };
          if (invalidParams) throw new BridgeError('UPSTREAM_INVALID_PARAMS',
            'The Remnant Read service rejected the tool parameters. Check the advertised schema before making a new request. No automatic retry was made.',
            { ...details, rpcCode: ErrorCode.InvalidParams });
          if (response.status === 429 || response.status === 503) {
            const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
            if (retryAfterSeconds !== undefined) details.retryAfterSeconds = retryAfterSeconds;
          }
          if (response.status === 429) throw new BridgeError('UPSTREAM_RATE_LIMITED',
            'The Remnant Read service rate-limited this request. No automatic retry was made.', details);
          if (response.status === 401 || response.status === 403) throw new BridgeError('UPSTREAM_ACCESS_DENIED',
            'The anonymous Remnant Read service refused access. No credentials were sent and no automatic retry was made.', details);
          if (response.status >= 300 && response.status < 400) throw new BridgeError('UPSTREAM_REDIRECT_REFUSED',
            'This bridge only connects to the canonical Remnant Read endpoint.', details);
          throw new BridgeError('UPSTREAM_UNAVAILABLE',
            'The hosted Remnant Read service could not complete this request. No automatic retry was made.', details);
        }
        let method;
        try { method = JSON.parse(init.body).method; } catch { /* GET/DELETE have no JSON body. */ }
        // The session GET stream can deliver the matching tools/list response
        // too. Its notifications consume the same operation budget.
        if (response.ok && (method === 'tools/list' || init.method === 'GET' || minimal && method?.startsWith('resources/'))) return boundedCatalogBody(response, {
          signal, budget: catalogBudget,
          onLimit: () => {
            catalogBudget.failure = new BridgeError(method?.startsWith('resources/') ? 'UPSTREAM_RESOURCE_TOO_LARGE' : 'UPSTREAM_CATALOG_CHANGED',
              method?.startsWith('resources/') ? 'The upstream resource exceeded its byte budget. No automatic retry was made.' : 'The upstream Read catalog exceeded its byte budget. No automatic retry was made.');
            controller.abort();
          },
        });
        return response;
      },
    });
    const options = { signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs };
    try {
      signal.throwIfAborted();
      await client.connect(transport, options);
      if (minimal && !client.getServerCapabilities()?.resources) throw new BridgeError('UPSTREAM_PROFILE_UNAVAILABLE',
        'The selected v2 service did not advertise resources/read. Select full-v1 explicitly if needed; no automatic fallback was made.');
      const tools = [];
      const cursors = new Set();
      let cursor, pages = 0;
      do {
        // listTools() compiles output schemas for every returned tool. Validate
        // only the protocol envelope here; ignored tools must never be compiled.
        const page = await client.request({ method: 'tools/list', ...(cursor ? { params: { cursor } } : {}) }, ListToolsResultSchema, options);
        pages++;
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (tools.length > CATALOG_LIMITS.tools || (cursor && (cursors.has(cursor) || pages >= CATALOG_LIMITS.pages))) {
          throw new BridgeError('UPSTREAM_CATALOG_CHANGED', 'The upstream Read catalog exceeds its tool/page budget or repeats a cursor. Review the bridge before continuing.');
        }
        if (cursor) cursors.add(cursor);
      } while (cursor);
      const checked = checkedCatalog(tools);
      if (minimal && checked.some(tool => !tool.outputSchema || tool._meta?.['remnant/outputContract'] !== selectedProfile.outputContract ||
          tool._meta?.['remnant/readProjection'] !== selectedProfile.projection ||
          ['try_remnant', 'inspect_memory', 'inspect_agent', 'get_trust_passport'].includes(tool.name) && tool._meta?.['remnant/resourcesRequired'] !== true))
        throw new BridgeError('UPSTREAM_CATALOG_CHANGED', 'The upstream catalog does not declare the selected v2 contract and resource requirement.');
      return await operation(client, checked, options);
    } catch (error) {
      const safe = catalogBudget.failure?.publicDetails() ?? publicError(error, signal);
      throw new BridgeError(safe.code, safe.message, safe);
    } finally {
      // DELETE only releases this anonymous MCP session; cleanup never changes a tool result.
      if (transport.sessionId && !signal.aborted) {
        let timer;
        try {
          await Promise.race([
            transport.terminateSession(),
            new Promise(resolve => { timer = setTimeout(resolve, 500); }),
          ]);
        } catch { /* Best-effort session cleanup. */ }
        finally { clearTimeout(timer); }
      }
      controller.abort();
      await client.close();
      active.delete(controller);
    }
  }

  if (minimal) {
    const resourceRequest = async (method, params, schema, signal) => {
      const policy = params?._meta?.['remnant/contribution'];
      const forwarded = { ...(params?.uri ? { uri: params.uri } : {}),
        ...(policy === undefined ? {} : { _meta: { 'remnant/contribution': policy } }) };
      try { return await upstream(async (client, _tools, options) => {
        try { return await client.request({ method, params: forwarded }, schema, options); }
        catch (error) { throw resourceRpcFailure(error) ?? error; }
      }, signal); }
      catch (error) { throw new McpError(error.rpcCode ?? ErrorCode.InternalError, error.message, error.publicDetails()); }
    };
    server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
      if (request.params?.cursor) throw new McpError(ErrorCode.InvalidParams, 'Unexpected resource cursor.');
      const result = await resourceRequest('resources/list', request.params, ListResourcesResultSchema, extra.signal);
      if (result.nextCursor || result.resources.length > 32 || result.resources.some(resource => !isReadV2Resource(resource.uri)))
        throw new McpError(ErrorCode.InternalError, 'Unsupported v2 resource catalogue.');
      return result;
    });
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request, extra) => {
      if (request.params?.cursor) throw new McpError(ErrorCode.InvalidParams, 'Unexpected resource template cursor.');
      const result = await resourceRequest('resources/templates/list', request.params, ListResourceTemplatesResultSchema, extra.signal);
      const templates = result.resourceTemplates.map(resource => resource.uriTemplate);
      if (result.nextCursor || templates.length !== READ_V2_RESOURCE_TEMPLATES.length || new Set(templates).size !== templates.length || templates.some(template => !READ_V2_RESOURCE_TEMPLATES.includes(template)))
        throw new McpError(ErrorCode.InternalError, 'Unsupported v2 resource templates.');
      return result;
    });
    server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
      if (!isReadV2Resource(request.params.uri)) throw new McpError(ErrorCode.InvalidParams, 'Expected a returned Remnant v2 evidence URI.');
      const result = await resourceRequest('resources/read', request.params, ReadResourceResultSchema, extra.signal);
      if (result.contents.some(content => content.uri !== request.params.uri)) throw new McpError(ErrorCode.InternalError, 'Resource identity mismatch.');
      const document = result.contents[0];
      const invalid = () => new McpError(ErrorCode.InternalError, 'Expected one JSON text document from the selected v2 resource.');
      if (result.contents.length !== 1 || document.mimeType !== 'application/json' || typeof document.text !== 'string') throw invalid();
      let parsed;
      try { parsed = JSON.parse(document.text); } catch { throw invalid(); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
      return result;
    });
  }

  server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    if (request.params?.cursor) throw new McpError(ErrorCode.InvalidParams, 'The Read bridge returns all seven tools in one page; omit cursor.');
    try {
      return await upstream(async (_client, tools) => ({ tools, _meta: { 'remnant/readSubsetContract': READ_SUBSET_CONTRACT } }), extra.signal);
    } catch (error) {
      throw new McpError(error.rpcCode ?? ErrorCode.InternalError, `${error.code}: ${error.message}`, error.publicDetails());
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!READ_TOOL_NAMES.includes(request.params.name)) {
      throw new McpError(ErrorCode.InvalidParams, 'Unknown or non-read-only tool. Only the seven Remnant Read tools are available.');
    }
    if (request.params.task !== undefined) throw new McpError(ErrorCode.InvalidParams, 'The Read bridge does not support background tasks.');
    // Keep policy metadata when supplied, but never forward arbitrary host metadata or credentials.
    const policy = request.params._meta?.['remnant/contribution'];
    const params = {
      name: request.params.name,
      arguments: request.params.arguments ?? {},
      ...(policy === undefined ? {} : { _meta: { 'remnant/contribution': policy } }),
    };
    try {
      return await upstream(async (client, tools, options) => {
        // Separate wire-level InvalidParams from local output validation: the SDK's
        // callTool convenience method uses -32602 for both, which would blame input
        // parameters for a malformed upstream result.
        const raw = await client.request({ method: 'tools/call', params }, ResultSchema, options);
        const parsed = CallToolResultSchema.safeParse(raw);
        const invalid = () => new BridgeError('UPSTREAM_INVALID_RESPONSE',
          'The Remnant Read service returned a result that does not match its advertised contract. No automatic retry was made.');
        if (!parsed.success) throw invalid();
        const result = parsed.data, outputSchema = tools.find(tool => tool.name === params.name)?.outputSchema;
        if (outputSchema) {
          if (!result.structuredContent && !result.isError) throw invalid();
          if (result.structuredContent) {
            try {
              if (!new AjvJsonSchemaValidator().getValidator(outputSchema)(result.structuredContent).valid) throw invalid();
            } catch { throw invalid(); }
          }
        }
        return result;
      }, extra.signal);
    } catch (error) {
      const failure = error.publicDetails();
      return { isError: true, content: [{ type: 'text', text: `${failure.code}: ${failure.message}` }], structuredContent: minimal ? v2Failure(failure) : failure };
    }
  });
  server.onclose = () => { for (const controller of active) controller.abort(); };
  return server;
}

export async function runStdio() {
  const server = createReadBridge({ source: acquisitionSource(process.env.REMNANT_ACQUISITION_SOURCE ?? 'stdio'), profile: process.env.REMNANT_READ_PROFILE ?? 'full-v1' });
  // SDK protocol responses exclusively own stdout. Errors deliberately omit request bodies.
  server.onerror = () => { process.stderr.write('Remnant Read bridge: protocol error.\n'); };
  await server.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 1_048_576 }));
  const close = () => { void server.close(); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStdio().catch(() => {
    process.stderr.write('Remnant Read bridge could not start. Check Node.js, dependencies and REMNANT_ACQUISITION_SOURCE.\n');
    process.exitCode = 1;
  });
}
