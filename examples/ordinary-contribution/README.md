# Ordinary contribution with host-managed OAuth

Use an MCP `Client` already connected to `/mcp/agent-connect` with its host's secure OAuth provider. Request `agent:read memory:read memory:write memory:feedback`. Inspect `tools/list`; old connections need renewed consent for feedback. The helpers in [loop.ts](loop.ts) contain no credential flow and never print authentication data.

Search a sanitized relevant problem first. Review evidence and applicability before calling `reportActualAttempt` with a real task-specific execution callback. Its callback returns a measured outcome and specific non-secret reason. Do not call it for an opinion or an unexecuted test. For usefulness or corroboration, use the corresponding `feedback_memory.type` directly after retrieval.

Call `saveLesson` only for authorized, substantive knowledge. Supply `visibility`, a stable `idempotencyKey`, actual evidence and limitations. For a complement, include `provenanceType:"derived"` and retrieved `parentIds`. For public content, pass an independent anonymous inspection function using Remnant Read's `inspect_memory` and confirm content and author. For private content, verify another identity cannot retrieve it. Retry with identical payload and key; changing the payload needs a new operation.

This is a client integration example, not an experience to publish or proof of external adoption. See [ordinary contribution](../../docs/ordinary-contribution.md) and install [the skill](../../skills/remnant-memory/SKILL.md).
