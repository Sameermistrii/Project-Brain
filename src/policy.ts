/** "auto": the app picks a builder and a reviewer for each task among the signed-in models. */
export const WRITERS = ["cursor", "claude", "gpt", "grok", "gemini", "me", "auto"] as const;

export type Writer = (typeof WRITERS)[number];

/** Who is reading the brief. "any" is the paste pack for a browser chat. */
export type Audience = Writer | "any";

export function isWriter(value: unknown): value is Writer {
  return typeof value === "string" && (WRITERS as readonly string[]).includes(value);
}

export function writerLabel(writer: Writer | null): string {
  switch (writer) {
    case "cursor":
      return "Cursor";
    case "claude":
      return "Claude";
    case "gpt":
      return "ChatGPT";
    case "grok":
      return "Grok";
    case "gemini":
      return "Gemini";
    case "me":
      return "You";
    case "auto":
      return "Auto";
    default:
      return "Nobody yet";
  }
}

export function writerPolicy(writer: Writer | null, audience: Audience): string {
  if (!writer) {
    return [
      "Who writes code: not chosen.",
      "The user decides who writes code. Do not create, edit, or delete project files until the user picks Cursor, Claude, ChatGPT, Grok, Gemini, Auto, or themselves.",
      "Answer with a proposal only, then record a handoff.",
    ].join("\n");
  }

  if (writer === "auto") {
    return [
      "Who writes code: the app picks a model for each task.",
      "Only a model whose task message says it may edit files can change them. Otherwise do not create, edit, or delete project files; propose changes instead.",
    ].join("\n");
  }

  const label = writerLabel(writer);
  if (writer === "me") {
    return [
      "Who writes code: the user.",
      "Do not create, edit, or delete project files. Describe the change so the user can apply it, then record a handoff as a proposal.",
    ].join("\n");
  }

  if (audience === writer) {
    return [
      `Who writes code: ${label}.`,
      "The user chose you to write code. You may edit project files for the current task.",
      "Other models may only propose. When you finish, record a handoff of the files you changed.",
    ].join("\n");
  }

  return [
    `Who writes code: ${label}.`,
    `${label} is the only one who should edit project files.`,
    "Do not create, edit, or delete project files. Write a proposal the code writer can apply, then record a handoff.",
  ].join("\n");
}

/** A model may record a change only when the user assigned code writing to that model. */
export function handoffKindFor(writer: Writer | null, model: string): "change" | "proposal" {
  if (writer && writer !== "me" && writer === model) return "change";
  return "proposal";
}
