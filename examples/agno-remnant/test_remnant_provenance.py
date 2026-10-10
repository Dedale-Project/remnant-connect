"""Synthetic search provenance checks; no tester reports or remote calls."""
import copy
import io
from contextlib import asynccontextmanager, redirect_stderr, redirect_stdout
import unittest
from unittest.mock import patch

import remnant_agno as app
from test_remnant_agno import (
    FakeSession, FIRST, INSPECT, SEARCH, SECOND, setUpModule, tearDownModule, tool_result,
)


QUERY = "synthetic technical problem"
CHANGED_SEARCH = {
    "results": [{"id": SECOND, "title": "Synthetic changed search", "version": 3}],
    "truncated": False,
}
MISSING_SEARCH = {"results": [{"id": FIRST}], "truncated": False}


def result_hash(payload):
    return app.unpack_result(tool_result(payload))["mcp_result_sha256"]


class SearchProvenanceTests(unittest.IsolatedAsyncioTestCase):
    async def test_inspection_links_current_search_not_an_earlier_run(self):
        earlier_toolkit = app.RemnantReadTools(FakeSession())
        earlier = await app.invoke_tool(earlier_toolkit, "search_memories", {"query": QUERY})
        current_session = FakeSession(search=CHANGED_SEARCH)
        current_toolkit = app.RemnantReadTools(current_session)
        current = await app.invoke_tool(current_toolkit, "search_memories", {"query": QUERY})
        inspection = await app.invoke_tool(current_toolkit, "inspect_memory", {"memory_id": SECOND})
        self.assertNotEqual(current["mcp_result_sha256"], earlier["mcp_result_sha256"])
        self.assertEqual(inspection["search_mcp_result_sha256"], current["mcp_result_sha256"])
        self.assertEqual(inspection["mcp_result_sha256"], result_hash(INSPECT))
        self.assertEqual(inspection["payload"], INSPECT)
        self.assertEqual([call[0] for call in current_session.calls], ["search_memories", "inspect_memory"])

    async def test_caller_editing_returned_metadata_does_not_change_inspection_provenance(self):
        toolkit = app.RemnantReadTools(FakeSession(search=copy.deepcopy(SEARCH)))
        search = await app.invoke_tool(toolkit, "search_memories", {"query": QUERY})
        expected = search["mcp_result_sha256"]
        search["mcp_result_sha256"] = "0" * 64
        inspection = await app.invoke_tool(toolkit, "inspect_memory", {"memory_id": SECOND})
        self.assertEqual(inspection["search_mcp_result_sha256"], expected)

    async def test_refused_selection_retains_actual_search_hash_after_cleanup(self):
        session = FakeSession(search=MISSING_SEARCH)
        closed = []

        @asynccontextmanager
        async def local_session():
            try:
                yield session
            finally:
                closed.append(True)

        with patch.object(app, "anonymous_session", local_session):
            with self.assertRaises(app.SelectedMemoryNotReturned) as caught:
                await app.run_example(QUERY, SECOND)
        self.assertEqual(caught.exception.search_mcp_result_sha256, result_hash(MISSING_SEARCH))
        self.assertNotEqual(caught.exception.search_mcp_result_sha256, result_hash(SEARCH))
        self.assertEqual([call[0] for call in session.calls], ["search_memories"])
        self.assertEqual(closed, [True])


class CliProvenanceTests(unittest.TestCase):
    def test_refusal_cli_exposes_only_current_search_hash_with_existing_error(self):
        session = FakeSession(search=MISSING_SEARCH)

        @asynccontextmanager
        async def local_session():
            yield session

        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(app, "anonymous_session", local_session), \
             patch.object(app.sys, "argv", ["remnant_agno.py", QUERY, "--inspect", SECOND]), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            code = app.main()
        self.assertEqual(code, 1)
        self.assertEqual(stdout.getvalue(), "")
        self.assertIn("Choose a returned candidate; no fallback was used.", stderr.getvalue())
        self.assertIn("search_mcp_result_sha256=" + result_hash(MISSING_SEARCH), stderr.getvalue())
        self.assertNotIn(result_hash(SEARCH), stderr.getvalue())
        self.assertEqual([call[0] for call in session.calls], ["search_memories"])


if __name__ == "__main__":
    unittest.main()
