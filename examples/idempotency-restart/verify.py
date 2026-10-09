"""Contract tests; intentionally red on starter.py. No third-party packages."""
import argparse
import hashlib
import json
import platform
import sqlite3
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from common import CRASH_EXIT

ROOT = Path(__file__).resolve().parent
REQUEST = {"tenant": "synthetic-a", "key": "synthetic-job-1", "units": 7}


def run_worker(implementation, database, requests, fault=None):
    command = [sys.executable, str(ROOT / "worker.py"), implementation, str(database)]
    if fault:
        command += ["--fault", fault]
    run = subprocess.run(command, input=json.dumps(requests), text=True,
                         capture_output=True, timeout=10)
    return {"exit": run.returncode, "stdout": run.stdout.strip(), "stderr": run.stderr.strip()}


def state(database):
    with sqlite3.connect(database) as db:
        rows = db.execute("SELECT id, tenant, request_key, units FROM effects ORDER BY id").fetchall()
        receipts = db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0]
    return {"effects": rows, "effect_count": len(rows),
            "total_units": sum(row[3] for row in rows), "receipt_count": receipts}


def response(run):
    if run["exit"] != 0:
        return None
    try:
        return json.loads(run["stdout"])["responses"]
    except (ValueError, KeyError):
        return None


def check(implementation, name, database):
    r = dict(REQUEST)
    calls = []
    observations = {}
    if name in ("lost_reply_restart", "interrupted_transaction"):
        fault = ("after_commit_before_reply" if name == "lost_reply_restart"
                 else "after_effect_before_receipt")
        calls.append(run_worker(implementation, database, [r], fault))
        observations["after_crash"] = state(database)
        calls.append(run_worker(implementation, database, [r]))
        observations["after_retry"] = state(database)
        expected_initial = 1 if name == "lost_reply_restart" else 0
        passed = (calls[0]["exit"] == CRASH_EXIT and not calls[0]["stdout"]
                  and observations["after_crash"]["effect_count"] == expected_initial
                  and observations["after_retry"]["effect_count"] == 1
                  and observations["after_retry"]["total_units"] == 7
                  and response(calls[1]) == [{"effect_id": 1, **r}])
    elif name == "same_request_replay":
        calls.append(run_worker(implementation, database, [r, r]))
        calls.append(run_worker(implementation, database, [r]))
        observations["final"] = state(database)
        expected = {"effect_id": 1, **r}
        passed = (response(calls[0]) == [expected, expected]
                  and response(calls[1]) == [expected]
                  and observations["final"]["effect_count"] == 1)
    elif name == "changed_payload_conflicts":
        calls.append(run_worker(implementation, database, [r]))
        calls.append(run_worker(implementation, database, [{**r, "units": 9}]))
        observations["final"] = state(database)
        passed = (response(calls[0]) == [{"effect_id": 1, **r}]
                  and calls[1]["exit"] == 2
                  and json.loads(calls[1]["stdout"]).get("error") == "conflict"
                  and observations["final"]["effect_count"] == 1
                  and observations["final"]["total_units"] == 7)
    elif name == "tenant_scoped_key":
        other = {**r, "tenant": "synthetic-b", "units": 11}
        calls.append(run_worker(implementation, database, [r, other, r, other]))
        observations["final"] = state(database)
        expected = [{"effect_id": 1, **r}, {"effect_id": 2, **other}]
        passed = (response(calls[0]) == expected + expected
                  and observations["final"]["effect_count"] == 2
                  and observations["final"]["total_units"] == 18)
    elif name == "new_key_is_new_action":
        other = {**r, "key": "synthetic-job-2"}
        calls.append(run_worker(implementation, database, [r, other]))
        observations["final"] = state(database)
        passed = (response(calls[0]) == [{"effect_id": 1, **r}, {"effect_id": 2, **other}]
                  and observations["final"]["effect_count"] == 2
                  and observations["final"]["total_units"] == 14)
    else:
        raise ValueError(name)
    return {"case": name, "passed": passed, "calls": calls, "observations": observations}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--implementation", choices=("starter", "solution"), default="starter")
    args = parser.parse_args()
    output = Path(tempfile.mkdtemp(prefix="idempotency-run-", dir=Path.cwd()))
    names = ("lost_reply_restart", "interrupted_transaction", "same_request_replay",
             "changed_payload_conflicts", "tenant_scoped_key", "new_key_is_new_action")
    results = []
    for name in names:
        try:
            result = check(args.implementation, name, output / (name + ".sqlite"))
        except Exception as error:
            result = {"case": name, "passed": False, "harness_error": repr(error)}
        results.append(result)
        print(("PASS" if result["passed"] else "FAIL") + " " + name)
    passed = sum(r["passed"] for r in results)
    report = {
        "fixture": "idempotency-restart-v1", "implementation": args.implementation,
        "evidence_class": "local_synthetic_operator_run",
        "external_tester": False, "cross_agent_reuse_established": False,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "runtime": {"python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
                    "os": platform.system(), "release": platform.release()},
        "source_sha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                          for p in sorted(ROOT.glob("*.py"))},
        "passed": passed, "total": len(results), "results": results,
    }
    (output / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{passed}/{len(results)} passed; evidence: {output.name}/results.json")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
