import test from 'node:test';
import assert from 'node:assert/strict';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { CATALOG_LIMITS } from '../src/catalog-body.mjs';
import { READ_SUBSET_CONTRACT, READ_TOOL_NAMES } from '../src/read-bridge.mjs';
import { catalog, connected, fakeUpstream, json } from './fixtures/read-contract-v1.mjs';

const extra = (name = 'future_read') => ({ name, inputSchema: { type: 'object' },
  outputSchema: { type: 'object', $ref: 'https://never-fetch.invalid/unsupported' },
  annotations: { readOnlyHint: false, destructiveHint: true } });

test('versioned subset ignores unknown read/write tools without compiling their unsupported schemas', async t => {
  const tools = [extra('publish_memory'), ...catalog().reverse(), extra()];
  const { client, requests } = await connected(t, fakeUpstream({ tools }));
  const result = await client.listTools();
  assert.deepEqual(result.tools, catalog());
  assert.equal(result._meta['remnant/readSubsetContract'], READ_SUBSET_CONTRACT);
  const before = requests.length;
  for (const name of ['publish_memory', 'future_read']) await assert.rejects(client.callTool({ name, arguments: {} }));
  assert.equal(requests.length, before, 'Unknown names open no session and dispatch no tool');
});

test('selected schemas are compiled before exposure and malformed ignored tool envelopes still fail', async t => {
  for (const tools of [
    [extra('try_remnant'), ...catalog().slice(1)],
    catalog().map((tool, i) => i ? tool : { ...tool, outputSchema: extra().outputSchema }),
    catalog().map((tool, i) => i ? tool : { ...tool, inputSchema: extra().outputSchema }),
    [...catalog(), { name: 'future', inputSchema: null }],
  ]) {
    const { client, requests } = await connected(t, fakeUpstream({ tools }));
    // Low-level request ensures the bridge, not a downstream schema compiler, refuses it.
    await assert.rejects(client.request({ method: 'tools/list' }, ListToolsResultSchema));
    assert.equal(requests.some(x => x.method === 'tools/call'), false);
  }
});

test('catalog pagination selects across pages and permits exactly 64 received tools', async t => {
  const tools = [...Array.from({ length: 57 }, (_, i) => extra(`future_${i}`)), ...catalog()];
  const { client, requests } = await connected(t, fakeUpstream({ intercept: message => {
    if (message.method !== 'tools/list') return;
    const page = Number(message.params?.cursor ?? 0);
    return json({ jsonrpc: '2.0', id: message.id, result: {
      tools: tools.slice(page * 8, page * 8 + 8), ...(page < 7 ? { nextCursor: String(page + 1) } : {}),
    } });
  } }));
  assert.deepEqual((await client.listTools()).tools.map(x => x.name), READ_TOOL_NAMES);
  assert.equal(requests.filter(x => x.method === 'tools/list').length, CATALOG_LIMITS.pages);
});

for (const variant of ['entries', 'pages', 'cycle', 'duplicate-known', 'duplicate-unknown']) {
  test(`catalog refuses ${variant} without a tool call or retry`, async t => {
    let count = 0;
    const fixture = fakeUpstream({ intercept: message => {
      if (message.method !== 'tools/list') return;
      count++;
      const result = variant === 'entries' ? { tools: [...catalog(), ...Array.from({ length: 58 }, (_, i) => extra(`future_${i}`))] }
        : variant === 'duplicate-known' ? { tools: [...catalog(), catalog()[0]] }
        : variant === 'duplicate-unknown' ? { tools: [...catalog(), extra(), extra()] }
        : { tools: count === 1 ? catalog() : [], nextCursor: variant === 'cycle' ? 'same' : String(count) };
      return json({ jsonrpc: '2.0', id: message.id, result });
    } });
    const { client, requests } = await connected(t, fixture);
    await assert.rejects(client.listTools(), /UPSTREAM_CATALOG_CHANGED/);
    assert.equal(count, variant === 'pages' ? 8 : variant === 'cycle' ? 2 : 1);
    assert.equal(requests.some(x => x.method === 'tools/call'), false);
  });
}

function fragmented(bytes, { open = false, onCancel = () => {} } = {}) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset < bytes.length) {
        controller.enqueue(bytes.slice(offset, offset += 4096));
      } else if (!open) controller.close();
    },
    cancel: onCancel,
  });
}

for (const kind of ['json-no-length', 'json-lying-length', 'sse-fragmented']) {
  test(`${kind}: actual bytes are capped before SDK parsing`, async t => {
    let cancelled = false;
    const fixture = fakeUpstream({ intercept: message => {
      if (message.method !== 'tools/list') return;
      const body = new TextEncoder().encode((kind.startsWith('sse') ? 'data: ' : '') + 'x'.repeat(CATALOG_LIMITS.pageBytes + 8192));
      return new Response(fragmented(body, { onCancel: () => { cancelled = true; } }), {
        headers: { 'content-type': kind.startsWith('sse') ? 'text/event-stream' : 'application/json',
          ...(kind === 'json-lying-length' ? { 'content-length': '1' } : {}) },
      });
    } });
    const { client, requests } = await connected(t, fixture, { timeoutMs: 2000 });
    await assert.rejects(client.listTools(), /UPSTREAM_CATALOG_CHANGED/);
    assert.equal(cancelled, true);
    assert.equal(requests.filter(x => x.method === 'tools/list').length, 1);
  });
}

test('SSE forwards a valid result without waiting for stream EOF and cancels cleanup', async t => {
  let cancelled = false;
  const fixture = fakeUpstream({ intercept: message => message.method === 'tools/list'
    ? new Response(fragmented(new TextEncoder().encode(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: catalog() } })}\n\n`),
      { open: true, onCancel: () => { cancelled = true; } }), { headers: { 'content-type': 'text/event-stream' } }) : undefined });
  const { client } = await connected(t, fixture, { timeoutMs: 2000 });
  assert.deepEqual((await client.listTools()).tools, catalog());
  assert.equal(cancelled, true);
});

test('cumulative catalog bytes stop a fifth large but individually valid page', async t => {
  let count = 0;
  const fixture = fakeUpstream({ intercept: message => {
    if (message.method !== 'tools/list') return;
    count++;
    return json({ jsonrpc: '2.0', id: message.id, result: { tools: count === 1 ? catalog() : [],
      nextCursor: String(count), _meta: { padding: 'x'.repeat(900_000) } } });
  } });
  const { client } = await connected(t, fixture);
  await assert.rejects(client.listTools(), /UPSTREAM_CATALOG_CHANGED/);
  assert.equal(count, 5);
});

for (const mode of ['cancel', 'deadline']) {
  test(`stalled catalog body: ${mode} cancels the stream`, async t => {
    let started, cancelled;
    const ready = new Promise(resolve => { started = resolve; });
    const stopped = new Promise(resolve => { cancelled = resolve; });
    const fixture = fakeUpstream({ intercept: message => {
      if (message.method !== 'tools/list') return;
      started();
      return new Response(new ReadableStream({ cancel: cancelled }), { headers: { 'content-type': 'application/json' } });
    } });
    const { client, requests } = await connected(t, fixture, { timeoutMs: mode === 'deadline' ? 100 : 2000 });
    const controller = new AbortController();
    const pending = client.listTools(undefined, { signal: controller.signal });
    await ready;
    if (mode === 'cancel') controller.abort();
    await assert.rejects(pending, mode === 'deadline' ? /UPSTREAM_TIMEOUT/ : undefined);
    await stopped;
    assert.equal(requests.filter(x => x.method === 'tools/list').length, 1);
  });
}

for (const variant of ['valid', 'oversized', 'stall']) {
  test(`session GET SSE carrying tools/list: ${variant}`, async t => {
    let getStream, cancelled = false, lists = 0;
    const fixture = fakeUpstream({ intercept: async message => {
      if (message.method !== 'tools/list') return;
      lists++;
      if (variant !== 'stall') {
        const data = variant === 'valid'
          ? `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: catalog() } })}\n\n`
          : 'data: ' + 'x'.repeat(CATALOG_LIMITS.pageBytes + 1);
        getStream.enqueue(new TextEncoder().encode(data));
      }
      return new Response(null, { status: 202 });
    } });
    const { client } = await connected(t, { ...fixture, fetchImpl: (url, init) => init.method === 'GET'
      ? new Response(new ReadableStream({ start(controller) { getStream = controller; }, cancel() { cancelled = true; } }),
        { headers: { 'content-type': 'text/event-stream' } })
      : fixture.fetchImpl(url, init) }, { timeoutMs: variant === 'stall' ? 100 : 2000 });
    if (variant === 'valid') assert.deepEqual((await client.listTools()).tools, catalog());
    else await assert.rejects(client.listTools(), variant === 'stall' ? /UPSTREAM_TIMEOUT/ : /UPSTREAM_CATALOG_CHANGED/);
    assert.equal(cancelled, true);
    assert.equal(lists, 1);
  });
}
