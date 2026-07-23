import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { styles as dayDetailStyles } from "@/components/calendar/DayDetailModal/styles";
import { RecordCard } from "@/components/calendar/DayDetailModal/components";
import type { RecordData } from "@/components/calendar/DayDetailModal/types";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { localizedStyleName } from "@/utils/styleName";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { RecordWithDetails } from "@swim-hub/shared/types";

interface StandaloneRecordDetailModalProps {
  visible: boolean;
  /** 大会未紐付けレコード（一括入力）。null の間は何もレンダリングしない */
  record: RecordWithDetails | null;
  onClose: () => void;
  onEdit: (record: RecordWithDetails) => void;
  onDelete: (recordId: string) => void;
  isDeleting?: boolean;
}

// RecordCard の編集導線が構築する CalendarItem は使用しないため空配列で渡す
const EMPTY_CALENDAR_RECORDS: CalendarItem[] = [];

/**
 * 大会未紐付けレコード（一括入力）単体の詳細モーダル
 * ダッシュボードの DayDetailModal と同じ外枠（Modal/オーバーレイ/ヘッダー）・
 * 同じ RecordCard（種目/タイム/リアクションタイム/スプリット/動画/メモ）を再利用し、
 * 大会情報（大会名/日付/場所）は一切表示しない
 */
export const StandaloneRecordDetailModal: React.FC<StandaloneRecordDetailModalProps> = ({
  visible,
  record,
  onClose,
  onEdit,
  onDelete,
  isDeleting = false,
}) => {
  const { t } = useTranslation();

  if (!record) return null;

  const styleName = localizedStyleName(record.style, t) || t("recordMobile.unknownValue");

  const recordData: RecordData = {
    id: record.id,
    styleName,
    time: record.time,
    reactionTime: record.reaction_time,
    isRelaying: record.is_relaying,
    note: record.note,
    styleId: record.style_id,
    styleDistance: record.style?.distance ?? 0,
    videoPath: record.video_path ?? null,
    videoThumbnailPath: record.video_thumbnail_path ?? null,
  };

  const splits = (record.split_times || []).map((st) => ({
    distance: st.distance,
    split_time: st.split_time,
  }));

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View style={dayDetailStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={dayDetailStyles.safeAreaContainer}
          pointerEvents="box-none"
        >
          <View style={[dayDetailStyles.modalContent, localStyles.modalContent]}>
            <View style={dayDetailStyles.header}>
              <View style={localStyles.headerTitleRow}>
                <Text style={dayDetailStyles.title} numberOfLines={1}>
                  {styleName}
                </Text>
                <Text style={localStyles.bulkLabel}>({t("competition.client.bulkInputLabel")})</Text>
              </View>
              <Pressable style={dayDetailStyles.closeButton} onPress={onClose}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              style={dayDetailStyles.body}
              contentContainerStyle={dayDetailStyles.bodyContent}
            >
              <View style={dayDetailStyles.entriesContainer}>
                <RecordCard
                  record={recordData}
                  splits={splits}
                  records={EMPTY_CALENDAR_RECORDS}
                  competitionId=""
                  onEditRecord={() => onEdit(record)}
                  onDeleteRecord={(recordId) => onDelete(recordId)}
                  onClose={onClose}
                />
              </View>
            </ScrollView>
            {isDeleting && (
              <LoadingSpinner fullScreen message={t("dashboard.dayDetail.deletingMessage")} />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const localStyles = StyleSheet.create({
  modalContent: {
    minHeight: 260,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 1,
    gap: 6,
  },
  bulkLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
});
