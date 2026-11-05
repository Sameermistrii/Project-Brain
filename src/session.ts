import fs from "node:fs";
import path from "node:path";
import { addDecision, addHandoff, brainDir, enabledModels, loadBrain, setNow, setSummary, type BrainSnapshot, type ModelKey } from "./brain.js";
import { compileBrief } from "./brief.js";
import { accountStates, askModel, StoppedError, type Provider } from "./accounts.js";
import type { ChatAction } from "./chat.js";
import { beginCheckpoint, describeChange, finishCheckpoint, undoCheckpoint, type Checkpoint } from "./checkpoints.js";
import { handoffKindFor, writerLabel, type Writer } from "./policy.js";

export interface BrainReply {
  text: string;
  actions: ChatAction[];
}

export interface SubmitOptions {
  /** The Integrations switch. The desktop app keeps it in its own settings, not in each folder. */
  enabled?: Record<ModelKey, boolean>;
  /** Live output: which model, and the latest thing it is doing. */
  onProgress?: (label: string, line: string) => void;
}

interface SavedDebate {
  id: string;
  at: string;
  question: string;
  answers: { provider: Provider; label: string; text: string }[];
}

const MODELS: Provider[] = ["claude", "gpt", "grok", "cursor"];
const LABELS: Record<Provider, string> = { cursor: "Cursor", claude: "Claude", gpt: "ChatGPT", grok: "Grok" };

export function debatePrompt(brief: string, question: string, peers: { label: string; text: string }[]): string {
  const lines = [
    brief,
    "",
    "This is a debate. You can read files in this project. Do not create, edit, or delete files.",
    "Give one position in 120 words or fewer.",
    "",
    `Question: ${question}`,
  ];
  if (peers.length) {
    lines.push("", "The other models said:");
    for (const peer of peers) lines.push(`- ${peer.label}: ${peer.text}`);
    lines.push("", "Reply to them. Concede what they got right. Keep it under 120 words.");
  }
  return lines.join("\n");
}

export function workPrompt(brief: string, task: string, writer: Writer): string {
  return [
    brief,
    "",
    `The user assigned this task to ${writerLabel(writer)}.`,
    "You can read and edit files in this project. Do the task. Leave a short note of what changed.",
    "",
    task,
  ].join("\n");
}

/** Runs a message against the brain in `root`. The models work in `root` too. */
export async function submitToBrain(root: string, text: string, options: SubmitOptions = {}): Promise<BrainReply> {
  const enabled = options.enabled ?? enabledModels(root);
  const snap = loadBrain(root);
  const task = text.trim();
  if (snap.manifest.mode === "debate") return debate(root, snap, task, enabled, options);
  const writer = snap.manifest.codeWriter;
  if (writer === "cursor" || writer === "claude" || writer === "gpt" || writer === "grok") {
    if (!task) throw new Error(`Write a task for ${writerLabel(writer)}.`);
    if (!enabled[writer]) return reply(`${writerLabel(writer)} is switched off in Integrations. The sign-in stays.`);
    setNow(root, task);
    await requireSignedIn(writer);
    return runWork(root, task, writer, options);
  }
  if (task) setNow(root, task);
  const who = writerLabel(writer);
  return reply(
    writer ? `${who} will write the code. The other models stay out of the files.` : "Choose who writes the code. Nothing will edit files until you do.",
  );
}

/** The writer does the task between two Undo snapshots. A stopped or failed task can still be undone. */
async function runWork(root: string, task: string, writer: Provider, options: SubmitOptions): Promise<BrainReply> {
  const label = LABELS[writer];
  let undoNote = "";
  const open = await beginCheckpoint(root, task).catch((error: unknown) => {
    undoNote = `Undo is off for this task: ${messageOf(error)}`;
    return null;
  });
  if (!open && !undoNote) undoNote = "Undo is off because Git is not installed. Install Git from git-scm.com to turn it on.";
  let answer = "";
  let failure: unknown = null;
  try {
    const prompt = workPrompt(compileBrief(loadBrain(root), writer), task, writer);
    answer = await askModel(writer, prompt, true, root, { onProgress: (line) => options.onProgress?.(label, line) });
  } catch (error) {
    failure = error;
  }
  let change: Checkpoint | null = null;
  if (open) {
    change = await finishCheckpoint(root, open).catch((error: unknown) => {
      undoNote = `Undo is off for this task: ${messageOf(error)}`;
      return null;
    });
  }
  const changed = change && change.files.length ? change : null;
  const actions: ChatAction[] = changed ? [{ kind: "undo", checkpoint: changed.id }] : [];
  const changeLine = changed ? `${describeChange(changed)} Undo puts them back.` : undoNote || "No files changed.";
  const files = changed?.files.map((file) => file.path) ?? [];
  if (failure) {
    const head = failure instanceof StoppedError ? `Stopped ${label}.` : `${label} did not finish: ${messageOf(failure)}`;
    // Only a real change is worth remembering; a failed task that touched nothing leaves no trace in memory.
    if (changed) addHandoff(root, { model: writer, kind: "note", task, did: `${head} ${describeChange(changed)}`, files });
    return { text: `${head}\n\n${changeLine}`, actions };
  }
  addHandoff(root, { model: writer, kind: "change", task, did: clip(answer || "Finished without a note.", 800), files, next: "" });
  return { text: `${answer || "Done."}\n\n${changeLine}`, actions };
}

/** Puts the files back to before the task and tells the shared memory, so no model thinks the change is still there. */
export async function undoChange(root: string, checkpointId: string, force = false): Promise<BrainReply> {
  const undone = await undoCheckpoint(root, checkpointId, force);
  addHandoff(root, {
    model: "user",
    kind: "note",
    task: undone.task,
    did: `Undid this task. ${undone.files.length} file${undone.files.length === 1 ? " is" : "s are"} back to how they were before it.`,
    files: undone.files.map((file) => file.path),
  });
  return reply(`Undone. ${undone.files.length} file${undone.files.length === 1 ? " is" : "s are"} back to how they were before "${clip(undone.task, 80)}".`);
}

// shortcut: a word count stands in for "is this worth a debate"; add a confirm step if 3 words still lets noise through.
const DEBATE_MIN_WORDS = 3;

async function debate(
  root: string,
  snap: BrainSnapshot,
  question: string,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
): Promise<BrainReply> {
  if (!question) throw new Error("Write the question they should debate.");
  // A debate asks every model twice, so a greeting would cost up to eight paid answers.
  if (question.split(/\s+/).length < DEBATE_MIN_WORDS) {
    throw new Error("Write a full question for the debate. Every signed-in model answers it twice.");
  }
  setNow(root, question);
  const accounts = await accountStates();
  const signedIn = accounts.filter((account) => account.loggedIn && enabled[account.provider]);
  if (!signedIn.length) {
    if (accounts.some((account) => account.loggedIn)) {
      throw new Error("Turn a model on in Integrations. The sign-in stays.");
    }
    throw new Error("Sign in to Claude, ChatGPT, or Grok. Each button opens that model's own browser login.");
  }
  const brief = compileBrief(loadBrain(root), "any");
  const first = await Promise.all(
    signedIn.map(async (account) => ({
      provider: account.provider,
      label: account.label,
      ...(await askOrExplain(account.provider, account.label, debatePrompt(brief, question, []), root, options)),
    })),
  );
  // A model that failed is not a debater: it gets no second round and is not quoted to the others.
  const answered = first.filter((entry) => entry.ok);
  const second =
    answered.length < 2
      ? answered
      : await Promise.all(
          answered.map(async (entry) => {
            const peers = answered.filter((peer) => peer.provider !== entry.provider).map((peer) => ({ label: peer.label, text: clip(peer.text, 500) }));
            const next = await askOrExplain(entry.provider, entry.label, debatePrompt(brief, question, peers), root, options);
            // If the reply round fails, keep the model's first answer rather than its error.
            return next.ok ? { ...entry, text: next.text } : entry;
          }),
        );
  const failed = first.filter((entry) => !entry.ok);
  // Only real answers go into the shared memory. An error saved as a proposal would be read back by every model.
  for (const entry of second) {
    addHandoff(root, {
      model: entry.provider,
      kind: handoffKindFor(snap.manifest.codeWriter, entry.provider),
      task: question,
      did: clip(entry.text, 800),
      next: "The user decides who writes the code.",
    });
  }
  const saved: SavedDebate = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    question,
    answers: second.map((entry) => ({ provider: entry.provider, label: entry.label, text: entry.text })),
  };
  if (saved.answers.length) fs.writeFileSync(debateFile(root), JSON.stringify(saved, null, 2));
  const replies = second.map((entry) => `${entry.label}\n${clip(entry.text, 700)}`);
  const problems = failed.map((entry) => `${entry.label} did not answer: ${clip(entry.text, 300)}`);
  const actions: ChatAction[] = saved.answers.map((answer) => ({ kind: "apply", debate: saved.id, provider: answer.provider, label: answer.label }));
  return { text: [...replies, ...problems].join("\n\n"), actions };
}

/** The id of the newest debate, so older Apply buttons can be shown as used up. */
export function latestDebateId(root: string): string | null {
  return readDebate(root)?.id ?? null;
}

/**
 * "Apply": the person picks one model's proposal from the latest debate. It is saved as a decision, and the
 * code writer builds it, with Undo, exactly like a typed task.
 */
export async function applyProposal(root: string, debateId: string, provider: Provider, options: SubmitOptions = {}): Promise<BrainReply> {
  const saved = readDebate(root);
  if (!saved || saved.id !== debateId) throw new Error("That debate is older than the latest one. Ask the question again to apply it.");
  const answer = saved.answers.find((item) => item.provider === provider);
  if (!answer) throw new Error("That model did not answer this debate.");
  const writer = loadBrain(root).manifest.codeWriter;
  if (!writer) throw new Error("Choose who writes the code first, then press Apply again.");
  const decision = { model: "user", decision: `For "${clip(saved.question, 200)}", go with ${answer.label}'s proposal.`, why: clip(answer.text, 500) };
  if (writer === "me") {
    addDecision(root, decision);
    return reply(`Saved as a decision. You write the code, so here is ${answer.label}'s proposal to apply:\n\n${answer.text}`);
  }
  const enabled = options.enabled ?? enabledModels(root);
  if (!enabled[writer]) throw new Error(`${writerLabel(writer)} is switched off in Integrations. Turn it on, then press Apply again.`);
  await requireSignedIn(writer);
  addDecision(root, decision);
  const task = [`Apply ${answer.label}'s proposal from the debate.`, "", `Question: ${saved.question}`, "", `${answer.label}'s proposal:`, answer.text].join("\n");
  setNow(root, `Apply ${answer.label}'s proposal: ${saved.question}`);
  return runWork(root, task, writer, options);
}

const BRIEF_HANDOFFS = 8;

/** Asks one signed-in model to fold older handoffs into a short summary that every brief includes. */
export async function summarizeMemory(root: string, options: SubmitOptions = {}): Promise<string> {
  const snap = loadBrain(root);
  const older = snap.handoffs.slice(0, -BRIEF_HANDOFFS);
  if (!older.length) return "Nothing to summarize yet. Every handoff already fits in the brief.";
  const enabled = options.enabled ?? enabledModels(root);
  const accounts = await accountStates();
  const pick = MODELS.map((provider) => accounts.find((account) => account.provider === provider)).find(
    (account) => account?.loggedIn && enabled[account.provider],
  );
  if (!pick) throw new Error("Sign in to a model first. One model writes the summary.");
  const prompt = [
    "Summarize this project's earlier work for other AI models that will continue it.",
    "Keep decisions, finished work, and open problems. Drop chit-chat and errors. At most 200 words, plain sentences, no preamble.",
    "Do not create, edit, or delete files.",
    "",
    snap.summary ? `The current summary:\n${snap.summary}\n` : "",
    "Older handoffs, oldest first:",
    ...older.map((item) => `- ${item.at.slice(0, 16)} ${item.model} (${item.kind}). ${item.task ? `Task: ${clip(item.task, 200)}. ` : ""}${clip(item.did, 400)}`),
  ].join("\n");
  const text = await askModel(pick.provider, prompt, false, root, { onProgress: (line) => options.onProgress?.(pick.label, line) });
  if (!text.trim()) throw new Error(`${pick.label} returned an empty summary.`);
  setSummary(root, text);
  return text.trim();
}

async function askOrExplain(
  provider: Provider,
  label: string,
  prompt: string,
  root: string,
  options: SubmitOptions,
): Promise<{ ok: boolean; text: string }> {
  try {
    const text = await askModel(provider, prompt, false, root, { onProgress: (line) => options.onProgress?.(label, line) });
    if (!text.trim()) return { ok: false, text: "It returned nothing." };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof StoppedError) return { ok: false, text: "Stopped." };
    const message = messageOf(error);
    if (/spawn\s+\S+\s+ENOENT/i.test(message)) return { ok: false, text: `${label} could not be started.` };
    return { ok: false, text: message };
  }
}

async function requireSignedIn(provider: Provider): Promise<void> {
  const account = (await accountStates()).find((item) => item.provider === provider);
  if (!account?.loggedIn) {
    throw new Error(`Sign in to ${account?.label ?? provider}. The button opens its browser login.`);
  }
}

function readDebate(root: string): SavedDebate | null {
  try {
    return JSON.parse(fs.readFileSync(debateFile(root), "utf8")) as SavedDebate;
  } catch {
    return null;
  }
}

function debateFile(root: string): string {
  return path.join(brainDir(root), "debate.json");
}

function reply(text: string): BrainReply {
  return { text, actions: [] };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}
