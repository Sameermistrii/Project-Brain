import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";

/** A button under a reply: Undo a writer's change, or Apply one model's debate proposal. */
export type ChatAction =
  | { kind: "undo"; checkpoint: string }
  | { kind: "apply"; debate: string; provider: "cursor" | "claude" | "gpt" | "grok"; label: string };

export interface ChatMessage {
  id: string;
  at: string;
  role: "user" | "brain";
  text: string;
  actions?: ChatAction[];
}

export interface ChatThread {
  id: string;
  title: string;
  updated: string;
}

interface ChatIndex {
  current: string | null;
  threads: ChatThread[];
}

export function listThreads(root: string): ChatThread[] {
  return readIndex(root).threads;
}

export function currentThreadId(root: string): string | null {
  return readIndex(root).current;
}

export function listChat(root: string): ChatMessage[] {
  const current = readIndex(root).current;
  if (!current) return [];
  return readMessages(threadFile(root, current));
}

export function createThread(root: string): ChatThread {
  const thread = blankThread("New chat");
  const index = readIndex(root);
  index.threads.unshift(thread);
  index.current = thread.id;
  writeIndex(root, index);
  fs.writeFileSync(threadFile(root, thread.id), "");
  return thread;
}

export function openThread(root: string, id: string): ChatThread {
  const index = readIndex(root);
  const thread = index.threads.find((item) => item.id === id);
  if (!thread) throw new Error("That chat is not in this folder.");
  index.current = thread.id;
  writeIndex(root, index);
  return thread;
}

export function appendChat(root: string, input: { role: ChatMessage["role"]; text: string; actions?: ChatAction[] }): ChatMessage {
  const text = input.text.trim();
  if (!text) throw new Error("A chat message needs text.");
  const index = readIndex(root);
  let thread = index.threads.find((item) => item.id === index.current);
  if (!thread) {
    thread = blankThread(input.role === "user" ? titleFrom(text) : "New chat");
    index.threads.unshift(thread);
    index.current = thread.id;
  }
  const record: ChatMessage = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    role: input.role,
    text,
    ...(input.actions?.length ? { actions: input.actions } : {}),
  };
  const file = threadFile(root, thread.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
  thread.updated = record.at;
  if (input.role === "user" && thread.title === "New chat") thread.title = titleFrom(text);
  writeIndex(root, index);
  return record;
}

function blankThread(title: string): ChatThread {
  return { id: crypto.randomUUID(), title, updated: new Date().toISOString() };
}

function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 42 ? `${line.slice(0, 41)}…` : line;
}

function chatsDir(root: string): string {
  return path.join(brainDir(root), "chats");
}

function indexPath(root: string): string {
  return path.join(chatsDir(root), "index.json");
}

function threadFile(root: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("That chat is not in this folder.");
  return path.join(chatsDir(root), `${id}.jsonl`);
}

function readIndex(root: string): ChatIndex {
  migrateLegacy(root);
  const file = indexPath(root);
  if (!fs.existsSync(file)) return { current: null, threads: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<ChatIndex>;
    const threads = Array.isArray(raw.threads)
      ? raw.threads.filter((item) => item && /^[0-9a-f-]{36}$/i.test(String(item.id)))
      : [];
    const current = threads.some((item) => item.id === raw.current) ? String(raw.current) : threads[0]?.id ?? null;
    return {
      current,
      threads: threads
        .map((item) => ({
          id: String(item.id),
          title: String(item.title || "New chat"),
          updated: String(item.updated || ""),
        }))
        .sort((a, b) => (a.updated < b.updated ? 1 : -1)),
    };
  } catch {
    return { current: null, threads: [] };
  }
}

function writeIndex(root: string, index: ChatIndex): void {
  fs.mkdirSync(chatsDir(root), { recursive: true });
  // Write then rename: a half-written index reads as empty, which made every chat look lost.
  const tmp = `${indexPath(root)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2));
  fs.renameSync(tmp, indexPath(root));
}

function migrateLegacy(root: string): void {
  const legacy = path.join(brainDir(root), "chat.jsonl");
  if (!fs.existsSync(legacy) || fs.existsSync(indexPath(root))) return;
  const messages = readMessages(legacy);
  if (!messages.length) return;
  const first = messages.find((item) => item.role === "user");
  const thread = blankThread(first ? titleFrom(first.text) : "Chat");
  thread.updated = messages[messages.length - 1]?.at || thread.updated;
  fs.mkdirSync(chatsDir(root), { recursive: true });
  fs.writeFileSync(threadFile(root, thread.id), messages.map((item) => JSON.stringify(item)).join("\n") + "\n");
  writeIndex(root, { current: thread.id, threads: [thread] });
}

function readMessages(file: string): ChatMessage[] {
  if (!fs.existsSync(file)) return [];
  const out: ChatMessage[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<ChatMessage>;
      if ((parsed.role === "user" || parsed.role === "brain") && parsed.text?.trim()) {
        out.push({
          id: parsed.id || crypto.randomUUID(),
          at: parsed.at || new Date().toISOString(),
          role: parsed.role,
          text: parsed.text.trim(),
          ...(Array.isArray(parsed.actions) && parsed.actions.length ? { actions: parsed.actions } : {}),
        });
      }
    } catch {
      // Skip a torn line rather than hiding the rest of the chat.
    }
  }
  return out;
}
