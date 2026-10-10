"""Offline CLI encoding regression using real __main__ and native FunctionTool."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


READER = Path(__file__).resolve().with_name("remnant_read.py")
MEMORY_ID = "mem_" + "b" * 32
PAYLOAD = {
    "id": MEMORY_ID,
    "version": 3,
    "insight": "Synthetic retry \u2192 inspect \u6f22\u5b57 \U0001f9ea",
    "provenance": {"selfReported": True},
    "conditions": ["Synthetic fixture only"],
    "contradictions": ["No real task or useful outcome established"],
}
RAW = json.dumps(PAYLOAD, ensure_ascii=False).encode("utf-8")
OBSERVATION_PREFIX = "CLI_TEST_OBSERVATIONS="

CHILD = r'''
import json
import runpy
import socket
import sys

observations = {"mockGets": 0, "nativeCalls": 0, "nativeCompleted": 0, "externalSocketAttempts": 0}
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex

def guard(original):
    def guarded(self, address):
        # Windows asyncio uses a loopback socketpair internally.
        if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
            return original(self, address)
        observations["externalSocketAttempts"] += 1
        raise AssertionError("External network forbidden in CLI tests")
    return guarded

socket.socket.connect = guard(original_connect)
socket.socket.connect_ex = guard(original_connect_ex)

import httpx
from autogen_core.tools import FunctionTool

source, fixture_json = sys.argv[1:]
payload = json.loads(fixture_json)
raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
memory_id = payload["id"]
original_client = httpx.AsyncClient

def handler(request):
    assert request.method == "GET"
    assert str(request.url) == "https://remnant.dedale-bi.com/api/public/knowledge/" + memory_id + "/content"
    assert "authorization" not in request.headers
    assert "cookie" not in request.headers
    observations["mockGets"] += 1
    return httpx.Response(200, content=raw)

def client(**kwargs):
    return original_client(**kwargs, transport=httpx.MockTransport(handler))

httpx.AsyncClient = client
original_run_json = FunctionTool.run_json

async def observed_run_json(self, *args, **kwargs):
    observations["nativeCalls"] += 1
    result = await original_run_json(self, *args, **kwargs)
    observations["nativeCompleted"] += 1
    return result

FunctionTool.run_json = observed_run_json
sys.argv = [source, memory_id]
try:
    runpy.run_path(source, run_name="__main__")
finally:
    print("CLI_TEST_OBSERVATIONS=" + json.dumps(observations), file=sys.stderr)
'''


class CliEncodingTests(unittest.TestCase):
    def test_native_cli_preserves_unicode_evidence_and_hash_in_stdout_encodings(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = subprocess.run(
                    [sys.executable, "-B", "-c", CHILD, str(READER), json.dumps(PAYLOAD)],
                    env=dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0", PYTHONDONTWRITEBYTECODE="1"),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=20,
                )
                stderr = result.stderr.decode(encoding, errors="replace")
                self.assertEqual(result.returncode, 0, stderr)
                lines = stderr.splitlines()
                self.assertEqual(len(lines), 1, stderr)
                self.assertTrue(lines[0].startswith(OBSERVATION_PREFIX), stderr)
                observations = json.loads(lines[0][len(OBSERVATION_PREFIX):])
                self.assertEqual(observations, {
                    "mockGets": 1, "nativeCalls": 1, "nativeCompleted": 1, "externalSocketAttempts": 0,
                })
                decoded = json.loads(result.stdout.decode(encoding))
                self.assertEqual(decoded["evidence"], PAYLOAD)
                self.assertEqual(decoded["memory_version"], PAYLOAD["version"])
                self.assertEqual(decoded["response_sha256"], hashlib.sha256(RAW).hexdigest())


if __name__ == "__main__":
    unittest.main()
