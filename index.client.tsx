import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ManagerScreen } from "./client/manager";
import { messages } from "./client/messages";
import { createManagerItem } from "./client/sidebar-item";
import { ProjectManagerSidebar } from "./client/sidebar-view";

export default function contribute(client: PluginClientContext) {
  const open = (tab: string) => ({ openScreen }: { openScreen: PluginClientContext["openScreen"] }) =>
    openScreen({ screenId: "manager", params: { tab } });

  const cleanups = [
    client.addScreen({ id: "manager", title: messages.message("app.title"), Component: ManagerScreen }),
    client.addSidebarHeaderItem({
      id: "manager",
      title: messages.message("app.title"),
      Component: createManagerItem(client),
    }),
    client.addSidebarView({
      id: "projects",
      title: messages.message("app.sidebarView"),
      description: messages.message("app.sidebarViewDescription"),
      Component: ProjectManagerSidebar,
    }),
    client.addCommandCenterItem({
      id: "board",
      title: messages.message("app.board"),
      icon: "LayoutDashboard",
      context: "global",
      onSelect: open("board"),
    }),
    client.addCommandCenterItem({
      id: "cleanup",
      title: messages.message("app.cleanup"),
      icon: "Trash2",
      context: "global",
      onSelect: open("cleanup"),
    }),
    client.addCommandCenterItem({
      id: "projects",
      title: messages.message("app.projects"),
      icon: "ArrowUpDown",
      context: "global",
      onSelect: open("projects"),
    }),
  ];
  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
