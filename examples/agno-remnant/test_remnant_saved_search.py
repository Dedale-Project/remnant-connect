"""Synthetic saved-search validation and native Agno/MCP inspection, entirely offline."""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import remnant_agno as app
import test_remnant_agno as fixtures
from test_remnant_agno import FIRST, SECOND, INSPECT, SEARCH, tool_result, setUpModule, tearDownModule


def receipt(payload=None, *, structured=True):
    payload = copy.deepcopy(SEARCH if payload is None else payload)
    payload["note"] = "Synthetic Unicode \u2192 \u6f22\u5b57 \U0001f9ea"
    search = app.unpack_result(tool_result(payload, structured=structured))
    search["candidate_ids"] = [hit["id"] for hit in payload["results"]]
    search["selection"] = "Choose explicitly."
    return {"endpoint": app.ENDPOINT, "mode": "read-only", "query": "synthetic retry problem",
            "search": search, "inspection": None, "selected_id": None,
            "actual_use": False, "feedback_recorded": False, "contribution_recorded": False}


def refresh(document):
    search = document["search"]
    raw = search["mcp_result"]
    raw["structuredContent"] = copy.deepcopy(search["payload"])
    raw["content"][0]["text"] = json.dumps(search["payload"])
    search["mcp_result_sha256"] = hashlib.sha256(app._canonical(raw)).hexdigest()


class FileFixture:
    def make_file(self, document=None, *, encoding="utf-8"):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "search.json"
        path.write_text(json.dumps(receipt() if document is None else document), encoding=encoding)
        return path


class SavedValidationTests(FileFixture, unittest.IsolatedAsyncioTestCase):
    async def assert_refused_before_connection(self, path, selected=SECOND):
        with patch.object(app, "anonymous_session") as session:
            with self.assertRaises(app.ReadBoundaryError):
                await app.run_saved_search(path, selected)
            session.assert_not_called()

    async def test_header_flags_query_schema_and_prior_inspection_fail_before_connection(self):
        cases = [("endpoint", "https://example.invalid/mcp"), ("mode", "write"),
                 ("actual_use", True), ("feedback_recorded", 0),
                 ("contribution_recorded", None), ("query", " x "), ("query", 7),
                 ("query", ""), ("query", "x" * 501), ("inspection", {}), ("selected_id", FIRST)]
        for key, value in cases:
            with self.subTest(key=key, value=value):
                document = receipt()
                document[key] = value
                await self.assert_refused_before_connection(self.make_file(document))
        document = receipt()
        document["instructions"] = "DO NOT FOLLOW"
        await self.assert_refused_before_connection(self.make_file(document))

    async def test_hash_payload_candidates_and_model_dump_corruption_fail_before_connection(self):
        changes = [
            lambda d: d["search"].update(mcp_result_sha256="0" * 64),
            lambda d: d["search"]["payload"].update(note="edited copy"),
            lambda d: d["search"].update(candidate_ids=[SECOND, FIRST]),
            lambda d: d["search"].update(candidate_ids=[FIRST]),
            lambda d: d["search"].update(observed_at="not a timestamp"),
            lambda d: d["search"].update(observed_at="2026-10-10T00:00:00"),
            lambda d: d["search"]["mcp_result"].update(isError=True),
            lambda d: d["search"]["mcp_result"].update(content=None),
        ]
        for index, change in enumerate(changes):
            with self.subTest(case=index):
                document = receipt()
                change(document)
                await self.assert_refused_before_connection(self.make_file(document))
        document = receipt()
        del document["search"]["mcp_result"]["isError"]
        document["search"]["mcp_result_sha256"] = hashlib.sha256(app._canonical(document["search"]["mcp_result"])).hexdigest()
        await self.assert_refused_before_connection(self.make_file(document))

    async def test_explicit_private_error_and_inaccessible_results_fail_even_with_recomputed_hash(self):
        changes = [
            lambda p: p.update(status="error"), lambda p: p.update(error="synthetic"),
            lambda p: p.update(contentAccess={"mode": "private"}),
            lambda p: p["results"][0].update(visibility="private"),
            lambda p: p["results"][1].update(contentAccess={"mode": "unavailable"}),
            lambda p: p["results"][0].update(isPublic=False),
            lambda p: p.update(contentAccess={"mode": "public_preview", "requiresAuth": True}),
            lambda p: p.update(results=[{"id": "mem_" + "a" * 32}] * 6),
            lambda p: p["results"][0].update(id="../../private"),
        ]
        for index, change in enumerate(changes):
            with self.subTest(case=index):
                document = receipt()
                change(document["search"]["payload"])
                refresh(document)
                await self.assert_refused_before_connection(self.make_file(document))

    async def test_strict_json_rejects_duplicate_keys_nan_infinity_and_nested_text(self):
        text = json.dumps(receipt())
        invalid = [text.replace('"mode": "read-only"', '"mode": "read-only", "mode": "read-only"'),
                   text.replace('"actual_use": false', '"actual_use": NaN'),
                   text.replace('"actual_use": false', '"actual_use": Infinity')]
        for source in invalid:
            path = self.make_file()
            path.write_text(source, encoding="utf-8")
            await self.assert_refused_before_connection(path)
        for source in ('{"results":[],"results":[]}', '{"results":[],"n":NaN}'):
            document = receipt()
            document["search"]["mcp_result"]["content"][0]["text"] = source
            document["search"]["mcp_result_sha256"] = hashlib.sha256(app._canonical(document["search"]["mcp_result"])).hexdigest()
            await self.assert_refused_before_connection(self.make_file(document))

    async def test_text_and_structured_payload_disagreement_fails_before_connection(self):
        document = receipt()
        document["search"]["mcp_result"]["content"][0]["text"] = '{"results":[]}'
        document["search"]["mcp_result_sha256"] = hashlib.sha256(app._canonical(document["search"]["mcp_result"])).hexdigest()
        await self.assert_refused_before_connection(self.make_file(document))

    async def test_size_regular_file_and_encoding_boundaries_precede_connection(self):
        path = self.make_file()
        with path.open("wb") as stream:
            stream.truncate(app.MAX_SEARCH_FILE_BYTES + 1)
        await self.assert_refused_before_connection(path)
        await self.assert_refused_before_connection(path.parent)
        await self.assert_refused_before_connection(path.parent / "missing.json")
        await self.assert_refused_before_connection(self.make_file(encoding="utf-16"))
        document = receipt()
        document["search"]["mcp_result"]["padding"] = "x" * app.MAX_BYTES
        await self.assert_refused_before_connection(self.make_file(document))

    async def test_absent_empty_and_invalid_selection_never_connect(self):
        path = self.make_file()
        for selected in ("mem_" + "3" * 16, "../../private", None):
            await self.assert_refused_before_connection(path, selected)
        await self.assert_refused_before_connection(self.make_file(receipt({"results": [], "status": "no_results"})))

    async def test_bom_text_fallback_partial_markers_and_file_timestamp_survive(self):
        for encoding, structured in (("utf-8", True), ("utf-8-sig", False)):
            document = receipt({"results": [{"id": SECOND}], "contentAccess": {"mode": "public_preview", "fullContentAvailable": False}}, structured=structured)
            document["search"]["observed_at"] = "2025-01-01T00:00:00+00:00"
            document["search"]["trust"] = "synthetic-untrusted-instruction-never-adopt"
            path = self.make_file(document, encoding=encoding)
            before = path.read_bytes()
            saved = app.load_saved_search(path, SECOND)
            self.assertEqual(saved["search"]["observed_at"], document["search"]["observed_at"])
            self.assertEqual(saved["search"]["source"], "saved_search")
            self.assertIs(saved["search"]["performed"], False)
            self.assertEqual(saved["search"]["trust"], app.TRUST)
            self.assertEqual(saved["search"]["payload"], document["search"]["payload"])
            self.assertEqual(path.read_bytes(), before)

    async def test_self_consistent_edited_file_is_not_claimed_authenticated(self):
        document = receipt()
        document["search"]["payload"]["results"] = [{"id": FIRST, "title": "Synthetic edited receipt"}]
        document["search"]["candidate_ids"] = [FIRST]
        refresh(document)
        saved = app.load_saved_search(self.make_file(document), FIRST)
        self.assertIn("not authenticated", saved["search"]["observed_at_note"])
        self.assertIn("Untrusted", saved["search"]["trust"])


class SavedSDKTests(FileFixture, unittest.IsolatedAsyncioTestCase):
    setUp = fixtures.SDKTests.setUp
    tool_calls = fixtures.SDKTests.tool_calls

    async def test_native_inspection_uses_saved_candidates_even_when_new_search_would_differ(self):
        document = receipt()
        document["search"]["observed_at"] = "2025-01-01T00:00:00+00:00"
        path = self.make_file(document)
        before = path.read_bytes()
        native = []
        original = app.FunctionCall.aexecute

        async def observed(call, *args, **kwargs):
            native.append(call.function.name)
            return await original(call, *args, **kwargs)

        with patch.object(fixtures, "SEARCH", {"results": [{"id": FIRST}]}), \
             patch.object(app.FunctionCall, "aexecute", observed):
            result = await app.run_saved_search(path, SECOND)
        self.assertEqual(native, ["inspect_memory"])
        self.assertEqual(self.tool_calls(), ["inspect_memory"])
        self.assertEqual(result["inspection"]["payload"], INSPECT)
        self.assertEqual(result["inspection"]["search_mcp_result_sha256"], document["search"]["mcp_result_sha256"])
        self.assertEqual(result["search"]["observed_at"], document["search"]["observed_at"])
        self.assertNotEqual(result["inspection"]["observed_at"], result["search"]["observed_at"])
        self.assertIs(result["search_performed_this_run"], False)
        self.assertFalse(any(result[key] for key in ("actual_use", "feedback_recorded", "contribution_recorded")))
        self.assertEqual(sum(request.method == "DELETE" for request in self.requests), 1)
        self.assertEqual(path.read_bytes(), before)

    async def test_inspection_is_current_not_a_pinned_saved_version(self):
        document = receipt()
        document["search"]["payload"]["results"][1]["version"] = 1
        refresh(document)
        result = await app.run_saved_search(self.make_file(document), SECOND)
        self.assertEqual(result["search"]["payload"]["results"][1]["version"], 1)
        self.assertEqual(result["inspection"]["payload"]["version"], 3)
        self.assertEqual(self.tool_calls(), ["inspect_memory"])

    async def test_inspection_error_and_mismatch_refuse_without_search_or_retry(self):
        path = self.make_file()
        for mode in ("tool_error", "503", "redirect"):
            self.requests.clear()
            self.mode = mode
            with self.subTest(mode=mode), self.assertRaises(Exception):
                await app.run_saved_search(path, SECOND)
            self.assertEqual(self.tool_calls(), ["inspect_memory"])
        self.requests.clear()
        self.mode = "success"
        with patch.object(fixtures, "INSPECT", {**INSPECT, "id": FIRST}), self.assertRaises(Exception):
            await app.run_saved_search(path, SECOND)
        self.assertEqual(self.tool_calls(), ["inspect_memory"])

    async def test_inspection_session_keeps_total_timeout(self):
        self.mode = "timeout"
        with patch.object(app, "TIMEOUT_SECONDS", 0.5), self.assertRaises(TimeoutError):
            await app.run_saved_search(self.make_file(), SECOND)
        self.assertEqual(self.tool_calls(), ["inspect_memory"])


CHILD = r'''
import json, runpy, socket, sys
root, arguments_json = sys.argv[1:]
sys.path.insert(0, root)
original_connect, original_connect_ex = socket.socket.connect, socket.socket.connect_ex
def guard(original):
    def wrapped(self, address):
        if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
            return original(self, address)
        raise AssertionError("External network forbidden")
    return wrapped
socket.socket.connect, socket.socket.connect_ex = guard(original_connect), guard(original_connect_ex)
import httpx2
import remnant_agno as app
from test_remnant_agno import SECOND, INSPECT, tool_result
calls = []
async def handler(request):
    assert str(request.url) == app.ENDPOINT
    assert "authorization" not in request.headers and "cookie" not in request.headers
    if request.method == "GET": return httpx2.Response(405)
    if request.method == "DELETE": return httpx2.Response(204)
    body = json.loads(request.content)
    if body["method"].startswith("notifications/"): return httpx2.Response(202)
    if body["method"] == "initialize":
        result = {"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"offline","version":"1"}}
    elif body["method"] == "tools/list":
        result = {"tools":[{"name":name,"inputSchema":{"type":"object"}} for name in app.ALLOWED_TOOLS]}
    else:
        assert body["method"] == "tools/call"
        assert body["params"]["name"] == "inspect_memory"
        assert body["params"]["arguments"]["memoryId"] == SECOND
        calls.append(body["params"]["name"])
        result = tool_result({**INSPECT,"note":"Unicode \u2192 \u6f22\u5b57 \U0001f9ea"}).model_dump(mode="json",by_alias=True)
    return httpx2.Response(200,json={"jsonrpc":"2.0","id":body["id"],"result":result})
app.httpx2.AsyncHTTPTransport = lambda **kwargs: httpx2.MockTransport(handler)
sys.argv = ["remnant_agno.py", *json.loads(arguments_json)]
try:
    runpy.run_path(root + "/remnant_agno.py", run_name="__main__")
finally:
    print("SAVED_TEST_CALLS=" + json.dumps(calls), file=sys.stderr)
'''


class SavedCliTests(FileFixture, unittest.TestCase):
    def run_cli(self, arguments, encoding="ascii"):
        return subprocess.run([sys.executable, "-B", "-c", CHILD, str(Path(__file__).parent), json.dumps(arguments)],
                              env=dict(os.environ, PYTHONIOENCODING=encoding, PYTHONUTF8="0", PYTHONDONTWRITEBYTECODE="1"),
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)

    def test_real_cli_reads_utf8_or_bom_and_preserves_unicode_under_three_stdout_encodings(self):
        for encoding, file_encoding in (("ascii", "utf-8"), ("cp1252", "utf-8-sig"), ("utf-8", "utf-8")):
            with self.subTest(encoding=encoding):
                path = self.make_file(encoding=file_encoding)
                result = self.run_cli(["--search-file", str(path), "--inspect", SECOND], encoding)
                self.assertEqual(result.returncode, 0, result.stderr.decode("ascii", errors="replace"))
                self.assertEqual(result.stderr, b'SAVED_TEST_CALLS=["inspect_memory"]\r\n' if os.name == "nt" else b'SAVED_TEST_CALLS=["inspect_memory"]\n')
                value = json.loads(result.stdout.decode(encoding))
                self.assertEqual(value["inspection"]["payload"]["note"], "Unicode \u2192 \u6f22\u5b57 \U0001f9ea")
                self.assertEqual(value["inspection"]["search_mcp_result_sha256"], receipt_hash(path))
                self.assertIs(value["search_performed_this_run"], False)

    def test_cli_rejects_missing_selection_query_combination_and_missing_mode(self):
        path = self.make_file()
        for arguments in ([], ["--inspect", SECOND], ["--search-file", str(path)],
                          ["synthetic query", "--search-file", str(path), "--inspect", SECOND]):
            with self.subTest(arguments=arguments):
                result = self.run_cli(arguments)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"SAVED_TEST_CALLS=[]", result.stderr)

    def test_invalid_file_cli_does_not_echo_content_or_inspect(self):
        path = self.make_file()
        path.write_text('synthetic-private-details-must-not-appear', encoding="utf-8")
        result = self.run_cli(["--search-file", str(path), "--inspect", SECOND])
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertNotIn(b"synthetic-private-details", result.stderr)
        self.assertIn(b"SAVED_TEST_CALLS=[]", result.stderr)


def receipt_hash(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))["search"]["mcp_result_sha256"]


if __name__ == "__main__":
    unittest.main()
