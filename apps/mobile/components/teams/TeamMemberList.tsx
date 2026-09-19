import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Platform,
  ScrollView,
  ActivityIndicator,
  Switch,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} from "@apps/shared/hooks/queries/teams";
import {
  STYLES,
  STYLE_KEY_MAP,
  isInvalidCombination,
  getDistancesForStyle,
  type SwimStyleName,
} from "@apps/shared/utils/swimStyles";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import {
  excludeNonSwimmers,
  selectNonSwimmers,
  remapGroupHeadersForSwimmers,
} from "@apps/shared/utils/swimmerFilter";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { formatTime } from "@/utils/formatters";
import { selectBestTime, formatBestTimeSuffix } from "@/utils/bestTimeSelection";
import { TeamMemberGroupFilter } from "./TeamMemberGroupFilter";
import { MemberDetailModal } from "./member-detail";
import { BestTimeDetailSheet, type BestTimeDetail } from "@/components/shared/BestTimeDetailSheet";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { isNewRecord } from "@apps/shared/utils/bestTimeBadge";

// ベストタイム型定義
interface MemberBestTime {
  styleName: string;
  time: number;
  poolType: number; // 0: 短水路, 1: 長水路
  isRelaying: boolean;
  createdAt: string;
  distance: number;
  note?: string;
  competitionTitle?: string;
  competitionDate?: string;
}

// 種目の色定義（プラットフォーム固有のためこのファイルに残す）
// STYLES の閉じたユニオンでキーを持つため、styleColumns 内の STYLE_COLORS[style] アクセスは
// 常に安全 (Doctrine 2.7)
const STYLE_COLORS: Record<SwimStyleName, { bg: string; header: string; text: string }> = {
  自由形: { bg: "#FEFCE8", header: "#FEF9C3", text: "#854D0E" },
  平泳ぎ: { bg: "#F0FDF4", header: "#DCFCE7", text: "#166534" },
  背泳ぎ: { bg: "#FEF2F2", header: "#FEE2E2", text: "#991B1B" },
  バタフライ: { bg: "#EFF6FF", header: "#DBEAFE", text: "#1E40AF" },
  個人メドレー: { bg: "#FDF2F8", header: "#FCE7F3", text: "#9D174D" },
};

// セル幅定数
const NAME_COL_WIDTH = 76;
const TIME_CELL_WIDTH = 58;
const ROW_HEIGHT = 30;
const BORDER_COLOR = "#D1D5DB";

interface TeamMemberListProps {
  members: TeamMembershipWithUser[];
  teamId: string;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  currentUserId: string;
  isCurrentUserAdmin: boolean;
  onRetry?: () => void;
  onMemberChange?: () => void;
}

/**
 * チームメンバー一覧コンポーネント（WEB版テーブル準拠）
 * 全メンバー横断のベストタイムテーブルを表示
 */
export const TeamMemberList: React.FC<TeamMemberListProps> = ({
  members,
  teamId,
  isLoading,
  isError,
  error,
  currentUserId,
  isCurrentUserAdmin,
  onRetry,
  onMemberChange,
}) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase);
  const removeMemberMutation = useRemoveMemberMutation(supabase);
  const [_processingMemberId, setProcessingMemberId] = useState<string | null>(null);

  // メンバー詳細モーダル
  // id だけを保持し、表示対象は毎レンダー members から導出する。member オブジェクトの
  // スナップショットを state に持つと、モーダルを開いたまま非泳者設定・権限を変更しても
  // members が再取得されて更新された後もモーダル側は古い値のまま表示され続ける
  // (web の Zustand スナップショットと同型のバグ。Issue #49 フォローアップで発覚)。
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isMemberDetailOpen, setIsMemberDetailOpen] = useState(false);
  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const handleMemberPress = useCallback((member: TeamMembershipWithUser) => {
    setSelectedMemberId(member.id);
    setIsMemberDetailOpen(true);
  }, []);

  const handleMemberDetailClose = useCallback(() => {
    setIsMemberDetailOpen(false);
    setSelectedMemberId(null);
  }, []);

  // 非泳者セクションの開閉（表の行として展開するアコーディオン）。
  // ボトムシートは廃止し、他のメンバー行と同じ 2 列構造 (固定名前列 + 横スクロール
  // タイム列) の行として最後のメンバー行の直下に描画する。既定は閉じた状態。
  const [isNonSwimmerExpanded, setIsNonSwimmerExpanded] = useState(false);

  const handleToggleNonSwimmerExpanded = useCallback(() => {
    setIsNonSwimmerExpanded((prev) => !prev);
  }, []);

  // ベストタイムセルの詳細シート（日付・大会名・備考）
  // profile/BestTimesTable.tsx・teams/member-detail/BestTimesTable.tsx と同じ構造:
  // selectedCellKey を持ち、同一セル再タップでは閉じる（トグル）。
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [selectedCellDetail, setSelectedCellDetail] = useState<BestTimeDetail | null>(null);

  const closeCellDetail = useCallback(() => {
    setSelectedCellKey(null);
    setSelectedCellDetail(null);
  }, []);

  const handleCellPress = useCallback(
    (cellKey: string, bestTime: MemberBestTime) => {
      if (selectedCellKey === cellKey) {
        closeCellDetail();
        return;
      }
      setSelectedCellKey(cellKey);
      setSelectedCellDetail({
        date: bestTime.competitionDate ?? bestTime.createdAt,
        competitionTitle: bestTime.competitionTitle ?? null,
        note: bestTime.note ?? null,
      });
    },
    [selectedCellKey, closeCellDetail],
  );

  // グループ表示（グルーピング + ヘッダー）
  const [groupedMembers, setGroupedMembers] = useState<TeamMembershipWithUser[]>(members);
  const [groupHeaders, setGroupHeaders] = useState<Map<number, string>>(new Map());

  const handleGroupedMembersChange = useCallback(
    (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => {
      setGroupedMembers(sorted);
      setGroupHeaders(headers);
    },
    [],
  );

  // ソート状態（WEB版 useMemberSort 準拠、昇順→降順→解除の3状態サイクル）
  const [sortStyle, setSortStyle] = useState<string | null>(null);
  const [sortDistance, setSortDistance] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleSort = useCallback(
    (style: string, distance: number) => {
      if (sortStyle === style && sortDistance === distance) {
        if (sortOrder === "asc") {
          // 昇順中の同じセル再タップは降順へ
          setSortOrder("desc");
        } else {
          // 降順中の同じセル再タップはソートを解除
          setSortStyle(null);
          setSortDistance(null);
          setSortOrder("asc");
        }
      } else {
        // 新しいセル → 昇順ソート
        setSortStyle(style);
        setSortDistance(distance);
        setSortOrder("asc");
      }
    },
    [sortStyle, sortDistance, sortOrder],
  );

  // ベストタイムデータ
  const [bestTimesMap, setBestTimesMap] = useState<Map<string, MemberBestTime[]>>(new Map());
  const [loadingBestTimes, setLoadingBestTimes] = useState(false);
  const [hasLoadedBestTimes, setHasLoadedBestTimes] = useState(false);

  // ベストタイムの取得対象は「メンバーの顔ぶれ」だけで決まる。members 配列そのものを
  // 依存に置くと、権限変更・泳者区分変更で1行書き換わっただけでもチーム全員分の
  // records を引き直し、その間テーブルがスピナーに戻る (体感で数秒固まる)。
  // 顔ぶれを表すキーだけを依存にし、members 自体は ref 経由で最新を読む。
  const membersRef = useRef(members);
  membersRef.current = members;
  const memberUserIdsKey = useMemo(
    () =>
      members
        .map((m) => m.user_id)
        .sort()
        .join(","),
    [members],
  );

  // メンバーのベストタイムを一括取得
  const loadBestTimes = useCallback(async () => {
    const members = membersRef.current;
    if (members.length === 0) return;

    setLoadingBestTimes(true);
    try {
      const userIds = members.map((m) => m.user_id);

      const { data, error: fetchError } = await supabase
        .from("records")
        .select(
          `
          user_id,
          time,
          created_at,
          note,
          pool_type,
          is_relaying,
          styles!records_style_id_fkey (
            name_jp,
            distance
          ),
          competitions!records_competition_id_fkey (
            id,
            title,
            date
          )
        `,
        )
        .in("user_id", userIds)
        .order("time", { ascending: true });

      if (fetchError) throw fetchError;

      // ユーザーごとに種目×プール種別のベストタイムをまとめる
      const map = new Map<string, MemberBestTime[]>();

      if (data) {
        const grouped = new Map<string, typeof data>();
        data.forEach((record) => {
          const list = grouped.get(record.user_id) || [];
          list.push(record);
          grouped.set(record.user_id, list);
        });

        grouped.forEach((records, userId) => {
          const bestTimes: MemberBestTime[] = [];
          const seen = new Set<string>();

          records.forEach(
            (record: {
              user_id: string;
              time: number;
              created_at: string;
              note: string | null;
              pool_type: number;
              is_relaying: boolean;
              styles?:
                | { name_jp: string; distance: number }
                | null
                | { name_jp: string; distance: number }[];
              competitions?:
                | { id: string; title: string; date: string }
                | null
                | { id: string; title: string; date: string }[];
            }) => {
              const style = Array.isArray(record.styles) ? record.styles[0] : record.styles;
              if (!style) return;
              const key = `${style.name_jp}_${record.pool_type}_${record.is_relaying}`;
              if (seen.has(key)) return;
              seen.add(key);
              const competition = Array.isArray(record.competitions)
                ? record.competitions[0]
                : record.competitions;
              bestTimes.push({
                styleName: style.name_jp,
                time: record.time,
                poolType: record.pool_type,
                isRelaying: record.is_relaying,
                createdAt: record.created_at,
                distance: style.distance,
                note: record.note ?? undefined,
                competitionTitle: competition?.title ?? undefined,
                competitionDate: competition?.date ?? undefined,
              });
            },
          );

          const membership = members.find((m) => m.user_id === userId);
          if (membership) {
            map.set(membership.id, bestTimes);
          }
        });
      }

      setBestTimesMap(map);
    } catch (err) {
      console.error("ベストタイム取得エラー:", err);
    } finally {
      setLoadingBestTimes(false);
      setHasLoadedBestTimes(true);
    }
  }, [supabase]);

  useEffect(() => {
    if (memberUserIdsKey.length > 0) {
      loadBestTimes();
    }
  }, [memberUserIdsKey, loadBestTimes]);

  // 引き継ぎタイムを含めて表示するか（WEB版 useMemberBestTimes 準拠、初期値false）
  const [includeRelaying, setIncludeRelaying] = useState(false);

  // 特定メンバーの種目×距離のベストタイムを取得
  const getBestTime = useCallback(
    (
      memberId: string,
      styleName: string,
      distance: number,
      relayingIncluded: boolean = includeRelaying,
    ): MemberBestTime | null => {
      const times = bestTimesMap.get(memberId) || [];
      const dbStyleName = `${distance}m${styleName}`;

      const matching = times.filter((bt) => bt.styleName === dbStyleName);
      const best = selectBestTime(
        matching.map((bt, idx) => ({
          id: String(idx),
          time: bt.time,
          poolType: bt.poolType as 0 | 1,
          isRelaying: bt.isRelaying,
        })),
        relayingIncluded,
      );
      if (!best) return null;
      return matching.find((bt) => bt.time === best.time && bt.isRelaying === best.isRelaying)!;
    },
    [bestTimesMap, includeRelaying],
  );

  // ソート適用済みメンバーリスト
  const { sortedMembers, sortedGroupHeaders } = useMemo(() => {
    if (!sortStyle || sortDistance === null) {
      return { sortedMembers: groupedMembers, sortedGroupHeaders: groupHeaders };
    }

    const compareFn = (a: TeamMembershipWithUser, b: TeamMembershipWithUser): number => {
      const timeA = getBestTime(a.id, sortStyle, sortDistance, includeRelaying);
      const timeB = getBestTime(b.id, sortStyle, sortDistance, includeRelaying);
      if (!timeA && !timeB) return 0;
      if (!timeA) return 1;
      if (!timeB) return -1;
      const comparison = timeA.time - timeB.time;
      return sortOrder === "asc" ? comparison : -comparison;
    };

    // グループがある場合はグループ内でソート
    if (groupHeaders.size > 0) {
      const groups: { name: string; members: TeamMembershipWithUser[] }[] = [];
      let currentGroup: { name: string; members: TeamMembershipWithUser[] } | null = null;
      groupedMembers.forEach((member, idx) => {
        const header = groupHeaders.get(idx);
        if (header !== undefined) {
          currentGroup = { name: header, members: [] };
          groups.push(currentGroup);
        }
        currentGroup?.members.push(member);
      });

      const flat: TeamMembershipWithUser[] = [];
      const headers = new Map<number, string>();
      for (const g of groups) {
        headers.set(flat.length, g.name);
        flat.push(...[...g.members].sort(compareFn));
      }
      return { sortedMembers: flat, sortedGroupHeaders: headers };
    }

    return {
      sortedMembers: [...groupedMembers].sort(compareFn),
      sortedGroupHeaders: groupHeaders,
    };
  }, [groupedMembers, groupHeaders, sortStyle, sortDistance, sortOrder, getBestTime, includeRelaying]);

  // 非泳者は表の本体行には出さず、最下行の「非泳者 (N)」1行に集約する。
  // 件数・一覧はどちらも共有の唯一の定義元 (selectNonSwimmers) から導出する。
  const nonSwimmerMembers = useMemo(() => selectNonSwimmers(members), [members]);

  // 本体グリッド用の表示メンバー（泳者のみ）。groupHeaders の付け替えは
  // web と共通の単一定義元 (remapGroupHeadersForSwimmers) を使う。
  const displayedMembers = useMemo(() => excludeNonSwimmers(sortedMembers), [sortedMembers]);
  const displayedGroupHeaders = useMemo(
    () => remapGroupHeadersForSwimmers(sortedMembers, sortedGroupHeaders),
    [sortedMembers, sortedGroupHeaders],
  );

  // ロール変更処理
  const _handleRoleChange = async (member: TeamMembershipWithUser, newRole: "admin" | "user") => {
    if (member.role === newRole) return;

    setProcessingMemberId(member.id);
    try {
      await updateRoleMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
        role: newRole,
      });
      if (onMemberChange) onMemberChange();
    } catch (err) {
      console.error("ロール変更エラー:", err);
      const errorMessage = toUserFacingMessage(err, t("teams.mobile.roleChangeFailed"));
      if (Platform.OS === "web") {
        window.alert(errorMessage);
      } else {
        Alert.alert(t("common.error"), errorMessage, [{ text: "OK" }]);
      }
    } finally {
      setProcessingMemberId(null);
    }
  };

  // メンバー削除処理
  const _handleRemoveMember = (member: TeamMembershipWithUser) => {
    const memberName = member.users.name || t("teams.mobile.fallbackMemberName");
    const confirmMessage = t("teams.mobile.memberRemoveConfirm", { name: memberName });

    if (Platform.OS === "web") {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      executeRemoveMember(member);
    } else {
      Alert.alert(t("teams.mobile.deleteConfirmTitle"), confirmMessage, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("teams.mobile.deleteConfirmText"),
          style: "destructive",
          onPress: () => executeRemoveMember(member),
        },
      ]);
    }
  };

  const executeRemoveMember = async (member: TeamMembershipWithUser) => {
    setProcessingMemberId(member.id);
    try {
      await removeMemberMutation.mutateAsync({
        teamId: member.team_id,
        userId: member.user_id,
      });
      if (onMemberChange) onMemberChange();
    } catch (err) {
      console.error("メンバー削除エラー:", err);
      const errorMessage = toUserFacingMessage(err, t("teams.mobile.memberDeleteFailed"));
      if (Platform.OS === "web") {
        window.alert(errorMessage);
      } else {
        Alert.alert(t("common.error"), errorMessage, [{ text: "OK" }]);
      }
    } finally {
      setProcessingMemberId(null);
    }
  };

  // 各種目の距離カラム構成をメモ化
  const styleColumns = useMemo(() => {
    return STYLES.map((style) => ({
      style,
      distances: getDistancesForStyle(style),
      colors: STYLE_COLORS[style],
    }));
  }, []);

  // 横スクロール同期用ref（ボディ→ヘッダーの一方向同期）
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);

  const handleBodyScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }, []);

  // 泳者の行と非泳者の展開行はどちらもベストタイム付きの通常の行として同じ見た目で
  // 描画する（要件3）。groupHeaders の付け替えとは無関係に呼び出せるよう、
  // 単なる関数として切り出す（JSX タグとしては使わずレンダー内で直接呼ぶ）。
  const renderMemberNameCell = (item: TeamMembershipWithUser) => {
    const isCurrentUser = item.user_id === currentUserId;
    return (
      <Pressable
        key={item.id}
        onPress={() => handleMemberPress(item)}
        style={[
          styles.nameCell,
          styles.cellBorderRight,
          styles.memberRowBorderTop,
          isCurrentUser && styles.nameCellCurrent,
        ]}
      >
        <View style={styles.nameCellContent}>
          <View style={styles.nameCellNameRow}>
            <Text style={styles.nameCellText} numberOfLines={1}>
              {item.users.name || t("teams.mobile.unnamedMember")}
            </Text>
            {item.role === "admin" && <Feather name="star" size={9} color="#EAB308" />}
          </View>
          {isCurrentUser && <Text style={styles.nameCellYou}>{t("teams.mobile.youLabel")}</Text>}
        </View>
      </Pressable>
    );
  };

  const renderMemberTimeRow = (item: TeamMembershipWithUser) => {
    const isCurrentUser = item.user_id === currentUserId;
    return (
      <Pressable
        key={item.id}
        onPress={() => handleMemberPress(item)}
        style={[styles.memberRow, styles.memberRowBorderTop, isCurrentUser && styles.memberRowCurrent]}
      >
        {styleColumns.map(({ style, distances, colors }) =>
          distances.map((distance) => {
            const bestTime = getBestTime(item.id, style, distance, includeRelaying);
            // New 判定は大会実施日が基準。一括登録 (competition なし) は対象外
            const isNew = isNewRecord(bestTime?.competitionDate);
            const suffix = bestTime
              ? formatBestTimeSuffix({
                  poolType: bestTime.poolType as 0 | 1,
                  isRelaying: bestTime.isRelaying,
                })
              : "";
            const cellStyle = [
              styles.timeCell,
              {
                backgroundColor: isInvalidCombination(style, distance) ? "#E5E7EB" : colors.bg,
              },
              styles.cellBorderRight,
            ];

            // メンバーの識別子も含める（同じ種目・距離でも別メンバーの行は別セルとして扱う）
            const cellKey = `${item.id}-${style}-${distance}`;

            // 空セル（記録なし）はタップ対象にしない
            if (!bestTime) {
              return (
                <View key={cellKey} style={cellStyle}>
                  <Text style={styles.timeCellEmpty}>—</Text>
                </View>
              );
            }

            return (
              <Pressable key={cellKey} onPress={() => handleCellPress(cellKey, bestTime)} style={cellStyle}>
                <Text style={[styles.timeCellValue, isNew && styles.timeCellValueNew]}>
                  {formatTime(bestTime.time)}
                  {suffix !== "" && <Text style={styles.timeCellSuffix}> {suffix}</Text>}
                </Text>
              </Pressable>
            );
          }),
        )}
      </Pressable>
    );
  };

  // ローディング状態
  if (isLoading && members.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message={t("teams.mobile.memberLoading")} />
      </View>
    );
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || t("teams.mobile.memberFetchFailed")}
          onRetry={onRetry}
        />
      </View>
    );
  }

  // 空状態
  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="users" size={48} color="#9CA3AF" />
        <Text style={styles.emptyText}>{t("teams.mobile.memberListEmpty")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 上部固定エリア（グループフィルター + 引き継ぎトグル） */}
      <View style={styles.fixedTop}>
        {/* 「WAポイントで比較」ボタンと info アイコンはランキングタブ
            (components/teams/rankings/TeamRankings.tsx) へ移設済み。
            タイトルと人数はカードごと撤去し、人数はテーブル左上セルへ移した */}
        <View style={styles.groupFilterRow}>
          {/* グループ表示（カテゴリピル） */}
          <View style={styles.groupFilterFill}>
            <TeamMemberGroupFilter
              teamId={teamId}
              supabase={supabase}
              members={members}
              onGroupedMembersChange={handleGroupedMembersChange}
            />
          </View>
          <View style={styles.includeRelayToggle}>
            <Text style={styles.includeRelayLabel} numberOfLines={1}>
              {t("teams.memberStats.includeRelay")}
            </Text>
            <Switch
              value={includeRelaying}
              onValueChange={setIncludeRelaying}
              trackColor={{ false: "#D1D5DB", true: "#93C5FD" }}
              thumbColor={includeRelaying ? "#2563EB" : "#F3F4F6"}
              accessibilityRole="switch"
              accessibilityLabel={t("teams.memberStats.includeRelay")}
            />
          </View>
        </View>
      </View>

      {/* ベストタイムテーブル */}
      {loadingBestTimes && !hasLoadedBestTimes ? (
        <View style={styles.tableLoading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.tableLoadingText}>{t("teams.mobile.bestTimeLoading")}</Text>
        </View>
      ) : (
        <View style={styles.tableWrapper}>
          {/* === 固定ヘッダー行（種目名 + 距離） === */}
          <View style={styles.tableHeaderFixed}>
            {/* 左上: 人数 (旧「メンバー」ラベルの位置) */}
            <View style={[styles.nameHeaderCellFrozen, styles.cellBorderRight]}>
              <Text
                style={styles.nameHeaderText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {t("teams.mobile.memberListTotal", { count: members.length })}
              </Text>
            </View>
            {/* 右上: 種目ヘッダー（横スクロール同期） */}
            <ScrollView
              ref={headerScrollRef}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              style={styles.scrollableColumns}
            >
              <View>
                {/* Row 1: 種目名 */}
                <View style={styles.headerRow}>
                  {styleColumns.map(({ style, distances, colors }) => (
                    <View
                      key={style}
                      style={[
                        styles.styleGroupHeader,
                        {
                          width: TIME_CELL_WIDTH * distances.length,
                          backgroundColor: colors.header,
                        },
                        styles.cellBorderRight,
                      ]}
                    >
                      <Text style={[styles.styleGroupHeaderText, { color: colors.text }]}>
                        {t(`practice.styles.${STYLE_KEY_MAP[style]}`)}
                      </Text>
                    </View>
                  ))}
                </View>
                {/* Row 2: 距離（タップでソート） */}
                <View style={styles.headerRow}>
                  {styleColumns.map(({ style, distances, colors }) =>
                    distances.map((distance) => {
                      const isSorted = sortStyle === style && sortDistance === distance;
                      return (
                        <Pressable
                          key={`${style}-${distance}`}
                          onPress={() => handleSort(style, distance)}
                          style={[
                            styles.distanceHeaderCell,
                            { backgroundColor: isSorted ? colors.text + "20" : colors.header },
                            styles.cellBorderRight,
                          ]}
                        >
                          <View style={styles.distanceHeaderContent}>
                            <Text
                              style={[
                                styles.distanceHeaderText,
                                isSorted && { color: colors.text, fontWeight: "700" },
                              ]}
                            >
                              {distance}m
                            </Text>
                            {isSorted && (
                              <Text style={[styles.sortIndicator, { color: colors.text }]}>
                                {sortOrder === "asc" ? "↑" : "↓"}
                              </Text>
                            )}
                          </View>
                        </Pressable>
                      );
                    }),
                  )}
                </View>
              </View>
            </ScrollView>
          </View>

          {/* === スクロール可能なメンバー行 === */}
          <ScrollView
            style={styles.tableBodyScroll}
            contentContainerStyle={styles.tableBodyScrollContent}
          >
            <View style={styles.tableBody}>
              {/* 固定メンバー名列 */}
              <View style={styles.frozenColumn}>
                {displayedMembers.map((item, idx) => {
                  const groupName = displayedGroupHeaders.get(idx);

                  return (
                    <React.Fragment key={item.id}>
                      {groupName !== undefined && (
                        <View
                          style={[
                            styles.groupHeaderRowFrozen,
                            idx > 0 && styles.memberRowBorderTop,
                          ]}
                        >
                          <Text style={styles.groupHeaderText}>{groupName}</Text>
                        </View>
                      )}
                      {renderMemberNameCell(item)}
                    </React.Fragment>
                  );
                })}
                {/* 非泳者行（表の流れの中、最後のメンバー行の直下）。groupHeaders の
                    インデックス計算 (displayedMembers 基準) には一切関与させず、
                    描画の最後に独立して追加する。0人のときは行自体を出さない。 */}
                {nonSwimmerMembers.length > 0 && (
                  <>
                    <Pressable
                      onPress={handleToggleNonSwimmerExpanded}
                      style={[
                        styles.groupHeaderRowFrozen,
                        styles.memberRowBorderTop,
                        styles.nonSwimmerToggleRow,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isNonSwimmerExpanded }}
                      accessibilityLabel={t("teams.nonSwimmer.sectionToggle", {
                        count: nonSwimmerMembers.length,
                      })}
                    >
                      <View style={styles.nameCellContent}>
                        <View style={styles.nameCellNameRow}>
                          <Text style={styles.nameCellText} numberOfLines={1}>
                            {t("teams.nonSwimmer.sectionToggle", {
                              count: nonSwimmerMembers.length,
                            })}
                          </Text>
                          <Feather
                            name={isNonSwimmerExpanded ? "chevron-down" : "chevron-right"}
                            size={12}
                            color="#6B7280"
                          />
                        </View>
                      </View>
                    </Pressable>
                    {isNonSwimmerExpanded &&
                      nonSwimmerMembers.map((item) => renderMemberNameCell(item))}
                  </>
                )}
              </View>

              {/* スクロール可能なタイム列（横スクロール同期） */}
              <ScrollView
                ref={bodyScrollRef}
                horizontal
                showsHorizontalScrollIndicator
                scrollEventThrottle={16}
                onScroll={handleBodyScroll}
                style={styles.scrollableColumns}
              >
                <View>
                  {displayedMembers.map((item, idx) => {
                    const groupName = displayedGroupHeaders.get(idx);

                    return (
                      <React.Fragment key={item.id}>
                        {groupName !== undefined && (
                          <View
                            style={[
                              styles.groupHeaderRowScrollable,
                              idx > 0 && styles.memberRowBorderTop,
                            ]}
                          />
                        )}
                        {renderMemberTimeRow(item)}
                      </React.Fragment>
                    );
                  })}
                  {/* 非泳者行（名前列側と対になる、横スクロールするタイム列側）。
                      トグル行自体はタイム値を持たないため空セルとして高さだけ揃える。
                      展開時はベストタイム付きの通常の行 (renderMemberTimeRow) を追加する。 */}
                  {nonSwimmerMembers.length > 0 && (
                    <>
                      <View style={[styles.groupHeaderRowScrollable, styles.memberRowBorderTop]} />
                      {isNonSwimmerExpanded &&
                        nonSwimmerMembers.map((item) => renderMemberTimeRow(item))}
                    </>
                  )}
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      )}

      {/* メンバー詳細モーダル */}
      <MemberDetailModal
        isOpen={isMemberDetailOpen}
        onClose={handleMemberDetailClose}
        member={selectedMember}
        currentUserId={currentUserId}
        isCurrentUserAdmin={isCurrentUserAdmin}
        onMembershipChange={onMemberChange}
      />

      {/* ベストタイムセルの詳細シート */}
      <BestTimeDetailSheet
        detail={selectedCellDetail}
        onClose={closeCellDetail}
        noteFallbackLabel={t("teams.membersTimeTable.bulkEntryNote")}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },

  /* グループ表示行（左: カテゴリピル / 右端: 引き継ぎトグル） */
  groupFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  // RN の flexShrink 既定は 0 なので、ピルの横スクロール領域には明示的に flex を与える。
  // これが無いとピルがトグルを画面外へ押し出す
  groupFilterFill: {
    flex: 1,
  },
  includeRelayToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  includeRelayLabel: {
    fontSize: 11,
    color: "#374151",
    flexShrink: 1,
  },
  /* テーブルローディング */
  tableLoading: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 40,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tableLoadingText: {
    fontSize: 13,
    color: "#6B7280",
  },

  /* 上部固定エリア */
  fixedTop: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 0,
  },

  /* テーブルヘッダー固定 */
  tableHeaderFixed: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },

  /* テーブルボディスクロール */
  tableBodyScroll: {
    flex: 1,
  },
  tableBodyScrollContent: {
    paddingBottom: 40,
  },

  /* テーブルラッパー */
  tableWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: "hidden",
  },
  tableBody: {
    flexDirection: "row",
  },
  frozenColumn: {
    width: NAME_COL_WIDTH,
    zIndex: 1,
  },
  scrollableColumns: {
    flex: 1,
  },
  nameHeaderCellFrozen: {
    width: NAME_COL_WIDTH,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
    justifyContent: "center",
    height: 46,
  },

  /* ヘッダー行 */
  headerRow: {
    flexDirection: "row",
  },
  nameHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  styleGroupHeader: {
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  styleGroupHeaderText: {
    fontSize: 11,
    fontWeight: "700",
  },
  distanceHeaderCell: {
    width: TIME_CELL_WIDTH,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  distanceHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  distanceHeaderText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#374151",
  },
  sortIndicator: {
    fontSize: 8,
    fontWeight: "700",
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: BORDER_COLOR,
  },

  /* グループヘッダー行 */
  groupHeaderRow: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  groupHeaderRowFrozen: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 5,
    justifyContent: "center",
    width: NAME_COL_WIDTH,
    height: 28,
  },
  groupHeaderRowScrollable: {
    backgroundColor: "#F3F4F6",
    height: 28,
  },
  // groupHeaderRowFrozen 単体 (default flexDirection: "column") では、直下の
  // nameCellContent が flex: 1 で主軸 (縦方向) いっぱいに伸びてしまい、
  // justifyContent: "center" が分配できる余白が残らない。結果として内部の
  // nameCellNameRow は column の既定値 flex-start = 上端に留まる。
  // nameCell (メンバー行) は同じ nameCellContent を使うが flexDirection: "row" +
  // alignItems: "center" を持つため、flex: 1 は横方向 (主軸) に効いて幅を埋め、
  // 縦方向 (交差軸) は alignItems: "center" が stretch を上書きしてコンテンツの
  // 高さぶんだけ確保した上で中央寄せする。非泳者トグル行だけ同じ構造を追加する。
  nonSwimmerToggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#374151",
  },

  /* メンバー行 */
  memberRow: {
    flexDirection: "row",
    height: ROW_HEIGHT,
  },
  memberRowBorderTop: {
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  memberRowCurrent: {
    backgroundColor: "#EFF6FF",
  },

  /* メンバー名セル */
  nameCell: {
    width: NAME_COL_WIDTH,
    height: ROW_HEIGHT,
    paddingHorizontal: 5,
    backgroundColor: "#F9FAFB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nameCellCurrent: {
    backgroundColor: "#EFF6FF",
  },
  nameCellContent: {
    flex: 1,
    minWidth: 0,
  },
  nameCellNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  nameCellText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#111827",
    flexShrink: 1,
  },
  nameCellYou: {
    fontSize: 8,
    color: "#2563EB",
  },
  /* タイムセル */
  timeCell: {
    width: TIME_CELL_WIDTH,
    height: ROW_HEIGHT,
    paddingHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timeCellValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  timeCellValueNew: {
    color: "#DC2626",
  },
  timeCellSuffix: {
    fontSize: 8,
  },
  timeCellEmpty: {
    fontSize: 11,
    color: "#D1D5DB",
  },

  /* 空状態 */
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
  },
});
