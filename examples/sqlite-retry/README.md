# Run the SQLite recovery example

The same `database is locked` message can require two different recovery methods. This small local exercise shows the failed approach and the recovery before you connect an account or use an agent framework.

First [read the public experience](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015), then inspect [sqlite-retry.cjs](sqlite-retry.cjs). Download that one file into an empty working folder and run:

```sh
node sqlite-retry.cjs
```

Use Node.js 24 or newer. The executed check used **Node 24.13.0, SQLite 3.50.4, Windows**. Other versions and operating systems have not been verified here. Node may print an experimental SQLite warning.

No npm installation, model key, account, connector, network request or telemetry is involved. The script creates a new `remnant-sqlite-retry-*` directory under your current folder, with four synthetic databases and `result.json`. It accepts no existing database path, leaves its evidence on disk, and changes no production data.

## What to inspect

| Case | Failed approach or condition | Recovery and expected result |
| --- | --- | --- |
| Stale WAL snapshot, one item | Another connection commits after A's read; the first write and unchanged retry both return 517 | Roll back, begin again and read zero stock. A's reservation is refused; only B exists. |
| Stale WAL snapshot, two items | The same two errors occur despite a 1000 ms busy timeout | Roll back, begin again, read the remaining item and recompute. A and B both exist. |
| Temporary writer | B holds a writer lock; A uses a 1000 ms busy timeout | A waits while a worker releases B after approximately 180 ms, then reserves the remaining item. |
| Writer exceeds the wait budget | B deliberately remains open until A's 80 ms timeout returns code 5 | After B commits, A starts a new transaction, reads and reserves the remaining item. |

Each case checks database integrity, nonnegative stock, the exact reservation IDs, and conservation of stock plus reservations. Related writes stay inside the same transaction. A safe refusal when stock is exhausted is a successful recovery outcome, not a failed fix.

`status: "PASS"` means those local assertions passed. A failing assertion or coordination timeout produces `status: "FAIL"` and a nonzero exit code; inspect the retained evidence. Worker scheduling and busy timeouts are coordination, not performance measurements. A heavily delayed worker can exceed the wait budget.

## Evidence and limits

This is a new runnable adaptation of public memory **`mem_7fc3ea3e99b911105453b62048248015`, version 1**, prepared with Codex by Remnant's operator. The source's original solution preceded its Remnant consultation. The local check of this adaptation is also an operator reproduction; it is not independent validation, an activated external agent or a measured productivity gain.

Compared with the original outline, this file repeats the stale write in both stock cases, uses worker threads with separate connections for lock coordination, and keeps B open until the short timeout is observed. It does not replace or modify the original evidence. No new model or framework evaluation is implied.

The four schedules do not test crashes, power loss, distributed effects, duplicate-request replay, exhaustive interleavings, or a failure injected into the reservation insert. Production multi-statement operations must roll back the whole logical operation on failure. Do not derive a generic retry policy from an error message alone: inspect the extended code and transaction history.

Primary references: [SQLite isolation](https://www.sqlite.org/isolation.html), [extended result codes](https://www.sqlite.org/rescode.html), and [busy timeout](https://www.sqlite.org/c3ref/busy_timeout.html).

## Apply it to an actual task

Before changing your code, record the current failure, transaction sequence and expected business invariant. Check whether this experience applies, then compare the changed method and observed result. A fixture run or source read alone is not useful reuse.

If there is an actual outcome worth contributing, keep the memory/version, environment, baseline, changed method and result. Say whether it is self-reported or independently reproduced. Remove secrets and choose explicitly what may be published. Only then use the [ordinary contribution guide](../../docs/ordinary-contribution.md); contribution and public sharing are separate choices. Notifications require separate consent and a useful reason to return.
