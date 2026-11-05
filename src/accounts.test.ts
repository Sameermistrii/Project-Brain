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
    assert.equal(installNeeded("gemini")?.site, "npmjs.com");
  } finally {
    process.env.HOME = saved;
  }
});

test("only the four known models can start a sign-in", () => {
  assert.equal(isProvider("gpt"), true);
  assert.equal(isProvider("gemini"), true);
  assert.equal(isProvider("me"), false);
  assert.equal(isProvider("../../x"), false);
});

test("Gemini's stream-json: text pieces join, tool steps show, totals and errors are read", async () => {
  const { geminiStream } = await import("./accounts.js");
  const steps: string[] = [];
  const stream = geminiStream((line) => steps.push(line));
  // The event shapes Gemini CLI 0.67 emits (packages/core/src/output/types.ts).
  const events = [
    { type: "init", timestamp: "t", session_id: "s", model: "gemini-2.5-pro" },
    { type: "message", timestamp: "t", role: "user", content: "the prompt" },
    { type: "tool_use", timestamp: "t", tool_name: "read_file", tool_id: "1", parameters: { file_path: "/x/src/save.js" } },
    { type: "tool_result", timestamp: "t", tool_id: "1", status: "success", output: "..." },
    { type: "message", timestamp: "t", role: "assistant", content: "The bug is in **save", delta: true },
    { type: "message", timestamp: "t", role: "assistant", content: ".js**.\nIt returns false.", delta: true },
    { type: "result", timestamp: "t", status: "success", stats: { total_tokens: 900, input_tokens: 800, output_tokens: 100 } },
  ];
  stream.feed(events.map((item) => JSON.stringify(item)).join("\n"));
  stream.flush();
  assert.deepEqual(steps, ["Reading save.js", "The bug is in **save", "It returns false."]);
  assert.deepEqual(stream.result(), { text: "The bug is in **save.js**.\nIt returns false.", isError: false, error: "", tokens: 900 });

  const failed = geminiStream(() => {});
  failed.feed(JSON.stringify({ type: "result", status: "error", error: { type: "auth", message: "Authentication cancelled by user." } }) + "\n");
  assert.equal(failed.result().isError, true);
  assert.equal(failed.result().error, "Authentication cancelled by user.");
});

test("Gemini sign-in picks Google login only when nothing is chosen, and keeps other settings", async () => {
  const { chooseGeminiGoogleLogin } = await import("./accounts.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "project-brain-gemini-"));
  const file = path.join(dir, ".gemini", "settings.json");
  assert.equal(chooseGeminiGoogleLogin(file), true);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).security.auth.selectedType, "oauth-personal");

  fs.writeFileSync(file, JSON.stringify({ theme: "Dracula", security: { folderTrust: { enabled: true } } }));
  chooseGeminiGoogleLogin(file);
  const kept = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(kept.theme, "Dracula");
  assert.equal(kept.security.folderTrust.enabled, true);
  assert.equal(kept.security.auth.selectedType, "oauth-personal");

  fs.writeFileSync(file, JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }));
  chooseGeminiGoogleLogin(file);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).security.auth.selectedType, "gemini-api-key", "an existing choice is never changed");

  fs.writeFileSync(file, "{ not json");
  assert.equal(chooseGeminiGoogleLogin(file), false);
  assert.equal(fs.readFileSync(file, "utf8"), "{ not json", "a file it cannot read is left alone");
});
