import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brainDir } from "./brain.js";

/** Fill missing env vars from a file. Values already in the environment stay. */
export function loadEnvFile(file: string, locked: Set<string>): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (locked.has(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function loadProjectEnv(root: string): void {
  const locked = new Set(Object.keys(process.env));
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  loadEnvFile(path.join(packageRoot, ".env"), locked);
  loadEnvFile(path.resolve(".env"), locked);
  loadEnvFile(path.join(brainDir(root), ".env"), locked);
}

export function modelId(configured: string, envName: string): string {
  return process.env[envName]?.trim() || configured;
}
