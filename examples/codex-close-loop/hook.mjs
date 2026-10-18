import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const reasonCodes = new Set(['PENDING', 'FAILED', 'COMPLETE', 'OPTED_OUT', 'REMNANT_DISABLED', 'NO_REUSABLE_LEARNING', 'DUPLICATE', 'UNSAFE', 'WRITE_UNAVAILABLE', 'CONSENT_REQUIRED', 'READ_UNAVAILABLE', 'PUBLIC_NOT_ALLOWED', 'FEEDBACK_SCOPE_MISSING', 'TOOL_SCHEMA_UNAVAILABLE']);
const pendingNames = new Set(['assess', 'search_duplicates', 'feedback', 'contribute', 'verify']);
const key = (sessionId, turnId) => createHash('sha256').update(JSON.stringify([sessionId, turnId])).digest('hex');

/** Host integration API, never a model-callable tool. Do not write agent assertions here.
 * The trusted host must obtain this decision by awaiting its completion guard and
 * confirming write outcomes. This filesystem is a trust boundary, not a signature.
 */
export async function writeHostDecision({ stateDir, sessionId, turnId, decision }) {
  if (!validDecision(decision) || !sessionId || !turnId) throw new Error('Invalid host decision');
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolve(stateDir, key(sessionId, turnId) + '.json'), JSON.stringify({
    schemaVersion: 1, sessionId, turnId, decision,
  }), { encoding: 'utf8', mode: 0o600 });
}

/** Map the trusted completion wrapper's onDecision callback, not a model JSON blob. */
export function fromCompletionDecision({ ready, state }) {
  const pending = new Set(['PENDING', 'FAILED', 'UNCONFIRMED_WRITE']);
  const pendingActions = [];
  if (pending.has(state.contributionResult)) pendingActions.push(state.contributionResult === 'UNCONFIRMED_WRITE' ? 'verify' : 'contribute');
  if (Object.values(state.feedbackResults).some(value => pending.has(value))) pendingActions.push('feedback');
  if (!ready && !pendingActions.length) pendingActions.push('assess');
  const result = state.blockedReason ?? state.contributionResult;
  return { ready, blocked: ready && !['PUBLISHED', 'NO_REUSABLE_LEARNING', 'DUPLICATE'].includes(result),
    pendingActions: ready ? [] : pendingActions,
    reasonCode: ready ? (result === 'PUBLISHED' ? 'COMPLETE' : reasonCodes.has(result) ? result : 'COMPLETE') : result === 'FAILED' ? 'FAILED' : 'PENDING' };
}

function validDecision(d) {
  return d && typeof d.ready === 'boolean' && typeof d.blocked === 'boolean'
    && reasonCodes.has(d.reasonCode) && Array.isArray(d.pendingActions)
    && d.pendingActions.every(x => pendingNames.has(x))
    && (!d.ready || d.pendingActions.length === 0)
    && (!d.ready || !['PENDING', 'FAILED'].includes(d.reasonCode))
    && (!d.blocked || (d.pendingActions.length === 0 && !['PENDING', 'FAILED', 'COMPLETE'].includes(d.reasonCode)));
}

/** No network requests, no transcript parsing, and no write-side tools. */
export async function runHook(event, { stateDir, enabled = true, instructionFile = resolve(root, 'instructions.txt') } = {}) {
  if (!enabled) return {};
  if (event.hook_event_name === 'SessionStart') {
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: await readFile(instructionFile, 'utf8') } };
  }
  if (event.hook_event_name !== 'Stop') return {};
  let snapshot;
  if (stateDir && event.session_id && event.turn_id) {
    try {
      const path = resolve(stateDir, key(event.session_id, event.turn_id) + '.json');
      const stat = await lstat(path);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 8192) snapshot = JSON.parse(await readFile(path, 'utf8'));
    } catch { /* A missing/malformed snapshot is unconfirmed, never completed. */ }
  }
  const decision = snapshot?.schemaVersion === 1 && snapshot.sessionId === event.session_id
    && snapshot.turnId === event.turn_id && validDecision(snapshot.decision) ? snapshot.decision : null;
  if (decision?.ready || decision?.blocked) return {};
  // Stop runs after a model answer: it is a bounded recovery check, not proof of
  // completion before the first final response. Never create an infinite retry.
  if (event.stop_hook_active) return { systemMessage: 'Remnant close-the-loop remains unconfirmed by the host. No completion or publication is claimed.' };
  return { decision: 'block', reason: 'Run the Remnant close-the-loop check for this task now using the already authorized policy and actual available tools. Complete any eligible pending actual-use feedback or reusable safe contribution, verify successful writes, or state the specific blocker. Respect all opt-outs; do not invent consent, publish noise, write a host decision file, or claim a confirmed outcome without evidence. This is one automatic recovery pass.' };
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024 * 1024) throw new Error('Oversized hook input'); }
  const result = await runHook(JSON.parse(input), {
    stateDir: process.env.REMNANT_LOOP_STATE_DIR,
    enabled: process.env.REMNANT_LOOP_HOOK_ENABLED !== 'off',
  });
  process.stdout.write(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stdout.write(JSON.stringify({ systemMessage: 'Remnant local hook could not verify lifecycle state; no completed loop is claimed.' })); });
}
