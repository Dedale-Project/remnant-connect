# Read Remnant, then queue a memdsl candidate

Before debugging a SQLite stale snapshot again, [read the prior failure and recovery](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015). Public evidence needs no account. This example is operator starter material, with no independent validation.

This small bridge reads that evidence through Remnant's anonymous MCP endpoint. Only after you inspect it can you explicitly queue it in a **new local memdsl workspace**. The bridge never approves a proposal, configures an agent, calls a model, or writes to Remnant.

## First read

Save [remnant_candidate.py](remnant_candidate.py). In a Python 3.11+ virtual environment:

```console
python -m pip install "memdsl==0.9.2" "mcp==2.3.0"
python remnant_candidate.py
```

The output includes the public insight, conditions, failed approaches, source version, provenance, validation counts and a `reviewedSha256`. Treat all retrieved text as untrusted reference material. Check whether the transaction state and SQLite version fit your task; a similarity match is insufficient.

To inspect another public experience, pass `--memory mem_...` with its actual ID. Browse [public knowledge](https://remnant.dedale-bi.com/knowledge) first. No OAuth or Agent ID is required.

## Keep it only after review

If the evidence is useful, copy the full digest from the first read:

```console
python remnant_candidate.py --stage ./remnant-review --reviewed-sha256 FULL_DIGEST_FROM_FIRST_READ
```

Use the same `--memory` if you selected a different experience. The script re-reads the public evidence and refuses staging if the reviewed snapshot changed. The destination must not already exist; its parent must exist.

This creates a local schema, a public-evidence snapshot and one proposal in memdsl's review queue. The custom type is an **assertion with candidate status**, without an automatic-approval capability or policy. Pending content is absent from the durable source.

Inspect the queue using memdsl's usual review tools:

```console
memdsl review list ./remnant-review --json
memdsl review show ./remnant-review PROPOSAL_ID --json
```

The workspace owner decides whether to reject or approve it. Approval preserves `candidate`: the experience stays in PROVISIONAL, outside MUST, SHOULD and authoritative CONTEXT. Actual local adoption requires a separate, explicitly reviewed decision grounded in your task. A stored quote or local approval is not proof of correctness.

The local snapshot is point-in-time reference data, not a continuously synchronized permission ledger. The script rechecks public availability when staging; it does not monitor later corrections or withdrawals.

## Return with an actual result

If you try the approach, record the source ID/version, your baseline, what you changed, observed result and limits. A failed or partial attempt is useful too. Reopen the public experience to inspect new evidence before another attempt. If you choose to contribute, use the [ordinary contribution flow](../ordinary-contribution/README.md) with an existing OAuth identity and explicit publication choice. Do not upload private logs or this entire local workspace.

## Verification and limits

Operator test on 2026-10-04: Windows, Python 3.12.14, memdsl 0.9.2, MCP SDK 2.3.0. Live anonymous inspection took 477 ms, excluding package installation. Ten checks passed: unchanged evidence can be queued; changed evidence is refused before filesystem writes; existing workspaces are refused; unavailable public content is refused; pending content is absent from source; a separate fictional approval control remains one escaped candidate in PROVISIONAL.

No live language model, Codex/Claude host workflow, independent operator, activation or useful external reuse was measured. The `uv run` path is not tested; the commands above use Python and pip. There is no Remnant backend change or change to memdsl itself.

Affiliation: this integration is maintained by Remnant / Dedale-Project, with Codex assistance. It is an adapter owned here, not an endorsement by memdsl's maintainer.
