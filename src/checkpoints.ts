import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";

/**
 * Undo for the code writer. Before a task, the folder is snapshotted into a hidden Git repository in
 * .brain/checkpoints (separate from the folder's own .git, which is never touched). After the task, a second
 * snapshot records what changed. Undo puts the files back to the first snapshot.
 */

export interface Checkpoint {
  id: string;
  at: string;
  task: string;
  before: string;
  after: string;
  files: { status: string; path: string }[];
  undone: boolean;
}

export interface OpenCheckpoint {
  id: string;
  task: string;
  before: string;
}

export class DirtyError extends Error {
  constructor(readonly files: string[]) {
    super(`Files changed after that task: ${files.slice(0, 5).join(", ")}${files.length > 5 ? "…" : ""}. Undo would also remove those changes.`);
  }
}

const IGNORED = [".brain/", ".git/", "node_modules/", ""].join("\n");

let gitChecked: Promise<boolean> | null = null;

/** Whether Git is installed. Undo needs it; everything else works without it. */
export function hasGit(): Promise<boolean> {
  gitChecked ??= new Promise((resolve) => {
    execFile("git", ["--version"], { windowsHide: true, timeout: 8_000 }, (error) => resolve(!error));
  });
  return gitChecked;
}

/** Snapshots the folder before the writer starts. Returns null when Git is missing, so the task still runs. */
export async function beginCheckpoint(root: string, task: string): Promise<OpenCheckpoint | null> {
  if (!(await hasGit())) return null;
  await ensureRepo(root);
  const before = await snapshot(root, `before: ${task}`);
  return { id: crypto.randomUUID(), task, before };
}

/** Snapshots again after the writer stops and records what changed. */
export async function finishCheckpoint(root: string, open: OpenCheckpoint): Promise<Checkpoint> {
  const after = await snapshot(root, `after: ${open.task}`);
  const diff = await git(root, ["diff", "--name-status", "--no-renames", open.before, after]);
  const files = diff
    .split(/\r?\n/)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 2)
    .map(([status, file]) => ({ status: status.trim(), path: file.trim() }));
  const record: Checkpoint = { ...open, at: new Date().toISOString(), after, files, undone: false };
  fs.appendFileSync(logFile(root), `${JSON.stringify(record)}\n`);
  return record;
}

export function listCheckpoints(root: string): Checkpoint[] {
  const file = logFile(root);
  if (!fs.existsSync(file)) return [];
  const out: Checkpoint[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Checkpoint);
    } catch {
      // Skip a torn line rather than losing the rest of the history.
    }
  }
  return out;
}

/** The newest change that can still be undone, or null. */
export function lastUndoable(root: string): Checkpoint | null {
  const items = listCheckpoints(root);
  const last = items[items.length - 1];
  return last && !last.undone && last.files.length ? last : null;
}

/**
 * Puts the folder back to how it was before the task. Only the newest change can be undone, so a later
 * task's work is never removed by accident. If files changed after the task, this refuses unless `force` is set.
 */
export async function undoCheckpoint(root: string, id: string, force = false): Promise<Checkpoint> {
  const last = lastUndoable(root);
  if (!last || last.id !== id) throw new Error("Only the latest change can be undone, and this one is not it.");
  // Stage everything so the comparison sees new and deleted files too.
  await git(root, ["add", "-A"]);
  const drift = (await git(root, ["diff", "--cached", "--name-only", last.after])).split(/\r?\n/).filter(Boolean);
  if (drift.length && !force) throw new DirtyError(drift);
  // A path in the index but not in the source is removed, so files the task created are deleted too.
  await git(root, ["restore", `--source=${last.before}`, "--staged", "--worktree", "--", "."]);
  await snapshot(root, `undo: ${last.task}`);
  const items = listCheckpoints(root).map((item) => (item.id === id ? { ...item, undone: true } : item));
  fs.writeFileSync(logFile(root), items.map((item) => JSON.stringify(item)).join("\n") + "\n");
  return { ...last, undone: true };
}

/** One line for the chat, such as "Changed 3 files: a.ts, b.ts, c.ts." */
export function describeChange(checkpoint: Checkpoint): string {
  const count = checkpoint.files.length;
  if (!count) return "No files changed.";
  const names = checkpoint.files.slice(0, 6).map((file) => `\`${file.path}\`${file.status === "A" ? " (new)" : file.status === "D" ? " (deleted)" : ""}`);
  const more = count > 6 ? `, and ${count - 6} more` : "";
  return `Changed ${count} file${count === 1 ? "" : "s"}: ${names.join(", ")}${more}.`;
}

function logFile(root: string): string {
  return path.join(brainDir(root), "checkpoints.jsonl");
}

function gitDir(root: string): string {
  return path.join(brainDir(root), "checkpoints");
}

async function ensureRepo(root: string): Promise<void> {
  const dir = gitDir(root);
  if (fs.existsSync(path.join(dir, "HEAD"))) return;
  fs.mkdirSync(dir, { recursive: true });
  await git(root, ["init", "--quiet"]);
  fs.mkdirSync(path.join(dir, "info"), { recursive: true });
  fs.writeFileSync(path.join(dir, "info", "exclude"), IGNORED);
}

async function snapshot(root: string, message: string): Promise<string> {
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "--quiet", "--allow-empty", "--no-verify", "-m", message.slice(0, 200)]);
  return (await git(root, ["rev-parse", "HEAD"])).trim();
}

function git(root: string, args: string[]): Promise<string> {
  const env = {
    ...process.env,
    GIT_DIR: gitDir(root),
    GIT_WORK_TREE: path.resolve(root),
    GIT_AUTHOR_NAME: "Dexter",
    GIT_AUTHOR_EMAIL: "undo@project-brain.local",
    GIT_COMMITTER_NAME: "Dexter",
    GIT_COMMITTER_EMAIL: "undo@project-brain.local",
  };
  // Keep files byte-for-byte and skip signing from the person's global Git config. The repo is new, so it has no hooks.
  const fixed = ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "commit.gpgsign=false"];
  return new Promise((resolve, reject) => {
    // A very large folder could make a snapshot crawl; after 2 minutes the task runs without Undo instead of waiting.
    execFile("git", [...fixed, ...args], { cwd: root, env, windowsHide: true, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`Undo history failed: ${(stderr || error.message).trim()}`));
      else resolve(stdout);
    });
  });
}
