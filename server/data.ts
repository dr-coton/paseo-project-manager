import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { paseoHome } from "./acks";

export type PaseoApi = PluginHandlerContext["paseo"];
export type Workspace = Awaited<ReturnType<PaseoApi["workspaces"]["list"]>>["entries"][number];
export type Agent = Awaited<ReturnType<PaseoApi["agents"]["list"]>>["entries"][number]["agent"];

const PAGE = 200;

export async function listActiveWorkspaces(paseo: PaseoApi): Promise<Workspace[]> {
  const entries: Workspace[] = [];
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      filter: { includeBackground: true },
      page: { limit: PAGE, ...(cursor ? { cursor } : {}) },
    });
    entries.push(...page.entries);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return entries.filter((workspace) => !workspace.archivingAt);
}

export async function listAgentsByWorkspace(paseo: PaseoApi): Promise<Map<string, Agent[]>> {
  const byWorkspace = new Map<string, Agent[]>();
  let cursor: string | undefined;
  do {
    const page = await paseo.agents.list({
      filter: { includeBackground: true },
      page: { limit: PAGE, ...(cursor ? { cursor } : {}) },
    });
    for (const { agent } of page.entries) {
      if (agent.archivedAt || !agent.workspaceId) continue;
      const list = byWorkspace.get(agent.workspaceId) ?? [];
      list.push(agent);
      byWorkspace.set(agent.workspaceId, list);
    }
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return byWorkspace;
}

export interface ArchivedRecord {
  workspaceId: string;
  projectId: string;
  name: string;
  archivedAt: string;
}

/**
 * Archived workspaces are not in the plugin API; Paseo keeps them in its registry file for
 * recovery. The daemon caches and rewrites that file, so it is only ever read here.
 */
export async function readArchivedRecords(): Promise<ArchivedRecord[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(paseoHome(), "projects", "workspaces.json"), "utf8"),
    );
    if (!Array.isArray(parsed)) return [];
    const records: ArchivedRecord[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.archivedAt !== "string" || typeof record.workspaceId !== "string") continue;
      const title = typeof record.title === "string" ? record.title : "";
      const displayName = typeof record.displayName === "string" ? record.displayName : "";
      records.push({
        workspaceId: record.workspaceId,
        projectId: typeof record.projectId === "string" ? record.projectId : "",
        name: title || displayName || record.workspaceId,
        archivedAt: record.archivedAt,
      });
    }
    return records;
  } catch {
    return [];
  }
}
