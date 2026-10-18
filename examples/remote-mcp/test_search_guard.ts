import assert from "node:assert/strict";
import test from "node:test";
import net from "node:net";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { searchAndInspect } from "./client.ts";

// Desired client contract with NO advertised outputSchema. Only fetch is simulated.
// Network tripwires start after imports; they do not certify whole-process isolation.
test("reject malformed search before inspection while preserving valid SDK evidence", { timeout: 30_000 }, async (t) => {
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

  const query = "synthetic selected search contract";
  const endpoint = "https://remnant.invalid/mcp?source=sdk";
  const opaqueId = "opaque:fixture/one";
  const marker = "UNTRUSTED_FIXTURE_MARKER → 漢字";
  const evidence = {
    id: opaqueId, version: 7, title: "Synthetic selected evidence",
    content: { insight: marker, conditions: ["local mocked transport only"],
      failedApproaches: ["synthetic prior failure"] },
    provenance: { origin: "synthetic", selfReported: true },
    contentAccess: { mode: "public_full", fullContentAvailable: true },
    unknownFutureField: { preserved: true },
  };
  type Fixture = {
    name: string;
    search: Record<string, unknown>;
    kind: "malformed" | "empty" | "valid" | "wrong_inspection_id";
  };
  const cases: Fixture[] = [
    { name: "missing-results", search: { fixtureMarker: marker }, kind: "malformed" },
    { name: "non-array-results", search: { results: { id: opaqueId }, fixtureMarker: marker }, kind: "malformed" },
    { name: "first-candidate-missing-id", search: { results: [{ title: marker }] }, kind: "malformed" },
    { name: "first-candidate-empty-id", search: { results: [{ id: "", title: marker }] }, kind: "malformed" },
    { name: "first-candidate-null", search: { results: [null], fixtureMarker: marker }, kind: "malformed" },
    { name: "first-candidate-non-string-id", search: { results: [{ id: 42, title: marker }] }, kind: "malformed" },
    { name: "invalid-first-does-not-fall-back", search: { results: [{ title: marker }, { id: opaqueId }] }, kind: "malformed" },
    { name: "valid-empty-array", search: { results: [], fixtureMarker: marker }, kind: "empty" },
    { name: "valid-opaque-id", search: { results: [{ id: opaqueId }], fixtureMarker: marker }, kind: "valid" },
    { name: "wrong-inspection-id-still-rejected", search: { results: [{ id: opaqueId }] }, kind: "wrong_inspection_id" },
  ];
  const observations: Record<string, unknown>[] = [];

  for (const fixture of cases) {
    await t.test(fixture.name, async (st) => {
      const sessionId = "synthetic-search-guard-" + fixture.name;
      const events: string[] = [];
      const calls: { name: string; arguments: unknown }[] = [];
      const signals: AbortSignal[] = [];
      let mockFetchCalls = 0;
      let closes = 0;
      const nativeClose = Client.prototype.close;
      st.mock.method(Client.prototype, "close", async function (...args: unknown[]) {
        closes++;
        return nativeClose.apply(this, args);
      });

      const fakeFetch: typeof fetch = async (input, init) => {
        mockFetchCalls++;
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
        if (rpc.method !== "initialize") assert.equal(request.headers.get("mcp-session-id"), sessionId);
        const reply = (result: unknown, start = false) => new Response(
          JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }),
          { headers: { "content-type": "application/json", ...(start ? { "mcp-session-id": sessionId } : {}) } },
        );
        if (rpc.method === "initialize") return reply({
          protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: "offline-search-guard-fixture", version: "1.0.0" },
        }, true);
        if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
        if (rpc.method === "tools/list") {
          // No output schema: the SDK cannot supply the desired semantic guard.
          return reply({ tools: ["search_memories", "inspect_memory"].map(name =>
            ({ name, inputSchema: { type: "object", properties: {} } })) });
        }
        assert.equal(rpc.method, "tools/call");
        calls.push(structuredClone(rpc.params));
        if (rpc.params.name === "search_memories") {
          assert.deepEqual(rpc.params.arguments, { query, limit: 3 });
          return reply({ content: [{ type: "text", text: JSON.stringify(fixture.search) }], structuredContent: fixture.search });
        }
        assert.equal(rpc.params.name, "inspect_memory", "No write or substitute tool is allowed");
        const first = Array.isArray(fixture.search.results) ? fixture.search.results[0] : undefined;
        assert.deepEqual(rpc.params.arguments, { memoryId: first?.id }, "Never switch to a later candidate");
        // The baseline may send an empty ID; echo it rather than manufacturing a server rejection.
        // Assertions below require malformed data to fail in the reader before this request.
        const inspected = { ...evidence,
          id: fixture.kind === "wrong_inspection_id" ? "opaque:fixture/other" : rpc.params.arguments.memoryId };
        return reply({ content: [{ type: "text", text: JSON.stringify(inspected) }], structuredContent: inspected });
      };

      let result: Awaited<ReturnType<typeof searchAndInspect>> | undefined;
      let failure: unknown;
      try {
        result = await searchAndInspect(new URL("https://remnant.invalid/mcp"), query, fakeFetch);
      } catch (error) {
        failure = error;
      }
      const inspections = calls.filter(call => call.name === "inspect_memory");
      const row = {
        case: fixture.name, kind: fixture.kind, advertisedOutputSchema: false,
        outcome: failure === undefined ? "returned" : "rejected",
        errorName: failure instanceof Error ? failure.name : null,
        errorMessage: failure instanceof Error ? failure.message : null,
        nativeMcpError: failure instanceof McpError,
        returnedNullInspection: result ? result.inspected === null : null,
        returnedSearchPreserved: result ? JSON.stringify(result.search) === JSON.stringify(fixture.search) : null,
        fullInspectionPreserved: fixture.kind === "valid" && result
          ? JSON.stringify(result.inspected) === JSON.stringify(evidence) : null,
        events, mockFetchCalls, mockToolCalls: calls.length,
        toolNames: calls.map(call => call.name), inspectArguments: inspections.map(call => call.arguments),
        deleteCalls: events.filter(event => event === "DELETE").length,
        nativeClientCloses: closes, transportSignalsAborted: signals.length > 0 && signals.every(signal => signal.aborted),
        afterImportNetworkTripwireCalls: [...outsideCalls], realServiceCalls: 0,
      };
      observations.push(row);
      console.log("SDK_SEARCH_GUARD=" + JSON.stringify(row));

      assert.deepEqual(outsideCalls, []);
      assert.equal(events[0], "initialize");
      for (const name of ["notifications/initialized", "tools/list", "GET:405", "DELETE"])
        assert.equal(events.filter(event => event === name).length, 1, name + " lifecycle count");
      assert.equal(events.at(-1), "DELETE");
      assert.equal(closes, 1);
      assert.ok(signals.length > 0 && signals.every(signal => signal.aborted));
      assert.equal(calls.filter(call => call.name === "search_memories").length, 1);

      if (fixture.kind === "malformed" || fixture.kind === "wrong_inspection_id") {
        assert.ok(failure instanceof Error, "Malformed or mismatched evidence must not return success");
        assert.equal(failure instanceof McpError, false, "The example must reject this data without native schema enforcement");
        assert.equal(failure.message, fixture.kind === "malformed"
          ? "Remote MCP returned invalid search results."
          : "Remote MCP inspection did not match the selected memory ID.");
        assert.doesNotMatch(failure.message, /UNTRUSTED_FIXTURE_MARKER|opaque:fixture/);
        assert.equal(result, undefined);
        assert.equal(inspections.length, fixture.kind === "malformed" ? 0 : 1);
      } else {
        assert.equal(failure, undefined);
        assert.ok(result);
        assert.deepEqual(result.tools, ["search_memories", "inspect_memory"]);
        assert.deepEqual(result.search, fixture.search);
        assert.deepEqual(result.inspected, fixture.kind === "empty" ? null : evidence);
        assert.equal(inspections.length, fixture.kind === "empty" ? 0 : 1);
      }
      assert.deepEqual(calls.map(call => call.name), fixture.kind === "valid" || fixture.kind === "wrong_inspection_id"
        ? ["search_memories", "inspect_memory"] : ["search_memories"]);
    });
  }
  console.log("SDK_SEARCH_GUARD_SUMMARY=" + JSON.stringify({
    classification: "offline_operator_desired_contract_regression",
    cases: observations.length,
    returned: observations.filter(row => row.outcome === "returned").length,
    rejected: observations.filter(row => row.outcome === "rejected").length,
    malformedRejectedBeforeInspection: observations.filter(row => row.kind === "malformed"
      && row.outcome === "rejected" && (row.inspectArguments as unknown[]).length === 0).length,
    mockFetchCalls: observations.reduce((sum, row) => sum + Number(row.mockFetchCalls), 0),
    mockToolCalls: observations.reduce((sum, row) => sum + Number(row.mockToolCalls), 0),
    nativeClientCloses: observations.reduce((sum, row) => sum + Number(row.nativeClientCloses), 0),
    afterImportNetworkTripwireCalls: outsideCalls,
    liveServiceCalls: 0, externalActivationEstablished: false, actualMemoryUseEstablished: false,
    limitation: "Synthetic no-outputSchema responses and native SDK transport only; not a live incident or production validation.",
  }));
});
