// Copyright 2026 DÉDALE / Dedale-Project
// SPDX-License-Identifier: Apache-2.0
export const CATALOG_LIMITS = Object.freeze({ pageBytes: 1_048_576, operationBytes: 4_194_304, pages: 8, tools: 64 });

// Count decoded fetch body bytes before the SDK's JSON/SSE parser receives them.
// This does not bound the allocation of a single chunk by the fetch implementation.
// SSE is forwarded incrementally: a completed response need not wait for EOF.
export function boundedCatalogBody(response, { signal, budget, onLimit }) {
  if (!response.body) return response;
  const reader = response.body.getReader();
  let pageBytes = 0, settled = false, output;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const cleanup = () => { signal.removeEventListener('abort', abort); };
  const abort = () => {
    if (settled) return;
    settled = true; cleanup(); cancel();
    output.error(signal.reason ?? new Error('Catalog read cancelled'));
  };
  const body = new ReadableStream({
    start(controller) {
      output = controller;
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (settled) return;
        if (done) { settled = true; cleanup(); reader.releaseLock(); controller.close(); return; }
        pageBytes += value.byteLength;
        budget.bytes += value.byteLength;
        if (pageBytes > CATALOG_LIMITS.pageBytes || budget.bytes > CATALOG_LIMITS.operationBytes) {
          // Abort also rejects a pending SDK request whose SSE reader reports an
          // error without rejecting the matching JSON-RPC request immediately.
          onLimit();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        if (!settled) { settled = true; cleanup(); cancel(); controller.error(error); }
      }
    },
    cancel() { if (!settled) { settled = true; cleanup(); cancel(); } },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
