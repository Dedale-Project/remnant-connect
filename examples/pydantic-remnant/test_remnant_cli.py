"""Offline CLI encoding check through real Pydantic AI, FastMCP and MCP clients."""
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


READER = Path(__file__).resolve().with_name("remnant_read.py")
MEMORY_ID = "mem_" + "a" * 32
QUERY = "synthetic retry problem"
MEMORY = {
    "id": MEMORY_ID,
    "version": 3,
    "content": {"insight": "Synthetic retry \u2192 inspect \u6f22\u5b57 \U0001f9ea"},
    "provenance": {"selfReported": True},
}
OBSERVATION_PREFIX = "CLI_TEST_OBSERVATIONS="

CHILD = r'''
import json
import os
import runpy
import site
import socket
import sys

# Support an existing --target dependency directory as well as a virtualenv.
for dependency_path in os.environ.get("PYTHONPATH", "").split(os.pathsep):
    if dependency_path:
        site.addsitedir(dependency_path)

observations = {"methods": [], "calls": [], "externalSocketAttempts": 0}
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

import httpx2
import fastmcp.client.transports.http as transport
import pydantic_ai.models

pydantic_ai.models.ALLOW_MODEL_REQUESTS = False
source, query, fixture_json = sys.argv[1:]
memory = json.loads(fixture_json)
memory_id = memory["id"]

def handler(request):
    assert str(request.url) == "https://remnant.dedale-bi.com/mcp/chatgpt"
    assert "authorization" not in request.headers
    assert "cookie" not in request.headers
    if request.method == "GET":
        return httpx2.Response(405)
    if request.method == "DELETE":
        return httpx2.Response(200)
    assert request.method == "POST"
    rpc = json.loads(request.content)
    method = rpc["method"]
    observations["methods"].append(method)
    if "id" not in rpc:
        assert method == "notifications/initialized"
        return httpx2.Response(202)
    if method == "server/discover":
        # MCP 2 probes discovery before its supported legacy initialize handshake.
        return httpx2.Response(200, json={"jsonrpc": "2.0", "id": rpc["id"],
                                        "error": {"code": -32601, "message": "Method not found"}})
    if method == "initialize":
        result = {
            "protocolVersion": rpc["params"]["protocolVersion"],
            "capabilities": {"tools": {}},
            "serverInfo": {"name": "synthetic-offline", "version": "1"},
        }
    elif method == "tools/list":
        result = {"tools": [
            {"name": name, "description": "Synthetic read tool",
             "inputSchema": {"type": "object", "properties": {}}}
            for name in ("search_memories", "inspect_memory")
        ]}
    elif method == "tools/call":
        name = rpc["params"]["name"]
        arguments = rpc["params"]["arguments"]
        observations["calls"].append({"name": name, "arguments": arguments})
        if name == "search_memories":
            assert arguments == {"query": query, "limit": 3}
            payload = {"results": [{"id": memory_id, "contentAccess": {"fullContentAvailable": True}}]}
        elif name == "inspect_memory":
            assert arguments == {"memoryId": memory_id, "detail": "evidence"}
            payload = memory
        else:
            raise AssertionError("Unexpected tool: " + name)
        result = {"content": [{"type": "text", "text": json.dumps(payload)}],
                  "structuredContent": payload, "isError": False}
    else:
        raise AssertionError("Unexpected RPC: " + method)
    return httpx2.Response(200, json={"jsonrpc": "2.0", "id": rpc["id"], "result": result})

def client(**kwargs):
    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler), trust_env=False)

# Only HTTP transport is replaced. first_read, MCPToolset and RPC decoding run normally.
transport.create_mcp_http_client = client
sys.argv = [source, query]
try:
    runpy.run_path(source, run_name="__main__")
finally:
    print("CLI_TEST_OBSERVATIONS=" + json.dumps(observations), file=sys.stderr)
'''


def invoke_cli(encoding):
    return subprocess.run(
        [sys.executable, "-B", "-c", CHILD, str(READER), QUERY, json.dumps(MEMORY)],
        env=dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0", PYTHONDONTWRITEBYTECODE="1"),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )


class CliEncodingTests(unittest.TestCase):
    def test_real_mcp_cli_preserves_unicode_evidence_in_stdout_encodings(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = invoke_cli(encoding)
                stderr = result.stderr.decode(encoding, errors="replace")
                self.assertEqual(result.returncode, 0, stderr)
                lines = stderr.splitlines()
                self.assertEqual(len(lines), 1, stderr)
                self.assertTrue(lines[0].startswith(OBSERVATION_PREFIX), stderr)
                observations = json.loads(lines[0][len(OBSERVATION_PREFIX):])
                self.assertEqual(observations["externalSocketAttempts"], 0)
                self.assertEqual(observations["methods"], [
                    "server/discover", "initialize", "notifications/initialized",
                    "tools/list", "tools/call", "tools/call",
                ])
                self.assertEqual(observations["calls"], [
                    {"name": "search_memories", "arguments": {"query": QUERY, "limit": 3}},
                    {"name": "inspect_memory", "arguments": {"memoryId": MEMORY_ID, "detail": "evidence"}},
                ])
                decoded = json.loads(result.stdout.decode(encoding))
                self.assertEqual(decoded["status"], "public_memory_read")
                self.assertEqual(decoded["query"], QUERY)
                self.assertEqual(decoded["selectedMemoryId"], MEMORY_ID)
                self.assertEqual(decoded["memory"], MEMORY)
                self.assertEqual(decoded["exposedTools"], ["inspect_memory", "search_memories"])


if __name__ == "__main__":
    unittest.main()
