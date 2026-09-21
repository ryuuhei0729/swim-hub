import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTimeBest } from "@/utils/formatters";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { LapTimeDisplay } from "@/components/records/LapTimeDisplay";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";
import BestTimeBadge from "@/components/records/BestTimeBadge";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import type { RelayRecordWithLegs } from "@apps/shared/types/relayRecord";
import { calcCumulativeTimes } from "@apps/shared/utils/relayEvents";
import {
  groupRecordsByStyle,
  buildDisplaySplits,
  getRecordUserName,
  getRecordUserAvatarPath,
  getRelayLegRecordIds,
  excludeGroupedRelayRecords,
  groupRelayRecordsByEvent,
  type CompetitionDetail,
  type RecordEntry,
  type RelayTeamRow,
  type RelayLegDisplay,
} from "@/utils/teamCompetitionRecords";

interface TeamCompetitionRecordsModalProps {
  visible: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
}

/** 個人行のアバター / リレー展開行のアバターの直径 */
const AVATAR_SIZE = 28;
/** リレー折りたたみ行 (チーム行) のアバタースタック1個あたりの直径 */
const AVATAR_STACK_SIZE = 22;

/**
 * private バケット内相対パスから署名付きURLを解決するアバター (モーダル内ローカル実装)。
 * mobile には汎用 Avatar コンポーネントが存在しないため、
 * WaPointsCompareModal.tsx の WaPointsRankingRow と同じ行単位実装パターンを踏襲する
 * (Out of Scope: 汎用 Avatar.tsx の新設)。
 * path が null (未設定・退会・RLS 0件) でもクラッシュせずイニシャルへフォールバックする。
 */
function RowAvatar({
  path,
  name,
  size,
}: {
  path: string | null;
  name: string;
  size: number;
}) {
  const { url } = useSignedImageUrl("profile-images", path);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const dimensionStyle = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.avatarImage, dimensionStyle]}
        contentFit="cover"
      />
    );
  }
  return (
    <View style={[styles.avatarPlaceholder, dimensionStyle]}>
      <Text style={[styles.avatarPlaceholderText, { fontSize: size * 0.45 }]}>{initial}</Text>
    </View>
  );
}

/**
 * リレーのチーム行 (折りたたみ時) 用、4人のアバターを重ね合わせたスタック表示。
 * 裁定3: 折りたたみ時は Best バッジを適用しない (チーム総合タイムに
 * 「その人のベスト」概念は無いため)。
 */
function RelayAvatarStack({
  legs,
  unknownLabel,
}: {
  legs: RelayLegDisplay[];
  unknownLabel: string;
}) {
  return (
    <View style={styles.avatarStack}>
      {legs.map((leg, index) => (
        <View
          key={leg.legIndex}
          style={[
            styles.avatarStackItem,
            { marginLeft: index === 0 ? 0 : -10, zIndex: legs.length - index },
          ]}
        >
          <RowAvatar path={leg.profileImagePath} name={leg.userName ?? unknownLabel} size={AVATAR_STACK_SIZE} />
        </View>
      ))}
    </View>
  );
}

function RecordRow({
  record,
  raceDistance,
  recordDate,
}: {
  record: RecordEntry;
  raceDistance: number;
  recordDate: string | null | undefined;
}) {
  const { t } = useTranslation();
  const userName = getRecordUserName(record.users, t("teams.competitionRecordsModal.unknownUser"));
  const avatarPath = getRecordUserAvatarPath(record.users);
  const [splitsOpen, setSplitsOpen] = useState(false);
  const subParts = [
    record.reaction_time != null
      ? `${t("teams.competitionRecordsModal.rtLabel")} ${record.reaction_time.toFixed(2)}`
      : null,
    record.note || null,
  ].filter((part): part is string => !!part);

  const formattedSplits = useMemo(
    () => buildDisplaySplits(record.split_times, raceDistance, record.time),
    [record.split_times, raceDistance, record.time],
  );
  const hasSplits = formattedSplits.length > 0;

  return (
    <View style={styles.recordRowWrap}>
      <View style={styles.recordRow}>
        <RowAvatar path={avatarPath} name={userName} size={AVATAR_SIZE} />
        <View style={styles.recordNameBlock}>
          <Text style={styles.recordName} numberOfLines={1}>
            {userName}
          </Text>
          {subParts.length > 0 && (
            <Text style={styles.recordSubText} numberOfLines={1}>
              {subParts.join(" · ")}
            </Text>
          )}
        </View>
        <Text style={styles.recordTimeText}>{formatTimeBest(record.time)}</Text>
      </View>

      {/* 記録の下の行: 左にスプリットトグル (あれば)、右端に Best バッジ。
          個人種目行・孤立リレー行の両方で常に Best バッジを出す (PM 裁定: バックフィル
          状況で表示有無を変えない)。justifyContent: space-between の2枠固定なので、
          スプリットトグルが無くても Best バッジは常に右端に寄る (子が1個だけだと
          space-between は左寄せになるため、左枠は空でも必ず描画する)。
          この行自体もバッジが常時あるため常に描画する (splits 0件でもバッジは出る)。 */}
      <View style={styles.rowMetaLine}>
        <View style={styles.rowMetaLeft}>
          {hasSplits && (
            <Pressable
              style={styles.splitToggleButton}
              onPress={() => setSplitsOpen((prev) => !prev)}
              accessibilityRole="button"
              accessibilityState={{ expanded: splitsOpen }}
            >
              <Feather name={splitsOpen ? "chevron-up" : "chevron-down"} size={12} color="#2563EB" />
              <Text style={styles.splitToggleText}>
                {t("teams.competitionRecordsModal.splitTimesLabel", {
                  count: formattedSplits.length,
                })}
              </Text>
            </Pressable>
          )}
        </View>
        <BestTimeBadge
          recordId={record.id}
          styleId={record.style_id}
          currentTime={record.time}
          recordDate={recordDate}
          // record.pool_type (DB NOT NULL) を使う。大会の pool_type とは別物として扱う
          // (web と同じソース。両者が食い違うケースがあるため `competition.pool_type` へ
          // フォールバックしない。`?? 0` も足さない — NOT NULL なので発火しない死んだコード)。
          poolType={record.pool_type}
          // isRelaying は固定値にせず record.is_relaying をそのまま渡す
          // (getListBestCandidates が isRelaying を絞り込みキーに持つため、通常スタート/
          // 引き継ぎスタートのベストをそれぞれ正しく比較できる)。
          isRelaying={record.is_relaying}
          showDiff={false}
          userId={record.user_id}
          compact
        />
      </View>

      {splitsOpen && hasSplits && (
        <LapTimeDisplay splitTimes={formattedSplits} raceDistance={raceDistance} />
      )}
    </View>
  );
}

function RelayLegRow({
  leg,
  legNumberLabel,
  cumulativeTime,
  unknownLabel,
  poolType,
  recordDate,
}: {
  leg: RelayLegDisplay;
  legNumberLabel: string;
  cumulativeTime: number | undefined;
  unknownLabel: string;
  poolType: number;
  recordDate: string | null | undefined;
}) {
  const displayName = leg.userName ?? unknownLabel;

  return (
    <View style={styles.relayLegRow}>
      <RowAvatar path={leg.profileImagePath} name={displayName} size={AVATAR_SIZE} />
      <View style={styles.relayLegNameBlock}>
        <Text style={styles.relayLegNumber}>{legNumberLabel}</Text>
        <Text style={styles.relayLegName} numberOfLines={1}>
          {displayName}
        </Text>
        {leg.styleNameJp && (
          <Text style={styles.relayLegStyle} numberOfLines={1}>
            {leg.styleNameJp}
          </Text>
        )}
      </View>
      <View style={styles.relayLegTimesBlock}>
        <Text style={styles.relayLegTime}>{formatTimeBest(leg.legTime)}</Text>
        <Text style={styles.relayLegCumulative}>
          {cumulativeTime === undefined ? "-" : formatTimeBest(cumulativeTime)}
        </Text>
      </View>
      {/* recordId / userId が null (退会・records 行削除済み) のときは Best バッジを出さない */}
      {leg.recordId && leg.userId && (
        <BestTimeBadge
          recordId={leg.recordId}
          styleId={leg.styleId}
          currentTime={leg.legTime}
          recordDate={recordDate}
          poolType={poolType}
          isRelaying
          showDiff={false}
          userId={leg.userId}
          compact
        />
      )}
    </View>
  );
}

function RelayTeamRowCard({
  team,
  eventLabel,
  recordDate,
}: {
  team: RelayTeamRow;
  eventLabel: string;
  recordDate: string | null | undefined;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const unknownLabel = t("teams.ranking.relay.retiredMember");

  // 通算タイムは DB にも API 境界にも持たない (過去に通算値が混入して lap が崩れた前科がある)。
  // RelayRankingList.tsx と同じく表示側で calcCumulativeTimes() から導出する。
  const cumulatives = useMemo(
    () => calcCumulativeTimes(team.legs.map((leg) => leg.legTime)),
    [team.legs],
  );

  return (
    <View style={styles.relayTeamCard}>
      <Pressable
        style={styles.relayTeamMain}
        onPress={() => setIsOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${eventLabel} ${formatTimeBest(team.totalTime)}`}
      >
        <RelayAvatarStack legs={team.legs} unknownLabel={unknownLabel} />
        <Text style={styles.relayEventLabel} numberOfLines={1}>
          {eventLabel}
        </Text>
        <Text style={styles.relayTotalTime}>{formatTimeBest(team.totalTime)}</Text>
        <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#2563EB" />
      </Pressable>

      {isOpen && (
        <View style={styles.relayLegsContainer}>
          {team.legs.map((leg, index) => (
            <RelayLegRow
              key={leg.legIndex}
              leg={leg}
              legNumberLabel={t("teams.ranking.relay.legLabel", { num: leg.legIndex + 1 })}
              // team.legs から 1:1 で生成した配列なので index は必ず範囲内。
              // noUncheckedIndexedAccess のため undefined を型上明示的に扱う
              cumulativeTime={cumulatives[index]}
              unknownLabel={unknownLabel}
              poolType={team.poolType}
              recordDate={recordDate}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * チーム大会の記録一覧モーダル (チームメンバーであれば admin/非admin 問わず閲覧可能)。
 * web `apps/web/components/team/TeamCompetitionRecordsModal.tsx` を仕様の正として移植。
 * competitions/records/relay_records (relay_record_legs 込み) を並列取得し、
 * 種目別グルーピング + リレーのチームまとめ (relay_records) で表示する。
 *
 * `relay_record_legs.record_id` に載っている行 (leg0〜3、is_relaying の値によらず) は
 * 個人一覧・旧来のリレー平置き一覧の両方から除外し、リレーのチーム行でのみ表示する
 * (PM 実測: 現行の `!is_relaying` フィルタはリレー第1泳者を個人種目行として混入表示していた)。
 */
export function TeamCompetitionRecordsModal({
  visible,
  onClose,
  competitionId,
  competitionTitle,
}: TeamCompetitionRecordsModalProps) {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  // Android edge-to-edge: このシートはフッターを持たないため、ScrollView の
  // 最下段 (最後の記録行) がシステムナビゲーションバーに埋没する。
  // スクロール余白に下部インセットを加算する (パターンB)。
  const insets = useSafeInsets();

  const [competition, setCompetition] = useState<CompetitionDetail | null>(null);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [relayRecords, setRelayRecords] = useState<RelayRecordWithLegs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [compResult, recordsResult, relayRecordsResult] = await Promise.all([
        supabase
          .from("competitions")
          .select("id, title, date, place, pool_type, note")
          .eq("id", competitionId)
          .single(),
        supabase
          .from("records")
          .select(
            `
            id,
            user_id,
            style_id,
            time,
            reaction_time,
            is_relaying,
            pool_type,
            note,
            users!records_user_id_fkey (
              name,
              profile_image_path
            ),
            styles (
              id,
              name_jp,
              name,
              style,
              distance
            ),
            split_times (
              id,
              distance,
              split_time
            )
          `,
          )
          .eq("competition_id", competitionId)
          .order("time", { ascending: true }),
        TeamRelayRecordsAPI.getByCompetition(supabase, competitionId),
      ]);

      if (compResult.error) throw compResult.error;
      if (recordsResult.error) throw recordsResult.error;

      setCompetition(compResult.data as CompetitionDetail);
      setRecords((recordsResult.data || []) as unknown as RecordEntry[]);
      setRelayRecords(relayRecordsResult);
    } catch (err) {
      console.error("TeamCompetitionRecordsModal: failed to load records", err);
      setError(t("teams.competitionRecordsModal.loadError"));
    } finally {
      setLoading(false);
    }
  }, [supabase, competitionId, t]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  // relay_records に取り込み済みのレグ (leg0〜3、is_relaying を問わない) の records.id 集合。
  // 個人一覧・旧来のリレー平置き一覧の両方から除外する (このモジュール冒頭の docstring)。
  const groupedRecordIds = useMemo(() => getRelayLegRecordIds(relayRecords), [relayRecords]);
  const visibleRecords = useMemo(
    () => excludeGroupedRelayRecords(records, groupedRecordIds),
    [records, groupedRecordIds],
  );
  const recordsByStyle = useMemo(() => groupRecordsByStyle(visibleRecords), [visibleRecords]);
  const relayEventGroups = useMemo(() => groupRelayRecordsByEvent(relayRecords), [relayRecords]);
  const relayTeamCount = useMemo(
    () => relayEventGroups.reduce((sum, group) => sum + group.teams.length, 0),
    [relayEventGroups],
  );

  const poolTypeLabel =
    competition?.pool_type === 1
      ? t("teams.competitionRecordsModal.poolTypeLong")
      : t("teams.competitionRecordsModal.poolTypeShort");

  const isEmpty = recordsByStyle.length === 0 && relayEventGroups.length === 0;

  return (
    <SlideUpModal visible={visible} onClose={onClose} backdropAccessibilityLabel={t("common.close")} overlayColor="rgba(0,0,0,0.4)" sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {competitionTitle}
          {t("teams.competitionRecordsModal.titleSuffix")}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={styles.closeIcon}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: getSafeFooterPadding(16, insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.infoText}>{t("teams.competitionRecordsModal.loading")}</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBlock}>
            <Feather name="alert-circle" size={32} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && (
          <>
            {competition && (
              <View style={styles.metaRow}>
                {competition.place && (
                  <View style={styles.metaItem}>
                    <Feather name="map-pin" size={14} color="#6B7280" />
                    <Text style={styles.metaText}>{competition.place}</Text>
                  </View>
                )}
                <Text style={styles.metaText}>{poolTypeLabel}</Text>
                {competition.note && (
                  <View style={styles.metaItem}>
                    <Feather name="edit-3" size={14} color="#6B7280" />
                    <Text style={styles.metaText} numberOfLines={2}>
                      {competition.note}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {isEmpty && (
              <View style={styles.emptyBlock}>
                <Feather name="inbox" size={36} color="#D1D5DB" />
                <Text style={styles.emptyText}>{t("teams.competitionRecordsModal.empty")}</Text>
              </View>
            )}

            {recordsByStyle.map((group) => (
              <View key={group.style.id} style={styles.styleGroup}>
                <View style={styles.styleGroupHeader}>
                  <View style={styles.styleGroupBar} />
                  <Text style={styles.styleGroupTitle}>{group.style.name_jp}</Text>
                  <Text style={styles.styleGroupCount}>
                    {t("common.listToolbar.itemCount", {
                      count: group.individual.length + group.relay.length,
                    })}
                  </Text>
                </View>

                <View style={styles.recordsTable}>
                  {group.individual.map((record) => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      raceDistance={group.style.distance}
                      recordDate={competition?.date ?? null}
                    />
                  ))}

                  {group.relay.length > 0 && (
                    <>
                      <View style={styles.relayHeaderRow}>
                        <Text style={styles.relayHeaderText}>
                          {t("teams.competitionRecordsModal.relay")}
                        </Text>
                      </View>
                      {group.relay.map((record) => (
                        <RecordRow
                          key={record.id}
                          record={record}
                          raceDistance={group.style.distance}
                          recordDate={competition?.date ?? null}
                        />
                      ))}
                    </>
                  )}
                </View>
              </View>
            ))}

            {relayEventGroups.length > 0 && (
              <View style={styles.styleGroup}>
                <View style={styles.styleGroupHeader}>
                  <View style={styles.styleGroupBar} />
                  <Text style={styles.styleGroupTitle}>
                    {t("teams.competitionRecordsModal.relay")}
                  </Text>
                  <Text style={styles.styleGroupCount}>
                    {t("common.listToolbar.itemCount", { count: relayTeamCount })}
                  </Text>
                </View>

                <View style={styles.relayTeamsContainer}>
                  {relayEventGroups.flatMap((group) =>
                    group.teams.map((team) => (
                      <RelayTeamRowCard
                        key={team.relayRecordId}
                        team={team}
                        eventLabel={t("teams.ranking.relay.eventLabel", {
                          distance: group.legDistance,
                          // team.legCount (チーム単位) を使う。group.legCount は存在しない
                          // (同一種目でもレグ数が異なるチームが併存しうるため、グループ側に
                          // legCount を持たせない設計。PM 修正依頼)。
                          legCount: team.legCount,
                          kind: t(`teams.ranking.relay.kind.${group.relayKind}`),
                        })}
                        recordDate={competition?.date ?? null}
                      />
                    )),
                  )}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  closeIcon: {
    padding: 4,
  },
  // BottomSheet.tsx / WaPointsCompareModal.tsx と同様、ScrollView 自体はコンテンツサイズの
  // ままにする (flexGrow: 0)。挙動は変えず明示するだけ。
  scrollView: {
    flexGrow: 0,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  centerBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  errorBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 1,
  },
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  styleGroup: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  styleGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  styleGroupBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#2563EB",
  },
  styleGroupTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E3A8A",
    flex: 1,
  },
  styleGroupCount: {
    fontSize: 12,
    color: "#2563EB",
  },
  recordsTable: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  },
  recordRowWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFF6FF",
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recordNameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recordName: {
    fontSize: 14,
    color: "#111827",
  },
  recordSubText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  // SC5 (改訂): 順位・ベスト判定による色/太さの出し分けはしない。種目内の全記録の
  // タイムを一律で青字 + 太字にする (web text-blue-600 相当。#2563EB は本ファイル内の
  // styleGroupBar / splitToggleText / BestTimeBadge の blue-600 と同じ既存トークン)。
  recordTimeText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    fontVariant: ["tabular-nums"],
  },
  relayHeaderRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFF6FF",
  },
  relayHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  // 「記録の下の行」= スプリットトグル (あれば) + Best バッジ (あれば)。
  // marginLeft は recordRow の avatar 幅 (AVATAR_SIZE=28) + gap (10) と揃え、
  // 名前の開始位置の真下にインデントする。
  rowMetaLine: {
    marginTop: 4,
    marginLeft: AVATAR_SIZE + 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  // 左枠。トグルが無くても常に描画し (子が1個だけだと space-between が左寄せになるため)、
  // Best バッジを右端に固定する。
  rowMetaLeft: {
    flexShrink: 1,
    minWidth: 0,
  },
  splitToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  splitToggleText: {
    fontSize: 12,
    color: "#2563EB",
  },
  avatarImage: {
    backgroundColor: "#E5E7EB",
  },
  avatarPlaceholder: {
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarPlaceholderText: {
    color: "#6B7280",
    fontWeight: "700",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarStackItem: {
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  relayTeamsContainer: {
    gap: 8,
  },
  relayTeamCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  },
  relayTeamMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  relayEventLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  // recordTimeText と同じ扱い (SC5 改訂): モーダル内の「タイム」は全部同じ青で統一する
  // (ユーザー原文「1位以外の記録も全部」= チーム総合タイムも対象)。
  relayTotalTime: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    fontVariant: ["tabular-nums"],
  },
  relayLegsContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFF6FF",
  },
  relayLegRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
  },
  relayLegNameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  relayLegNumber: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  relayLegName: {
    fontSize: 14,
    color: "#111827",
  },
  relayLegStyle: {
    fontSize: 12,
    color: "#6B7280",
  },
  relayLegTimesBlock: {
    alignItems: "flex-end",
    gap: 2,
  },
  // recordTimeText と同じ扱い: 色の出し分けをせず一律で青字 + 太字にする。
  relayLegTime: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
    fontVariant: ["tabular-nums"],
  },
  relayLegCumulative: {
    fontSize: 11,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
});
