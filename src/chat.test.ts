import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initBrain } from "./brain.js";
import { appendChat, createThread, listChat, listThreads, openThread } from "./chat.js";

test("chat keeps the user and the reply in order", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-chat-"));
  initBrain(root, "Demo");
  assert.deepEqual(listChat(root), []);
  appendChat(root, { role: "user", text: "Where did we leave the login?" });
  appendChat(root, { role: "brain", text: "ChatGPT is signed in." });
  const items = listChat(root);
  assert.equal(items.length, 2);
  assert.equal(items[0].role, "user");
  assert.equal(items[0].text, "Where did we leave the login?");
  assert.equal(items[1].role, "brain");
  assert.equal(items[1].text, "ChatGPT is signed in.");
  assert.ok(items[0].id);
  assert.ok(items[1].at);
});

test("each folder keeps its own chats", () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-chat-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-chat-"));
  appendChat(first, { role: "user", text: "Only the first folder knows this." });
  appendChat(second, { role: "user", text: "Only the second folder knows this." });
  assert.equal(listChat(first)[0].text, "Only the first folder knows this.");
  assert.equal(listChat(second)[0].text, "Only the second folder knows this.");
  const older = createThread(first);
  appendChat(first, { role: "user", text: "A newer chat." });
  assert.equal(listChat(first)[0].text, "A newer chat.");
  openThread(first, listThreads(first).find((item) => item.id !== older.id)?.id || "");
  assert.equal(listChat(first)[0].text, "Only the first folder knows this.");
});

test("an older single chat file becomes this folder's first conversation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-chat-"));
  const brain = path.join(root, ".brain");
  fs.mkdirSync(brain);
  fs.writeFileSync(
    path.join(brain, "chat.jsonl"),
    `${JSON.stringify({ id: "old", at: "2026-11-04T00:00:00.000Z", role: "user", text: "The previous folder's question." })}\n`,
  );
  const items = listChat(root);
  assert.equal(items.length, 1);
  assert.equal(items[0].text, "The previous folder's question.");
  assert.equal(listThreads(root)[0].title, "The previous folder's question.");
});
