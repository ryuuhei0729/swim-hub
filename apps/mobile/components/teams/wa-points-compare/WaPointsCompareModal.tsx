// =============================================================================
// WaPointsCompareModal - チームメンバーを WA ポイントでランキング表示するモーダル
// =============================================================================
//
// 移植元: apps/web/components/team/member-management/components/WaPointsCompareModal.tsx
//
// web は「種目名+コースバッジ+タイム」を1セルに詰め込んだ4列テーブルだが、
// 幅 ~360dp のモバイル画面にそのまま持ち込むと潰れるため、1メンバー1カードの
// ランキングリストに作り直す (練習タブ一覧・大会/練習履歴タブと同じカード化方針)。
//
// カードレイアウト:
//   1行目: 順位バッジ + アバター + 名前 + WAポイント
//   2行目: 距離+種目 / コース(SC・LC) / タイム

import React, { useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rankMembersByWaPoints,
  type Gender,
  type MemberWaPointsInput,
  type WaPointRecordInput,
} from "@apps/shared/utils/waPoints";
import type { StyleTranslationKey } from "@apps/shared/utils/swimStyles";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { formatTimeBest } from "@/utils/formatters";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useMemberWaPointsRecords } from "./useMemberWaPointsRecords";

interface WaPointsCompareModalProps {
  visible: boolean;
  onClose: () => void;
  members: TeamMembershipWithUser[];
  supabase: SupabaseClient;
}

interface RankingRowItem {
  memberId: string;
  rank: number;
  points: number;
  displayName: string;
  avatarPath: string | null;
  distance: number;
  styleLabel: string;
  courseLabel: string;
  timeLabel: string;
}

const RANK_BADGE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: "#FEF3C7", text: "#92400E" },
  2: { bg: "#E5E7EB", text: "#374151" },
  3: { bg: "#FFEDD5", text: "#9A3412" },
};
const DEFAULT_RANK_BADGE_COLOR = { bg: "#EFF6FF", text: "#1E40AF" };

function getRankBadgeColor(rank: number): { bg: string; text: string } {
  return RANK_BADGE_COLORS[rank] ?? DEFAULT_RANK_BADGE_COLOR;
}

interface WaPointsRankingRowProps {
  item: RankingRowItem;
  pointsLabel: string;
  rankLabel: string;
}

/**
 * ランキング1行分の表示。avatarPath (private バケット内相対パス) から
 * 行単位で署名付きURLを解決する (GroupMemberListModal.tsx の GroupMemberRow と同じ方式)。
 */
const WaPointsRankingRow: React.FC<WaPointsRankingRowProps> = React.memo(
  ({ item, pointsLabel, rankLabel }) => {
    const { url: avatarUrl } = useSignedImageUrl(
      "profile-images",
      item.avatarPath,
    );
    const badgeColor = getRankBadgeColor(item.rank);

    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`${rankLabel} ${item.rank}. ${item.displayName}. ${item.points} ${pointsLabel}`}
      >
        <View style={styles.rowTopLine}>
          <View style={[styles.rankBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.rankBadgeText, { color: badgeColor.text }]}>
              {item.rank}
            </Text>
          </View>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>
                {item.displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.displayName} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={styles.points}>{item.points}</Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.detailText} numberOfLines={1}>
            {item.distance}m{item.styleLabel}
            <Text style={styles.detailCourse}> ({item.courseLabel}) </Text>
            {item.timeLabel}
          </Text>
        </View>
      </View>
    );
  },
);
WaPointsRankingRow.displayName = "WaPointsRankingRow";

export const WaPointsCompareModal: React.FC<WaPointsCompareModalProps> = ({
  visible,
  onClose,
  members,
  supabase,
}) => {
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const { recordsByUserId, loading, error, loadRecords } =
    useMemberWaPointsRecords(supabase);

  // members の配列参照が親の再レンダーごとに変わっても内容が同じなら再取得しない
  const memberUserIds = useMemo(
    () => members.map((member) => member.user_id),
    [members],
  );
  const memberUserIdsKey = memberUserIds.join(",");

  useEffect(() => {
    if (!visible || memberUserIds.length === 0) return;
    void loadRecords(memberUserIds);
    // memberUserIdsKey が内容の変化を表すため memberUserIds 自体は依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, memberUserIdsKey, loadRecords]);

  const handleRetry = useCallback(() => {
    void loadRecords(memberUserIds);
  }, [loadRecords, memberUserIds]);

  const memberById = useMemo(() => {
    const map = new Map<string, TeamMembershipWithUser>();
    for (const member of members) map.set(member.id, member);
    return map;
  }, [members]);

  const rankingRows = useMemo<RankingRowItem[]>(() => {
    if (!visible) return [];

    const inputs: MemberWaPointsInput[] = members.map((member) => {
      const genderRaw: unknown = member.users?.gender;
      // pool_type/gender は DB の生の値をそのまま渡す (0/1 の意味を再解釈しない)。
      // 0/1 以外 (未設定など) のメンバーは計算対象外にする。
      const gender: Gender | null =
        genderRaw === 0 || genderRaw === 1 ? genderRaw : null;
      const sourceRecords = recordsByUserId.get(member.user_id) ?? [];

      const records: WaPointRecordInput[] =
        gender === null
          ? []
          : sourceRecords.map((record) => ({
              time: record.time,
              poolType: record.poolType,
              gender,
              styleKey: record.styleKey,
              distance: record.distance,
              // useMemberWaPointsRecords は is_relaying=true を既に除外済み
              isRelaying: false,
            }));

      return {
        memberId: member.id,
        displayName: member.users?.name || t("teams.mobile.unnamedMember"),
        records,
      };
    });

    const ranking = rankMembersByWaPoints(inputs);

    return ranking.map((entry) => {
      const member = memberById.get(entry.memberId);
      const styleLabel = t(
        `practice.styles.${entry.styleKey}` as `practice.styles.${StyleTranslationKey}`,
      );
      const courseLabel =
        entry.poolType === 1
          ? t("teams.waPointsCompare.courseLong")
          : t("teams.waPointsCompare.courseShort");

      return {
        memberId: entry.memberId,
        rank: entry.rank,
        points: entry.points,
        displayName: entry.displayName,
        avatarPath: member?.users?.profile_image_path ?? null,
        distance: entry.distance,
        styleLabel,
        courseLabel,
        timeLabel: formatTimeBest(entry.time),
      };
    });
  }, [visible, members, memberById, recordsByUserId, t]);

  const pointsLabel = t("teams.waPointsCompare.pointsLabel");
  const rankLabel = t("teams.waPointsCompare.rankLabel");

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<RankingRowItem>) => (
      <WaPointsRankingRow
        item={item}
        pointsLabel={pointsLabel}
        rankLabel={rankLabel}
      />
    ),
    [pointsLabel, rankLabel],
  );

  const keyExtractor = useCallback((item: RankingRowItem) => item.memberId, []);

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel={t("common.close")}
      sheetStyle={styles.modalContent}
    >
      {/*
        modalContent (maxHeight:"90%") は SlideUpModal 内部の flex:1 な overlay の
        直接の子にする。間に SafeAreaView 等の高さ未確定なラッパーを挟むと、Yoga が
        % 高さを解決できる確定した親高さを持てず maxHeight 制約が事実上無効化される
        (このリポジトリで前科のある罠)。
      */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {t("teams.waPointsCompare.modalTitle")}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      {/*
        FlatList はシート (modalContent: maxHeight "90%") の直接の子にする。
        中間に style 指定のない View を1枚挟むと、RN の flexShrink 既定値が 0 のため
        その View がコンテンツサイズより縮まず、FlatList が maxHeight の制約を
        受け取れずスクロールビューポートが成立しないまま溢れる恐れがある
        (Reviewer 指摘: 20〜50人規模のチームで下位の順位に到達できない)。
        StylePickerModal.tsx (FlatList がシート直下) / BottomSheet.tsx
        (ScrollView flexGrow:0 がシート直下) と同じ「中間ラッパーを置かない」構造に揃える。
        FlatList 自体は flexGrow:0 のままにし、高さ未確定の祖先に依存させず
        modalContent の maxHeight で全体を頭打ちにする。
      */}
      {loading ? (
        <LoadingSpinner message={t("teams.mobile.bestTimeLoading")} />
      ) : error ? (
        <ErrorView message={error} onRetry={handleRetry} />
      ) : rankingRows.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="award" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            {t("teams.waPointsCompare.empty")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rankingRows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Android edge-to-edge 対応: 中身のない SafeAreaView は padding を生成しない
          (実機検証済みの既知の罠) ため、insets.bottom を明示的な高さの View として
          確保する (BottomSheet.tsx の footer 不在時と同じ方式) */}
      <View style={{ height: getSafeFooterPadding(0, insets.bottom) }} />
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: "100%",
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    // 高さ未確定の祖先 (modalContent) に対して flex で伸びようとすると高さ0に潰れるため、
    // FlatList 自体はコンテンツサイズのまま (flexGrow:0) にする
    flexGrow: 0,
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  row: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  rowTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rankBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPlaceholderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  displayName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  points: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  rowBottomLine: {
    paddingLeft: 38,
  },
  detailText: {
    fontSize: 12,
    color: "#374151",
  },
  detailCourse: {
    fontSize: 11,
    color: "#6B7280",
  },
});
