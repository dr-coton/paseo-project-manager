import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  ackRpc,
  archiveRpc,
  boardRpc,
  layoutSettings,
  type ArchivedSummary,
  type WorkspaceState,
  type WorkspaceSummary,
} from "../shared/contracts";
import { errorText, formatAge, formatDate, useT, type Translate } from "./i18n";
import { pressed, stateColor, tint, type Styles } from "./styles";

const COLUMNS: readonly WorkspaceState[] = ["review", "developing", "idle", "archived"];
const ARCHIVED_PAGE = 40;

type Colors = PluginScreenProps["theme"]["colors"];

interface BoardProps {
  styles: Styles;
  colors: Colors;
  compact: boolean;
  navigation: PluginScreenProps["navigation"];
  includeHidden: boolean;
}

export function BoardTab({ styles, colors, compact, navigation, includeHidden }: BoardProps) {
  const t = useT();
  const getBoard = useRpc(boardRpc);
  const archive = useRpc(archiveRpc);
  const acknowledge = useRpc(ackRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const settings = useSettings(layoutSettings);
  const hidden = settings.status === "ready" ? settings.values.hidden : [];

  const [focused, setFocused] = useState<WorkspaceState>("review");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [archivedLimit, setArchivedLimit] = useState(ARCHIVED_PAGE);

  // States follow agents, so poll while the board is open.
  const board = useQuery({
    queryKey: ["board"],
    queryFn: () => getBoard({}),
    refetchInterval: 5000,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["board"] });
    void queryClient.invalidateQueries({ queryKey: ["overview"] });
  };

  const archiveOne = useMutation({
    mutationFn: (id: string) => archive({ workspaceIds: [id] }),
    onSuccess: (result) => {
      const skipped = result.skipped[0];
      if (result.archived.length) toast.show(t("board.archived"), { variant: "success" });
      else toast.error(skipped ? skipped.detail ?? t(`skip.${skipped.reason}`) : t("board.archiveFailed"));
      refreshAll();
    },
    onError: (error) => toast.error(errorText(error)),
    onSettled: () => setConfirmId(null),
  });

  const ackAll = useMutation({
    mutationFn: (workspaceIds: string[]) => acknowledge({ workspaceIds }),
    onSuccess: (result) => {
      toast.show(t("board.acknowledged", { n: result.acknowledged.length }), { variant: "success" });
      refreshAll();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const columns = useMemo(() => {
    const visible = (projectId: string) => includeHidden || !hidden.includes(projectId);
    const active = (board.data?.active ?? []).filter(
      (item) => !item.background && visible(item.projectId),
    );
    return {
      idle: active.filter((item) => item.state === "idle"),
      developing: active.filter((item) => item.state === "developing"),
      review: active.filter((item) => item.state === "review"),
      archived: (board.data?.archived ?? []).filter((item) => visible(item.projectId)),
    };
  }, [board.data, includeHidden, hidden]);

  const ackableIds = columns.review.filter((item) => item.ackable).map((item) => item.id);
  const open = (workspaceId: string) => navigation?.openWorkspace({ workspaceId });
  const canOpen = !!navigation;

  const ackButton =
    ackableIds.length > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("board.ackAllLabel", { n: ackableIds.length })}
        disabled={ackAll.isPending}
        onPress={() => ackAll.mutate(ackableIds)}
        hitSlop={6}
        style={pressed([styles.smallButton, { backgroundColor: tint(colors.statusWarning, 0.16, colors.surface2) }])}
      >
        <Icon name="CheckCheck" size={12} color={colors.statusWarning} />
        <Text style={[styles.smallButtonText, { color: colors.statusWarning }]}>
          {ackAll.isPending ? t("common.loading") : t("board.ackAll")}
        </Text>
      </Pressable>
    ) : null;

  function renderCards(state: WorkspaceState) {
    const items = columns[state];
    if (items.length === 0) {
      return (
        <Text style={[styles.meta, { textAlign: "center", paddingVertical: 12 }]}>
          {board.isLoading ? t("common.loading") : t("common.empty")}
        </Text>
      );
    }
    if (state === "archived") {
      const shown = (items as ArchivedSummary[]).slice(0, archivedLimit);
      return (
        <>
          {shown.map((item) => (
            <ArchivedCard
              key={item.id}
              item={item}
              styles={styles}
              colors={colors}
              t={t}
              canOpen={canOpen}
              onRestore={() => open(item.id)}
            />
          ))}
          {items.length > archivedLimit ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setArchivedLimit((value) => value + ARCHIVED_PAGE)}
              style={pressed({ alignSelf: "center", paddingVertical: 6 })}
            >
              <Text style={styles.link}>{t("board.more", { n: items.length - archivedLimit })}</Text>
            </Pressable>
          ) : null}
        </>
      );
    }
    return (items as WorkspaceSummary[]).map((item) => (
      <ActiveCard
        key={item.id}
        item={item}
        styles={styles}
        colors={colors}
        t={t}
        canOpen={canOpen}
        onOpen={() => open(item.id)}
        confirming={confirmId === item.id}
        archiving={archiveOne.isPending && archiveOne.variables === item.id}
        onArchive={() => {
          if (confirmId !== item.id) return setConfirmId(item.id);
          archiveOne.mutate(item.id);
        }}
        onCancel={() => setConfirmId(null)}
      />
    ));
  }

  const notices = (
    <>
      {board.isError ? (
        <Text style={styles.danger}>{t("common.loadFailed", { error: errorText(board.error) })}</Text>
      ) : null}
      {canOpen ? null : <Text style={styles.warning}>{t("board.noNavigation")}</Text>}
    </>
  );

  if (compact) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.segmented}>
          {COLUMNS.map((state) => {
            const active = focused === state;
            return (
              <Pressable
                key={state}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setFocused(state)}
                style={[styles.segment, active ? styles.segmentActive : null]}
              >
                <Text style={active ? styles.segmentTextActive : styles.segmentText} numberOfLines={1}>
                  {t(`state.${state}`)}
                </Text>
                <Text style={[styles.countText, { color: active ? stateColor(state, colors) : colors.foregroundMuted }]}>
                  {columns[state].length}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {notices}
        {focused === "review" && ackButton ? <View style={{ alignItems: "flex-end" }}>{ackButton}</View> : null}
        <View style={{ gap: 6 }}>{renderCards(focused)}</View>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { paddingHorizontal: styles.pad, paddingBottom: styles.pad, gap: 8 }]}>
      {notices}
      <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
        {COLUMNS.map((state) => {
          const color = stateColor(state, colors);
          return (
            <View key={state} style={[styles.panel, { flex: 1, minWidth: 0, borderTopColor: color, borderTopWidth: 2 }]}>
              <View style={styles.panelHeader}>
                <Text style={styles.strong} numberOfLines={1}>
                  {t(`state.${state}`)}
                </Text>
                <Text style={[styles.countText, { color: state === "archived" ? colors.foregroundMuted : color, flex: 1 }]}>
                  {columns[state].length}
                </Text>
                {state === "review" ? ackButton : null}
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 6, gap: 6 }}>
                {renderCards(state)}
              </ScrollView>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ActiveCard(props: {
  item: WorkspaceSummary;
  styles: Styles;
  colors: Colors;
  t: Translate;
  canOpen: boolean;
  onOpen(): void;
  confirming: boolean;
  archiving: boolean;
  onArchive(): void;
  onCancel(): void;
}) {
  const { item, styles, colors, t } = props;
  const color = stateColor(item.state, colors);
  const canArchive = item.state === "idle" && !item.protectedBy;
  const locked = item.state === "idle" ? item.protectedBy : null;

  return (
    <View style={[styles.card, props.confirming ? { borderColor: colors.statusDanger } : null]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("board.open", { name: item.name })}
        disabled={!props.canOpen}
        onPress={props.onOpen}
        style={pressed({ flex: 1, minWidth: 0, gap: 2 })}
      >
        <Text style={styles.text} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.reason && item.state !== "idle" ? <Text style={{ color }}>{t(`reason.${item.reason}`)} · </Text> : null}
          {item.projectName} · {formatAge(t, item.ageDays)}
          {item.kind === "worktree" ? ` · ${t("common.worktree")}` : ""}
        </Text>
      </Pressable>
      {canArchive && props.confirming ? (
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel")}
            onPress={props.onCancel}
            hitSlop={4}
            style={pressed(styles.iconButton)}
          >
            <Icon name="X" size={14} color={colors.foregroundMuted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("board.confirmArchiveLabel", { name: item.name })}
            disabled={props.archiving}
            onPress={props.onArchive}
            style={pressed([styles.smallButton, { backgroundColor: colors.statusDanger }])}
          >
            <Text style={[styles.smallButtonText, { color: "#ffffff" }]}>
              {props.archiving ? t("common.loading") : t("board.archive")}
            </Text>
          </Pressable>
        </View>
      ) : canArchive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("board.archiveLabel", { name: item.name })}
          onPress={props.onArchive}
          hitSlop={4}
          style={pressed(styles.iconButton)}
        >
          <Icon name="Archive" size={14} color={colors.foregroundMuted} />
        </Pressable>
      ) : locked === "pinned" || locked === "dirty_worktree" ? (
        <View
          accessibilityLabel={locked === "pinned" ? t("board.pinned") : t("board.uncommitted")}
          style={styles.iconButton}
        >
          <Icon name={locked === "pinned" ? "Pin" : "GitCommitHorizontal"} size={13} color={colors.statusWarning} />
        </View>
      ) : null}
    </View>
  );
}

function ArchivedCard(props: {
  item: ArchivedSummary;
  styles: Styles;
  colors: Colors;
  t: Translate;
  canOpen: boolean;
  onRestore(): void;
}) {
  const { item, styles, colors, t } = props;
  return (
    <View style={[styles.card, { backgroundColor: "transparent" }]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[styles.text, { color: colors.foregroundMuted }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.projectName} · {formatDate(t, item.archivedAt)}
        </Text>
      </View>
      {props.canOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("board.restoreLabel", { name: item.name })}
          onPress={props.onRestore}
          hitSlop={4}
          style={pressed(styles.iconButton)}
        >
          <Icon name="ArchiveRestore" size={14} color={colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
