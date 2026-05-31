#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn, spawnSync } = require("child_process");
const conductor = require("./omk-conduct.js");

const root = path.resolve(__dirname, "..");
const omk = path.join(__dirname, "omk");
const useAnsi = process.stdout.isTTY && process.env.NO_COLOR !== "1" && process.env.OMK_ASCII !== "1";

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

let repo = path.resolve(argValue("--repo", process.cwd()));
let mode = argValue("--mode", process.env.OMK_SHELL_MODE || "auto");
const validModes = new Set(["auto", "conduct", "run", "claude", "gemini", "advise", "bg", "cockpit", "cmux"]);
if (!validModes.has(mode)) mode = "auto";

// Conductor wiring. ttyPicker is an arrow-key picker installed by the raw-mode
// loop; conductorState.interrupt is set while a conductor turn is running so a
// keypress (Esc/Ctrl+C) can stop it. Both stay null outside a TTY conductor run.
let ttyPicker = null;
let pickerActive = false;
const conductorState = { interrupt: null };

function rawActive() {
  return !!(process.stdin.isTTY && rawModeWanted);
}
const promptText = process.env.OMK_ASCII === "1" ? "> " : "🐱 ";
const continuationPromptText = process.env.OMK_ASCII === "1" ? "| " : "│ ";
let rawModeWanted = false;

const theme = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  brightCyan: "\x1b[96m",
  brightMagenta: "\x1b[95m",
  inputBg: "\x1b[48;5;236m",
  inputFg: "\x1b[38;5;252m",
};

const SLASH_COMMANDS = [
  ["/help", "show help"],
  ["/shortcuts", "keyboard shortcuts"],
  ["/exit", "leave the shell"],
  ["/clear", "redraw launch screen"],
  ["/repo", "show or change target repository"],
  ["/mode", "set default mode"],
  ["/agents", "refresh detailed agent status"],
  ["/refresh", "redraw the launch screen"],
  ["/intro", "replay the animated intro"],
  ["/screen", "compact status panel"],
  ["/route", "show current auto route"],
  ["/connect", "install/check Agent Cat Connectors"],
  ["/context", "repo branch, scripts, surfaces"],
  ["/diff", "git status and diff stats"],
  ["/cost", "Agent Cat usage/cost summary"],
  ["/tasks", "list local task queue"],
  ["/task", "add a local task"],
  ["/done", "mark a local task done"],
  ["/auto", "auto-route a task"],
  ["/conduct", "run the multi-agent conductor"],
  ["/resume", "resume a previous conductor run"],
  ["/run", "Claude + Gemini advisors then Codex"],
  ["/claude", "direct Claude executor"],
  ["/gemini", "direct Gemini executor"],
  ["/advise", "advisors only"],
  ["/bg", "start background conductor job"],
  ["/cockpit", "open cmux cockpit"],
  ["/ps", "list background jobs"],
  ["/logs", "print job logs"],
  ["/tail", "follow job logs"],
  ["/watch", "watch job status"],
  ["/kill", "stop a background job"],
  ["/tools", "show detected tools"],
  ["/status", "omk and provider versions"],
  ["/doctor", "check required CLIs"],
  ["/!", "run a shell command in the repo"],
];

function color(name, value) {
  if (!useAnsi) return value;
  return `${theme[name] || ""}${value}${theme.reset}`;
}

function setRawMode(enabled) {
  rawModeWanted = enabled;
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === "function") {
    process.stdin.setRawMode(enabled);
  }
}

async function withCookedInput(fn) {
  const restoreRawMode = rawModeWanted;
  if (restoreRawMode) setRawMode(false);
  try {
    return await fn();
  } finally {
    if (restoreRawMode) setRawMode(true);
  }
}

function runCapture(args, options = {}) {
  const result = spawnSync(omk, args, {
    cwd: options.cwd || repo,
    env: { ...process.env, OMK_BASH_REPL: "1" },
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runInherit(args, options = {}) {
  return withCookedInput(() => new Promise((resolve) => {
    const child = spawn(omk, args, {
      cwd: options.cwd || repo,
      env: { ...process.env, OMK_BASH_REPL: "1" },
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error(`omk: ${err.message}`);
      resolve(1);
    });
  }));
}

function shortPath(value) {
  const home = os.homedir();
  if (value === home) return "~";
  if (value.startsWith(home + path.sep)) return "~/" + path.relative(home, value);
  return value;
}

function terminalWidth() {
  const width = process.stdout.columns || 80;
  return Math.max(56, Math.min(width, 100));
}

function version() {
  const result = runCapture(["--version"]);
  return result.stdout.trim() || "dev";
}

function agentSnapshot() {
  const result = runCapture(["agents"]);
  const text = (result.stdout + result.stderr).trim();
  const routeMatch = text.match(/suggested:\s*([a-zA-Z0-9_-]+)/);
  const activityMatch = text.match(/activity:\s*([^|]+)/);
  const providers = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(codex|claude|gemini)\s+\S+\s+\S+\s+(.+?)\s{2,}/);
    if (!match) continue;
    const label = match[1] === "codex" ? "Codex" : match[1] === "claude" ? "Claude" : "Gemini";
    providers.push(`${label} ${match[2].trim()}`);
  }
  return {
    route: routeMatch ? routeMatch[1] : "unknown",
    activity: activityMatch ? activityMatch[1].trim() : "unknown",
    providers: providers.length ? providers.join(" | ") : "Agent Cat unavailable",
  };
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function cell(value, width) {
  const text = String(value);
  const plainWidth = displayWidth(stripAnsi(text));
  if (plainWidth <= width) return text + " ".repeat(width - plainWidth);
  const chars = Array.from(stripAnsi(text));
  let out = "";
  let used = 0;
  for (const ch of chars) {
    const next = charWidth(ch);
    if (used + next > width - 1) break;
    out += ch;
    used += next;
  }
  return out + "…".repeat(width > 0 ? 1 : 0) + " ".repeat(Math.max(0, width - used - 1));
}

function inputRowStyle(value) {
  if (!useAnsi || process.env.OMK_INPUT_BG === "none") return value;
  return `${theme.inputBg}${theme.inputFg}${value}${theme.reset}`;
}

function padInputRow(value, columns) {
  const width = displayWidth(stripAnsi(value));
  return value + " ".repeat(Math.max(0, columns - width));
}

function framedLine(left, middle, right, fill = "─") {
  const width = terminalWidth();
  const textWidth = displayWidth(stripAnsi(middle));
  const fillWidth = Math.max(0, width - displayWidth(left) - displayWidth(right) - textWidth);
  return left + middle + fill.repeat(fillWidth) + right;
}

function frameRow(label, value) {
  const width = terminalWidth();
  const inner = width - 4;
  const lines = String(value).split(/\r?\n/);
  const continuationLabel = " ".repeat(displayWidth(label));
  for (const [index, line] of lines.entries()) {
    const currentLabel = index === 0 ? label : continuationLabel;
    console.log(`│ ${cell(`${currentLabel}${line}`, inner)} │`);
  }
}

function rule() {
  console.log(framedLine("├", "", "┤"));
}

function statusLine(agents) {
  const parts = [
    color("magenta", `mode:${mode}`),
    color("cyan", `route:${agents.route}`),
    `repo:${shortPath(repo)}`,
    color("dim", "/help /agents /context /exit"),
  ];
  console.log(color("dim", parts.join("  ")));
}

let cachedAgents = null;

// ---------------------------------------------------------------------------
// Animated intro — "Kamisama descends". A truecolor shimmer sweeps the title
// while ✻ stars twinkle in. TTY + color only; skipped under NO_COLOR / OMK_ASCII
// / OMK_NO_INTRO so tests and pipes stay clean.
// ---------------------------------------------------------------------------

const truecolor = useAnsi && (process.env.COLORTERM === "truecolor" || process.env.COLORTERM === "24bit");

function rgb(r, g, b) {
  return `\x1b[38;2;${r}\x3b${g}\x3b${b}m`;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Magenta → pink → cyan ramp, with a moving white-hot shimmer band.
function gradientText(text, phase) {
  const stops = [
    [168, 85, 247], // violet
    [236, 72, 153], // pink
    [56, 189, 248], // cyan
  ];
  const chars = Array.from(text);
  let out = "";
  for (let i = 0; i < chars.length; i += 1) {
    const t = chars.length > 1 ? i / (chars.length - 1) : 0;
    const seg = t * (stops.length - 1);
    const idx = Math.min(stops.length - 2, Math.floor(seg));
    const local = seg - idx;
    let r = lerp(stops[idx][0], stops[idx + 1][0], local);
    let g = lerp(stops[idx][1], stops[idx + 1][1], local);
    let b = lerp(stops[idx][2], stops[idx + 1][2], local);
    // White-hot shimmer: a soft band centered on `phase` (0..1) sweeping across.
    const dist = Math.abs(t - phase);
    const glow = Math.max(0, 1 - dist * 6);
    if (glow > 0) {
      r = lerp(r, 255, glow);
      g = lerp(g, 255, glow);
      b = lerp(b, 255, glow);
    }
    out += truecolor ? `${rgb(r, g, b)}${chars[i]}` : `${color("brightMagenta", chars[i])}`;
  }
  return out + (useAnsi ? theme.reset : "");
}

const STAR_GLYPHS = ["✦", "✧", "✺", "✷", "·", "✵"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function playIntro() {
  if (!useAnsi || process.env.OMK_NO_INTRO === "1" || process.env.OMK_ASCII === "1") return;
  if (!process.stdout.isTTY) return;

  const title = "Oh My Kamisama";
  const width = terminalWidth();
  const cols = Math.min(width, 78);
  const rows = 7;
  console.clear();

  // Deterministic pseudo-stars (no Math.random dependency on env).
  const stars = [];
  for (let i = 0; i < 26; i += 1) {
    const x = (i * 37 + 11) % cols;
    const y = (i * 17 + 3) % rows;
    stars.push({ x, y, born: (i * 53) % 9, glyph: STAR_GLYPHS[i % STAR_GLYPHS.length] });
  }

  const titlePad = Math.max(0, Math.floor((cols - title.length) / 2));
  const hide = "\x1b[?25l";
  const show = "\x1b[?25h";
  process.stdout.write(hide);

  const frames = 16;
  try {
    for (let f = 0; f < frames; f += 1) {
      const phase = f / (frames - 1); // 0..1 shimmer sweep
      const grid = Array.from({ length: rows }, () => Array(cols).fill(" "));

      // Twinkle stars in.
      for (const s of stars) {
        if (f >= s.born) {
          const tw = (f + s.x) % 4;
          const g = tw === 0 ? STAR_GLYPHS[2] : tw === 1 ? s.glyph : tw === 2 ? "·" : s.glyph;
          grid[s.y][s.x] = g;
        }
      }

      // Render grid with a dim violet for stars.
      const starColor = truecolor ? rgb(120, 90, 200) : (theme.magenta || "");
      let buf = "\x1b[H"; // home
      for (let y = 0; y < rows; y += 1) {
        if (y === Math.floor(rows / 2)) {
          // Title row with shimmer, centered.
          buf += " ".repeat(titlePad) + gradientText(title, phase);
          // trailing stars on the title row beyond the title
          buf += "\n";
        } else {
          let line = "";
          for (let x = 0; x < cols; x += 1) {
            const ch = grid[y][x];
            line += ch === " " ? " " : `${starColor}${ch}${useAnsi ? theme.reset : ""}`;
          }
          buf += line + "\n";
        }
      }
      // Subtitle fades in over the second half.
      const sub = "one command · many agents · a suspicious amount of confidence";
      if (f > frames / 2) {
        const subPad = Math.max(0, Math.floor((cols - sub.length) / 2));
        buf += " ".repeat(subPad) + color("dim", sub) + "\n";
      } else {
        buf += "\n";
      }
      process.stdout.write(buf);
      await sleep(f < 4 ? 55 : 70);
    }
    // Final twinkle flash on the ✻ then settle.
    for (let i = 0; i < 3; i += 1) {
      const star = i % 2 === 0 ? (truecolor ? rgb(255, 255, 255) : color("bold", "✻")) : (truecolor ? rgb(168, 85, 247) : "");
      process.stdout.write(`\x1b[H${star}✻${useAnsi ? theme.reset : ""}`);
      await sleep(90);
    }
  } finally {
    process.stdout.write(show);
  }
  await sleep(120);
}

function banner() {
  const agents = agentSnapshot();
  cachedAgents = agents;
  console.clear();
  const heading = truecolor ? gradientText("Welcome to Oh My Kamisama!", 0.5) : color("bold", "Welcome to Oh My Kamisama!");
  const title = ` ${color("brightMagenta", "✻")} ${heading} ${color("dim", `v${version()}`)} `;
  console.log(framedLine("╭", title, "╮"));
  frameRow("", "");
  frameRow("  ", color("dim", "/help for help, /status for setup, /agents for live"));
  frameRow("", "");
  frameRow("  cwd:   ", shortPath(repo));
  frameRow("  mode:  ", `${color("magenta", mode)}    route: ${color("cyan", agents.route)}    state: ${agents.activity}`);
  frameRow("  ", color("dim", agents.providers));
  console.log(framedLine("╰", "", "╯"));
  console.log("");
  console.log(color("dim", " Tips for getting started:"));
  console.log(color("dim", "  - Run /connect to install Agent Cat Connectors"));
  console.log(color("dim", "  - Try /mode cockpit for long background work"));
  console.log(color("dim", "  - Run /advise <question> for advisors only"));
  console.log(color("dim", "  - Press ? for shortcuts, Ctrl+L to redraw"));
  console.log("");
}

function printTaskHeader(taskMode, task) {
  console.log("");
  console.log(framedLine("╭", ` ${color("bold", taskMode)} `, "╮"));
  frameRow("repo: ", shortPath(repo));
  frameRow("task: ", task);
  console.log(framedLine("╰", "", "╯"));
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function printTaskFooter(taskMode, code, elapsedMs) {
  const agents = agentSnapshot();
  cachedAgents = agents;
  const label = code === 0 ? color("green", "✓ done") : color("yellow", `✗ exit ${code}`);
  const elapsed = typeof elapsedMs === "number" ? color("dim", `(${formatElapsed(elapsedMs)})`) : "";
  console.log("");
  console.log(`${label} ${color("dim", taskMode)} ${elapsed}  ${color("dim", `mode:${mode} route:${agents.route}`)}`);
  statusLine(agents);
  console.log("");
}

function printCompactStatus() {
  const agents = agentSnapshot();
  console.log(`mode:  ${mode}`);
  console.log(`route: ${agents.route}`);
  console.log(`agents: ${agents.providers}`);
  console.log(`activity: ${agents.activity}`);
  rule();
}

function printShortcuts() {
  console.log("");
  console.log(framedLine("╭", ` ${color("bold", "Keyboard shortcuts")} `, "╮"));
  frameRow("  ", "Enter               submit the current input");
  frameRow("  ", "Shift+Enter         insert a newline");
  frameRow("  ", "Meta+Enter          insert a newline");
  frameRow("  ", "\\ + Enter           continue on next line");
  frameRow("  ", "↑ / ↓               history previous / next");
  frameRow("  ", "Ctrl+A / Ctrl+E     jump to start / end of line");
  frameRow("  ", "Ctrl+U / Ctrl+K     delete to start / end of line");
  frameRow("  ", "Ctrl+L              redraw the launch screen");
  frameRow("  ", "Ctrl+C              clear input (twice to exit)");
  frameRow("  ", "Ctrl+D              exit on empty input");
  frameRow("  ", "?                   show this overlay (empty input)");
  frameRow("  ", "/                   open slash command autocomplete");
  console.log(framedLine("╰", "", "╯"));
  console.log("");
}

function printHelp() {
  console.log(`Oh My Kamisama interactive shell

Type a natural-language task and press Enter. The current mode decides how it runs.

Slash commands:
  /help                 Show this help
  /shortcuts            Keyboard shortcuts overlay
  /exit                 Leave the shell
  /repo [PATH]          Show or change target repository
  /mode [MODE]          Show or set default mode: auto, conduct, run, claude, gemini, advise, bg, cockpit, cmux
  /agents               Refresh detailed agent status
  /refresh              Redraw the launch screen
  /intro                Replay the animated intro (OMK_NO_INTRO=1 to disable)
  /clear                Clear/redraw the launch screen
  /screen               Show the compact Claude-Code-style status panel
  /route                Show the current auto route
  /connect              Install/check Agent Cat Connectors
  /context              Show repo branch, scripts, surfaces, and route
  /diff                 Show git status and diff stats
  /cost                 Show Agent Cat usage/cost summary
  /tasks                List local .omk task queue
  /task TASK            Add a task to the local .omk task queue
  /done ID              Mark a task done
  /auto TASK            Auto-route a task to a single executor
  /conduct TASK         Run the multi-agent conductor loop
  /resume [run|latest]  Resume a previous conductor run (replays its session)
  /run TASK             Run Claude + Gemini advisors, then Codex
  /claude TASK          Run a direct Claude executor task
  /gemini TASK          Run a direct Gemini executor task
  /advise TASK          Ask advisors only
  /bg TASK              Start a background conductor job
  /cockpit TASK         Open a cmux cockpit for the task
  /ps                   List background jobs for the current repo
  /logs [JOB|latest]    Print job logs
  /tail [JOB|latest]    Follow job logs
  /watch [JOB|latest]   Watch job status and tails
  /kill JOB|latest      Stop a background job
  /tools                Show detected tools
  /status               Show omk and provider versions
  /doctor               Check required and optional CLIs
  /! COMMAND            Run a shell command in the current repo`);
  console.log("");
  console.log("Multiline input: Shift+Enter or Meta+Enter inserts a newline when your terminal sends it; backslash+Enter always continues on the next line.");
}

function splitCommand(line) {
  const firstSpace = line.search(/\s/);
  if (firstSpace < 0) return [line, ""];
  return [line.slice(0, firstSpace), line.slice(firstSpace).trim()];
}

function normalizeBackspaces(value) {
  const chars = [];
  for (const ch of Array.from(value)) {
    if (ch === "\b" || ch === "\x7f") {
      chars.pop();
    } else {
      chars.push(ch);
    }
  }
  return chars.join("");
}

async function runTask(taskMode, task) {
  if (!task) {
    console.error(`usage: /${taskMode} TASK`);
    return;
  }
  printTaskHeader(taskMode, task);
  const start = Date.now();
  const code = await runInherit([taskMode, "--repo", repo, task]);
  printTaskFooter(taskMode, code, Date.now() - start);
}

// ---------------------------------------------------------------------------
// Conductor live UI. The conductor engine (omk-conduct.js) emits semantic
// events; here we render a Claude-Code-style live surface: a sticky plan
// checklist, an animated multi-worker board with live activity, a "thinking"
// spinner, markdown-rendered narration, and loud error lines. A LiveRegion
// keeps the animated lines pinned to the bottom while permanent output scrolls
// above. In non-TTY / non-raw contexts everything degrades to plain lines.
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function oneLineJs(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function fmtBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
  return `${(n / (1024 * 1024)).toFixed(1)}M`;
}

function truncToWidth(line, width) {
  if (displayWidth(stripAnsi(line)) <= width) return line;
  let out = "";
  let vis = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === "\x1b") {
      const m = line.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (m) { out += m[0]; i += m[0].length; continue; }
    }
    const ch = line[i];
    const w = charWidth(ch);
    if (vis + w > width - 1) break;
    out += ch;
    vis += w;
    i += 1;
  }
  return out + "…" + (useAnsi ? theme.reset : "");
}

// Wrap an ANSI string by display width, breaking on spaces. ANSI escapes are
// copied verbatim and counted as zero width.
function wrapAnsiString(s, width) {
  const lines = [];
  for (const para of String(s).split("\n")) {
    let line = "";
    let lineW = 0;
    let lastSpace = -1;
    let i = 0;
    while (i < para.length) {
      if (para[i] === "\x1b") {
        const m = para.slice(i).match(/^\x1b\[[0-9;]*m/);
        if (m) { line += m[0]; i += m[0].length; continue; }
      }
      const ch = para[i];
      const w = charWidth(ch);
      if (lineW + w > width && lineW > 0) {
        if (lastSpace >= 0) {
          const rest = line.slice(lastSpace + 1);
          lines.push(line.slice(0, lastSpace));
          line = rest;
          lineW = displayWidth(stripAnsi(rest));
        } else {
          lines.push(line);
          line = "";
          lineW = 0;
        }
        lastSpace = -1;
      }
      if (ch === " ") lastSpace = line.length;
      line += ch;
      lineW += w;
      i += 1;
    }
    lines.push(line);
  }
  return lines;
}

function renderMarkdownInline(text) {
  let s = String(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => color("cyan", c));
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, c) => color("bold", c));
  s = s.replace(/__([^_]+)__/g, (_, c) => color("bold", c));
  s = s.replace(/^#{1,6}\s+(.*)$/gm, (_, c) => color("bold", c));
  s = s.replace(/^(\s*)[-*]\s+/gm, "$1• ");
  return s;
}

function sayBlock(text) {
  const glyph = color("brightMagenta", "✻");
  const md = renderMarkdownInline(text);
  const wrapped = wrapAnsiString(md, Math.max(20, terminalWidth() - 2));
  return wrapped.map((l, i) => (i === 0 ? `${glyph} ${l}` : `  ${l}`)).join("\n");
}

function planGlyph(status) {
  return status === "done" ? "☑" : status === "in_progress" ? "◐" : status === "blocked" ? "⚠" : "☐";
}

function planLine(p) {
  const g = planGlyph(p.status);
  if (p.status === "done") return color("green", `  ${g} ${p.title}`);
  if (p.status === "in_progress") return color("cyan", `  ${g} `) + color("bold", p.title);
  if (p.status === "blocked") return color("yellow", `  ${g} ${p.title}`);
  return color("dim", `  ${g} ${p.title}`);
}

function workerLine(w, frame) {
  let glyph;
  let c;
  if (w.status === "running") { glyph = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]; c = "cyan"; }
  else if (w.status === "done") { glyph = "✓"; c = "green"; }
  else if (w.status === "failed") { glyph = "✗"; c = "red"; }
  else if (w.status === "timeout") { glyph = "⏱"; c = "yellow"; }
  else { glyph = "○"; c = "dim"; }
  const meta = [];
  if (w.ms) meta.push(formatElapsed(w.ms));
  if (w.bytes) meta.push(fmtBytes(w.bytes));
  const metaStr = meta.length ? color("dim", " " + meta.join(" ")) : "";
  const detail = w.activity ? w.activity : (w.status === "queued" ? "queued" : oneLineJs(w.task, 48));
  return color(c, `  ${glyph} ${w.agent}`) + metaStr + color("dim", "  " + detail);
}

function spinnerLine(label, frame, startMs) {
  const g = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
  const secs = formatElapsed(Date.now() - startMs);
  return color("brightMagenta", `  ${g} ${label}…`) + color("dim", ` (${secs} · esc to interrupt)`);
}

// A block of lines pinned to the bottom of the screen. Permanent output prints
// above it via print(); the live lines are redrawn in place via set().
function makeLiveRegion() {
  let lines = [];
  let rendered = 0;
  const active = () => rawActive() && process.stdout.isTTY;
  const clear = () => {
    if (!active() || rendered === 0) { rendered = 0; return; }
    process.stdout.write("\r");
    if (rendered > 1) process.stdout.write(`\x1b[${rendered - 1}A`);
    process.stdout.write("\x1b[J");
    rendered = 0;
  };
  const paint = () => {
    if (!active()) { rendered = 0; return; }
    let out = "";
    for (let i = 0; i < lines.length; i += 1) {
      out += "\x1b[K" + lines[i];
      if (i < lines.length - 1) out += "\r\n";
    }
    process.stdout.write(out);
    rendered = lines.length;
  };
  const set = (newLines) => {
    const nl = (newLines || []).filter(Boolean);
    if (!active()) { lines = nl; return; }
    clear();
    lines = nl;
    paint();
  };
  const print = (text) => {
    clear();
    const t = String(text);
    process.stdout.write((rawActive() ? t.replace(/\n/g, "\r\n") : t) + (rawActive() ? "\r\n" : "\n"));
    paint();
  };
  return { set, print, clear, active };
}

function buildConductorIo() {
  const region = makeLiveRegion();
  let plan = [];
  let workers = [];
  let spinner = null;
  let frame = 0;
  let timer = null;

  const compose = () => {
    const out = [];
    for (const p of plan) out.push(planLine(p));
    for (const w of workers) out.push(workerLine(w, frame));
    if (spinner && !workers.length) out.push(spinnerLine(spinner.label, frame, spinner.start));
    const w = Math.max(20, terminalWidth() - 1);
    return out.map((l) => truncToWidth(l, w));
  };
  const repaint = () => region.set(compose());

  const startTimer = () => {
    if (timer || !region.active()) return;
    timer = setInterval(() => { frame = (frame + 1) % 100000; repaint(); }, 100);
    if (timer.unref) timer.unref();
  };
  const stopTimerIfIdle = () => {
    const busy = spinner || workers.some((w) => w.status === "running" || w.status === "queued");
    if (timer && !busy) { clearInterval(timer); timer = null; }
  };

  return {
    print: (s) => region.print(String(s)),
    dim: (s) => color("dim", String(s)),
    note: (s) => region.print(color("dim", "· " + s)),
    error: (s) => region.print(color("red", "✗ " + s)),
    say: (s) => region.print(sayBlock(String(s))),
    plan: (items) => { plan = (items || []).slice(); repaint(); },
    turnStart: (label) => { spinner = { label: label || "Working", start: Date.now() }; startTimer(); repaint(); },
    turnEnd: () => { spinner = null; stopTimerIfIdle(); repaint(); },
    delegationsStart: (list) => {
      workers = (list || []).map((d) => ({ agent: d.agent, model: d.model, task: d.task, status: "queued", ms: 0, bytes: 0, activity: "" }));
      startTimer();
      repaint();
    },
    delegationUpdate: (i, patch) => { if (workers[i]) { Object.assign(workers[i], patch); repaint(); } },
    delegationsEnd: () => {
      const finals = workers;
      workers = [];
      region.set(compose());
      for (const w of finals) region.print(workerLine(w, frame));
      stopTimerIfIdle();
      repaint();
    },
    ask: async (question, options) => {
      region.clear();
      if (ttyPicker) return ttyPicker(question, options);
      const env = process.env.OMK_CONDUCT_AUTO_ANSWER;
      if (env) return env;
      const first = options && options[0];
      return (first && (first.label || first)) || "";
    },
    bindInterrupt: (fn) => { conductorState.interrupt = fn; },
    close: () => {
      if (timer) { clearInterval(timer); timer = null; }
      const finalPlan = plan;
      plan = []; workers = []; spinner = null;
      region.set([]);
      for (const p of finalPlan) region.print(planLine(p));
    },
  };
}

async function runConductorWith(label, runOpts) {
  printTaskHeader(label, runOpts.task || path.basename(runOpts.resumeDir || ""));
  const start = Date.now();
  const io = buildConductorIo();
  const wasRaw = rawActive();
  if (process.stdin.isTTY) setRawMode(true);
  let code = 0;
  try {
    const result = await conductor.runConductor({ repo, io, ...runOpts });
    code = result && result.interrupted ? 130 : 0;
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    code = 1;
  } finally {
    if (io.close) io.close();
    conductorState.interrupt = null;
    if (process.stdin.isTTY && !wasRaw) setRawMode(false);
  }
  printTaskFooter(label, code, Date.now() - start);
}

async function runConductorTask(task) {
  if (!task) return;
  await runConductorWith("conduct", { task });
}

async function runConductorResume(token) {
  const dir = conductor.findResumeDir(repo, token || "latest");
  if (!dir) {
    console.error(`omk: no resumable conductor run found in ${shortPath(repo)}/.omk/runs`);
    return;
  }
  await runConductorWith("resume", { resumeDir: dir });
}

// Arrow-key picker for conductor `ask`. Installed only while a conductor turn is
// running, so the main input handler is dormant (it early-returns on `running`).
function makeTtyPicker() {
  return (question, options) => new Promise((resolve) => {
    const labels = (options || []).map((o) => (typeof o === "string" ? o : (o && o.label) || String(o)));
    if (!labels.length) { resolve(""); return; }
    pickerActive = true;
    let selected = 0;
    let rendered = 0;

    const draw = () => {
      if (rendered > 0) {
        process.stdout.write(`\x1b[${rendered}A`);
        process.stdout.write("\x1b[J");
      }
      const lines = [];
      lines.push(`${color("bold", "?")} ${question}`);
      labels.forEach((label, i) => {
        const sel = i === selected;
        lines.push(sel ? `${color("cyan", "❯")} ${color("cyan", label)}` : `  ${label}`);
      });
      lines.push(color("dim", "  ↑/↓ select · Enter confirm · Esc cancel"));
      process.stdout.write(lines.join("\r\n") + "\r\n");
      rendered = lines.length;
    };

    const cleanup = () => {
      process.stdin.off("keypress", onKey);
      pickerActive = false;
    };

    const onKey = (_str, key = {}) => {
      if (!key) return;
      if (key.name === "up") { selected = (selected - 1 + labels.length) % labels.length; draw(); }
      else if (key.name === "down") { selected = (selected + 1) % labels.length; draw(); }
      else if (key.name === "return" || key.name === "enter") { cleanup(); resolve(labels[selected]); }
      else if (key.name === "escape" || (key.ctrl && key.name === "c")) { cleanup(); resolve("__INTERRUPT__"); }
    };

    draw();
    process.stdin.on("keypress", onKey);
  });
}

async function handleSlash(line) {
  const [command, rest] = splitCommand(line);
  switch (command) {
    case "/help":
    case "/?":
      printHelp();
      return true;
    case "/shortcuts":
    case "/keys":
      printShortcuts();
      return true;
    case "/exit":
    case "/quit":
      return false;
    case "/repo":
      if (!rest) {
        console.log(repo);
      } else {
        const next = path.resolve(repo, rest);
        if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
          console.error(`repo not found: ${rest}`);
        } else {
          repo = next;
          banner();
        }
      }
      return true;
    case "/mode":
      if (!rest) {
        console.log(mode);
      } else if (validModes.has(rest)) {
        mode = rest;
        banner();
      } else {
        console.error("valid modes: auto, conduct, run, claude, gemini, advise, bg, cockpit, cmux");
      }
      return true;
    case "/refresh":
    case "/home":
    case "/clear":
      banner();
      return true;
    case "/intro":
      await playIntro();
      banner();
      return true;
    case "/agents":
      await runInherit(["agents"]);
      return true;
    case "/route": {
      const agents = agentSnapshot();
      console.log(`auto route: ${agents.route}`);
      return true;
    }
    case "/screen":
    case "/statusline":
      printCompactStatus();
      return true;
    case "/connect":
      await runInherit(["connect"]);
      return true;
    case "/context":
      await runInherit(["context", "--repo", repo]);
      return true;
    case "/diff":
      await runInherit(["diff", "--repo", repo]);
      return true;
    case "/cost":
    case "/usage":
      await runInherit(["cost"]);
      return true;
    case "/tasks":
      await runInherit(["tasks", "--repo", repo]);
      return true;
    case "/task":
      if (!rest) console.error("usage: /task TASK");
      else await runInherit(["task", "--repo", repo, "add", rest]);
      return true;
    case "/done":
      if (!rest) console.error("usage: /done ID");
      else await runInherit(["task", "--repo", repo, "done", rest]);
      return true;
    case "/conduct":
      if (!rest) console.error("usage: /conduct TASK");
      else await runConductorTask(rest);
      return true;
    case "/resume":
      await runConductorResume(rest);
      return true;
    case "/auto":
    case "/run":
    case "/claude":
    case "/gemini":
    case "/advise":
    case "/bg":
    case "/cockpit":
    case "/cmux":
      await runTask(command.slice(1), rest);
      return true;
    case "/ps":
      await runInherit(["ps", "--repo", repo]);
      return true;
    case "/logs":
      await runInherit(["logs", "--repo", repo, rest || "latest"]);
      return true;
    case "/tail":
      await runInherit(["tail", "--repo", repo, rest || "latest"]);
      return true;
    case "/watch":
      await runInherit(["watch", "--repo", repo, rest || "latest"]);
      return true;
    case "/kill":
      if (!rest) console.error("usage: /kill JOB|latest");
      else await runInherit(["kill", "--repo", repo, rest]);
      return true;
    case "/tools":
      await runInherit(["tools"]);
      return true;
    case "/status":
      await runInherit(["status"]);
      return true;
    case "/doctor":
      await runInherit(["doctor"]);
      return true;
    case "/!":
      if (!rest) {
        console.error("usage: /! COMMAND");
      } else {
        await withCookedInput(() => new Promise((resolve) => {
          const child = spawn(rest, { cwd: repo, shell: true, stdio: "inherit" });
          child.on("exit", () => resolve());
          child.on("error", (err) => {
            console.error(err.message);
            resolve();
          });
        }));
      }
      return true;
    default:
      if (command.startsWith("/!")) {
        const shellCommand = line.slice(2).trim();
        if (shellCommand) {
          await withCookedInput(() => new Promise((resolve) => {
            const child = spawn(shellCommand, { cwd: repo, shell: true, stdio: "inherit" });
            child.on("exit", () => resolve());
            child.on("error", (err) => {
              console.error(err.message);
              resolve();
            });
          }));
        }
        return true;
      }
      console.error(`unknown command: ${command}`);
      console.error("type /help for commands");
      return true;
  }
}

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (!cp) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp >= 0x300 && cp <= 0x36f) return 0;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2329 && cp <= 0x232a) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}

function displayWidth(value) {
  return Array.from(value).reduce((sum, ch) => sum + charWidth(ch), 0);
}

async function processLine(raw) {
  const line = normalizeBackspaces(String(raw).replace(/\r\n?/g, "\n")).trim();
  if (!line) return true;
  if (line.startsWith("/")) {
    return handleSlash(line);
  }
  if (mode === "auto" || mode === "conduct") {
    await runConductorTask(line);
  } else {
    await runTask(mode === "cmux" ? "cockpit" : mode, line);
  }
  return true;
}

async function readlineLoop() {
  const multiline = process.env.OMK_MULTILINE !== "0";
  const pendingLines = [];
  let insertMultilineBreak = () => {};
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptText,
    historySize: 200,
    removeHistoryDuplicates: true,
  });
  const promptIfOpen = (preserveCursor = false) => {
    if (!rl.closed) rl.prompt(preserveCursor);
  };

  const insertReadlineText = (text) => {
    rl.line = rl.line.slice(0, rl.cursor) + text + rl.line.slice(rl.cursor);
    rl.cursor += text.length;
    if (typeof rl._refreshLine === "function") {
      rl._refreshLine();
    } else {
      promptIfOpen(true);
    }
  };
  insertMultilineBreak = () => {
    if (!rl.closed) {
      rl.cursor = rl.line.length;
      insertReadlineText("\n");
    }
  };

  const continueWithLine = (line) => {
    pendingLines.push(line);
    rl.setPrompt(continuationPromptText);
  };

  const resetPrompt = () => {
    pendingLines.length = 0;
    rl.setPrompt(promptText);
  };

  let ctrlLHandler = null;
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    ctrlLHandler = (_str, key) => {
      if (key && key.ctrl && key.name === "l") {
        banner();
        promptIfOpen(true);
      }
      if (!key || !multiline) return;
      const isEnter = key.name === "return" || key.name === "enter";
      const isModifiedEnter = isEnter && (key.shift || key.meta);
      if (isModifiedEnter) {
        insertMultilineBreak();
      }
    };
    process.stdin.on("keypress", ctrlLHandler);
  }

  promptIfOpen();
  try {
    for await (const raw of rl) {
      let input = raw;
      if (multiline && input.endsWith("\\")) {
        continueWithLine(input.slice(0, -1));
        promptIfOpen();
        continue;
      }
      if (pendingLines.length) {
        input = [...pendingLines, input].join("\n");
        resetPrompt();
      }
      const keepGoing = await processLine(input);
      if (!keepGoing) break;
      promptIfOpen();
    }
  } finally {
    if (ctrlLHandler) process.stdin.off("keypress", ctrlLHandler);
    if (!rl.closed) rl.close();
  }
}

function computeBoxWidth() {
  const columns = Math.max(40, process.stdout.columns || 80);
  // Leave one spare column so a full-width row never hits the right margin and
  // triggers the terminal's deferred auto-wrap, which desyncs our row math.
  return Math.min(columns - 1, 100);
}

function buildInputLines(chars, cursor, innerWidth) {
  const prompt = promptText;
  const continuation = "  ";
  const wrapPrompt = " ".repeat(displayWidth(continuation));
  const rows = [];
  let row = prompt;
  let rowWidth = displayWidth(prompt);
  let prefixWidth = displayWidth(prompt);
  let cursorRow = 0;
  let cursorCol = rowWidth;

  const pushRow = () => {
    rows.push(row);
  };
  const newRow = (prefix) => {
    row = prefix;
    rowWidth = displayWidth(prefix);
    prefixWidth = rowWidth;
  };
  const markCursor = () => {
    cursorRow = rows.length;
    cursorCol = rowWidth;
  };

  if (cursor === 0) markCursor();
  for (let index = 0; index < chars.length; index += 1) {
    const ch = chars[index];
    if (ch === "\n") {
      pushRow();
      newRow(continuation);
      if (cursor === index + 1) markCursor();
      continue;
    }

    const width = charWidth(ch);
    if (rowWidth + width > innerWidth && rowWidth > prefixWidth) {
      pushRow();
      newRow(wrapPrompt);
    }

    row += ch;
    rowWidth += width;
    if (cursor === index + 1) markCursor();
  }
  pushRow();
  const padded = rows.map((value) => {
    const visible = displayWidth(stripAnsi(value));
    return value + " ".repeat(Math.max(0, innerWidth - visible));
  });
  return { rows: padded, cursorRow, cursorCol };
}

function computeSlashPopup(text) {
  const trimmed = text.replace(/^\s+/, "");
  if (!trimmed.startsWith("/")) return [];
  const firstWord = trimmed.split(/\s/, 1)[0].toLowerCase();
  if (firstWord.length < 2) return [];
  const matches = SLASH_COMMANDS
    .filter(([cmd]) => cmd.startsWith(firstWord))
    .slice(0, 7);
  if (!matches.length) return [];
  if (matches.length === 1 && matches[0][0] === firstWord) return [];
  const maxCmd = Math.max(...matches.map(([c]) => c.length));
  return matches.map(([cmd, desc]) =>
    color("dim", "  ") + color("cyan", cmd.padEnd(maxCmd)) + color("dim", `  ${desc}`)
  );
}

function buildView(chars, cursor) {
  const boxWidth = computeBoxWidth();
  const inner = boxWidth - 4;
  const top = "╭" + "─".repeat(boxWidth - 2) + "╮";
  const bottom = "╰" + "─".repeat(boxWidth - 2) + "╯";

  const input = buildInputLines(chars, cursor, inner);
  const popup = computeSlashPopup(chars.join(""));

  const rows = [];
  let cursorRow = 0;
  let cursorCol = 0;

  for (const line of popup) rows.push(line);

  rows.push(top);
  for (let i = 0; i < input.rows.length; i += 1) {
    rows.push(`│ ${input.rows[i]} │`);
    if (i === input.cursorRow) {
      cursorRow = rows.length - 1;
      cursorCol = 2 + input.cursorCol;
    }
  }
  rows.push(bottom);

  const agents = cachedAgents || { route: "?" };
  const left = color("dim", "? for shortcuts");
  const right = color("dim", `mode:${mode} · route:${agents.route} · ${shortPath(repo)}`);
  const leftW = displayWidth(stripAnsi(left));
  const rightW = displayWidth(stripAnsi(right));
  const pad = Math.max(2, boxWidth - leftW - rightW - 2);
  rows.push(`  ${left}${" ".repeat(pad)}${right}`);

  return { rows, cursorRow, cursorCol };
}

async function terminalInputLoop() {
  readline.emitKeypressEvents(process.stdin);

  let chars = [];
  let cursor = 0;
  const history = [];
  let historyIndex = 0;
  let running = false;
  let done = false;
  // Invariant: between renders, the real cursor sits at (pendingCursorRow) within
  // the block of `renderedRows` lines. render() always normalizes back to the
  // block's first line before redrawing, so we never accumulate ghost frames.
  let renderedRows = 0;
  let pendingCursorRow = 0;

  const climbToTop = () => {
    // Go from the parked input cursor up to the very first row of the old block.
    process.stdout.write("\r");
    if (pendingCursorRow > 0) process.stdout.write(`\x1b[${pendingCursorRow}A`);
  };

  const render = () => {
    if (renderedRows > 0) {
      climbToTop();
      process.stdout.write("\x1b[J"); // erase old block (from first row down)
    }

    const view = buildView(chars, cursor);
    // Raw mode: each newline needs an explicit carriage return. Clear each line
    // (\x1b[K) before writing so a shorter line can't leave stale glyphs.
    let out = "";
    for (let i = 0; i < view.rows.length; i += 1) {
      out += "\x1b[K" + view.rows[i];
      if (i < view.rows.length - 1) out += "\r\n";
    }
    process.stdout.write(out);
    renderedRows = view.rows.length;

    // Cursor is at the end of the last row. Move it to the input position.
    process.stdout.write("\r");
    const upToCursor = renderedRows - 1 - view.cursorRow;
    if (upToCursor > 0) process.stdout.write(`\x1b[${upToCursor}A`);
    if (view.cursorCol > 0) process.stdout.write(`\x1b[${view.cursorCol}C`);
    pendingCursorRow = view.cursorRow;
  };

  const clearRender = () => {
    if (renderedRows > 0) {
      climbToTop();
      process.stdout.write("\x1b[J");
      renderedRows = 0;
      pendingCursorRow = 0;
    }
  };

  const setLine = (value) => {
    chars = Array.from(value);
    cursor = chars.length;
  };

  const submit = async () => {
    if (running) return;
    running = true;
    const raw = chars.join("");
    // Move from the input cursor down past the whole block, then onto a fresh
    // line so command output starts cleanly below the (now committed) box.
    process.stdout.write("\r");
    const rowsBelowCursor = renderedRows - pendingCursorRow - 1;
    if (rowsBelowCursor > 0) process.stdout.write(`\x1b[${rowsBelowCursor}B`);
    process.stdout.write("\r\n");
    renderedRows = 0;
    pendingCursorRow = 0;
    setLine("");
    historyIndex = history.length;
    const normalized = normalizeBackspaces(raw).trim();
    if (normalized && history[history.length - 1] !== normalized) {
      history.push(normalized);
      if (history.length > 200) history.shift();
    }
    let keepGoing = true;
    try {
      keepGoing = await withCookedInput(() => processLine(raw));
    } catch (err) {
      console.error(err && err.stack ? err.stack : String(err));
    }
    if (!keepGoing) {
      done = true;
      setRawMode(false);
      process.stdin.pause();
      return;
    }
    running = false;
    if (!done) render();
  };

  const insertText = (value) => {
    const inputChars = Array.from(value);
    if (!inputChars.length) return;
    chars.splice(cursor, 0, ...inputChars);
    cursor += inputChars.length;
    render();
  };

  const insertNewline = () => {
    insertText("\n");
  };

  setRawMode(true);
  process.stdin.resume();
  ttyPicker = makeTtyPicker();
  render();

  // Redraw the input box when the terminal is resized so it tracks the new
  // width instead of staying misaligned until the next keystroke. A running
  // conductor owns the screen and recomputes width on its own repaint.
  const onResize = () => {
    if (done || running) return;
    clearRender();
    render();
  };
  process.stdout.on("resize", onResize);

  return new Promise((resolve) => {
    const exitLoop = () => {
      process.stdout.removeListener("resize", onResize);
      process.stdin.off("keypress", onKeypress);
      resolve();
    };
    const onKeypress = (str, key = {}) => {
      if (done) return;
      if (running) {
        // A conductor turn owns the screen. The picker (if open) has its own
        // listener; otherwise Esc/Ctrl+C interrupts the running conductor.
        if (!pickerActive && conductorState.interrupt &&
            (key.name === "escape" || (key.ctrl && key.name === "c"))) {
          conductorState.interrupt();
        }
        return;
      }

      if (key.ctrl && key.name === "c") {
        if (chars.length) {
          setLine("");
          render();
        } else {
          done = true;
          setRawMode(false);
          process.stdout.write("\n");
          process.stdin.pause();
          exitLoop();
        }
        return;
      }

      if (key.ctrl && key.name === "d" && !chars.length) {
        done = true;
        setRawMode(false);
        process.stdout.write("\n");
        process.stdin.pause();
        exitLoop();
        return;
      }

      if (key.ctrl && key.name === "a") {
        cursor = 0;
        render();
        return;
      }

      if (key.ctrl && key.name === "e") {
        cursor = chars.length;
        render();
        return;
      }

      if (key.ctrl && key.name === "u") {
        chars.splice(0, cursor);
        cursor = 0;
        render();
        return;
      }

      if (key.ctrl && key.name === "k") {
        chars.splice(cursor);
        render();
        return;
      }

      if (key.ctrl && key.name === "l") {
        renderedRows = 0;
        pendingCursorRow = 0;
        // banner() uses console.log (bare \n); cook the terminal first so raw
        // mode does not staircase the multi-line output.
        setRawMode(false);
        banner();
        setRawMode(true);
        render();
        return;
      }

      const sequence = key.sequence || str || "";
      if (sequence === "\x1b[13;2u" || sequence === "\x1b[13;2~" || sequence === "\x1b\r" || sequence === "\x1b\n") {
        insertNewline();
        return;
      }

      if (key.name === "return" || key.name === "enter" || str === "\r" || str === "\n") {
        if (chars[cursor - 1] === "\\") {
          chars.splice(cursor - 1, 1, "\n");
          render();
          return;
        }
        if (key.shift || key.meta) {
          insertNewline();
          return;
        }
        submit().then(() => {
          if (done) exitLoop();
        });
        return;
      }

      if (key.name === "backspace" || str === "\b" || str === "\x7f") {
        if (cursor > 0) {
          chars.splice(cursor - 1, 1);
          cursor -= 1;
          render();
        }
        return;
      }

      if (key.name === "delete") {
        if (cursor < chars.length) {
          chars.splice(cursor, 1);
          render();
        }
        return;
      }

      if (key.name === "left") {
        if (cursor > 0) {
          cursor -= 1;
          render();
        }
        return;
      }

      if (key.name === "right") {
        if (cursor < chars.length) {
          cursor += 1;
          render();
        }
        return;
      }

      if (key.name === "up") {
        if (history.length && historyIndex > 0) {
          historyIndex -= 1;
          setLine(history[historyIndex]);
          render();
        }
        return;
      }

      if (key.name === "down") {
        if (historyIndex < history.length - 1) {
          historyIndex += 1;
          setLine(history[historyIndex]);
        } else {
          historyIndex = history.length;
          setLine("");
        }
        render();
        return;
      }

      if (str === "?" && chars.length === 0) {
        clearRender();
        // printShortcuts() uses console.log; cook the terminal so raw mode does
        // not staircase the overlay.
        setRawMode(false);
        printShortcuts();
        setRawMode(true);
        render();
        return;
      }

      if (str && !key.ctrl && !key.meta) {
        const inputChars = Array.from(str).filter((ch) => ch >= " " && ch !== "\x7f");
        if (inputChars.length) {
          insertText(inputChars.join(""));
        }
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

async function main() {
  await playIntro();
  banner();
  const wantReadline = process.env.OMK_READLINE_REPL === "1";
  if (!wantReadline && process.stdin.isTTY && process.stdout.isTTY) {
    await terminalInputLoop();
  } else {
    await readlineLoop();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
