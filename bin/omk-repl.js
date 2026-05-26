#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { spawn, spawnSync } = require("child_process");

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
const validModes = new Set(["auto", "run", "claude", "gemini", "advise", "bg", "cockpit", "cmux"]);
if (!validModes.has(mode)) mode = "auto";
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
  inputBg: "\x1b[48;5;236m",
  inputFg: "\x1b[38;5;252m",
};

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

function banner() {
  const agents = agentSnapshot();
  console.clear();
  const title = ` ${color("bold", "Oh My Kamisama")} ${color("dim", `v${version()}`)} `;
  console.log(framedLine("╭", title, "╮"));
  frameRow("repo:  ", shortPath(repo));
  frameRow("mode:  ", mode);
  frameRow("route: ", agents.route);
  frameRow("state: ", agents.activity);
  rule();
  frameRow("agents: ", agents.providers);
  rule();
  frameRow("try:   ", "describe a task, /mode cockpit, /advise <question>");
  frameRow("keys:  ", "Enter run  Shift+Enter newline  Ctrl+L redraw");
  console.log(framedLine("╰", "", "╯"));
  statusLine(agents);
  console.log("");
  console.log("type a task, /agents for detail, /context for repo, /exit to quit");
  console.log("");
}

function printTaskHeader(taskMode, task) {
  console.log("");
  console.log(framedLine("╭", ` ${color("bold", taskMode)} `, "╮"));
  frameRow("repo: ", shortPath(repo));
  frameRow("task: ", task);
  console.log(framedLine("╰", "", "╯"));
}

function printTaskFooter(taskMode, code) {
  const agents = agentSnapshot();
  const label = code === 0 ? color("green", "done") : color("yellow", `exit ${code}`);
  console.log("");
  console.log(`${label} ${color("dim", taskMode)}  ${color("dim", `mode:${mode} route:${agents.route}`)}`);
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

function printHelp() {
  console.log(`Oh My Kamisama interactive shell

Type a natural-language task and press Enter. The current mode decides how it runs.

Slash commands:
  /help                 Show this help
  /exit                 Leave the shell
  /repo [PATH]          Show or change target repository
  /mode [MODE]          Show or set default mode: auto, run, claude, gemini, advise, bg, cockpit, cmux
  /agents               Refresh detailed agent status
  /refresh              Redraw the launch screen
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
  /auto TASK            Auto-route a task
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
  const code = await runInherit([taskMode, "--repo", repo, task]);
  printTaskFooter(taskMode, code);
}

async function handleSlash(line) {
  const [command, rest] = splitCommand(line);
  switch (command) {
    case "/help":
    case "/?":
      printHelp();
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
        console.error("valid modes: auto, run, claude, gemini, advise, bg, cockpit, cmux");
      }
      return true;
    case "/refresh":
    case "/home":
    case "/clear":
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
  await runTask(mode === "cmux" ? "cockpit" : mode, line);
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

function buildInputRows(chars, cursor) {
  const columns = Math.max(20, process.stdout.columns || 80);
  const prompt = promptText;
  const continuation = continuationPromptText;
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
    if (rowWidth + width > columns && rowWidth > prefixWidth) {
      pushRow();
      newRow(wrapPrompt);
    }

    row += ch;
    rowWidth += width;
    if (cursor === index + 1) markCursor();
  }
  pushRow();
  const styledRows = rows.map((value) => inputRowStyle(padInputRow(value, columns)));
  return {
    rows: styledRows,
    cursorRow,
    cursorCol,
  };
}

async function terminalInputLoop() {
  readline.emitKeypressEvents(process.stdin);

  let chars = [];
  let cursor = 0;
  const history = [];
  let historyIndex = 0;
  let running = false;
  let done = false;
  let renderedRows = 0;
  let renderedCursorRow = 0;

  const render = () => {
    if (renderedRows > 0) {
      process.stdout.write("\r");
      if (renderedCursorRow > 0) process.stdout.write(`\x1b[${renderedCursorRow}A`);
      process.stdout.write("\x1b[J");
    }

    const view = buildInputRows(chars, cursor);
    process.stdout.write(view.rows.join("\n"));
    renderedRows = view.rows.length;
    renderedCursorRow = view.cursorRow;

    const rowsBelowCursor = renderedRows - view.cursorRow - 1;
    process.stdout.write("\r");
    if (rowsBelowCursor > 0) process.stdout.write(`\x1b[${rowsBelowCursor}A`);
    if (view.cursorCol > 0) process.stdout.write(`\x1b[${view.cursorCol}C`);
  };

  const setLine = (value) => {
    chars = Array.from(value);
    cursor = chars.length;
  };

  const submit = async () => {
    if (running) return;
    running = true;
    const raw = chars.join("");
    process.stdout.write("\r");
    const rowsBelowCursor = renderedRows - renderedCursorRow - 1;
    if (rowsBelowCursor > 0) process.stdout.write(`\x1b[${rowsBelowCursor}B`);
    process.stdout.write("\n");
    renderedRows = 0;
    renderedCursorRow = 0;
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
  render();

  return new Promise((resolve) => {
    const onKeypress = (str, key = {}) => {
      if (done || running) return;

      if (key.ctrl && key.name === "c") {
        if (chars.length) {
          setLine("");
          render();
        } else {
          done = true;
          setRawMode(false);
          process.stdout.write("\n");
          process.stdin.pause();
          resolve();
        }
        return;
      }

      if (key.ctrl && key.name === "d" && !chars.length) {
        done = true;
        setRawMode(false);
        process.stdout.write("\n");
        process.stdin.pause();
        resolve();
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
        renderedCursorRow = 0;
        banner();
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
          if (done) {
            process.stdin.off("keypress", onKeypress);
            resolve();
          }
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
