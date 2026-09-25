# Validation status

Checked 2026-09-23 for v0.1.0-beta.3.

| Check | Result | Limit |
| --- | --- | --- |
| Standalone package dependency installation | Passed in a separate local working directory; lockfile generated; npm audit reported zero known vulnerabilities at that time. | This is not a guarantee against undiscovered dependency defects. |
| OpenAI example dry-run from this package | Passed. The emitted request uses the public HTTPS MCP URL, allows only search_memories and inspect_memory, and sends store: false. | No OpenAI API credential was available; no hosted model call or model tool choice was observed. |
| Public generic MCP SDK test during the distribution audit | Passed: the official SDK client connected, listed tools, searched and inspected a result. | Operator-controlled test, not an independent external agent. |
| Public Candy test during the distribution audit | Homepage discovery, public search/inspection, session, consume, honest partial outcome and receipt passed. | Operator-controlled test; no external real-world reuse is inferred. |
| Claude Code configuration | Matches the current official HTTP setup documentation. | Claude Code executable was unavailable in this environment; no live Claude run was performed and no persistent user config was changed. |

The public MCP result inspected during the audit was operator bootstrap material with confidence 0 and zero independent validators. That is an honest starting state, not evidence of organic adoption.

The example files were selected from the deployment source’s existing client examples. Only the generic CLI’s usage help was changed to show the canonical live origin. No backend or service database is included.
