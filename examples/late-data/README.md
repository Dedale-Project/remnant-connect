# Catch the invoice your importer silently lost

An invoice arrives late. Another is corrected. Two workers fetched the same batch. Can your importer keep the right total after a failed attempt?

Read [the public source experience, v1](https://remnant.dedale-bi.com/knowledge/mem_e5fc55667eb8faba46d6b0a49c50be8b) first. No account is needed. The key lesson: a unique invoice ID can prevent duplicates while still losing late data and retaining an obsolete amount.

## Try locally

Save [late-data.cjs](late-data.cjs) in an empty writable folder, inspect it, then run with Node 24.13 or newer:

```sh
node late-data.cjs
```

No npm install, model key, MCP setup or account. The script makes no network request. Each run creates a fresh `remnant-late-data-*` folder under your working directory containing its synthetic database and `results.json`; existing files are not removed.

Predict the total before reading the implementation. The deliberately naive event-time cursor plus `INSERT OR IGNORE` retains **10000 cents**. The reference method produces **20000 cents**: invoice A revision 2 at 12000 plus late invoice B at 8000. It checks rollback after an injected exception, retry, an overlapping stale batch, an older revision and replay.

The first local verification passed on Windows, Node 24.13.0 with its built-in SQLite. A Node experimental SQLite warning may appear. Other runtimes and operating systems have not been verified for this port.

## Challenge the assumptions

The source cursor must describe a **complete committed-arrival log**, not merely sequence numbers allocated before transactions commit. Revisions must be authoritative per invoice. If two different payloads share a revision, define and test a conflict policy instead of silently treating them as equivalent.

Choose one assumption that differs in your real task. Preserve your baseline, change one method, and record the observed result, including failure or uncertainty. Do not use customer data in a public reproduction. This fixture's two connections commit in a deterministic order; it does not establish parallel-process behavior, process-death recovery, power-loss durability or throughput. External downstream effects need their own transactional outbox or idempotency boundary.

### Run the equal-revision boundary exercise

Keep [revision-conflict.cjs](revision-conflict.cjs) beside the published `late-data.cjs` in this folder, inspect both, then run with Node 24.13+:

```sh
node revision-conflict.cjs
```

The companion verifies the original source using its published SHA-256 contract (CRLF converted to LF; trailing whitespace trimmed). It creates a fresh `remnant-revision-conflict-*` directory under your working directory, with separate synthetic databases and `results.json`; neither source nor existing files are changed. It makes no network request.

Six operator checks on 10 October 2026 exercised this already documented boundary: the original consumes a conflicting equal-revision row while keeping the earlier amount; exact business duplicates are accepted. A separate local variant compares `amount_cents` and `event_time` under the same write transaction and rejects conflicts, rolling back facts and cursor, including earlier writes in that batch. An expected rejection passes a contract check; it does not mean ingestion succeeded. The conflict blocks progress until explicitly resolved.

The guard covers only the currently stored revision, including earlier writes in the same batch. It does not detect historical conflicts after a higher revision replaced them. This is a runnable extension of a known condition, not a new discovery or production fix. Reports leave runner identity unknown and external-tester status null; record actual operator provenance separately. No external participation or useful reuse is established by these checks.

## Leave a useful result, then return for evidence

After an actual trial, the [contribution guide](../ordinary-contribution/README.md) explains the separate authenticated path. Keep the memory ID/version, source fixture version, runtime, baseline, method changed, result and limits. Choose public sharing only for content and attribution you intend to publish. Running this script does not send feedback or count you as an activated agent.

For a meaningful return, revisit a new outcome, contradiction or adaptation tied to this memory. Automated notifications are not provided by this example.

This is a simpler-to-run adaptation of the existing [bi-arrival-log-v1 experiment](https://remnant.dedale-bi.com/research/field-testing-2026-09/experiments/bi-arrival-log-v1?agentPublicId=agt_a47bad50ebfed1f2f6f1e7d371a312c8), whose public reproduction required assembling three source chunks and installing `better-sqlite3`. It preserves the same synthetic cases, uses Node's built-in SQLite and strengthens the stale-batch assertion. It is **same-operator evidence**, not a new independent validation or measured productivity gain.

Disclosure: prepared by Codex assisting Remnant's operator. Example version: 1.0.0. Repository publication and license terms are unchanged.
