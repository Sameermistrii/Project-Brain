import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RULE = `---
description: Shared project brain. The user chooses who writes code.
alwaysApply: true
---

This project keeps a shared brain in \`.brain/\`. Cursor, Claude, ChatGPT, Grok, and Gemini read it so they share one goal, one set of decisions, and one handoff log.

Before planning or editing, call the project-brain MCP tool \`brain_brief\`. If MCP is unavailable, read \`.brain/local.json\`, \`.brain/manifest.json\`, \`.brain/goal.md\`, \`.brain/summary.md\`, \`.brain/now.md\`, and the latest lines of \`.brain/decisions.jsonl\` and \`.brain/handoffs.jsonl\`.

The user decides who writes code. The choice is \`codeWriter\` in \`.brain/local.json\` (older projects keep it in \`.brain/manifest.json\`). \`brain_status\` reports it.

- If \`codeWriter\` is \`cursor\`, you may edit project files. When you finish, call \`brain_add_handoff\`.
- If \`codeWriter\` is anyone else, or is empty, do not create, edit, or delete project files. Give a proposal and call \`brain_add_handoff\` with kind \`proposal\`.
- Do not change \`codeWriter\` unless the user asks.

Record a lasting choice with \`brain_add_decision\`.
`;

export function installCursorIntegration(root: string): string[] {
  const notes: string[] = [];
  const rulePath = path.join(root, ".cursor", "rules", "project-brain.mdc");
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  if (!fs.existsSync(rulePath)) {
    fs.writeFileSync(rulePath, RULE);
    notes.push(`Wrote ${rulePath}`);
  } else {
    notes.push(`Kept existing ${rulePath}`);
  }

  const mcpPath = path.join(root, ".cursor", "mcp.json");
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "mcp.js");
  const entry = {
    command: process.execPath,
    args: [serverPath],
  };
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (fs.existsSync(mcpPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpPath, "utf8")) as { mcpServers?: Record<string, unknown> };
    } catch {
      notes.push(`Could not parse ${mcpPath}. Left it unchanged.`);
      return notes;
    }
  }
  config.mcpServers ??= {};
  if (!config.mcpServers["project-brain"]) {
    config.mcpServers["project-brain"] = entry;
    fs.writeFileSync(mcpPath, `${JSON.stringify(config, null, 2)}\n`);
    notes.push(`Wrote ${mcpPath}`);
  } else {
    notes.push(`Kept existing project-brain entry in ${mcpPath}`);
  }
  return notes;
}

export function ensureGitignore(root: string): void {
  const file = path.join(root, ".gitignore");
  const line = ".brain/.env";
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current.split(/\r?\n/).some((item) => item.trim() === line)) return;
  const prefix = current.length && !current.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(file, `${prefix}${line}\n`);
}
