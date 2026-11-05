import fs from "node:fs";
import path from "node:path";
import { addDecision, addHandoff, brainDir, enabledModels, loadBrain, setNow, setSummary, type BrainSnapshot, type ModelKey } from "./brain.js";
import { compileBrief } from "./brief.js";
import { accountStates, askModel, StoppedError, type AccountState, type Provider } from "./accounts.js";
import type { ChatAction } from "./chat.js";
import { beginCheckpoint, describeChange, finishCheckpoint, listCheckpoints, undoCheckpoint, type Checkpoint } from "./checkpoints.js";
import { MODES, modeInfo, modePrompt, type BrainMode } from "./modes.js";
import { writerLabel, type Writer } from "./policy.js";

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

interface Answer {
  provider: Provider;
  label: string;
  text: string;
}

/** The latest answers that can be applied: from a debate, a plan, a review, or a brainstorm. */
interface SavedProposals {
  id: string;
  at: string;
  mode?: BrainMode;
  question: string;
  answers: Answer[];
}

const MODELS: Provider[] = ["claude", "gpt", "gemini", "grok", "cursor"];
const LABELS: Record<Provider, string> = { cursor: "Cursor", claude: "Claude", gpt: "ChatGPT", grok: "Grok", gemini: "Gemini" };

export function debatePrompt(brief: string, question: string, peers: { label: string; text: string }[]): string {
  const lines = [
    brief,
    "",
    "This is a debate. You can read files in this project. Do not create, edit, or delete files.",
    "Give one position in 120 words or fewer. Use Markdown.",
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

/** Runs a message against the brain in `root`, in the folder's current mode. The models work in `root` too. */
export async function submitToBrain(root: string, text: string, options: SubmitOptions = {}): Promise<BrainReply> {
  const enabled = options.enabled ?? enabledModels(root);
  const snap = loadBrain(root);
  const task = text.trim();
  if (snap.manifest.mode !== "auto") return runMode(root, snap, task, snap.manifest.mode, enabled, options);
  // Auto: one model reads the message and picks the mode (and, with Writes on Auto, the team) in one answer.
  if (!task) throw new Error("Write what you need first.");
  const ready = await readyModels(enabled);
  const route = await routeMessage(root, task, ready, options);
  const result = await runMode(root, snap, task, route.mode, enabled, options, route.team);
  return { ...result, text: `**Auto picked ${modeInfo(route.mode).label}.** ${route.why}\n\n${result.text}` };
}

async function runMode(
  root: string,
  snap: BrainSnapshot,
  task: string,
  mode: BrainMode,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
  team: Team | null = null,
): Promise<BrainReply> {
  const info = modeInfo(mode);
  // Debate and the all-model modes check the question first, then need any two models themselves.
  if (info.runner === "debate") return debate(root, snap, task, enabled, options);
  if (info.runner === "panel") return panel(root, snap, task, mode, enabled, options);
  // Any two signed-in models are enough. Which ones does not matter; the rest are simply not asked.
  const ready = await readyModels(enabled);
  const writer = snap.manifest.codeWriter;
  if (info.runner === "solo") return solo(root, snap, task, mode, enabled, options, false);
  if (!task) throw new Error("Write what you need first.");
  if (writer === "auto") {
    setNow(root, task);
    return runAuto(root, task, mode, enabled, options, "", team);
  }
  if (isModel(writer)) {
    setNow(root, task);
    if (ready.some((account) => account.provider === writer)) return runWork(root, task, writer, options, mode);
    // The chosen writer is not signed in or is switched off: the signed-in models pick the team instead of stopping.
    return runAuto(root, task, mode, enabled, options, `${writerLabel(writer)} is not signed in or is switched off, so the signed-in models picked the team.`);
  }
  // Nobody may edit (None or You): one model still answers, as advice only, and changes nothing.
  return solo(root, snap, task, mode, enabled, options, true);
}

/** The writer does the task between two Undo snapshots. A stopped or failed task can still be undone. */
async function runWork(root: string, task: string, writer: Provider, options: SubmitOptions, mode: BrainMode = "work"): Promise<BrainReply & { failed: boolean }> {
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
    const prompt = modePrompt(compileBrief(loadBrain(root), writer), mode, task, [
      `The user assigned this to ${label}. You can read and edit files in this project.`,
      "Keep the reply brief: what you did, then anything the user must know. The app lists the changed files for you.",
    ]);
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
  const changeLine = changed ? `${describeChange(changed)} Undo puts ${changed.files.length === 1 ? "it" : "them"} back.` : undoNote || "No files changed.";
  const files = changed?.files.map((file) => file.path) ?? [];
  if (failure) {
    const head = failure instanceof StoppedError ? `Stopped ${label}.` : `${label} did not finish: ${messageOf(failure)}`;
    // Only a real change is worth remembering; a failed task that touched nothing leaves no trace in memory.
    if (changed) addHandoff(root, { model: writer, kind: "note", task, did: `${head} ${describeChange(changed)}`, files });
    return { text: `${head}\n\n${changeLine}`, actions, failed: true };
  }
  addHandoff(root, { model: writer, kind: "change", task, did: clip(answer || "Finished without a note.", 800), files, next: "" });
  return { text: `${answer || "Done."}\n\n${changeLine}`, actions, failed: false };
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

/** One model answers and edits nothing: the writer if it is a model, otherwise the first signed-in model. */
async function solo(
  root: string,
  snap: BrainSnapshot,
  task: string,
  mode: BrainMode,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
  adviceOnly: boolean,
): Promise<BrainReply> {
  const info = modeInfo(mode);
  if (!task) throw new Error(`Write what you need for ${info.label}.`);
  setNow(root, task);
  const pick = await pickModel(snap.manifest.codeWriter, enabled);
  const extra = adviceOnly ? ["Nobody is assigned to change files right now. Do not edit anything. Describe the change instead, with file paths."] : [];
  const prompt = modePrompt(compileBrief(loadBrain(root), "any"), mode, task, [modeInfo(mode).runner === "writer" ? "Do not create, edit, or delete files." : "", ...extra].filter(Boolean));
  const text = await askModel(pick.provider, prompt, false, root, { onProgress: (line) => options.onProgress?.(pick.label, line) });
  if (!text.trim()) throw new Error(`${pick.label} returned nothing.`);
  addHandoff(root, { model: pick.provider, kind: info.apply || adviceOnly ? "proposal" : "note", task, did: clip(text, 800) });
  const answers = [{ provider: pick.provider, label: pick.label, text }];
  const saved = info.apply || adviceOnly ? saveProposals(root, mode, task, answers) : null;
  const head = adviceOnly ? "**Advice only.** Nobody is assigned to write code, so nothing was changed.\n\n" : "";
  return { text: `${head}${text.trim()}\n\n*${info.label} by ${pick.label}*`, actions: saved ? applyActions(saved) : [] };
}

/** Every signed-in model answers once and edits nothing. */
async function panel(
  root: string,
  snap: BrainSnapshot,
  task: string,
  mode: BrainMode,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
): Promise<BrainReply> {
  const info = modeInfo(mode);
  requireFullQuestion(task, `Write a full request for ${info.label}. Every signed-in model answers it.`);
  setNow(root, task);
  const signedIn = await readyModels(enabled);
  const brief = compileBrief(loadBrain(root), "any");
  const extra = mode === "review" ? latestChangeLines(root) : [];
  const results = await Promise.all(
    signedIn.map(async (account) => ({
      provider: account.provider,
      label: account.label,
      ...(await askOrExplain(account.provider, account.label, modePrompt(brief, mode, task, extra), root, options)),
    })),
  );
  return finishRound(root, mode, task, results.filter((item) => item.ok), results.filter((item) => !item.ok));
}

// shortcut: a word count stands in for "is this worth asking every model"; add a confirm step if 3 words still lets noise through.
const MIN_WORDS = 3;

function requireFullQuestion(question: string, message: string): void {
  if (!question) throw new Error(message);
  // Asking every model costs one paid answer each (two in a debate), so a greeting is refused.
  if (question.split(/\s+/).length < MIN_WORDS) throw new Error(message);
}

async function debate(
  root: string,
  snap: BrainSnapshot,
  question: string,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
): Promise<BrainReply> {
  requireFullQuestion(question, "Write a full question for the debate. Every signed-in model answers it twice.");
  setNow(root, question);
  const signedIn = await readyModels(enabled);
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
  return finishRound(root, "debate", question, second, first.filter((entry) => !entry.ok));
}

/** Saves real answers to memory and as appliable proposals. Failures are shown but never remembered. */
function finishRound(
  root: string,
  mode: BrainMode,
  question: string,
  answered: Answer[],
  failed: Answer[],
): BrainReply {
  for (const entry of answered) {
    addHandoff(root, {
      model: entry.provider,
      kind: "proposal",
      task: question,
      did: clip(entry.text, 800),
      next: "The user decides what to apply.",
    });
  }
  const saved = answered.length ? saveProposals(root, mode, question, answered) : null;
  // Each model's answer keeps its own Markdown under a heading, the way the chat renders it.
  const replies = answered.map((entry) => `### ${entry.label}\n\n${cut(entry.text, 2000)}`);
  const problems = failed.map((entry) => `**${entry.label} did not answer:** ${clip(entry.text, 300)}`);
  return { text: [...replies, ...problems].join("\n\n"), actions: saved && modeInfo(mode).apply ? applyActions(saved) : [] };
}

function saveProposals(root: string, mode: BrainMode, question: string, answers: Answer[]): SavedProposals {
  const saved: SavedProposals = { id: crypto.randomUUID(), at: new Date().toISOString(), mode, question, answers };
  fs.writeFileSync(proposalsFile(root), JSON.stringify(saved, null, 2));
  return saved;
}

function applyActions(saved: SavedProposals): ChatAction[] {
  return saved.answers.map((answer) => ({ kind: "apply", debate: saved.id, provider: answer.provider, label: answer.label }));
}

/** For Review: what the writer changed last, so "review the latest change" has something to look at. */
function latestChangeLines(root: string): string[] {
  const last = listCheckpoints(root).filter((item) => !item.undone && item.files.length).at(-1);
  if (!last) return ["There is no recorded change by the code writer yet."];
  return [`The latest change by the code writer was for "${clip(last.task, 200)}". ${describeChange(last)}`];
}

/** The id of the newest appliable answers, so older Apply buttons can be shown as used up. */
export function latestDebateId(root: string): string | null {
  return readProposals(root)?.id ?? null;
}

const APPLY_WORDS: Partial<Record<BrainMode, { noun: string; task: (label: string) => string }>> = {
  debate: { noun: "proposal", task: (label) => `Apply ${label}'s proposal from the debate.` },
  plan: { noun: "plan", task: (label) => `Build ${label}'s plan, step by step.` },
  review: { noun: "review", task: (label) => `Fix the problems in ${label}'s review, most serious first.` },
  brainstorm: { noun: "ideas", task: (label) => `Build the best idea from ${label}'s brainstorm. Say which one you built and why.` },
  debug: { noun: "diagnosis", task: (label) => `Fix the bug the way ${label}'s diagnosis describes.` },
  test: { noun: "test plan", task: (label) => `Write the tests ${label} described.` },
};

/**
 * "Apply": the person picks one model's answer from the latest debate, plan, review, or brainstorm. It is saved
 * as a decision, and the code writer builds it, with Undo, exactly like a typed task.
 */
export async function applyProposal(root: string, debateId: string, provider: Provider, options: SubmitOptions = {}): Promise<BrainReply> {
  const saved = readProposals(root);
  if (!saved || saved.id !== debateId) throw new Error("Those answers are older than the latest ones. Ask again to apply them.");
  const answer = saved.answers.find((item) => item.provider === provider);
  if (!answer) throw new Error("That model did not answer this.");
  const words = APPLY_WORDS[saved.mode ?? "debate"] ?? APPLY_WORDS.debate!;
  const enabled = options.enabled ?? enabledModels(root);
  const writer = loadBrain(root).manifest.codeWriter;
  if (!writer) throw new Error("Choose who writes the code first (or Auto), then press Apply again.");
  const decision = { model: "user", decision: `For "${clip(saved.question, 200)}", go with ${answer.label}'s ${words.noun}.`, why: clip(answer.text, 500) };
  if (writer === "me") {
    addDecision(root, decision);
    return reply(`Saved as a decision. You write the code, so here is ${answer.label}'s ${words.noun} to apply:\n\n${answer.text}`);
  }
  const ready = await readyModels(enabled);
  const task = [words.task(answer.label), "", `The user asked: ${saved.question}`, "", `${answer.label}'s ${words.noun}:`, answer.text].join("\n");
  if (writer === "auto") {
    addDecision(root, decision);
    setNow(root, `${words.task(answer.label)} (${clip(saved.question, 120)})`);
    return runAuto(root, task, "work", enabled, options);
  }
  addDecision(root, decision);
  setNow(root, `${words.task(answer.label)} (${clip(saved.question, 120)})`);
  if (ready.some((account) => account.provider === writer)) return runWork(root, task, writer, options, "work");
  return runAuto(root, task, "work", enabled, options, `${writerLabel(writer)} is not signed in or is switched off, so the signed-in models picked the team.`);
}

export interface Team {
  builder: Provider;
  reviewer: Provider | null;
  why: string;
}

/** What each model is usually best at, for when the chooser's answer cannot be used. */
const BUILD_ORDER: Provider[] = ["claude", "cursor", "gpt", "gemini", "grok"];

/**
 * Reads the chooser's reply. Only models that are actually available count, the reviewer must differ from the
 * builder, and anything unusable falls back to a fixed order, so a confused chooser never stops the task.
 */
export function parseTeam(text: string, available: Provider[]): Team {
  const fallback = (): Team => {
    const builder = BUILD_ORDER.find((item) => available.includes(item)) ?? available[0];
    const reviewer = BUILD_ORDER.find((item) => available.includes(item) && item !== builder) ?? null;
    return { builder, reviewer, why: "Picked by the default order." };
  };
  const match = /\{[\s\S]*?\}/.exec(text);
  if (!match) return fallback();
  let raw: { builder?: unknown; reviewer?: unknown; why?: unknown };
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return fallback();
  }
  const pick = (value: unknown) => {
    const id = String(value ?? "").trim().toLowerCase();
    return available.find((item) => item === id || LABELS[item].toLowerCase() === id) ?? null;
  };
  const builder = pick(raw.builder);
  if (!builder) return fallback();
  const reviewer = pick(raw.reviewer);
  const why = typeof raw.why === "string" ? clip(raw.why, 200) : "";
  return { builder, reviewer: reviewer && reviewer !== builder ? reviewer : null, why };
}

/** One model reads the task and picks who builds and who reviews. With one model there is nothing to choose. */
async function chooseTeam(root: string, task: string, mode: BrainMode, models: AccountState[], options: SubmitOptions): Promise<Team> {
  const available = models.map((item) => item.provider);
  if (available.length === 1) return { builder: available[0], reviewer: null, why: "It is the only model signed in." };
  const chooser = BUILD_ORDER.map((provider) => models.find((item) => item.provider === provider)).find(Boolean) ?? models[0];
  options.onProgress?.("Team", `${chooser.label} is choosing who does what…`);
  const prompt = [
    "You assign jobs for one task in a software project. Do not do the task, and do not create, edit, or delete files.",
    `Signed-in models you may choose from: ${models.map((item) => `${item.provider} (${item.label})`).join(", ")}.`,
    `Mode: ${modeInfo(mode).label}. ${modeInfo(mode).summary}`,
    "",
    "Roles:",
    "- builder: does the task and may change files. Pick the model best suited to this kind of task.",
    "- reviewer: checks the builder's change afterwards without editing. A different model, or null for a trivial task.",
    "",
    'Reply with only one line of JSON: {"builder":"<id>","reviewer":"<id or null>","why":"<one short sentence>"}',
    "",
    "The task:",
    task,
  ].join("\n");
  try {
    return parseTeam(await askModel(chooser.provider, prompt, false, root, { timeoutMs: 2 * 60_000 }), available);
  } catch (error) {
    if (error instanceof StoppedError) throw error;
    return parseTeam("", available);
  }
}

/** Auto: the models pick a builder and a reviewer. The builder works with Undo; the reviewer checks the change. */
async function runAuto(
  root: string,
  task: string,
  mode: BrainMode,
  enabled: Record<ModelKey, boolean>,
  options: SubmitOptions,
  note = "",
  preset: Team | null = null,
): Promise<BrainReply> {
  const models = await readyModels(enabled);
  // With Auto mode, the router already picked the team in the same answer; no second question is needed.
  const team = preset ?? (await chooseTeam(root, task, mode, models, options));
  const builder = LABELS[team.builder];
  const reviewer = team.reviewer ? LABELS[team.reviewer] : null;
  const teamLine = `${note ? `${note}\n\n` : ""}**Team:** ${builder} ${mode === "debug" ? "fixes" : mode === "test" ? "writes the tests" : "builds"}${reviewer ? `, ${reviewer} reviews` : ""}.${team.why ? ` ${team.why}` : ""}`;
  const work = await runWork(root, task, team.builder, options, mode);
  // Review only real changes that finished; a stopped or failed task, or one that changed nothing, has nothing to check.
  const changed = work.actions.some((action) => action.kind === "undo");
  if (!team.reviewer || !reviewer || !changed || work.failed) return { text: `${teamLine}\n\n${work.text}`, actions: work.actions };
  const review = await askOrExplain(
    team.reviewer,
    reviewer,
    modePrompt(compileBrief(loadBrain(root), "any"), "review", `Review the change ${builder} just made for this task:\n${task}`, latestChangeLines(root)),
    root,
    options,
  );
  if (!review.ok) return { text: `${teamLine}\n\n${work.text}\n\n**${reviewer} could not review it:** ${clip(review.text, 300)}`, actions: work.actions };
  addHandoff(root, { model: team.reviewer, kind: "proposal", task: `Review ${builder}'s change: ${clip(task, 200)}`, did: clip(review.text, 800) });
  const saved = saveProposals(root, "review", task, [{ provider: team.reviewer, label: reviewer, text: review.text }]);
  return {
    text: `${teamLine}\n\n${work.text}\n\n### ${reviewer}'s review\n\n${cut(review.text, 2000)}`,
    actions: [...work.actions, ...applyActions(saved)],
  };
}

export interface Route {
  mode: Exclude<BrainMode, "auto">;
  why: string;
  team: Team | null;
}

const ROUTABLE = MODES.filter((item) => item.id !== "auto");

/**
 * When the router's answer cannot be used, the wording decides. Debate is never guessed: it asks every model twice,
 * so only a model that read the message may choose it.
 */
export function guessMode(task: string): Exclude<BrainMode, "auto"> {
  const text = task.toLowerCase();
  if (/\b(error|bug|crash|crashes|broken|fails?|failing|not working|doesn'?t work|exception|traceback|wrong)\b/.test(text)) return "debug";
  if (/\b(write|add|create|run)\b.*\btests?\b|\bunit tests?\b|\btest coverage\b/.test(text)) return "test";
  if (/\breview\b|\bcheck (my|the|this) (code|change)/.test(text)) return "review";
  if (/\b(plan|roadmap|steps to|how should (i|we) (build|add|structure))\b/.test(text)) return "plan";
  if (/\b(ideas?|brainstorm|suggestions?)\b/.test(text)) return "brainstorm";
  if (/^(what|why|how|explain|where|which|who|when)\b|\?\s*$/.test(text.trim())) return "explain";
  return "work";
}

/** Reads the router's one-line JSON. A bad or missing mode falls back to the wording; the team is optional. */
export function parseRoute(text: string, available: Provider[], task: string): Route {
  const match = /\{[\s\S]*?\}/.exec(text);
  let raw: { mode?: unknown; why?: unknown; builder?: unknown } = {};
  if (match) {
    try {
      raw = JSON.parse(match[0]);
    } catch {
      raw = {};
    }
  }
  const named = String(raw.mode ?? "").trim().toLowerCase();
  const picked = ROUTABLE.find((item) => item.id === named || item.label.toLowerCase() === named);
  const mode = picked ? (picked.id as Exclude<BrainMode, "auto">) : guessMode(task);
  const why = picked && typeof raw.why === "string" && raw.why.trim() ? clip(raw.why, 200) : "Picked from the wording of the message.";
  // The reason is shown once, on the "Auto picked" line, so the team line does not repeat it.
  const team = raw.builder ? { ...parseTeam(match![0], available), why: "" } : null;
  return { mode, why, team };
}

/** One model reads the message, picks the mode, and (for a writer mode) who builds and who reviews. */
async function routeMessage(root: string, task: string, models: AccountState[], options: SubmitOptions): Promise<Route> {
  const available = models.map((item) => item.provider);
  const router = BUILD_ORDER.map((provider) => models.find((item) => item.provider === provider)).find(Boolean) ?? models[0];
  options.onProgress?.("Auto", `${router.label} is choosing how to handle this…`);
  const prompt = [
    "You decide how to handle one message in a software project. Do not answer it, and do not create, edit, or delete files.",
    "Pick exactly one mode:",
    ...ROUTABLE.map((item) => `- ${item.id}: ${item.summary}`),
    "Prefer the cheapest mode that fits. Pick debate only when the user is choosing between options and wants several opinions; it asks every model twice.",
    "For work, debug, or test, also pick a builder (does it and may change files) and a reviewer (checks the change, a different model, or null).",
    `Signed-in models: ${models.map((item) => `${item.provider} (${item.label})`).join(", ")}.`,
    "",
    'Reply with only one line of JSON: {"mode":"<mode>","builder":"<id or null>","reviewer":"<id or null>","why":"<one short sentence for the user>"}',
    "",
    "The message:",
    task,
  ].join("\n");
  try {
    return parseRoute(await askModel(router.provider, prompt, false, root, { timeoutMs: 2 * 60_000 }), available, task);
  } catch (error) {
    if (error instanceof StoppedError) throw error;
    return { mode: guessMode(task), why: "Picked from the wording of the message.", team: null };
  }
}

const BRIEF_HANDOFFS = 8;

/** Asks one signed-in model to fold older handoffs into a short summary that every brief includes. */
export async function summarizeMemory(root: string, options: SubmitOptions = {}): Promise<string> {
  const snap = loadBrain(root);
  const older = snap.handoffs.slice(0, -BRIEF_HANDOFFS);
  if (!older.length) return "Nothing to summarize yet. Every handoff already fits in the brief.";
  const pick = await pickModel(null, options.enabled ?? enabledModels(root));
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

/** The writer if it is a signed-in, switched-on model; otherwise the first one that is. */
async function pickModel(writer: Writer | null, enabled: Record<ModelKey, boolean>): Promise<AccountState> {
  const accounts = await accountStates();
  const order = isModel(writer) ? [writer, ...MODELS.filter((item) => item !== writer)] : MODELS;
  const pick = order.map((provider) => accounts.find((account) => account.provider === provider)).find((account) => account?.loggedIn && enabled[account.provider]);
  if (!pick) throw new Error("Sign in to a model first and make sure it is switched on in Integrations.");
  return pick;
}

/** Dexter needs two models: one to work and one to check, debate, or review. Any two will do. */
export const MIN_MODELS = 2;

async function readyModels(enabled: Record<ModelKey, boolean>): Promise<AccountState[]> {
  const accounts = await accountStates();
  const ready = accounts.filter((account) => account.loggedIn && enabled[account.provider]);
  if (ready.length >= MIN_MODELS) return ready;
  const now = ready.length ? ` Ready now: ${ready.map((account) => account.label).join(", ")}.` : "";
  const off = accounts.filter((account) => account.loggedIn && !enabled[account.provider]).map((account) => account.label);
  const hint = off.length ? ` ${off.join(", ")} ${off.length === 1 ? "is" : "are"} signed in but switched off in Integrations.` : "";
  throw new Error(`Sign in to at least ${MIN_MODELS} models to use Dexter. Any ${MIN_MODELS} work: Cursor, Claude, ChatGPT, Grok, or Gemini.${now}${hint}`);
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

function isModel(writer: Writer | null): writer is Provider {
  return writer === "cursor" || writer === "claude" || writer === "gpt" || writer === "grok" || writer === "gemini";
}

function readProposals(root: string): SavedProposals | null {
  try {
    return JSON.parse(fs.readFileSync(proposalsFile(root), "utf8")) as SavedProposals;
  } catch {
    return null;
  }
}

// Kept as debate.json so Apply buttons from before modes existed still work.
function proposalsFile(root: string): string {
  return path.join(brainDir(root), "debate.json");
}

function reply(text: string): BrainReply {
  return { text, actions: [] };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Shortens for display but keeps line breaks, so lists and tables still render. */
function cut(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}
