import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { accessFolder, addDecision, addHandoff, enabledModels, initBrain, loadBrain, searchBrain, setAccessFolder, setGoal, setModelEnabled, setNow, setWriter } from "./brain.js";
import { compileBrief, compilePack } from "./brief.js";
import { parseHandoffBlock, visibleAnswer } from "./handoff.js";
import { handoffKindFor, writerPolicy } from "./policy.js";

function tempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-"));
}

test("a new brain has no code writer and tells every model not to edit", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  const snap = loadBrain(root);
  assert.equal(snap.manifest.codeWriter, null);
  const brief = compileBrief(snap, "cursor");
  assert.match(brief, /Who writes code: not chosen/);
  assert.match(brief, /Do not create, edit, or delete project files/);
  assert.match(writerPolicy(null, "claude"), /The user decides who writes code/);
});

test("the user can assign Cursor, and only Cursor is told to edit", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  setWriter(root, "cursor");
  setGoal(root, "Ship a shared project brain.");
  setNow(root, "Add the writer switch.");
  const snap = loadBrain(root);
  const cursor = compileBrief(snap, "cursor");
  const claude = compileBrief(snap, "claude");
  assert.match(cursor, /The user chose you to write code/);
  assert.match(claude, /Cursor is the only one who should edit/);
  assert.doesNotMatch(claude, /The user chose you to write code/);
  assert.equal(handoffKindFor(snap.manifest.codeWriter, "cursor"), "change");
  assert.equal(handoffKindFor(snap.manifest.codeWriter, "claude"), "proposal");
});

test("choosing yourself keeps every model in proposal mode", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  setWriter(root, "me");
  const brief = compileBrief(loadBrain(root), "grok");
  assert.match(brief, /Who writes code: the user/);
  assert.match(brief, /Do not create, edit, or delete project files/);
  assert.equal(handoffKindFor("me", "grok"), "proposal");
});

test("decisions and handoffs show up in the brief, pack, and search", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  setWriter(root, "gpt");
  addDecision(root, { model: "user", decision: "Auth stays on the server.", why: "The page should not hold tokens." });
  addHandoff(root, {
    model: "claude",
    kind: "proposal",
    task: "Sketch the login flow",
    did: "Proposed a server session cookie.",
    files: ["src/auth.ts"],
    next: "ChatGPT can implement it.",
  });
  const snap = loadBrain(root);
  const brief = compileBrief(snap, "gpt");
  assert.match(brief, /Auth stays on the server/);
  assert.match(brief, /server session cookie/);
  assert.match(brief, /The user chose you to write code/);
  assert.match(compilePack(snap), /PROJECT CONTEXT/);
  const hits = searchBrain(snap, "session cookie");
  assert.equal(hits.length, 1);
});

test("a model can be switched off without dropping its sign-in settings", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  assert.equal(enabledModels(root).gpt, true);
  setModelEnabled(root, "gpt", false);
  const snap = loadBrain(root);
  assert.equal(enabledModels(root).gpt, false);
  assert.equal(enabledModels(root).claude, true);
  assert.equal(snap.manifest.name, "Demo");
});

test("the chosen folder is the one models can access", () => {
  const root = tempProject();
  initBrain(root, "Demo");
  assert.equal(accessFolder(root), path.resolve(root));
  const extra = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-folder-"));
  assert.equal(setAccessFolder(root, extra), path.resolve(extra));
  assert.equal(accessFolder(root), path.resolve(extra));
  assert.throws(() => setAccessFolder(root, path.join(extra, "missing")), /Choose a folder that exists/);
});

test("handoff fences are stripped from the visible answer", () => {
  const text = [
    "Use a server session.",
    "```handoff",
    "did: Proposed a server session.",
    "files: src/auth.ts",
    "next: none",
    "decisions: Keep tokens off the page.",
    "```",
  ].join("\n");
  const parsed = parseHandoffBlock(text);
  assert.equal(parsed?.did, "Proposed a server session.");
  assert.deepEqual(parsed?.files, ["src/auth.ts"]);
  assert.equal(parsed?.next, "");
  assert.equal(parsed?.decision, "Keep tokens off the page.");
  assert.equal(visibleAnswer(text), "Use a server session.");
});
