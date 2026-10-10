"""Offline CLI encoding/error checks in real child processes."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent
FIXTURE = {
    "mode": "read-only",
    "search": {"candidate_ids": ["mem_" + "1" * 16]},
    "inspection": {
        "payload": {"version": 3, "insight": "Retry \u2192 inspect \u6f22\u5b57 \U0001f9ea"},
        "mcp_result_sha256": "a" * 64,
    },
    "actual_use": False, "feedback_recorded": False, "contribution_recorded": False,
}

CHILD = r'''
import json
import socket
import sys
root, mode, fixture_json = sys.argv[1:]
sys.path.insert(0, root)
original_connect, original_connect_ex = socket.socket.connect, socket.socket.connect_ex
def guard(original):
    def connect(self, address):
        if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
            return original(self, address)
        raise AssertionError("External network forbidden")
    return connect
socket.socket.connect = guard(original_connect)
socket.socket.connect_ex = guard(original_connect_ex)
import remnant_agno as app
async def local_result(*args, **kwargs):
    if mode == "error":
        raise app.ReadBoundaryError("synthetic-private-details-must-not-be-printed")
    if mode == "selection":
        raise app.SelectedMemoryNotReturned("synthetic-private-details-must-not-be-printed")
    return json.loads(fixture_json)
app.run_example = local_result
sys.argv = ["remnant_agno.py", "synthetic offline problem"]
raise SystemExit(app.main())
'''

class CliTests(unittest.TestCase):
    def run_cli(self, encoding, mode="success"):
        return subprocess.run(
            [sys.executable, "-c", CHILD, str(ROOT), mode, json.dumps(FIXTURE)],
            env=dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0"),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
        )

    def test_unicode_and_existing_hash_survive_real_stdout_encodings(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = self.run_cli(encoding)
                self.assertEqual(result.returncode, 0, result.stderr.decode(encoding, errors="replace"))
                self.assertEqual(result.stderr, b"")
                self.assertEqual(json.loads(result.stdout.decode(encoding)), FIXTURE)

    def test_failed_read_is_not_an_empty_success_and_does_not_expose_error_body(self):
        result = self.run_cli("ascii", "error")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"Read failed (ReadBoundaryError)", result.stderr)
        self.assertNotIn(b"synthetic-private-details", result.stderr)

    def test_selection_error_is_actionable_without_echoing_server_content(self):
        result = self.run_cli("ascii", "selection")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"Choose a returned candidate; no fallback was used", result.stderr)
        self.assertNotIn(b"synthetic-private-details", result.stderr)

if __name__ == "__main__":
    unittest.main()
