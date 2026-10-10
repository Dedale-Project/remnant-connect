"use strict";
/*
Run with Node 24.13+: node revision-conflict.cjs
Keep the published late-data.cjs beside this file; inspect both before running.
Only a fresh remnant-revision-conflict-* folder under the working directory is written.
No network, install, account or model key. The original script entry point is not
executed; the sibling source file is not changed.
This packages six previously executed same-operator synthetic checks of a known
contract boundary. It is not a new discovery, independent validation or product fix.
Runner identity is deliberately unknown in generated reports; record verified
execution provenance separately without rewriting the original report.
*/
// Synthetic, local-only extension of a stated contract limit. No production fix.
// Extracted original functions are executed; the full original script is not run.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { DatabaseSync: Database } = require("node:sqlite");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const sourcePath = path.join(__dirname, "late-data.cjs");
const sourceBytes = fs.readFileSync(sourcePath);
const sourceSha256 = sha256(sourceBytes);
const expectedNormalizedSourceSha256 = "c30228a70d86e8fd07f4f5d87375f6a18a85d45d2d9cec375712092fed8f3ebc";
const source = sourceBytes.toString("utf8");
const normalizedSourceSha256 = sha256(Buffer.from(source.replace(/\r\n/g, "\n").trimEnd()));
assert.equal(normalizedSourceSha256, expectedNormalizedSourceSha256,
  "Sibling late-data.cjs differs from the published source (CRLF to LF; trimEnd)");
const begin = source.indexOf("function openDb() {");
const end = source.indexOf("const started = performance.now();");
assert.ok(begin >= 0 && end > begin);
const helpers = source.slice(begin, end);
const atomicStart = helpers.indexOf("function atomicApply(");
const atomicEnd = helpers.indexOf("function expectedFacts()");
const originalAtomic = helpers.slice(atomicStart, atomicEnd);
const originalLoop = "for (const r of pending) upsert.run(r.invoice_id, r.revision, r.event_time, r.change_seq, r.amount_cents);";
assert.equal(originalAtomic.split(originalLoop).length, 2, "Expected one original apply loop");

// Explicit local policy variant: compare only business fields of the currently
// stored equal revision, while holding the original BEGIN IMMEDIATE transaction.
// This also sees earlier rows written by this same batch. It is not a revision ledger.
const guardedLoop = `for (const r of pending) {
      const current = db.prepare("SELECT revision, event_time, amount_cents FROM invoice_facts WHERE invoice_id=?").get(r.invoice_id);
      if (current && current.revision === r.revision &&
          (current.amount_cents !== r.amount_cents || current.event_time !== r.event_time)) {
        const error = new Error("same-revision business payload conflict: " + r.invoice_id);
        error.code = "SAME_REVISION_CONFLICT";
        throw error;
      }
      upsert.run(r.invoice_id, r.revision, r.event_time, r.change_seq, r.amount_cents);
    }`;
const guardedAtomic = originalAtomic.replace("function atomicApply(", "function failClosedApply(").replace(originalLoop, guardedLoop);
assert.notEqual(guardedAtomic, originalAtomic);
const scratch = fs.mkdtempSync(path.join(process.cwd(), "remnant-revision-conflict-"));
const extractionPath = path.join(scratch, "original-functions.txt");
const variantPath = path.join(scratch, "fail-closed-function.txt");
fs.writeFileSync(extractionPath, helpers);
fs.writeFileSync(variantPath, guardedAtomic);
const eventTime = "2026-01-10T10:00:00Z";
const row = (seq, invoice, revision, amount, time = eventTime) => ({
  seq, invoice, revision, amount, eventTime: time,
  arrivedAt: `2026-01-10T10:00:0${seq}Z`
});
const cases = [
  { name: "original_inter_batch_conflict", method: "atomicApply", input: [row(2, "INV-A", 2, 13000)], reject: false, cursor: 2 },
  { name: "original_exact_business_duplicate", method: "atomicApply", input: [row(2, "INV-A", 2, 12000)], reject: false, cursor: 2 },
  { name: "guard_exact_business_duplicate", method: "failClosedApply", input: [row(2, "INV-A", 2, 12000)], reject: false, cursor: 2 },
  { name: "guard_inter_batch_amount_conflict", method: "failClosedApply", input: [row(2, "INV-A", 2, 13000)], reject: true, cursor: 1 },
  // Both equal-revision payload fields are part of the chosen contract.
  { name: "guard_inter_batch_event_time_conflict", method: "failClosedApply", input: [row(2, "INV-A", 2, 12000, "2026-01-10T10:01:00Z")], reject: true, cursor: 1 },
  // INV-B and the first INV-C write must roll back with the later intra-batch conflict.
  { name: "guard_intra_batch_conflict_rollback_prior_facts", method: "failClosedApply", input: [row(2, "INV-B", 1, 8000), row(3, "INV-C", 1, 7000), row(4, "INV-C", 1, 7500)], reject: true, cursor: 1 }
];
const results = [];
for (const definition of cases) {
  const dbPath = path.join(scratch, definition.name + ".sqlite");
  assert.equal(fs.existsSync(dbPath), false);
  const api = vm.runInNewContext(helpers + "\n" + guardedAtomic +
    "\n({ openDb, schema, addChange, rows, currentCursor, atomicFetch, atomicApply, failClosedApply });",
    { Database, DB_PATH: dbPath }, { timeout: 1000 });
  const db = api.openDb();
  try {
    api.schema(db);
    api.addChange(db, row(1, "INV-A", 2, 12000));
    api.atomicApply(db, api.atomicFetch(db));
    // Normalize VM values for data comparison; this does not execute third-party code.
    const before = JSON.parse(JSON.stringify({ facts: api.rows(db), cursor: api.currentCursor(db) }));
    for (const change of definition.input) api.addChange(db, change);
    const pending = api.atomicFetch(db);
    let outcome = null, failure = null;
    try { outcome = api[definition.method](db, pending); }
    catch (error) { failure = { code: error.code || null, message: error.message }; }
    const after = JSON.parse(JSON.stringify({ facts: api.rows(db), cursor: api.currentCursor(db) }));
    const checks = {
      expectedRejection: definition.reject ? failure?.code === "SAME_REVISION_CONFLICT" : failure === null,
      factsPreserved: JSON.stringify(after.facts) === JSON.stringify(before.facts),
      expectedCursor: after.cursor === definition.cursor,
      returnedConsumptionCount: definition.reject ? outcome === null : outcome?.applied === 1,
      sourceChangesPreserved: db.prepare("SELECT count(*) AS n FROM source_changes").get().n === definition.input.length + 1,
      transactionClosed: db.isTransaction === false
    };
    results.push({ name: definition.name, method: definition.method, input: definition.input,
      before, outcome, failure, after, checks, passed: Object.values(checks).every(Boolean) });
  } finally { db.close(); }
}
const metaDb = new Database(":memory:");
const sqliteVersion = metaDb.prepare("SELECT sqlite_version() AS version").get().version;
metaDb.close();
const report = {
  fixture: "late-data-equal-current-revision-contract-v1",
  evidence_class: "local_synthetic_fixture_run",
  runner_operator_relationship: "unknown",
  external_tester: null,
  cross_agent_reuse_established: false,
  observedAt: new Date().toISOString(),
  runtime: { node: process.version, sqlite: sqliteVersion, platform: process.platform, arch: process.arch },
  source: { path: sourcePath, sha256: sourceSha256, normalizedSha256: normalizedSourceSha256,
    expectedNormalizedSha256: expectedNormalizedSourceSha256, normalization: "CRLF to LF; trimEnd",
    extractionSha256: sha256(Buffer.from(helpers)),
    atomicApplySha256: sha256(Buffer.from(originalAtomic)), guardedVariantSha256: sha256(Buffer.from(guardedAtomic)),
    originalUnchanged: sha256(fs.readFileSync(sourcePath)) === sourceSha256 },
  contract: "For an incoming revision equal to the currently stored revision, amount_cents and event_time must be identical; otherwise the local variant rejects the entire sink transaction. change_seq and arrived_at are transport metadata, not compared business content.",
  sourceMemory: { id: "mem_e5fc55667eb8faba46d6b0a49c50be8b", version: 1, evidence: "The already stated condition motivated this explicit local experiment, not a new general lesson." },
  results, passed: results.filter(r => r.passed).length, total: results.length,
  limits: ["Original behavior is outside its published authoritative-revision condition, not a product regression.",
    "The local guard checks only the current stored revision and pending rows as applied. Historical conflicting payloads after a higher revision has replaced them are not detected.",
    "No revision ledger, upstream source repair, skip/quarantine policy or liveness resolution is implemented; a conflict blocks progress until explicitly resolved.",
    "Single-process synthetic SQLite evidence only; no real customer data, concurrency stress, power-loss durability, throughput, downstream effects or production fix established.",
    "Generic identity metadata cannot identify the runner. No external activation, independent validation or useful cross-agent reuse established."],
  scratchDirectory: scratch
};
fs.writeFileSync(path.join(scratch, "results.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total || !report.source.originalUnchanged) process.exitCode = 1;
