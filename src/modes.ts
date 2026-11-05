/**
 * Modes decide who answers a message and what they are told to do.
 *
 * - writer: the code writer does it, may edit files, and the change can be undone.
 * - solo: one model answers and edits nothing (the writer if it is a model, else the first signed-in model).
 * - panel: every signed-in model answers once and edits nothing. Each answer gets an Apply button.
 * - debate: every signed-in model answers, then replies to the others. Each answer gets an Apply button.
 *
 * `summary` and `example` are shown to the person. `instructions` are given to the models.
 */

export type BrainMode = "auto" | "work" | "debug" | "test" | "plan" | "explain" | "review" | "brainstorm" | "debate";
/** "auto" is not a way of answering: one model reads the message and picks one of the other modes. */
export type ModeRunner = "auto" | "writer" | "solo" | "panel" | "debate";

export interface ModeInfo {
  id: BrainMode;
  label: string;
  runner: ModeRunner;
  /** Whether the answers can be handed to the writer with an Apply button. */
  apply: boolean;
  summary: string;
  example: string;
  instructions: string[];
}

const READ_ONLY = "You can read files in this project. Do not create, edit, or delete files.";

export const MODES: ModeInfo[] = [
  {
    id: "auto",
    label: "Auto",
    runner: "auto",
    apply: false,
    summary:
      "The models read your message and pick the mode themselves: Work, Debug, Test, Plan, Explain, Review, Brainstorm, or Debate. With Writes on Auto, the same step picks who builds and who reviews.",
    example: "The login page crashes after I added Google sign-in",
    instructions: [],
  },
  {
    id: "work",
    label: "Work",
    runner: "writer",
    apply: false,
    summary: "The code writer does the task and may change files. Undo puts them back.",
    example: "Add a dark mode toggle to the settings page",
    instructions: ["Do the task."],
  },
  {
    id: "debug",
    label: "Debug",
    runner: "writer",
    apply: false,
    summary: "The code writer finds the root cause of a bug and fixes it with the smallest change. Describe what goes wrong and what you expected.",
    example: "Clicking Save shows a blank page instead of the form",
    instructions: [
      "This is a bug report. Work like a careful debugger:",
      "1. Restate the symptom in one line.",
      "2. Find the root cause by reading the code. Run the app or its tests if that helps confirm it.",
      "3. Fix the cause, not the symptom, with the smallest change that works. Do not refactor unrelated code.",
      "4. Reply with three short sections: **Cause**, **Fix**, **How to check it**.",
      "If you cannot find the cause, change nothing and say what you checked and what to try next.",
    ],
  },
  {
    id: "test",
    label: "Test",
    runner: "writer",
    apply: false,
    summary: "The code writer adds or updates automated tests for what you name, runs them, and reports the results.",
    example: "Write tests for the login form validation",
    instructions: [
      "Add or update automated tests for what the user names.",
      "Use the project's existing test framework, folders, and style. If there is none, pick the standard one for this language and say so.",
      "Run the tests. Do not change product code unless a test exposes a real bug; if it does, say so plainly.",
      "Reply with: **Tests added**, **How to run them**, **Results**.",
    ],
  },
  {
    id: "plan",
    label: "Plan",
    runner: "solo",
    apply: true,
    summary: "One model reads the code and writes a step-by-step plan. Nothing changes. Press Apply to have the writer build it.",
    example: "Plan how to add user accounts with email login",
    instructions: [
      READ_ONLY,
      "Read the relevant code, then write a plan the code writer can follow.",
      "Use a numbered list of steps. For each step: the files to change and what changes in them.",
      "End with **Risks** and **How to check it works**. Keep it under 300 words.",
    ],
  },
  {
    id: "explain",
    label: "Explain",
    runner: "solo",
    apply: false,
    summary: "One model explains code, an error, or an idea in plain words, with the file paths it lives in. Nothing changes.",
    example: "How does sign-in work in this project?",
    instructions: [
      READ_ONLY,
      "Explain it for someone who may not write code: what it is, how it works, and where it lives (file paths).",
      "Use short paragraphs and a small example if it helps. Avoid jargon, or define it in a few words. Keep it under 300 words.",
    ],
  },
  {
    id: "review",
    label: "Review",
    runner: "panel",
    apply: true,
    summary: "Every signed-in model reviews the code you point to, or the writer's latest change. Nothing changes. Apply a review to have the writer fix it.",
    example: "Review the latest change",
    instructions: [
      READ_ONLY,
      "Review the code the user points to. If they do not name any, review the latest change listed below.",
      "List problems from most to least serious: bugs, security, data loss, performance, then smaller issues.",
      "For each: the file (and line if you can), what is wrong, and a one-line fix.",
      "If you find nothing that matters, say **No problems found**. Keep it under 250 words.",
    ],
  },
  {
    id: "brainstorm",
    label: "Brainstorm",
    runner: "panel",
    apply: true,
    summary: "Every signed-in model gives a few distinct ideas, each with why and the main risk. Nothing changes. Apply the ideas you like.",
    example: "Ideas to get our first 100 users",
    instructions: [
      READ_ONLY,
      "Give 3 to 5 distinct ideas that fit this project. Make them concrete, not generic advice.",
      "For each idea: a bold title, one line on why it works, and one line on the main risk.",
      "Keep it under 250 words.",
    ],
  },
  {
    id: "debate",
    label: "Debate",
    runner: "debate",
    apply: true,
    summary: "Every signed-in model takes a position, then answers the others. Nothing changes. Apply the answer you agree with.",
    example: "Should we use Postgres or MongoDB for this app?",
    instructions: [READ_ONLY, "Give one position in 120 words or fewer."],
  },
];

export function isMode(value: unknown): value is BrainMode {
  return MODES.some((mode) => mode.id === value);
}

export function modeInfo(mode: BrainMode): ModeInfo {
  return MODES.find((item) => item.id === mode) ?? MODES[0];
}

/** The prompt for one model in a writer, solo, or panel mode. */
export function modePrompt(brief: string, mode: BrainMode, task: string, extra: string[] = []): string {
  const info = modeInfo(mode);
  return [
    brief,
    "",
    `Mode: ${info.label}.`,
    ...info.instructions,
    "Reply in Markdown. Dexter records the handoff for you, so do not record a handoff yourself or mention one.",
    ...(extra.length ? ["", ...extra] : []),
    "",
    "The user's message:",
    task,
  ].join("\n");
}
