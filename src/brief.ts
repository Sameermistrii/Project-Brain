import type { Audience } from "./policy.js";
import { writerPolicy } from "./policy.js";
import type { BrainSnapshot, Decision, Handoff } from "./brain.js";

const GOAL_LIMIT = 2500;
const SUMMARY_LIMIT = 2500;
const NOW_LIMIT = 1500;
const ITEM_LIMIT = 500;
const DECISION_COUNT = 12;
const HANDOFF_COUNT = 8;

export function compileBrief(snap: BrainSnapshot, audience: Audience = "any"): string {
  const decisions = snap.decisions.slice(-DECISION_COUNT);
  const handoffs = snap.handoffs.slice(-HANDOFF_COUNT);
  const lines = [
    `Project: ${snap.manifest.name}`,
    "",
    writerPolicy(snap.manifest.codeWriter, audience),
    "",
    "Goal:",
    snap.goal ? clip(snap.goal, GOAL_LIMIT) : "(none yet)",
    "",
    "Current task:",
    snap.now ? clip(snap.now, NOW_LIMIT) : "(none yet)",
    "",
    ...(snap.summary ? ["Summary of earlier work:", clip(snap.summary, SUMMARY_LIMIT), ""] : []),
    "Decisions:",
    decisions.length ? decisions.map(formatDecision).join("\n") : "(none yet)",
    "",
    "Recent handoffs:",
    handoffs.length ? handoffs.map(formatHandoff).join("\n\n") : "(none yet)",
    "",
    "Use this shared state. Do not ask the user to paste another model's answer.",
  ];
  return lines.join("\n");
}

export function compilePack(snap: BrainSnapshot): string {
  return [
    "PROJECT CONTEXT",
    "Paste this into Claude, ChatGPT, Grok, Gemini, or Cursor. It is the shared project state.",
    "",
    compileBrief(snap, "any"),
  ].join("\n");
}

function formatDecision(decision: Decision): string {
  const why = decision.why ? ` Why: ${clip(decision.why, ITEM_LIMIT)}` : "";
  return `- ${decision.at.slice(0, 16)} ${decision.model}: ${clip(decision.decision, ITEM_LIMIT)}${why}`;
}

function formatHandoff(handoff: Handoff): string {
  const files = handoff.files.length ? ` Files: ${handoff.files.join(", ")}.` : "";
  const next = handoff.next ? ` Next: ${clip(handoff.next, ITEM_LIMIT)}` : "";
  const task = handoff.task ? ` Task: ${clip(handoff.task, ITEM_LIMIT)}.` : "";
  return `- ${handoff.at.slice(0, 16)} ${handoff.model} (${handoff.kind}).${task} ${clip(handoff.did, ITEM_LIMIT)}${files}${next}`;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}
