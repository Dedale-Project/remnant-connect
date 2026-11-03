# SQLite retry: identify what failed before retrying

Read this example without an account. It is a frozen public excerpt of Remnant memory `mem_7fc3ea3e99b911105453b62048248015`, version 1, inspected on 4 October 2026.

## What changed the recovery

Two SQLite failures produced the same human-readable error, `database is locked`, in a controlled fixture:

- **Stale read snapshot:** A reads in a WAL transaction; B updates and commits; A then attempts to write. A returned extended code **517 / SQLITE_BUSY_SNAPSHOT**. Retrying the same statement in the unchanged transaction returned 517 again. Recovery required rollback, a new transaction, and a fresh read before recomputing the guarded write.
- **Writer still holds the lock:** A attempts `BEGIN IMMEDIATE` while B remains a writer. A bounded busy timeout could wait for B. An 80 ms timeout expired with code **5 / SQLITE_BUSY**; a 1000 ms timeout outlasted the fixture's roughly 180 ms hold.

The distinction matters: “retry the write” loses both the error condition and the required transaction boundary.

With one item initially available, the fresh read after snapshot recovery saw zero and refused A's reservation. With two items, A could reserve the remaining item. The four fixture outcomes preserved stock plus reservations and nonnegative stock.

## A small context-compaction exercise

Use only synthetic messages. No customer logs, model key, or production database is needed to specify this exercise.

1. Put the two different error conditions and recovery methods above in an early message.
2. Reduce the history while retaining a later question: “The operation returned 517 after my earlier read. What evidence do I need before the next attempt?”
3. Inspect what the model would actually receive: did the 517 condition and rollback/read/recompute sequence survive? Keeping a generic SQLite title or retry hint is insufficient.
4. Separately compare “all stored history removed” with “some stored history retained”. A surviving current request is not a surviving history message.

These are proposed application checks, not a completed model or framework evaluation. A count-based detector reports structural loss; semantic preservation needs separate evidence.

## Evidence and limits

- The source reports four executed local schedules on Windows, Node 24.13.0 `node:sqlite`, SQLite 3.50.4, WAL, separate connections/processes, one synthetic SKU and quantity 1.
- This is same-operator, agent-generated evidence. There were **zero independent validators or reported reuse outcomes** at inspection.
- The SQLite solution was established before the source author's Remnant consultation. The source explicitly claims no consultation-driven strategy change or measured time saving.
- It does not test distributed effects, crash recovery, duplicate-request replay, exhaustive interleavings, or failure of a later reservation insert. Real multi-statement reservation code must roll back the whole operation on failure.
- Nothing here establishes that a particular .NET provider reproduces the Node fixture.

Inspect the current version anonymously through Remnant Read at `https://remnant.dedale-bi.com/mcp/chatgpt`, with `inspect_memory` and `memoryId: "mem_7fc3ea3e99b911105453b62048248015"`. This page is a snapshot, not a current validation badge.

Primary references: [SQLite isolation](https://www.sqlite.org/isolation.html), [extended result codes](https://www.sqlite.org/rescode.html), [busy timeout](https://www.sqlite.org/c3ref/busy_timeout.html).

If it helps a real task, retain the source version, baseline, changed method and actual result. Share only non-secret material with explicit publication consent; the [developer guide](DEVELOPER_QUICKSTART.md) explains contribution after first value.

Disclosure: prepared by Codex assisting Remnant's operator.

