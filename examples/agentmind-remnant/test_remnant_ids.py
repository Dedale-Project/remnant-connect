"""Canonical input-ID boundaries through AgentMind's native read-only tool.

Synthetic HTTP fixtures only. Use the pinned AgentMind PYTHONPATH from README.
No model, live service, credentials or external network is required.
"""
import json
import socket
import unittest
from unittest.mock import patch

import httpx
import remnant_read


class MemoryIdTests(unittest.IsolatedAsyncioTestCase):
    async def test_canonical_id_range_and_invalid_boundaries_through_native_tool(self):
        original_client = httpx.AsyncClient
        original_connect = socket.socket.connect
        original_connect_ex = socket.socket.connect_ex
        original_getaddrinfo = socket.getaddrinfo
        external_attempts = []

        def socket_guard(original):
            def guarded(sock, address):
                # Windows asyncio may use loopback for its internal socketpair.
                if isinstance(address, tuple) and address[0] in ("127.0.0.1", "::1"):
                    return original(sock, address)
                external_attempts.append("connect")
                raise AssertionError("External sockets are forbidden")
            return guarded

        def dns_guard(host, *args, **kwargs):
            if host in ("127.0.0.1", "::1"):
                return original_getaddrinfo(host, *args, **kwargs)
            external_attempts.append("dns")
            raise AssertionError("External DNS is forbidden")

        valid = [(f"valid-{length}", "mem_" + "a" * length, True)
                 for length in range(16, 33)]
        invalid = [
            ("short-15", "mem_" + "a" * 15, False),
            ("long-33", "mem_" + "a" * 33, False),
            ("nonhex", "mem_" + "g" * 32, False),
            ("uppercase", "mem_" + "A" * 16, False),
            ("newline", "mem_" + "a" * 16 + "\n", False),
            ("path", "mem_" + "a" * 16 + "/content", False),
            ("query", "mem_" + "a" * 16 + "?view=public", False),
        ]

        with patch.object(socket.socket, "connect", socket_guard(original_connect)), \
             patch.object(socket.socket, "connect_ex", socket_guard(original_connect_ex)), \
             patch.object(socket, "getaddrinfo", dns_guard):
            for label, memory_id, expected_valid in valid + invalid:
                with self.subTest(case=label):
                    expected_url = "https://remnant.dedale-bi.com/api/public/knowledge/" + memory_id + "/content"
                    fixture = {
                        "id": memory_id,
                        "version": 7,
                        "insight": "Synthetic evidence \u2192 \u6f22\u5b57",
                        "provenance": {"selfReported": True, "origin": "synthetic-test"},
                        "conditions": ["Mock response only; no public availability established"],
                        "readingOnly": True,
                        "consumptionRecorded": False,
                    }
                    requests = []
                    clients = []

                    def handler(request):
                        requests.append({"method": request.method, "url": str(request.url)})
                        self.assertTrue(expected_valid, "Invalid ID reached transport")
                        self.assertEqual(request.method, "GET")
                        self.assertEqual(str(request.url), expected_url)
                        self.assertNotIn("authorization", request.headers)
                        self.assertNotIn("cookie", request.headers)
                        return httpx.Response(200, json=fixture)

                    def client(**kwargs):
                        clients.append(kwargs)
                        self.assertFalse(kwargs["follow_redirects"])
                        self.assertEqual(kwargs["timeout"], 10.0)
                        return original_client(**kwargs, transport=httpx.MockTransport(handler))

                    # No Agent, registry, decorator or tool implementation is replaced.
                    reader = remnant_read.build_reader()
                    self.assertIsNone(reader.llm_provider)
                    with patch.object(remnant_read.httpx, "AsyncClient", client):
                        result = await reader.execute_tool("remnant_public_experience", memory_id=memory_id)
                    output = result.get("output") or {}
                    print("ID_CASE=" + json.dumps({
                        "case": label, "expected_valid": expected_valid,
                        "success": result.get("success"), "error": result.get("error"),
                        "clients_created": len(clients), "mock_gets": len(requests),
                        "native_tool_calls": reader.performance_metrics["tool_calls"],
                        "evidence_preserved": output.get("evidence") == fixture,
                        "source_url_preserved": output.get("source_url") == expected_url,
                        "external_socket_or_dns_attempts": len(external_attempts),
                    }))
                    self.assertEqual(reader.performance_metrics["tool_calls"], 1)
                    self.assertEqual(external_attempts, [])
                    if expected_valid:
                        self.assertIs(result["success"], True, result)
                        self.assertIsNone(result["error"])
                        self.assertEqual(output["evidence"], fixture)
                        self.assertEqual(output["source_url"], expected_url)
                        self.assertEqual(len(clients), 1)
                        self.assertEqual(len(requests), 1)
                    else:
                        self.assertIs(result["success"], False, result)
                        self.assertIn("Expected", result["error"])
                        self.assertEqual(clients, [], "Reject invalid IDs before creating HTTP client")
                        self.assertEqual(requests, [])


if __name__ == "__main__":
    unittest.main()
