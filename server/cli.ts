import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { paseoHome } from "./acks";

const run = promisify(execFile);

// Project removal is not in the plugin API, so it goes through the Paseo CLI that ships with
// the running daemon. The plugin process runs from .../node_modules/@getpaseo/server/...
function resolveCli(): { command: string; prefix: string[] } {
  const script = process.argv[1] ?? "";
  const marker = `${join("node_modules", "@getpaseo", "server")}`;
  const index = script.indexOf(marker);
  if (index >= 0) {
    const cli = join(script.slice(0, index), "node_modules", "@getpaseo", "cli", "bin", "paseo");
    if (existsSync(cli)) return { command: process.execPath, prefix: [cli] };
  }
  return { command: "paseo", prefix: [] };
}

export async function paseoCli(args: string[], timeoutMs = 120_000): Promise<string> {
  const { command, prefix } = resolveCli();
  try {
    const { stdout } = await run(command, [...prefix, ...args, "--home", paseoHome()], {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const detail = error as { stderr?: string; message?: string };
    throw new Error((detail.stderr || detail.message || String(error)).trim().split("\n").slice(-3).join(" "));
  }
}

export function describeCli(): string {
  const { command, prefix } = resolveCli();
  return [command, ...prefix].join(" ");
}
