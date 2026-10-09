"""Offline compatibility for canonical legacy and current public memory IDs."""
import hashlib
import json
import unittest
from unittest.mock import patch

import httpx
from mcp.types import CallToolResult

import remnant_read as public_reader
import remnant_search as search_reader

LEGACY_ID = "mem_" + "a" * 16


class MemoryIdTests(unittest.TestCase):
    def test_canonical_legacy_and_current_lengths_remain_readable(self):
        original_client = httpx.Client
        for size in (16, 17, 24, 31, 32):
            memory_id = "mem_" + "a" * size
            payload = {"id": memory_id, "version": 1, "insight": "Synthetic public evidence."}
            raw = json.dumps(payload).encode("utf-8")
            requests = []

            def handler(request):
                requests.append(request)
                return httpx.Response(200, content=raw)

            with self.subTest(hex_digits=size):
                self.assertEqual(search_reader.validate_id(memory_id), memory_id)
                with patch.object(public_reader.httpx, "Client", side_effect=lambda **kw: original_client(transport=httpx.MockTransport(handler), **kw)):
                    result = public_reader.read_public_experience(memory_id)
                self.assertEqual(result["evidence"], payload)
                self.assertEqual(result["response_sha256"], hashlib.sha256(raw).hexdigest())
                self.assertEqual(len(requests), 1)
                self.assertTrue(str(requests[0].url).endswith("/" + memory_id + "/content"))

    def test_malformed_ids_still_fail_before_transport(self):
        for memory_id in ("", "mem_" + "a" * 15, "mem_" + "a" * 33, "mem_" + "A" * 16,
                          "mem_" + "g" * 16, "../" + LEGACY_ID, LEGACY_ID + "/content", LEGACY_ID + "?x=1", LEGACY_ID + "\n"):
            with self.subTest(memory_id=memory_id):
                with self.assertRaises(ValueError):
                    search_reader.validate_id(memory_id)
                with patch.object(public_reader.httpx, "Client", side_effect=AssertionError("Transport must not open")):
                    with self.assertRaises(ValueError):
                        public_reader.read_public_experience(memory_id)


class LegacyGraphTests(unittest.IsolatedAsyncioTestCase):
    async def test_returned_legacy_hit_can_be_explicitly_inspected(self):
        calls = []

        class Session:
            async def call_tool(self, name, arguments):
                calls.append((name, arguments))
                payload = {"results": [{"id": LEGACY_ID, "title": "Synthetic legacy hit"}]} if name == "search_memories" else {
                    "id": LEGACY_ID, "version": 1, "content": {"insight": "Synthetic legacy evidence."}}
                return CallToolResult(content=[{"type": "text", "text": json.dumps(payload)}], structuredContent=payload)

        graph = search_reader.build_reader(Session())
        result = await search_reader.invoke_tool(graph, "search_memories", {"query": "synthetic legacy problem"})
        self.assertEqual(result["candidate_ids"], [LEGACY_ID])
        inspected = await search_reader.invoke_tool(graph, "inspect_memory", {"memory_id": LEGACY_ID})
        self.assertEqual(inspected["payload"]["id"], LEGACY_ID)
        self.assertEqual([name for name, _ in calls], ["search_memories", "inspect_memory"])


if __name__ == "__main__":
    unittest.main()
