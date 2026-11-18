// Logic tests against a fake Paseo API and a temporary Paseo home. Run with `npm test`.
// Nothing here talks to a real daemon; deleteProject is only exercised on refusal paths,
// because an accepted call would run the real `paseo project delete`.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify } from "../server/classify";
import { acknowledgeWorkspaces, archiveWorkspaces, deleteProject, getBoard, getOverview } from "../server/handlers";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

// Temporary Paseo home with a registry holding archived records of a live and a deleted project.
const home = mkdtempSync(join(tmpdir(), "pm-home-"));
mkdirSync(join(home, "projects"));
writeFileSync(
  join(home, "projects", "workspaces.json"),
  JSON.stringify([
    { workspaceId: "arch-1", projectId: "p1", title: "Old task", archivedAt: ago(3) },
    { workspaceId: "arch-2", projectId: "p1", displayName: "Older task", archivedAt: ago(9) },
    { workspaceId: "arch-gone", projectId: "deleted", title: "Orphan", archivedAt: ago(1) },
    { workspaceId: "fresh", projectId: "p1", archivedAt: null },
  ]),
);
process.env.PASEO_HOME = home;

const dirty = mkdtempSync(join(tmpdir(), "pm-dirty-"));
execFileSync("git", ["init", "-q", dirty]);
writeFileSync(join(dirty, "note.txt"), "uncommitted");
const clean = mkdtempSync(join(tmpdir(), "pm-clean-"));
execFileSync("git", ["init", "-q", clean]);

const base = {
  projectId: "p1",
  projectDisplayName: "P1",
  workspaceKind: "local_checkout",
  workspaceDirectory: "/tmp",
  pinnedAt: null,
  background: false,
  archivingAt: null,
  status: "done",
  statusEnteredAt: null,
  activityAt: null,
  lastUserMessageAt: null,
  createdAt: ago(60),
};
const entries = [
  { ...base, id: "fresh", name: "fresh", activityAt: ago(2) },
  { ...base, id: "old", name: "old", activityAt: ago(40) },
  { ...base, id: "old-pinned", name: "pinned", activityAt: ago(40), pinnedAt: ago(50) },
  { ...base, id: "old-running", name: "running", activityAt: ago(40), status: "running" },
  { ...base, id: "old-dirty", name: "dirty wt", activityAt: ago(40), workspaceKind: "worktree", workspaceDirectory: dirty },
  { ...base, id: "old-clean", name: "clean wt", activityAt: ago(40), workspaceKind: "worktree", workspaceDirectory: clean },
  { ...base, id: "recent-msg", name: "recent message", activityAt: ago(40), lastUserMessageAt: ago(1) },
  { ...base, id: "old-attention", name: "finished unread", activityAt: ago(40), status: "attention", statusEnteredAt: ago(2) },
  { ...base, id: "question", name: "asks", activityAt: ago(1), status: "needs_input" },
];
const agent = (workspaceId: string, extra: object = {}) => ({
  workspaceId,
  status: "idle",
  pendingPermissions: [],
  requiresAttention: false,
  attentionReason: null,
  attentionTimestamp: null,
  updatedAt: ago(1),
  archivedAt: null,
  ...extra,
});
const agentEntries = [
  { agent: agent("old-running", { status: "running" }) },
  { agent: agent("old") },
  { agent: agent("old-clean", { status: "running", archivedAt: ago(1) }) },
];
const archivedCalls: string[] = [];
const paseo = {
  projects: {
    list: async () => ({ projects: [{ projectId: "p1", projectDisplayName: "P1", projectRootPath: "/tmp", projectKind: "git" }] }),
  },
  agents: { list: async () => ({ entries: agentEntries, pageInfo: { nextCursor: null } }) },
  workspaces: {
    list: async () => ({ entries, pageInfo: { nextCursor: null } }),
    archive: async (id: string) => {
      archivedCalls.push(id);
      return { requestId: "r", workspaceId: id, archivedAt: ago(0), error: null };
    },
  },
} as never;
const context = { paseo } as never;

let failures = 0;
const expect = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures += 1;
};

// Classification
const state = (workspace: object, agents: object[] = [], ackAt: number | null = null) =>
  classify(workspace as never, agents as never, ackAt);
expect("done is idle", state({ status: "done" }).state === "idle");
expect("running workspace is developing", state({ status: "running" }).state === "developing");
expect("running agent beats unread finish", state({ status: "attention" }, [agent("x", { status: "running" })]).state === "developing");
expect("needs_input is review/question", state({ status: "needs_input" }).reason === "question");
expect("permission beats running", state({ status: "running" }, [agent("x", { status: "running", pendingPermissions: [{}] })]).state === "review");
expect("unread finish is ackable review", state({ status: "attention" }).ackable);
expect("failed is review/error", state({ status: "failed" }).reason === "error");
expect("agent error is review", state({ status: "done" }, [agent("x", { status: "error" })]).state === "review");
expect("finish before ack is idle", state({ status: "attention", statusEnteredAt: ago(1) }, [], Date.now()).state === "idle");
expect("finish after ack is review", state({ status: "attention", statusEnteredAt: ago(-1) }, [], Date.now()).state === "review");

// Cleanup overview
const overview = await getOverview({ staleDays: 14 }, context);
const row = (id: string) => overview.workspaces.find((item) => item.id === id)!;
expect("fresh is not stale", !row("fresh").stale);
expect("recent message is not stale", !row("recent-msg").stale);
expect("old idle is archivable", row("old").stale && row("old").protectedBy === null);
expect("pinned is protected", row("old-pinned").protectedBy === "pinned");
expect("running is protected", row("old-running").protectedBy === "not_idle");
expect("unread finish is protected", row("old-attention").protectedBy === "not_idle");
expect("dirty worktree is protected", row("old-dirty").protectedBy === "dirty_worktree");
expect("clean worktree is archivable", row("old-clean").stale && row("old-clean").protectedBy === null);
expect("project counts", overview.projects[0]?.activeCount === entries.length);

// Board
const board = await getBoard({}, context);
const boardState = (id: string) => board.active.find((item) => item.id === id)?.state;
expect("board idle", boardState("fresh") === "idle");
expect("board developing", boardState("old-running") === "developing");
expect("board review", boardState("old-attention") === "review");
expect("archived of live project listed", board.archived.map((item) => item.id).join() === "arch-1,arch-2");
expect("archived name falls back to displayName", board.archived[1]?.name === "Older task");

// Archive
const archived = await archiveWorkspaces({ workspaceIds: ["old", "old-clean", "old-dirty", "old-pinned", "missing"] }, context);
expect("archives only safe ones", archivedCalls.join() === "old,old-clean");
expect(
  "skip reasons are codes",
  archived.skipped.map((item) => item.reason).join() === "dirty_worktree,pinned,missing",
);

// Acknowledge
const ack = await acknowledgeWorkspaces({ workspaceIds: ["old-attention", "question", "fresh"] }, context);
expect("acknowledges only finished or failed review", ack.acknowledged.join() === "old-attention");
const afterAck = await getBoard({}, context);
expect("acknowledged becomes idle", afterAck.active.find((item) => item.id === "old-attention")?.state === "idle");
expect("question stays in review", afterAck.active.find((item) => item.id === "question")?.state === "review");

// Delete project (refusals only)
const missing = await deleteProject({ projectId: "nope" }, context);
expect("unknown project refused", !missing.ok && missing.reason === "not_found");
const busy = await deleteProject({ projectId: "p1" }, context);
expect("busy project refused", !busy.ok && busy.reason === "busy" && busy.developing === 1 && busy.asking === 1);

console.log(failures ? `${failures} failed` : "all passed");
process.exitCode = failures ? 1 : 0;
