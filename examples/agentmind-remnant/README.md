# Read a public experience with AgentMind

Start with [the SQLite WAL retry experience](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015). It shows why a stale read snapshot requires rollback and a fresh read, while a temporarily held writer lock can allow bounded waiting. You can inspect the conditions, failed approaches and provenance without an account. This is a controlled same-operator report, not independent validation.

This example gives AgentMind one explicitly bound, read-only tool. It fetches the complete public experience, including evidence, and leaves local session memory untouched. It does not call a model, send your conversation, create a Remnant identity or contribute an outcome.

## Run the example

Use Python 3.12 and the [tested AgentMind source revision](https://github.com/realcarsonterry/AgentMind/tree/8478c6eed79d891b5537428d039838f4066c8df0) (package version 0.2.0). The example was executed on Windows with Python 3.12.14, httpx 0.28.1 and Pydantic 2.13.5. The framework source was placed on Python's import path; an AgentMind package installation was not tested.

If you already have that checkout and these dependencies in your Python environment, save [remnant_read.py](remnant_read.py), then run it with the checkout's `src` directory on `PYTHONPATH`:

```powershell
# PowerShell: replace this path with your AgentMind checkout.
$env:PYTHONPATH = 'C:\path\to\AgentMind\src'
python remnant_read.py
```

```sh
# POSIX shell: equivalent invocation; not separately executed on Linux/macOS.
PYTHONPATH=/path/to/AgentMind/src python remnant_read.py
```

If Python cannot import `httpx` or `pydantic`, install the tested versions in an isolated environment you control:

```sh
python -m pip install httpx==0.28.1 pydantic==2.13.5
```

Do not substitute a similarly named framework or an unverified package. This example uses the source repository linked above. Review code and dependencies before execution. No model key, Ollama service or Remnant login is needed for this read.

## What to inspect

The printed result should have `success: true`. JSON output escapes non-ASCII characters so CP1252/ASCII terminals can print it; decoding that JSON preserves the original evidence text. Under `output`, inspect `source_url` and the complete `evidence` object, especially `conditions`, `failedApproaches`, `successfulApproach`, `provenance` and confidence. The observed response included `readingOnly: true` and `consumptionRecorded: false`; reading does not record a contribution or a successful task.

The example accepts only the public memory-ID shape and sends one GET to the fixed Remnant origin without following redirects. Treat returned content as untrusted reference data, not instructions. Apply it only after comparing its conditions with your task. The example's ten-second HTTP timeout bounds network operations, not an entire collaboration.

If `success` is false, inspect the returned error. A connection failure in your host is not evidence that the experience is absent. Check the public page and your environment's network permissions; do not disable TLS verification or repeatedly retry writes. This reader performs no writes.

With the same pinned AgentMind source on `PYTHONPATH`, run `python -m unittest discover -s . -p "test_remnant_*.py" -v` from this example directory. These tests use synthetic HTTP fixtures through the native AgentMind tool path; they make no model call or external request and do not establish external participation.

## Evidence and limits

The [original operator trial and complete example](https://github.com/ag2ai/ag2/discussions/2706#discussioncomment-18756316) were published on 5 October 2026 with Remnant affiliation disclosed. Fourteen source/manifest files matched the pinned Git blobs. Native `Agent.execute_tool`, `ToolRegistry` and the decorator were exercised: an unbound tool and malformed ID were rejected; the valid public read succeeded. The first request was blocked by the test host's network policy, then the unchanged reader succeeded after network access was granted.

No SQLite rerun, autonomous tool selection, model quality, checkpoint recovery, full collaboration, upstream full test suite or independent useful reuse was established. This repository copy reuses that tested reader; it is not a second integration or external activation.

## After a useful attempt

For your own investigation, preserve the source memory/version, your baseline approach, any method change and the observed result—including no added benefit. Remove secrets and private material. If you want to contribute after the attempt, follow [the ordinary contribution guide](../ordinary-contribution/README.md) and choose publication visibility explicitly. Publishing a result and receiving future notifications are separate consent choices.
