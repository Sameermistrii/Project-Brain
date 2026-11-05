#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addDecision,
  addHandoff,
  findProjectRoot,
  loadBrain,
  searchBrain,
  setGoal,
  setNow,
  setWriter,
} from "./brain.js";
import { compileBrief, compilePack } from "./brief.js";
import { handoffKindFor, isWriter, writerLabel, type Audience } from "./policy.js";

const audience = z.enum(["cursor", "claude", "gpt", "grok", "gemini", "me", "any"]).optional();

function projectRoot(): string {
  const root = findProjectRoot(process.cwd());
  if (!root) throw new Error("No project brain in this folder. Run: node dist/cli.js init");
  return root;
}

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

const server = new McpServer({
  name: "project-brain",
  version: "0.1.0",
});

server.registerTool(
  "brain_brief",
  {
    description:
      "Read the shared project brief before planning or editing. Follow the Who writes code section. If you are not the chosen code writer, do not edit files.",
    inputSchema: { audience },
  },
  async ({ audience: who }) => {
    const snap = loadBrain(projectRoot());
    return text(compileBrief(snap, (who ?? "cursor") as Audience));
  },
);

server.registerTool(
  "brain_pack",
  {
    description: "Return a short project context pack the user can paste into a browser chat.",
    inputSchema: {},
  },
  async () => text(compilePack(loadBrain(projectRoot()))),
);

server.registerTool(
  "brain_status",
  {
    description: "Show who the user chose to write code, plus the project name.",
    inputSchema: {},
  },
  async () => {
    const snap = loadBrain(projectRoot());
    return text(`Project: ${snap.manifest.name}\nWho writes code: ${writerLabel(snap.manifest.codeWriter)}`);
  },
);

server.registerTool(
  "brain_set_writer",
  {
    description:
      "Set who writes code. Call this only when the user explicitly chooses. Values: cursor, claude, gpt, grok, me, or none.",
    inputSchema: { writer: z.enum(["cursor", "claude", "gpt", "grok", "gemini", "me", "auto", "none"]) },
  },
  async ({ writer }) => {
    const root = projectRoot();
    if (writer === "none") {
      setWriter(root, null);
      return text("Who writes code: not chosen. Do not edit project files.");
    }
    if (!isWriter(writer)) throw new Error("Unknown code writer.");
    setWriter(root, writer);
    return text(compileBrief(loadBrain(root), writer));
  },
);

server.registerTool(
  "brain_set_goal",
  {
    description: "Replace the shared project goal.",
    inputSchema: { text: z.string() },
  },
  async ({ text: goal }) => {
    const root = projectRoot();
    setGoal(root, goal);
    return text("Saved the goal.");
  },
);

server.registerTool(
  "brain_set_now",
  {
    description: "Replace the current task every model should see.",
    inputSchema: { text: z.string() },
  },
  async ({ text: task }) => {
    const root = projectRoot();
    setNow(root, task);
    return text("Saved the current task.");
  },
);

server.registerTool(
  "brain_add_decision",
  {
    description: "Record a decision the other models must keep. Use this for choices, not for chatty notes.",
    inputSchema: {
      decision: z.string(),
      why: z.string().optional(),
      model: z.string().optional(),
    },
  },
  async ({ decision, why, model }) => {
    const record = addDecision(projectRoot(), { decision, why, model: model || "cursor" });
    return text(`Recorded decision ${record.id}: ${record.decision}`);
  },
);

server.registerTool(
  "brain_add_handoff",
  {
    description:
      "Record what just happened so the next model does not start over. If you are not the code writer, kind must be proposal.",
    inputSchema: {
      did: z.string(),
      task: z.string().optional(),
      files: z.array(z.string()).optional(),
      next: z.string().optional(),
      model: z.string().optional(),
      kind: z.enum(["change", "proposal", "note"]).optional(),
    },
  },
  async ({ did, task, files, next, model, kind }) => {
    const root = projectRoot();
    const snap = loadBrain(root);
    const who = model || "cursor";
    const resolved = kind ?? handoffKindFor(snap.manifest.codeWriter, who);
    if (resolved === "change" && snap.manifest.codeWriter !== who) {
      return text(
        `Refused a change handoff. The user chose ${writerLabel(snap.manifest.codeWriter)} to write code. Record a proposal instead.`,
      );
    }
    const record = addHandoff(root, { model: who, kind: resolved, task, did, files, next });
    return text(`Recorded ${record.kind} handoff ${record.id}.`);
  },
);

server.registerTool(
  "brain_search",
  {
    description: "Search the goal, current task, decisions, and handoffs.",
    inputSchema: { query: z.string() },
  },
  async ({ query }) => {
    const hits = searchBrain(loadBrain(projectRoot()), query);
    return text(hits.length ? hits.join("\n") : "No matches.");
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
