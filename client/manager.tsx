import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BoardTab } from "./board";
import { CleanupTab } from "./cleanup";
import { ProjectsTab } from "./projects";
import { useT } from "./i18n";
import { pressed, tint, useStyles } from "./styles";

const TABS = ["board", "cleanup", "projects"] as const;

type TabId = (typeof TABS)[number];

const isTab = (value: string | undefined): value is TabId => TABS.some((item) => item === value);

export function ManagerScreen({ theme, layout, params, navigation }: PluginScreenProps) {
  const t = useT();
  const styles = useStyles(theme, layout.compact);
  const [tab, setTab] = useState<TabId>(isTab(params.tab) ? params.tab : "board");
  const [includeHidden, setIncludeHidden] = useState(false);
  // Opening the screen again with another tab param switches tabs.
  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab]);
  const { colors } = theme;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={[styles.segmented, { flex: layout.compact ? 1 : undefined }]}>
          {TABS.map((item) => {
            const active = item === tab;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item)}
                style={pressed([styles.segment, active ? styles.segmentActive : null])}
              >
                <Text style={active ? styles.segmentTextActive : styles.segmentText}>{t(`tabs.${item}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        {layout.compact ? null : <View style={{ flex: 1 }} />}
        {tab === "board" ? (
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={t("common.includeHidden")}
            accessibilityState={{ checked: includeHidden }}
            onPress={() => setIncludeHidden((value) => !value)}
            hitSlop={6}
            style={pressed([
              styles.iconButton,
              includeHidden ? { backgroundColor: tint(colors.accent, 0.16, colors.surface2) } : null,
            ])}
          >
            <Icon
              name={includeHidden ? "Eye" : "EyeOff"}
              size={15}
              color={includeHidden ? colors.accent : colors.foregroundMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {tab === "board" ? (
        <BoardTab
          styles={styles}
          colors={colors}
          compact={layout.compact}
          navigation={navigation}
          includeHidden={includeHidden}
        />
      ) : tab === "cleanup" ? (
        <CleanupTab styles={styles} colors={colors} />
      ) : (
        <ProjectsTab styles={styles} colors={colors} />
      )}
    </View>
  );
}
