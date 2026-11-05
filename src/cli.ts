#!/usr/bin/env node
import path from "node:path";
import { runAsk, type AskModel } from "./ask.js";
import {
  addDecision,
  addHandoff,
  findProjectRoot,
  initBrain,
  loadBrain,
  searchBrain,
  setGoal,
  setNow,
  setWriter,
} from "./brain.js";
import { compileBrief, compilePack } from "./brief.js";
import { ensureGitignore, installCursorIntegration } from "./cursor.js";
import { handoffKindFor, isWriter, writerLabel, type Audience } from "./policy.js";
import { startBoard } from "./serve.js";

const help = `Dexter — shared memory for Cursor, Claude, ChatGPT, Grok, and Gemini

You choose who writes code. Until you do, every model is told not to edit files.

  init [--name "Project"]     Create .brain in this folder and connect Cursor
  status                      Show the writer, goal, and latest handoff
  writer <cursor|claude|gpt|grok|gemini|me|auto|none>
  goal --text "..."
  now --text "..."
  decision --text "..." [--why "..."] [--model user]
  handoff --model cursor --did "..." [--task "..."] [--files "a.ts,b.ts"] [--next "..."]
  brief [--for cursor|claude|gpt|grok|me|any]
  pack                        Print the paste pack
  search "query"
  ask --model claude|gpt|grok --text "..."
  serve [--port 4317]
`;

async function main(): Promise<void> {
  const { command, flags, rest } = parse(process.argv.slice(2));
  if (!command || command === "help" || flags.has("help")) {
    console.log(help);
    return;
  }

  if (command === "init") {
    const root = process.cwd();
    const { created } = initBrain(root, flag(flags, "name") || path.basename(root));
    ensureGitignore(root);
    const notes = installCursorIntegration(root);
    console.log(created ? `Created a project brain in ${root}` : `Project brain already exists in ${root}`);
    for (const note of notes) console.log(note);
    console.log("Choose who writes code: node dist/cli.js writer cursor");
    return;
  }

  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error("No project brain here. From the project folder, run: node dist/cli.js init");
    process.exitCode = 1;
    return;
  }

  switch (command) {
    case "status": {
      const snap = loadBrain(root);
      console.log(`${snap.manifest.name}`);
      console.log(`Who writes code: ${writerLabel(snap.manifest.codeWriter)}`);
      console.log("");
      console.log(compileBrief(snap, "any"));
      return;
    }
    case "writer": {
      const value = rest[0] || flag(flags, "set") || "";
      if (value === "none" || value === "clear") {
        setWriter(root, null);
        console.log("Who writes code: not chosen. Models are told not to edit files.");
        return;
      }
      if (!isWriter(value)) {
        throw new Error("Use cursor, claude, gpt, grok, gemini, me, auto, or none.");
      }
      setWriter(root, value);
      console.log(`Who writes code: ${writerLabel(value)}`);
      return;
    }
    case "goal":
      setGoal(root, required(flags, "text"));
      console.log("Saved the goal.");
      return;
    case "now":
      setNow(root, required(flags, "text"));
      console.log("Saved the current task.");
      return;
    case "decision": {
      const record = addDecision(root, {
        model: flag(flags, "model") || "user",
        decision: required(flags, "text"),
        why: flag(flags, "why") || "",
      });
      console.log(`Recorded decision ${record.id}`);
      return;
    }
    case "handoff": {
      const model = flag(flags, "model") || "user";
      const snap = loadBrain(root);
      const kindFlag = flag(flags, "kind");
      const kind =
        kindFlag === "note" || kindFlag === "change" || kindFlag === "proposal"
          ? kindFlag
          : handoffKindFor(snap.manifest.codeWriter, model);
      const record = addHandoff(root, {
        model,
        kind,
        task: flag(flags, "task") || "",
        did: required(flags, "did"),
        files: splitFiles(flag(flags, "files")),
        next: flag(flags, "next") || "",
      });
      console.log(`Recorded ${record.kind} handoff ${record.id}`);
      return;
    }
    case "brief": {
      const audience = audienceOf(flag(flags, "for") || "any");
      console.log(compileBrief(loadBrain(root), audience));
      return;
    }
    case "pack":
      console.log(compilePack(loadBrain(root)));
      return;
    case "search": {
      const query = rest.join(" ") || flag(flags, "text") || "";
      const hits = searchBrain(loadBrain(root), query);
      console.log(hits.length ? hits.join("\n") : "No matches.");
      return;
    }
    case "ask": {
      const model = flag(flags, "model") || "";
      if (model !== "claude" && model !== "gpt" && model !== "grok" && model !== "gemini") {
        throw new Error("ask needs --model claude, gpt, grok, or gemini.");
      }
      const result = await runAsk(root, model as AskModel, required(flags, "text"));
      console.log(result.answer);
      console.log("");
      console.log(`Saved a ${result.handoff.kind} handoff from ${writerLabel(result.model)}.`);
      if (result.decision) console.log(`Saved decision: ${result.decision}`);
      return;
    }
    case "serve": {
      const port = Number(flag(flags, "port") || "4317");
      await startBoard(root, port);
      console.log(`Dexter board: http://127.0.0.1:${port}`);
      return;
    }
    default:
      console.log(help);
      process.exitCode = 1;
  }
}

function audienceOf(value: string): Audience {
  if (value === "cursor" || value === "claude" || value === "gpt" || value === "grok" || value === "gemini" || value === "me" || value === "any") {
    return value;
  }
  throw new Error("--for must be cursor, claude, gpt, grok, me, or any.");
}

function splitFiles(value: string): string[] {
  if (!value || value.toLowerCase() === "none") return [];
  return value.split(",").map((file) => file.trim()).filter(Boolean);
}

function required(flags: Map<string, string>, name: string): string {
  const value = flag(flags, name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function flag(flags: Map<string, string>, name: string): string {
  return flags.get(name) ?? "";
}

function parse(argv: string[]): { command: string; flags: Map<string, string>; rest: string[] } {
  const flags = new Map<string, string>();
  const rest: string[] = [];
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  const args = command ? argv.slice(1) : argv;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next === undefined || next.startsWith("--")) flags.set(key, "true");
    else {
      flags.set(key, next);
      i++;
    }
  }
  return { command, flags, rest };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
