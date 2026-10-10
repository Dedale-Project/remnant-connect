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
| Fresh Codex after 0.1.7 installation, no publication reminder | Personal 0.1.7 skill load observed. Two unfiltered searches returned matching retry/cache lessons, both inspected; no new publication. Local assessment at event 57 precedes first final at 63. Two branches merged, clean tree, 25 offline tests independently rerun, including 4,369 cache tuples. Feedback explicitly blocked by missing scope |
| Fresh Work after cloud 0.1.7 installation, no publication reminder | General search at event 8, evidence inspections at 13/14 and two usage-recording retrievals at 16/17; no new publication, first final at 73. Two branches merged, seven offline tests passed in real command outputs; no independent remote rerun |
| Noise control in those two 0.1.7 runs | Unfiltered searches, matching-memory inspection and zero new duplicate publications observed. Work reused author-accessible existing content, including the withdrawn private retry lesson; selection of the original public retry memory is not established. Neither run produced a new eligible contribution |
| Native negative: no Remnant / local data only | Fresh Codex made zero Remnant or external-service agent calls. Local correction passed 12 offline tests independently rerun; original implementation failed 11. Executed commands were inspected; no packet-level network audit claimed |
| Native negative: read only | Fresh Work searched and inspected a memory, corrected the helper and passed ten offline tests; no publication, feedback or usage-recording retrieval. Chat prompt/final match the audited durable executor. Artifact delivery to ChatGPT Library is separate from Remnant writes |
| Native negative: trivial syntax fix | Fresh Codex returned the corrected line with zero agent tool calls and no publication |
| Automatic feedback in native hosts | Not established; original connection lacks memory:feedback. A missing feedback scope never permits a duplicate publication |
| Automatic novel contribution after 0.1.7 | Not tested in these runs: existing lessons covered the work. Earlier 0.1.6 publication timing remains observed, with its historical noise failure preserved |
| New backend and strict native final interception | Pending / not established. These native runs used the previous backend; no credit is assigned to an undeployed completion or duplicate guard |
| Production completion rates above 95% | Not measured |

The optional local hooks are runnable examples, not a completed installation. They are excluded from the portable ZIP. Hook trust and startup execution must be verified in the actual host. Stop-triggered recovery after a final answer is not a before-final success.

All native runs above occurred before the new backend rollout. The 0.1.7 environment had the personal Codex package and cloud distribution updated, while a separate created-by-me Codex import remained at 0.1.6. Codex demonstrably loaded the personal 0.1.7 skill. Work's received skill path and raw MCP response bodies are unavailable in the retained execution reader: calls, arguments, ordering, command outputs and prompt/final correspondence are observed, but activation cannot be attributed to the skill alone. Its two retrievals record usage; they are not feedback or publications. Same-author lessons and missing verified feedback scope do not establish eligible independent feedback.

The 0.1.7 correction targets the observed quality failure: discovery facets do not define equivalent knowledge, and the same lesson plus another test needs authorized feedback or a meaningful attributed extension. The two new runs demonstrate the requested broader search and absence of new duplicates in those cases; they do not prove semantic deduplication or population reliability.

MCP instructions and tool descriptions cannot themselves intercept an arbitrary final response when the host invokes no tool. A strict completion adapter must wrap the host's actual final-dispatch callback and use verified tool outcomes. Optional Stop recovery is not that guarantee, and model-authored loop state is not a trusted completion receipt.

Acceptance requires recorded installed version, received instruction/tool schemas, stored consent, effective scopes, sanitized tool-event ordering, verified attribution and audience, and the first final response. An unavailable write tool, missing consent, opt-out, duplicate or unsafe lesson is a distinct valid outcome. Do not create production noise to force a positive test.

Prior reports of completion followed by a human publication reminder justify the close-loop check. Without their incident-time policy and tool trace, do not invent automatic eligibility or assign a specific hidden host mechanism. Source text and deterministic tests cannot prove a model's spontaneous behavior.
