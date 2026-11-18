import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const STALE_DAY_OPTIONS = [1, 3, 7, 14, 30, 60, 90] as const;

// Shared through the daemon so every client of the host sees the same order and hidden list.
export const layoutSettings = defineSettings({
  id: "layout",
  scope: "host",
  version: 1,
  schema: z.object({
    order: z.array(z.string()).default([]),
    hidden: z.array(z.string()).default([]),
    staleDays: z.number().int().positive().default(14),
  }),
});

// Board columns. Users move idle <-> archived; the other states follow the agents.
export const workspaceState = z.enum(["idle", "developing", "review", "archived"]);

// Why a workspace is in its column. RPCs return codes; the client translates them.
export const stateReason = z.enum(["question", "working", "error", "finished"]);

// Why a workspace may not be archived. Only idle workspaces can be archived.
export const protectReason = z.enum(["pinned", "not_idle", "dirty_worktree"]);

export const skipReason = z.enum(["missing", "pinned", "not_idle", "dirty_worktree", "failed"]);

export const projectSummary = z.object({
  id: z.string(),
  name: z.string(),
  activeCount: z.number(),
});

export const workspaceSummary = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  name: z.string(),
  kind: z.string(),
  background: z.boolean(),
  ageDays: z.number().nullable(),
  stale: z.boolean(),
  state: workspaceState,
  reason: stateReason.nullable(),
  /** In review only because of a finish or an error, so "acknowledge all" can clear it. */
  ackable: z.boolean(),
  protectedBy: protectReason.nullable(),
});

export const archivedSummary = z.object({
  id: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  name: z.string(),
  archivedAt: z.string(),
});

export const overviewRpc = defineRpc({
  name: "overview.get",
  input: z.object({ staleDays: z.number().int().positive() }),
  output: z.object({
    projects: z.array(projectSummary),
    workspaces: z.array(workspaceSummary),
  }),
});

export const boardRpc = defineRpc({
  name: "board.get",
  input: z.object({}),
  output: z.object({
    active: z.array(workspaceSummary),
    archived: z.array(archivedSummary),
  }),
});

export const countsRpc = defineRpc({
  name: "board.counts",
  input: z.object({}),
  output: z.object({ review: z.number(), developing: z.number(), idle: z.number() }),
});

export const ackRpc = defineRpc({
  name: "workspaces.ack",
  input: z.object({ workspaceIds: z.array(z.string()).min(1).max(500) }),
  output: z.object({ acknowledged: z.array(z.string()) }),
});

export const archiveRpc = defineRpc({
  name: "workspaces.archive",
  input: z.object({ workspaceIds: z.array(z.string()).min(1).max(500) }),
  output: z.object({
    archived: z.array(z.string()),
    skipped: z.array(
      z.object({ id: z.string(), reason: skipReason, detail: z.string().nullable() }),
    ),
  }),
});

export const deleteProjectRpc = defineRpc({
  name: "projects.delete",
  input: z.object({ projectId: z.string() }),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), projectId: z.string(), closedWorkspaces: z.number() }),
    z.object({
      ok: z.literal(false),
      reason: z.enum(["not_found", "busy"]),
      developing: z.number(),
      asking: z.number(),
    }),
  ]),
});

export type WorkspaceSummary = z.infer<typeof workspaceSummary>;
export type ArchivedSummary = z.infer<typeof archivedSummary>;
export type WorkspaceState = z.infer<typeof workspaceState>;
export type StateReason = z.infer<typeof stateReason>;
export type SkipReason = z.infer<typeof skipReason>;
export type LayoutValues = z.infer<typeof layoutSettings.schema>;

/** Known projects in the saved order; projects missing from the saved order follow by name. */
export function orderProjectIds(
  savedOrder: readonly string[],
  projects: readonly { id: string; name: string }[],
): string[] {
  const known = new Set(projects.map((project) => project.id));
  const ordered = savedOrder.filter((id) => known.has(id));
  const placed = new Set(ordered);
  const rest = projects
    .filter((project) => !placed.has(project.id))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((project) => project.id);
  return [...ordered, ...rest];
}
