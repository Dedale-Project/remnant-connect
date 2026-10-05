'use strict';

// Remnant operator example, derived from public memory v1. No network or telemetry.
const { DatabaseSync } = require('node:sqlite');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function open(file, timeout = 1000) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=${timeout}`);
  return db;
}

function reserve(db, requestId) {
  const changed = db.prepare("UPDATE inventory SET stock=stock-1 WHERE sku='widget' AND stock>=1").run();
  if (changed.changes === 1) {
    db.prepare('INSERT INTO reservations(request_id, qty) VALUES (?, 1)').run(requestId);
    return true;
  }
  return false;
}

function initialize(file, initialStock) {
  const db = open(file);
  try {
    assert.equal(db.prepare('PRAGMA journal_mode=WAL').get().journal_mode, 'wal');
    db.exec('CREATE TABLE inventory(sku TEXT PRIMARY KEY, stock INTEGER NOT NULL CHECK(stock>=0)); CREATE TABLE reservations(request_id TEXT PRIMARY KEY, qty INTEGER NOT NULL CHECK(qty>0));');
    db.prepare('INSERT INTO inventory VALUES (?, ?)').run('widget', initialStock);
  } finally { db.close(); }
}

function snapshot(db, initialStock, expectedIds) {
  const stock = db.prepare('SELECT stock FROM inventory').get().stock;
  const rows = db.prepare('SELECT request_id, qty FROM reservations ORDER BY request_id').all();
  const reserved = rows.reduce((sum, row) => sum + row.qty, 0);
  const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
  assert.equal(integrity, 'ok');
  assert.ok(stock >= 0);
  assert.equal(stock + reserved, initialStock);
  assert.deepEqual(rows.map(row => row.request_id), expectedIds);
  return { stock, reservations: rows.map(row => ({ ...row })), conserved: true, integrity };
}

function captureError(action, expectedCode) {
  let failure;
  try { action(); } catch (error) { failure = error; }
  assert.ok(failure, `Expected SQLite code ${expectedCode}`);
  assert.equal(failure.errcode, expectedCode, `Unexpected SQLite error: ${failure.message}`);
  return { code: failure.errcode, message: failure.message };
}

function staleSnapshot(directory, initialStock) {
  const name = initialStock === 1 ? 'stale_snapshot_exhausted' : 'stale_snapshot_recoverable';
  const file = path.join(directory, name + '.sqlite');
  initialize(file, initialStock);
  const a = open(file), b = open(file);
  try {
    a.exec('BEGIN');
    const originalRead = a.prepare('SELECT stock FROM inventory').get().stock;
    b.exec('BEGIN IMMEDIATE');
    assert.equal(reserve(b, 'B'), true);
    b.exec('COMMIT');
    const firstError = captureError(() => reserve(a, 'A'), 517);
    const unchangedRetry = captureError(() => reserve(a, 'A'), 517);
    a.exec('ROLLBACK; BEGIN');
    const freshRead = a.prepare('SELECT stock FROM inventory').get().stock;
    const accepted = freshRead >= 1 && reserve(a, 'A');
    a.exec('COMMIT');
    assert.equal(accepted, initialStock === 2);
    return { name, originalRead, baselineErrors: [firstError, unchangedRetry], changedMethod: 'ROLLBACK -> BEGIN -> fresh read -> guarded reservation -> COMMIT', freshRead, accepted, final: snapshot(a, initialStock, accepted ? ['A', 'B'] : ['B']) };
  } finally { a.close(); b.close(); }
}

// A separate worker can release its SQLite writer lock while the main thread
// is synchronously waiting in BEGIN IMMEDIATE. A ready handshake proves the lock exists.
function writerWorker() {
  const db = open(workerData.file);
  db.exec('BEGIN IMMEDIATE');
  assert.equal(reserve(db, 'B'), true);
  parentPort.postMessage({ stage: 'locked' });
  parentPort.once('message', message => {
    const commit = () => {
      db.exec('COMMIT');
      db.close();
      parentPort.postMessage({ stage: 'committed' });
      parentPort.close();
    };
    if (message === 'release_after_delay') setTimeout(commit, 180);
    else if (message === 'release_now') commit();
    else throw new Error('Unknown fixture coordination message');
  });
}

async function temporaryWriter(directory, expireFirst) {
  const name = expireFirst ? 'writer_timeout_then_retry' : 'writer_wait_succeeds';
  const file = path.join(directory, name + '.sqlite');
  initialize(file, 2);
  const a = open(file, expireFirst ? 80 : 1000);
  const worker = new Worker(__filename, { workerData: { file } });
  let readyResolve, readyReject, commitResolve, commitReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const committed = new Promise((resolve, reject) => { commitResolve = resolve; commitReject = reject; });
  // Mark both promises handled even if an early worker error prevents the second await.
  ready.catch(() => {}); committed.catch(() => {});
  let sawCommit = false;
  const fail = error => { readyReject(error); commitReject(error); };
  worker.on('error', fail);
  worker.on('exit', code => { if (!sawCommit) fail(new Error(`Writer exited before commit (${code})`)); });
  worker.on('message', message => {
    if (message.stage === 'locked') readyResolve();
    if (message.stage === 'committed') { sawCommit = true; commitResolve(); }
  });
  const deadline = setTimeout(() => fail(new Error('Fixture coordination timed out')), 10000);
  try {
    await ready;
    const errors = [];
    if (expireFirst) {
      // Deterministic timeout: B remains open until A's bounded wait has failed.
      errors.push(captureError(() => a.exec('BEGIN IMMEDIATE'), 5));
      worker.postMessage('release_now');
      await committed;
      a.exec('BEGIN IMMEDIATE');
    } else {
      worker.postMessage('release_after_delay');
      a.exec('BEGIN IMMEDIATE');
    }
    const freshRead = a.prepare('SELECT stock FROM inventory').get().stock;
    const accepted = reserve(a, 'A');
    assert.equal(accepted, true);
    a.exec('COMMIT');
    await committed;
    return { name, timeoutMs: expireFirst ? 80 : 1000, baselineErrors: errors, coordination: expireFirst ? 'B released only after A timeout' : 'B release requested after approximately180ms', changedMethod: expireFirst ? 'Wait for B commit, then new BEGIN and guarded reservation' : 'Bounded BEGIN IMMEDIATE wait', freshRead, accepted, final: snapshot(a, 2, ['A', 'B']) };
  } finally {
    clearTimeout(deadline);
    a.close();
    await worker.terminate();
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('node sqlite-retry.cjs\nCreates a new remnant-sqlite-retry-* directory in the current directory. Uses only synthetic data. No network, packages, account or model key.');
    return;
  }
  assert.equal(process.argv.length, 2, 'No input database or custom path is accepted. Use --help.');
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Use Node.js24 or newer; tested on24.13.0.');
  const directory = fs.mkdtempSync(path.join(process.cwd(), 'remnant-sqlite-retry-'));
  const resultPath = path.join(directory, 'result.json');
  const report = { exampleVersion: '1.0.0', startedAt: new Date().toISOString(), runtime: { node: process.version, sqlite: process.versions.sqlite, platform: process.platform }, source: { memoryId: 'mem_7fc3ea3e99b911105453b62048248015', version: 1, url: 'https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015' }, evidenceClass: 'Local synthetic reproduction; running this file does not establish agent or operator independence.', directory, networkRequests: 0, cases: [] };
  try {
    report.cases.push(staleSnapshot(directory, 1));
    report.cases.push(staleSnapshot(directory, 2));
    report.cases.push(await temporaryWriter(directory, false));
    report.cases.push(await temporaryWriter(directory, true));
    report.status = 'PASS';
  } catch (error) {
    report.status = 'FAIL';
    report.error = { name: error.name, message: error.message };
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(resultPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(report, null, 2));
    console.log(`Evidence saved to ${resultPath}`);
  }
}

if (isMainThread) main().catch(error => { console.error(error); process.exitCode = 1; });
else writerWorker();
