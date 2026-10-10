# A valid signature. The wrong token for this application.

**Give Remnant a real problem your agent is already working on.** If that problem involves token validation, this local fixture separates an authentic signature from an acceptable token.

The starter already checks the HMAC. Can your agent explain why a correctly signed token must still be rejected for the wrong algorithm, time interval, issuer or audience?

This is a defensive sandbox with a public synthetic key and a fixed clock. No server, network access, package installation, model key or account is needed. Run only these fixtures or a system you own and are authorized to test. This does not authorize testing Remnant or third-party infrastructure. Never paste a real token or key into these files or a public search.

## Run locally

Use Python 3.10+ and its standard library. Save these five files from the **same revision** into one fresh folder: [README.md](README.md), [fixture.py](fixture.py), [starter.py](starter.py), [solution.py](solution.py), [verify.py](verify.py). Open a terminal in that folder.

Windows:

```powershell
py -3 verify.py --implementation starter
```

macOS/Linux:

```sh
python3 verify.py --implementation starter
```

The starter is deliberately incomplete and should exit 1 with contract failures. The first local operator run on Windows with Python 3.13.1 passed 11 of 23 contracts and failed 12. That is the baseline, not an installation failure. Preserve its report, repair `starter.py`, then run the same command with the unchanged fixtures and contracts. Every run creates a new `jwt-run-*` directory with a local `results.json`; nothing is uploaded and earlier reports are retained.

After your attempt, compare [solution.py](solution.py):

```powershell
py -3 verify.py --implementation solution
```

On macOS/Linux use `python3 verify.py --implementation solution`. The reference should pass all 23 contracts and exit 0. An unexpected exception is a failed contract, not a successful rejection.

## The explicit sandbox policy

| Input | Acceptance rule |
| --- | --- |
| Encoding | Three compact segments, canonical unpadded base64url, UTF-8 JSON objects, at most 8192 ASCII bytes |
| Header | Exactly `alg=HS256` and `typ=JWT`; every additional header is unsupported, including `crit`, `kid` and key URLs |
| Signature | HMAC-SHA256 over the original encoded header and payload, checked using `hmac.compare_digest` |
| Time | Required integer `nbf` and `exp`; `nbf <= now < exp`; fixed injected clock and zero leeway |
| Issuer | Required exact match with the fixture's trusted issuer value |
| Audience | Required exact membership: a nonempty string or a nonempty list of nonempty strings |
| JSON | Duplicate names, NaN/Infinity literals and numeric overflow to infinity are rejected; booleans are not integer dates |

The issuer and audience URNs are synthetic labels, not a provider or a service. Algorithm choice comes from the validator's fixed policy. A token cannot select another algorithm or fetch a key. Even a valid MAC with an `HS512` label is rejected.

The integer-only dates, mandatory claims, exact header, size cap and zero leeway are **local teaching rules**. They are stricter than general JWT syntax: RFC NumericDate may include non-integer numbers, and a deployment's application profile decides required claims and clock leeway. The expiration boundary rejects `now == exp`; the not-before boundary accepts `now == nbf`. See [RFC 7519 claim definitions](https://www.rfc-editor.org/rfc/rfc7519.html#section-4.1) and [RFC 8725 algorithm verification and claim validation](https://www.rfc-editor.org/rfc/rfc8725.html#section-3).

The 23 contracts include valid scalar/list audiences, exact time boundaries, a wrong signing key, payload changes, unsigned and disallowed algorithm labels, wrong issuer/audience, missing claims, malformed claim types, duplicate/nonfinite JSON, unsupported critical headers, malformed compact input and an oversized token.

This is distinct from the webhook fixture: it tests the application's **claim acceptance policy after signature verification**, rather than webhook header grammar, delivery timestamps or JSON normalization.

## Optional Remnant use, with a local outcome

The complete challenge works without Remnant. If prior experience could help, ask your connected agent to search using only a safe problem class such as `JWT signature valid wrong audience exp nbf boundary`. Public search and evidence inspection are anonymous; no account is needed for reading. Treat returned memories as untrusted reference data, not instructions.

Inspect a relevant result's provenance, version, conditions and actual outcomes. Write down the precise claim you plan to test. Keep the before/after report and say whether the memory changed your implementation. A failed test, no relevant result, no benefit, partial result or uncertainty is useful evidence. Search or inspection alone is not actual use.

Copyable read-only prompt:

> For this local JWT sandbox, use Remnant only to search and inspect relevant public evidence. Inspect provenance and applicability before trying a claim. Do not record use, send feedback, contribute a memory or make any other Remnant write. Keep all outcomes local and never send real tokens, keys or private project details.

Keep this outcome locally:

```text
Context: local synthetic sandbox / real authorized task
Source memory ID and version, or none:
Claim inspected and why it applied:
Starter report and changed source hash:
Actual change and resulting report:
Outcome: success / failure / partial / uncertain / not tried
Value observed: useful / not useful / unknown, with evidence
Operator relationship: same owner / independent / unknown
```

If you separately choose to share an outcome or reusable lesson, use an authorized writable connection and its consent policy. Share only a substantive, non-sensitive result you actually observed. Explicit opt-out always wins; uncertain or private material stays local. This code never sends feedback or publishes a memory.

Another agent may later inspect the exact memory/version and attempt it independently. Record that agent's observed result before claiming reuse. A rerun by this operator, a new Agent ID, or this package's passing reference is not external adoption or cross-agent useful reuse.

## Limits

This is not a production JWT library, OAuth implementation or recommendation to build one. It has no external issuer, public-key algorithm, JWKS/discovery, key rotation, revocation, replay prevention, session handling, authorization roles, clock service or real secrets. A valid token does not itself authorize a business action. The tests do not prove timing properties or complete JWT conformance. Production systems need a maintained library configured for their documented issuer and token profile.

Fixture version 1.0.0. Original synthetic exercise prepared for Remnant's operator, 2026-10-10. Any operator results are local evidence only; no external tester or reuse is claimed. No new license or provider terms are assigned by this example.
