import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { claudeStream } from "./accounts.js";
import { addDecision, addHandoff, deleteMemory, initBrain, loadBrain, searchBrain, setMode, setSummary, setWriter, updateDecision } from "./brain.js";
import { compileBrief } from "./brief.js";
import { appendChat, listChat } from "./chat.js";
import { beginCheckpoint, DirtyError, finishCheckpoint, lastUndoable } from "./checkpoints.js";
import { applyProposal, undoChange } from "./session.js";
import { syncMemory, teamStatus } from "./team.js";
import { isLimitError, recordUsage, usageSummary } from "./usage.js";

function tempProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-features-"));
  initBrain(root, "Demo");
  return root;
}

function write(root: string, file: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
}

function read(root: string, file: string): string {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("undo puts edited, new, and deleted files back", async () => {
  const root = tempProject();
  write(root, "a.txt", "original\r\n");
  write(root, "gone.txt", "will be deleted");
  write(root, "node_modules/pkg/index.js", "ignored");
  const open = await beginCheckpoint(root, "Change things");
  assert.ok(open, "Git is needed for this test");
  write(root, "a.txt", "changed by the writer");
  write(root, "src/new.ts", "export {}");
  fs.rmSync(path.join(root, "gone.txt"));
  const change = await finishCheckpoint(root, open);
  assert.deepEqual(change.files.map((file) => `${file.status} ${file.path}`).sort(), ["A src/new.ts", "D gone.txt", "M a.txt"]);
  assert.equal(lastUndoable(root)?.id, change.id);

  const result = await undoChange(root, change.id);
  assert.match(result.text, /3 files are back/);
  assert.equal(read(root, "a.txt"), "original\r\n", "line endings are kept byte for byte");
  assert.equal(read(root, "gone.txt"), "will be deleted");
  assert.equal(fs.existsSync(path.join(root, "src/new.ts")), false);
  assert.equal(read(root, "node_modules/pkg/index.js"), "ignored");
  assert.equal(lastUndoable(root), null);
  assert.match(loadBrain(root).handoffs.at(-1)?.did ?? "", /Undid this task/);
});

test("undo refuses to wipe changes made after the task unless forced", async () => {
  const root = tempProject();
  write(root, "a.txt", "one");
  const open = await beginCheckpoint(root, "Edit a");
  write(root, "a.txt", "two");
  const change = await finishCheckpoint(root, open!);
  write(root, "a.txt", "three, typed by the person afterwards");
  await assert.rejects(undoChange(root, change.id), DirtyError);
  assert.equal(read(root, "a.txt"), "three, typed by the person afterwards");
  await undoChange(root, change.id, true);
  assert.equal(read(root, "a.txt"), "one");
});

test("only the newest change can be undone", async () => {
  const root = tempProject();
  const task = async (name: string, file: string, text: string) => {
    const open = await beginCheckpoint(root, name);
    write(root, file, text);
    return finishCheckpoint(root, open!);
  };
  const first = await task("first", "a.txt", "1");
  const second = await task("second", "b.txt", "2");
  await assert.rejects(undoChange(root, first.id), /Only the latest change/);
  await undoChange(root, second.id);
  assert.equal(fs.existsSync(path.join(root, "b.txt")), false);
  assert.equal(read(root, "a.txt"), "1");
});

test("the writer and mode are personal; shared files stay stable for Git", () => {
  const root = tempProject();
  // An older brain kept the writer in manifest.json; it still loads.
  const manifestPath = path.join(root, ".brain", "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, name: "Demo", created: "2026-01-01T00:00:00.000Z", codeWriter: "cursor", mode: "debate" }));
  assert.equal(loadBrain(root).manifest.codeWriter, "cursor");
  assert.equal(loadBrain(root).manifest.mode, "debate");
  setWriter(root, "claude");
  setMode(root, "work");
  const manifest = JSON.parse(read(root, ".brain/manifest.json"));
  assert.equal("codeWriter" in manifest || "mode" in manifest || "updated" in manifest, false);
  assert.equal(loadBrain(root).manifest.codeWriter, "claude");
  assert.match(read(root, ".brain/.gitignore"), /^local\.json$/m);
  assert.match(read(root, ".brain/.gitignore"), /^chats\/$/m);
  assert.match(read(root, ".brain/.gitattributes"), /\*\.jsonl merge=union/);
});

test("memory can be edited, deleted, summarized, and searched by words", () => {
  const root = tempProject();
  const decision = addDecision(root, { model: "user", decision: "Use cookies for the login session." });
  const handoff = addHandoff(root, { model: "claude", kind: "note", did: "This was a mistake." });
  updateDecision(root, decision.id, "Use a server session for the login.");
  deleteMemory(root, "handoffs", handoff.id);
  setSummary(root, "Earlier: the team built the notch.");
  const snap = loadBrain(root);
  assert.equal(snap.decisions[0].decision, "Use a server session for the login.");
  assert.equal(snap.handoffs.length, 0);
  assert.match(compileBrief(snap), /Summary of earlier work:\nEarlier: the team built the notch\./);
  assert.equal(searchBrain(snap, "login server").length, 1);
  assert.equal(searchBrain(snap, "login cookies").length, 0);
  assert.throws(() => deleteMemory(root, "decisions", "missing"), /not in this folder's memory/);
});

test("chat replies keep their Undo and Apply buttons", () => {
  const root = tempProject();
  appendChat(root, { role: "brain", text: "Done.", actions: [{ kind: "undo", checkpoint: "abc" }] });
  assert.deepEqual(listChat(root)[0].actions, [{ kind: "undo", checkpoint: "abc" }]);
});

test("apply needs a code writer and the latest debate", async () => {
  const root = tempProject();
  fs.writeFileSync(
    path.join(root, ".brain", "debate.json"),
    JSON.stringify({ id: "d1", at: "", question: "Which cache?", answers: [{ provider: "claude", label: "Claude", text: "Use Redis." }] }),
  );
  await assert.rejects(applyProposal(root, "old", "claude"), /older than the latest/);
  await assert.rejects(applyProposal(root, "d1", "claude"), /Choose who writes the code first/);
  setWriter(root, "me");
  const result = await applyProposal(root, "d1", "claude");
  assert.match(result.text, /Use Redis/);
  assert.match(loadBrain(root).decisions.at(-1)?.decision ?? "", /go with Claude's proposal/);
});

test("Claude's live steps and final answer are read from its stream", () => {
  const steps: string[] = [];
  const stream = claudeStream((line) => steps.push(line));
  const lines = [
    { type: "system", subtype: "init" },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x/src/app.ts" } }] } },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "C:\\x\\README.md" } }] } },
    { type: "assistant", message: { content: [{ type: "text", text: "I updated the readme.\nMore detail." }] } },
    { type: "result", subtype: "success", is_error: false, result: "Updated the README.", total_cost_usd: 0.012, usage: { input_tokens: 1200, output_tokens: 300 } },
  ].map((item) => JSON.stringify(item));
  const all = lines.join("\n") + "\n";
  stream.feed(all.slice(0, 50));
  stream.feed(all.slice(50));
  stream.flush();
  assert.deepEqual(steps.slice(0, 1), ["Reading app.ts"]);
  assert.match(steps[1], /^Editing (README\.md|C:\\x\\README\.md)$/);
  assert.equal(steps[2], "I updated the readme.");
  assert.deepEqual(stream.result(), { text: "Updated the README.", isError: false, tokens: 1500, costUsd: 0.012 });
});

test("usage counts asks and notices limits", () => {
  const root = tempProject();
  const now = new Date();
  recordUsage(root, { provider: "claude", ok: true, tokens: 1000, costUsd: 0.01 }, now);
  recordUsage(root, { provider: "claude", ok: false, error: "Claude AI usage limit reached|1793900000" }, now);
  recordUsage(root, { provider: "gpt", ok: false, error: "spawn codex ENOENT" }, now);
  const byModel = Object.fromEntries(usageSummary(root, now).map((item) => [item.provider, item]));
  assert.equal(byModel.claude.asksToday, 2);
  assert.equal(byModel.claude.tokensWeek, 1000);
  assert.equal(byModel.claude.failedWeek, 1);
  assert.ok(byModel.claude.lastLimitAt);
  assert.equal(byModel.gpt.lastLimitAt, null);
  assert.equal(isLimitError("Your credit balance is too low? No: 429 Too Many Requests"), true);
});

test("team sync shares memory files through Git and leaves code alone", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-team-"));
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", "-c", "init.defaultBranch=main", ...args], { cwd, encoding: "utf8" });
  const remote = path.join(base, "remote.git");
  git(base, "init", "--bare", "--quiet", remote);
  const me = path.join(base, "me");
  git(base, "clone", "--quiet", remote, me);
  for (const [k, v] of [["user.name", "Me"], ["user.email", "me@x"]]) git(me, "config", k, v);
  initBrain(me, "Team");
  write(me, "code.ts", "not memory");
  addDecision(me, { model: "user", decision: "Ship on Friday." });
  setWriter(me, "claude");
  assert.equal((await teamStatus(me)).inGit, true);
  assert.match(await syncMemory(me), /Shared your memory/);

  const mate = path.join(base, "mate");
  git(base, "clone", "--quiet", remote, mate);
  assert.match(read(mate, ".brain/decisions.jsonl"), /Ship on Friday/);
  assert.equal(fs.existsSync(path.join(mate, "code.ts")), false, "code is never committed by sync");
  assert.equal(fs.existsSync(path.join(mate, ".brain/local.json")), false, "the writer stays personal");
  assert.equal(loadBrain(mate).manifest.codeWriter, null);

  for (const [k, v] of [["user.name", "Mate"], ["user.email", "mate@x"]]) git(mate, "config", k, v);
  addDecision(mate, { model: "user", decision: "Use Postgres." });
  addDecision(me, { model: "user", decision: "Keep the notch." });
  assert.match(await syncMemory(mate), /Shared/);
  assert.match(await syncMemory(me), /Shared/);
  const merged = loadBrain(me).decisions.map((item) => item.decision);
  assert.deepEqual(merged.sort(), ["Keep the notch.", "Ship on Friday.", "Use Postgres."], "both teammates' decisions survive the merge");
  assert.match(await syncMemory(fs.mkdtempSync(path.join(os.tmpdir(), "nogit-"))), /not a Git repository/);
});
