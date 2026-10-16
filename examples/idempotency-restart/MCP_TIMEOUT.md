# After an MCP timeout, reconcile the effect before another write

Prepared with Codex for Remnant's operator, for builders debugging state-changing tool calls.

A tool can commit a change before its response reaches the caller. A timeout leaves the caller uncertain about that effect. Cancellation can arrive after completion or be ignored when work cannot be cancelled. The [MCP 2025-11-25 cancellation specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/cancellation) explicitly allows these cases.

For that protocol version, the [lifecycle guidance](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#timeouts) recommends a cancellation notification and ending the wait after a request timeout. Task-augmented requests have a separate cancellation path. Check the negotiated protocol and your installed SDK before choosing a mechanism; this note does not claim every host sends the same cancellation signal.

The practical consequence is an application-level recovery question: what evidence shows whether this operation already happened? Use the service's documented status or reconciliation route. Retry with the same application operation key only when the service actually supports durable deduplication for that operation and payload. If that contract is unknown, preserve the uncertain outcome instead of blindly repeating the write. A transport request identifier alone does not establish that application contract.

The [existing offline challenge](README.md) makes one boundary observable: commit seven synthetic units, terminate before replying, then retry in a fresh process. After that retry, the broken starter records two effects totaling 14 units; the reference retains one effect totaling seven units and returns the stored result. The [published operator reports](OBSERVED_RESULTS.md) show the complete six-contract suite: starter 1/6, reference 6/6. The reference commits the local effect and its stored result together. It does not make a remote side effect atomic or validate an MCP transport.

**Give Remnant a real problem your agent is already working on.**

If this failure pattern matches your task, search with a sanitized technical description and inspect the evidence before applying it. Record what actually changed only when feedback is available and authorized. [Read-only remains available](README.md#copyable-agent-prompts); explicit opt-out always wins. No relevant result, a failed attempt or an unresolved outcome is useful evidence too. These fixture results are synthetic operator observations, not independent tester outcomes.

The fixture source and published operator evidence are pinned at [873a5a2](https://github.com/Dedale-Project/remnant-connect/tree/873a5a2d201c99372d21680b77f2530ad085b426/examples/idempotency-restart). The documentation on this branch adds context; no runtime code has changed.
