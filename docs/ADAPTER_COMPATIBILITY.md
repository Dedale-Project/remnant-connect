# Adapter compatibility evidence

The observation on **2026-10-17** covers a local candidate based on integration
commit `1c3654224b149d4e24a758708cbe29aa40043848`. The machine-readable
[matrix](../schemas/adapter-compatibility-v1.json) binds each followed adapter to
its source SHA-256 (UTF-8 with CRLF normalized to LF). These bindings identify
uncommitted candidate bytes; they do not invent a release commit. Changed source
requires review. All seven framework rows remain **experimental**.

The [common corpus](../test/fixtures/adapter-compatibility-v1.json) contains public
ID suffix lengths 16/24/32, invalid IDs, French/Japanese/emoji, a wrong returned
identity, empty and malformed searches, and an `isError` envelope with misleading
structured results. Everything is synthetic. The local runs use Node 24.13.0,
Python 3.13.1 and actual MCP TypeScript SDKs 1.32.1 and 1.30.0. No framework was
installed for this change, no model ran, and no external service was called.

| Framework | Repository pin or candidate pin | Current executed coverage | Native framework/host |
| --- | --- | --- | --- |
| LangGraph | LangGraph 1.2.12; Core 1.6.6; prebuilt 1.1.0 | Actual reader function extracted from source; HTTP double; IDs, Unicode/CP1252 JSON expression, wrong identity and HTTP refusal | NOT_RUN; no framework imports or ToolNode registration |
| PydanticAI | pydantic-ai-slim 2.54.0; fastmcp-slim 4.0.10 | Imported adapter with toolset double; IDs, Unicode, wrong identity, malformed/empty, injected exception/cancellation; real dependency-free `--help` process | NOT_RUN; native MCP `isError` conversion and transport cancellation unverified |
| AutoGen | autogen-core 0.7.5; httpx 0.28.1; pydantic 2.13.5 | Source reader functions with HTTP/token doubles; IDs, Unicode/CP1252, wrong identity, HTTP refusal, cancellation before/during fetch | NOT_RUN; FunctionTool and native CancellationToken unverified |
| Mastra | @mastra/mcp 2.1.2; @mastra/core 1.74.0 | Imported adapter with injected connection; IDs, Unicode, wrong identity, empty/malformed, `isError`, injected cancellation and cleanup | NOT_RUN; MCPClient discovery/registration unverified |
| Agno | Unintegrated candidate: agno 3.1.2; mcp 2.3.0 | Source inspected only at `7a6b07c4fb534f210a351088ef5fab69d0969a4f` | NOT_RUN; no main-branch adapter or compatibility badge |
| smolagents | Unintegrated candidate: smolagents 1.26.0; mcpadapt 0.1.20; MCP 1.30.0 | Source inspected only at `e6c2c0a72c59b4afa516b807d8fc8a4345496efe` | NOT_RUN; private adapter override remains unqualified |
| Codex | Plugin 0.1.8; integration 0.2.0; TS SDK 1.32.1 | Actual SDK transport/stdio bridge fixtures, including named historical client 1.30.0, subset, IDs/Unicode, errors, empty output and cancellation | Native Codex version, install and lifecycle UNKNOWN; no native-host claim |

Installed native Python frameworks and Mastra are absent from these test
environments; their repository pins are not installation observations. All latest
upstream versions remain **UNKNOWN**, since no latest-version query was made.
The matrix retains earlier dated README observations separately; they were not
rerun and cannot become current native passes. HTTP-only readers have no native
MCP error-envelope or search-empty path. Their equivalent HTTP failure tests are
identified as such. The generic bridge preserves result data; selection/returned
identity checks belong to the selecting adapters, not a universal bridge policy.

Two auxiliary examples use the same corpus without adding framework rows: the
SDK search/inspect example runs through the real SDK 1.32.1 with fake HTTP; the
AgentMind reader's source function runs with an HTTP double. AgentMind native
registration and cancellation remain NOT_RUN. A thrown cancellation fixture
proves propagation/cleanup only, not a framework's ability to stop a live request.
The synchronous LangGraph example has no caller-cancellation API. The SDK example
also does not expose a caller signal. None of these observations certify an agent
against prompt injection or establish independent adoption/usefulness.

## Reproduce the local scope

```sh
npm run test:bridge
npm run test:read-contract
node --test test/read-catalog.test.mjs
node --import tsx --test test/adapter-compatibility.test.mjs test/adapter-matrix.test.mjs
python -B test/adapter_compatibility_test.py
```

Set `REMNANT_HISTORICAL_SDK_ROOT` to an existing SDK **1.30.0** package directory
to run the named historical client; [Read contract instructions](READ_CONTRACT.md)
show the separate temporary installation option. Without that directory, the
historical check is explicitly skipped. It is not labelled the immediately
preceding release. CI runs these fixtures and explicitly installs that historical
SDK in a temporary prefix; CI is not a seven-framework native test job.

The Python suite states its evidence level in its module docstring. AST extraction
removes optional imports/decorators and executes the original source functions
with doubles; it cannot test registration, packaging or third-party wrappers.
Pydantic's help process runs with isolated Python and no optional SDK import.
Mastra's optional dependency loads only when the real connection is requested.
Existing framework-specific suites remain available for separately prepared,
pinned native environments; no missing dependency is silently counted as a pass.

## Selective patches and maintenance

The reviewed source patches are reused narrowly: LangGraph `a68ca5c` supplies
the ID range and ASCII-safe JSON; Mastra `ebd17d7` supplies the malformed-search
guard, supplemented here by selected/returned identity checking; SDK `2162f03`
and AgentMind `228afc4` supply identity/ID fixes; Pydantic `91c847e` supplies help
before optional imports. AutoGen `f7f1eb6` fixes already exist in the base and were
not duplicated. Agno/smolagents candidate features were not merged wholesale.

The Remnant operator owns repository adapter maintenance; no upstream maintainer
commitment is inferred. Review before release, on source/dependency/Read-contract
changes and by **2026-11-16**. This is a review date, not an automation. In
particular, the smolagents candidate now pins stock MCPAdapt, rather than a Git
fork, but replaces private `_adapter.adapter`. Its exit criterion is an exact
upstream public API/version that preserves the MCP envelope and passes the common
cases in a native environment; an upstream fix is still UNKNOWN. Keep it
experimental until that evidence exists.

Rollback reverts the selected source/subset changes to the prior pinned contract.
There is no migration, remote write or automatic retry. Preserve the limitations
and historical evidence; reverting to the old bridge also restores its refusal
of additive catalogs. The [v2 Read contract](READ_CONTRACT.md) states the byte,
schema-compiler and old-binary compatibility limits explicitly.
