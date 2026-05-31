#!/usr/bin/env bash
set -euo pipefail

# Offline test for the conductor loop (bin/omk-conduct.js via `omk conduct`).
# Covers: parseEnvelope wrapper+fence+brace layers, delegate -> capture ->
# digest -> finish, the summarizer path (forced via a tiny digest limit), and
# run-dir isolation to the target repo. No network, no real CLIs.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/omk-conductor.XXXXXX")"
fake_bin="$test_root/bin"
work_repo="$test_root/workspace"
node_bin="$(command -v node)"
node_dir="$(dirname "$node_bin")"

mkdir -p "$fake_bin" "$work_repo"

# Fake claude. Three branches:
#  - summarizer call (prompt has "Group and summarize") -> plain summary text
#  - resumed / digest feedback                          -> DONE envelope
#  - first turn                                         -> DELEGATE (fenced in .result)
cat >"$fake_bin/claude" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then echo "fake-claude 2.1.156"; exit 0; fi
is_resume=0; for a in "\$@"; do [[ "\$a" == "--resume" ]] && is_resume=1; done
last="\${@: -1}"
if [[ "\$last" == *"Group and summarize"* ]]; then
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:"SUMMARY-OF-RESULTS digest",session_id:"s"}))'
elif [[ "\$is_resume" == "1" || "\$last" == *"Results of your delegations"* ]]; then
  "$node_bin" -e 'process.stdout.write(JSON.stringify({type:"result",is_error:false,result:JSON.stringify({say:"CONDUCTOR-DONE",delegations:[],ask:null,done:true}),session_id:"s"}))'
else
  "$node_bin" -e 'var f=String.fromCharCode(96).repeat(3); process.stdout.write(JSON.stringify({type:"result",is_error:false,result:f+"json\n"+JSON.stringify({say:"CONDUCTOR-DELEGATE",delegations:[{agent:"codex",task:"implement the smoke feature"}],ask:null,done:false})+"\n"+f,session_id:"s"}))'
fi
EOF

# Fake codex: version-aware; writes the -o last-message file and emits JSONL.
cat >"$fake_bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then echo "fake-codex 1.0.0"; exit 0; fi
out=""; prev=""
for a in "$@"; do [[ "$prev" == "-o" ]] && out="$a"; prev="$a"; done
[[ -n "$out" ]] && echo "FAKE-CODEX-OK final message" > "$out"
echo '{"type":"item","text":"codex working"}'
EOF

chmod +x "$fake_bin/claude" "$fake_bin/codex"

# OMK_CONDUCT_DIGEST_LIMIT=10 forces the summarizer path.
PATH="$fake_bin:$node_dir:/usr/bin:/bin" OMK_SKIP_AGENTCAT_INSTALL=1 OMK_CONDUCT_QUOTA_HINT=0 \
  OMK_CONDUCT_DIGEST_LIMIT=10 \
  "$repo_root/bin/omk" conduct --repo "$work_repo" "conductor smoke" \
  >"$test_root/out.txt" 2>"$test_root/err.txt"

# Loop ran both phases.
grep -q "CONDUCTOR-DELEGATE" "$test_root/out.txt"
grep -q "CONDUCTOR-DONE" "$test_root/out.txt"

# Run dir created under the TARGET repo; codex output captured via -o.
run_dir="$(find "$work_repo/.omk/runs" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
[[ -n "$run_dir" ]]
[[ -f "$run_dir/turn-0.json" ]]
[[ -f "$run_dir/turn-1.json" ]]
grep -q "FAKE-CODEX-OK" "$run_dir/codex.0.out"

# Summarizer ran: the digest fed back into the DONE turn is the summary text.
grep -q "SUMMARY-OF-RESULTS" "$run_dir/turn-1.json"

# Real repo must not be polluted.
if find "$repo_root/.omk/runs" -name '*conductor-smoke*' 2>/dev/null | grep -q .; then
  echo "conductor test polluted the real repo" >&2
  exit 1
fi

echo "conductor ok: $run_dir"
