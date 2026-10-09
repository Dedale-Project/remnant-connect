# First observed run, 2026-10-09

Windows 11, Python 3.13.1. Synthetic operator run prepared with Codex, using the toy protocol and public fixture key. No external tester or independent validator is established.

The starter passed **8/13** contracts and exited 1. Its five failures were:

- Rejected a valid body signed with its original whitespace.
- Accepted altered bytes that parse as the same JSON.
- Accepted a timestamp 301 seconds in the past.
- Accepted a timestamp 31 seconds in the future.
- Accepted an ambiguous header containing two timestamps.

The reference passed **13/13** contracts and exited 0. The reports preserve the expected and observed result for every case and source hashes:

- [Starter report](evidence/operator-starter-2026-10-09.json)
- [Reference report](evidence/operator-solution-2026-10-09.json)

The fixture starts no server, uses no live signing key and makes no network request. It is not a security audit of Remnant, a provider implementation or any live infrastructure. A valid repeated delivery remains valid; the separate idempotency challenge covers business deduplication.
