import fs from "node:fs";
import path from "node:path";
import { isWriter, type Writer } from "./policy.js";

export type BrainMode = "work" | "debate";

export interface Manifest {
  version: 1;
  name: string;
  created: string;
  updated: string;
  codeWriter: Writer | null;
  mode: BrainMode;
}

export interface Decision {
  id: string;
  at: string;
  model: string;
  decision: string;
  why: string;
}

export interface Handoff {
  id: string;
  at: string;
  model: string;
  kind: "change" | "proposal" | "note";
  task: string;
  did: string;
  files: string[];
  next: string;
  parsed: boolean;
}

/** Personal settings. Kept out of Git so teammates sharing a .brain each keep their own writer and mode. */
interface LocalState {
  codeWriter?: Writer | null;
  mode?: BrainMode;
  updated?: string;
}

/** Files in .brain that stay on this computer: chats, Undo history, the last debate, and personal settings. */
const BRAIN_GITIGNORE = ["chats/", "checkpoints/", "checkpoints.jsonl", "debate.json", "local.json", "config.json", "usage.jsonl", ".env", "*.tmp", ""].join("\n");
/** Teammates add decisions and handoffs at the same time; union merge keeps both sides' lines. */
const BRAIN_GITATTRIBUTES = ["*.jsonl merge=union", ""].join("\n");

export interface BrainSnapshot {
  root: string;
  manifest: Manifest;
  goal: string;
  now: string;
  summary: string;
  decisions: Decision[];
  handoffs: Handoff[];
}

export function brainDir(root: string): string {
  return path.join(path.resolve(root), ".brain");
}

export function findProjectRoot(start: string): string | null {
  const forced = process.env.PROJECT_BRAIN_ROOT;
  if (forced) return path.resolve(forced);

  let dir = path.resolve(start);
  const stop = path.parse(dir).root;
  while (true) {
    if (fs.existsSync(path.join(dir, ".brain", "manifest.json"))) return dir;
    if (dir === stop) return null;
    dir = path.dirname(dir);
  }
}

export function initBrain(root: string, name: string): { root: string; created: boolean } {
  const dir = brainDir(root);
  const manifestPath = path.join(dir, "manifest.json");
  fs.mkdirSync(dir, { recursive: true });
  const created = !fs.existsSync(manifestPath);
  if (created) {
    const now = new Date().toISOString();
    // Only shared, stable fields live here. The writer, mode, and last-change time are in local.json.
    writeJson(manifestPath, {
      version: 1,
      name: name.trim() || path.basename(path.resolve(root)),
      created: now,
    });
  }
  touch(path.join(dir, "goal.md"));
  touch(path.join(dir, "now.md"));
  touch(path.join(dir, "decisions.jsonl"));
  touch(path.join(dir, "handoffs.jsonl"));
  writeIfMissing(path.join(dir, ".gitignore"), BRAIN_GITIGNORE);
  writeIfMissing(path.join(dir, ".gitattributes"), BRAIN_GITATTRIBUTES);
  return { root: path.resolve(root), created };
}

export function loadBrain(root: string): BrainSnapshot {
  const dir = brainDir(root);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No project brain in ${root}. Run: node dist/cli.js init`);
  }
  const raw = readJson<Partial<Manifest>>(manifestPath);
  const local = readLocal(root);
  // Older brains kept the writer and mode in manifest.json; local.json wins once it exists.
  const writer = "codeWriter" in local ? local.codeWriter : raw.codeWriter;
  const mode = local.mode ?? raw.mode;
  const manifest: Manifest = {
    version: 1,
    name: raw.name?.trim() || path.basename(path.resolve(root)),
    created: raw.created || new Date().toISOString(),
    updated: local.updated || raw.updated || raw.created || new Date().toISOString(),
    codeWriter: isWriter(writer) ? writer : null,
    mode: mode === "debate" ? "debate" : "work",
  };
  return {
    root: path.resolve(root),
    manifest,
    goal: readText(path.join(dir, "goal.md")),
    now: readText(path.join(dir, "now.md")),
    summary: readText(path.join(dir, "summary.md")),
    decisions: readJsonl<Decision>(path.join(dir, "decisions.jsonl")),
    handoffs: readJsonl<Handoff>(path.join(dir, "handoffs.jsonl")),
  };
}

export function setGoal(root: string, text: string): void {
  writeText(path.join(brainDir(root), "goal.md"), text.trim());
  touchManifest(root);
}

export function setNow(root: string, text: string): void {
  writeText(path.join(brainDir(root), "now.md"), text.trim());
  touchManifest(root);
}

export function setSummary(root: string, text: string): void {
  writeText(path.join(brainDir(root), "summary.md"), text.trim());
  touchManifest(root);
}

export function setMode(root: string, mode: BrainMode): Manifest {
  const snap = loadBrain(root);
  writeLocal(root, { codeWriter: snap.manifest.codeWriter, mode });
  return loadBrain(root).manifest;
}

export function setWriter(root: string, writer: Writer | null): Manifest {
  if (writer !== null && !isWriter(writer)) throw new Error("Unknown code writer.");
  const snap = loadBrain(root);
  writeLocal(root, { codeWriter: writer, mode: snap.manifest.mode });
  return loadBrain(root).manifest;
}

const MODEL_KEYS = ["cursor", "claude", "gpt", "grok"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export function enabledModels(root: string): Record<ModelKey, boolean> {
  const file = path.join(brainDir(root), "config.json");
  const raw = fs.existsSync(file) ? readJson<{ enabled?: Partial<Record<ModelKey, boolean>> }>(file) : {};
  return {
    cursor: raw.enabled?.cursor !== false,
    claude: raw.enabled?.claude !== false,
    gpt: raw.enabled?.gpt !== false,
    grok: raw.enabled?.grok !== false,
  };
}

export function setModelEnabled(root: string, provider: ModelKey, enabled: boolean): Record<ModelKey, boolean> {
  if (!MODEL_KEYS.includes(provider)) throw new Error("Unknown model.");
  const file = path.join(brainDir(root), "config.json");
  const raw = fs.existsSync(file) ? readJson<Record<string, unknown>>(file) : {};
  const enabledMap = { ...enabledModels(root), [provider]: enabled };
  writeJson(file, { ...raw, enabled: enabledMap });
  touchManifest(root);
  return enabledMap;
}

export function accessFolder(root: string): string {
  const file = path.join(brainDir(root), "config.json");
  const raw = fs.existsSync(file) ? readJson<{ folder?: unknown }>(file) : {};
  const chosen = typeof raw.folder === "string" ? raw.folder.trim() : "";
  if (chosen && fs.existsSync(chosen) && fs.statSync(chosen).isDirectory()) return path.resolve(chosen);
  return path.resolve(root);
}

export function setAccessFolder(root: string, folder: string): string {
  const resolved = path.resolve(String(folder ?? "").trim());
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("Choose a folder that exists.");
  }
  const file = path.join(brainDir(root), "config.json");
  const raw = fs.existsSync(file) ? readJson<Record<string, unknown>>(file) : {};
  writeJson(file, { ...raw, folder: resolved });
  touchManifest(root);
  return resolved;
}

export function addDecision(
  root: string,
  input: { model: string; decision: string; why?: string },
): Decision {
  const record: Decision = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    model: input.model.trim() || "user",
    decision: input.decision.trim(),
    why: (input.why ?? "").trim(),
  };
  if (!record.decision) throw new Error("A decision needs text.");
  appendJsonl(path.join(brainDir(root), "decisions.jsonl"), record);
  touchManifest(root);
  return record;
}

export function addHandoff(
  root: string,
  input: {
    model: string;
    kind: Handoff["kind"];
    task?: string;
    did: string;
    files?: string[];
    next?: string;
    parsed?: boolean;
  },
): Handoff {
  const record: Handoff = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    model: input.model.trim() || "user",
    kind: input.kind,
    task: (input.task ?? "").trim(),
    did: input.did.trim(),
    files: (input.files ?? []).map((file) => file.trim()).filter(Boolean),
    next: (input.next ?? "").trim(),
    parsed: input.parsed ?? true,
  };
  if (!record.did) throw new Error("A handoff needs a note about what happened.");
  appendJsonl(path.join(brainDir(root), "handoffs.jsonl"), record);
  touchManifest(root);
  return record;
}

export type MemoryKind = "decisions" | "handoffs";

/** Changes the text of one decision. */
export function updateDecision(root: string, id: string, decision: string, why?: string): Decision {
  const text = decision.trim();
  if (!text) throw new Error("A decision needs text.");
  const file = path.join(brainDir(root), "decisions.jsonl");
  const items = readJsonl<Decision>(file);
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error("That decision is not in this folder's memory.");
  found.decision = text;
  if (why !== undefined) found.why = why.trim();
  writeJsonl(file, items);
  touchManifest(root);
  return found;
}

/** Removes one decision or handoff, for memory that is wrong or no longer true. */
export function deleteMemory(root: string, kind: MemoryKind, id: string): void {
  if (kind !== "decisions" && kind !== "handoffs") throw new Error("Unknown memory.");
  const file = path.join(brainDir(root), `${kind}.jsonl`);
  const items = readJsonl<{ id: string }>(file);
  const kept = items.filter((item) => item.id !== id);
  if (kept.length === items.length) throw new Error("That item is not in this folder's memory.");
  writeJsonl(file, kept);
  touchManifest(root);
}

/** Every word of the query must appear, in any order. "login cookie" finds "cookie for the login". */
export function searchBrain(snap: BrainSnapshot, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: string[] = [];
  const consider = (label: string, text: string) => {
    const hay = text.toLowerCase();
    if (words.every((word) => hay.includes(word))) hits.push(`${label}: ${clip(text, 240)}`);
  };
  consider("goal", snap.goal);
  consider("now", snap.now);
  consider("summary", snap.summary);
  for (const decision of snap.decisions) {
    consider(`decision ${decision.at} (${decision.model})`, `${decision.decision} ${decision.why}`.trim());
  }
  for (const handoff of snap.handoffs) {
    consider(
      `handoff ${handoff.at} (${handoff.model}, ${handoff.kind})`,
      [handoff.task, handoff.did, handoff.files.join(", "), handoff.next].filter(Boolean).join(" — "),
    );
  }
  return hits.slice(-20);
}

// The time of the last change is personal too; writing it into manifest.json made every teammate's commit conflict.
function touchManifest(root: string): void {
  const local = readLocal(root);
  writeJson(path.join(brainDir(root), "local.json"), { ...local, updated: new Date().toISOString() });
}

function readLocal(root: string): LocalState {
  const file = path.join(brainDir(root), "local.json");
  if (!fs.existsSync(file)) return {};
  try {
    return readJson<LocalState>(file);
  } catch {
    return {};
  }
}

function writeLocal(root: string, next: { codeWriter: Writer | null; mode: BrainMode }): void {
  writeJson(path.join(brainDir(root), "local.json"), { ...readLocal(root), ...next, updated: new Date().toISOString() });
  // Take the old shared copies out of manifest.json so they stop conflicting between teammates.
  const manifestPath = path.join(brainDir(root), "manifest.json");
  const manifest = readJson<Record<string, unknown>>(manifestPath);
  if ("codeWriter" in manifest || "mode" in manifest || "updated" in manifest) {
    delete manifest.codeWriter;
    delete manifest.mode;
    delete manifest.updated;
    writeJson(manifestPath, manifest);
  }
}

function writeIfMissing(file: string, text: string): void {
  if (!fs.existsSync(file)) fs.writeFileSync(file, text);
}

function touch(file: string): void {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "");
}

function readText(file: string): string {
  if (!fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8").trim();
}

function writeText(file: string, text: string): void {
  const body = text.length ? `${text}\n` : "";
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function readJsonl<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const out: T[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip a torn line rather than hiding the rest of the log.
    }
  }
  return out;
}

function writeJsonl(file: string, items: unknown[]): void {
  writeText(file, items.map((item) => JSON.stringify(item)).join("\n"));
}

function appendJsonl(file: string, value: unknown): void {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}
