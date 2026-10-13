import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { localizedStyleName } from "@/utils/styleName";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import type { MainStackParamList } from "@/navigation/types";
import {
  loadTeamRecordCompetitionData,
  type TeamRecordCompetitionData,
} from "./teamRecordBulk/loadTeamRecordData";
import {
  buildIndividualStyleCards,
  buildRelayStyleCards,
  chunkIntoGroupedRows,
  type IndividualStyleCard,
  type RelayStyleCard,
} from "./teamRecordBulk/styleListCards";
import { STYLE_CARD_BACKGROUND_HEX, relayCardBackgroundColor } from "./teamRecordBulk/styleCardColors";

/** 一覧グリッドの列数 (種目グループの境界では必ず改行する) */
const GRID_COLUMNS = 3;

type RouteProps = RouteProp<MainStackParamList, "TeamRecordBulkForm">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

/**
 * チーム大会記録 一覧画面（種目カードグリッド。管理者専用）
 * 個人22種目 + リレー7種目 = 29カード。タップで種目詳細画面
 * (TeamRecordBulkFormDetail) へ遷移する。
 *
 * 権限ゲートはこの画面と詳細画面の両方に置く (直リンク・戻る操作での素通りを防ぐ)。
 */
export const TeamRecordStyleListScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { competitionId, teamId } = route.params;
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  // MainStack に直接載る画面なので TabNavigator の SafeAreaView の保護外。
  // Android edge-to-edge では最下段のカード行がシステムナビゲーションバーに
  // 食われるため、この画面自身で bottom inset を消費する。
  const insets = useSafeInsets();

  const { members, isLoading: membersLoading } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  const [data, setData] = useState<TeamRecordCompetitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  // フォーカス再取得のたびに全画面スピナーが再表示されるのを防ぐため、
  // 初回ロード完了済みかどうかを ref で追う (state にすると load の
  // 参照が変わり useEffect(() => { load(); }, [load]) が無限ループする)。
  const hasLoadedOnceRef = useRef(false);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      if (!hasLoadedOnceRef.current) setLoading(true);
      setLoadError(null);
      const result = await loadTeamRecordCompetitionData({
        supabase,
        competitionId,
        teamId,
        competitionFetchFailedMessage: t("recordMobile.competitionFetchFailed"),
        unknownUserLabel: t("teams.competitionRecordsModal.unknownUser"),
      });
      if (isMountedRef.current) {
        setData(result);
        hasLoadedOnceRef.current = true;
      }
    } catch (err) {
      if (isMountedRef.current) {
        console.error("チーム記録一覧ロードエラー:", err);
        setLoadError(toUserFacingMessage(err, t("recordMobile.saveFailed")));
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [supabase, competitionId, teamId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // 種目詳細画面 (TeamRecordStyleDetailScreen) で記録を保存して戻ったときに
  // カードバッジを更新する。この画面は react-query を使わないので
  // invalidateQueries が届かず、native-stack は goBack() で遷移元を
  // アンマウントしないため、フォーカス時の明示的な再取得が必要。
  useRefreshOnFocus(load);

  const individualCards = useMemo<IndividualStyleCard[]>(
    () =>
      data
        ? buildIndividualStyleCards(
            data.styles,
            data.styleEntries,
            data.competition.pool_type,
            data.entryUserCountByStyleId,
          )
        : [],
    [data],
  );
  const relayCards = useMemo<RelayStyleCard[]>(
    () => (data ? buildRelayStyleCards(data.styleEntries, data.competition.pool_type) : []),
    [data],
  );

  // 種目 (自由形→平泳ぎ→…) / リレー種類 (フリー→メドレー) の境界で必ず改行するため、
  // 単純な flex-wrap ではなくグループ単位で3個ずつの行に分ける
  // (グループの並び順は入力配列の並び = styles.id 昇順 / RELAY_EVENTS 定義順そのもの)。
  // ローディング/エラー/権限ゲートの早期 return より前段に置く (Rules of Hooks)。
  const individualRows = useMemo(
    () => chunkIntoGroupedRows(
      individualCards.filter((c) => c.visible),
      (c) => c.style.style,
      GRID_COLUMNS,
    ),
    [individualCards],
  );
  const relayRows = useMemo(
    () => chunkIntoGroupedRows(
      relayCards.filter((c) => c.visible),
      (c) => c.relayKind,
      GRID_COLUMNS,
    ),
    [relayCards],
  );

  const openIndividual = (styleId: number) => {
    navigation.navigate("TeamRecordBulkFormDetail", { competitionId, teamId, styleId });
  };
  const openRelay = (relayEventId: RelayStyleCard["relayEventId"]) => {
    navigation.navigate("TeamRecordBulkFormDetail", { competitionId, teamId, relayEventId });
  };

  if (loading || membersLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("recordMobile.stylesLoading")} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <ErrorView message={loadError} fullScreen onRetry={load} />
      </View>
    );
  }

  // 権限ゲート（RLS が二重防御）。非 admin はエラー表示して戻す。
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>{t("teams.mobile.webGuide")}</Text>
          <Pressable style={styles.permissionButton} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionButtonText}>{t("teams.record.backButton")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getSafeFooterPadding(32, insets.bottom) },
        ]}
      >
        <Text style={styles.compTitle}>
          {data?.competition.title || t("competition.records.competitionFallback")}
        </Text>

        <Text style={styles.sectionTitle}>{t("teams.record.individualEvents")}</Text>
        {individualRows.map((row, rowIndex) => (
          <View key={`individual-row-${rowIndex}`} style={styles.row}>
            {row.map((card, cardIndex) => (
              <Pressable
                key={`style-${card.styleId}`}
                style={[
                  styles.card,
                  { backgroundColor: STYLE_CARD_BACKGROUND_HEX[card.style.style] },
                  cardIndex < row.length - 1 && styles.cardSpacing,
                ]}
                onPress={() => openIndividual(card.styleId)}
                accessibilityRole="button"
              >
                <Text
                  style={styles.cardTitle}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {localizedStyleName(card.style, t)}
                </Text>
                {card.filledCount > 0 ? (
                  <Text style={styles.cardCount}>
                    {t("teams.recordList.filledCountIndividual", { n: card.filledCount })}
                  </Text>
                ) : (
                  <Text style={styles.cardCountEmpty}>{t("teams.recordList.emptyLabel")}</Text>
                )}
                {card.entryCount > 0 && (
                  <Text style={styles.cardEntryCount}>
                    {t("teams.recordList.entryCountLabel", { n: card.entryCount })}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}

        <Text style={styles.sectionTitle}>{t("teams.record.relayLabel")}</Text>
        {relayRows.map((row, rowIndex) => (
          <View key={`relay-row-${rowIndex}`} style={styles.row}>
            {row.map((card, cardIndex) => {
              const totalDistance = card.legDistance * card.legCount;
              // 個人種目の「距離+種目名」形式 (例: 50m自由形) に揃える。
              // フリーリレー/メドレーリレーの種目名は competition.records.*Suffix
              // (buildRelayEvents が種目詳細画面のラベル生成でも使う唯一の定義元) を
              // そのまま再利用し、この画面専用の略称キーは持たない。
              const relayLabel =
                card.relayKind === "medley"
                  ? `${totalDistance}m${t("competition.records.medleyRelaySuffix")}`
                  : `${totalDistance}m${t("competition.records.freeRelaySuffix")}`;
              return (
                <Pressable
                  key={`relay-${card.relayEventId}`}
                  style={[
                    styles.card,
                    { backgroundColor: relayCardBackgroundColor(card.relayKind) },
                    cardIndex < row.length - 1 && styles.cardSpacing,
                  ]}
                  onPress={() => openRelay(card.relayEventId)}
                  accessibilityRole="button"
                >
                  <Text
                    style={styles.cardTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {relayLabel}
                  </Text>
                  {card.groupCount > 0 ? (
                    <Text style={styles.cardCount}>
                      {t("teams.recordList.filledCountRelay", { n: card.groupCount })}
                    </Text>
                  ) : (
                    <Text style={styles.cardCountEmpty}>{t("teams.recordList.emptyLabel")}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollContent: { padding: 16, paddingBottom: 32 },
  compTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 10,
  },
  // 種目グループの境界で改行するため、flex-wrap ではなく1行=1 View で組む
  // (chunkIntoGroupedRows が3個ずつのグループ内チャンクに分割済み)。
  row: {
    flexDirection: "row",
    marginBottom: 8,
  },
  card: {
    width: "31%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  // 3個未満で終わる行 (種目/リレー種類の境界) でもカード幅が変わらないよう、
  // gap ではなく最後以外のカードにのみ marginRight を付ける
  // (31% x3 + 3.5% x2 = 100%)。
  cardSpacing: { marginRight: "3.5%" },
  cardTitle: { fontSize: 12, fontWeight: "600", color: "#111827" },
  cardCount: { fontSize: 10, color: "#2563EB", marginTop: 4, fontWeight: "600" },
  cardCountEmpty: { fontSize: 10, color: "#9CA3AF", marginTop: 4 },
  cardEntryCount: { fontSize: 9, color: "#6B7280", marginTop: 2 },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 16,
  },
  permissionText: { fontSize: 15, color: "#6B7280", textAlign: "center" },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
});
