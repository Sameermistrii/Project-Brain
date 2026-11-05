import fs from "node:fs";
import path from "node:path";
import type { Provider, UsageEvent } from "./accounts.js";
import { brainDir } from "./brain.js";

/**
 * Per-model usage on this computer, kept with the app's settings. The model tools do not report how much of a
 * subscription is left, so this counts what Project Brain asked and notices when a tool says a limit was hit.
 */

interface UsageRecord extends UsageEvent {
  at: string;
  limit: boolean;
}

export interface UsageSummary {
  provider: Provider;
  asksToday: number;
  asksWeek: number;
  tokensWeek: number;
  costWeekUsd: number;
  failedWeek: number;
  lastLimitAt: string | null;
}

const LIMIT = /usage limit|rate limit|quota|limit reached|limit exceeded|too many requests|\b429\b|past due|billing|out of credits/i;
const PROVIDERS: Provider[] = ["cursor", "claude", "gpt", "grok"];
const KEEP_DAYS = 30;

export function isLimitError(text: string): boolean {
  return LIMIT.test(text);
}

export function recordUsage(root: string, event: UsageEvent, now = new Date()): void {
  const record: UsageRecord = { ...event, at: now.toISOString(), limit: !event.ok && isLimitError(event.error ?? "") };
  if (record.error) record.error = record.error.slice(0, 300);
  const file = usageFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
}

export function usageSummary(root: string, now = new Date()): UsageSummary[] {
  const records = readUsage(root);
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return PROVIDERS.map((provider) => {
    const mine = records.filter((record) => record.provider === provider);
    const week = mine.filter((record) => Date.parse(record.at) >= weekStart);
    const limits = mine.filter((record) => record.limit);
    return {
      provider,
      asksToday: mine.filter((record) => Date.parse(record.at) >= dayStart.getTime()).length,
      asksWeek: week.length,
      tokensWeek: week.reduce((sum, record) => sum + (record.tokens ?? 0), 0),
      costWeekUsd: week.reduce((sum, record) => sum + (record.costUsd ?? 0), 0),
      failedWeek: week.filter((record) => !record.ok).length,
      lastLimitAt: limits.length ? limits[limits.length - 1].at : null,
    };
  });
}

function readUsage(root: string): UsageRecord[] {
  const file = usageFile(root);
  if (!fs.existsSync(file)) return [];
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const out: UsageRecord[] = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as UsageRecord;
      if (Date.parse(record.at) >= cutoff) out.push(record);
    } catch {
      // Skip a torn line.
    }
  }
  return out;
}

function usageFile(root: string): string {
  return path.join(brainDir(root), "usage.jsonl");
}
