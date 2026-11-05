import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { forgetAccountStates } from "./accounts.js";
import { initBrain, loadBrain, setMode, setWriter } from "./brain.js";
import { isMode, modePrompt, MODES } from "./modes.js";
import { compileBrief } from "./brief.js";
import { isWriter, writerLabel } from "./policy.js";
import { applyProposal, guessMode, parseRoute, parseTeam, submitToBrain } from "./session.js";

// Hide every real model tool, so no test ever sends a real (paid) request.
const empty = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-notools-"));
for (const name of ["APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME", "PATH", "Path", "PROJECT_BRAIN_TOOL_DIRS"]) process.env[name] = empty;
forgetAccountStates();

function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-modes-"));
  initBrain(root, "Demo");
  return root;
}

test("every mode is saved and loaded back", () => {
  const root = tempProject();
  for (const mode of MODES) {
    setMode(root, mode.id);
    assert.equal(loadBrain(root).manifest.mode, mode.id);
  }
  assert.equal(isMode("nonsense"), false);
});

test("only Work, Debug, and Test may change files; the rest are told not to", () => {
  for (const mode of MODES) {
    // Auto never prompts a model with its own instructions; it routes to one of the other modes.
    if (mode.runner === "auto") continue;
    const prompt = modePrompt("BRIEF", mode.id, "the task");
    const readOnly = /Do not create, edit, or delete files/.test(prompt);
    assert.equal(readOnly, mode.runner !== "writer", `${mode.id} read-only rule`);
    assert.match(prompt, new RegExp(`Mode: ${mode.label}\\.`));
    assert.match(prompt, /The user's message:\nthe task$/);
    assert.ok(mode.summary && mode.example, `${mode.id} explains itself to the person`);
  }
  assert.match(modePrompt("B", "debug", "x"), /\*\*Cause\*\*, \*\*Fix\*\*, \*\*How to check it\*\*/);
  assert.match(modePrompt("B", "review", "x", ["The latest change was a.ts"]), /The latest change was a\.ts/);
});

test("every mode needs any two signed-in models, and says so instead of failing on one", async () => {
  const root = tempProject();
  for (const mode of MODES) {
    setMode(root, mode.id);
    await assert.rejects(submitToBrain(root, "Why does the save button fail?"), /Sign in to at least 2 models to use Dexter\. Any 2 work: Cursor, Claude, ChatGPT, Grok, or Gemini\.$/);
  }
});

test("Auto mode: the router's answer picks the mode and the team; a bad answer falls back to the wording", () => {
  const all = ["claude", "gpt", "grok", "gemini", "cursor"] as const;
  assert.deepEqual(parseRoute('{"mode":"debug","builder":"gpt","reviewer":"claude","why":"It describes a crash."}', [...all], "x"), {
    mode: "debug",
    why: "It describes a crash.",
    team: { builder: "gpt", reviewer: "claude", why: "" },
  });
  assert.deepEqual(parseRoute('Sure: {"mode":"Explain","builder":null,"reviewer":null,"why":"A question."}', [...all], "x"), { mode: "explain", why: "A question.", team: null });
  // "auto" or an unknown mode, or no JSON at all, falls back to the wording of the message.
  assert.equal(parseRoute('{"mode":"auto"}', [...all], "The save button crashes").mode, "debug");
  assert.equal(parseRoute("not json", [...all], "How does sign-in work?").mode, "explain");
  assert.equal(parseRoute("", [...all], "Add a dark mode toggle").why, "Picked from the wording of the message.");

  assert.equal(guessMode("Login fails with a 500 error"), "debug");
  assert.equal(guessMode("Write unit tests for the parser"), "test");
  assert.equal(guessMode("Review my last change"), "review");
  assert.equal(guessMode("Plan how to add payments"), "plan");
  assert.equal(guessMode("Give me ideas for the landing page"), "brainstorm");
  assert.equal(guessMode("What does brain.ts do?"), "explain");
  assert.equal(guessMode("Add a dark mode toggle"), "work");
  assert.notEqual(guessMode("Postgres or MongoDB, which should we use?"), "debate", "Debate is never guessed");
});

test("Auto: the chooser's reply is read safely, with a fallback", () => {
  const all = ["claude", "gpt", "grok", "cursor"] as const;
  assert.deepEqual(parseTeam('{"builder":"gpt","reviewer":"claude","why":"Codex is quick at small fixes."}', [...all]), {
    builder: "gpt",
    reviewer: "claude",
    why: "Codex is quick at small fixes.",
  });
  // Extra words around the JSON, and a label instead of an id, still work.
  assert.equal(parseTeam('Sure!\n```json\n{"builder":"ChatGPT","reviewer":null,"why":"x"}\n```', [...all]).builder, "gpt");
  assert.equal(parseTeam('{"builder":"gpt","reviewer":null}', [...all]).reviewer, null);
  // The same model cannot review its own work.
  assert.equal(parseTeam('{"builder":"grok","reviewer":"grok"}', [...all]).reviewer, null);
  // A model that is not signed in, or a reply that is not JSON, falls back to the default order.
  assert.deepEqual(parseTeam('{"builder":"gemini"}', ["gpt", "grok"]), { builder: "gpt", reviewer: "grok", why: "Picked by the default order." });
  assert.equal(parseTeam("I think Claude should do it.", ["claude", "cursor"]).builder, "claude");
  assert.equal(parseTeam("", ["grok"]).reviewer, null);
});

test("Auto is a writer choice, and models are told only the assigned one may edit", async () => {
  assert.equal(isWriter("auto"), true);
  assert.equal(writerLabel("auto"), "Auto");
  const root = tempProject();
  setWriter(root, "auto");
  assert.match(compileBrief(loadBrain(root), "claude"), /the app picks a model for each task/);
  setMode(root, "debug");
  // No tools here: reaching the sign-in check proves Debug with Auto goes to the team, not to a fixed writer.
  await assert.rejects(submitToBrain(root, "The save button does nothing"), /Sign in to at least 2 models/);
});

test("Apply builds from a plan, and the decision names it as a plan", async () => {
  const root = tempProject();
  fs.writeFileSync(
    path.join(root, ".brain", "debate.json"),
    JSON.stringify({ id: "p1", at: "", mode: "plan", question: "Plan user accounts", answers: [{ provider: "gpt", label: "ChatGPT", text: "1. Add a users table." }] }),
  );
  setWriter(root, "me");
  const result = await applyProposal(root, "p1", "gpt");
  assert.match(result.text, /ChatGPT's plan to apply/);
  assert.match(loadBrain(root).decisions.at(-1)?.decision ?? "", /go with ChatGPT's plan/);
});
