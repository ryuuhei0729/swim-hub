import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PracticesScreen } from "./PracticesScreen";
import { CompetitionsScreen } from "./CompetitionsScreen";
import type { RecordsSegment, TabParamList } from "@/navigation/types";
import { colors } from "@/constants/theme";

type Props = BottomTabScreenProps<TabParamList, "Records">;

/**
 * 記録タブ
 *
 * iOS 標準のタブバーは 5 つまでしか並ばないため、練習タブと大会タブをこの 1 タブに
 * まとめ、上の切り替えで練習記録一覧 / 大会記録一覧を出し分ける。
 * 中身は従来の PracticesScreen / CompetitionsScreen をそのまま使う (`embedded` で
 * 上端のインセットだけこちらが持つ)。表示中でない方はマウントしない
 * (フォーカス時の再取得が両方で走らないように。絞り込みはストアに残るので失われない)。
 * 他画面から開くときは `navigate("MainTabs", { screen: "Records", params: { segment } })`。
 */
export const RecordsHubScreen: React.FC<Props> = ({ route }) => {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<RecordsSegment>(route.params?.segment ?? "competitions");

  const requestedSegment = route.params?.segment;
  useEffect(() => {
    if (requestedSegment) setSegment(requestedSegment);
  }, [requestedSegment]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.segmentWrap}>
        <SegmentedControl
          testID="records-segment"
          value={segment}
          onChange={setSegment}
          options={[
            { value: "practices", label: t("navigation.mobile.tabs.practices") },
            { value: "competitions", label: t("navigation.mobile.tabs.competitions") },
          ]}
        />
      </View>
      {segment === "practices" ? <PracticesScreen embedded /> : <CompetitionsScreen embedded />}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  segmentWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
});
