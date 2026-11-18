import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { countsRpc } from "../shared/contracts";
import { useT } from "./i18n";

const POLL_MS = 10_000;

/** Sidebar row that opens the board and shows how many workspaces need review. */
export function createManagerItem(client: PluginClientContext) {
  return function ManagerItem({ currentScreen, openScreen, theme }: PluginSidebarItemProps) {
    const t = useT();
    const [review, setReview] = useState(0);

    useEffect(() => {
      let alive = true;
      const load = () =>
        client
          .rpc(countsRpc, {})
          .then((counts) => alive && setReview(counts.review))
          .catch(() => undefined);
      void load();
      const timer = setInterval(load, POLL_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, []);

    const badge =
      review > 0 ? (
        <View
          accessibilityLabel={t("sidebar.badge", { n: review })}
          style={{
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.statusWarning,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 11, fontWeight: "700" }}>
            {review > 99 ? "99+" : review}
          </Text>
        </View>
      ) : null;

    return (
      <SidebarRow
        icon="LayoutDashboard"
        active={currentScreen?.screenId === "manager"}
        trailing={badge}
        onPress={() => openScreen({ screenId: "manager", params: { tab: "board" } })}
      />
    );
  };
}
