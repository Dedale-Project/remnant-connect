import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runHook, writeHostDecision } from '../examples/codex-close-loop/hook.mjs';

const event = { hook_event_name: 'Stop', session_id: 'fixture-session', turn_id: 'fixture-turn', stop_hook_active: false };
test('startup delivers the same versioned instruction and a disabled hook emits no context', async () => {
  const canonical = await readFile(new URL('../docs/agent-work-instruction.txt', import.meta.url), 'utf8');
  const response = await runHook({ hook_event_name: 'SessionStart' });
  assert.equal(response.hookSpecificOutput.additionalContext, canonical);
  assert.match(canonical.slice(0, 512), /BEFORE sending the final task-completion response/);
  assert.deepEqual(await runHook({ hook_event_name: 'SessionStart' }, { enabled: false }), {});
});

test('missing state requests only one recovery and cannot manufacture completion', async () => {
  assert.equal((await runHook(event)).decision, 'block');
  const repeat = await runHook({ ...event, stop_hook_active: true });
  assert.equal(repeat.decision, undefined);
  assert.match(repeat.systemMessage, /unconfirmed/);
  assert.deepEqual(await runHook(event, { enabled: false }), {});
});

test('completion and opt-out receipts must match the exact host session and turn', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'remnant-close-loop-'));
  try {
    const options = { stateDir: dir };
    assert.equal((await runHook({ ...event, contributionCompleted: true }, options)).decision, 'block');
    const write = decision => writeHostDecision({ stateDir: dir, sessionId: event.session_id, turnId: event.turn_id, decision });
    await write({ ready: false, blocked: false, pendingActions: ['feedback'], reasonCode: 'PENDING' });
    assert.equal((await runHook(event, options)).decision, 'block');
    await write({ ready: true, blocked: false, pendingActions: [], reasonCode: 'COMPLETE' });
    assert.deepEqual(await runHook(event, options), {});
    assert.equal((await runHook({ ...event, turn_id: 'later-turn' }, options)).decision, 'block');
    assert.equal((await runHook({ ...event, session_id: 'other-session' }, options)).decision, 'block');
    await write({ ready: false, blocked: true, pendingActions: [], reasonCode: 'OPTED_OUT' });
    assert.deepEqual(await runHook(event, options), {});
    await assert.rejects(write({ ready: true, blocked: false, pendingActions: ['feedback'], reasonCode: 'COMPLETE' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('standalone executable handles malformed input without claiming a completed loop', () => {
  const file = new URL('../examples/codex-close-loop/hook.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(file)], { input: '{invalid', encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0);
  const response = JSON.parse(result.stdout);
  assert.equal(response.decision, undefined);
  assert.match(response.systemMessage, /no completed loop is claimed/);
});
