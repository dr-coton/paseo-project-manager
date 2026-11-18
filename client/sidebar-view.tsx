import type { PluginWorkspaceSnapshot } from "@getpaseo/plugin";
import {
  useProject,
  useProjects,
  useSettings,
  useWorkspace,
  useWorkspaces,
  type PluginSidebarViewProps,
  type ProjectRef,
  type WorkspaceRef,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { layoutSettings } from "../shared/contracts";
import { useT } from "./i18n";

type ViewProps = PluginSidebarViewProps;

function activityTime(workspace: PluginWorkspaceSnapshot): number {
  const value = workspace.lastPromptAt ?? workspace.statusEnteredAt ?? workspace.createdAt;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

const byRecentActivity = (left: PluginWorkspaceSnapshot, right: PluginWorkspaceSnapshot) =>
  activityTime(right) - activityTime(left);

function isListed(workspace: PluginWorkspaceSnapshot) {
  return !workspace.background && !workspace.archivingAt;
}

export function ProjectManagerSidebar(view: ViewProps) {
  const t = useT();
  const settings = useSettings(layoutSettings);
  const order = settings.status === "ready" ? settings.values.order : [];
  const hiddenIds = settings.status === "ready" ? settings.values.hidden : [];
  const [showHidden, setShowHidden] = useState(false);

  const projects = useProjects({ orderBy: "displayName" });
  const ordered = useMemo(() => {
    const rank = new Map(order.map((id, index) => [id, index]));
    // Stable sort keeps unordered projects in name order after the saved ones.
    return [...projects].sort(
      (left, right) => (rank.get(left.id) ?? Infinity) - (rank.get(right.id) ?? Infinity),
    );
  }, [projects, order]);
  const hidden = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const visible = ordered.filter((project) => !hidden.has(project.id));
  const hiddenProjects = ordered.filter((project) => hidden.has(project.id));

  const pinned = useWorkspaces({
    where: (item) => !!item.pinnedAt && isListed(item) && !hidden.has(item.projectId),
    orderBy: byRecentActivity,
  });

  return (
    <ScrollView>
      {pinned.length ? <Heading title={t("sidebar.pinned")} view={view} /> : null}
      {pinned.map((reference) => (
        <WorkspaceRow key={reference.key} reference={reference} view={view} />
      ))}
      {visible.map((reference) => (
        <ProjectSection key={reference.key} reference={reference} view={view} dimmed={false} />
      ))}
      {hiddenProjects.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showHidden ? t("sidebar.hideHidden") : t("sidebar.showHidden", { n: hiddenProjects.length })}
          onPress={() => setShowHidden((value) => !value)}
          style={rowStyle}
        >
          <Text style={{ color: view.theme.colors.foregroundMuted, fontSize: 11 }}>
            {showHidden ? t("sidebar.hideHidden") : t("sidebar.showHidden", { n: hiddenProjects.length })}
          </Text>
        </Pressable>
      ) : null}
      {showHidden
        ? hiddenProjects.map((reference) => (
            <ProjectSection key={reference.key} reference={reference} view={view} dimmed />
          ))
        : null}
    </ScrollView>
  );
}

function ProjectSection({
  reference,
  view,
  dimmed,
}: {
  reference: ProjectRef;
  view: ViewProps;
  dimmed: boolean;
}) {
  const t = useT();
  const project = useProject(reference, (item) => ({ displayName: item.displayName }));
  const [collapsed, setCollapsed] = useState(false);
  const workspaces = useWorkspaces({
    where: (item) => item.project.key === reference.key && !item.pinnedAt && isListed(item),
    orderBy: byRecentActivity,
  });
  const { colors } = view.theme;
  const create = useCallback(() => view.navigation.openProject(reference), [view.navigation, reference]);
  if (!project) return null;
  return (
    <View style={{ opacity: dimmed ? 0.55 : 1 }}>
      <View style={headingRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(collapsed ? "sidebar.expand" : "sidebar.collapse", { name: project.displayName })}
          onPress={() => setCollapsed((value) => !value)}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minHeight: 28 }}
        >
          <Icon
            name={collapsed ? "ChevronRight" : "ChevronDown"}
            size={12}
            color={colors.foregroundMuted}
          />
          <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11, flex: 1 }}>
            {project.displayName}
            {collapsed && workspaces.length ? ` (${workspaces.length})` : ""}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.newWorkspace", { name: project.displayName })}
          onPress={create}
          hitSlop={6}
          style={{ padding: 4 }}
        >
          <Icon name="Plus" size={14} color={colors.foregroundMuted} />
        </Pressable>
      </View>
      {collapsed
        ? null
        : workspaces.map((item) => <WorkspaceRow key={item.key} reference={item} view={view} />)}
    </View>
  );
}

function WorkspaceRow({ reference, view }: { reference: WorkspaceRef; view: ViewProps }) {
  const t = useT();
  const workspace = useWorkspace(reference, (item) => ({
    label: item.title ?? item.name,
    indicator: item.indicator,
    indicatorLabel: item.indicatorLabel,
  }));
  const { colors } = view.theme;
  const open = useCallback(() => view.navigation.openWorkspace(reference), [view.navigation, reference]);
  if (!workspace) return null;
  const active = view.active.workspace?.key === reference.key;
  const dot = indicatorColor(workspace.indicator, colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sidebar.open", { name: workspace.label })}
      onPress={open}
      style={[rowStyle, { paddingLeft: 26 }, active ? { backgroundColor: colors.surface2 } : null]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: dot ?? "transparent",
          }}
        />
        <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, lineHeight: 16, flex: 1 }}>
          {workspace.label}
        </Text>
      </View>
      {workspace.indicatorLabel && workspace.indicator !== "done" ? (
        <Text numberOfLines={1} style={{ color: colors.foregroundMuted, fontSize: 11, paddingLeft: 12 }}>
          {workspace.indicatorLabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

function indicatorColor(indicator: PluginWorkspaceSnapshot["indicator"], colors: ViewProps["theme"]["colors"]) {
  switch (indicator) {
    case "running":
      return colors.accent;
    case "needs_input":
      return colors.statusWarning;
    case "failed":
      return colors.statusDanger;
    case "attention":
      return colors.statusSuccess;
    default:
      return null;
  }
}

function Heading({ title, view }: { title: string; view: ViewProps }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: view.theme.colors.foregroundMuted,
        fontSize: 11,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 4,
      }}
    >
      {title}
    </Text>
  );
}

const rowStyle = {
  minHeight: 28,
  paddingHorizontal: 12,
  paddingVertical: 4,
  justifyContent: "center",
} as const;

const headingRow = {
  flexDirection: "row",
  alignItems: "center",
  paddingLeft: 8,
  paddingRight: 8,
  paddingTop: 8,
} as const;
