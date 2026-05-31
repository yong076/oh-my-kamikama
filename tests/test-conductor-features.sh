#!/usr/bin/env bash
set -euo pipefail

# Offline test for the conductor's advanced features, all with fake CLIs in a
# REAL git repo so the git-dependent paths actually fire:
#   - plan checklist persisted (plan.json)
#   - git diff awareness (turn-0.diff + diff fed into the next turn's message)
#   - worktree isolation for a 2-delegation round (both files merged back, no
#     worktree left behind, repo status not polluted)
#   - verification gate (runs the repo's `make test` before honoring done)
#   - session.json persisted

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-conductor-features.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"
node_dir="$(dirname "$node_bin")"

mkdir -p "$fake_bin" "$work_repo"

# Real git repo with a committed Makefile (the verification command target).
git -C "$work_repo" init -q
git -C "$work_repo" config user.email t@t
git -C "$work_repo" config user.name t
printf 'placeholder\n' > "$work_repo/README.md"
printf 'test:\n\t@touch verify-ran.marker\n' > "$work_repo/Makefile"
git -C "$work_repo" add -A
git -C "$work_repo" commit -qm init

# Fake claude conductor:
#  - first turn: emit a plan + TWO codex delegations (a.txt, b.txt)
#  - after results: emit done with the plan completed
cat >"$fake_bin/claude" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then echo "fake-claude 2.1.158"; exit 0; fi
last="\${@: -1}"
if [[ "\$last" == *"Results of your delegations"* ]]; then
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"FEATURES-DONE",plan:[{title:"write a.txt",status:"done"},{title:"write b.txt",status:"done"}],delegations:[],ask:null,done:true}),session_id:"s"}))'
else
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"FEATURES-DELEGATE",plan:[{title:"write a.txt",status:"in_progress"},{title:"write b.txt",status:"pending"}],delegations:[{agent:"codex",task:"create file a.txt with content alpha"},{agent:"codex",task:"create file b.txt with content beta"}],ask:null,done:false}),session_id:"s"}))'
fi
EOF

# Fake codex: writes the *.txt named in the task into cwd (its worktree), emits
# a file_change JSONL event, and writes the -o last-message file.
cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then echo "fake-codex 0.135.0"; exit 0; fi
out=""; prev=""; last=""
for a in "$@"; do [[ "$prev" == "-o" ]] && out="$a"; prev="$a"; last="$a"; done
fname="$(printf '%s' "$last" | grep -oE '[a-z]+\.txt' | head -1 || true)"
if [[ -n "$fname" ]]; then
  printf 'content-of-%s\n' "$fname" > "$fname"
  echo "{\"type\":\"item.completed\",\"item\":{\"type\":\"file_change\",\"changes\":[{\"path\":\"$fname\",\"kind\":\"add\"}]}}"
fi
[[ -n "$out" ]] && echo "FAKE-CODEX-WROTE ${fname:-nothing}" > "$out"
echo '{"type":"turn.completed"}'
EOF

chmod +x "$fake_bin/claude" "$fake_bin/codex"

PATH="$fake_bin:$node_dir:/usr/bin:/bin" OMK_SKIP_AGENTCAT_INSTALL=1 OMK_CONDUCT_QUOTA_HINT=0 \
  OMK_CONDUCT_CONCURRENCY=2 \
  "$repo_root/bin/omk" conduct --repo "$work_repo" "build the feature" \
  >"$test_root/out.txt" 2>"$test_root/err.txt"

# Conductor ran both phases.
grep -q "FEATURES-DELEGATE" "$test_root/out.txt"
grep -q "FEATURES-DONE" "$test_root/out.txt"

# Worktree isolation: BOTH files were created in isolated worktrees and merged
# back into the main repo.
[[ -f "$work_repo/a.txt" ]] || { echo "a.txt missing (worktree merge failed)" >&2; exit 1; }
[[ -f "$work_repo/b.txt" ]] || { echo "b.txt missing (worktree merge failed)" >&2; exit 1; }
grep -q "content-of-a.txt" "$work_repo/a.txt"
grep -q "content-of-b.txt" "$work_repo/b.txt"

# No worktree left registered.
if git -C "$work_repo" worktree list | grep -q "omk-wt"; then
  echo "worktree not cleaned up" >&2; exit 1
fi

run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -n "$run_dir" ]]

# Plan + session persisted.
[[ -f "$run_dir/plan.json" ]] || { echo "plan.json missing" >&2; exit 1; }
[[ -f "$run_dir/session.json" ]] || { echo "session.json missing" >&2; exit 1; }
grep -q "write a.txt" "$run_dir/plan.json"

# Git diff awareness: the diff was captured and fed into the conductor's next turn.
[[ -f "$run_dir/turn-0.diff" ]] || { echo "turn-0.diff missing" >&2; exit 1; }
grep -q "a.txt" "$run_dir/turn-0.diff"
grep -q "Real git diff" "$run_dir/turn-1.json"
grep -q "a.txt" "$run_dir/turn-1.json"

# Verification gate ran the repo's `make test`.
[[ -f "$work_repo/verify-ran.marker" ]] || { echo "verify gate did not run make test" >&2; exit 1; }
grep -q "verification passed" "$test_root/out.txt"

echo "conductor features ok: $run_dir"
