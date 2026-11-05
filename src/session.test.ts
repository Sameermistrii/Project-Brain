import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAsk } from "./ask.js";
import { initBrain, loadBrain, setMode, setModelEnabled, setWriter } from "./brain.js";
import { debatePrompt, submitToBrain } from "./session.js";

test("the notch starts in work mode and can switch to debate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-mode-"));
  initBrain(root, "Demo");
  assert.equal(loadBrain(root).manifest.mode, "work");
  setMode(root, "debate");
  assert.equal(loadBrain(root).manifest.mode, "debate");
});

test("a switched-off writer is not asked to work", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-mode-"));
  initBrain(root, "Demo");
  setWriter(root, "cursor");
  setModelEnabled(root, "cursor", false);
  const answer = await submitToBrain(root, "Change the readme.");
  assert.match(answer.text, /Cursor is switched off in Integrations/);
});

test("a one-word debate is refused before any model is asked", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-mode-"));
  initBrain(root, "Demo");
  setMode(root, "debate");
  await assert.rejects(submitToBrain(root, "hi"), /Write a full question for the debate/);
  assert.equal(loadBrain(root).now, "");
});

test("a model that cannot answer leaves nothing in the shared memory", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-mode-"));
  initBrain(root, "Demo");
  // Hide every installed tool (even on a PC where Claude is set up), so the ask fails the way a broken sign-in does.
  for (const name of ["APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "PATH", "Path", "PROJECT_BRAIN_TOOL_DIRS"]) process.env[name] = root;
  await assert.rejects(runAsk(root, "claude", "Summarise the project."));
  assert.equal(loadBrain(root).handoffs.length, 0);
});

test("debate tells every model not to edit files", () => {
  const prompt = debatePrompt("Who writes code: Cursor.", "Should the cache live in the browser?", [
    { label: "Claude", text: "No." },
  ]);
  assert.match(prompt, /You can read files in this project/);
  assert.match(prompt, /Do not create, edit, or delete files/);
  assert.match(prompt, /Claude: No/);
  assert.match(prompt, /Should the cache live in the browser/);
});
