import type { PluginTheme } from "@getpaseo/plugin";
import { useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { WorkspaceState } from "../shared/contracts";

type Colors = PluginTheme["colors"];

/** Hex color with alpha; falls back when the theme color is not a hex string. */
export function tint(color: string, alpha: number, fallback: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const hex = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${channel}`;
}

export function stateColor(state: WorkspaceState, colors: Colors): string {
  switch (state) {
    case "idle":
      return colors.statusSuccess;
    case "developing":
      return colors.accent;
    case "review":
      return colors.statusWarning;
    case "archived":
      return colors.foregroundMuted;
  }
}

export function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(() => {
    const { colors } = theme;
    const pad = compact ? 10 : 14;
    return {
      pad,
      screen: { flex: 1, backgroundColor: colors.surface0 },
      content: { paddingHorizontal: pad, paddingTop: 0, paddingBottom: 90, gap: 8 },

      // Page header
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        paddingHorizontal: pad,
        paddingTop: 8,
        paddingBottom: 8,
      },

      // Segmented control
      segmented: {
        flexDirection: "row" as const,
        alignSelf: compact ? ("stretch" as const) : ("flex-start" as const),
        backgroundColor: colors.surface1,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 3,
        gap: 2,
      },
      segment: {
        flex: compact ? 1 : undefined,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 6,
        paddingHorizontal: compact ? 6 : 12,
        paddingVertical: compact ? 7 : 5,
        borderRadius: 8,
      },
      segmentActive: { backgroundColor: colors.surface2 },
      segmentText: { color: colors.foregroundMuted, fontSize: 13 },
      segmentTextActive: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const },

      // Text
      text: { color: colors.foreground, fontSize: 13, lineHeight: 18 },
      strong: { color: colors.foreground, fontSize: 13, lineHeight: 18, fontWeight: "600" as const },
      muted: { color: colors.foregroundMuted, fontSize: 12, lineHeight: 16 },
      meta: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 15 },
      link: { color: colors.accent, fontSize: 12, fontWeight: "600" as const },
      danger: { color: colors.statusDanger, fontSize: 12, lineHeight: 16 },
      warning: { color: colors.statusWarning, fontSize: 12, lineHeight: 16 },

      // Surfaces
      panel: {
        backgroundColor: colors.surface1,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 14,
        overflow: "hidden" as const,
      },
      panelHeader: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        minHeight: 34,
        paddingHorizontal: 10,
        paddingVertical: 6,
      },
      card: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        backgroundColor: colors.surface0,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: 8,
        paddingVertical: 7,
        paddingLeft: 10,
        paddingRight: 4,
        gap: 4,
      },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        minHeight: compact ? 44 : 36,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderTopColor: colors.border,
        borderTopWidth: 1,
      },

      // Small pieces
      countText: { color: colors.foregroundMuted, fontSize: 12, fontWeight: "600" as const },

      // Buttons
      smallButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: compact ? 6 : 3,
        borderRadius: 6,
      },
      smallButtonText: { fontSize: 11, fontWeight: "600" as const },
      iconButton: {
        width: compact ? 36 : 28,
        height: compact ? 36 : 28,
        borderRadius: 8,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      ghostButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: compact ? 8 : 5,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.border,
      },
      ghostText: { color: colors.foreground, fontSize: 12, fontWeight: "500" as const },
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: compact ? 10 : 7,
        borderRadius: 8,
        backgroundColor: colors.accent,
      },
      buttonDanger: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: compact ? 10 : 7,
        borderRadius: 8,
        backgroundColor: colors.statusDanger,
      },
      buttonText: { color: colors.accentForeground, fontSize: 14, fontWeight: "600" as const },
      buttonTextDanger: { color: "#ffffff", fontSize: 14, fontWeight: "600" as const },
      footer: {
        position: "absolute" as const,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 12,
        paddingHorizontal: pad,
        paddingVertical: 8,
        backgroundColor: colors.surface1,
        borderTopColor: colors.border,
        borderTopWidth: 1,
      },
    };
  }, [theme, compact]);
}

export type Styles = ReturnType<typeof useStyles>;

/** Pressed feedback for Pressable style callbacks. */
export function pressed(base: StyleProp<ViewStyle>) {
  return ({ pressed: isPressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
    base,
    isPressed ? { opacity: 0.65 } : null,
  ];
}
