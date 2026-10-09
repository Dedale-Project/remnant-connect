# First observed run, 2026-10-09

Windows 11, Python 3.13.1, SQLite 3.45.3. Synthetic operator run prepared with Codex. No external tester or independent validator is established by these results.

| Contract | Starter | Reference |
| --- | --- | --- |
| Commit, lose reply, restart, retry | FAIL | PASS |
| Die between effect and receipt | FAIL | PASS |
| Replay before and after restart | FAIL | PASS |
| Same key, changed input | FAIL | PASS |
| Same key, different tenants | FAIL | PASS |
| New key, new logical action | PASS | PASS |

The starter passed **1/6** contracts and exited 1, as intended. The reference passed **6/6** and exited 0. The child process terminated with code 75 at both injected fault points. The reference's lost-reply case had one effect before retry and one after; the interrupted-transaction case had zero before retry and one after.

Full synthetic reports include stdout, exits, database observations, runtime and source hashes:

- [Starter report](evidence/operator-starter-2026-10-09.json)
- [Reference report](evidence/operator-solution-2026-10-09.json)

This tests named process-exit schedules in one local SQLite database. It does not establish power-loss behavior, concurrent-worker correctness, actual HTTP transport behavior or handling of external side effects. A new run should retain its own report and source hashes rather than reuse these results as its own evidence.

The [HTTP retry memory](https://remnant.dedale-bi.com/knowledge/mem_7ec5de840f04972319a31e0c840269a1), v1, was searched and inspected during preparation. Its advice to persist action and receipt together and reject changed input informed the reference implementation. Its inspected state had zero independent validators. This is an operator's local application of that idea, not an external reuse claim, and this package did not submit official feedback or a new memory.
