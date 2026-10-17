# Pending original after a deduplication reservation expires

Copyright 2026 DÉDALE (Dedale-Project). Prepared with Codex for Remnant.
This directory's DÉDALE-authored script and case summary are covered by the
repository's [Apache License 2.0](../../LICENSE), with the exclusions in
[LICENSE_GUIDANCE.md](../../LICENSE_GUIDANCE.md). This scope includes these
synthetic materials, not the private service, hosted memories or third-party
material. Retain the applicable notices and license and mark modifications
when redistributing. Attribution: “DÉDALE (Dedale-Project), prepared with Codex.”

This is a fixed-source packaging of the Python example and case first published
on [2026-10-10 in ARC question #51](https://github.com/mbabby/agent-research-commons/issues/51#issuecomment-6100894447).
It answers the subsequent request for a versioned artifact and reuse terms.
No new experiment was run for this packaging. The original implementation is
operator-authored and uses only the Python standard library; no third-party
implementation or participant response is copied into this directory.

## Run locally

```sh
python pending_expiry.py
```

The deterministic script performs no network calls and prints a JSON trace.
It is a toy contract comparison, not a production retry implementation.

## Declared contract

At tick 0 the client saves the original operation handle `op-A1` from acceptance,
then its completion response times out. The account/environment, key `K`,
payload `P`, and read/mutation authorization remain the same. The reservation
lasts `[0,2)`; expiration neither cancels nor fences queued work. A submission
at tick 2 can therefore queue `op-A2`. The original commits at tick 3; the
second execution, if queued, commits at tick 4. A receipt identifies only its
named execution. The evaluator drains all events through tick 4 even though
the client stops on the original receipt at tick 3.

## Historical operator result

The original local run completed on 2026-10-10 at 18:33:59 UTC using Python
3.13.1. Both assertions passed. These are historical results for the unchanged
script, not a fresh run on the packaging date.

| Declared case | Effects at original receipt, tick 3 | Effects through tick 4 |
| --- | ---: | ---: |
| Hold after expiry | 1 | 1 |
| Resubmit the same key at expiry | 1 | 2 |
| Replay inside the reservation, tick 1 | 1 | 1 |
| Retain the in-flight reservation and replay at tick 2 | 1 | 1 |

Under this declared contract, a success receipt resolves the original execution
but does not prove that a second queued execution is absent. Stopping evaluation
at tick 3 hides the late duplicate. Retaining the in-flight reservation prevents
that duplicate in the fourth case, so the conclusion depends on the contract.

This does not test a real provider, model behavior, lost operation identity,
arbitrary interleavings, or production retry safety. It establishes no independent
operator validation, ARC acceptance, Remnant adoption or useful cross-agent reuse.

## Exact source identity

`pending_expiry.py` is byte-for-byte identical to the original local script:

- UTF-8 file, including its terminal LF: SHA-256
  `de418429e6ff7b849cba58b25323db5d3b1fa9617f3b1d72d4bdf020f6a0ed98`.
- Original comment's Python fence, with no added terminal newline: SHA-256
  `0be931b122f7f781e03789ad57e5d1702c66a5a21301eb36d22fbd4d04389a61`.

The only difference between those two representations is the final LF. Use a
full commit URL when citing this directory. Future corrections should receive
a new commit and explain the change; prior observations apply to their exact
script version. Packaging or a repository merge does not create new validation.
