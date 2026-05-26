# Oh My Kamisama Strategy

## North Star

`omk` should be the one-command conductor for extreme vibe coding:

```bash
omk "I want this product-quality feature; figure out the path and ship it"
```

The tool is intentionally not token-frugal. It should spend multiple agents when
that improves judgment, visibility, and confidence.

## Borrowed Concepts

### divecode

Adopt the genie principle: agents grant wishes literally, so `omk` must surface
missing constraints before generating brittle code.

Practical translation:

- Advisor outputs include `Dive questions`.
- Executor prompts warn against silently inventing high-risk requirements.
- Future pack detection should trigger domain-specific questions before code.

### AI-DLC

Adopt the lifecycle shape:

- Inception: clarify requirements, risks, architecture.
- Construction: implement with tests and verification.
- Operations: summarize deployment, monitoring, and handoff concerns.

Practical translation:

- Advisor outputs include `AI-DLC phase and gates`.
- Future `omk plan` should emit an AI-DLC packet under `.omk/plans/`.

### OMX

Adopt durable goal state, team fanout, and cmux-aware panes.

Practical translation:

- `omk tools` detects `omx`.
- Future `omk goal` should call `omx ultragoal create-goals`.
- Future `omk team` should route heavy tasks into `omx team` when available.

### OMO / opencode

Adopt additional model scouting and cmux-native split visibility.

Practical translation:

- `omk tools` detects `opencode` and `cmux omo`.
- Future `omk --with-opencode` should add an opencode scout/reviewer lane.
- Keep opencode optional until auth/runtime variance is smoother.

### cmux

Adopt visible background runs.

Practical translation:

- `omk bg` starts long runs without blocking the terminal.
- `omk ps`, `omk logs`, `omk tail`, and `omk kill` make those runs inspectable.
- `omk cockpit` creates a cmux workspace with status/watch and runner panes.
- Future cmux integration should add native status badges and lane-specific panes.

## Roadmap

### v0.2: Visible conductor

- Tool detection for Claude, Codex, Gemini, opencode, OMX, cmux.
- Background execution with local job state.
- Witty original README assets.
- Strategy document and public smoke tests.

### v0.3: cmux cockpit

- `omk cockpit` opens a cmux workspace for visible background execution.
- `omk watch` refreshes job status and stdout/stderr tails.
- Offline fake-CLI tests cover the conductor and cockpit generator without model calls.

### v0.4: Interactive shell

- `omk` with no arguments opens an interactive prompt.
- Shell commands route natural-language tasks through selected modes.
- The prompt can switch repo/mode and inspect jobs without leaving the session.

### v0.5: Agent Cat usage router

- `omk agents` reads Agent Cat Connectors snapshots for Codex/Claude/Gemini.
- Interactive startup shows provider availability, quota, activity, and route.
- `omk auto` chooses Codex/Claude by remaining quota and asks before Gemini fallback.
- npm postinstall checks or installs Agent Cat Connectors unless opted out.

### v0.6: Deep wish interrogation

- `omk plan` creates `.omk/plans/<run>/` with requirements, risks, gates, and
  open questions.
- Pattern pack detection inspired by divecode.
- `omk run` can pause when a high-risk unanswered question is found.

### v0.7: Goal and team adapters

- `omk goal` wraps `omx ultragoal` when installed.
- `omk team` wraps `omx team` or cmux panes for large work.
- `omk --with-opencode` adds opencode as scout/reviewer.

### v0.8: Dashboard mode

- Terminal status UI with active lanes, durations, exit codes, and artifact
  links.
- cmux surface integration for agent panes.
- Run history search.

## Detection Needed

- Auth readiness for each CLI without making a model call.
- Repo risk profile: tests, CI, package managers, deployment config.
- Domain pack triggers: auth, payment, telemetry, cache, cron, DB migration,
  admin dashboard, macOS app, web app, release automation.
- Runtime mode: plain terminal, tmux, cmux, CI.

## Non-goals

- Do not replace Claude Code, Codex CLI, Gemini CLI, OMX, OMO, or cmux.
- Do not claim leaked/private internals as product foundation.
- Do not hide failures. Every lane gets artifacts and exit codes.
