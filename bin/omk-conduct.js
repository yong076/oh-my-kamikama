#!/usr/bin/env node
"use strict";

// oh-my-kamisama conductor.
//
// A persistent multi-agent loop. A native `claude` session is the conductor:
// it distributes roles and returns a JSON "envelope" each turn. omk parses the
// envelope, renders questions as arrow-key pickers, delegates work to
// codex/gemini/claude workers, STREAMS their progress, shows the real git diff
// they produced, optionally verifies via the repo's tests, and feeds it back —
// until the conductor declares the task done.
//
// Dual entry:
//   - CLI:     node omk-conduct.js --repo PATH "task"   (offline-testable)
//   - resume:  node omk-conduct.js --resume-dir RUNDIR ["task"]
//   - library: require("./omk-conduct.js") from the REPL (shares stdin/picker)

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const OMK_BIN = path.join(__dirname, "omk");

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

const MAX_TURNS = int(process.env.OMK_CONDUCT_MAX_TURNS, 12);
const CONCURRENCY = Math.max(1, int(process.env.OMK_CONDUCT_CONCURRENCY, 3));
const DELEGATE_TIMEOUT_MS = int(process.env.OMK_DELEGATE_TIMEOUT_MS, 180000);
const CLAUDE_TIMEOUT_MS = int(process.env.OMK_CONDUCT_CLAUDE_TIMEOUT_MS, 300000);
const VERIFY_TIMEOUT_MS = int(process.env.OMK_CONDUCT_VERIFY_TIMEOUT_MS, 240000);
const DIGEST_INLINE_LIMIT = int(process.env.OMK_CONDUCT_DIGEST_LIMIT, 6000);
const DIFF_FEED_LIMIT = int(process.env.OMK_CONDUCT_DIFF_LIMIT, 4000);
const KILL_GRACE_MS = int(process.env.OMK_CONDUCT_KILL_GRACE_MS, 2000);
const MAX_VERIFY_ATTEMPTS = int(process.env.OMK_CONDUCT_MAX_VERIFY, 2);
const VERIFY_ENABLED = process.env.OMK_CONDUCT_VERIFY !== "0";
const WORKTREES_ENABLED = process.env.OMK_CONDUCT_WORKTREES !== "0";

const KNOWN_AGENTS = new Set(["codex", "gemini", "claude"]);
const PLAN_STATUSES = new Set(["pending", "in_progress", "done", "blocked"]);

const SYSTEM_PROMPT = `You are the conductor in oh-my-kamisama, orchestrating local AI coding CLIs.

You DO NOT edit files or run commands yourself. You distribute work to worker agents and synthesize their results for the human.

Worker agents you can delegate to:
- codex   — the implementation executor. Use for writing/changing code and running it.
- claude  — a reasoning/review worker. Use for analysis, planning, code review.
- gemini  — treat as low-skill: web search and simple, well-specified grunt work ONLY. Never give gemini complex implementation.

PROTOCOL — every reply MUST be a single JSON object and NOTHING else (no prose, no markdown fences):
{
  "say": "<short human-facing narration of what you're doing or concluding>",
  "plan": [ { "title": "<step>", "status": "pending|in_progress|done|blocked" } ],
  "delegations": [ { "agent": "codex|claude|gemini", "model": "<optional model alias>", "task": "<precise self-contained instruction>", "why": "<one line>" } ],
  "ask": { "question": "<question>", "options": ["<option>", "..."] } ,
  "done": false
}

Rules:
- Maintain "plan": a short evolving checklist of the overall task. Re-emit the FULL plan every turn with updated statuses so the human can watch progress. Mark exactly the step(s) you are working on as "in_progress".
- Use "ask" ONLY when you genuinely need a human decision; give 2-4 concise options. When you ask, leave "delegations" empty.
- Use "delegations" to dispatch concrete work. Keep each task self-contained (workers have no memory of this conversation).
- After a delegation round you receive "Results of your delegations" AND, when in a git repo, the REAL git diff the workers produced. Trust the diff over a worker's prose claim; if the diff is empty or wrong, the work did not happen — re-delegate.
- When you set "done": true and files changed, omk runs the project's own tests/build first. If they fail you'll get the failure and must fix it (or explicitly override). So only claim done when you believe the change is correct and verifiable.
- Set "done": true when the task is complete or when only a final explanation is needed (put it in "say").
- Keep "say" tight. If worker output is large, summarize and group it instead of dumping it.`;

// ---------------------------------------------------------------------------
// Envelope parsing — must never throw.
// ---------------------------------------------------------------------------

function stripFence(text) {
  const t = String(text).trim();
  const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  if (fenced) return fenced[1];
  return t;
}

function tryParseObject(text) {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Find the first balanced {...} block that actually looks like an envelope,
// respecting strings and escapes. Prefer a block carrying envelope keys over
// the first stray brace (which may be prose-embedded JSON).
function balancedBraceBlocks(text) {
  const s = String(text);
  const blocks = [];
  let start = -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) start = i; depth += 1; }
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) { blocks.push(s.slice(start, i + 1)); start = -1; }
    }
  }
  return blocks;
}

function firstBalancedBraceBlock(text) {
  const blocks = balancedBraceBlocks(text);
  return blocks.length ? blocks[0] : null;
}

function looksLikeEnvelope(obj) {
  return obj && typeof obj === "object" &&
    ("say" in obj || "delegations" in obj || "ask" in obj || "done" in obj || "plan" in obj);
}

function normalizePlan(plan) {
  if (!Array.isArray(plan)) return null;
  const out = [];
  for (const p of plan) {
    if (!p) continue;
    if (typeof p === "string") { out.push({ title: p, status: "pending" }); continue; }
    if (typeof p !== "object") continue;
    const title = String(p.title || p.step || p.name || "").trim();
    if (!title) continue;
    let status = String(p.status || "pending").toLowerCase().trim();
    if (status === "in-progress" || status === "active" || status === "doing") status = "in_progress";
    if (status === "complete" || status === "completed") status = "done";
    if (!PLAN_STATUSES.has(status)) status = "pending";
    out.push({ title, status });
  }
  return out.length ? out : null;
}

function normalizeEnvelope(env) {
  const out = {
    say: typeof env.say === "string" ? env.say : (env.say == null ? "" : String(env.say)),
    plan: normalizePlan(env.plan),
    delegations: [],
    ask: null,
    done: env.done === true,
  };
  if (Array.isArray(env.delegations)) {
    for (const d of env.delegations) {
      if (!d || typeof d !== "object") continue;
      let agent = String(d.agent || "").toLowerCase().trim();
      if (!KNOWN_AGENTS.has(agent)) agent = "codex";
      const task = typeof d.task === "string" ? d.task : (d.task == null ? "" : String(d.task));
      if (!task.trim()) continue;
      out.delegations.push({
        agent,
        model: d.model ? String(d.model) : null,
        task,
        why: d.why ? String(d.why) : "",
      });
    }
  }
  if (env.ask && typeof env.ask === "object" && env.ask.question) {
    let options = Array.isArray(env.ask.options) ? env.ask.options : [];
    options = options.map((o) => (typeof o === "string" ? o : (o && o.label) || String(o))).filter(Boolean);
    if (!options.length) options = ["Proceed", "Cancel"];
    out.ask = { question: String(env.ask.question), options };
  }
  return out;
}

// stdout may be: real claude `--output-format json` wrapper {result:"..."},
// a bare envelope object, or an envelope wrapped in a ```json fence / prose.
function parseEnvelope(stdout) {
  const raw = String(stdout == null ? "" : stdout);
  let resultText = raw;
  let env = null;

  const outer = tryParseObject(raw);
  if (outer) {
    if (typeof outer.result === "string") {
      resultText = outer.result;
    } else if (looksLikeEnvelope(outer)) {
      env = outer;
    }
  }

  if (!env) {
    const text = stripFence(resultText).trim();
    env = tryParseObject(text);
    if (!env || !looksLikeEnvelope(env)) {
      // Prefer the first balanced block that parses AND looks like an envelope.
      env = null;
      for (const block of balancedBraceBlocks(text)) {
        const candidate = tryParseObject(block);
        if (candidate && looksLikeEnvelope(candidate)) { env = candidate; break; }
        if (candidate && !env) env = candidate; // fallback: first parseable object
      }
    }
  }

  if (!env || !looksLikeEnvelope(env)) {
    const say = stripFence(resultText).trim() || raw.trim() || "(no response)";
    return { say, plan: null, delegations: [], ask: null, done: true, _fallback: true };
  }
  return normalizeEnvelope(env);
}

// ---------------------------------------------------------------------------
// Child process helper — async so the event loop (and ESC keypresses) stay
// live. Streams stdout to an optional onData callback for live progress.
// ---------------------------------------------------------------------------

// Global registry so an abrupt process exit never leaks worker processes.
const liveChildren = new Set();
let sweepInstalled = false;
function installSweep() {
  if (sweepInstalled) return;
  sweepInstalled = true;
  const sweep = () => {
    for (const child of liveChildren) {
      try { child.kill("SIGKILL"); } catch {}
    }
  };
  process.on("exit", sweep);
}

function runChild(cmd, args, opts = {}) {
  installSweep();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd || process.cwd(),
        env: opts.env || process.env,
        // CRITICAL: when we have no stdin to send, give the child /dev/null so it
        // gets an immediate EOF. With a default open stdin pipe, `codex exec`
        // (and gemini -p) block on "Reading additional input from stdin…" and
        // hang until the delegation times out — producing zero edits.
        stdio: opts.input != null ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({ status: 127, stdout: "", stderr: String(err && err.message), timedOut: false, error: err });
      return;
    }

    liveChildren.add(child);
    if (opts.onSpawn) opts.onSpawn(child);

    let timer = null;
    let killTimer = null;
    if (opts.timeoutMs && opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        try { child.kill("SIGTERM"); } catch {}
        killTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, KILL_GRACE_MS);
      }, opts.timeoutMs);
    }

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      liveChildren.delete(child);
      if (opts.onExit) opts.onExit(child);
      resolve(result);
    };

    if (child.stdout) child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (opts.onData) { try { opts.onData(s); } catch {} }
    });
    if (child.stderr) child.stderr.on("data", (d) => { stderr += d.toString(); });
    if (opts.input != null && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.write(opts.input);
      child.stdin.end();
    }
    child.on("error", (err) => {
      finish({ status: 127, stdout, stderr: stderr + String(err && err.message), timedOut, error: err });
    });
    child.on("close", (code, signal) => {
      const status = code == null ? (signal ? 143 : 1) : code;
      finish({ status, stdout, stderr, timedOut, signal });
    });
  });
}

// ---------------------------------------------------------------------------
// Git helpers — all best-effort, all no-op on non-git repos.
// ---------------------------------------------------------------------------

function git(repo, args, opts = {}) {
  return spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    timeout: opts.timeout || 15000,
    input: opts.input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function isGitRepo(repo) {
  try {
    const r = git(repo, ["rev-parse", "--is-inside-work-tree"]);
    return r.status === 0 && String(r.stdout).trim() === "true";
  } catch { return false; }
}

// A real picture of repo state vs HEAD: stat + truncated diff + untracked list.
function repoDiff(repo, limit = DIFF_FEED_LIMIT) {
  if (!isGitRepo(repo)) return { has: false, text: "", stat: "", porcelain: "" };
  let stat = "";
  let diff = "";
  let porcelain = "";
  try { stat = String(git(repo, ["diff", "HEAD", "--stat"]).stdout || ""); } catch {}
  try { diff = String(git(repo, ["diff", "HEAD"]).stdout || ""); } catch {}
  try { porcelain = String(git(repo, ["status", "--porcelain"]).stdout || ""); } catch {}
  // omk's own run artifacts are not the conductor's concern.
  const untracked = porcelain.split("\n")
    .filter((l) => l.startsWith("??"))
    .map((l) => l.slice(3))
    .filter(Boolean)
    .filter((f) => !f.startsWith(".omk/") && f !== ".omk");
  const has = !!(diff.trim() || untracked.length);
  let text = "";
  if (stat.trim()) text += stat.trim() + "\n";
  if (untracked.length) text += "untracked: " + untracked.join(", ") + "\n";
  if (diff.trim()) {
    text += "\n" + (diff.length > limit ? diff.slice(0, limit) + "\n…[diff truncated]…" : diff);
  }
  return { has, text: text.trim(), stat: stat.trim(), porcelain: porcelain.trim(), untracked };
}

// ---------------------------------------------------------------------------
// Worktree isolation for parallel writers. Best-effort: any failure returns
// null and the caller falls back to running in the main repo.
// ---------------------------------------------------------------------------

function setupWorktree(repo, turn, index) {
  if (!isGitRepo(repo)) return null;
  // Outside the repo tree so nested worktrees never pollute `git status`.
  const tag = crypto.createHash("sha1").update(path.resolve(repo)).digest("hex").slice(0, 8);
  const wtPath = path.join(os.tmpdir(), "omk-wt", `${tag}-t${turn}-${index}`);
  try {
    try { git(repo, ["worktree", "remove", "--force", wtPath]); } catch {}
    fs.rmSync(wtPath, { recursive: true, force: true });
    const r = git(repo, ["worktree", "add", "--detach", "--force", wtPath, "HEAD"]);
    if (r.status !== 0) return null;
    return { path: wtPath };
  } catch { return null; }
}

function worktreeDiff(wt, limit = DIFF_FEED_LIMIT) {
  try {
    const diff = String(git(wt.path, ["diff", "HEAD"]).stdout || "");
    const untracked = String(git(wt.path, ["ls-files", "--others", "--exclude-standard"]).stdout || "")
      .split("\n").filter(Boolean);
    let text = "";
    if (untracked.length) text += "new files: " + untracked.join(", ") + "\n";
    if (diff.trim()) text += (diff.length > limit ? diff.slice(0, limit) + "\n…[truncated]…" : diff);
    return { diff, untracked, text: text.trim() };
  } catch { return { diff: "", untracked: [], text: "" }; }
}

// Merge a worktree's changes into the main repo. Returns {ok, conflicts[]}.
function mergeWorktree(repo, wt) {
  const conflicts = [];
  let ok = true;
  try {
    const patch = String(git(wt.path, ["diff", "HEAD"]).stdout || "");
    if (patch.trim()) {
      const ap = git(repo, ["apply", "--3way", "--whitespace=nowarn"], { input: patch });
      if (ap.status !== 0) {
        const plain = git(repo, ["apply", "--whitespace=nowarn"], { input: patch });
        if (plain.status !== 0) { ok = false; conflicts.push("tracked edits"); }
      }
    }
    const untracked = String(git(wt.path, ["ls-files", "--others", "--exclude-standard"]).stdout || "")
      .split("\n").filter(Boolean);
    for (const rel of untracked) {
      const src = path.join(wt.path, rel);
      const dest = path.join(repo, rel);
      try {
        if (fs.existsSync(dest)) { conflicts.push(rel + " (exists)"); ok = false; continue; }
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      } catch { conflicts.push(rel); ok = false; }
    }
  } catch { ok = false; conflicts.push("merge error"); }
  return { ok, conflicts };
}

function removeWorktree(repo, wt) {
  try { git(repo, ["worktree", "remove", "--force", wt.path]); } catch {}
  try { fs.rmSync(wt.path, { recursive: true, force: true }); } catch {}
}

// ---------------------------------------------------------------------------
// Conductor turn (native claude session).
// ---------------------------------------------------------------------------

async function claudeTurn(sessionId, message, ctx) {
  const args = ["-p", "--output-format", "json"];
  if (ctx.firstTurn) {
    args.push("--session-id", sessionId, "--append-system-prompt", SYSTEM_PROMPT);
  } else {
    args.push("--resume", sessionId);
  }
  args.push(message);

  if (ctx.io && ctx.io.turnStart) ctx.io.turnStart("Conducting");
  let res;
  try {
    res = await runChild("claude", args, {
      cwd: ctx.repo,
      timeoutMs: CLAUDE_TIMEOUT_MS,
      onSpawn: ctx.track,
      onExit: ctx.untrack,
    });
  } finally {
    if (ctx.io && ctx.io.turnEnd) ctx.io.turnEnd();
  }

  if (res.status !== 0 && !res.stdout.trim()) {
    return {
      say: `conductor (claude) failed: ${(res.stderr || "").trim() || "exit " + res.status}`,
      plan: null,
      delegations: [],
      ask: null,
      done: true,
      _error: true,
    };
  }
  return parseEnvelope(res.stdout);
}

// ---------------------------------------------------------------------------
// Delegations.
// ---------------------------------------------------------------------------

function delegateArgs(agent, model, task, outLastPath) {
  if (agent === "codex") {
    // -s workspace-write is load-bearing: without a sandbox flag `codex exec`
    // defaults to read-only and BLOCKS on every write, then times out — so the
    // executor silently produces no edits. (codex exec has no -a/approval flag.)
    const a = ["exec", "--skip-git-repo-check", "--json", "-s", "workspace-write"];
    if (model) a.push("-m", model);
    if (outLastPath) a.push("-o", outLastPath);
    a.push(task);
    return { cmd: "codex", args: a, env: process.env };
  }
  if (agent === "gemini") {
    // auto_edit so the worker can apply edits headlessly (default mode prompts
    // for approval and hangs without a TTY).
    const a = ["--skip-trust", "--approval-mode", "auto_edit"];
    if (model) a.push("-m", model);
    a.push("-p", task);
    return { cmd: "gemini", args: a, env: { ...process.env, GEMINI_CLI_TRUST_WORKSPACE: "true" } };
  }
  // claude worker — fresh session, no resume. acceptEdits so Edit/Write are not
  // denied in headless -p mode (matches the bash executor path in bin/omk).
  const a = ["-p", "--output-format", "json", "--permission-mode", "acceptEdits"];
  if (model) a.push("--model", model);
  a.push(task);
  return { cmd: "claude", args: a, env: process.env };
}

function extractText(agent, res, outLastPath) {
  if (agent === "claude") {
    const outer = tryParseObject(res.stdout);
    if (outer && typeof outer.result === "string") return outer.result.trim();
  }
  if (agent === "codex" && outLastPath) {
    try {
      const last = fs.readFileSync(outLastPath, "utf8").trim();
      if (last) return last;
    } catch {}
  }
  return String(res.stdout || "").trim() || String(res.stderr || "").trim();
}

// Turn a codex `--json` JSONL event into a short live-activity string, or null.
function codexActivity(line) {
  const ev = tryParseObject(line);
  if (!ev) return null;
  const item = ev.item || ev;
  const type = item.type || ev.type;
  if (type === "command_execution" && item.command) return "$ " + oneLine(item.command, 60);
  if (type === "file_change" && Array.isArray(item.changes) && item.changes[0]) {
    const c = item.changes[0];
    return "✎ " + path.basename(c.path || "") + (c.kind ? " (" + c.kind + ")" : "");
  }
  if (type === "agent_message" && item.text) return oneLine(item.text, 70);
  if (type === "reasoning") return "thinking…";
  return null;
}

// Pull the meaningful failure message out of a worker's output, skipping the
// harmless "Reading additional input from stdin…" banner codex prints.
function failureDetail(agent, res) {
  if (agent === "codex") {
    for (const ln of String(res.stdout || "").split("\n")) {
      const ev = tryParseObject(ln);
      if (!ev) continue;
      if (ev.type === "error" && ev.message) return oneLine(ev.message, 90);
      if (ev.type === "turn.failed" && ev.error && ev.error.message) return oneLine(ev.error.message, 90);
    }
  }
  if (agent === "claude") {
    const outer = tryParseObject(res.stdout);
    if (outer && outer.is_error && typeof outer.result === "string") return oneLine(outer.result, 90);
  }
  const errLine = String(res.stderr || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^Reading additional input/i.test(l));
  return errLine ? oneLine(errLine, 90) : "";
}

async function runOneDelegation(del, index, runDir, io, state, cwd) {
  const outPath = path.join(runDir, `${del.agent}.${index}.out`);
  const outLastPath = del.agent === "codex" ? path.join(runDir, `codex.${index}.last`) : null;
  const start = Date.now();

  if (io.delegationUpdate) io.delegationUpdate(index, { status: "running", ms: 0 });

  const { cmd, args, env } = delegateArgs(del.agent, del.model, del.task, outLastPath);

  let bytes = 0;
  let leftover = "";
  const onData = (chunk) => {
    bytes += chunk.length;
    let activity = null;
    if (del.agent === "codex") {
      const buf = leftover + chunk;
      const lines = buf.split("\n");
      leftover = lines.pop() || "";
      for (const ln of lines) {
        const a = codexActivity(ln);
        if (a) activity = a;
      }
    } else {
      const t = (leftover + chunk).replace(/\s+$/g, "");
      leftover = "";
      const last = t.split("\n").filter((l) => l.trim()).pop();
      if (last) activity = oneLine(last, 70);
    }
    if (io.delegationUpdate) {
      io.delegationUpdate(index, { status: "running", ms: Date.now() - start, bytes, activity: activity || undefined });
    }
  };

  const res = await runChild(cmd, args, {
    cwd: cwd || state.repo,
    env,
    timeoutMs: DELEGATE_TIMEOUT_MS,
    onSpawn: state.track,
    onExit: state.untrack,
    onData,
  });
  const ms = Date.now() - start;
  const text = extractText(del.agent, res, outLastPath);
  try {
    fs.writeFileSync(outPath, `# ${del.agent} #${index}\n# task: ${del.task}\n# status: ${res.status} timedOut=${res.timedOut} ${ms}ms\n\n${text}\n`);
  } catch {}

  const ok = res.status === 0 && !res.timedOut && !res.error;
  if (!ok) {
    state.degraded.add(del.agent);
    const why = res.timedOut ? `timed out after ${Math.round(ms / 1000)}s`
      : res.error ? String(res.error.message || res.error)
      : `exit ${res.status}`;
    const detail = failureDetail(del.agent, res);
    if (io.error) io.error(`${del.agent} ${why}${detail ? " — " + detail : ""} (see ${path.basename(outPath)})`);
  }
  if (io.delegationUpdate) {
    io.delegationUpdate(index, { status: ok ? "done" : (res.timedOut ? "timeout" : "failed"), ms, bytes });
  }
  return {
    agent: del.agent,
    model: del.model,
    task: del.task,
    status: res.status,
    timedOut: !!res.timedOut,
    ok,
    ms,
    outPath,
    text,
  };
}

async function mapPool(items, limit, fn) {
  const out = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      out[idx] = await fn(items[idx], idx);
    }
  };
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function runDelegations(delegations, runDir, io, state, turn) {
  if (io.delegationsStart) {
    io.delegationsStart(delegations.map((d) => ({ agent: d.agent, model: d.model, task: d.task })));
  }

  // Isolate parallel writers in their own worktrees so they cannot stomp each
  // other. Single-delegation rounds and non-git repos run in the main repo.
  const useWorktrees = WORKTREES_ENABLED && delegations.length > 1 && isGitRepo(state.repo);
  const worktrees = delegations.map(() => null);
  if (useWorktrees) {
    for (let i = 0; i < delegations.length; i += 1) worktrees[i] = setupWorktree(state.repo, turn, i);
    const isolated = worktrees.filter(Boolean).length;
    if (isolated < delegations.length && io.note) {
      io.note(`worktree isolation: ${isolated}/${delegations.length} isolated (rest run in repo)`);
    }
  }

  const results = await mapPool(delegations, CONCURRENCY, async (del, i) => {
    if (state.interrupted) return null;
    const cwd = (worktrees[i] && worktrees[i].path) || state.repo;
    const r = await runOneDelegation(del, i, runDir, io, state, cwd);
    if (worktrees[i]) r.diff = worktreeDiff(worktrees[i]);
    return r;
  });

  if (useWorktrees) {
    for (let i = 0; i < worktrees.length; i += 1) {
      if (!worktrees[i]) continue;
      if (!state.interrupted) {
        const m = mergeWorktree(state.repo, worktrees[i]);
        if (!m.ok && io.error) io.error(`merge conflict from ${delegations[i].agent} worktree: ${m.conflicts.join(", ")}`);
      }
      removeWorktree(state.repo, worktrees[i]);
    }
  }

  const final = results.filter(Boolean);
  if (io.delegationsEnd) io.delegationsEnd(final);
  return final;
}

// ---------------------------------------------------------------------------
// Digest — compact, then (if still huge) summarize via a fresh claude call.
// ---------------------------------------------------------------------------

function oneLine(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function headTail(text, max) {
  const s = String(text || "");
  if (s.length <= max) return s;
  const half = Math.floor((max - 20) / 2);
  return s.slice(0, half) + "\n…[truncated]…\n" + s.slice(s.length - half);
}

function formatResult(r, index) {
  const head = `[#${index} ${r.agent}${r.model ? ":" + r.model : ""}] ` +
    `status=${r.ok ? "ok" : (r.timedOut ? "timeout" : "fail(" + r.status + ")")} (${r.ms}ms)`;
  let body = `${head}\ntask: ${oneLine(r.task, 120)}\n${r.text || "(no output)"}`;
  if (r.diff && r.diff.text) body += `\n--- changes (isolated worktree) ---\n${headTail(r.diff.text, 1200)}`;
  return body;
}

async function summarize(text, ctx) {
  const prompt = `Group and summarize the following AI agent outputs into ONE concise digest for the conductor. ` +
    `Keep each agent's status and key result. Output plain text, no JSON, no fences.\n\n${text}`;
  const res = await runChild("claude", ["-p", "--output-format", "json", prompt], {
    cwd: ctx.repo,
    timeoutMs: CLAUDE_TIMEOUT_MS,
    onSpawn: ctx.track,
    onExit: ctx.untrack,
  });
  if (res.status !== 0) return null;
  const outer = tryParseObject(res.stdout);
  if (outer && typeof outer.result === "string") return outer.result.trim();
  return String(res.stdout || "").trim() || null;
}

async function digestResults(results, io, ctx) {
  if (!results.length) return "(no delegations ran)";
  const full = results.map(formatResult).join("\n\n");
  if (full.length <= DIGEST_INLINE_LIMIT) return full;

  const truncated = results
    .map((r, i) => formatResult({ ...r, text: headTail(r.text, 1200) }, i))
    .join("\n\n");
  if (truncated.length <= DIGEST_INLINE_LIMIT) return truncated;

  if (io.note) io.note("summarizing many results…");
  const summary = await summarize(truncated, ctx);
  return summary || truncated;
}

// ---------------------------------------------------------------------------
// Verification gate — run the repo's own tests/build before honoring `done`.
// ---------------------------------------------------------------------------

function detectVerifyCommand(repo) {
  const has = (f) => { try { return fs.existsSync(path.join(repo, f)); } catch { return false; } };
  if (has("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
      if (pkg && pkg.scripts && pkg.scripts.test) return { cmd: "npm", args: ["test", "--silent"], label: "npm test" };
    } catch {}
  }
  if (has("Cargo.toml")) return { cmd: "cargo", args: ["test", "--quiet"], label: "cargo test" };
  if (has("go.mod")) return { cmd: "go", args: ["test", "./..."], label: "go test ./..." };
  if (has("Makefile") || has("makefile")) {
    try {
      const mk = fs.readFileSync(path.join(repo, has("Makefile") ? "Makefile" : "makefile"), "utf8");
      if (/^test:/m.test(mk)) return { cmd: "make", args: ["test"], label: "make test" };
    } catch {}
  }
  return null;
}

async function runVerify(repo, verify, ctx) {
  const res = await runChild(verify.cmd, verify.args, {
    cwd: repo,
    timeoutMs: VERIFY_TIMEOUT_MS,
    onSpawn: ctx.track,
    onExit: ctx.untrack,
  });
  const ok = res.status === 0 && !res.timedOut;
  const tail = headTail(((res.stdout || "") + "\n" + (res.stderr || "")).trim(), 1800);
  return { ok, status: res.status, timedOut: !!res.timedOut, tail };
}

// ---------------------------------------------------------------------------
// Quota hint + run dir + persistence.
// ---------------------------------------------------------------------------

function quotaHint() {
  if (process.env.OMK_CONDUCT_QUOTA_HINT === "0") return null;
  try {
    const res = spawnSync(OMK_BIN, ["agents"], { encoding: "utf8", timeout: 8000 });
    const text = `${res.stdout || ""}${res.stderr || ""}`;
    const parts = [];
    for (const provider of ["codex", "claude", "gemini"]) {
      const m = text.match(new RegExp(`^${provider}\\s+\\S+\\s+(\\S+)`, "m"));
      if (m) parts.push(`${provider}=${m[1]}`);
    }
    const suggested = (text.match(/suggested:\s*([a-zA-Z0-9_-]+)/) || [])[1];
    if (!parts.length && !suggested) return null;
    let hint = "Provider quota hint: " + (parts.join(" ") || "unknown");
    if (suggested) hint += `, suggested=${suggested}`;
    hint += ". If a provider's remaining quota is low, prefer another or split the job.";
    return hint;
  } catch {
    return null;
  }
}

function makeRunDir(repo, task) {
  try {
    const res = spawnSync(OMK_BIN, ["_rundir", "--repo", repo, task], { encoding: "utf8", timeout: 8000 });
    const dir = String(res.stdout || "").trim().split("\n").filter(Boolean).pop();
    if (dir && fs.existsSync(dir)) return dir;
  } catch {}
  const slug = String(task).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "T").slice(0, 19) + "Z";
  const dir = path.join(repo, ".omk", "runs", `${stamp}-${slug}`);
  fs.mkdirSync(dir, { recursive: true });
  try { fs.writeFileSync(path.join(dir, "task.txt"), String(task) + "\n"); } catch {}
  return dir;
}

function countExistingTurns(runDir) {
  try {
    return fs.readdirSync(runDir).filter((f) => /^turn-\d+\.json$/.test(f)).length;
  } catch { return 0; }
}

function persistTurn(runDir, turn, env, message) {
  try {
    fs.writeFileSync(
      path.join(runDir, `turn-${turn}.json`),
      JSON.stringify({ turn, message, envelope: env }, null, 2)
    );
  } catch {}
}

function persistSession(runDir, session) {
  try { fs.writeFileSync(path.join(runDir, "session.json"), JSON.stringify(session, null, 2)); } catch {}
}

function readSession(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, "session.json"), "utf8")); } catch { return null; }
}

function persistPlan(runDir, plan) {
  try { fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify(plan || [], null, 2)); } catch {}
}

function readPlan(runDir) {
  try { return JSON.parse(fs.readFileSync(path.join(runDir, "plan.json"), "utf8")); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Default io (standalone / non-TTY). Plain, test-clean output.
// ---------------------------------------------------------------------------

function planGlyph(status) {
  return status === "done" ? "☑" : status === "in_progress" ? "◐" : status === "blocked" ? "⚠" : "☐";
}

function defaultIo() {
  return {
    print: (s) => process.stdout.write(String(s).endsWith("\n") ? String(s) : String(s) + "\n"),
    dim: (s) => String(s),
    say: (s) => process.stdout.write(String(s).endsWith("\n") ? String(s) : String(s) + "\n"),
    note: (s) => process.stdout.write("· " + String(s) + "\n"),
    error: (s) => process.stdout.write("✗ " + String(s) + "\n"),
    plan: (items) => {
      if (!items || !items.length) return;
      process.stdout.write("Plan\n");
      for (const it of items) process.stdout.write(`  ${planGlyph(it.status)} ${it.title}\n`);
    },
    delegationsStart: (list) => {
      for (const d of list) {
        process.stdout.write(`  → ${d.agent}${d.model ? " (" + d.model + ")" : ""}: ${oneLine(d.task, 70)}\n`);
      }
    },
    delegationUpdate: () => {},
    delegationsEnd: () => {},
    turnStart: () => {},
    turnEnd: () => {},
    ask: async (_question, options) => {
      const auto = process.env.OMK_CONDUCT_AUTO_ANSWER;
      if (auto) return auto;
      const first = options && options[0];
      return (first && (first.label || first)) || "";
    },
    bindInterrupt: (fn) => { process.on("SIGINT", () => fn()); },
  };
}

// ---------------------------------------------------------------------------
// Main loop.
// ---------------------------------------------------------------------------

function mergePlan(io, runDir, state, plan) {
  if (!plan) return;
  state.plan = plan;
  persistPlan(runDir, plan);
  if (io.plan) io.plan(plan);
}

async function runConductor(opts) {
  const repo = path.resolve(opts.repo || process.cwd());
  const io = opts.io || defaultIo();
  const resuming = !!opts.resumeDir;

  let runDir;
  let sessionId;
  let task = opts.task;
  let firstTurn = true;

  if (resuming) {
    runDir = path.resolve(opts.resumeDir);
    const prior = readSession(runDir) || {};
    sessionId = prior.sessionId || opts.sessionId || crypto.randomUUID();
    if (!task) { try { task = fs.readFileSync(path.join(runDir, "task.txt"), "utf8").trim(); } catch {} }
    task = task || prior.task || "Continue the previous task.";
    firstTurn = false; // claude --resume the prior session
  } else {
    sessionId = opts.sessionId || crypto.randomUUID();
    runDir = makeRunDir(repo, task);
  }

  const state = {
    repo,
    interrupted: false,
    children: new Set(),
    degraded: new Set(),
    plan: (resuming && readPlan(runDir)) || [],
    changed: false,
    verifiedGreen: false,
    verifyAttempts: 0,
  };
  state.track = (child) => { state.children.add(child); };
  state.untrack = (child) => { state.children.delete(child); };

  const interrupt = () => {
    state.interrupted = true;
    for (const child of state.children) {
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, KILL_GRACE_MS);
    }
  };
  if (io.bindInterrupt) io.bindInterrupt(interrupt);

  const ctx = { repo, firstTurn, io, track: state.track, untrack: state.untrack };

  persistSession(runDir, { sessionId, task, repo, resumedFrom: resuming ? runDir : null, startedAt: new Date().toISOString() });
  if (resuming && state.plan.length && io.plan) io.plan(state.plan);

  let message = resuming
    ? `Resume this task: ${task}\n\nInspect the current repository state (a git diff follows if there are changes) and continue. Re-emit the plan and set done when complete.`
    : task;
  if (resuming) {
    const d = repoDiff(repo);
    if (d.has) message += `\n\nCurrent working-tree changes:\n${d.text}`;
  }
  let lastSay = "";
  const baseTurn = resuming ? countExistingTurns(runDir) : 0;

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    if (state.interrupted) break;

    if (ctx.firstTurn && !resuming) {
      const hint = quotaHint();
      if (hint) message = `${message}\n\n[${hint}]`;
    }

    const env = await claudeTurn(sessionId, message, ctx);
    ctx.firstTurn = false;
    persistTurn(runDir, baseTurn + turn, env, message);

    mergePlan(io, runDir, state, env.plan);
    if (env.say) { io.say(env.say); lastSay = env.say; }
    if (state.interrupted) break;
    if (env._error) break;

    if (env.ask) {
      const options = env.ask.options.map((o) => ({ label: o }));
      const answer = await io.ask(env.ask.question, options);
      if (answer === "__INTERRUPT__" || state.interrupted) { state.interrupted = true; break; }
      message = `User selected: ${answer}`;
      continue;
    }

    if (env.delegations.length) {
      const results = await runDelegations(env.delegations, runDir, io, state, turn);
      if (state.interrupted) break;
      let digest = await digestResults(results, io, ctx);
      if (state.degraded.size) {
        digest += `\n\n[degraded this session: ${[...state.degraded].join(", ")}]`;
      }
      // Show the conductor the REAL diff its workers produced.
      const diff = repoDiff(repo);
      if (diff.has) {
        state.changed = true;
        state.verifiedGreen = false; // new changes invalidate a prior green
        try { fs.writeFileSync(path.join(runDir, `turn-${baseTurn + turn}.diff`), diff.text + "\n"); } catch {}
        message = `Results of your delegations:\n${digest}\n\nReal git diff (working tree vs HEAD) after this round:\n${diff.text}\n\nDecide the next step.`;
      } else {
        const note = isGitRepo(repo) ? "\n\n[no file changes detected in the working tree this round]" : "";
        message = `Results of your delegations:\n${digest}${note}\n\nDecide the next step.`;
      }
      continue;
    }

    if (env.done || env._fallback) {
      // Verification gate: before honoring done on a changed git repo, run the
      // project's own tests/build and feed the conductor the result.
      if (!env._fallback && VERIFY_ENABLED && state.changed && !state.verifiedGreen &&
          state.verifyAttempts < MAX_VERIFY_ATTEMPTS && !state.interrupted) {
        const verify = detectVerifyCommand(repo);
        if (verify) {
          state.verifyAttempts += 1;
          if (io.note) io.note(`verifying: ${verify.label} (attempt ${state.verifyAttempts}/${MAX_VERIFY_ATTEMPTS})…`);
          const v = await runVerify(repo, verify, ctx);
          try { fs.writeFileSync(path.join(runDir, `verify-${state.verifyAttempts}.txt`), v.tail + "\n"); } catch {}
          if (v.ok) {
            state.verifiedGreen = true;
            io.say(`✓ verification passed (${verify.label})`);
            break;
          }
          io.error(`verification failed (${verify.label}, ${v.timedOut ? "timed out" : "exit " + v.status})`);
          message = `You set done, but the project's verification (${verify.label}) FAILED:\n\n${v.tail}\n\n` +
            `Fix the failure by delegating to codex. If this failure is pre-existing or unrelated to your change, ` +
            `explain why in "say" and set done:true again to override (attempt ${state.verifyAttempts}/${MAX_VERIFY_ATTEMPTS}).`;
          continue;
        }
      }
      break;
    }
    message = "Continue. If the task is complete, set \"done\": true.";
  }

  persistSession(runDir, { sessionId, task, repo, finishedAt: new Date().toISOString(), interrupted: state.interrupted });

  if (state.interrupted && io.say) io.say(io.dim ? io.dim("✗ interrupted") : "✗ interrupted");
  return { sessionId, runDir, interrupted: state.interrupted, lastSay, plan: state.plan };
}

// ---------------------------------------------------------------------------
// Health probe — version/liveness of each worker CLI (no agentcat needed).
// ---------------------------------------------------------------------------

function probeAgents() {
  const out = {};
  for (const agent of ["claude", "codex", "gemini"]) {
    try {
      const res = spawnSync(agent, ["--version"], { encoding: "utf8", timeout: 8000 });
      const version = String(res.stdout || res.stderr || "").trim().split("\n")[0] || "";
      out[agent] = { ok: res.status === 0, version, present: res.status !== null && !res.error };
    } catch {
      out[agent] = { ok: false, version: "", present: false };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resume discovery.
// ---------------------------------------------------------------------------

function findResumeDir(repo, token) {
  const root = path.join(path.resolve(repo), ".omk", "runs");
  let dirs;
  try {
    dirs = fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => {
      try { return fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, "session.json")); } catch { return false; }
    });
  } catch { return null; }
  if (!dirs.length) return null;
  dirs.sort();
  if (!token || token === "latest") return dirs[dirs.length - 1];
  const exact = dirs.find((d) => path.basename(d) === token);
  if (exact) return exact;
  const matches = dirs.filter((d) => path.basename(d).startsWith(token));
  return matches.length === 1 ? matches[0] : null;
}

// ---------------------------------------------------------------------------
// CLI entry.
// ---------------------------------------------------------------------------

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

function positionalTask() {
  const args = process.argv.slice(2);
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--repo" || args[i] === "-C" || args[i] === "--resume-dir") { i += 1; continue; }
    out.push(args[i]);
  }
  return out.join(" ").trim();
}

if (require.main === module) {
  const repo = path.resolve(argValue("--repo", process.cwd()));
  const resumeDir = argValue("--resume-dir", null);
  const task = positionalTask();
  if (!task && !resumeDir) {
    process.stderr.write("usage: omk-conduct.js --repo PATH \"task\"  |  --resume-dir RUNDIR [\"task\"]\n");
    process.exit(2);
  }
  runConductor({ repo, task: task || undefined, resumeDir: resumeDir || undefined })
    .then((r) => { process.exit(r.interrupted ? 130 : 0); })
    .catch((err) => {
      process.stderr.write(`omk-conduct: ${err && err.stack ? err.stack : String(err)}\n`);
      process.exit(1);
    });
}

module.exports = {
  runConductor,
  parseEnvelope,
  normalizeEnvelope,
  normalizePlan,
  firstBalancedBraceBlock,
  balancedBraceBlocks,
  stripFence,
  probeAgents,
  detectVerifyCommand,
  repoDiff,
  isGitRepo,
  findResumeDir,
  SYSTEM_PROMPT,
};
