"""Offline CLI regressions for Unicode evidence in legacy-encoded stdout."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


EXAMPLE_DIR = Path(os.environ.get("REMNANT_EXAMPLE_DIR", Path(__file__).resolve().parent))
MEMORY_ID = "mem_7fc3ea3e99b911105453b62048248015"
INSIGHT = "SQLite recovery \u2192 retry safely \u6f22\u5b57 \U0001f9ea"
PUBLIC_PAYLOAD = {"id": MEMORY_ID, "version": 1, "insight": INSIGHT}
PUBLIC_BYTES = json.dumps(PUBLIC_PAYLOAD, ensure_ascii=False).encode("utf-8")
SOURCE_HASH = hashlib.sha256(PUBLIC_BYTES).hexdigest()
SEARCH_OUTPUT = {
    "mode": "read-only",
    "search": {"candidate_ids": [MEMORY_ID]},
    "inspection": {
        "payload": PUBLIC_PAYLOAD,
        "mcp_result_sha256": SOURCE_HASH,
        "hash_note": "Synthetic fixture marker; not a server response or independent evidence.",
    },
    "actual_use": False,
    "feedback_recorded": False,
    "contribution_recorded": False,
}

# The child process is required: TextIO encoding differs from StringIO and must
# exercise the scripts' actual print statements. Only Windows asyncio's local
# socketpair wakeup may connect; all external socket connections are forbidden.
CHILD = r'''
import json
import runpy
import socket
import sys
from unittest.mock import patch

example_dir, mode, fixture_json = sys.argv[1:]
sys.path.insert(0, example_dir)
fixture = json.loads(fixture_json)
original_connect = socket.socket.connect
original_connect_ex = socket.socket.connect_ex

def guarded_connect(self, address):
    if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
        return original_connect(self, address)
    raise AssertionError("External network forbidden in offline CLI test")

def guarded_connect_ex(self, address):
    if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
        return original_connect_ex(self, address)
    raise AssertionError("External network forbidden in offline CLI test")

socket.socket.connect = guarded_connect
socket.socket.connect_ex = guarded_connect_ex

if mode == "search":
    import remnant_search as app

    async def local_result(*args, **kwargs):
        return fixture

    app.run_example = local_result
    sys.argv = ["remnant_search.py", "synthetic offline CLI problem"]
    raise SystemExit(app.main())

if mode == "public-read":
    import httpx

    raw = json.dumps(fixture, ensure_ascii=False).encode("utf-8")
    requests = []

    def handler(request):
        requests.append(request)
        assert request.method == "GET"
        assert str(request.url) == "https://remnant.dedale-bi.com/api/public/knowledge/" + fixture["id"] + "/content"
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        return httpx.Response(200, content=raw, headers={"content-type": "application/json"})

    original_client = httpx.Client

    def local_client(**kwargs):
        return original_client(transport=httpx.MockTransport(handler), **kwargs)

    sys.argv = ["remnant_read.py", fixture["id"]]
    with patch.object(httpx, "Client", side_effect=local_client):
        runpy.run_module("remnant_read", run_name="__main__")
    assert len(requests) == 1
else:
    raise AssertionError("Unknown synthetic fixture mode")
'''


class CliEncodingTests(unittest.TestCase):
    def invoke(self, mode, encoding, fixture):
        env = dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0")
        process = subprocess.run(
            [sys.executable, "-c", CHILD, str(EXAMPLE_DIR), mode, json.dumps(fixture)],
            env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20,
        )
        stderr = process.stderr.decode(encoding, errors="replace")
        self.assertEqual(process.returncode, 0, stderr)
        self.assertEqual(stderr, "")
        return json.loads(process.stdout.decode(encoding))

    def test_search_cli_preserves_unicode_payload_and_hash(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = self.invoke("search", encoding, SEARCH_OUTPUT)
                self.assertEqual(result, SEARCH_OUTPUT)

    def test_public_reader_cli_preserves_unicode_evidence_and_source_hash(self):
        for encoding in ("cp1252", "ascii", "utf-8"):
            with self.subTest(encoding=encoding):
                result = self.invoke("public-read", encoding, PUBLIC_PAYLOAD)
                self.assertEqual(result["evidence"], PUBLIC_PAYLOAD)
                self.assertEqual(result["memory_version"], 1)
                self.assertEqual(result["response_sha256"], SOURCE_HASH)
                self.assertEqual(result["public_url"], "https://remnant.dedale-bi.com/knowledge/" + MEMORY_ID)


if __name__ == "__main__":
    unittest.main()
