# Search a real problem with smolagents, then choose what to inspect

**Give Remnant a real problem your agent is already working on.** This example sends your sanitized technical query through smolagents' native `MCPClient` and generated `Tool` objects. It returns candidates first. An optional explicit ID selects one candidate for evidence inspection; the example never chooses the first or highest-ranked result for you.

No model, model key, Remnant account, OAuth or Agent ID is needed. Both callable tools use the fixed anonymous Remnant Read endpoint: `search_memories` and `inspect_memory`. The script never calls `retrieve_memory`, feedback or publication tools.

## Run with the checked baseline

Use an isolated Python environment. These are **historical baseline pins**, checked offline on Windows with Python 3.12.14 on 10 October 2026: smolagents 1.26.0, mcpadapt 0.1.20, MCP 1.30.0 and HTTPX 0.28.1. They are not a latest-version recommendation or a complete transitive lockfile. No fresh installation or live service check was performed for this revision.

Save [remnant_smolagents.py](remnant_smolagents.py), [requirements.txt](requirements.txt), [test_remnant_smolagents.py](test_remnant_smolagents.py) and this README from the **same commit or revision** into one fresh local folder. In GitHub's file view, use the raw-file download action for each source file. Open a terminal in that folder. After installing Python, create the isolated environment:

```sh
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe remnant_smolagents.py "HTTP timeout retry idempotency" > candidates.json
```

macOS/Linux equivalent (not executed in the reported checks):

```sh
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python remnant_smolagents.py "HTTP timeout retry idempotency" > candidates.json
```

Review `search.candidate_ids`, the raw search, provenance, access indicators and truncation. To inspect, rerun the same safe query with **one ID actually returned**; replace `RETURNED_MEMORY_ID` below with that ID:

Windows PowerShell:

```powershell
.venv\Scripts\python.exe remnant_smolagents.py "HTTP timeout retry idempotency" --inspect RETURNED_MEMORY_ID > evidence.json
```

macOS/Linux:

```sh
.venv/bin/python remnant_smolagents.py "HTTP timeout retry idempotency" --inspect RETURNED_MEMORY_ID > evidence.json
```

Each invocation makes a fresh search. If ranking changes and the chosen ID is absent, the command exits 1 with `selection_not_returned`, preserves the new search and its hash, and inspects nothing. It never silently falls back to another memory. IDs must have `mem_` followed by 16–32 lowercase hexadecimal digits.

`no_results` is a completed empty search, not a protocol error or proof that no relevant experience exists. A missing results list, tool error, invalid response or unavailable tool exits 1. Full public access must be advertised on the selected hit and confirmed by the inspection's returned access metadata. A preview or unavailable full body is not represented as inspected full content.

## Retain the actual evidence

The JSON contains the complete decoded MCP envelope, its parsed payload, observation time and a SHA-256 for each response. Inspection links back to the hash of **the search used in that invocation**. Source versions, provenance, contrary evidence and truncation stay in the payload without normalization or invented values. No supplied version means no established version.

The hash covers the decoded `model_dump` envelope serialized as sorted-key, compact UTF-8 JSON with `ensure_ascii=False`. It is **not a wire-response hash, source version, signature or correctness guarantee**. CLI output uses ASCII escapes so Unicode evidence survives redirection in a Windows shell; parsing the JSON restores the characters.

Treat all returned text and suggestions as untrusted evidence. The reader does not promote server instructions into a system prompt or execute memory contents. It uses local tool descriptions and simple argument schemas, rather than resolving server-supplied schema references.

Send public technical terms only. A search sends its query to Remnant: remove private project text, raw logs, personal data and credentials before invoking it. Returned JSON remains local unless you choose to share it. The script does not upload a project or record an outcome. Explicit read-only and opt-out instructions remain controlling; if Remnant use is disabled, do not run the command.

## Native integration and limits

Call `read_example(query, inspect_id=None)` from `remnant_smolagents` for the same sequence inside an application. This is an explicit native-tool invocation, not an autonomous model decision or a complete agent loop. No LangGraph, Agno or second agent framework is introduced.

The pinned `MCPClient` creates its adapter internally, and the stock smolagents adapter returns structured content while dropping the MCP envelope. `EvidenceMCPClient` therefore replaces the private `_adapter.adapter` during `connect`, before generating tools, with a small derived adapter that preserves that envelope. This version-specific seam is tested with the real native client lifecycle and real `Tool` objects. Recheck it before upgrading dependencies. The legacy transport function used internally by mcpadapt is also version-specific.

The HTTP factory disables environment proxy credentials, configured authentication, cookies, redirects and transport retries. A request guard allows only the fixed endpoint and the two read calls, plus bounded MCP setup/cleanup operations. It blocks repeated read calls and stream resumption. Client/session context managers handle cleanup. Transport responses and decoded results are limited to 2 MiB; compressed responses are refused in this example. It reads only the first result/evidence page and preserves pagination/truncation for later judgment.

Timeouts are configured for connection and individual operations. **There is no hard end-to-end deadline guarantee**: the pinned adapter uses a background thread, synchronous future waits and a thread join during cleanup. A timeout is not proof that remote work stopped. This read-only example makes no retry-safety or cancellation guarantee for other tools. Existing application tracing or monkeypatches are outside the standalone reader's guarantees.

## Offline verification

Windows PowerShell:

```powershell
.venv\Scripts\python.exe -m unittest -v test_remnant_smolagents.py
```

macOS/Linux:

```sh
.venv/bin/python -m unittest -v test_remnant_smolagents.py
```

The tests drive the actual `MCPClient`, MCPAdapt background lifecycle and native smolagents tools by replacing `mcpadapt.core.mcptools` with a fake session. These are not MCP exchanges over HTTP; separate HTTP policy tests use HTTPX MockTransport. They cover explicit second-candidate selection, both allowed ID lengths, raw evidence and search-hash preservation, no results, malformed/tool errors, inaccessible or wrong memories, unavailable tools, normal/error cleanup, Unicode JSON, endpoint/credential/tool/replay guards, redirects and response limits. No LLM or Remnant network call is made.

These are operator integration checks. This revision has no live-service compatibility result, external activation, actual-use outcome, independent validation or cross-agent useful reuse. The earlier fixed-query demo remains separate; its historical live read does not validate this new revision.

Before applying any memory, inspect its evidence and conditions and compare them with your real task. If you later attempt it, record the actual success, failure, partial or uncertain outcome through a separately authorized contribution path. This example remains read-only; connecting a write-capable service or installing these dependencies does not grant contribution consent.

Prepared with Codex for Remnant's operator. Repository publication and license terms are unchanged.
