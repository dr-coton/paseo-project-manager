import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { deleteProjectRpc, layoutSettings, orderProjectIds, type LayoutValues } from "../shared/contracts";
import { useOverview } from "./cleanup";
import { errorText, useT } from "./i18n";
import { pressed, tint, type Styles } from "./styles";

interface ProjectsProps {
  styles: Styles;
  colors: PluginScreenProps["theme"]["colors"];
}

export function ProjectsTab({ styles, colors }: ProjectsProps) {
  const t = useT();
  const settings = useSettings(layoutSettings);
  const values = settings.status === "ready" ? settings.values : null;
  const overview = useOverview(values?.staleDays ?? 14);
  const projects = useMemo(() => overview.data?.projects ?? [], [overview.data]);
  const byId = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const order = useMemo(
    () => (values ? orderProjectIds(values.order, projects) : []),
    [values, projects],
  );
  const hidden = new Set(values?.hidden ?? []);
  const hiddenCount = order.filter((id) => hidden.has(id)).length;
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const removeProject = useRpc(deleteProjectRpc);
  const queryClient = useQueryClient();
  const toast = useToast();

  const deletion = useMutation({
    mutationFn: (projectId: string) => removeProject({ projectId }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(
          result.reason === "not_found"
            ? t("projects.notFound")
            : t("projects.busy", { developing: result.developing, asking: result.asking }),
        );
        return;
      }
      toast.show(t("projects.deleted", { name: byId.get(result.projectId)?.name ?? result.projectId }), {
        variant: "success",
      });
      if (settings.status === "ready") {
        void settings.save(
          {
            ...settings.values,
            order: settings.values.order.filter((id) => id !== result.projectId),
            hidden: settings.values.hidden.filter((id) => id !== result.projectId),
          },
          settings.revision,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["overview"] });
      void queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (error) => toast.error(errorText(error)),
    onSettled: () => setConfirmId(null),
  });

  function save(patch: Partial<LayoutValues>) {
    if (settings.status !== "ready") return;
    void settings.save({ ...settings.values, ...patch }, settings.revision);
  }

  function move(index: number, target: number) {
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [id] = next.splice(index, 1);
    next.splice(target, 0, id);
    save({ order: next });
  }

  function toggleHidden(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save({ hidden: [...next] });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {settings.saveError ? (
        <Text style={styles.danger}>{t("common.saveFailed", { error: errorText(settings.saveError) })}</Text>
      ) : null}
      {overview.isError ? (
        <Text style={styles.danger}>{t("common.loadFailed", { error: errorText(overview.error) })}</Text>
      ) : null}

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={[styles.muted, { flex: 1 }]}>
            {hiddenCount
              ? t("projects.summaryHidden", { total: order.length, hidden: hiddenCount })
              : t("projects.summary", { total: order.length })}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => save({ order: [] })} hitSlop={6}>
            <Text style={styles.link}>{t("projects.byName")}</Text>
          </Pressable>
          {hiddenCount ? (
            <Pressable accessibilityRole="button" onPress={() => save({ hidden: [] })} hitSlop={6}>
              <Text style={styles.link}>{t("projects.showAll")}</Text>
            </Pressable>
          ) : null}
        </View>
        {!overview.data && !overview.isError ? (
          <Text style={[styles.meta, { padding: 10 }]}>{t("common.loading")}</Text>
        ) : null}
        {order.map((id, index) => {
          const project = byId.get(id);
          if (!project) return null;
          const isHidden = hidden.has(id);
          if (confirmId === id) {
            const deleting = deletion.isPending && deletion.variables === id;
            return (
              <View key={id} style={[styles.row, { backgroundColor: tint(colors.statusDanger, 0.1, colors.surface2) }]}>
                <Text style={[styles.text, { flex: 1, color: colors.statusDanger }]} numberOfLines={1}>
                  {t("projects.deleteConfirm", { name: project.name, n: project.activeCount })}
                </Text>
                <IconButton
                  styles={styles}
                  icon="X"
                  color={colors.foregroundMuted}
                  label={t("common.cancel")}
                  disabled={deleting}
                  onPress={() => setConfirmId(null)}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("projects.delete", { name: project.name })}
                  disabled={deleting}
                  onPress={() => deletion.mutate(id)}
                  style={pressed([styles.smallButton, { backgroundColor: colors.statusDanger }])}
                >
                  <Text style={[styles.smallButtonText, { color: "#ffffff" }]}>{deleting ? t("projects.deleting") : t("projects.deleteButton")}</Text>
                </Pressable>
              </View>
            );
          }
          return (
            <View key={id} style={styles.row}>
              <Text style={[styles.meta, { width: 18, textAlign: "right" }]}>{index + 1}</Text>
              <Text style={[styles.text, { flex: 1, opacity: isHidden ? 0.4 : 1 }]} numberOfLines={1}>
                {project.name}
              </Text>
              <Text style={[styles.meta, { opacity: isHidden ? 0.4 : 1 }]}>{project.activeCount}</Text>
              <View style={{ flexDirection: "row", gap: 2 }}>
                <IconButton
                  styles={styles}
                  icon="ChevronsUp"
                  color={colors.foregroundMuted}
                  label={t("projects.moveTop", { name: project.name })}
                  disabled={index === 0}
                  onPress={() => move(index, 0)}
                />
                <IconButton
                  styles={styles}
                  icon="ChevronUp"
                  color={colors.foreground}
                  label={t("projects.moveUp", { name: project.name })}
                  disabled={index === 0}
                  onPress={() => move(index, index - 1)}
                />
                <IconButton
                  styles={styles}
                  icon="ChevronDown"
                  color={colors.foreground}
                  label={t("projects.moveDown", { name: project.name })}
                  disabled={index === order.length - 1}
                  onPress={() => move(index, index + 1)}
                />
                <IconButton
                  styles={styles}
                  icon={isHidden ? "EyeOff" : "Eye"}
                  color={isHidden ? colors.foregroundMuted : colors.accent}
                  label={t(isHidden ? "projects.show" : "projects.hide", { name: project.name })}
                  onPress={() => toggleHidden(id)}
                />
                <IconButton
                  styles={styles}
                  icon="Trash2"
                  color={colors.foregroundMuted}
                  label={t("projects.delete", { name: project.name })}
                  disabled={deletion.isPending}
                  onPress={() => setConfirmId(id)}
                />
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function IconButton(props: {
  styles: Styles;
  icon: string;
  color: string;
  label: string;
  disabled?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={4}
      style={pressed([props.styles.iconButton, { opacity: props.disabled ? 0.2 : 1 }])}
    >
      <Icon name={props.icon} size={17} color={props.color} />
    </Pressable>
  );
}
