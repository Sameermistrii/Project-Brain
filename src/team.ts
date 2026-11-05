import { execFile } from "node:child_process";
import path from "node:path";

/**
 * Team memory through the folder's own Git repository. Shared: goal, now, summary, decisions, handoffs, manifest.
 * Personal (ignored by .brain/.gitignore): chats, Undo history, the writer and mode, the last debate, usage.
 */

export interface TeamStatus {
  inGit: boolean;
  remote: string;
  branch: string;
}

export async function teamStatus(root: string): Promise<TeamStatus> {
  try {
    await git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return { inGit: false, remote: "", branch: "" };
  }
  // symbolic-ref works before the first commit too; it is empty on a detached HEAD.
  const branch = (await git(root, ["symbolic-ref", "--short", "-q", "HEAD"]).catch(() => "")).trim();
  const remote = (await git(root, ["remote", "get-url", "origin"]).catch(() => "")).trim();
  return { inGit: true, remote, branch };
}

/**
 * Commits only the shared memory files, pulls teammates' memory, and pushes. It never commits code, and
 * any Git problem (a conflict, no remote, not signed in to Git) is reported instead of forced.
 */
export async function syncMemory(root: string): Promise<string> {
  const status = await teamStatus(root);
  if (!status.inGit) return "This folder is not a Git repository. Team memory is shared through Git, so run git init and add a remote first.";
  const brain = path.join(".brain");
  await git(root, ["add", "--", brain]);
  const staged = (await git(root, ["diff", "--cached", "--name-only", "--", brain])).trim();
  // `git commit -- <path>` commits only that path, leaving anything else the person staged alone.
  if (staged) await git(root, ["commit", "--quiet", "-m", "Update project memory", "--", brain]);
  if (!status.remote) return staged ? "Saved the memory in Git. Add a remote named origin to share it with your team." : "Nothing new to share, and there is no remote yet.";
  // A new remote has no branch yet, and a new clone may have no upstream, so name both sides explicitly.
  const branch = status.branch && status.branch !== "HEAD" ? status.branch : "";
  if (!branch) return "Saved the memory in Git, but this folder is not on a branch. Check out a branch to share it.";
  const remoteHasBranch = (await git(root, ["ls-remote", "--heads", "origin", branch]).catch(() => "")).trim().length > 0;
  if (remoteHasBranch) {
    try {
      await git(root, ["pull", "--no-rebase", "--no-edit", "--quiet", "origin", branch]);
    } catch (error) {
      return `Saved your memory, but pulling your team's failed: ${message(error)}`;
    }
  }
  try {
    await git(root, ["push", "--quiet", "-u", "origin", branch]);
  } catch (error) {
    return `Got your team's memory, but pushing yours failed: ${message(error)}`;
  }
  return staged ? "Shared your memory and got your team's." : "Got your team's latest memory. You had nothing new to share.";
}

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split(/\r?\n/).filter(Boolean).slice(0, 2).join(" ");
}

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: root, windowsHide: true, timeout: 60_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim()));
      else resolve(stdout);
    });
  });
}
