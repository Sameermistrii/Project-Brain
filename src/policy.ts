export const WRITERS = ["cursor", "claude", "gpt", "grok", "me"] as const;

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
    case "me":
      return "You";
    default:
      return "Nobody yet";
  }
}

export function writerPolicy(writer: Writer | null, audience: Audience): string {
  if (!writer) {
    return [
      "Who writes code: not chosen.",
      "The user decides who writes code. Do not create, edit, or delete project files until the user picks Cursor, Claude, ChatGPT, Grok, or themselves.",
      "Answer with a proposal only, then record a handoff.",
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
