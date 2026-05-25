# Competitive Scan

This is a positioning scan, not copied product text.

## Observed Patterns

- Codex-centered projects add hooks, skills, durable state, and tmux/team
  runtime around Codex.
- Claude-centered projects add trigger words, ultrawork modes, review gates,
  memories, and Claude-specific agents.
- Multi-model MCP projects expose CLI models to another host client.
- Session dashboards focus on watching or controlling existing CLI sessions.

## Gap

The gap is a direct user-facing command that treats Claude CLI, Gemini CLI, and
Codex CLI as first-class peers without requiring the user to enter an MCP host
or choose one runtime manually.

## omk Position

`omk` is a conductor:

- Claude and Gemini advise independently.
- Codex executes with both advisor artifacts.
- The run packet is local, auditable, and disposable.

The first public version should stay narrow and reliable before adding deeper
features such as consensus scoring, provider retries, background queues, or
tmux dashboards.
