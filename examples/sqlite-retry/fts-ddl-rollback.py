"""Run four synthetic SQLite FTS5 / own-DDL rollback cases in a fresh local folder.
Python 3.11+ with SQLite and FTS5; standard library only, no network or existing DB.
Prepared with Codex for Remnant's operator. Hypothesis: lcm-x issue 1159.
This packages the historical 2026-10-13 operator fixture; it is not a product fix.
"""
import sys

BLOCKED = []


def audit(event, args):
    if event.startswith("socket.") or event.startswith("subprocess.") or event in ("os.system", "os.posix_spawn", "os.spawn"):
        BLOCKED.append(event)
        raise RuntimeError("Network/process operation outside this local SQLite fixture: " + event)


sys.addaudithook(audit)
import argparse
import hashlib
import json
import platform
try:
    import sqlite3
    SQLITE_IMPORT_ERROR = None
except ImportError as exc:
    sqlite3 = None
    SQLITE_IMPORT_ERROR = str(exc)
import tempfile
import threading
import time
import traceback
from pathlib import Path
from datetime import datetime, timezone

START = time.perf_counter()
BUSY_MS = 2000
HOLD_SECONDS = 0.4
INSERT = "INSERT INTO messages(id, body) VALUES (?, ?)"


def now_ms():
    return round((time.perf_counter() - START) * 1000, 3)


def error_record(exc):
    return {"type": type(exc).__name__, "message": str(exc),
            "sqlite_errorcode": getattr(exc, "sqlite_errorcode", None),
            "sqlite_errorname": getattr(exc, "sqlite_errorname", None)}


def one_case(root, name, fts, ddl_action, immediate):
    database = root / (name + ".sqlite")
    record = {"name": name, "fts": fts, "ddlAction": ddl_action,
              "explicitBeginImmediate": immediate, "database": database.name,
              "busyTimeoutMs": BUSY_MS, "requestedWriterHoldAfterReaderReadyMs": HOLD_SECONDS * 1000,
              "readerTrace": [], "writerTrace": [], "writerError": None,
              "readAttempt": None, "caseError": None}
    reader = sqlite3.connect(database, timeout=BUSY_MS / 1000, isolation_level="")
    writer_locked = threading.Event()
    reader_ready = threading.Event()
    writer_finished = threading.Event()
    thread = None
    try:
        record["journalMode"] = reader.execute("PRAGMA journal_mode=WAL").fetchone()[0]
        reader.execute(f"PRAGMA busy_timeout={BUSY_MS}")
        reader.executescript("CREATE TABLE messages(id INTEGER PRIMARY KEY, body TEXT NOT NULL);\n"
                             "CREATE TABLE writer_lock(id INTEGER PRIMARY KEY, n INTEGER NOT NULL);\n"
                             "INSERT INTO writer_lock VALUES(1, 0);")
        if fts:
            reader.executescript("CREATE VIRTUAL TABLE messages_fts USING fts5(body, content='messages', content_rowid='id');\n"
                                 "CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN\n"
                                 "INSERT INTO messages_fts(rowid, body) VALUES(new.id, new.body); END;")
        # Same SQL string caches the statement before our own DDL transaction.
        reader.execute(INSERT, (1, "synthetic warm row"))
        reader.commit()
        record["warmInsertCommitted"] = True
        reader.set_trace_callback(lambda sql: record["readerTrace"].append({"atMs": now_ms(), "sql": sql}))
        reader.execute("BEGIN")
        reader.execute("CREATE TABLE own_ddl_probe(x INTEGER)")
        if ddl_action == "rollback":
            reader.rollback()
        else:
            reader.commit()
        record["ddlFinishedAtMs"] = now_ms()
        record["readerInTransactionBeforeWriter"] = reader.in_transaction

        def writer_job():
            writer = None
            try:
                writer = sqlite3.connect(database, timeout=BUSY_MS / 1000, isolation_level="")
                writer.set_trace_callback(lambda sql: record["writerTrace"].append({"atMs": now_ms(), "sql": sql}))
                writer.execute("BEGIN IMMEDIATE")
                writer.execute("UPDATE writer_lock SET n=n+1 WHERE id=1")
                record["writerLockedAtMs"] = now_ms()
                writer_locked.set()
                if not reader_ready.wait(3):
                    raise RuntimeError("Reader did not reach the coordinated attempt within 3 seconds")
                # A single bounded hold, not a benchmark or retry loop.
                threading.Event().wait(HOLD_SECONDS)
                writer.commit()
                record["writerCommittedAtMs"] = now_ms()
            except BaseException as exc:
                record["writerError"] = error_record(exc)
                writer_locked.set()
            finally:
                if writer is not None:
                    writer.close()
                writer_finished.set()

        thread = threading.Thread(target=writer_job, name=name, daemon=True)
        thread.start()
        if not writer_locked.wait(3):
            raise RuntimeError("Writer failed to signal within 3 seconds")
        if record["writerError"] is not None:
            raise RuntimeError("Writer could not acquire the fixture lock")
        attempt = {"startedAtMs": now_ms(), "writerFinishedAtStart": writer_finished.is_set(),
                   "status": None, "error": None}
        record["readAttempt"] = attempt
        reader_ready.set()
        try:
            with reader:
                if immediate:
                    reader.execute("BEGIN IMMEDIATE")
                reader.execute(INSERT, (2, "synthetic attempted row"))
            attempt["status"] = "committed"
        except sqlite3.Error as exc:
            attempt["status"] = "sqlite_error"
            attempt["error"] = error_record(exc)
        finally:
            attempt["finishedAtMs"] = now_ms()
            attempt["elapsedMs"] = round(attempt["finishedAtMs"] - attempt["startedAtMs"], 3)
            attempt["writerFinishedAtOutcome"] = writer_finished.is_set()
            attempt["readerInTransactionAfterOutcome"] = reader.in_transaction
        thread.join(3)
        if thread.is_alive():
            raise RuntimeError("Writer did not finish within 3 seconds")
        # Final-data reads happen after the attempted write and writer completion.
        reader.set_trace_callback(None)
        record["finalMessages"] = [list(r) for r in reader.execute("SELECT id, body FROM messages ORDER BY id")]
        record["finalWriterValue"] = reader.execute("SELECT n FROM writer_lock WHERE id=1").fetchone()[0]
        record["ddlTableExists"] = bool(reader.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='own_ddl_probe'").fetchone())
        if fts:
            record["ftsMatchingAttemptedIds"] = [r[0] for r in reader.execute("SELECT rowid FROM messages_fts WHERE messages_fts MATCH 'attempted'")]
        attempt_trace = [row["sql"] for row in record["readerTrace"] if row["atMs"] >= attempt["startedAtMs"]]
        record["ftsConfigReadInAttemptTrace"] = any("_config" in sql and "SELECT" in sql.upper() for sql in attempt_trace)
        record["writerStillHeldAtError"] = attempt["status"] == "sqlite_error" and attempt["finishedAtMs"] < record.get("writerCommittedAtMs", -1)
    except BaseException as exc:
        record["caseError"] = error_record(exc)
        record["caseTraceback"] = traceback.format_exc()
    finally:
        reader_ready.set()
        if thread is not None:
            thread.join(3)
            record["writerThreadAliveAtClose"] = thread.is_alive()
        reader.close()
    return record


EXIT_CODES = {
    "ISSUE_PATTERN_OBSERVED_ON_LOCAL_RUNTIME": 0,
    "ISSUE_PATTERN_NOT_FULLY_REPRODUCED_ON_LOCAL_RUNTIME": 1,
    "BLOCKED_FTS5_UNAVAILABLE": 2,
    "BLOCKED_RUNTIME_UNAVAILABLE": 2,
    "HARNESS_FAILURE": 3,
}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    report = {"schemaVersion": 1, "fixtureVersion": "1.0.1",
              "startedAt": datetime.now(timezone.utc).isoformat(),
              "protocolSource": "https://github.com/electricsheephq/lcm-x/issues/1159",
              "sourceMemory": {"id": "mem_a72afd277977453fce039f480b814b6a", "version": 2},
              "evidenceClass": "local_synthetic_fixture_run", "operatorRelationship": "unknown",
              "externalTester": None, "externalUseEstablished": False,
              "runtime": {"python": platform.python_version(),
                          "sqlite": sqlite3.sqlite_version if sqlite3 is not None else None,
                          "platform": sys.platform},
              "matrixInvocations": 0, "caseInvocations": 0, "cases": [],
              "status": "NOT_FINISHED", "fts5Available": None, "blockedOperations": BLOCKED,
              "sourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "limits": ["One observation per case; not a benchmark or production-frequency estimate.",
                         "The fixture does not run lcm-x or instrument SQLite's busy handler.",
                         "Runtime, schema and scheduling differences can produce non-reproduction.",
                         "A fixture run, source-memory link or unknown identity does not establish actual Remnant use or external reuse."]}
    root = None
    try:
        root = Path(tempfile.mkdtemp(prefix="remnant-sqlite-fts-", dir=Path.cwd()))
        report["sandbox"] = root.name
        if sys.version_info < (3, 11) or sqlite3 is None:
            report["status"] = "BLOCKED_RUNTIME_UNAVAILABLE"
            report["runtimeBlocker"] = SQLITE_IMPORT_ERROR or "Python 3.11+ is required for SQLite error code/name reporting."
        else:
            probe = sqlite3.connect(":memory:")
            try:
                probe.execute("CREATE VIRTUAL TABLE capability_probe USING fts5(body)")
                report["fts5Available"] = True
            except sqlite3.Error as exc:
                report["capabilityError"] = error_record(exc)
                if (str(exc).strip().lower() == "no such module: fts5"
                        and getattr(exc, "sqlite_errorcode", sqlite3.SQLITE_ERROR) == sqlite3.SQLITE_ERROR):
                    report["fts5Available"] = False
                else:
                    # A failed probe does not establish that FTS5 is unavailable.
                    raise
            finally:
                probe.close()
            if not report["fts5Available"]:
                report["status"] = "BLOCKED_FTS5_UNAVAILABLE"
            else:
                report["matrixInvocations"] = 1
                for definition in [
                    ("fts_rollback_deferred", True, "rollback", False),
                    ("fts_commit_deferred", True, "commit", False),
                    ("nofts_rollback_deferred", False, "rollback", False),
                    ("fts_rollback_immediate", True, "rollback", True),
                ]:
                    report["caseInvocations"] += 1
                    report["cases"].append(one_case(root, *definition))
                first, *controls = report["cases"]
                report["observedPattern"] = {
                    "firstCaseCode5": (first.get("readAttempt") or {}).get("error", {}) is not None and (first.get("readAttempt") or {}).get("error", {}).get("sqlite_errorcode") == 5,
                    "firstCaseErrorWhileWriterHeld": first.get("writerStillHeldAtError") is True,
                    "firstCaseFtsConfigRead": first.get("ftsConfigReadInAttemptTrace") is True,
                    "allControlsCommitted": all((c.get("readAttempt") or {}).get("status") == "committed" for c in controls),
                    "allControlsReturnedAfterWriterCommit": all((c.get("readAttempt") or {}).get("finishedAtMs", -1) >= c.get("writerCommittedAtMs", float("inf")) for c in controls),
                    "noHarnessOrWriterErrors": all(c["caseError"] is None and c["writerError"] is None and not c.get("writerThreadAliveAtClose", False) for c in report["cases"])
                }
                if not report["observedPattern"]["noHarnessOrWriterErrors"] or BLOCKED:
                    report["status"] = "HARNESS_FAILURE"
                elif all(report["observedPattern"].values()):
                    report["status"] = "ISSUE_PATTERN_OBSERVED_ON_LOCAL_RUNTIME"
                else:
                    report["status"] = "ISSUE_PATTERN_NOT_FULLY_REPRODUCED_ON_LOCAL_RUNTIME"
    except BaseException as exc:
        report["status"] = "HARNESS_FAILURE"
        report["fatalError"] = error_record(exc)
        report["fatalTraceback"] = traceback.format_exc()
    finally:
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report["elapsedMs"] = now_ms()
        report["exitCode"] = EXIT_CODES[report["status"]]
        if root is not None:
            try:
                # Fresh directory plus exclusive creation preserves every prior report.
                with (root / "result.json").open("x", encoding="utf-8") as output:
                    output.write(json.dumps(report, indent=2) + "\n")
                print(json.dumps({"status": report["status"], "exitCode": report["exitCode"],
                                  "cases": report["caseInvocations"], "result": str(root / "result.json")}, indent=2))
            except OSError as exc:
                report["status"] = "HARNESS_FAILURE"
                report["exitCode"] = EXIT_CODES[report["status"]]
                report["reportWriteError"] = error_record(exc)
                print(json.dumps(report, indent=2), file=sys.stderr)
        else:
            # If cwd is not writable, preserve the failure on stderr without claiming a saved file.
            print(json.dumps(report, indent=2), file=sys.stderr)
    return report["exitCode"]


if __name__ == "__main__":
    raise SystemExit(main())
