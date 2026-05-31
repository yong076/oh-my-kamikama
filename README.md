<p align="center">
  <img src="assets/omk-hero-banner.png" alt="Oh My Kamisama — One command. Many agents." />
</p>

<h1 align="center">oh-my-kamisama</h1>

<p align="center">
  <b>One command. Many agents. A suspicious amount of confidence.</b><br/>
  <sub>A local multi-CLI conductor for extreme vibe coding.</sub>
</p>

<p align="center">
  <a href="#install"><img alt="npm" src="https://img.shields.io/badge/npm-oh--my--kamisama-cf68ff?style=flat-square&logo=npm"/></a>
  <a href="#requirements"><img alt="node" src="https://img.shields.io/badge/node-%E2%89%A520-3c873a?style=flat-square&logo=node.js&logoColor=white"/></a>
  <img alt="platform" src="https://img.shields.io/badge/macOS%20%7C%20Linux%20%7C%20WSL-444?style=flat-square"/>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"/>
  <img alt="status" src="https://img.shields.io/badge/status-vibe%20coding%20grade-cf68ff?style=flat-square"/>
</p>

<p align="center">
  <b>English</b> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <code>omk</code> asks Claude and Gemini to argue about your task, then makes Codex implement it.<br/>
  Every run leaves <b>artifacts on disk</b> instead of one giant disappearing chat.
</p>

```bash
omk "fix the failing auth test and verify it"
```

> *Oh my god? No. Oh my Kamisama.*

---

## Table of contents

- [Why this exists](#why-this-exists)
- [What it is](#what-it-is)
- [Pipeline](#pipeline)
- [Install](#install)
- [Quick start](#quick-start)
- [Interactive shell](#interactive-shell)
- [Modes](#modes)
- [Cockpit mode](#cockpit-mode-cmux)
- [Artifacts on disk](#artifacts-on-disk)
- [Command reference](#command-reference)
- [Configuration](#configuration)
- [Examples](#examples)
- [Where it fits](#where-it-fits-omo--omx--cmux)
- [Design principles](#design-principles)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Merch](#merch)
- [License](#license)

---

## Why this exists

Most AI coding tools optimize for **one runtime**:

| Tool | What it's great at | What it doesn't do |
|---|---|---|
| Codex layers | Codex workflows, hooks, skills, teams | Cross-provider second opinions |
| Claude Code layers | Claude sessions, planning, permissions | Multi-executor handoff |
| Gemini CLI | Independent third read | Long-running orchestration |
| opencode / OMO | Terminal-native model lanes | Foreground/background packet routing |
| OMX | Durable goals, teams, HUD | Independent advisor swarm |
| cmux | Visible long-running panes | Run packets & artifacts |

`omk` takes the boring but useful path: **keep the native tools installed and make them cooperate from one command**.

This is intentionally *not* a token-saving tool. The point is to **spend more agent attention** when the job is ambiguous, risky, or large enough that one model's first answer is not enough.

> Agents are wish-granting machines. They often grant vague wishes literally.
> `omk` borrows the divecode "genie principle": before the executor grants the wish, advisors should surface missing constraints, risks, gates, and verification.

---

## What it is

<p align="center">
  <img src="assets/omk-kamisama.png" alt="Oh My Kamisama" width="360" />
</p>

`oh-my-kamisama` is a **command layer above the AI coding CLIs you already use**. It does not replace Claude Code, Codex CLI, Gemini CLI, opencode, OMX, OMO, or cmux. It coordinates them.

You give it one task. It asks multiple native coding agents to think about the task from different angles, **records their outputs as artifacts**, then hands the final execution to Codex with that context.

It is especially good for:

- *"I know what I want, but the implementation path is fuzzy."*
- *"This can burn tokens, just make the result better."*
- *"I want Claude/Gemini/Codex to all touch the problem, but not manually."*
- *"I want long agent runs visible in cmux instead of hidden in one terminal."*

It is not magic:

- Each CLI still needs its own auth/login.
- Advisor output is **context**, not authority.
- Codex still has to inspect the repo and verify the change.
- Failing agents are surfaced, not hidden.

---

## Pipeline

The current core pipeline:

```text
User task
  ├─▶ Claude advisor  ─▶ writes claude.md   (plan-mode, read-only)
  ├─▶ Gemini advisor  ─▶ writes gemini.md   (plan-mode, read-only)
  └─▶ Codex executor  ─▶ reads both artifacts, implements, verifies, summarizes
                        writes codex.prompt.md, codex.out, codex.err, RUN.md
```

Each advisor returns the same structured read:

- Recommended approach
- Dive questions
- AI-DLC phase and gates *(Inception → Construction → Operations)*
- Risks
- Verification plan
- What Codex should avoid

The native calls are intentionally simple — provider auth, model selection, local policy, and account limits stay with the provider CLIs:

```text
claude --print --permission-mode plan         "<advisor prompt>"
gemini --skip-trust --approval-mode plan -p   "<advisor prompt>"
codex  exec --skip-git-repo-check -C <repo>
            -s workspace-write                "<executor prompt>"
```

For longer work, `omk` runs in the background and opens a cmux cockpit:

```text
omk cockpit
  └─▶ cmux workspace
       ├─ left pane:  omk watch   (status, pid, stdout/stderr tail)
       └─ right pane: omk bg + omk tail
```

---

## Install

### From npm (when published)

```bash
npm install -g oh-my-kamisama
```

### From this repository

```bash
git clone https://github.com/yong076/oh-my-kamisama
cd oh-my-kamisama
npm install -g .
```

### Run directly without install

```bash
./bin/omk doctor
./bin/omk "summarize this repo and suggest the first safe improvement"
```

> `npm install -g .` runs the Agent Cat Connectors installer automatically unless `OMK_SKIP_AGENTCAT_INSTALL=1` is set. You can also run it manually with `omk connect`.

### Requirements

**Core:**

- `claude` CLI — authenticated
- `codex` CLI — authenticated
- `gemini` CLI — authenticated
- macOS, Linux, or WSL with Bash
- Node.js 20+

**Optional:**

- `cmux` — for cockpit mode
- `omx` / `oh-my-codex` — for future durable goal/team adapters
- `opencode` — for future scout/reviewer lanes
- `agentcat` / Agent Cat Connectors — usage, quota, and activity snapshots

### Verify your setup

```bash
omk doctor    # checks command surface (does not replace provider auth checks)
omk tools     # lists what omk can call
omk agents    # shows live quota/activity (needs Agent Cat Connectors)
```

---

## Quick start

Open the interactive conductor in the current repo:

```bash
cd /path/to/repo
omk
```

Or run a one-shot task:

```bash
omk "fix the failing parser regression and run the focused tests"
```

By default, a plain task uses `omk auto`. Auto mode reads Agent Cat quota and availability, prefers Codex/Claude, and only falls back to Gemini when Codex and Claude are unavailable. Gemini fallback **asks for confirmation** in interactive runs because Gemini quota can be precious or tied to a different account.

### Common one-liners

```bash
# Full three-lane pipeline against another repo
omk run --repo ~/work/app "fix checkout coupon validation and run tests"

# Advisors only (no code changes)
omk advise --repo ~/work/app "review the safest migration path for user_roles"

# Background job + tail
omk bg   --repo ~/work/app "refactor the settings screen and verify it"
omk ps   --repo ~/work/app
omk tail --repo ~/work/app latest

# cmux cockpit for long work
omk cockpit --repo ~/work/app "ship the feature with tests and notes"
```

---

## Interactive shell

<p align="center">
  <img src="assets/omk-shell.png" alt="omk interactive shell — the conductor planning, delegating to codex, streaming a live worker board, and verifying with the test suite" width="660" />
</p>

With no arguments in an interactive terminal, `omk` opens a small REPL with a Claude-Code-style launch screen and live agent status:

```text
╭ Oh My Kamisama v0.8.0 ────────────────────────────────────────────────╮
│ repo:  ~/work/app                                                      │
│ mode:  auto                                                            │
│ route: claude                                                          │
│ state: walking                                                         │
├───────────────────────────────────────────────────────────────────────┤
│ agents: Codex 70% 7d ok | Claude 92% 7d ok | Gemini 94% daily ok       │
├───────────────────────────────────────────────────────────────────────┤
│ try:   describe a task, /mode cockpit, /advise <question>              │
│ keys:  Enter run  Shift+Enter newline  Ctrl+L redraw                   │
╰───────────────────────────────────────────────────────────────────────╯
mode:auto  route:claude  repo:~/work/app  /help /agents /context /exit

type a task, /agents for detail, /context for repo, /exit to quit

🐱
```

Plain text is treated as a task and runs in the current mode. Slash commands control the shell:

TTY sessions use the Claude-Code-style terminal editor in `bin/omk-repl.js` for
normal terminal editing: backspace, arrow movement, multiline input, and command
history.
Non-interactive stdin keeps the Bash fallback so tests and scripts remain
simple.

Multiline prompts work like Claude Code: Shift+Enter or Meta+Enter inserts a
newline when your terminal sends that key distinctly, and backslash+Enter always
continues on the next line. Set `OMK_READLINE_REPL=1` to use the simpler
readline fallback.

| Command | What it does |
|---|---|
| `/conduct TASK` | Run the multi-agent conductor loop (plan, delegate, diff, verify) |
| `/resume [run\|latest]` | Resume a previous conductor run |
| `/mode auto` | Choose the executor from Agent Cat quota/availability |
| `/mode conduct` | Make plain tasks run the conductor |
| `/mode run` | Full Claude + Gemini + Codex pipeline |
| `/mode claude` | Direct Claude executor |
| `/mode gemini` | Direct Gemini executor |
| `/mode advise` | Advisors only — no code changes |
| `/mode bg` | Start background jobs |
| `/mode cockpit` | Open a cmux cockpit for each task |
| `/agents` | Refresh status, quota, activity, suggested route |
| `/refresh` | Redraw the launch screen |
| `/screen` | Print the compact status panel |
| `/route` | Print the current auto route |
| `/connect` | Install/check Agent Cat Connectors |
| `/context` | Show repo branch, scripts, surfaces, route |
| `/diff` | Show git status and diff stats |
| `/cost` | Show Agent Cat usage/cost summary |
| `/tasks` | List the local `.omk` task queue |
| `/task TEXT` | Add a local task |
| `/done ID` | Mark a local task done |
| `/repo PATH` | Switch target repository |
| `/ps`, `/logs latest`, `/tail latest` | Background job controls |
| `/! git status` | Run a shell command inside the repo |
| `/exit` | Quit |

Example session:

```text
$ omk
🐱 review the settings bug and fix it with tests
🐱 /agents
🐱 /mode cockpit
🐱 build the admin audit view and verify it
🐱 /exit
```

> The shell deliberately mirrors the useful parts of modern coding-agent CLIs: slash commands, quick repo context, usage/cost views, diff views, and a small local task queue. It does not embed or reuse proprietary agent source code.

---

## Modes

### `omk conduct` — the multi-agent conductor

The headline mode. A native `claude` session becomes the **conductor**: it never edits files itself — it plans the work, delegates each piece to a worker CLI (`codex` to implement, `claude` to reason/review, `gemini` for grunt work/search), then synthesizes the results and decides the next step. It returns a strict JSON envelope each turn, which `omk` turns into a live surface.

```bash
omk conduct --repo ~/work/app "add an audit log to the admin actions and verify it"
```

What makes it feel like Claude Code:

- **Live plan checklist** — the conductor maintains an evolving `☐ / ◐ / ☑` plan you watch update each turn.
- **Streaming workers** — each delegation shows an animated status line with elapsed time, bytes streamed, and the worker's current activity (the file it's editing, the command it ran) instead of a frozen wait.
- **Real diff awareness** — after every delegation round the conductor is fed the *actual* `git diff` the workers produced (not just their prose claim), so it reasons over reality and catches no-op or wrong edits.
- **Verification gate** — before it declares the task done on a changed repo, `omk` runs the project's own tests/build (`npm test`, `cargo test`, `go test`, or a `make test` target) and feeds the result back. It won't quietly call unverified work "done."
- **Parallel isolation** — when the conductor dispatches several writers at once, each runs in its own throwaway `git worktree` and the changes are merged back, so concurrent agents can't stomp each other.
- **Loud failures** — a worker timeout, crash, or quota error is surfaced the instant it happens, not buried.

Every turn, the plan, the diff (`turn-N.diff`), each worker's output, and the session id are written under `.omk/runs/<run>/`, so a run is fully auditable — and resumable.

In the interactive shell, a plain task in the default `auto`/`conduct` mode runs the conductor. (`omk "task"` from the command line still uses single-executor `omk auto` — see below.)

Tunables: `OMK_CONDUCT_MAX_TURNS`, `OMK_CONDUCT_CONCURRENCY`, `OMK_CONDUCT_VERIFY=0` (skip the gate), `OMK_CONDUCT_WORKTREES=0` (run in-repo).

### `omk resume` — continue a previous conductor run

Every conductor run persists its `claude` session id and turn history. `omk resume` picks up where you left off — same session, appended turns, with the current repo diff replayed to the conductor.

```bash
omk resume --repo ~/work/app            # resume the latest run
omk resume --repo ~/work/app 2026-05-30T17-15-26Z-build-the-feature
```

### `omk auto` — quota-aware routing

Auto mode checks Agent Cat Connectors, displays the current provider picture, and chooses the executor:

1. Prefer Codex or Claude when either is available.
2. Between Codex and Claude, choose the one with **higher remaining quota**.
3. Use Gemini only when Codex and Claude are unavailable.
4. **Ask before using Gemini** unless `OMK_ALLOW_GEMINI_FALLBACK=1` is set.

```bash
omk auto --repo ~/work/app "fix the billing export and verify it"
```

If Agent Cat Connectors are missing, `omk` tries to install them. If usage snapshot data is unavailable, auto mode falls back to plain CLI availability.

### `omk run` — full foreground pipeline

The original three-lane pipeline: Claude advisor → Gemini advisor → Codex executor. The terminal blocks until the agents finish.

```bash
omk run --repo ~/work/app "fix checkout coupon validation and run tests"
```

### `omk claude` / `omk gemini` — direct executor

Skip the advisor swarm and use a single provider directly. Auto mode normally asks before falling back to Gemini, but `omk gemini` runs Gemini because *you* asked for it.

```bash
omk claude --repo ~/work/app "fix the settings crash and summarize verification"
omk gemini --repo ~/work/app "fix the docs generator"
```

### `omk advise` — advisors only

Use when the next step should be a **decision, not a code edit**. Claude and Gemini produce their structured reads; Codex is not invoked.

```bash
omk advise --repo ~/work/app "should we move this cache into Redis?"
```

### `omk bg` — background jobs

Starts the same pipeline through a background supervisor and writes job state under `.omk/bg/`.

```bash
omk bg   --repo ~/work/app "modernize the billing settings page"
omk ps   --repo ~/work/app
omk logs --repo ~/work/app latest
omk tail --repo ~/work/app latest
omk kill --repo ~/work/app latest    # if you need to stop one
```

---

## Cockpit mode (cmux)

`omk cockpit` creates a cmux workspace with two panes:

```text
┌──────────────────────────────┬──────────────────────────────┐
│  omk watch                   │  omk bg "<task>"             │
│  ─────────                   │  omk tail latest             │
│  status: running             │                              │
│  pid:    48211               │  [10:24:31] planner    ok    │
│  stdout tail: ...            │  [10:24:32] researcher ok    │
│  stderr tail: ...            │  [10:24:35] coder      ok    │
│                              │  [10:24:37] reviewer   ok    │
│                              │  [10:24:39] optimizer  ok    │
└──────────────────────────────┴──────────────────────────────┘
```

```bash
omk cockpit --repo ~/work/app "finish the dashboard filters and verify e2e"
```

Use this when the work may take a while and you want a **visible control room** instead of a hidden background process.

This is the foundation for the bigger vision: `omk` as a cmux-native agent cockpit where Claude, Codex, Gemini, OMX, OMO, opencode, QA, review, and release lanes can become visible panes instead of hidden subprocesses.

### Watch dashboard

```bash
omk watch --repo ~/work/app latest

# custom refresh interval (seconds)
OMK_WATCH_INTERVAL=5 omk watch --repo ~/work/app latest
```

---

## Artifacts on disk

Every foreground run creates a timestamped artifact directory:

```text
.omk/runs/<timestamp>-<task>/
├── RUN.md              ← final summary packet
├── task.txt            ← original task text
├── claude.md           ← Claude advisor: approach, risks, verification, what-to-avoid
├── gemini.md           ← Gemini advisor: same shape, independent reasoning
├── codex.prompt.md     ← exact prompt Codex received
├── codex.out           ← Codex stdout
└── codex.err           ← Codex stderr
```

Background runs add a supervisor record:

```text
.omk/bg/<timestamp>-<task>/
├── status              ← queued | running | done | failed
├── pid
├── started.txt
├── finished.txt
├── task.txt
├── repo.txt
├── stdout.log
├── stderr.log
└── run_dir.txt         ← pointer to the .omk/runs/... packet
```

This means:

- **Failures are debuggable** — every advisor lane leaves diagnostics even when it crashes.
- **Successful advice is reusable** — `claude.md` and `gemini.md` are plain markdown.
- **Reviews can be async** — open `RUN.md` later; no scrollback to hunt through.

---

## Command reference

```bash
omk                                      # interactive shell
omk "task"                               # one-shot in auto mode
omk shell    [--repo PATH]               # explicit shell for a workspace

omk conduct  [--repo PATH] "task"        # multi-agent conductor (plan/delegate/diff/verify)
omk resume   [--repo PATH] [run|latest]  # resume a previous conductor run
omk auto     [--repo PATH] "task"        # quota-aware routing
omk run      [--repo PATH] "task"        # full three-lane pipeline
omk claude   [--repo PATH] "task"        # direct Claude executor
omk gemini   [--repo PATH] "task"        # direct Gemini executor
omk advise   [--repo PATH] "task"        # advisors only

omk bg       [--repo PATH] "task"        # background pipeline
omk cockpit  [--repo PATH] "task"        # cmux cockpit + bg

omk agents                               # live agent table
omk connect                              # install/check Agent Cat Connectors
omk context  [--repo PATH]               # repo snapshot
omk diff     [--repo PATH]               # git status + diff stats
omk cost                                 # Agent Cat usage/cost summary

omk tasks    [--repo PATH]               # list local task queue
omk task     [--repo PATH] <add|done|list> [...]

omk watch    [--repo PATH] [job-id|latest]
omk ps       [--repo PATH]
omk logs     [--repo PATH] [job-id|latest]
omk tail     [--repo PATH] [job-id|latest]
omk kill     [--repo PATH] <job-id|latest>

omk tools                                # what omk can call
omk status                               # short status line
omk doctor                               # diagnostics
```

---

## Configuration

Behavior is controlled with environment variables. None are required.

| Variable | Default | Effect |
|---|---|---|
| `OMK_KEEP_GOING` | unset | When set, `omk run` proceeds to Codex even if an advisor fails (failed advisor still writes its artifact + diagnostics). |
| `OMK_ALLOW_GEMINI_FALLBACK` | unset | When set, auto mode falls back to Gemini **without** asking for interactive confirmation. |
| `OMK_SKIP_AGENTCAT_INSTALL` | unset | Skip the Agent Cat Connectors installer during `npm install -g`. |
| `OMK_WATCH_INTERVAL` | `2` | Refresh interval (seconds) for `omk watch`. |
| `OMK_INPUT_BG` | dark input bar | Set to `none` to disable the colored interactive input row. |
| `OMK_READLINE_REPL` | unset | Set to `1` to use the simpler readline fallback instead of the Claude-Code-style terminal editor. |

---

## Examples

### Fix a bug with multiple reads

```bash
omk --repo ~/work/api "fix the refresh-token race and add a regression test"
```

What happens:

1. Claude lists risks and missing constraints.
2. Gemini provides an independent failure-mode read.
3. Codex implements the fix with both artifacts in context.
4. You get `.omk/runs/<timestamp>.../RUN.md` for review.

### Ask for plan pressure before implementation

```bash
omk advise --repo ~/work/api "review the safest migration path for user_roles"
```

Use this when the next step should be a decision, not a code edit.

### Start a long run and come back later

```bash
omk bg   --repo ~/work/site "replace the old theme tokens and verify screenshots"
omk ps   --repo ~/work/site
omk tail --repo ~/work/site latest
omk logs --repo ~/work/site latest    # final packet once done
```

### Open a cmux cockpit

```bash
omk cockpit --repo ~/work/product "build the first pass of the admin audit view"
```

### Continue even if an advisor fails

```bash
OMK_KEEP_GOING=1 omk --repo ~/work/app "continue even if one advisor is down"
```

---

## Where it fits (omo / omx / cmux)

`oh-my-kamisama` sits **above** the local tools:

```text
┌──────────────────────────────────────────────────────────┐
│  omk          ← run packet, artifacts, routing, cockpit  │
├──────────────────────────────────────────────────────────┤
│  Claude   ─ independent advisor   (plan-mode, read-only) │
│  Gemini   ─ independent advisor   (plan-mode, read-only) │
│  Codex    ─ final executor        (workspace-write)      │
├──────────────────────────────────────────────────────────┤
│  opencode ─ optional scout / reviewer lane               │
│  OMO      ─ optional model lane / terminal-native flow   │
│  OMX      ─ optional durable goals, teams, HUD           │
│  cmux     ─ visible pane / long-running runtime          │
│  agentcat ─ live quota, activity, cost snapshots         │
└──────────────────────────────────────────────────────────┘
```

`omk` does not replace any of them. It is the conductor that asks them to play together.

See [`docs/strategy.md`](docs/strategy.md) and [`docs/competitive-scan.md`](docs/competitive-scan.md) for the longer roadmap.

---

## Design principles

- **Native CLIs stay native.** `omk` coordinates; it does not impersonate providers.
- **Artifacts beat memory.** Every run should leave inspectable files.
- **Advisors widen context.** Executors still own final judgment.
- **Visibility matters.** Long-running work should be watchable.
- **Failures are data.** A failed lane should produce diagnostics, not disappear.
- **Token thrift is not the north star.** Better outcomes are.

---

## Testing

Run the local test suite (offline, no model tokens):

```bash
npm test
```

The suite uses fake `claude`, `gemini`, `codex`, and `cmux` commands for offline coverage of:

- pipeline shape
- cockpit generator
- shell mode + slash commands
- auto-routing decisions
- repo surface detection

For a real quantitative smoke test against live providers:

```bash
scripts/quant-smoke.sh 2
```

That installs the local package globally, runs `omk run` repeatedly, and writes a CSV with run status, duration, Claude/Gemini advisor exit codes, Codex sentinel detection, artifact count, and run directory.

> Use the quantitative smoke only when you actually want live model calls.

---

## Roadmap

Near-term:

- [ ] OMX adapter — push omk run packets into OMX as durable goals
- [ ] OMO scout lane — terminal-native fourth opinion
- [ ] opencode reviewer lane — post-execution review pass
- [ ] cockpit v2 — review / QA / release lanes as additional panes
- [ ] richer Agent Cat usage views in the shell header

Longer-term:

- A practical agent control room: one command starts the work, one place shows what is running, every lane leaves files you can inspect later.

---

## Merch

<p align="center">
  <img src="assets/omk-merch.png" alt="Oh My Kamisama unofficial merch concept" width="720" />
</p>

No official merch. Just a warning label for people who think one model should make all the decisions alone.

---

## License

MIT © [yong076](https://github.com/yong076)
