import { addDecision, addHandoff, loadBrain, type Handoff } from "./brain.js";
import { askModel } from "./accounts.js";
import { compileBrief } from "./brief.js";
import { askSystem, parseHandoffBlock, visibleAnswer } from "./handoff.js";
import { handoffKindFor } from "./policy.js";

export type AskModel = "claude" | "gpt" | "grok" | "gemini";

export interface AskResult {
  model: AskModel;
  answer: string;
  handoff: Handoff;
  decision: string;
}

/** Asks one signed-in model through its own tool, the same way the desktop app does. No API key is used. */
export async function runAsk(root: string, model: AskModel, task: string): Promise<AskResult> {
  const prompt = task.trim();
  if (!prompt) throw new Error("The task is empty.");
  const snap = loadBrain(root);
  const kind = handoffKindFor(snap.manifest.codeWriter, model);
  const system = askSystem(compileBrief(snap, model));
  const text = await askModel(model, `${system}\n\nTask:\n${prompt}`, kind === "change", root);
  if (!text.trim()) throw new Error(`${model} returned no text.`);
  const parsed = parseHandoffBlock(text);
  const answer = visibleAnswer(text) || text.trim();
  const handoff = addHandoff(root, {
    model,
    kind,
    task: prompt,
    did: parsed?.did || clip(answer, 800),
    files: parsed?.files ?? [],
    next: parsed?.next ?? "",
    parsed: Boolean(parsed),
  });
  let decision = "";
  if (parsed?.decision) {
    addDecision(root, { model, decision: parsed.decision, why: `From a ${model} handoff.` });
    decision = parsed.decision;
  }
  return { model, answer, handoff, decision };
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}
