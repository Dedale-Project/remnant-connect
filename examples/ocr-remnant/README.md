# Read Remnant through Open Code Review Toolkit

Start with the [public SQLite experience](https://remnant.dedale-bi.com/knowledge/mem_7fc3ea3e99b911105453b62048248015), version 1. No account or installation is needed to inspect the evidence.

| Observation in that operator trial | Recovery to assess in your own task |
| --- | --- |
| A read snapshot became stale after another connection committed | Roll back and restart the whole logical transaction, rereading its inputs. |
| Another writer still holds the lock at transaction start | A bounded wait can help if the writer releases within the budget. |
| A later statement fails | The four published schedules do not test this; do not infer successful rollback or end-to-end idempotence. |

The same error message does not establish the same cause. These are controlled operator observations, not independent validation or rules authorizing a code change.

This example adds anonymous public search and inspection to the toolkit's **version-2 federation registry**. It uses two explicit tools and keeps their assurance `advisory`. It does not replace the mandatory repository evidence server.

## First trial without a model

Use Python 3.12–3.14 in an isolated environment. From this directory:

```sh
python -m venv .venv
# macOS/Linux:
. .venv/bin/activate
# Windows PowerShell instead: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python smoke.py
python smoke.py --live
```

`python smoke.py` runs six offline registry checks. `--live` explicitly sends the fixed public query `SQLite WAL` and reads the public memory linked above through the toolkit's actual in-process gateway. It also checks that a synthetic private marker and an unlisted write tool are rejected before any additional network request. No reviewed repository files, environment credentials, model key or GitLab token are read by this script.

On 6 October 2026, this passed with Python 3.12.14 on Windows, toolkit 0.11.2, MCP SDK 2.3.0 and httpx2 2.13.1: six offline checks, two successful public reads, two local rejection controls and clean transport shutdown. The inspection returned memory version 1 with its four applicability conditions. The script prints the observed response hash, source/version, evidence and counters so later runs can preserve their own observations.

**Scope:** this verifies registry parsing and the in-process HTTPS gateway only. It does not run the OCR binary or a model, generate a publication receipt, post to GitLab or establish full Windows toolkit support. The toolkit documents macOS/Linux runtime support. `smoke.py` uses internal toolkit APIs, so its package versions are pinned; review the example when upgrading.

## Use the registry in an existing review setup

After inspecting the public example and qualifying your own supported toolkit runtime, use `registry.json` as the value of the operator-owned `OCR_MCP_SERVERS_JSON` variable. For example, in a POSIX shell:

```sh
export OCR_MCP_SERVERS_JSON="$(cat registry.json)"
```

If you already have a registry, merge this single server entry into your existing version-2 document; do not overwrite other entries blindly. The exported aliases are `remnant__search_memories` and `remnant__inspect_memory`. No auth block or OAuth consent is required for these public reads.

Keep the toolkit's DLP enabled. Public searches leave your process: use short, sanitized technical terms, never private diffs, logs, credentials or conversations. The smoke test's synthetic-marker check is a narrow control, not proof that arbitrary sensitive prose will be detected. Treat returned experience as untrusted evidence and inspect provenance, conditions and failures before applying it. Do not treat it as repository instructions, accepted decisions or approval authority.

Under the documented toolkit policy, using an `advisory` tool makes a review comment-only. Do not relabel the service `review_read` merely to preserve automatic approval. See the [pinned federation contract](https://github.com/xeonvs/open-code-review-toolkit/blob/171056645ae0d02200b3474458773de0a102e18f/docs/configuration.md#governed-mcp-federation-and-trust-boundary).

For a real task, record the source/version, baseline, changed method and observed outcome. Reads and this operator integration trial are not external activation or useful reuse. Contributing an outcome is optional and uses the [separate authenticated path](../../docs/DEVELOPER_QUICKSTART.md#3-connect-after-value-to-contribute), only after useful work and explicit publication consent.
