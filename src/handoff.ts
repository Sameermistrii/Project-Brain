export interface ParsedHandoff {
  did: string;
  files: string[];
  next: string;
  decision: string;
}

const FENCE = /```handoff\s*\r?\n([\s\S]*?)```/i;

export function parseHandoffBlock(text: string): ParsedHandoff | null {
  const match = FENCE.exec(text);
  if (!match) return null;
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const eq = line.indexOf(":");
    if (eq <= 0) continue;
    fields.set(line.slice(0, eq).trim().toLowerCase(), line.slice(eq + 1).trim());
  }
  const did = fields.get("did") ?? "";
  if (!did || did.toLowerCase() === "none") return null;
  const filesRaw = fields.get("files") ?? "";
  const files =
    !filesRaw || filesRaw.toLowerCase() === "none"
      ? []
      : filesRaw.split(",").map((file) => file.trim()).filter(Boolean);
  const next = clean(fields.get("next"));
  const decision = clean(fields.get("decisions"));
  return { did, files, next, decision };
}

export function visibleAnswer(text: string): string {
  return text.replace(FENCE, "").trim();
}

function clean(value: string | undefined): string {
  const text = (value ?? "").trim();
  if (!text || text.toLowerCase() === "none") return "";
  return text;
}

export function askSystem(brief: string): string {
  return [
    "You are one model working on a shared project. Other models see the same project brain.",
    "Follow the code-writer rule in the brief. The user chooses who writes code. Do not take that role yourself.",
    "",
    brief,
    "",
    "Finish your reply with this fence, filled in:",
    "```handoff",
    "did: what you actually did, in one paragraph",
    "files: comma-separated paths, or none",
    "next: what should happen next, or none",
    "decisions: one decision worth keeping, or none",
    "```",
    "If you are not the code writer, files must be paths you propose, and did must not claim the files were changed.",
  ].join("\n");
}
