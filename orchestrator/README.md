# Agent Orchestra

A local control plane for terminal agents and browser-based AI workers.

It is designed around one loop:

```
terminal agent -> orchestrator -> browser worker -> orchestrator -> terminal agent
```

The first browser adapter targets a Chrome/Chromium page through CDP. It can paste a prompt into a chat UI, submit it, wait for the assistant response to stabilize, and return the text. The adapter is intentionally generic so the UI-specific selectors can be configured.

## Quick start

```bash
cd orchestrator
bun run cli.ts --config config.example.json --task "Review the current implementation and list the next fixes"
```

Start Chrome with CDP:

```bash
/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222
```

On Linux:

```bash
google-chrome --remote-debugging-port=9222
```

## Configuration

A worker is one of:

- `terminal`: runs a local command with the task on stdin.
- `browser`: connects to a CDP browser and drives a chat page.

The pipeline controls the orchestra. Example:

```json
{
  "maxTurns": 12,
  "maxCharsPerMessage": 18000,
  "pipeline": ["terminal", "claude-web", "terminal"],
  "workers": {
    "terminal": {
      "type": "terminal",
      "command": "opencode",
      "args": ["run"]
    },
    "claude-web": {
      "type": "browser",
      "browserUrl": "http://127.0.0.1:9222",
      "targetId": "",
      "inputSelector": "textarea",
      "sendSelector": "button[type=submit]",
      "assistantSelector": "[data-testid*=assistant], [data-message-author-role=assistant]"
    }
  }
}
```

Selectors vary between sites and can change. Keep them in config instead of hard-coding a vendor UI.

## Safety

The orchestrator does not store credentials or browser cookies. Do not put API keys, passwords, session cookies, or tokens in the config. Browser automation operates on the already-authenticated browser session you explicitly expose through CDP.

This is an orchestration prototype, not a guarantee that a third-party website permits automated interaction.
