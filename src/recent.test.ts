import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendChat, createThread } from "./chat.js";
import { recentChats, rememberFolder } from "./recent.js";

test("recent folders: newest first, no duplicates, bad entries dropped", () => {
  let list = rememberFolder(undefined, "/a");
  list = rememberFolder(list, "/b");
  list = rememberFolder(list, "/a");
  assert.deepEqual(list, [path.resolve("/a"), path.resolve("/b")]);
  assert.deepEqual(rememberFolder(["/x", 42, null], "/y"), [path.resolve("/y"), "/x"]);
});

test("Home lists chats from every recent folder, newest first, skipping empty and missing ones", async () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-recent-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-recent-"));
  const noChats = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-recent-"));
  appendChat(first, { role: "user", text: "Fix the LinkedIn login" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  appendChat(second, { role: "user", text: "Best AI video tool?" });
  createThread(second); // an empty "New chat" is not listed
  const chats = recentChats([first, second, noChats, path.join(first, "gone")]);
  assert.deepEqual(chats.map((chat) => chat.title), ["Best AI video tool?", "Fix the LinkedIn login"]);
  assert.equal(chats[0].name, path.basename(second));
  assert.equal(fs.existsSync(path.join(noChats, ".brain")), false, "reading Home never creates files in other folders");
});
