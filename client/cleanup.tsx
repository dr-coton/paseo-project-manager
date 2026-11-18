import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  archiveRpc,
  layoutSettings,
  overviewRpc,
  STALE_DAY_OPTIONS,
  type SkipReason,
  type WorkspaceSummary,
} from "../shared/contracts";
import { errorText, formatAge, useT } from "./i18n";
import { pressed, tint, type Styles } from "./styles";

export function useOverview(staleDays: number) {
  const getOverview = useRpc(overviewRpc);
  return useQuery({
    queryKey: ["overview", staleDays],
    queryFn: () => getOverview({ staleDays }),
  });
}

interface CleanupProps {
  styles: Styles;
  colors: PluginScreenProps["theme"]["colors"];
}

export function CleanupTab({ styles, colors }: CleanupProps) {
  const t = useT();
  const settings = useSettings(layoutSettings);
  const staleDays = settings.status === "ready" ? settings.values.staleDays : 14;
  const hidden = settings.status === "ready" ? settings.values.hidden : [];
  const overview = useOverview(staleDays);
  const archive = useRpc(archiveRpc);
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastSkipped, setLastSkipped] = useState<{ id: string; reason: SkipReason; detail: string | null }[]>([]);

  const candidates = useMemo(() => {
    const items = (overview.data?.workspaces ?? []).filter((item) => item.stale);
    return onlyHidden ? items.filter((item) => hidden.includes(item.projectId)) : items;
  }, [overview.data, onlyHidden, hidden]);

  const archivable = useMemo(
    () => candidates.filter((item) => !item.protectedBy).map((item) => item.id),
    [candidates],
  );

  // Select every archivable candidate whenever the candidate list changes.
  useEffect(() => {
    setSelected(new Set(archivable));
    setConfirming(false);
  }, [archivable]);

  const groups = useMemo(() => {
    const byProject = new Map<string, { name: string; items: WorkspaceSummary[] }>();
    for (const item of candidates) {
      const group = byProject.get(item.projectId) ?? { name: item.projectName, items: [] };
      group.items.push(item);
      byProject.set(item.projectId, group);
    }
    return [...byProject.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  }, [candidates]);

  const mutation = useMutation({
    mutationFn: (workspaceIds: string[]) => archive({ workspaceIds }),
    onSuccess: (result) => {
      setLastSkipped(result.skipped);
      toast.show(
        result.skipped.length
          ? t("cleanup.resultSkipped", { archived: result.archived.length, skipped: result.skipped.length })
          : t("cleanup.result", { archived: result.archived.length }),
        { variant: result.skipped.length ? "warning" : "success" },
      );
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (error) => toast.error(errorText(error)),
    onSettled: () => setConfirming(false),
  });

  function setStaleDays(days: number) {
    if (settings.status !== "ready") return;
    void settings.save({ ...settings.values, staleDays: days }, settings.revision);
  }

  function toggle(id: string) {
    setConfirming(false);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(items: WorkspaceSummary[]) {
    setConfirming(false);
    const ids = items.filter((item) => !item.protectedBy).map((item) => item.id);
    setSelected((current) => {
      const next = new Set(current);
      const allOn = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const selectedCount = archivable.filter((id) => selected.has(id)).length;
  const data = overview.data;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <View style={[styles.segmented, { alignSelf: "auto", flexWrap: "wrap" }]}>
            {STALE_DAY_OPTIONS.map((days) => {
              const active = days === staleDays;
              return (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  accessibilityLabel={t("cleanup.daysLabel", { days })}
                  accessibilityState={{ selected: active }}
                  onPress={() => setStaleDays(days)}
                  style={pressed([styles.segment, { flex: undefined }, active ? styles.segmentActive : null])}
                >
                  <Text style={active ? styles.segmentTextActive : styles.segmentText}>{t("cleanup.days", { days })}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t("cleanup.onlyHidden")}
            accessibilityState={{ checked: onlyHidden }}
            onPress={() => setOnlyHidden((value) => !value)}
            hitSlop={6}
            style={pressed([
              styles.iconButton,
              onlyHidden ? { backgroundColor: tint(colors.accent, 0.16, colors.surface2) } : null,
            ])}
          >
            <Icon name="EyeOff" size={15} color={onlyHidden ? colors.accent : colors.foregroundMuted} />
          </Pressable>
        </View>

        {overview.isError ? (
          <Text style={styles.danger}>{t("common.loadFailed", { error: errorText(overview.error) })}</Text>
        ) : null}
        {data && candidates.length === 0 ? (
          <Text style={[styles.meta, { textAlign: "center", paddingVertical: 16 }]}>{t("cleanup.nothing")}</Text>
        ) : null}
        {!data && !overview.isError ? <Text style={styles.meta}>{t("common.loading")}</Text> : null}

        {groups.map(([projectId, group]) => {
          const ids = group.items.filter((item) => !item.protectedBy).map((item) => item.id);
          const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
          return (
            <View key={projectId} style={styles.panel}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(allOn ? "cleanup.deselectAll" : "cleanup.selectAll", { name: group.name })}
                disabled={ids.length === 0}
                onPress={() => toggleGroup(group.items)}
                style={pressed(styles.panelHeader)}
              >
                <Icon
                  name={ids.length === 0 ? "Lock" : allOn ? "SquareCheck" : "Square"}
                  size={16}
                  color={allOn ? colors.accent : colors.foregroundMuted}
                />
                <Text style={[styles.strong, { flex: 1 }]} numberOfLines={1}>
                  {group.name}
                </Text>
                <Text style={styles.countText}>{group.items.length}</Text>
              </Pressable>
              {group.items.map((item) => {
                const disabled = !!item.protectedBy;
                const checked = !disabled && selected.has(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled }}
                    accessibilityLabel={item.name}
                    disabled={disabled}
                    onPress={() => toggle(item.id)}
                    style={pressed([styles.row, checked ? { backgroundColor: tint(colors.accent, 0.06, colors.surface1) } : null])}
                  >
                    <Icon
                      name={disabled ? "Lock" : checked ? "SquareCheck" : "Square"}
                      size={16}
                      color={checked ? colors.accent : colors.foregroundMuted}
                    />
                    <Text style={[styles.text, { flex: 1, opacity: disabled ? 0.55 : 1 }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.protectedBy ? (
                      <Text style={[styles.meta, { color: colors.statusWarning }]}>{t(`protect.${item.protectedBy}`)}</Text>
                    ) : null}
                    <Text style={[styles.meta, { minWidth: 48, textAlign: "right" }]}>{formatAge(t, item.ageDays)}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}

        {lastSkipped.length ? (
          <Text style={styles.warning}>
            {t("cleanup.skipped", {
              n: lastSkipped.length,
              reasons: [...new Set(lastSkipped.map((item) => item.detail ?? t(`skip.${item.reason}`)))].join(", "),
            })}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirming ? t("common.cancel") : t("cleanup.refresh")}
          onPress={() => (confirming ? setConfirming(false) : void overview.refetch())}
          style={pressed(styles.ghostButton)}
        >
          {confirming ? (
            <Text style={styles.ghostText}>{t("common.cancel")}</Text>
          ) : (
            <Icon name="RefreshCw" size={14} color={colors.foreground} />
          )}
        </Pressable>
        <Text style={[styles.muted, { flex: 1 }]} numberOfLines={1}>
          {selectedCount ? t("cleanup.selected", { n: selectedCount }) : ""}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={selectedCount === 0 || mutation.isPending}
          onPress={() => {
            if (!confirming) return setConfirming(true);
            mutation.mutate(archivable.filter((id) => selected.has(id)));
          }}
          style={pressed([
            confirming ? styles.buttonDanger : styles.button,
            { opacity: selectedCount === 0 || mutation.isPending ? 0.45 : 1 },
          ])}
        >
          <Icon name="Archive" size={15} color={confirming ? "#ffffff" : colors.accentForeground} />
          <Text style={confirming ? styles.buttonTextDanger : styles.buttonText}>
            {mutation.isPending
              ? t("cleanup.archiving")
              : confirming
                ? t("cleanup.confirm")
                : t("cleanup.archive", { n: selectedCount })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
