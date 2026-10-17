// Copyright 2026 DÉDALE / Dedale-Project
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import {
  CallToolRequestSchema, CallToolResultSchema, ErrorCode, ListToolsRequestSchema, McpError, ResultSchema,
} from '@modelcontextprotocol/sdk/types.js';

export const READ_ENDPOINT = 'https://remnant.dedale-bi.com/mcp/chatgpt';
export const READ_TOOL_NAMES = Object.freeze([
  'try_remnant', 'search_memories', 'inspect_memory', 'find_agents',
  'inspect_agent', 'get_trust_passport', 'verify_trust_passport',
]);
export const BRIDGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const MAX_RETRY_AFTER_SECONDS = 3600;
const MAX_RETRY_AFTER_LENGTH = 128;
const ALLOWED_SOURCES = new Set(['stdio', 'glama', 'operator']);
const ALLOWED_HEADERS = new Set([
  'accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id',
]);

class BridgeError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.code = code;
    for (const key of ['httpStatus', 'rpcCode', 'retryAfterSeconds']) {
      if (details[key] !== undefined) this[key] = details[key];
    }
  }
  publicDetails() {
    return { code: this.code, message: this.message,
      ...Object.fromEntries(['httpStatus', 'rpcCode', 'retryAfterSeconds']
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
  if (tools.length !== READ_TOOL_NAMES.length || names.size !== tools.length
      || READ_TOOL_NAMES.some(name => !names.has(name))
      || tools.some(tool => tool.annotations?.readOnlyHint !== true
        || tool.annotations?.destructiveHint !== false)) {
    throw new BridgeError('UPSTREAM_CATALOG_CHANGED',
      'The upstream Read catalog no longer matches the seven supported read-only tools. Update or review this bridge before continuing.');
  }
  return tools;
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

/** Create a server; fetchImpl and timeoutMs are injection points for offline contract tests. */
export function createReadBridge({ source = 'stdio', fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  const endpoint = new URL(READ_ENDPOINT);
  endpoint.searchParams.set('source', acquisitionSource(source));
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000) {
    throw new Error('Bridge timeout must be between 1 and 20000 milliseconds.');
  }
  const active = new Set();
  const server = new Server({ name: 'remnant-read-stdio', version: BRIDGE_VERSION }, {
    capabilities: { tools: {} },
    instructions: 'Anonymous Remnant Read bridge to https://remnant.dedale-bi.com/mcp/chatgpt. '
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
          void response.body?.cancel().catch(() => {});
          const details = { httpStatus: response.status };
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
        return response;
      },
    });
    const options = { signal, timeout: timeoutMs, maxTotalTimeout: timeoutMs };
    try {
      signal.throwIfAborted();
      await client.connect(transport, options);
      const tools = [];
      const cursors = new Set();
      let cursor;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, options);
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (tools.length > READ_TOOL_NAMES.length || (cursor && (cursors.has(cursor) || cursors.size >= 7))) {
          throw new BridgeError('UPSTREAM_CATALOG_CHANGED', 'The upstream Read catalog has unexpected tools or pagination. Review the bridge before continuing.');
        }
        if (cursor) cursors.add(cursor);
      } while (cursor);
      checkedCatalog(tools);
      return await operation(client, tools, options);
    } catch (error) {
      const safe = publicError(error, signal);
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

  server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    if (request.params?.cursor) throw new McpError(ErrorCode.InvalidParams, 'The Read bridge returns all seven tools in one page; omit cursor.');
    try {
      return await upstream(async (_client, tools) => ({ tools }), extra.signal);
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
      return { isError: true, content: [{ type: 'text', text: `${failure.code}: ${failure.message}` }], structuredContent: failure };
    }
  });
  server.onclose = () => { for (const controller of active) controller.abort(); };
  return server;
}

export async function runStdio() {
  const server = createReadBridge({ source: acquisitionSource(process.env.REMNANT_ACQUISITION_SOURCE ?? 'stdio') });
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
