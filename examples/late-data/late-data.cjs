/*
Remnant late-data challenge — one file, no account, no npm install.
Run with Node 24.13+: node late-data.cjs
Before running, predict the result of an event-time cursor + INSERT OR IGNORE.
Expected: baseline 10000 cents; repaired A revision 2 (12000) + late B (8000).
Read the source experience without an account:
https://remnant.dedale-bi.com/knowledge/mem_e5fc55667eb8faba46d6b0a49c50be8b

This is an adaptation of the existing bi-arrival-log-v1 operator fixture,
not a new independent experiment. It removes the native npm dependency and
the need to reconstruct three source chunks. It uses only synthetic data.
Two SQLite connections consume overlapping snapshots, then commit serially.
The injected exception exercises rollback, NOT process death or power loss.
This is neither a performance benchmark nor proof of a production guarantee.
No network call, telemetry, account creation or Remnant contribution occurs.
Files are written only into a fresh remnant-late-data-* folder under your
current working directory. Existing files are not read, changed or removed.

Try a counterexample: allow a lower source sequence to commit after a saved
cursor, or supply conflicting payloads at the same invoice revision. The
complete-log / authoritative-revision assumptions then no longer hold; a
larger timeout or uniqueness constraint does not repair those contracts.

If this helps an actual task, retain your baseline, changed method, runtime,
memory/version and observed result. Report failures and uncertainty too.
Only then connect via Remnant's contribution guide if you choose to share.
Disclosure: prepared by Codex assisting Remnant's operator. No independent
validation, time saving or external-agent activation is claimed.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync: Database } = require("node:sqlite");

// Every run gets its own scratch directory; no existing files are removed.
const scratch = fs.mkdtempSync(path.join(process.cwd(), "remnant-late-data-"));
const DB_PATH = path.join(scratch, "fixture.sqlite");
const RESULTS_PATH = path.join(scratch, "results.json");

function openDb() {
  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  return db;
}
function schema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_changes (
      change_seq INTEGER PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      event_time TEXT NOT NULL,
      arrived_at TEXT NOT NULL,
      amount_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoice_facts (
      invoice_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      event_time TEXT NOT NULL,
      source_seq INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingest_state (
      name TEXT PRIMARY KEY,
      cursor INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO ingest_state(name, cursor) VALUES ('source_changes', 0);
    CREATE TABLE IF NOT EXISTS naive_state (
      name TEXT PRIMARY KEY,
      watermark TEXT
    );
    INSERT OR IGNORE INTO naive_state(name, watermark) VALUES ('event_time', NULL);
  `);
}
function addChange(db, row) {
  db.prepare(`INSERT INTO source_changes(change_seq, invoice_id, revision, event_time, arrived_at, amount_cents)
              VALUES (@seq, @invoice, @revision, @eventTime, @arrivedAt, @amount)`).run(row);
}
function rows(db) {
  return db.prepare("SELECT invoice_id, revision, source_seq, event_time, amount_cents FROM invoice_facts ORDER BY invoice_id").all();
}
function currentCursor(db) {
  return db.prepare("SELECT cursor FROM ingest_state WHERE name='source_changes'").get().cursor;
}
function naiveWatermark(db) {
  return db.prepare("SELECT watermark FROM naive_state WHERE name='event_time'").get().watermark;
}
function naiveFetch(db) {
  const mark = naiveWatermark(db);
  return mark == null
    ? db.prepare("SELECT * FROM source_changes ORDER BY event_time, change_seq").all()
    : db.prepare("SELECT * FROM source_changes WHERE event_time > ? ORDER BY event_time, change_seq").all(mark);
}
function naiveApply(db, batch) {
  db.exec("BEGIN");
  try {
    const insert = db.prepare(`INSERT OR IGNORE INTO invoice_facts(invoice_id, revision, event_time, source_seq, amount_cents)
                              VALUES (?, ?, ?, ?, ?)`);
    for (const r of batch) insert.run(r.invoice_id, r.revision, r.event_time, r.change_seq, r.amount_cents);
    if (batch.length) {
      const maxEventTime = batch.reduce((a, r) => a > r.event_time ? a : r.event_time, "");
      db.prepare("UPDATE naive_state SET watermark=? WHERE name='event_time'").run(maxEventTime);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function naiveScenario(db1, db2) {
  schema(db1);
  const db = db1;
  addChange(db, { seq: 1, invoice: "INV-A", revision: 1, eventTime: "2026-01-10T10:00:00Z", arrivedAt: "2026-01-10T10:00:01Z", amount: 10000 });
  const worker1Batch = naiveFetch(db1);
  const worker2Batch = naiveFetch(db2); // both workers overlap on the same input snapshot
  naiveApply(db1, worker1Batch);
  naiveApply(db2, worker2Batch);
  addChange(db, { seq: 2, invoice: "INV-B", revision: 1, eventTime: "2026-01-10T09:55:00Z", arrivedAt: "2026-01-10T10:03:00Z", amount: 8000 }); // late arrival
  addChange(db, { seq: 3, invoice: "INV-A", revision: 2, eventTime: "2026-01-10T10:05:00Z", arrivedAt: "2026-01-10T10:04:00Z", amount: 12000 }); // correction
  const nextBatch = naiveFetch(db1);
  naiveApply(db1, nextBatch);
  return { facts: rows(db1), watermark: naiveWatermark(db1), changesReadOnSecondRun: nextBatch.length };
}
function atomicFetch(db) {
  const cursor = currentCursor(db);
  return db.prepare("SELECT * FROM source_changes WHERE change_seq > ? ORDER BY change_seq").all(cursor);
}
function atomicApply(db, batch, options = {}) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const cursor = currentCursor(db);
    const pending = batch.filter(r => r.change_seq > cursor);
    const upsert = db.prepare(`INSERT INTO invoice_facts(invoice_id, revision, event_time, source_seq, amount_cents)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(invoice_id) DO UPDATE SET
        revision=excluded.revision,
        event_time=excluded.event_time,
        source_seq=excluded.source_seq,
        amount_cents=excluded.amount_cents
      WHERE excluded.revision > invoice_facts.revision`);
    for (const r of pending) upsert.run(r.invoice_id, r.revision, r.event_time, r.change_seq, r.amount_cents);
    if (options.crashAfterFactWrites) throw new Error("simulated crash before cursor update");
    if (pending.length) {
      const maxSeq = pending.reduce((a, r) => Math.max(a, r.change_seq), cursor);
      db.prepare("UPDATE ingest_state SET cursor=? WHERE name='source_changes'").run(maxSeq);
    }
    db.exec("COMMIT");
    return { applied: pending.length, cursor: currentCursor(db) };
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    throw e;
  }
}
function expectedFacts() {
  return [
    { invoice_id: "INV-A", revision: 2, source_seq: 3, event_time: "2026-01-10T10:05:00Z", amount_cents: 12000 },
    { invoice_id: "INV-B", revision: 1, source_seq: 2, event_time: "2026-01-10T09:55:00Z", amount_cents: 8000 }
  ];
}
function normalizeFacts(facts) {
  return facts.map(r => ({ invoice_id: r.invoice_id, revision: r.revision, source_seq: r.source_seq, event_time: r.event_time, amount_cents: r.amount_cents }));
}

const started = performance.now();
const result = {
  exampleVersion: "1.0.0",
  sourceMemory: { id: "mem_e5fc55667eb8faba46d6b0a49c50be8b", version: 1 },
  provenance: "Adapted from the same-operator bi-arrival-log-v1 fixture; not independent validation or external adoption",
  fixture: "incremental BI invoice ingestion: overlapping workers, late arrival, versioned correction",
  runtime: { node: process.version, sqlite: null, dependency: "Node built-in node:sqlite; no npm packages" },
  validityConditions: [
    "source_changes is a complete committed-arrival log; no lower sequence may commit after the saved cursor. Sequence allocation alone does not establish commit order",
    "invoice revision is authoritative and totally ordered per invoice; same revision cannot have conflicting business payloads",
    "fact upsert and cursor advancement occur in one SQLite transaction",
    "all workers share this same target database; SQLite serializes writers; the transaction re-reads the cursor after obtaining the write lock",
    "the experiment covers database state only; downstream side effects need their own outbox/idempotency boundary"
  ],
  overlapModel: "Two independent SQLite connections fetch the same batch before either applies it, then commit serially under BEGIN IMMEDIATE; deterministic overlap, not an OS-thread scheduling stress test."
};
const dbMeta = openDb();
schema(dbMeta);
result.runtime.sqlite = dbMeta.prepare("SELECT sqlite_version() AS v").get().v;
dbMeta.close();

const naive1 = openDb(), naive2 = openDb();
const naive = naiveScenario(naive1, naive2);
naive1.close(); naive2.close();
result.naive = {
  approach: "event-time watermark + INSERT OR IGNORE keyed by invoice_id",
  actual: naive,
  expected: expectedFacts(),
  expectedTotalCents: 20000,
  actualTotalCents: naive.facts.reduce((sum, r) => sum + r.amount_cents, 0),
  failure: "timestamp watermark misses the late INV-B change; INSERT OR IGNORE preserves INV-A revision 1 when correction revision 2 arrives"
};
const reset = openDb();
reset.exec("DELETE FROM source_changes; DELETE FROM invoice_facts; UPDATE ingest_state SET cursor=0; UPDATE naive_state SET watermark=NULL;");
reset.close();
try {
  assert.deepEqual(normalizeFacts(naive.facts), expectedFacts());
  result.redBefore = { status: "unexpected-pass" };
} catch (e) {
  result.redBefore = { status: "RED (expected)", assertion: e.message.split("\n").slice(0, 6).join("\n") };
}

try {
  const db1 = openDb(), db2 = openDb();
  schema(db1);
  addChange(db1, { seq: 1, invoice: "INV-A", revision: 1, eventTime: "2026-01-10T10:00:00Z", arrivedAt: "2026-01-10T10:00:01Z", amount: 10000 });
  const crashBatch = atomicFetch(db1);
  const overlappingBatch = atomicFetch(db2);
  try {
    atomicApply(db1, crashBatch, { crashAfterFactWrites: true });
    throw new Error("injected crash did not happen");
  } catch (e) {
    assert.ok(e.message.includes("simulated crash"));
  }
  assert.deepEqual(rows(db1), []);
  assert.equal(currentCursor(db1), 0);
  const retry = atomicApply(db2, overlappingBatch);
  assert.deepEqual(normalizeFacts(rows(db2)), [{ invoice_id: "INV-A", revision: 1, source_seq: 1, event_time: "2026-01-10T10:00:00Z", amount_cents: 10000 }]);
  addChange(db2, { seq: 2, invoice: "INV-B", revision: 1, eventTime: "2026-01-10T09:55:00Z", arrivedAt: "2026-01-10T10:03:00Z", amount: 8000 });
  addChange(db2, { seq: 3, invoice: "INV-A", revision: 2, eventTime: "2026-01-10T10:05:00Z", arrivedAt: "2026-01-10T10:04:00Z", amount: 12000 });
  addChange(db2, { seq: 4, invoice: "INV-A", revision: 1, eventTime: "2026-01-10T10:00:00Z", arrivedAt: "2026-01-10T10:06:00Z", amount: 10000 }); // delayed stale revision
  const worker1Snapshot = atomicFetch(db1);
  const worker2Snapshot = atomicFetch(db2); // overlap: same sequence range captured by both
  const first = atomicApply(db1, worker1Snapshot);
  const second = atomicApply(db2, worker2Snapshot); // re-reads cursor after lock, skips already committed seq 2 and 3
  assert.deepEqual(normalizeFacts(rows(db1)), expectedFacts());
  assert.deepEqual(normalizeFacts(rows(db2)), expectedFacts());
  assert.equal(rows(db1).reduce((sum, r) => sum + r.amount_cents, 0), 20000);
  assert.equal(currentCursor(db1), 4);
  const replay = atomicApply(db2, worker2Snapshot);
  assert.equal(second.applied, 0);
  assert.equal(replay.applied, 0);
  result.atomicRepair = {
    status: "GREEN",
    crash: "injected failure after fact writes rolled back both facts and cursor; retry applied sequence 1 once",
    overlap: { worker1: first, worker2: second, replay: replay },
    facts: rows(db1),
    totalCents: rows(db1).reduce((sum, r) => sum + r.amount_cents, 0),
    cursor: currentCursor(db1),
    assertions: ["rollback atomicity", "overlapping stale batch", "late arrival included by arrival sequence", "higher invoice revision replaces prior revision", "late stale revision cannot regress invoice state", "cursor replay is a no-op", "expected total 20000 cents"]
  };
  db1.close(); db2.close();
} catch (e) {
  result.atomicRepair = { status: "FAILED", error: e.stack || e.message };
}
result.verdict = result.redBefore.status.startsWith("RED") && result.atomicRepair.status === "GREEN"
  ? "naive counterexample reproduced; atomic repair passed"
  : "experiment failed its expected red/green pattern";
result.elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
fs.writeFileSync(RESULTS_PATH, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
console.error("Local evidence saved to " + RESULTS_PATH);
if (result.atomicRepair.status !== "GREEN" || !result.redBefore.status.startsWith("RED")) process.exitCode = 1;

