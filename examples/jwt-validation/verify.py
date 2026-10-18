"""Behavioral sandbox contracts; no network, model, credentials, or real tokens."""

import argparse
import hashlib
import importlib
import json
from pathlib import Path
import platform
import tempfile

from fixture import AUDIENCE, ISSUER, KEY, MAX_TOKEN_BYTES, NOW, TokenRejected, claims, encode, mint


def cases():
    valid = mint()
    parts = valid.split(".")
    tampered = parts[0] + "." + encode(json.dumps(claims(sub="changed-subject")).encode()) + "." + parts[2]
    missing_exp = claims()
    del missing_exp["exp"]
    missing_aud = claims()
    del missing_aud["aud"]
    duplicate = json.dumps(claims(), separators=(",", ":"))[:-1] + ',"iss":"urn:other"}'
    nonfinite = json.dumps(claims(), separators=(",", ":")).replace(str(NOW + 60), "NaN")
    return [
        ("valid_single_audience", mint(), True),
        ("valid_audience_list", mint(claims(aud=["urn:other", AUDIENCE])), True),
        ("nbf_equal_now_is_valid", mint(claims(nbf=NOW)), True),
        ("exp_equal_now_is_expired", mint(claims(exp=NOW)), False),
        ("nbf_in_future", mint(claims(nbf=NOW + 1)), False),
        ("wrong_signing_key", mint(key=b"OTHER-PUBLIC-SYNTHETIC-KEY-0000000000"), False),
        ("changed_payload_keeps_old_signature", tampered, False),
        ("unsigned_alg_none", mint(header={"alg": "none", "typ": "JWT"}).rsplit(".", 1)[0] + ".", False),
        ("disallowed_alg_even_with_valid_sha256_mac", mint(header={"alg": "HS512", "typ": "JWT"}), False),
        ("wrong_issuer_with_valid_mac", mint(claims(iss=ISSUER + ":other")), False),
        ("audience_substring_is_not_membership", mint(claims(aud=AUDIENCE + ":other")), False),
        ("missing_audience", mint(missing_aud), False),
        ("missing_expiry", mint(missing_exp), False),
        ("boolean_expiry_is_not_integer_date", mint(claims(exp=True)), False),
        ("string_not_before_is_not_integer_date", mint(claims(nbf=str(NOW - 60))), False),
        ("fractional_expiry_outside_fixture_profile", mint(claims(exp=NOW + 60.5)), False),
        ("mixed_type_audience_list", mint(claims(aud=[AUDIENCE, 7])), False),
        ("duplicate_claim_rejected", mint(raw_payload=duplicate.encode()), False),
        ("nonfinite_claim_rejected", mint(raw_payload=nonfinite.encode()), False),
        ("overflowed_json_number_rejected", mint(raw_payload=nonfinite.replace("NaN", "1e999").encode()), False),
        ("unsupported_critical_header", mint(header={"alg": "HS256", "typ": "JWT", "crit": ["unknown"], "unknown": True}), False),
        ("malformed_compact_token", "not.a.token.extra", False),
        ("token_above_size_limit", mint(claims(note="x" * MAX_TOKEN_BYTES)), False),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--implementation", choices=("starter", "solution"), required=True)
    args = parser.parse_args()
    validate = importlib.import_module(args.implementation).validate
    results = []
    for name, token, expected in cases():
        accepted = False
        returned_subject = None
        crash = None
        try:
            payload = validate(token, now=NOW, key=KEY, issuer=ISSUER, audience=AUDIENCE)
            accepted = True
            returned_subject = payload.get("sub")
        except TokenRejected:
            pass
        except Exception as exc:
            crash = type(exc).__name__
        passed = crash is None and accepted == expected and (not expected or returned_subject == "synthetic-subject")
        results.append({"contract": name, "expectedAccepted": expected, "observedAccepted": accepted,
                        "unexpectedException": crash, "passed": passed})
        print(("PASS " if passed else "FAIL ") + name)
    source = Path(__file__).resolve().parent
    report = {"fixtureVersion": "1.0.0", "evidenceClass": "local synthetic fixture run",
              "python": platform.python_version(), "implementation": args.implementation,
              "clock": NOW, "tests": len(results), "passed": sum(row["passed"] for row in results),
              "results": results, "sourceSha256": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                  for name in ("fixture.py", "starter.py", "solution.py", "verify.py")},
              "liveCalls": 0, "operatorRelationship": "unknown",
              "externalParticipationEstablished": False}
    run_dir = Path(tempfile.mkdtemp(prefix="jwt-run-", dir=Path.cwd()))
    (run_dir / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{report['passed']}/{report['tests']} contracts passed. Local report: {run_dir / 'results.json'}")
    return 0 if report["passed"] == report["tests"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
