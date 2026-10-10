"""Offline CLI encoding regression through AgentMind's actual native tool path.

Use the pinned AgentMind source on PYTHONPATH as documented in README.md.
No model, running MCP server, credentials, or remote request is needed.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


READER = Path(__file__).resolve().with_name("remnant_read.py")
MEMORY_ID = "mem_7fc3ea3e99b911105453b62048248015"
FIXTURE = {
    "id": MEMORY_ID,
    "version": 3,
    "title": "Synthetic CLI evidence only",
    "insight": "Inspect \u2192 \u6f22\u5b57 \U0001f9ea",
    "conditions": ["Local HTTP fixture, not the actual public memory"],
    "provenance": {"type": "agent_generated", "selfReported": True},
    "readingOnly": True,
    "consumptionRecorded": False,
}
PREFIX = "CLI_TEST_OBSERVATIONS="

CHILD = r'''
import json
import runpy
import socket
import sys

observed = {"mockGets": 0, "nativeCalls": 0, "nativeSuccesses": 0,
            "externalSocketAttempts": 0}
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex

def guard(original):
    def guarded(self, address):
        # Windows asyncio can use loopback sockets for its internal socketpair.
        if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
            return original(self, address)
        observed["externalSocketAttempts"] += 1
        raise AssertionError("External network forbidden in CLI test")
    return guarded

socket.socket.connect = guard(original_connect)
socket.socket.connect_ex = guard(original_connect_ex)

import httpx
from agentmind import Agent

source, fixture_json = sys.argv[1:]
fixture = json.loads(fixture_json)
original_client = httpx.AsyncClient

def handler(request):
    assert request.method == "GET"
    assert str(request.url) == "https://remnant.dedale-bi.com/api/public/knowledge/" + fixture["id"] + "/content"
    assert "authorization" not in request.headers
    assert "cookie" not in request.headers
    observed["mockGets"] += 1
    return httpx.Response(200, content=json.dumps(fixture, ensure_ascii=False).encode("utf-8"))

def client(**kwargs):
    return original_client(**kwargs, transport=httpx.MockTransport(handler))

httpx.AsyncClient = client
original_execute_tool = Agent.execute_tool

async def execute_tool(self, *args, **kwargs):
    # Observe, then call the real method. Registry/decorator/response decoding stay native.
    assert self.llm_provider is None
    observed["nativeCalls"] += 1
    result = await original_execute_tool(self, *args, **kwargs)
    if result.get("success") is True:
        assert result["output"]["evidence"] == fixture
        observed["nativeSuccesses"] += 1
    return result

Agent.execute_tool = execute_tool
sys.argv = [source]
try:
    runpy.run_path(source, run_name="__main__")
finally:
    print("CLI_TEST_OBSERVATIONS=" + json.dumps(observed), file=sys.stderr)
'''


def run_case(encoding):
    return subprocess.run(
        [sys.executable, "-B", "-c", CHILD, str(READER), json.dumps(FIXTURE)],
        env=dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0",
                 PYTHONDONTWRITEBYTECODE="1"),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
    )


class CliEncodingTests(unittest.TestCase):
    def test_actual_cli_retains_full_unicode_evidence_under_stdout_encodings(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = run_case(encoding)
                stderr = result.stderr.decode(encoding, errors="replace")
                self.assertEqual(result.returncode, 0, stderr)
                lines = stderr.splitlines()
                self.assertEqual(len(lines), 1, stderr)
                self.assertTrue(lines[0].startswith(PREFIX), stderr)
                self.assertEqual(json.loads(lines[0][len(PREFIX):]), {
                    "mockGets": 1, "nativeCalls": 1, "nativeSuccesses": 1,
                    "externalSocketAttempts": 0,
                })
                value = json.loads(result.stdout.decode(encoding))
                self.assertIs(value["success"], True)
                self.assertIsNone(value["error"])
                self.assertEqual(value["output"]["evidence"], FIXTURE)
                self.assertEqual(value["output"]["source_url"],
                    "https://remnant.dedale-bi.com/api/public/knowledge/" + MEMORY_ID + "/content")


if __name__ == "__main__":
    unittest.main()
