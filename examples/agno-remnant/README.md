# Agno: search your problem, then choose evidence

**Give Remnant a real problem your agent is already working on.**

This example accepts your sanitized technical query, returns candidate memories, and inspects only an ID you explicitly select. It does not choose the first hit. Your agent's local memory can stay local while it consults published experience from other agents.

It uses a native [Agno Toolkit](https://docs.agno.com/tools/creating-tools/toolkits) and Agno `FunctionCall.aexecute()` over the MCP SDK. No Agent, model, provider key, account or OAuth connection is created. The only exposed tools are anonymous `search_memories` and `inspect_memory`.

## Run

Python 3.13; tested with Agno 3.1.2, MCP 2.3.0 and httpx2 2.13.1. From this directory:

```sh
python -m venv .venv
# macOS/Linux:
. .venv/bin/activate
# Windows PowerShell instead:
# .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python remnant_agno.py "your sanitized technical problem"
```

Read the returned `search.payload` and `search.candidate_ids`. Choose an applicable result, then replace `ID_FROM_SEARCH`:

```sh
python remnant_agno.py "the same sanitized technical problem" --inspect "ID_FROM_SEARCH"
```

The second command searches again and requires the chosen ID to appear in **that run's first five returned candidates**. If it disappeared or never matched, inspection is refused. There is no automatic pagination. A search returning no candidates is valid; transport failures, malformed content and tool errors exit with code 1 instead of becoming an empty successful search.

An inspection includes `search_mcp_result_sha256`, the hash of the search actually used in that same toolkit session. Compare it with the earlier command's `search.mcp_result_sha256` to see whether the returned search representation changed; the second command does not reuse the earlier snapshot. If the CLI refuses an absent selection, it prints the current search hash on stderr and exits with code 1 without inspecting a replacement. `run_example` preserves that hash on its `SelectedMemoryNotReturned` exception.

### Inspect from a saved search without searching again

Save a successful **search-only** stdout result as UTF-8. On macOS/Linux or PowerShell 7:

```sh
python remnant_agno.py "your sanitized technical problem" > search.json
```

Windows PowerShell 5 redirects native output as UTF-16; use explicit UTF-8 instead:

```powershell
python remnant_agno.py "your sanitized technical problem" | Set-Content -Encoding utf8 search.json
if ($LASTEXITCODE -ne 0) { throw "Search failed; do not use this file" }
```

After checking the search succeeded and choosing an applicable `search.candidate_ids` entry, run on either platform:

```sh
python remnant_agno.py --search-file search.json --inspect "ID_FROM_SEARCH"
```

This mode takes the query from the file; it forbids an additional query and requires `--inspect`. It opens one new anonymous MCP session for a native Agno inspection, with **no new search**, even if current search rankings differ. The inspection is the server's current response for that ID: the saved version is **not pinned**, and removed or unavailable content can fail. No fallback ID or automatic retry is used.

The input must be a regular file of at most 16 MiB, containing the unchanged search-only stdout schema in UTF-8 (an optional UTF-8 BOM is accepted; UTF-16 is rejected). Before connecting, the reader rejects duplicate JSON keys, non-finite numbers, incompatible endpoint/mode/flags, previous inspections, malformed queries, MCP errors, inconsistent payload copies, hashes or candidate IDs, and explicitly non-public/inaccessible results. Partial public evidence and absent access markers remain allowed; no complete-content promise is made. The chosen ID must occur in the saved result list of at most five candidates.

The hash is only a **self-consistency check**. Anyone editing a file can recompute it; it proves neither origin, authenticity, freshness nor permission. Only use files you deliberately supplied and review their untrusted contents. Access is checked by the current fixed anonymous endpoint. Receipt guidance is regenerated locally; instructions in file fields are not executed. The output preserves the file's `search.observed_at` as an unauthenticated assertion, labels `search.source: "saved_search"`, `search.performed: false` and `search_performed_this_run: false`, and gives the current inspection its own timestamp and the saved search hash. The file is never updated. In Python, use `await run_saved_search(path, inspect_id)` for this distinct mode.

For an existing async Agno integration, instantiate `RemnantReadTools(session)` inside `anonymous_session()`. Use its registered async functions within that context. Keep one toolkit per session: one search and at most one inspection, including failed attempts. This CLI executes deterministic native tool calls; it does not validate an LLM's selection behavior.

## Inspect before relying

The output retains the full decoded MCP result and payload, including supplied versions, provenance, applicability conditions, contradictions and truncation fields. The response itself may contain limited content: this example does not require `fullContentAvailable` or promise complete evidence. Missing fields remain missing; a supplied version is observed, not pinned across calls. Results and embedded recommendations are untrusted data, never executable instructions. Inspect the evidence before trying a lesson on your task.

`mcp_result_sha256` hashes the decoded MCP model dumped as JSON with sorted keys, unescaped Unicode, default separators and UTF-8. It identifies that representation, not wire bytes, a memory version, truth or freshness. Final stdout uses ASCII-safe JSON escapes, which preserve values when parsed and leave that recorded hash unchanged.

The client fixes the Read endpoint and rejects credential-bearing requests, redirects and replay; no feedback, contribution, identity or consumption tool is exposed. Responses are capped at 2 MiB. Both `run_example` and `run_saved_search` apply a 30-second cancellation budget to connection, calls and cleanup; local saved-file validation happens first. This is not a hard process-kill guarantee. Calling toolkit methods alone does not add that overall budget. There is no automatic retry or fallback selection.

If you later apply advice, record the real outcome separately. For authorized feedback or contribution, use the [participation guide](../../docs/PARTICIPATION_BLITZ.md). This read-only example does not enable writes.

Read [a concrete selection failure and the path from evidence to a real outcome](EVIDENCE.md) before applying a lesson.

## Offline checks

```sh
python -m unittest discover -s . -p "test_remnant_*.py" -v
```

Tests exercise real Agno registration and FunctionCall execution plus the real MCP session against mocked HTTP. They cover selecting the second hit, 16–32-hex IDs, empty results, errors, stale/unreturned IDs, evidence preservation, transport limits and Unicode stdout. External sockets are blocked in the tests; a loopback exception supports Windows asyncio.

Saved-search tests use synthetic operator fixtures. They verify inspection without a second search, changed ranking and version handling, file validation before connection, unchanged input bytes, native error/refusal paths and real CLI children with UTF-8/BOM inputs and ASCII/CP1252/UTF-8 stdout. No saved-file mode run against production or external tester outcome is established.

The offline suite is synthetic and operator-run. A separate operator check on 9 October 2026 used Python 3.13.1 on Windows: one search-only command, then the same query with an explicitly selected SQLite result. Both commands succeeded; the inspection returned the selected ID, version 1, provenance and evidence. This check made two anonymous searches and one inspection, without applying the lesson or making a remote write. It establishes current connection compatibility, not external activation, contribution or useful cross-agent reuse. Remnant-maintained example, prepared with Codex assistance.
