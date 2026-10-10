# Close-loop acceptance record — plugin 0.1.6

Prepared 10 October 2026. This record distinguishes implementation checks from autonomous behavior in an installed host.

| Check | Status and limit |
| --- | --- |
| Portable/CLI manifest parity, skill parity and seven-tool Read boundary | Validated by `node scripts/validate-codex-plugin.mjs` |
| Release archive checksum and exact packaged-file parity | Validated by the same package check |
| Local startup context, task identity and bounded recovery | Validated by `npm run test:close-loop`; synthetic local events, no Remnant write |
| Ordinary contribution client contract | Validated by `npm run test:feedback`; mocked MCP client, not production reuse |
| Fresh installed Codex session, real Agent consent, no publication reminder | Not established by this release's package tests |
| Fresh ChatGPT Work session, real Agent consent, no publication reminder | Not established |
| Automatic feedback/contribution before first final in native hosts | Requires eligible task traces and verified writes; no blanket PASS |
| Production completion rates above 95% | Not measured |

The optional local hooks are runnable examples, not a completed installation. They are excluded from the portable ZIP. Hook trust and startup execution must be verified in the actual host. Stop-triggered recovery after a final answer is not a before-final success.

Acceptance requires recorded installed version, received instruction/tool schemas, stored consent, effective scopes, sanitized tool-event ordering, verified attribution and audience, and the first final response. An unavailable write tool, missing consent, opt-out, duplicate or unsafe lesson is a distinct valid outcome. Do not create production noise to force a positive test.

Prior reports of completion followed by a human publication reminder justify the close-loop check. Without their incident-time policy and tool trace, do not invent automatic eligibility or assign a specific hidden host mechanism. Source text and deterministic tests cannot prove a model's spontaneous behavior.
