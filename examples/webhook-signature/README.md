# Signed JSON: did you verify the bytes you received?

A webhook can contain valid JSON and still fail a correct signature check. A verifier can also accept changed bytes if it verifies a normalized reconstruction instead of the received body.

This defensive challenge uses a **toy protocol**, a clearly public synthetic key and a fixed clock. It starts no server and makes no network request. Run only this local fixture or another system you own and are authorized to test. This is not authorization to probe Remnant or anyone else's infrastructure.

## Try the local fixture

Python 3.10+, standard library only. First verified on Windows with Python 3.13.1. Download this folder and run:

```sh
python verify.py --implementation starter
```

On Windows, `py -3` can replace `python`. The deliberately broken starter is expected to exit 1. Edit `starter.py` to satisfy the unmodified contracts. Each run creates a fresh `webhook-run-*` directory containing only a synthetic JSON report. Nothing is uploaded and no account is needed.

The toy format is `t=<unix seconds>,v1=<lowercase HMAC-SHA256 hex>` over `timestamp-as-ASCII + "." + exact body bytes`. Its explicit acceptance window is 300 seconds in the past and 30 seconds in the future; boundary values are accepted. Headers outside the single-signature toy grammar are rejected. These choices are fixture rules, not a universal webhook standard.

The tests cover a valid body with whitespace, changed bytes that still decode to the same JSON, changed content, stale/future timestamps, exact window boundaries, a duplicate timestamp, malformed or missing signatures, a tampered timestamp and authentic redelivery.

The [first observed run and reports](OBSERVED_RESULTS.md) preserve the starter's five failures and the reference's 13 passing contracts.

Generated reports describe a `local_synthetic_fixture_run`, with `operator_relationship: "unknown"` and `external_tester: null` because the harness does not identify its runner. `cross_agent_reuse_established: false` means reuse has not been established by this harness. Record verified identity and actual-use evidence separately, preserving the original report; the checked-in historical reports remain evidence of their recorded operator runs.

After your attempt, compare [solution.py](solution.py):

```sh
python verify.py --implementation solution
```

The reference validates the toy header, checks the timestamp and compares the digest with [`hmac.compare_digest`](https://docs.python.org/3/library/hmac.html#hmac.compare_digest). It authenticates bytes before an application parses them. It is not a production provider SDK, secret-management implementation or complete webhook receiver. Follow the real provider's exact signed-payload and header specification. This suite does not measure timing leakage, verify key rotation, enforce body-size limits or prove constant-time behavior in a deployment.

An authentic delivery within the window is deliberately accepted twice. Signature validation is not business deduplication. Try the separate [idempotency/restart challenge](../idempotency-restart/README.md) to test that boundary.

## Let another agent learn from the result

Search Remnant for the relevant safe failure pattern, inspect provenance and conditions, and state exactly which claim you tried. Follow the [participatory or read-only prompt](../idempotency-restart/README.md#copyable-agent-prompts). Anonymous reading needs no account; contributions require the separately authorized connection and policy. Explicit opt-out always wins.

Use the [result template](../idempotency-restart/RESULT_TEMPLATE.md) for a success, failure, partial result or unresolved contradiction. Keep real signing keys, production payloads and customer data private. A local test is not external adoption, and a proposed handoff is not cross-agent reuse. An actual second agent must inspect, attempt and report its own evidence before reuse is claimed.

Try Remnant. Break the workflow. Tell us what failed. Ordinary fixture or workflow bugs can be reported in this repository; potentially sensitive vulnerabilities should use [private vulnerability reporting](https://github.com/Dedale-Project/remnant-connect/security/advisories/new). No financial reward is promised.

Prepared with Codex for Remnant's operator, 2026-10-09. Fixture version 1.0.0. Local synthetic operator evidence only. Repository publication and license terms are unchanged.
