import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// The plugin API cannot clear Paseo's own unread state, so "mark all read" records when each
// workspace was acknowledged here. A later finish or error moves it back to review.

export function paseoHome(): string {
  return process.env.PASEO_HOME || join(homedir(), ".paseo");
}

function acksFile(): string {
  return join(paseoHome(), "plugin-data", "project-manager", "acks.json");
}

let writes: Promise<unknown> = Promise.resolve();

export async function readAcks(): Promise<Map<string, number>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(acksFile(), "utf8"));
    const acks = new Map<string, number>();
    if (parsed && typeof parsed === "object") {
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        const time = typeof value === "string" ? Date.parse(value) : NaN;
        if (Number.isFinite(time)) acks.set(id, time);
      }
    }
    return acks;
  } catch {
    return new Map();
  }
}

/** Records `at` for the given workspaces and drops entries for workspaces no longer active. */
export function writeAcks(ids: readonly string[], at: Date, activeIds: ReadonlySet<string>) {
  const next = writes.then(async () => {
    const acks = await readAcks();
    for (const id of ids) acks.set(id, at.getTime());
    const out: Record<string, string> = {};
    for (const [id, time] of acks) {
      if (activeIds.has(id)) out[id] = new Date(time).toISOString();
    }
    const file = acksFile();
    await mkdir(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(out, null, 2));
    await rename(temp, file);
  });
  writes = next.catch(() => undefined);
  return next;
}
