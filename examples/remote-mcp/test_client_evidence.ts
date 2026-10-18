import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { searchAndInspect } from "./client.ts";

// Synthetic JSON-RPC over injected fetch; Client and StreamableHTTP stay native.
test("selected SDK inspection preserves evidence or rejects mismatched identity", { timeout: 10_000 }, async (t) => {
  const outsideCalls: string[] = [];
  const blocked = (name: string) => (..._args: unknown[]) => {
    outsideCalls.push(name);
    throw new Error("Unexpected network call: " + name);
  };
  t.mock.method(globalThis, "fetch", blocked("global.fetch"));
  t.mock.method(net.Socket.prototype, "connect", blocked("net.Socket.connect"));
  t.mock.method(dns, "lookup", blocked("dns.lookup"));
  t.mock.method(http, "request", blocked("http.request"));
  t.mock.method(http, "get", blocked("http.get"));
  t.mock.method(https, "request", blocked("https.request"));
  t.mock.method(https, "get", blocked("https.get"));
  t.mock.method(tls, "connect", blocked("tls.connect"));

  const selectedId = "mem_" + "a".repeat(16);
  const query = "fixture selected evidence";
  const endpoint = "https://remnant.invalid/mcp?source=sdk";
  const evidence = {
    id: selectedId, version: 7, title: "Synthetic selected evidence",
    content: { insight: "UNTRUSTED_FIXTURE_MARKER → 漢字", conditions: ["local mock only"],
      failedApproaches: ["fixture failure"], sourceUrls: ["https://example.invalid/source"] },
    provenance: { origin: "synthetic", selfReported: true },
    contentAccess: { mode: "public_full", fullContentAvailable: true },
    unknownFutureField: { preserved: true },
  };
  const { id: _id, ...missingId } = evidence;
  const cases = [
    { name: "empty search", results: [], inspected: null, reject: false },
    { name: "exact selected ID", results: [{ id: selectedId }], inspected: evidence, reject: false },
    { name: "wrong inspected ID", results: [{ id: selectedId }], inspected: { ...evidence, id: "mem_" + "b".repeat(32) }, reject: true },
    { name: "missing inspected ID", results: [{ id: selectedId }], inspected: missingId, reject: true },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async (st) => {
      const search = { status: "results", results: fixture.results, fixtureOnly: true };
      const sessionId = "fixture-session";
      const events: string[] = [];
      const calls: { name: string; arguments: unknown }[] = [];
      const signals: AbortSignal[] = [];
      let closes = 0;
      const nativeClose = Client.prototype.close;
      st.mock.method(Client.prototype, "close", async function (...args: unknown[]) {
        closes++;
        return nativeClose.apply(this, args);
      });
      const fakeFetch: typeof fetch = async (input, init) => {
        const request = new Request(input, init);
        assert.equal(request.url, endpoint);
        assert.notEqual(request.redirect, "follow");
        assert.equal(request.headers.has("authorization"), false);
        assert.equal(request.headers.has("cookie"), false);
        if (init?.signal) signals.push(init.signal);
        if (request.method === "GET") {
          assert.equal(request.headers.get("mcp-session-id"), sessionId);
          events.push("GET:405");
          return new Response(null, { status: 405 });
        }
        if (request.method === "DELETE") {
          assert.equal(request.headers.get("mcp-session-id"), sessionId);
          events.push("DELETE");
          return new Response(null, { status: 204 });
        }
        assert.equal(request.method, "POST");
        const rpc = await request.json();
        events.push(rpc.method);
        assert.equal(rpc.jsonrpc, "2.0");
        if (rpc.method !== "initialize") {
          assert.equal(request.headers.get("mcp-session-id"), sessionId);
        }
        const reply = (result: unknown, start = false) => new Response(
          JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }),
          { headers: { "content-type": "application/json", ...(start ? { "mcp-session-id": sessionId } : {}) } }
        );
        if (rpc.method === "initialize") {
          return reply({ protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} },
            serverInfo: { name: "offline-fixture", version: "1.0.0" } }, true);
        }
        if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (rpc.method === "tools/list") {
          return reply({ tools: ["search_memories", "inspect_memory"].map(name =>
            ({ name, inputSchema: { type: "object", properties: {} } })) });
        }
        assert.equal(rpc.method, "tools/call");
        calls.push(rpc.params);
        let payload: unknown;
        if (rpc.params.name === "search_memories") {
          assert.deepEqual(rpc.params.arguments, { query, limit: 3 });
          payload = search;
        } else {
          assert.equal(rpc.params.name, "inspect_memory");
          assert.deepEqual(rpc.params.arguments, { memoryId: selectedId });
          assert.notEqual(fixture.inspected, null);
          payload = fixture.inspected;
        }
        return reply({ content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload });
      };

      let result: Awaited<ReturnType<typeof searchAndInspect>> | undefined;
      let failure: unknown;
      try {
        result = await searchAndInspect(new URL("https://remnant.invalid/mcp"), query, fakeFetch);
      } catch (error) {
        failure = error;
      }
      const inspectCalls = calls.filter(call => call.name === "inspect_memory").length;
      console.log("SDK_CASE=" + JSON.stringify({
        case: fixture.name, expectedRejected: fixture.reject, rejected: failure !== undefined,
        returnedInspectionId: result?.inspected?.id ?? null,
        fullEvidencePreserved: !!result && JSON.stringify(result.inspected) === JSON.stringify(fixture.inspected),
        error: failure instanceof Error ? failure.message : null,
        events, toolCalls: calls.map(call => call.name),
        inspectCalls, deleteCalls: events.filter(event => event === "DELETE").length,
        nativeClientCloses: closes, transportSignalsAborted: signals.every(signal => signal.aborted),
        unexpectedNetworkCalls: outsideCalls.length,
      }));
      assert.deepEqual(outsideCalls, []);
      assert.equal(events[0], "initialize");
      assert.equal(events.filter(event => event === "notifications/initialized").length, 1);
      assert.equal(events.filter(event => event === "tools/list").length, 1);
      assert.equal(events.filter(event => event === "GET:405").length, 1);
      assert.equal(events.at(-1), "DELETE");
      assert.equal(events.filter(event => event === "DELETE").length, 1);
      assert.equal(closes, 1);
      assert.ok(signals.length > 0);
      assert.ok(signals.every(signal => signal.aborted));
      assert.deepEqual(calls.map(call => call.name),
        fixture.results.length ? ["search_memories", "inspect_memory"] : ["search_memories"]);
      if (fixture.reject) {
        assert.ok(failure instanceof Error, "Incorrect inspection must not return success");
        assert.match(failure.message, /selected memory ID/);
        assert.doesNotMatch(failure.message, /UNTRUSTED_FIXTURE_MARKER/);
        assert.equal(result, undefined);
      } else {
        assert.equal(failure, undefined);
        assert.ok(result);
        assert.deepEqual(result.search, search);
        assert.deepEqual(result.inspected, fixture.inspected);
        assert.deepEqual(result.tools, ["search_memories", "inspect_memory"]);
      }
    });
  }
});
