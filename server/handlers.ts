import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import type {
  ackRpc,
  archiveRpc,
  boardRpc,
  countsRpc,
  deleteProjectRpc,
  layoutSettings,
  overviewRpc,
  SkipReason,
  WorkspaceState,
  WorkspaceSummary,
} from "../shared/contracts";
import { readAcks, writeAcks } from "./acks";
import { classify, protectionFor } from "./classify";
import { paseoCli } from "./cli";
import { listActiveWorkspaces, listAgentsByWorkspace, readArchivedRecords, type PaseoApi, type Workspace } from "./data";

const DAY_MS = 24 * 60 * 60 * 1000;

function ageInDays(workspace: Workspace, now: number): number | null {
  const times = [workspace.activityAt, workspace.lastUserMessageAt, workspace.createdAt]
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  return times.length ? Math.floor((now - Math.max(...times)) / DAY_MS) : null;
}

/**
 * Active workspaces with their board state. `protect` decides which ones get the archive
 * safety check, which may run `git status`: stale ones for the cleanup list, idle ones for
 * the board, none for counts.
 */
async function summarize(
  paseo: PaseoApi,
  options: { staleDays: number | null; protect: "stale" | "idle" | "none" },
): Promise<WorkspaceSummary[]> {
  const now = Date.now();
  const [active, agents, acks] = await Promise.all([
    listActiveWorkspaces(paseo),
    listAgentsByWorkspace(paseo),
    readAcks(),
  ]);
  return Promise.all(
    active.map(async (workspace): Promise<WorkspaceSummary> => {
      const ageDays = ageInDays(workspace, now);
      const stale = options.staleDays !== null && (ageDays === null || ageDays >= options.staleDays);
      const { state, reason, ackable } = classify(
        workspace,
        agents.get(workspace.id) ?? [],
        acks.get(workspace.id) ?? null,
      );
      const check = options.protect === "stale" ? stale : options.protect === "idle" && state === "idle";
      return {
        id: workspace.id,
        projectId: workspace.projectId,
        projectName: workspace.projectDisplayName,
        name: workspace.title || workspace.name,
        kind: workspace.workspaceKind,
        background: workspace.background ?? false,
        ageDays,
        stale,
        state,
        reason,
        ackable,
        protectedBy: check ? await protectionFor(workspace, state) : state === "idle" ? null : "not_idle",
      };
    }),
  );
}

export async function getOverview(
  { staleDays }: RpcInput<typeof overviewRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof overviewRpc>> {
  const [projectList, workspaces] = await Promise.all([
    paseo.projects.list(),
    summarize(paseo, { staleDays, protect: "stale" }),
  ]);
  const activeByProject = new Map<string, number>();
  for (const item of workspaces) {
    activeByProject.set(item.projectId, (activeByProject.get(item.projectId) ?? 0) + 1);
  }
  return {
    projects: projectList.projects.map((project) => ({
      id: project.projectId,
      name: project.projectDisplayName,
      activeCount: activeByProject.get(project.projectId) ?? 0,
    })),
    workspaces: workspaces.sort((left, right) => (right.ageDays ?? 1e9) - (left.ageDays ?? 1e9)),
  };
}

export async function getBoard(
  _input: RpcInput<typeof boardRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof boardRpc>> {
  const [projectList, active, archived] = await Promise.all([
    paseo.projects.list(),
    summarize(paseo, { staleDays: null, protect: "idle" }),
    readArchivedRecords(),
  ]);
  const projectNames = new Map(
    projectList.projects.map((project) => [project.projectId, project.projectDisplayName]),
  );
  const activeIds = new Set(active.map((item) => item.id));
  return {
    active: active.sort((left, right) => (left.ageDays ?? 1e9) - (right.ageDays ?? 1e9)),
    archived: archived
      // Records of deleted projects stay in the registry but cannot be restored; leave them out.
      .filter((record) => !activeIds.has(record.workspaceId) && projectNames.has(record.projectId))
      .map((record) => ({
        id: record.workspaceId,
        projectId: record.projectId,
        projectName: projectNames.get(record.projectId) ?? "",
        name: record.name,
        archivedAt: record.archivedAt,
      }))
      .sort((left, right) => right.archivedAt.localeCompare(left.archivedAt)),
  };
}

export function createCountsHandler(settings: PluginSettings<typeof layoutSettings.schema>) {
  return async (
    _input: RpcInput<typeof countsRpc>,
    { paseo }: PluginHandlerContext,
  ): Promise<RpcOutput<typeof countsRpc>> => {
    const [items, current] = await Promise.all([
      summarize(paseo, { staleDays: null, protect: "none" }),
      settings.read(),
    ]);
    const hidden = new Set(current.status === "ready" ? current.values.hidden : []);
    const visible = items.filter((item) => !item.background && !hidden.has(item.projectId));
    const count = (state: WorkspaceState) => visible.filter((item) => item.state === state).length;
    return { review: count("review"), developing: count("developing"), idle: count("idle") };
  };
}

export async function acknowledgeWorkspaces(
  { workspaceIds }: RpcInput<typeof ackRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof ackRpc>> {
  const items = await summarize(paseo, { staleDays: null, protect: "none" });
  const requested = new Set(workspaceIds);
  const acknowledged = items
    .filter((item) => requested.has(item.id) && item.state === "review" && item.ackable)
    .map((item) => item.id);
  if (acknowledged.length) {
    await writeAcks(acknowledged, new Date(), new Set(items.map((item) => item.id)));
  }
  return { acknowledged };
}

export async function archiveWorkspaces(
  { workspaceIds }: RpcInput<typeof archiveRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof archiveRpc>> {
  const archived: string[] = [];
  const skipped: { id: string; reason: SkipReason; detail: string | null }[] = [];
  const [workspaces, agents, acks] = await Promise.all([
    listActiveWorkspaces(paseo),
    listAgentsByWorkspace(paseo),
    readAcks(),
  ]);
  const active = new Map(workspaces.map((item) => [item.id, item]));

  // One at a time: each archive stops agents, terminals and setup before removing a worktree.
  for (const id of new Set(workspaceIds)) {
    const workspace = active.get(id);
    if (!workspace) {
      skipped.push({ id, reason: "missing", detail: null });
      continue;
    }
    const { state } = classify(workspace, agents.get(id) ?? [], acks.get(id) ?? null);
    const protectedBy = await protectionFor(workspace, state);
    if (protectedBy) {
      skipped.push({ id, reason: protectedBy, detail: null });
      continue;
    }
    try {
      const result = await paseo.workspaces.archive(id);
      if (result.error) skipped.push({ id, reason: "failed", detail: result.error });
      else archived.push(id);
    } catch (error) {
      skipped.push({ id, reason: "failed", detail: error instanceof Error ? error.message : String(error) });
    }
  }
  console.log(`archived ${archived.length}, skipped ${skipped.length}`);
  return { archived, skipped };
}

/**
 * Removes a project from Paseo the way `paseo project delete` does: its workspaces are
 * archived and their agents and terminals closed. Files on disk, including worktree folders,
 * are left alone. Refused while an agent is working or waiting on a question.
 */
export async function deleteProject(
  { projectId }: RpcInput<typeof deleteProjectRpc>,
  { paseo }: PluginHandlerContext,
): Promise<RpcOutput<typeof deleteProjectRpc>> {
  const [projectList, items] = await Promise.all([
    paseo.projects.list(),
    summarize(paseo, { staleDays: null, protect: "none" }),
  ]);
  if (!projectList.projects.some((project) => project.projectId === projectId)) {
    return { ok: false, reason: "not_found", developing: 0, asking: 0 };
  }
  const own = items.filter((item) => item.projectId === projectId);
  const developing = own.filter((item) => item.state === "developing").length;
  const asking = own.filter((item) => item.reason === "question").length;
  if (developing || asking) return { ok: false, reason: "busy", developing, asking };

  await paseoCli(["project", "delete", projectId, "--json"]);
  console.log(`deleted project ${projectId} (${own.length} workspaces closed)`);
  return { ok: true, projectId, closedWorkspaces: own.length };
}
