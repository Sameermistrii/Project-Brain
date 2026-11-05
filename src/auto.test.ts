import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { forgetAccountStates } from "./accounts.js";
import { initBrain, loadBrain, setMode, setWriter } from "./brain.js";
import { lastUndoable } from "./checkpoints.js";
import { submitToBrain } from "./session.js";

// Fake Claude and Codex tools that answer like the real ones, so the whole Auto flow runs without paid requests.
const tools = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-fake-tools-"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-fake-home-"));
const log = path.join(home, "calls.log");

fs.writeFileSync(
  path.join(tools, "claude"),
  `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "auth") { console.log(JSON.stringify({ loggedIn: true })); process.exit(0); }
const prompt = fs.readFileSync(0, "utf8");
const mode = args[args.indexOf("--permission-mode") + 1];
fs.appendFileSync(${JSON.stringify(log)}, "claude " + mode + " " + (prompt.includes("You decide how to handle") ? "route" : prompt.includes("You assign jobs") ? "choose" : prompt.includes("Mode: Review") ? "review" : "other") + "\\n");
const result = prompt.includes("You decide how to handle")
  ? '{"mode":"debug","builder":"gpt","reviewer":"claude","why":"It describes a button that does not work."}'
  : prompt.includes("You assign jobs")
  ? 'Here you go: {"builder":"gpt","reviewer":"claude","why":"ChatGPT is quick at small fixes."}'
  : "**No problems found.** The fix is minimal.";
console.log(JSON.stringify({ type: "result", is_error: false, result, usage: { input_tokens: 10, output_tokens: 5 } }));
`,
);
fs.writeFileSync(
  path.join(tools, "codex"),
  `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, "utf8");
const cwd = args[args.indexOf("--cd") + 1];
const sandbox = args[args.indexOf("--sandbox") + 1];
fs.appendFileSync(${JSON.stringify(log)}, "codex " + sandbox + " " + (prompt.includes("Mode: Debug") ? "debug" : "other") + "\\n");
if (sandbox === "workspace-write") fs.writeFileSync(path.join(cwd, "save.js"), "export const save = () => true;\\n");
console.log("Fixed the save handler.");
console.error("tokens used: 1,234");
`,
);
for (const name of ["claude", "codex"]) fs.chmodSync(path.join(tools, name), 0o755);
fs.mkdirSync(path.join(home, ".codex"));
fs.writeFileSync(path.join(home, ".codex", "auth.json"), "{}");
process.env.PROJECT_BRAIN_TOOL_DIRS = tools;
process.env.HOME = home;
process.env.USERPROFILE = home;
forgetAccountStates();

test("Auto in Debug: one model picks the team, the builder fixes with Undo, the other reviews", { skip: process.platform === "win32" && "fake tools are shell scripts" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-auto-"));
  initBrain(root, "Demo");
  fs.writeFileSync(path.join(root, "save.js"), "export const save = () => false;\n");
  setWriter(root, "auto");
  setMode(root, "debug");

  const progress: string[] = [];
  const result = await submitToBrain(root, "The save button does nothing", { onProgress: (label, line) => progress.push(`${label}: ${line}`) });

  assert.match(result.text, /^\*\*Team:\*\* ChatGPT fixes, Claude reviews\. ChatGPT is quick at small fixes\./);
  assert.match(result.text, /Fixed the save handler\./);
  assert.match(result.text, /Changed 1 file: `save\.js`\. Undo puts it back\./);
  assert.match(result.text, /### Claude's review\n\n\*\*No problems found\.\*\*/);
  assert.equal(fs.readFileSync(path.join(root, "save.js"), "utf8"), "export const save = () => true;\n");
  assert.deepEqual(result.actions.map((action) => action.kind), ["undo", "apply"]);
  assert.equal(lastUndoable(root)?.files[0].path, "save.js");
  assert.ok(progress.some((line) => line.startsWith("Team: Claude is choosing")));

  // The chooser and the reviewer only read; only the builder was allowed to write, and it got the Debug instructions.
  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["claude plan choose", "codex workspace-write debug", "claude plan review"]);
  const handoffs = loadBrain(root).handoffs;
  assert.deepEqual(handoffs.map((item) => `${item.model} ${item.kind}`), ["gpt change", "claude proposal"]);
});

test("Gemini: read-only in Plan, edits with Undo in Work, both through its stream-json", { skip: process.platform === "win32" && "fake tools are shell scripts" }, async () => {
  fs.writeFileSync(
    path.join(tools, "gemini"),
    `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, "utf8");
const mode = args[args.indexOf("--approval-mode") + 1];
fs.appendFileSync(${JSON.stringify(log)}, "gemini " + mode + (args.includes("--skip-trust") ? " skip-trust" : "") + " " + (prompt.includes("Mode: Plan") ? "plan" : prompt.includes("Mode: Work") ? "work" : "other") + "\\n");
const say = (event) => console.log(JSON.stringify({ timestamp: "t", ...event }));
say({ type: "init", session_id: "s", model: "gemini-2.5-pro" });
if (mode === "auto_edit") {
  say({ type: "tool_use", tool_name: "write_file", tool_id: "1", parameters: { file_path: path.join(process.cwd(), "notes.md") } });
  fs.writeFileSync(path.join(process.cwd(), "notes.md"), "# Notes\\n");
}
say({ type: "message", role: "assistant", content: mode === "plan" ? "1. Add a users table.\\n" : "Added ", delta: true });
say({ type: "message", role: "assistant", content: mode === "plan" ? "2. Add a login page." : "notes.md.", delta: true });
say({ type: "result", status: "success", stats: { total_tokens: 321 } });
`,
  );
  fs.chmodSync(path.join(tools, "gemini"), 0o755);
  fs.mkdirSync(path.join(home, ".project-brain"), { recursive: true });
  fs.writeFileSync(path.join(home, ".project-brain", "gemini-signed-in"), "now");
  fs.writeFileSync(log, "");
  forgetAccountStates();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-gemini-"));
  initBrain(root, "Demo");
  setWriter(root, "gemini");
  setMode(root, "plan");
  const plan = await submitToBrain(root, "Plan user accounts");
  assert.equal(plan.text, "1. Add a users table.\n2. Add a login page.\n\n*Plan by Gemini*");
  assert.deepEqual(plan.actions.map((action) => action.kind), ["apply"]);

  setMode(root, "work");
  const work = await submitToBrain(root, "Write a notes file");
  assert.match(work.text, /^Added notes\.md\.\n\nChanged 1 file: `notes\.md` \(new\)\. Undo puts it back\.$/);
  assert.equal(fs.readFileSync(path.join(root, "notes.md"), "utf8"), "# Notes\n");

  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["gemini plan skip-trust plan", "gemini auto_edit skip-trust work"]);
});

test("signing in to a model is optional: any two work, and nothing stops on one that is missing", { skip: process.platform === "win32" && "fake tools are shell scripts" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-two-"));
  initBrain(root, "Demo");
  fs.writeFileSync(path.join(root, "save.js"), "export const save = () => false;\n");

  // The chosen writer (Grok) is not signed in: the signed-in models pick the team instead of stopping.
  fs.writeFileSync(log, "");
  setWriter(root, "grok");
  setMode(root, "debug");
  const fallback = await submitToBrain(root, "The save button does nothing");
  assert.match(fallback.text, /^Grok is not signed in or is switched off, so the signed-in models picked the team\.\n\n\*\*Team:\*\* ChatGPT fixes, Claude reviews\./);
  assert.equal(fs.readFileSync(path.join(root, "save.js"), "utf8"), "export const save = () => true;\n");

  // Nobody may edit (None): one model still answers, as advice only, and nothing changes.
  fs.writeFileSync(log, "");
  setWriter(root, null);
  setMode(root, "work");
  const advice = await submitToBrain(root, "Make saving faster");
  assert.match(advice.text, /^\*\*Advice only\.\*\* Nobody is assigned to write code, so nothing was changed\./);
  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["claude plan other"]);

  // Only one model switched on: the app asks for any two and says which are switched off.
  const onlyClaude = { cursor: true, claude: true, gpt: false, grok: true, gemini: false };
  await assert.rejects(
    submitToBrain(root, "Make saving faster", { enabled: onlyClaude }),
    /Sign in to at least 2 models to use Dexter\. Any 2 work: .*\. Ready now: Claude\. ChatGPT, Gemini are signed in but switched off in Integrations\./,
  );

  // Modes that ask every model still refuse a tiny request.
  for (const mode of ["review", "brainstorm", "debate"] as const) {
    setMode(root, mode);
    await assert.rejects(submitToBrain(root, "hi"), /Write a full/);
  }
});

test("Auto mode + Auto writer: one answer picks Debug and the team, then the builder fixes and the other reviews", { skip: process.platform === "win32" && "fake tools are shell scripts" }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-route-"));
  initBrain(root, "Demo");
  fs.writeFileSync(path.join(root, "save.js"), "export const save = () => false;\n");
  setWriter(root, "auto");
  assert.equal(loadBrain(root).manifest.mode, "auto", "a new folder starts in Auto mode");
  fs.writeFileSync(log, "");

  const result = await submitToBrain(root, "The save button does nothing");
  assert.match(result.text, /^\*\*Auto picked Debug\.\*\* It describes a button that does not work\.\n\n\*\*Team:\*\* ChatGPT fixes, Claude reviews\./);
  assert.equal(fs.readFileSync(path.join(root, "save.js"), "utf8"), "export const save = () => true;\n");
  // One routing answer, no separate team question: route, build with the Debug instructions, review.
  assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), ["claude plan route", "codex workspace-write debug", "claude plan review"]);
});
