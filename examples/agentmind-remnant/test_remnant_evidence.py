"""Selected evidence must match through AgentMind's native read-only tool.

Synthetic fixtures, real HTTPX MockTransport; no model or external service.
"""
import json
import socket
import unittest
from unittest.mock import patch

import httpx
import remnant_read


class EvidenceSelectionTests(unittest.IsolatedAsyncioTestCase):
    async def test_exact_selection_through_native_tool(self):
        memory_id = "mem_" + "a" * 16
        expected_url = (
            "https://remnant.dedale-bi.com/api/public/knowledge/"
            + memory_id + "/content"
        )
        exact = {
            "id": memory_id,
            "version": 7,
            "insight": "UNTRUSTED_FIXTURE_MARKER \u2192 \u6f22\u5b57",
            "conditions": ["Synthetic response; no live availability established"],
            "failedApproaches": [{"approach": "retry stale state", "why": "fixture"}],
            "successfulApproach": {"approach": "fresh state", "limitations": ["fixture"]},
            "provenance": {"selfReported": True, "origin": "synthetic-test"},
            "readingOnly": True,
            "consumptionRecorded": False,
        }
        missing = {key: value for key, value in exact.items() if key != "id"}
        cases = [
            ("exact-id", exact, True),
            ("wrong-id", {**exact, "id": "mem_" + "b" * 32}, False),
            ("missing-id", missing, False),
            ("non-object", [exact], False),
        ]
        original_client = httpx.AsyncClient
        original_connect = socket.socket.connect
        original_connect_ex = socket.socket.connect_ex
        original_getaddrinfo = socket.getaddrinfo
        external_attempts = []

        def socket_guard(original):
            def guarded(sock, address):
                # Literal loopback can be required by Windows asyncio socketpair.
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

        with patch.object(socket.socket, "connect", socket_guard(original_connect)), \
             patch.object(socket.socket, "connect_ex", socket_guard(original_connect_ex)), \
             patch.object(socket, "getaddrinfo", dns_guard):
            for label, payload, expected_success in cases:
                with self.subTest(case=label):
                    clients = []
                    requests = []

                    def handler(request):
                        requests.append({"method": request.method, "url": str(request.url)})
                        self.assertEqual(request.method, "GET")
                        self.assertEqual(str(request.url), expected_url)
                        self.assertNotIn("authorization", request.headers)
                        self.assertNotIn("cookie", request.headers)
                        return httpx.Response(200, json=payload)

                    def client(**kwargs):
                        clients.append(kwargs)
                        self.assertFalse(kwargs["follow_redirects"])
                        self.assertEqual(kwargs["timeout"], 10.0)
                        return original_client(**kwargs, transport=httpx.MockTransport(handler))

                    # Agent, registry, decorator, and tool implementation remain native.
                    reader = remnant_read.build_reader()
                    self.assertIsNone(reader.llm_provider)
                    with patch.object(remnant_read.httpx, "AsyncClient", client):
                        result = await reader.execute_tool(
                            "remnant_public_experience", memory_id=memory_id
                        )
                    output = result.get("output")
                    evidence_returned = isinstance(output, dict) and "evidence" in output
                    print("EVIDENCE_CASE=" + json.dumps({
                        "case": label,
                        "expected_success": expected_success,
                        "success": result.get("success"),
                        "error": result.get("error"),
                        "clients_created": len(clients),
                        "mock_gets": len(requests),
                        "native_tool_calls": reader.performance_metrics["tool_calls"],
                        "evidence_returned": evidence_returned,
                        "full_evidence_preserved": evidence_returned and output["evidence"] == payload,
                        "source_url_preserved": isinstance(output, dict) and output.get("source_url") == expected_url,
                        "external_socket_or_dns_attempts": len(external_attempts),
                    }))
                    self.assertEqual(reader.performance_metrics["tool_calls"], 1)
                    self.assertEqual(external_attempts, [])
                    self.assertEqual(len(clients), 1)
                    self.assertEqual(len(requests), 1)
                    self.assertIs(result["success"], expected_success, result)
                    if expected_success:
                        self.assertIsNone(result["error"])
                        self.assertEqual(output["evidence"], payload)
                        self.assertEqual(output["source_url"], expected_url)
                    else:
                        self.assertIsNone(output, "Rejected evidence must not escape as tool output")
                        self.assertIsInstance(result["error"], str)
                        self.assertIn("evidence", result["error"].lower())
                        self.assertNotIn("UNTRUSTED_FIXTURE_MARKER", result["error"])


if __name__ == "__main__":
    unittest.main()
