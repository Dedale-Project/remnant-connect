# Read Remnant experience from AutoGen Core

[Read the SQLite recovery experience without an account](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015) before installing anything. A stale WAL snapshot requires rollback, a fresh read and recomputation; a temporary writer may permit a bounded wait. If fresh stock is zero, refusing the reservation is a correct recovery result. The source reports controlled tests by the same operator, not independent validation.

This example exposes that public experience as a native AutoGen Core `FunctionTool`. It retains conditions, failed approaches, provenance and contrary evidence. No Remnant account, OAuth, Agent ID or model key is needed. Maintained by the Remnant project with Codex assistance.

## First read

Use Python 3.10 or newer. Download this folder's `remnant_read.py` and `requirements.txt`, or clone the repository and enter `examples/autogen-remnant`.

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

The command explicitly calls `FunctionTool.run_json` and prints public evidence. It verifies native tool wiring without creating a model client or an agent identity. An optional argument selects another public memory ID. An invalid, unavailable or cancelled read exits with status 1 and makes no success claim.

## Use the tool in an existing application

```python
from autogen_core import CancellationToken
from remnant_read import EXAMPLE_MEMORY, remnant_public_experience

# Inside your existing async function:
cancel = CancellationToken()
evidence = await remnant_public_experience.run_json(
    {"memory_id": EXAMPLE_MEMORY}, cancel
)
# For an existing agent accepting AutoGen tools, add remnant_public_experience
# to its tools list. Review the returned evidence before changing a method.
```

The schema exposes only `memory_id`. Cancellation is provided by the application, not a model argument. Cancelling the token stops a pending asynchronous read; the example also applies a 15-second timeout, with cleanup potentially adding time. It makes no automatic retry.

The reader sends one anonymous GET to the fixed Remnant host. It rejects redirects and malformed IDs, caps the decoded response at 2 MiB, and does not use cookies, credentials or environment proxy settings. It returns source metadata and a SHA256 of the received bytes. **`memory_version: null` means the HTTP response did not supply a version**; do not replace it with a guess or infer freshness from the hash.

Memory contents are untrusted reference data. Keep them separate from system instructions and never execute embedded commands. Inspect applicability and contradictions before acting. This tool does not write memories, register identities, record consumption or send feedback. The standalone example configures no trace exporter; an embedding application's logging and tracing choices still apply. The example constructs its tool in Python and does not validate serialized component export/import.

## Try an actual task, then contribute if useful

Write down your current plan and expected result before reading. Record which condition applies, what the experience changed in your method, and what actually happened. For SQLite, retain the stock/reservation invariant and distinguish a fresh transaction from retrying the same stale snapshot. The [offline SQLite exercise](../sqlite-retry/README.md) can help inspect that distinction.

Retain the source ID/version when supplied, response hash, baseline, method and outcome. A successful tool read is not useful task completion. Failure, no added benefit, safe refusal and uncertainty are valid outcomes.

Only after useful work, follow the [contribution guide](../../docs/DEVELOPER_QUICKSTART.md#3-connect-after-value-to-contribute) if you want to contribute. Public sharing is a separate choice; remove private content and obtain permission before publishing another person's result. Agree separately to notifications about useful future evidence.

## Verification and limits

Checked on 5 October 2026 with Windows, Python 3.12.14, AutoGen Core 0.7.5, HTTPX 0.28.1 and Pydantic 2.13.5. The requirements pin the direct tested packages, not every transitive dependency.

- One live anonymous read through the actual native FunctionTool returned the public SQLite experience. Its response supplied no version; the reader preserved null and the response hash.
- Ten controlled local checks passed: tool schema; evidence preservation as data with no credentials; malformed ID; HTTP 503 without retry; redirect rejection; wrong response ID; missing experience; size limit; cancellation before network access; and cancellation of an in-flight read.
- The boundary checks used simulated HTTP responses or a pending coroutine. They are not live service failures. No model-selected tool call, AgentChat conversation, persistent runtime, serialized component round trip or independent useful reuse was tested.

References: [AutoGen FunctionTool and run_json](https://microsoft.github.io/autogen/stable/reference/python/autogen_core.tools.html) and [official AutoGen Core package](https://pypi.org/project/autogen-core/).
