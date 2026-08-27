import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { BottomSheet } from "@/components/history/BottomSheet";

export interface BestTimeDetail {
  /** 大会日 (competition.date) または記録作成日 (created_at) の ISO 文字列。呼び出し元で優先順位を解決して渡すこと */
  date: string | null;
  /** 大会名 (competition.title)。大会に紐づかない記録は null */
  competitionTitle: string | null;
  /** 備考 (note)。一括登録時のみ入る想定 */
  note: string | null;
}

export interface BestTimeDetailSheetProps {
  /**
   * 表示対象の詳細。null の間はシートを閉じた状態として扱う
   * (呼び出し元は「選択中のセル」を `BestTimeDetail | null` の state で持ち、そのまま渡す想定)
   */
  detail: BestTimeDetail | null;
  onClose: () => void;
  /**
   * 大会名も note も無い場合に表示するフォールバック文言 (「一括登録」相当)。
   * `mypage.bestTimesTable.bulkEntryNote` / `teams.memberDetail.bestTimesTable.bulkEntryNote` /
   * `teams.membersTimeTable.bulkEntryNote` の3名前空間は言語によって微差があるため、
   * どのキーを使うかは呼び出し元が t() で解決してから渡すこと (このコンポーネントは i18n 名前空間を知らない)
   */
  noteFallbackLabel: string;
}

/**
 * ベストタイムのセルをタップした際に「日付 + 大会名 (無ければ note、それも無ければ一括登録)」を
 * 表示する詳細シート。profile / member-detail / TeamMemberList の3表から共有される。
 *
 * web 版はホバーツールチップ (絶対配置) だが、mobile はタップ操作のため既存の汎用オーバーレイ
 * 基盤である `BottomSheet` を再利用する (新しいポップオーバーは発明しない)。
 */
export const BestTimeDetailSheet: React.FC<BestTimeDetailSheetProps> = ({
  detail,
  onClose,
  noteFallbackLabel,
}) => {
  const locale = useDateLocale();

  return (
    <BottomSheet isOpen={detail !== null} onClose={onClose}>
      {detail && (
        <View style={styles.container}>
          <View style={styles.dateRow}>
            <Feather name="calendar" size={14} color="#6B7280" />
            <Text style={styles.dateText}>{formatDate(detail.date, "numeric", locale)}</Text>
          </View>
          {detail.competitionTitle ? (
            <Text style={styles.titleText}>{detail.competitionTitle}</Text>
          ) : (
            <Text style={styles.noteText}>{detail.note || noteFallbackLabel}</Text>
          )}
        </View>
      )}
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dateText: {
    fontSize: 13,
    color: "#6B7280",
  },
  titleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563EB",
  },
  noteText: {
    fontSize: 15,
    color: "#6B7280",
  },
});
