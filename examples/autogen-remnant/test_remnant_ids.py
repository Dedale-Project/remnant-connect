"""Offline ID compatibility checks through the real AutoGen FunctionTool."""
import hashlib
import json
import socket
import unittest
from unittest.mock import patch

import httpx
from autogen_core import CancellationToken

import remnant_read as reader


LEGACY_ID = "mem_" + "a" * 16
CURRENT_ID = "mem_" + "b" * 32
CLIENT_TYPE = httpx.AsyncClient


class MemoryIdTests(unittest.IsolatedAsyncioTestCase):
    async def invoke(self, memory_id, *, payload=None, status=200):
        self.calls = []
        if payload is None:
            payload = {
                "id": memory_id,
                "version": 3,
                "insight": "Synthetic reference data; no real task outcome.",
                "provenance": {"selfReported": True},
                "contradictions": ["Synthetic counterexample"],
            }
        raw = json.dumps(payload).encode("utf-8")

        def handler(request):
            self.calls.append(request)
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.url.host, "remnant.dedale-bi.com")
            self.assertEqual(request.url.path, f"/api/public/knowledge/{memory_id}/content")
            self.assertNotIn("authorization", request.headers)
            self.assertNotIn("cookie", request.headers)
            return httpx.Response(status, content=raw)

        def client(**kwargs):
            self.assertFalse(kwargs["trust_env"])
            self.assertFalse(kwargs["follow_redirects"])
            return CLIENT_TYPE(**kwargs, transport=httpx.MockTransport(handler))

        # The event loop already exists here. No socket connection is needed.
        with patch.object(reader.httpx, "AsyncClient", client), \
             patch.object(socket.socket, "connect", side_effect=AssertionError("Network forbidden")), \
             patch.object(socket.socket, "connect_ex", side_effect=AssertionError("Network forbidden")):
            result = await reader.remnant_public_experience.run_json(
                {"memory_id": memory_id}, CancellationToken(),
            )
        return result, payload, raw

    async def test_canonical_ids_reach_native_tool_and_preserve_evidence(self):
        for memory_id in (LEGACY_ID, "mem_" + "c" * 24, CURRENT_ID):
            with self.subTest(memory_id=memory_id):
                result, payload, raw = await self.invoke(memory_id)
                self.assertEqual(len(self.calls), 1)
                self.assertEqual(result["evidence"], payload)
                self.assertEqual(result["memory_version"], 3)
                self.assertEqual(result["response_sha256"], hashlib.sha256(raw).hexdigest())

    async def test_invalid_ids_fail_before_transport(self):
        for memory_id in (
            "mem_" + "a" * 15, "mem_" + "a" * 33, "mem_" + "A" * 16,
            "memory_" + "a" * 16, LEGACY_ID + "/content", LEGACY_ID + "?public=true",
            LEGACY_ID + "\n", "https://example.invalid/" + LEGACY_ID,
        ):
            with self.subTest(memory_id=memory_id):
                with self.assertRaises(ValueError):
                    await self.invoke(memory_id)
                self.assertEqual(self.calls, [])

    async def test_legacy_id_does_not_accept_a_different_response(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            await self.invoke(LEGACY_ID, payload={"id": CURRENT_ID, "insight": "Synthetic mismatch"})
        self.assertEqual(len(self.calls), 1)

    async def test_canonical_shape_does_not_bypass_public_access(self):
        with self.assertRaises(httpx.HTTPStatusError):
            await self.invoke(LEGACY_ID, payload={"error": "Not found"}, status=404)
        self.assertEqual(len(self.calls), 1)


if __name__ == "__main__":
    unittest.main()
