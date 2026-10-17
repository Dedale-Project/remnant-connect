// Transport seam only. No provider, process, endpoint, credential or model is loaded.
// A supplied generate callback is outside the pure controller. This module does NOT
// sandbox it, prevent its network access, or stop synchronous CPU work.
export const ADAPTER_CONTRACT_VERSION = 'consumer-adapter-v1';
const fields = ['kind', 'host', 'model', 'version', 'transport'];
function metadata(adapter, controller) {
  const result = { contractVersion: ADAPTER_CONTRACT_VERSION, networkIsolation: 'NOT_ATTESTED',
    identitySource: 'caller-declared-unverified' };
  for (const field of fields) {
    const value = adapter?.metadata?.[field];
    if (typeof value !== 'string' || value.length > 128 || !/^[a-zA-Z0-9_.:/ -]+$/.test(value) || controller.containsCanary(value))
      return null;
    result[field] = value;
  }
  return ['scripted', 'model'].includes(result.kind) ? Object.freeze(result) : null;
}
export async function runAdapter({ controller, source, adapter = null, signal, waitMs = controller.budgets.adapterWaitMs }) {
  const prepared = controller.prepareRequest(source);
  if (!prepared.ok) return { status: 'INPUT_REJECTED', code: prepared.code, adapterInvoked: false, modelExecution: 'NOT_RUN' };
  if (!adapter) return { status: 'NOT_RUN', code: 'NO_MODEL_ADAPTER', adapterInvoked: false, modelExecution: 'NOT_RUN',
    networkIsolation: 'NOT_ATTESTED' };
  const identity = metadata(adapter, controller);
  if (!identity || typeof adapter.generate !== 'function') return { status: 'ADAPTER_REJECTED', code: 'ADAPTER_INVALID', adapterInvoked: false, modelExecution: 'NOT_RUN' };
  if (!Number.isInteger(waitMs) || waitMs < 1 || waitMs > controller.budgets.adapterWaitMs)
    return { status: 'ADAPTER_REJECTED', code: 'WAIT_BUDGET_INVALID', adapterInvoked: false, modelExecution: 'NOT_RUN' };
  if (signal?.aborted) return { status: 'CANCELLED', code: 'CALLER_CANCELLED', adapterInvoked: false, modelExecution: 'NOT_RUN', adapter: identity };
  const abort = new AbortController(); let timer, onAbort;
  const stop = new Promise(resolve => {
    timer = setTimeout(() => { abort.abort(); resolve({ status: 'TIMEOUT', code: 'COOPERATIVE_WAIT_EXPIRED' }); }, waitMs);
    onAbort = () => { abort.abort(); resolve({ status: 'CANCELLED', code: 'CALLER_CANCELLED' }); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
  let adapterInvoked = false;
  const generated = Promise.resolve().then(async () => {
    if (abort.signal.aborted) return { status: 'CANCELLED', code: 'CALLER_CANCELLED' };
    adapterInvoked = true;
    const response = await adapter.generate(prepared.request, { signal: abort.signal });
    return { status: 'COMPLETED', result: controller.evaluate(source, response) };
  })
    .catch(() => ({ status: 'ADAPTER_ERROR', code: 'ADAPTER_FAILED' })); // Never echo exception messages/stacks.
  try {
    const outcome = await Promise.race([generated, stop]);
    return { ...outcome, adapter: identity, adapterInvoked,
      modelExecution: adapterInvoked && identity.kind === 'model' ? 'UNVERIFIED' : 'NOT_RUN',
      timingGuarantee: 'cooperative_async_wait_only', externalProcessIsolation: 'NOT_ATTESTED' };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}

