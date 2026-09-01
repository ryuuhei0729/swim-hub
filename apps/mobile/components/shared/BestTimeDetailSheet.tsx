import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { CenterModal } from "@/components/ui/CenterModal";

export interface BestTimeDetail {
  /** 大会日 (competition.date) または記録作成日 (created_at) の ISO 文字列。呼び出し元で優先順位を解決して渡すこと */
  date: string | null;
  /** 大会名 (competition.title)。大会に紐づかない記録は null */
  competitionTitle: string | null;
  /** 備考 (note)。一括登録時に加え、通常の大会記録入力画面の「メモ」欄からも入る */
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
   * フォールバック文言 (「一括登録」相当)。表示条件は本体 JSDoc の4象限表を参照。
   * `mypage.bestTimesTable.bulkEntryNote` / `teams.memberDetail.bestTimesTable.bulkEntryNote` /
   * `teams.membersTimeTable.bulkEntryNote` の3名前空間は言語によって微差があるため、
   * どのキーを使うかは呼び出し元が t() で解決してから渡すこと (このコンポーネントは i18n 名前空間を知らない)
   */
  noteFallbackLabel: string;
}

/**
 * ベストタイムのセルをタップした際に日付・大会名・備考を表示する詳細ポップアップ。
 * profile / member-detail / TeamMemberList の3表から共有される。
 *
 * 表示ルール (日付は常に表示、大会名と備考はそれぞれ独立に判定する):
 * - 大会名あり・備考あり: 日付 + 大会名 + 備考
 * - 大会名あり・備考なし: 日付 + 大会名のみ (フォールバックは出さない)
 * - 大会名なし・備考あり: 日付 + 備考
 * - 大会名なし・備考なし: 日付 + noteFallbackLabel (「一括登録」相当)
 *
 * web 版はホバーツールチップ (絶対配置) だが、mobile はタップ操作のため中央配置のポップアップ
 * モーダル (`CenterModal`) を使う。ユーザーから「ボトムシートではなくモーダル的なポップアップで
 * 出てきてほしい」との要望があったため、既存の下端シート (`BottomSheet`) から変更している。
 */
export const BestTimeDetailSheet: React.FC<BestTimeDetailSheetProps> = ({
  detail,
  onClose,
  noteFallbackLabel,
}) => {
  const locale = useDateLocale();
  const { t } = useTranslation();

  // CenterModal は閉じるときも160msのフェード+スケールアウトを再生する。呼び出し元は
  // 「選択中セル」を detail の null/非null で表しているため、生の detail だけで中身を
  // 判定すると、閉じ操作の瞬間に中身が消えてしまい、フェードアウト中に「空の白いカード」
  // が見えてしまう。そこで直近の非 null な detail をキャッシュし、描画にはこちら
  // (displayDetail) を使う。visible の判定 (CenterModal に渡す isOpen 相当) だけは
  // 生の detail で行う (`GroupMemberModal.tsx`/`GroupMemberListModal.tsx` と同じ
  // useState + useEffect 方式。useRef のレンダー中読み取りは react-hooks/refs に
  // 抵触するため使わない)。
  const [displayDetail, setDisplayDetail] = useState<BestTimeDetail | null>(
    detail,
  );
  useEffect(() => {
    if (detail !== null) {
      setDisplayDetail(detail);
    }
  }, [detail]);

  // 空文字 "" は「無し」扱い (従来の `note || fallback` と同じ falsy 判定)。
  const hasCompetitionTitle = Boolean(displayDetail?.competitionTitle);
  const hasNote = Boolean(displayDetail?.note);
  const noteContent: string | null = hasNote
    ? (displayDetail?.note ?? null)
    : hasCompetitionTitle
      ? null
      : noteFallbackLabel;

  return (
    <CenterModal
      visible={detail !== null}
      onClose={onClose}
      closeAccessibilityLabel={t("common.close")}
    >
      {displayDetail && (
        <View style={styles.container}>
          <View style={styles.dateRow}>
            <Feather name="calendar" size={14} color="#6B7280" />
            <Text style={styles.dateText}>
              {formatDate(displayDetail.date, "numeric", locale)}
            </Text>
          </View>
          {hasCompetitionTitle ? (
            <Text style={styles.titleText}>
              {displayDetail.competitionTitle}
            </Text>
          ) : null}
          {noteContent !== null ? (
            <Text style={styles.noteText}>{noteContent}</Text>
          ) : null}
        </View>
      )}
    </CenterModal>
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
