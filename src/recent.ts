import fs from "node:fs";
import path from "node:path";
import { brainDir } from "./brain.js";
import { listThreads } from "./chat.js";

export interface RecentChat {
  folder: string;
  name: string;
  id: string;
  title: string;
  updated: string;
}

const MAX_FOLDERS = 30;

/** Puts a folder at the front of the recent list, without duplicates, so Home can show chats from every folder. */
export function rememberFolder(list: unknown, folder: string): string[] {
  const resolved = path.resolve(folder);
  const same = (item: string) => (process.platform === "win32" ? item.toLowerCase() === resolved.toLowerCase() : item === resolved);
  const previous = Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : [];
  return [resolved, ...previous.filter((item) => !same(path.resolve(item)))].slice(0, MAX_FOLDERS);
}

/** Every chat in the recent folders, newest first. Folders that are gone or have no chats are skipped, and nothing is written. */
export function recentChats(folders: string[]): RecentChat[] {
  const chats: RecentChat[] = [];
  for (const folder of folders) {
    if (!fs.existsSync(path.join(brainDir(folder), "chats", "index.json"))) continue;
    for (const thread of listThreads(folder)) {
      // A chat still called "New chat" never got a message, so there is nothing to go back to.
      if (thread.title === "New chat") continue;
      chats.push({ folder: path.resolve(folder), name: path.basename(path.resolve(folder)), id: thread.id, title: thread.title, updated: thread.updated });
    }
  }
  return chats.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}
