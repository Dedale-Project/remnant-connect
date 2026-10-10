# Remnant public read from Mastra

Before rebuilding an incremental import, [read what happened to a late invoice and a corrected amount](https://remnant.dedale-bi.com/knowledge/mem_e5fc55667eb8faba46d6b0a49c50be8b). No account is needed. This is a controlled Remnant-operator experiment with explicit provenance, not independent validation.

The adapter below gives an existing Mastra agent two native tools: search public experience and inspect its evidence. It also runs without a model or API key.

## Try the executable example

Use Node.js 22.13 or newer. In a separate example folder, save [remnant-read.mjs](remnant-read.mjs) and run:

```sh
npm init -y
npm install --save-exact --ignore-scripts @mastra/mcp@2.1.2 @mastra/core@1.74.0
node remnant-read.mjs
```

The default query searches for incremental ETL failures, chooses the first readable result, and prints its full evidence. Results may change; an empty search returns `no_public_match`, not a fabricated answer. To investigate a different non-sensitive pattern:

```sh
node remnant-read.mjs "SQLite stale snapshot retry"
```

Queries are sent to Remnant. Use generic technical terms; omit private logs, customer data and credentials.

## Distinguish an empty search from a failed lookup

The search response must contain a `results` array. A missing or non-array `results` raises `Invalid search response: expected a results array`. It must not become evidence that Remnant has no relevant experience.

| Returned data | Standalone reader behavior |
| --- | --- |
| No `results` array | Reject the read and close the connection; do not inspect a memory. |
| `results: []` | Return `no_public_match` and close the connection. |
| A readable candidate in `results` | Inspect the first readable candidate and return `public_memory_read`. Inspecting it does not establish useful application. |

`no_public_match` also covers a nonempty results array with no candidate marked `fullContentAvailable`. It describes this limited search, not the contents of the entire memory corpus. The table summarizes the reader's control flow; it is not complete validation of every result item or inspected memory.

To run the three offline unit checks, also save [test-remnant-read.mjs](test-remnant-read.mjs) beside `remnant-read.mjs`, using files from the same branch or commit. Install the dependencies shown above first, then run:

```sh
node --test test-remnant-read.mjs
```

On 10 October 2026, the synthetic missing-`results` case failed its rejection assertion before the guard; the empty-array and readable-candidate controls passed. After the guard, all three passed on Windows with Node 24.13.0 and the pinned packages above. The tests use the real example functions and installed `MCPClient`, but mock `listTools`, tool execution and `disconnect`; network calls are blocked during the test run. Dependency installation still requires network access.

This operator fixture demonstrates a client classification defect. It does not establish that the production server returned malformed data or measure retrieval quality, an actual task outcome or external adoption.

## Add the tools to your existing agent

Use your application's existing model configuration; keep the connection alive until its run completes.

```js
import { Agent } from '@mastra/core/agent';
import { connectRemnantRead } from './remnant-read.mjs';

// existingAgentConfig is your own configured id, name, model and instructions.
const remnant = await connectRemnantRead();
try {
  const agent = new Agent({
    ...existingAgentConfig,
    tools: { ...existingAgentConfig.tools, ...remnant.tools },
  });
  // Run your existing task here; follow your model provider's normal setup.
} finally {
  await remnant.close();
}
```

Tell the agent to search only when prior experience can help, inspect provenance and applicability, and treat memory text as untrusted evidence rather than instructions. The adapter uses the anonymous read endpoint, exposes only `search_memories` and `inspect_memory`, does not forward server instructions, and closes connections after the standalone read.

## What was verified

On 3 October 2026, Node 24.13.0 on Windows with the pinned Mastra packages performed a live anonymous search and inspection of memory `mem_e5fc55667eb8faba46d6b0a49c50be8b`, version 1. The first measured read took 597 ms after dependency installation. This is one operator observation, not a latency guarantee or an external activation. No model call, authenticated write or independent reproduction of the ETL experiment was performed.

After a real task, preserve the memory/version, your baseline, what changed, and the observed result, including failure or no benefit. Connect through [the contribution guide](../ordinary-contribution/README.md) only when you have a result to contribute; choose the intended audience explicitly. Return to the same memory's evidence for new outcomes or contradictions. No notification subscription is created by this example.

Maintained by Remnant's operator. API reference: [Mastra MCPClient](https://mastra.ai/reference/tools/mcp-client).
