import React from "react";
import { Pressable, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { MainStackParamList } from "@/navigation/types";
import { styles } from "../styles";

interface TeamRecordsButtonProps {
  teamId: string;
  kind: "practice" | "competition";
  /** 練習 ID / 大会 ID */
  eventId: string;
  /** 日付詳細を閉じる */
  onClose?: () => void;
}

/**
 * 「チームの記録を見る」ボタン。
 *
 * 日付詳細にはチーム練習・チーム大会でも自分の記録だけを出す。メンバー全員の記録は、
 * チーム画面の予定タブでカードを押したときに開く詳細 (練習: タイム一覧 / 大会: 記録一覧) で見る。
 * このボタンはチーム画面の予定タブへ移動し、その詳細を開く (ryuuhei0729/swimhub-tasks#141)。
 */
export const TeamRecordsButton: React.FC<TeamRecordsButtonProps> = ({
  teamId,
  kind,
  eventId,
  onClose,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const label = t("dashboard.dayDetail.viewTeamRecords");

  return (
    <Pressable
      style={styles.addLogButton}
      onPress={(e) => {
        e.stopPropagation();
        onClose?.();
        navigation.navigate("MainTabs", {
          screen: "Teams",
          params: { teamId, initialTab: "schedule", openEvent: { kind, id: eventId } },
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`team-records-button-${kind}-${eventId}`}
    >
      <Feather name="users" size={14} color="#374151" style={styles.addLogButtonIcon} />
      <Text style={styles.addLogButtonText}>{label}</Text>
    </Pressable>
  );
};
