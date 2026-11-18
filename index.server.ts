import type { PluginServerContext } from "@getpaseo/plugin/server";
import { describeCli, paseoCli } from "./server/cli";
import {
  acknowledgeWorkspaces,
  archiveWorkspaces,
  createCountsHandler,
  deleteProject,
  getBoard,
  getOverview,
} from "./server/handlers";
import {
  ackRpc,
  archiveRpc,
  boardRpc,
  countsRpc,
  deleteProjectRpc,
  layoutSettings,
  overviewRpc,
} from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(layoutSettings);
  server.handle(overviewRpc, getOverview);
  server.handle(boardRpc, getBoard);
  server.handle(countsRpc, createCountsHandler(settings));
  server.handle(ackRpc, acknowledgeWorkspaces);
  server.handle(archiveRpc, archiveWorkspaces);
  server.handle(deleteProjectRpc, deleteProject);

  // Read-only check that project deletion can reach the CLI; the result goes to the plugin log.
  paseoCli(["project", "ls", "--json"], 20_000)
    .then(() => console.log(`project CLI ready: ${describeCli()}`))
    .catch((error: Error) => console.error(`project CLI unavailable: ${describeCli()}: ${error.message}`));
  return () => {};
}
