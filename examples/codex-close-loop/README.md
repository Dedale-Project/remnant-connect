# Optional trusted local Codex hooks

This standalone example adds the versioned Remnant instruction as `SessionStart` developer context and supplies one bounded `Stop` recovery pass. It imports only Node.js standard libraries. It is outside the portable marketplace package and contains no backend, credentials or network calls.

The hooks do not connect Remnant Agent, obtain consent, expand scopes or publish. Explicit opt-outs always win. Set `REMNANT_LOOP_HOOK_ENABLED=off` to disable them. Node.js 22 or newer must be on PATH.

## Install in a trusted local environment

Review `hook.mjs`, `instructions.txt` and `hooks.json` first. Add this example to an existing local marketplace with source path `./examples/codex-close-loop`, then install `remnant-local-close-loop`. The compatibility manifest is `.codex-plugin/plugin.json`. Review and trust the exact hook definitions in Codex `/hooks`; installation alone does not grant hook trust. Start a new chat and confirm `SessionStart` execution. Subsequent code changes need host trust review again.

Alternatively, add command hooks to a trusted project's `.codex/hooks.json` using absolute paths:

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "node /ABSOLUTE/PATH/TO/examples/codex-close-loop/hook.mjs", "commandWindows": "node C:/ABSOLUTE/PATH/TO/examples/codex-close-loop/hook.mjs", "additionalContextLimit": 5000, "timeout": 5}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node /ABSOLUTE/PATH/TO/examples/codex-close-loop/hook.mjs", "commandWindows": "node C:/ABSOLUTE/PATH/TO/examples/codex-close-loop/hook.mjs", "timeout": 5}]}]
  }
}
```

Quote paths inside command strings when they contain spaces. This repository does not alter global configuration or trust records. Hook behavior was checked against the Codex CLI 0.162.0-alpha.2 contract; the [acceptance record](../../docs/CLOSE_LOOP_ACCEPTANCE.md) does not claim an installed-host PASS.

## Optional trusted host completion receipt

If an embedding host owns a completion guard, it can await its local assessment, authorized feedback/contribution and readback, then call `writeHostDecision`. Set `REMNANT_LOOP_STATE_DIR` to a private directory managed by that host. Match both `sessionId` and `turnId`. The helper accepts a bounded `decision` with `ready`, `blocked`, `pendingActions` and `reasonCode`; it never accepts memory text or a transcript.

Never expose the writer as a model tool or treat a model-created completion boolean as a receipt. This file format is not cryptographic proof or a sandbox against an agent that can write the same directory. The example does not install an embedding host callback. Without a valid matching receipt, Stop asks for one recovery pass; `stop_hook_active` then reports unconfirmed state instead of looping.

## Timing and Work

Stop can run after a model answer. Recovery is not proof that contribution preceded the first final response. A strict barrier needs the host to await its checks before its own final-answer callback.

Local-only Work may support local hooks; cloud-orchestrated Work does not execute local plugin command hooks. Enterprise admin MCP hooks are a separate setup. Test an actual fresh Work session independently. See [MCP server instructions](https://developers.openai.com/plugins/build/mcp-server), [plugin trust](https://developers.openai.com/plugins/build/plugins), [hooks](https://learn.chatgpt.com/docs/hooks) and [Work compatibility](https://learn.chatgpt.com/docs/plugins).

Run `npm run test:close-loop` from the repository root. These tests use local synthetic events only and make no production contribution.
