# oh-my-kamikama

<p align="center">
  <img src="assets/omk-goddess-terminal.svg" alt="Oh My Kamisama terminal goddess banner" />
</p>

One command. Many agents. A suspicious amount of confidence.

`omk` is a local multi-CLI conductor for extreme vibe coding. Claude and Gemini
produce independent advisory passes, then Codex executes with both artifacts as
context. Optional adapters discover `opencode`, `omx`, and `cmux` so bigger runs
can grow into goals, teams, panes, and dashboards.

```bash
omk "fix the failing auth test and verify it"
```

Oh my god? No. Oh my Kamisama.

## Why

Most AI coding helpers optimize one runtime:

- Codex layers focus on Codex workflows, hooks, skills, and teams.
- Claude layers focus on Claude Code orchestration and guardrails.
- Multi-model MCPs expose many models to another client.
- Terminal dashboards focus on watching sessions that already exist.

`omk` takes a simpler path: keep the native CLIs installed on your machine and
make them work together from one command.

This is not a token-saving tool. The point is to spend enough agent attention to
turn a vague wish into a better result.

## The Wish Contract

Agents are wish-granting machines. They take vague wishes literally. `omk`
borrows the divecode genie principle: before the final executor grants the wish,
the advisors surface missing constraints, risks, gates, and verification.

```text
User wish
  -> Claude advisor: risks, missing questions, gates
  -> Gemini advisor: alternate read, failure modes, verification
  -> Codex executor: build, verify, summarize
```

AI-DLC gives the larger shape:

```text
Inception -> Construction -> Operations
```

## Requirements

- `claude` CLI authenticated
- `codex` CLI authenticated
- `gemini` CLI authenticated
- optional: `opencode`
- optional: `omx` / `oh-my-codex`
- optional: `cmux`
- macOS, Linux, or WSL with Bash

`omk` calls the three core native CLIs directly. Optional tools are detected and
used by future adapter modes.

## Install

From this repository:

```bash
npm install -g .
```

Or run directly:

```bash
./bin/omk doctor
```

## Usage

```bash
omk "ship the narrow change"
omk run "ship the narrow change"
omk advise "review the implementation plan"
omk run --repo /path/to/repo "fix the parser regression"
omk bg --repo /path/to/repo "run the full conductor in the background"
omk ps --repo /path/to/repo
omk logs --repo /path/to/repo latest
omk tail --repo /path/to/repo latest
omk kill --repo /path/to/repo latest
omk tools
omk status
omk doctor
```

Run the quantitative smoke test:

```bash
scripts/quant-smoke.sh 2
```

It installs the local package globally, runs `omk run` repeatedly, and writes a
CSV with exit codes, latency, Codex sentinel detection, and artifact counts.

## Pipeline

1. Claude advisor
   - Runs with `claude --print`.
   - Produces `claude.md`.
   - Surfaces dive questions, risks, and gates.

2. Gemini advisor
   - Runs with `gemini --prompt`.
   - Produces `gemini.md`.
   - Provides an independent second read.

3. Codex executor
   - Runs with `codex exec`.
   - Reads both advisor artifacts.
   - Owns final implementation and verification.

Artifacts are written to:

```text
.omk/runs/<timestamp>-<task>/
  RUN.md
  task.txt
  claude.md
  gemini.md
  codex.prompt.md
  codex.out
  codex.err
```

Background jobs are written to:

```text
.omk/bg/<timestamp>-<task>/
  status
  pid
  started.txt
  finished.txt
  task.txt
  repo.txt
  stdout.log
  stderr.log
  run_dir.txt
```

## Shirt Mode

<p align="center">
  <img src="assets/omk-shirt.svg" alt="Oh My Kamisama t-shirt concept" width="520" />
</p>

No official merch. Just a warning label for people who think one model should
make all the decisions alone.

## Command Contract

`omk` treats advisor output as context, not authority. The executor must still
inspect the repository, preserve unrelated changes, and verify the final result.

If an advisor fails, `omk run` stops before Codex by default. Set
`OMK_KEEP_GOING=1` to continue anyway.

```bash
OMK_KEEP_GOING=1 omk "continue even if one advisor is down"
```

## Positioning

`oh-my-kamikama` is not a replacement for Claude Code, Codex CLI, Gemini CLI, or
oh-my-codex. It is the command layer above them:

```text
Claude + Gemini -> independent advice
Codex           -> final executor
opencode        -> optional scout/reviewer lane
OMX             -> optional goals/team/HUD lane
cmux            -> optional visible pane/runtime lane
omk             -> run packet, artifacts, and routing
```

See [docs/strategy.md](docs/strategy.md) for the roadmap.

## License

MIT
