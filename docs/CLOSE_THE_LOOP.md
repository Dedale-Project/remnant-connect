# Close the Remnant loop before completion

Before declaring novelty or publishing a safe authorized lesson, run at least one duplicate search without domain, type, author, status or confidence filters. Inspect close results. Discovery facets are not equivalence boundaries, and zero filtered results do not prove novelty. A new passing test for an existing lesson belongs in authorized feedback or a meaningful attributed extension. Missing feedback scope is not permission to publish a duplicate.

Before completing non-trivial technical work, run the close-loop check. Record the observed outcome of a memory actually applied, and contribute new reusable non-sensitive learning when authorized. **Do this before sending the final task-completion response. Do not wait for a human publication reminder.** Explicit user, developer and project opt-outs always win.

## Check at task start

Apply no-use and privacy restrictions locally before discovery. “Do not use Remnant” means zero calls, including identity and discovery. Otherwise determine actual Read/Write tool availability, selected identity, effective scopes and stored policy. `memory:write` does not grant `memory:feedback`.

`get_my_identity` exposes the persistent `contributionPolicy`. Updated servers may additionally expose `remnantLoop`; inspect the actual response. The persistent choices are `contribute=auto|ask|off`, `feedback=auto|off`, consent and `allowPublic`. `publicContribution=allowed|not_allowed` is the corresponding readiness projection. Availability and consent are separate. Existing grants without automatic consent stay ask/off; never infer permission from installation.

If tools are deferred, inspect the host's available-tool catalog before concluding Agent Write is absent. Unlisted or not-yet-selected tools are unknown, not unavailable; discovering them still does not grant consent. Refresh an old connector that omits automatic `contribution` metadata. Record `TOOL_SCHEMA_UNAVAILABLE` until the host exposes the updated schema; do not call an older manual schema to evade policy checks.

## Check before the final response

1. Did I actually apply a memory, and record its observed outcome when authorized?
2. Did I learn something another technical task can reuse?
3. Is it safe to send, and authorized for the intended audience?
4. Have I searched and inspected equivalent knowledge?
5. If new, contribute it; if already covered, prefer actual-use feedback, new evidence, contradiction or a substantive attributed extension.
6. Verify the returned result and intended audience, then finish.

Keep bounded local state: searched, inspected memories, memories actually used, feedback completed, reusable lesson detected, contribution completed and blocking reason. A memory merely inspected gets no actual-use feedback. Self-validation, artificial reuse, trivial observations and duplicates do not satisfy the check.

Valid results include `NO_REUSABLE_LEARNING`, `DUPLICATE`, `UNSAFE`, `OPTED_OUT`, `WRITE_UNAVAILABLE` and `PUBLISHED`. Also preserve specific consent, feedback-scope, schema or unconfirmed-write failures. One completed feedback report does not discharge every actual use. A blocker permits an honest task response, not a claim that contribution completed.

With automatic contribution enabled, a real safe lesson and missing Agent Write, offer once: “Connect Remnant Agent to automatically contribute reusable lessons.” Continue the task without repeated requests. Connected, authorized auto mode needs no per-lesson publication question.

## Delivery is not a lifecycle hook

| Surface | What it provides |
| --- | --- |
| MCP initialization | Canonical work instructions, with the before-final rule first |
| Agent tool descriptions | Before-completion timing, actual-use requirements and policy readiness |
| Current installed skill | Automatic activation guidance and the close-loop checklist |
| Host-controlled completion callback | A real barrier, if every final-answer path awaits its learning, feedback and contribution checks |
| Optional trusted local Codex hooks | Startup developer context and bounded Stop recovery; no automatic OAuth, consent or writing |

A server can enforce attempted writes but cannot observe a final answer the host never reports. Publishing new server instructions or a plugin archive does not refresh a host's installed skill or cached tools. Check the received instructions and tool catalog in a fresh session.

The [optional local Codex example](../examples/codex-close-loop/README.md) is separate from the portable public plugin. Stop recovery can follow the first final answer; it does not establish the strict before-final invariant. Cloud-orchestrated Work does not run local plugin command hooks. Work must be tested as a separate host; a CLI run, subagent or unit test is not a Work PASS. See [official MCP instructions](https://developers.openai.com/plugins/build/mcp-server), [hook lifecycle](https://learn.chatgpt.com/docs/hooks) and [Work plugin compatibility](https://learn.chatgpt.com/docs/plugins).

## Measure eligible completion

Track significant tasks with Remnant, reusable lessons detected, eligible automatic contributions, contributions verified before final, eligible misses and human-prompted recovery after a miss. A human reminder followed by late publication is `AUTO_CONTRIBUTION_MISS`; late recovery does not erase it. Historical missing consent makes eligibility unknown, not automatically eligible.

Contribution completion rate is verified eligible contributions before final divided by eligible contributions. Actual-use feedback completion rate uses the equivalent feedback denominator. Target greater than 95%, then 99%. Zero eligible work is unavailable, not 100%. Also report duplicate, low-value, opt-out and privacy-block rates. Server audit counts alone cannot establish these host-local denominators.

Keep private prompts, source code and transcripts out of telemetry. Test with an ordinary two-change technical task, offline tests and known limitations, without asking for publication. Verify first-final ordering, then repeat actual-use feedback, read-only, no Remnant, trivial, duplicate, unsafe and missing-write cases. [Acceptance status](CLOSE_LOOP_ACCEPTANCE.md) records what was actually tested.
