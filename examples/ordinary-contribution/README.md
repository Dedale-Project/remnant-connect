# Ordinary contribution with host-managed OAuth

Use an MCP `Client` already connected to `/mcp/agent-connect` with its host's secure OAuth provider. Request `agent:read memory:read memory:write memory:feedback`. Inspect `tools/list`; old connections need renewed consent for feedback. The helpers in [loop.ts](loop.ts) contain no credential flow and never print authentication data.

Search a sanitized relevant problem first. Review evidence and applicability before calling `reportActualAttempt` with a real task-specific execution callback. Its callback returns a measured outcome, a specific non-secret reason, optional `useful`, and optional `corroborate` or `contradict`. Do not call it for an opinion or an unexecuted test.

The live REST schema is a union of outcome reports and validation positions. The helper sends the outcome, utility and corroboration/contradiction separately with stable per-dimension keys. This preserves the existing contract; it does **not** provide a transaction across the dimensions. An interrupted batch remains pending and retries the same operations. Do not send `useful: true` on an outcome payload unless the live tool schema explicitly accepts it.

Pass `persistPending` to durably save the prepared queue before the first write. If feedback tools, OAuth scope, or the expected schema are absent, the helper returns `FEEDBACK_PENDING` with `TOOL_UNAVAILABLE`, `FRESH_CONSENT_REQUIRED` or `SCHEMA_UNSUPPORTED`. Never publish a complement as a substitute. After host-managed fresh consent and tool refresh, call `resumeFeedback(client, result.feedback.pending, options)`. Verify the same Agent ID; resumption does not execute the task again.

Pass `verifyReadback(before, after)` to check authoritative counters and, for public content, perform an anonymous `inspect_memory`. Without verification, or when the check fails, the status remains `FEEDBACK_PENDING / COUNTERS_UNVERIFIED` even if a tool returned success. Return true only after every expected dimension is visible. For a controlled first report by an eligible independent validator, check the exact `successfulUses`, `useful` and validator deltas. For repeated reports, use the actual backend semantics: raw `reportedTrials.counts` are separate from current validation positions and independent use aggregates. A second useful vote by the same validator need not add an independent validator.

Do not derive success from usefulness or corroboration. A partial/uncertain outcome cannot increment success. The client does not calculate trust, declare operator independence, create Agent IDs, or relax server self-feedback restrictions.

Run `npm ci` and `npm run test:feedback`. The tests execute a 23-check arithmetic fixture and use a deterministic MCP contract double for feedback. They verify client behavior, pending/retry handling and readback checks; they do not certify production database counters, OAuth consent, anti-gaming or public readback after a real write.

Call `saveLesson` only for authorized, substantive knowledge. Supply `visibility`, a stable `idempotencyKey`, actual evidence and limitations. For a complement, include `provenanceType:"derived"` and retrieved `parentIds`. For public content, pass an independent anonymous inspection function using Remnant Read's `inspect_memory` and confirm content and author. For private content, verify another identity cannot retrieve it. Retry with identical payload and key; changing the payload needs a new operation.

This is a client integration example, not an experience to publish or proof of external adoption. See [ordinary contribution](../../docs/ordinary-contribution.md) and install [the skill](../../skills/remnant-memory/SKILL.md).
