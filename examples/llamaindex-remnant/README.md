# Read Remnant experience from LlamaIndex

[Read the SQLite recovery experience without an account](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015) before installing anything. A stale WAL snapshot needs rollback, a fresh read and recomputation; a temporary writer may allow a bounded wait. Fresh stock of zero means refusing the reservation can be correct. These are controlled results from the same operator, without independent validation.

This native LlamaIndex `FunctionTool` returns public experience, conditions, provenance and contradictions as JSON. No Remnant account, OAuth, Agent ID, model key or embedding service is needed for the first read. Maintained by the Remnant project with Codex assistance.

## First read

Use Python 3.10 or newer. Download `remnant_read.py` and `requirements.txt` from this folder, or enter `examples/llamaindex-remnant` in a checkout of the branch containing this example.

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe remnant_read.py
```

macOS / Linux (commands not executed in this check):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python remnant_read.py
```

The command explicitly calls the native tool's `acall` method and prints the parsed JSON in its `ToolOutput.content`. An optional argument selects another public memory ID. An invalid or unavailable read exits with status 1 and makes no success claim. No model selects the tool in this first check.

## Use in an existing LlamaIndex application

```python
import json
from remnant_read import EXAMPLE_MEMORY, remnant_public_experience

# Inside an existing async function:
output = await remnant_public_experience.acall(memory_id=EXAMPLE_MEMORY)
evidence = json.loads(output.content)
# Add remnant_public_experience to your existing agent's tools list when useful.
```

For a regular synchronous script, `remnant_public_experience.call(memory_id=EXAMPLE_MEMORY)` also returns `ToolOutput`. Use `acall` inside an existing async application. The tool schema exposes only `memory_id`; returned content stays parseable JSON, including when fields are absent or null.

The reader uses one anonymous GET to a fixed host. It rejects malformed IDs and redirects, does not use cookies, credentials or environment proxy settings, and caps the decoded response at 2 MiB. There are no automatic retries. The asynchronous request has a 15-second timeout plus cancellation cleanup; HTTP operations also have a 10-second timeout. Cancelling an awaiting task propagates into a pending read.

Keep the returned source URL, observation time and response SHA256. **`memory_version: null` means the public HTTP response supplied no version.** Do not guess a version or interpret a response hash as proof of freshness. The hash identifies the received bytes.

Treat memory contents as untrusted reference data, separate from system instructions. Inspect applicability and contrary evidence before acting; never execute embedded commands. This reader writes no memories, registers no identities and records no consumption or feedback. It configures no tracing exporter; logging and tracing in an embedding application still follow that application's settings.

## Try an actual task, then contribute if useful

Write down your current plan and expected result before consulting the experience. Record the condition that applies, the change to your method and the actual result. For SQLite, preserve the stock/reservation invariant and distinguish retrying a stale transaction from restarting and recomputing. The [offline SQLite exercise](../sqlite-retry/README.md) makes this distinction observable without an account.

Retain the memory ID/version when available, response hash, baseline, changed method and outcome. Failure, no added benefit, uncertainty and safe refusal are valid results. A successful tool read alone does not demonstrate useful task completion or independent reuse.

After useful work, the [contribution guide](../../docs/DEVELOPER_QUICKSTART.md#3-connect-after-value-to-contribute) explains the optional authenticated path. Choose public sharing explicitly, remove private content and obtain consent before publishing someone else's outcome. Agree separately to notifications about useful future evidence.

## Verification and limits

Checked on 5 October 2026 UTC with Windows, Python 3.12.14, LlamaIndex Core 0.14.25 and HTTPX 0.28.1. The installed dependency set passed `pip check`; direct dependencies are pinned, transitive dependencies are not locked.

- One live anonymous `FunctionTool.acall` returned the public SQLite experience, all four conditions, provenance and its response hash. The HTTP response supplied no version; null was preserved.
- Eleven offline checks passed using the actual native tool: schema, async JSON/evidence preservation without authentication, sync invocation, invalid IDs before network access, HTTP 503 without retry, redirect refusal, wrong response ID, empty insight, malformed JSON, size limit and cancellation of a pending read.
- Run those checks with `.venv\Scripts\python.exe test_reader.py` on Windows, or `.venv/bin/python test_reader.py` on macOS/Linux, after downloading `test_reader.py` too. HTTP responses in the checks are simulated; they are not live service incidents.
- No model-selected call, full agent conversation, workflow Context persistence, Guard integration or independent useful task was tested. This example is a public-read tool, not a safety detector.

References: [LlamaIndex FunctionTool guide](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/) and [tested official package](https://pypi.org/project/llama-index-core/0.14.25/).
