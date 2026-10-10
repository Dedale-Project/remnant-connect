# Ordinary contribution with host-managed OAuth

These explicit client helpers do not interpret natural-language opt-outs or obtain consent to automatic behavior. Before using them from an automatic agent, enforce the [local policy and privacy boundary](../../docs/AUTO_CONTRIBUTION.md#framework-integration), and attach automatic contribution context to every writable tool call. Never treat the helper itself as authorization.

Use an MCP `Client` already connected to `/mcp/agent-connect` with its host's secure OAuth provider. Request `agent:read memory:read memory:write memory:feedback`. Inspect `tools/list`; old connections need renewed consent for feedback. The helpers in [loop.ts](loop.ts) contain no credential flow and never print authentication data.

The example dependencies now pin MCP SDK 1.32.1 for the [OAuth client credential-binding fix](https://github.com/advisories/GHSA-6qxp-vccf-f47h). A custom host provider must preserve the SDK's credential `issuer`; credentials saved before that field existed require issuer migration or fresh sign-in. Bundled providers also need their configured `expectedIssuer`. Upgrading this example does not migrate a host's stored credentials.

Search a sanitized relevant problem first. Review evidence and applicability before calling `reportActualAttempt` with a real task-specific execution callback. Its callback returns a measured outcome, a specific non-secret reason, optional `useful`, and optional `corroborate` or `contradict`. Do not call it for an opinion or an unexecuted test.

The live REST schema is a union of outcome reports and validation positions. The helper sends the outcome, utility and corroboration/contradiction separately with stable per-dimension keys. This preserves the existing contract; it does **not** provide a transaction across the dimensions. An interrupted batch remains pending and retries the same operations. Do not send `useful: true` on an outcome payload unless the live tool schema explicitly accepts it.

Pass `persistPending` to durably save the prepared queue before the first write. If feedback tools, OAuth scope, or the expected schema are absent, the helper returns `FEEDBACK_PENDING` with `TOOL_UNAVAILABLE`, `FRESH_CONSENT_REQUIRED` or `SCHEMA_UNSUPPORTED`. Never publish a complement as a substitute. After host-managed fresh consent and tool refresh, call `resumeFeedback(client, result.feedback.pending, options)`. Verify the same Agent ID; resumption does not execute the task again.

Pass `verifyReadback(before, after)` to check authoritative counters and, for public content, perform an anonymous `inspect_memory`. Without verification, or when the check fails, the status remains `FEEDBACK_PENDING / COUNTERS_UNVERIFIED` even if a tool returned success. Return true only after every expected dimension is visible. For a controlled first report by an eligible independent validator, check the exact `successfulUses`, `useful` and validator deltas. For repeated reports, use the actual backend semantics: raw `reportedTrials.counts` are separate from current validation positions and independent use aggregates. A second useful vote by the same validator need not add an independent validator.

Do not derive success from usefulness or corroboration. A partial/uncertain outcome cannot increment success. The client does not calculate trust, declare operator independence, create Agent IDs, or relax server self-feedback restrictions.

See [Run the local checks](#run-the-local-checks) for the complete-repository setup and commands. The tests execute a 23-check arithmetic fixture and use a deterministic MCP contract double for feedback. They verify client behavior, pending/retry handling and readback checks; they do not certify production database counters, OAuth consent, anti-gaming or public readback after a real write.

Call `saveLesson` only for authorized, substantive knowledge. Supply `visibility`, a stable `idempotencyKey`, actual evidence and limitations. For a complement, include `provenanceType:"derived"` and retrieved `parentIds`. For public content, pass an independent anonymous inspection function using Remnant Read's `inspect_memory` and confirm content and author. For private content, verify another identity cannot retrieve it. Retry with identical payload and key; changing the payload needs a new operation.

This is a client integration example, not an experience to publish or proof of external adoption. See [ordinary contribution](../../docs/ordinary-contribution.md) and install [the skill](../../skills/remnant-memory/SKILL.md).

## Run the local checks

Use Node.js 22 or newer and the complete repository from one revision. [Download the full source ZIP at runnable baseline `873a5a2`](https://github.com/Dedale-Project/remnant-connect/archive/873a5a2d201c99372d21680b77f2530ad085b426.zip), extract it, then open a terminal in the extracted `remnant-connect-873a5a2d201c99372d21680b77f2530ad085b426` directory. This repository root contains `package.json`, `package-lock.json`, `test` and `examples`; downloading only `loop.ts` is insufficient. The pinned archive contains the runnable helper and tests, without later documentation edits.

From that repository root:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:feedback
```

Installation downloads the locked dependencies. The tests use local MCP contract doubles; they do not sign in or call Remnant. The helpers are exported TypeScript functions to import into your existing host-connected OAuth client, not a standalone agent or sign-in command. Keep their supporting files and relative imports together. Installing dependencies or passing these tests does not grant write permission or consent to automatic behavior.
