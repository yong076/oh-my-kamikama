#!/usr/bin/env bash
set -euo pipefail

runs="${1:-2}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stamp="$(date -u '+%Y-%m-%dT%H-%M-%SZ')"
test_root="${OMK_QUANT_ROOT:-/private/tmp/omk-quant-$stamp}"
summary="$test_root/summary.csv"

mkdir -p "$test_root"

cd "$repo_root"
npm install -g .

printf 'run,status,duration_sec,claude_exit,gemini_exit,codex_sentinel,artifact_count,run_dir\n' >"$summary"

successes=0
failures=0

for i in $(seq 1 "$runs"); do
  run_repo="$test_root/workspace-$i"
  mkdir -p "$run_repo"

  sentinel="OMK-QUANT-$i-OK"
  prompt="Smoke test $i/$runs. Do not edit files. Final Codex output must contain $sentinel."
  start="$(date +%s)"
  status=0

  omk run --repo "$run_repo" "$prompt" >"$test_root/run-$i.out" 2>"$test_root/run-$i.err" || status=$?
  end="$(date +%s)"
  duration="$((end - start))"

  run_dir="$(find "$run_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -n 1 || true)"
  claude_exit="missing"
  gemini_exit="missing"
  artifact_count=0

  if [[ -n "$run_dir" ]]; then
    artifact_count="$(find "$run_dir" -type f | wc -l | tr -d ' ')"
    if [[ -f "$run_dir/claude.md" ]]; then
      claude_exit="$(sed -n 's/^- Exit code: //p' "$run_dir/claude.md" | head -n 1)"
    fi
    if [[ -f "$run_dir/gemini.md" ]]; then
      gemini_exit="$(sed -n 's/^- Exit code: //p' "$run_dir/gemini.md" | head -n 1)"
    fi
  fi

  codex_sentinel="no"
  if grep -q "$sentinel" "$test_root/run-$i.out"; then
    codex_sentinel="yes"
  fi

  if [[ "$status" -eq 0 && "$claude_exit" == "0" && "$gemini_exit" == "0" && "$codex_sentinel" == "yes" ]]; then
    successes="$((successes + 1))"
  else
    failures="$((failures + 1))"
  fi

  printf '%s,%s,%s,%s,%s,%s,%s,%s\n' \
    "$i" "$status" "$duration" "$claude_exit" "$gemini_exit" "$codex_sentinel" "$artifact_count" "$run_dir" \
    >>"$summary"
done

echo "OMK quantitative smoke"
echo "======================"
echo "runs: $runs"
echo "successes: $successes"
echo "failures: $failures"
echo "summary: $summary"
echo
cat "$summary"

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi
