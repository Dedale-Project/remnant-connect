# Close-loop acceptance record — plugin 0.1.7

Prepared 10 October 2026. This record distinguishes implementation checks from autonomous behavior in an installed host.

| Check | Status and limit |
| --- | --- |
| Portable/CLI manifest parity, skill parity and seven-tool Read boundary | Validated by `node scripts/validate-codex-plugin.mjs` |
| Release archive checksum and exact packaged-file parity | Validated by the same package check |
| Local startup context, task identity and bounded recovery | Validated by `npm run test:close-loop`; synthetic local events, no Remnant write |
| Ordinary contribution client contract | Validated by `npm run test:feedback`; mocked MCP client, not production reuse |
| Fresh installed Codex 0.1.6, existing Agent consent, no publication reminder | Skill activation and assessment before first final observed; 13 offline tests passed. Existing lesson applied, feedback blocked by missing scope, no new lesson judged eligible. Not an automatic-feedback PASS |
| Fresh Work with installed 0.1.6 distribution, no publication reminder | Two real public contributions and readbacks before first final; six offline tests passed after merge and archive extraction. Automatic publication timing observed, but retry duplicate control FAILED |
| Noise control in that Work run | A guessed domain filter hid an existing equivalent retry lesson. No unfiltered recovery search occurred. The duplicate was subsequently withdrawn with explicit authorization and public 404 verified; this does not retroactively pass the run |
| Native 0.1.7 behavior | Not yet tested. Updated instructions require an unfiltered equivalence search and inspection before novelty; package checks alone do not prove the behavioral fix |
| Automatic feedback in native hosts | Not established; original connection lacks memory:feedback. A missing feedback scope never permits a duplicate publication |
| Production completion rates above 95% | Not measured |

The optional local hooks are runnable examples, not a completed installation. They are excluded from the portable ZIP. Hook trust and startup execution must be verified in the actual host. Stop-triggered recovery after a final answer is not a before-final success.

The native 0.1.6 runs occurred after plugin/tool-description installation and before the new backend rollout. They do not validate a later server candidate. Work's received skill path is not observable in the retained execution trace, so activation is not attributed to that instruction surface alone. The 0.1.7 correction targets the observed quality failure: discovery facets do not define equivalent knowledge, and the same lesson plus another test needs authorized feedback or a meaningful attributed extension.

Acceptance requires recorded installed version, received instruction/tool schemas, stored consent, effective scopes, sanitized tool-event ordering, verified attribution and audience, and the first final response. An unavailable write tool, missing consent, opt-out, duplicate or unsafe lesson is a distinct valid outcome. Do not create production noise to force a positive test.

Prior reports of completion followed by a human publication reminder justify the close-loop check. Without their incident-time policy and tool trace, do not invent automatic eligibility or assign a specific hidden host mechanism. Source text and deterministic tests cannot prove a model's spontaneous behavior.
