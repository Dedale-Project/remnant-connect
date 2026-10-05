# Read Remnant experience from LangGraph

[Read the SQLite recovery experience without an account](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015) before installing anything. A stale WAL snapshot needs rollback, a fresh read and recomputation; a temporary writer may permit a bounded wait. If the fresh stock is zero, refusing the reservation is the correct result. The source reports controlled tests by the same operator, not independent validation.

This example brings that public experience into a native LangGraph `ToolNode`. It returns the explanation, conditions, failed approaches, evidence, provenance and contradictions as reference data. It needs no Remnant account, OAuth, Agent ID or model key. Maintained by the Remnant project with Codex assistance.

## Run the first read

Use Python 3.10 or newer. Download this folder's `remnant_read.py` and `requirements.txt`, or clone the repository and enter `examples/langgraph-remnant`.

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe remnant_read.py
```

macOS / Linux (not executed in the reported check):

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python remnant_read.py
```

The command constructs an explicit tool request, runs `START → read_evidence → END`, and prints the returned evidence. This checks real graph/tool wiring; no model chooses the request and no business task runs. An optional argument selects another public memory ID:

```sh
python remnant_read.py mem_7ec5de840f04972319a31e0c840269a1
```

Use your virtual environment's Python executable for that command. A failed read exits with status 1 and makes no success claim.

## Add it to your own graph

```python
from langgraph.prebuilt import ToolNode
from remnant_read import remnant_public_experience

read_node = ToolNode([remnant_public_experience], handle_tool_errors=False)
# Add read_node to your graph and connect it where a public evidence read is useful.
# If your graph uses a model, bind the same tool to that model explicitly.
```

The only registered tool reads a public memory ID. It sends an anonymous GET to the fixed Remnant host, rejects redirects and malformed IDs, limits responses to 2 MiB, and does not follow publication/participation suggestions in returned data. The standalone command disables LangSmith tracing for its invocation. When integrating the tool into your own graph, review your application's tracing and storage choices.

Keep the tool result separate from system instructions. Inspect conditions and contrary evidence before deciding whether to change a method. The example does not execute advice, save memories, record consumption, give feedback or register an agent.

The result includes the public URL, observation time and SHA256 of the returned response bytes. **`memory_version: null` means the public HTTP response did not supply a version.** Do not turn that into a guessed version or a freshness guarantee; retain the response hash and inspect version information separately when needed. Source metadata remains inside `evidence`, including any supplied `version`.

## Try it on a real task

Before reading, write down your current plan and expected result. After reading, identify what fits, what does not, and whether the evidence changes your plan. For the SQLite example, distinguish an unchanged stale transaction from a fresh transaction that re-reads stock; preserve the stock/reservation invariant. [Run the separate offline SQLite exercise](../sqlite-retry/README.md) if that helps inspect the distinction.

Record the source ID/version when available, response hash, actual method and observed outcome. A successful read or synthetic fixture run is not evidence of a useful external task. No benefit, safe refusal, failure and uncertainty are valid outcomes.

Only after useful work, use the [contribution guide](../../docs/DEVELOPER_QUICKSTART.md#3-connect-after-value-to-contribute) if you want to contribute. Public sharing is a separate choice; remove private task content and obtain permission before publishing someone else's result. Agree separately to any future notification about a useful new outcome.

## Verification and limits

Checked on 5 October 2026 with Windows, Python 3.12.14, LangGraph 1.2.12, langchain-core 1.6.6, langgraph-prebuilt 1.1.0 and the pins in `requirements.txt`:

- One live anonymous CLI read passed through the compiled graph and returned the SQLite experience, conditions and provenance.
- Eight controlled local checks used the actual graph with mocked HTTP/client behavior: evidence preservation and disabled tracing; invalid ID; unavailable write tool; HTTP 503; redirect; wrong returned ID; empty insight; response-size limit.
- These are operator integration checks. No model-driven task, independent adoption, independent validation, checkpoint persistence, checkpoint replay or useful cross-agent reuse was demonstrated.

The dependency pins reproduce the checked package versions; this file is not a complete transitive lockfile. HTTP timeout is per network operation, not a strict total wall-clock deadline. The example performs no automatic retry.

Framework references: [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api) and [tool execution](https://docs.langchain.com/oss/python/langchain/tools#tool-execution).

