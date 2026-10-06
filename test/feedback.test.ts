import test from "node:test";
import assert from "node:assert/strict";
import { reportActualAttempt } from "../examples/ordinary-contribution/loop.js";
import { prepareFeedback, resumeFeedback, type FeedbackClient, type Observation } from "../examples/ordinary-contribution/feedback.js";

const reason = "Controlled attempt executed and checked against its expected result.";
const result = (structuredContent: Record<string, unknown>) => ({ content: [], structuredContent });
const schema = { type: "object" as const, properties: Object.fromEntries([
  "memoryId", "outcome", "actualAttempt", "reason", "idempotencyKey", "type"
].map(key => [key, {}])) };

/** Contract double only: these tests do not establish production backend correctness. */
function fixture() {
  const calls: { name: string; arguments?: Record<string, unknown> }[] = [];
  const events = new Map<string, string>();
  const counts: Record<string, number> = { success: 0, failure: 0, partial: 0, uncertain: 0,
    useful: 0, not_useful: 0, corroborate: 0, contradict: 0 };
  let retrieved = false;
  const state = { scopes: ["memory:read", "memory:feedback"], tools: true, stale: false,
    publicId: "agent-b", authenticated: true, reject: false, frozenCounters: false,
    loseReply: false, rejectRetrieval: false };
  const snapshot = () => ({ counts: { ...counts } });
  const client = {
    async listTools() { return { tools: state.tools ? [{ name: "feedback_memory", inputSchema: state.stale
      ? { type: "object", properties: { memoryId: {}, verdict: {} } } : schema }] : [] }; },
    async callTool(input: { name: string; arguments?: Record<string, unknown> }) {
      calls.push(structuredClone(input));
      if (input.name === "get_my_identity") return result({ authenticated: state.authenticated,
        publicId: state.publicId, scopes: state.scopes });
      if (input.name === "get_memory_evidence") return result(snapshot());
      if (input.name === "retrieve_memory") {
        if (state.rejectRetrieval) return { ...result({ code: "NOT_FOUND" }), isError: true };
        retrieved = true; return result({ id: "memory-a", insight: "Use integer arithmetic." });
      }
      assert.equal(input.name, "feedback_memory");
      assert.ok(retrieved, "Feedback must follow successful retrieval");
      if (state.reject) return { ...result({ code: "SELF_FEEDBACK_REJECTED" }), isError: true };
      const args = input.arguments!;
      const key = String(args.idempotencyKey), text = JSON.stringify(args);
      if (events.has(key)) { assert.equal(events.get(key), text); return result({ replayed: true }); }
      // Strict union rejects the incorrect combined-outcome payload.
      assert.equal("useful" in args, false);
      assert.equal("corroborate" in args, false);
      assert.equal("contradict" in args, false);
      if (args.outcome) { assert.equal(args.actualAttempt, true); assert.equal("type" in args, false); }
      events.set(key, text);
      if (!state.frozenCounters) counts[String(args.outcome ?? args.type)]++;
      if (state.loseReply) { state.loseReply = false; throw new Error("Reply lost after commit"); }
      return result({ accepted: true });
    }
  } as FeedbackClient;
  const verifyReadback = async (before: any, after: any) =>
    Object.values(after.counts as Record<string, number>).reduce((a, b) => a + b, 0)
      > Object.values(before.counts as Record<string, number>).reduce((a, b) => a + b, 0);
  return { client, state, calls, counts, events, snapshot, verifyReadback };
}

for (const outcome of ["success", "failure", "partial", "uncertain"] as const) {
  test(`${outcome}: actual outcome remains separate from utility`, async () => {
    const f = fixture();
    const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome, reason,
      useful: outcome !== "failure" }), "controlled-" + outcome, { verifyReadback: async (_before, after: any) =>
        after.counts[outcome] === 1 && after.counts[outcome === "failure" ? "not_useful" : "useful"] === 1 });
    assert.equal(run.feedback.status, "FEEDBACK_RECORDED");
    assert.equal(f.counts[outcome], 1);
    if (outcome !== "success") assert.equal(f.counts.success, 0);
    assert.equal(f.calls.filter(c => c.name === "retrieve_memory").length, 1);
  });
}

for (const dimension of ["corroborate", "contradict"] as const) {
  test(`${dimension} is not inferred from successful use`, async () => {
    const f = fixture();
    await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "failure", reason,
      useful: true, [dimension]: true }), dimension, { verifyReadback: f.verifyReadback });
    assert.equal(f.counts[dimension], 1); assert.equal(f.counts.success, 0);
    assert.equal(f.counts.failure, 1); assert.equal(f.counts.useful, 1);
  });
}

test("regression: 23 executed checks, success and useful both recorded", async () => {
  const f = fixture(); let checks = 0;
  const run = await reportActualAttempt(f.client, "memory-a", async () => {
    for (let n = 1; n <= 23; n++) { assert.equal(n * 100 + 7 - n * 100, 7); checks++; }
    return { outcome: "success", useful: true, reason: "Applied integer arithmetic; all 23 deterministic boundary checks succeeded." };
  }, "regression-23", { verifyReadback: async (_before, after: any) =>
    after.counts.success === 1 && after.counts.useful === 1 });
  assert.equal(checks, 23); assert.equal(run.feedback.status, "FEEDBACK_RECORDED");
  assert.deepEqual([...f.events.keys()], ["regression-23:report", "regression-23:utility"]);
});

for (const [setting, value, expected] of [
  ["tools", false, "TOOL_UNAVAILABLE"], ["scopes", ["memory:read"], "FRESH_CONSENT_REQUIRED"],
  ["stale", true, "SCHEMA_UNSUPPORTED"]
] as const) {
  test(`${expected}: measured feedback preserved without a complement`, async () => {
    const f = fixture(); Object.assign(f.state, { [setting]: value }); let executed = 0;
    const run = await reportActualAttempt(f.client, "memory-a", async () => {
      executed++; return { outcome: "success", useful: true, reason };
    }, "pending");
    assert.equal(executed, 1); assert.equal(run.feedback.status, "FEEDBACK_PENDING");
    assert.equal("reason" in run.feedback && run.feedback.reason, expected);
    assert.equal(f.events.size, 0); assert.equal(run.feedback.pending.operations.length, 2);
    f.state.tools = true; f.state.stale = false; f.state.scopes.push("memory:feedback");
    const resumed = await resumeFeedback(f.client, run.feedback.pending, { verifyReadback: f.verifyReadback });
    assert.equal(resumed.status, "FEEDBACK_RECORDED"); assert.equal(executed, 1);
    assert.equal(f.calls.some(c => ["publish_memory", "report_outcome"].includes(c.name)), false);
  });
}

test("lost reply and replay: one event per key and no second execution", async () => {
  const f = fixture(); f.state.loseReply = true; let executed = 0;
  const run = await reportActualAttempt(f.client, "memory-a", async () => {
    executed++; return { outcome: "success", useful: true, reason };
  }, "lost", { verifyReadback: f.verifyReadback });
  assert.equal(run.feedback.status, "FEEDBACK_PENDING");
  for (let retry = 0; retry < 2; retry++) assert.equal((await resumeFeedback(f.client,
    run.feedback.pending, { verifyReadback: f.verifyReadback })).status, "FEEDBACK_RECORDED");
  assert.equal(executed, 1); assert.equal(f.events.size, 2);
  assert.equal(f.counts.success, 1); assert.equal(f.counts.useful, 1);
});

test("accepted response with unchanged counters stays pending", async () => {
  const f = fixture(); f.state.frozenCounters = true;
  const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "success", reason }),
    "broken-projection", { verifyReadback: f.verifyReadback });
  assert.equal(run.feedback.status, "FEEDBACK_PENDING");
  assert.equal("reason" in run.feedback && run.feedback.reason, "COUNTERS_UNVERIFIED");
});

test("no verifier never claims that official counters moved", async () => {
  const f = fixture();
  const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "success", reason }), "no-check");
  assert.equal(run.feedback.status, "FEEDBACK_PENDING");
});

test("self/same-owner server refusal is not converted to success", async () => {
  const f = fixture(); f.state.reject = true;
  const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "success", reason }),
    "self", { verifyReadback: f.verifyReadback });
  assert.equal(run.feedback.status, "FEEDBACK_PENDING"); assert.equal(f.events.size, 0);
});

test("failed retrieval prevents execution and feedback", async () => {
  const f = fixture(); f.state.rejectRetrieval = true; let executed = false;
  await assert.rejects(reportActualAttempt(f.client, "memory-a", async () => {
    executed = true; return { outcome: "success", reason };
  }, "read-failed"));
  assert.equal(executed, false); assert.equal(f.events.size, 0);
});

test("different identity cannot replay another agent's queue", async () => {
  const f = fixture(); f.state.tools = false;
  const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "success", reason }), "identity");
  f.state.publicId = "agent-c";
  const resumed = await resumeFeedback(f.client, run.feedback.pending);
  assert.equal("reason" in resumed && resumed.reason, "IDENTITY_CHANGED"); assert.equal(f.events.size, 0);
});

test("queue persistence precedes writes and a failed save prevents submission", async () => {
  const f = fixture();
  const run = await reportActualAttempt(f.client, "memory-a", async () => ({ outcome: "success", reason }),
    "persist", { persistPending: async () => { assert.equal(f.events.size, 0); throw new Error("disk unavailable"); } });
  assert.equal("reason" in run.feedback && run.feedback.reason, "PERSISTENCE_UNAVAILABLE");
  assert.equal(f.events.size, 0);
});

test("invalid/conflicting observations cannot silently become success", () => {
  for (const observation of [{ outcome: "success", reason: "short" }, { outcome: "invented", reason },
    { outcome: "success", reason, corroborate: true, contradict: true },
    { outcome: "success", reason, useful: "yes" }])
    assert.throws(() => prepareFeedback("memory-a", "agent-b", {}, observation as Observation, "bad"));
});
