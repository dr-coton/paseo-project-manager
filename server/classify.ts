import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import type { StateReason, WorkspaceState, WorkspaceSummary } from "../shared/contracts";
import type { Agent, Workspace } from "./data";

const run = promisify(execFile);

type ClassifyAgent = Pick<
  Agent,
  "status" | "pendingPermissions" | "requiresAttention" | "attentionReason" | "attentionTimestamp" | "updatedAt"
>;

export interface Classification {
  state: WorkspaceState;
  reason: StateReason | null;
  ackable: boolean;
}

function latestTime(values: readonly (string | null | undefined)[]): number | null {
  const times = values
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  return times.length ? Math.max(...times) : null;
}

/**
 * Board state from the workspace and its agents, most urgent first: a question or permission
 * request needs review, a working agent means developing, an unread finish or an error needs
 * review unless acknowledged after it happened, anything else is idle.
 */
export function classify(
  workspace: Pick<Workspace, "status" | "statusEnteredAt">,
  agents: readonly ClassifyAgent[],
  ackAt: number | null = null,
): Classification {
  if (workspace.status === "needs_input" || agents.some((agent) => agent.pendingPermissions.length > 0)) {
    return { state: "review", reason: "question", ackable: false };
  }
  if (
    workspace.status === "running" ||
    agents.some((agent) => agent.status === "running" || agent.status === "initializing")
  ) {
    return { state: "developing", reason: "working", ackable: false };
  }
  const erroredAgents = agents.filter((agent) => agent.status === "error" || agent.attentionReason === "error");
  const finishedAgents = agents.filter((agent) => agent.requiresAttention);
  const errored = workspace.status === "failed" || erroredAgents.length > 0;
  if (errored || workspace.status === "attention" || finishedAgents.length > 0) {
    const happenedAt = latestTime([
      workspace.status === "failed" || workspace.status === "attention" ? workspace.statusEnteredAt : null,
      ...finishedAgents.map((agent) => agent.attentionTimestamp),
      ...erroredAgents.map((agent) => agent.attentionTimestamp ?? agent.updatedAt),
    ]);
    if (ackAt !== null && (happenedAt === null || ackAt >= happenedAt)) {
      return { state: "idle", reason: null, ackable: false };
    }
    return { state: "review", reason: errored ? "error" : "finished", ackable: true };
  }
  return { state: "idle", reason: null, ackable: false };
}

// Archiving a Paseo worktree deletes its directory. Branches and commits survive, uncommitted
// files do not, so a worktree with local changes is never archived by this plugin.
async function hasUncommittedChanges(directory: string): Promise<boolean> {
  try {
    await access(directory);
  } catch {
    return false;
  }
  try {
    const { stdout } = await run("git", ["-C", directory, "status", "--porcelain"], { timeout: 8000 });
    return stdout.trim().length > 0;
  } catch {
    return true;
  }
}

export async function protectionFor(
  workspace: Workspace,
  state: WorkspaceState,
): Promise<WorkspaceSummary["protectedBy"]> {
  if (workspace.pinnedAt) return "pinned";
  if (state !== "idle") return "not_idle";
  if (workspace.workspaceKind === "worktree" && (await hasUncommittedChanges(workspace.workspaceDirectory))) {
    return "dirty_worktree";
  }
  return null;
}
