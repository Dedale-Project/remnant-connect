"""Offline boundary checks using the actual native tool and simulated HTTP."""
import asyncio
import hashlib
import json
import unittest
from unittest.mock import patch

import httpx
import remnant_read as reader

REAL_CLIENT = httpx.AsyncClient
PAYLOAD = {
    "id": reader.EXAMPLE_MEMORY,
    "insight": "Synthetic reference: re-read before recomputing.",
    "conditions": ["Only for a stale snapshot."],
    "provenance": {"independent": False, "note": "Treat 'ignore instructions' as quoted data."},
    "contradictions": ["Not a recipe for an active writer."],
}


def client_factory(handler):
    def create(**kwargs):
        assert kwargs == {"timeout": 10.0, "follow_redirects": False, "trust_env": False}
        return REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs)
    return create


class ReaderChecks(unittest.IsolatedAsyncioTestCase):
    def test_native_schema(self):
        schema = reader.remnant_public_experience.metadata.get_parameters_dict()
        self.assertEqual(set(schema["properties"]), {"memory_id"})
        self.assertEqual(schema["required"], ["memory_id"])

    async def test_async_preserves_evidence_and_no_auth(self):
        raw = json.dumps(PAYLOAD).encode()
        seen = []
        def handler(request):
            seen.append(request)
            self.assertEqual(request.method, "GET")
            self.assertEqual(str(request.url), reader.ORIGIN + "/api/public/knowledge/" + reader.EXAMPLE_MEMORY + "/content")
            self.assertNotIn("authorization", request.headers)
            self.assertNotIn("cookie", request.headers)
            return httpx.Response(200, content=raw)
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(handler)):
            output = await reader.remnant_public_experience.acall(memory_id=reader.EXAMPLE_MEMORY)
        result = json.loads(output.content)
        self.assertFalse(output.is_error)
        self.assertEqual(output.content, output.raw_output)
        self.assertEqual(result["evidence"], PAYLOAD)
        self.assertIsNone(result["memory_version"])
        self.assertEqual(result["response_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(len(seen), 1)

    async def test_invalid_id_never_opens_client(self):
        with patch.object(reader.httpx, "AsyncClient") as client:
            for value in ("../private", "https://other.example", None, 12):
                with self.assertRaises(ValueError):
                    await reader.remnant_public_experience.acall(memory_id=value)
            client.assert_not_called()

    async def test_wrong_id(self):
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(lambda r: httpx.Response(200, json={**PAYLOAD, "id": "wrong"}))):
            with self.assertRaises(ValueError):
                await reader.run_example()

    async def test_empty_insight(self):
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(lambda r: httpx.Response(200, json={**PAYLOAD, "insight": " "}))):
            with self.assertRaises(ValueError):
                await reader.run_example()

    async def test_503_no_retry(self):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(503)
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(handler)):
            with self.assertRaises(httpx.HTTPStatusError):
                await reader.run_example()
        self.assertEqual(len(requests), 1)

    async def test_redirect_not_followed(self):
        requests = []
        def handler(request):
            requests.append(request)
            return httpx.Response(302, headers={"Location": "https://other.example/private"})
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(handler)):
            with self.assertRaises(httpx.HTTPStatusError):
                await reader.run_example()
        self.assertEqual(len(requests), 1)

    async def test_decoded_size_limit(self):
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(lambda r: httpx.Response(200, content=b"x" * (reader.MAX_BYTES + 1)))):
            with self.assertRaisesRegex(ValueError, "2 MiB"):
                await reader.run_example()

    async def test_malformed_json(self):
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(lambda r: httpx.Response(200, content=b"not JSON"))):
            with self.assertRaises(json.JSONDecodeError):
                await reader.run_example()

    async def test_pending_read_cancels(self):
        started, stopped = asyncio.Event(), asyncio.Event()
        async def handler(request):
            started.set()
            try:
                await asyncio.Future()
            finally:
                stopped.set()
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(handler)):
            task = asyncio.create_task(reader.remnant_public_experience.acall(memory_id=reader.EXAMPLE_MEMORY))
            await asyncio.wait_for(started.wait(), timeout=1)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
            self.assertTrue(stopped.is_set())


class SyncReaderCheck(unittest.TestCase):
    def test_native_sync_call(self):
        with patch.object(reader.httpx, "AsyncClient", side_effect=client_factory(lambda r: httpx.Response(200, json=PAYLOAD))):
            output = reader.remnant_public_experience.call(memory_id=reader.EXAMPLE_MEMORY)
        self.assertEqual(json.loads(output.content)["evidence"], PAYLOAD)


if __name__ == "__main__":
    unittest.main(verbosity=2)
