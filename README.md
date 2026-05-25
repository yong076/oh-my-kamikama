# oh-my-kamikama

One command that makes Claude, Gemini, and Codex work together.

`omk` is a local multi-CLI conductor for AI coding tools. Claude and Gemini
produce independent advisory passes, then Codex executes with both artifacts as
context.

```bash
omk "fix the failing auth test and verify it"
```

## Why

Most AI coding helpers optimize one runtime:

- Codex layers focus on Codex workflows, hooks, skills, and teams.
- Claude layers focus on Claude Code orchestration and guardrails.
- Multi-model MCPs expose many models to another client.

`omk` takes a simpler path: keep the native CLIs installed on your machine and
run them together from one command.

## Requirements

- `claude` CLI authenticated
- `codex` CLI authenticated
- `gemini` CLI authenticated
- macOS, Linux, or WSL with Bash

`omx` / `oh-my-codex` is optional. `omk` calls the three native CLIs directly.

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

2. Gemini advisor
   - Runs with `gemini --prompt`.
   - Produces `gemini.md`.

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
omk             -> run packet, artifacts, and routing
```

## License

MIT
