import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installNeeded, isLoginUrl, isProvider, quoteCmd } from "./accounts.js";

test("only real login pages are opened in Chrome", () => {
  assert.equal(isLoginUrl("https://claude.ai/oauth/authorize?code=1"), true);
  assert.equal(isLoginUrl("https://auth.openai.com/log-in"), true);
  assert.equal(isLoginUrl("https://accounts.x.ai/sign-in"), true);
  assert.equal(isLoginUrl("https://evil.example/claude.ai"), false);
  assert.equal(isLoginUrl("https://claude.ai.evil.example/"), false);
  assert.equal(isLoginUrl("https://chatgpt.com/codex/install.ps1"), false);
  assert.equal(isLoginUrl("https://downloads.cursor.com/agent.zip"), false);
  assert.equal(isLoginUrl("https://github.com/login"), false);
  assert.equal(isLoginUrl("not a url"), false);
});

test("arguments for .cmd tools are quoted, and % is refused", () => {
  assert.equal(quoteCmd("plain"), "plain");
  assert.equal(quoteCmd(""), '""');
  assert.equal(quoteCmd("D:\\My Project"), '"D:\\My Project"');
  assert.equal(quoteCmd('say "hi" & exit'), '"say ""hi"" & exit"');
  assert.throws(() => quoteCmd("D:\\100%done"), /contains %/);
});

test("sign-in says what it would install, so the app can ask first", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-accounts-"));
  process.env.LOCALAPPDATA = empty;
  process.env.PROJECT_BRAIN_TOOL_DIRS = empty;
  const saved = process.env.HOME;
  process.env.HOME = empty;
  process.env.USERPROFILE = empty;
  try {
    assert.equal(installNeeded("claude"), null);
    assert.equal(installNeeded("gpt")?.site, "chatgpt.com");
    assert.equal(installNeeded("grok")?.site, "x.ai");
    assert.equal(installNeeded("cursor")?.site, "cursor.com");
  } finally {
    process.env.HOME = saved;
  }
});

test("only the four known models can start a sign-in", () => {
  assert.equal(isProvider("gpt"), true);
  assert.equal(isProvider("me"), false);
  assert.equal(isProvider("../../x"), false);
});
