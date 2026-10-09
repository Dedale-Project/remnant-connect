"""Deterministic defensive contract checks. Does not publish results."""
import argparse
import hashlib
import importlib
import json
import platform
from pathlib import Path
import tempfile
from datetime import datetime, timezone
from fixture import KEY, NOW, sign

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--implementation", choices=("starter", "solution"), default="starter")
    args = parser.parse_args()
    verify = importlib.import_module(args.implementation).verify
    compact = b'{"event":"synthetic-1","units":7}'
    pretty = b'{ "event": "synthetic-1", "units": 7 }'
    changed = b'{"event":"synthetic-1","units":9}'
    cases = [
        ("valid_compact", compact, sign(compact), True),
        ("valid_original_whitespace", pretty, sign(pretty), True),
        ("changed_bytes_same_json", pretty, sign(compact), False),
        ("changed_semantic_payload", changed, sign(compact), False),
        ("stale_301_seconds", compact, sign(compact, NOW - 301), False),
        ("future_31_seconds", compact, sign(compact, NOW + 31), False),
        ("old_boundary_300_seconds", compact, sign(compact, NOW - 300), True),
        ("future_boundary_30_seconds", compact, sign(compact, NOW + 30), True),
        ("duplicate_timestamp", compact, "t=0," + sign(compact), False),
        ("malformed_digest", compact, f"t={NOW},v1=not-hex", False),
        ("timestamp_tampered", compact, sign(compact).replace(str(NOW), str(NOW - 1)), False),
        ("missing_signature", compact, f"t={NOW}", False),
        # Authentic delivery can repeat: signature validation does not deduplicate it.
        ("authentic_redelivery", compact, sign(compact), True),
    ]
    results = []
    for name, body, header, expected in cases:
        try:
            actual = verify(body, header, KEY, NOW)
            result = {"case": name, "expected": expected, "observed": actual,
                      "passed": actual is expected}
        except Exception as error:
            result = {"case": name, "expected": expected,
                      "passed": False, "error": type(error).__name__}
        results.append(result)
        print(("PASS" if result["passed"] else "FAIL") + " " + name)
    passed = sum(r["passed"] for r in results)
    output = Path(tempfile.mkdtemp(prefix="webhook-run-", dir=Path.cwd()))
    report = {
        "fixture": "webhook-sandbox-v1", "implementation": args.implementation,
        "evidence_class": "local_synthetic_operator_run",
        "external_tester": False, "cross_agent_reuse_established": False,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "runtime": {"python": platform.python_version(), "os": platform.system()},
        "source_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in sorted(ROOT.glob("*.py"))},
        "passed": passed, "total": len(results), "results": results,
    }
    (output / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{passed}/{len(results)} passed; evidence: {output.name}/results.json")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
