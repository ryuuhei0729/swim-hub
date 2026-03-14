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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { parseISO, differenceInDays } from "date-fns";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
} from "@apps/shared/hooks/queries/teams";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { formatTime } from "@/utils/formatters";
import { TeamMemberGroupFilter } from "./TeamMemberGroupFilter";
import { MemberDetailModal } from "./member-detail";

// ベストタイム型定義
interface MemberBestTime {
  styleName: string;
  time: number;
  poolType: number; // 0: 短水路, 1: 長水路
  isRelaying: boolean;
  createdAt: string;
  hasCompetition: boolean;
}

// 種目リスト（WEBと同様）
const STYLES = ["自由形", "平泳ぎ", "背泳ぎ", "バタフライ", "個人メドレー"] as const;
const DISTANCES = [50, 100, 200, 400, 800] as const;

// 種目の色定義
const STYLE_COLORS: Record<string, { bg: string; header: string; text: string }> = {
  自由形: { bg: "#FEFCE8", header: "#FEF9C3", text: "#854D0E" },
  平泳ぎ: { bg: "#F0FDF4", header: "#DCFCE7", text: "#166534" },
  背泳ぎ: { bg: "#FEF2F2", header: "#FEE2E2", text: "#991B1B" },
  バタフライ: { bg: "#EFF6FF", header: "#DBEAFE", text: "#1E40AF" },
  個人メドレー: { bg: "#FDF2F8", header: "#FCE7F3", text: "#9D174D" },
};

/**
 * 種目×距離の有効な組み合わせかチェック
 */
const isInvalidCombination = (style: string, distance: number): boolean => {
  if (style === "個人メドレー" && (distance === 50 || distance === 800)) return true;
  if (
    (style === "平泳ぎ" || style === "背泳ぎ" || style === "バタフライ") &&
    (distance === 400 || distance === 800)
  )
    return true;
  return false;
};

/**
 * 各種目の有効な距離リスト
 */
const getDistancesForStyle = (style: string): number[] => {
  return DISTANCES.filter((d) => !isInvalidCombination(style, d));
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
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase);
  const removeMemberMutation = useRemoveMemberMutation(supabase);
  const [_processingMemberId, setProcessingMemberId] = useState<string | null>(null);

  // メンバー詳細モーダル
  const [selectedMember, setSelectedMember] = useState<TeamMembershipWithUser | null>(null);
  const [isMemberDetailOpen, setIsMemberDetailOpen] = useState(false);

  const handleMemberPress = useCallback((member: TeamMembershipWithUser) => {
    setSelectedMember(member);
    setIsMemberDetailOpen(true);
  }, []);

  const handleMemberDetailClose = useCallback(() => {
    setIsMemberDetailOpen(false);
    setSelectedMember(null);
  }, []);

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

  // ソート状態（WEB版 useMemberSort 準拠）
  const [sortStyle, setSortStyle] = useState<string | null>(null);
  const [sortDistance, setSortDistance] = useState<number | null>(null);

  const handleSort = useCallback(
    (style: string, distance: number) => {
      if (sortStyle === style && sortDistance === distance) {
        // 同じセルをタップ → ソート解除
        setSortStyle(null);
        setSortDistance(null);
      } else {
        // 新しいセル → 昇順ソート
        setSortStyle(style);
        setSortDistance(distance);
      }
    },
    [sortStyle, sortDistance],
  );

  // ベストタイムデータ
  const [bestTimesMap, setBestTimesMap] = useState<Map<string, MemberBestTime[]>>(new Map());
  const [loadingBestTimes, setLoadingBestTimes] = useState(false);

  // メンバーのベストタイムを一括取得
  const loadBestTimes = useCallback(async () => {
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
          pool_type,
          is_relaying,
          styles!records_style_id_fkey (
            name_jp,
            distance
          ),
          competitions!records_competition_id_fkey (
            id
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
              pool_type: number;
              is_relaying: boolean;
              styles?:
                | { name_jp: string; distance: number }
                | null
                | { name_jp: string; distance: number }[];
              competitions?: { id: string } | null | { id: string }[];
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
                hasCompetition: !!competition,
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
    }
  }, [members, supabase]);

  useEffect(() => {
    if (members.length > 0) {
      loadBestTimes();
    }
  }, [members, loadBestTimes]);

  // 特定メンバーの種目×距離のベストタイムを取得
  const getBestTime = useCallback(
    (memberId: string, styleName: string, distance: number): MemberBestTime | null => {
      const times = bestTimesMap.get(memberId) || [];
      const dbStyleName = `${distance}m${styleName}`;

      const candidates = times.filter((bt) => bt.styleName === dbStyleName && !bt.isRelaying);
      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    },
    [bestTimesMap],
  );

  // ソート適用済みメンバーリスト
  const { sortedMembers, sortedGroupHeaders } = useMemo(() => {
    if (!sortStyle || sortDistance === null) {
      return { sortedMembers: groupedMembers, sortedGroupHeaders: groupHeaders };
    }

    const compareFn = (a: TeamMembershipWithUser, b: TeamMembershipWithUser): number => {
      const timeA = getBestTime(a.id, sortStyle, sortDistance);
      const timeB = getBestTime(b.id, sortStyle, sortDistance);
      if (!timeA && !timeB) return 0;
      if (!timeA) return 1;
      if (!timeB) return -1;
      return timeA.time - timeB.time;
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
  }, [groupedMembers, groupHeaders, sortStyle, sortDistance, getBestTime]);

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
      const errorMessage = err instanceof Error ? err.message : "ロールの変更に失敗しました";
      if (Platform.OS === "web") {
        window.alert(errorMessage);
      } else {
        Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
      }
    } finally {
      setProcessingMemberId(null);
    }
  };

  // メンバー削除処理
  const _handleRemoveMember = (member: TeamMembershipWithUser) => {
    const memberName = member.users.name || "このメンバー";
    const confirmMessage = `${memberName}をチームから削除しますか？\nこの操作は取り消せません。`;

    if (Platform.OS === "web") {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      executeRemoveMember(member);
    } else {
      Alert.alert("削除確認", confirmMessage, [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
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
      const errorMessage = err instanceof Error ? err.message : "メンバーの削除に失敗しました";
      if (Platform.OS === "web") {
        window.alert(errorMessage);
      } else {
        Alert.alert("エラー", errorMessage, [{ text: "OK" }]);
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

  // 横スクロール同期用ref
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const isHeaderScrolling = useRef(false);
  const isBodyScrolling = useRef(false);

  const handleHeaderScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isBodyScrolling.current) return;
    isHeaderScrolling.current = true;
    bodyScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
    isHeaderScrolling.current = false;
  }, []);

  const handleBodyScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isHeaderScrolling.current) return;
    isBodyScrolling.current = true;
    headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
    isBodyScrolling.current = false;
  }, []);

  // ローディング状態
  if (isLoading && members.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="メンバーを読み込み中..." />
      </View>
    );
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || "メンバー一覧の取得に失敗しました"}
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
        <Text style={styles.emptyText}>メンバーがいません</Text>
      </View>
    );
  }

  const adminCount = members.filter((m) => m.role === "admin").length;
  const userCount = members.filter((m) => m.role === "user").length;

  return (
    <View style={styles.container}>
      {/* 上部固定エリア（統計 + グループフィルター） */}
      <View style={styles.fixedTop}>
        {/* メンバー統計ヘッダー */}
        <View style={styles.statsHeader}>
          <Text style={styles.statsTitle}>メンバー</Text>
          <View style={styles.statsRow}>
            <Text style={styles.statsText}>
              合計: <Text style={styles.statsValue}>{members.length}人</Text>
            </Text>
            <Text style={styles.statsText}>
              管理者: <Text style={[styles.statsValue, styles.statsAdmin]}>{adminCount}人</Text>
            </Text>
            <Text style={styles.statsText}>
              メンバー: <Text style={styles.statsValue}>{userCount}人</Text>
            </Text>
          </View>
        </View>

        {/* グループ表示 */}
        <TeamMemberGroupFilter
          teamId={teamId}
          supabase={supabase}
          members={members}
          onGroupedMembersChange={handleGroupedMembersChange}
        />
      </View>

      {/* ベストタイムテーブル */}
      {loadingBestTimes ? (
        <View style={styles.tableLoading}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.tableLoadingText}>ベストタイム読込中...</Text>
        </View>
      ) : (
        <View style={styles.tableWrapper}>
          {/* === 固定ヘッダー行（種目名 + 距離） === */}
          <View style={styles.tableHeaderFixed}>
            {/* 左上: メンバーラベル */}
            <View style={[styles.nameHeaderCellFrozen, styles.cellBorderRight]}>
              <Text style={styles.nameHeaderText}>メンバー</Text>
            </View>
            {/* 右上: 種目ヘッダー（横スクロール同期） */}
            <ScrollView
              ref={headerScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={handleHeaderScroll}
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
                        {style}
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
                              <Text style={[styles.sortIndicator, { color: colors.text }]}>↑</Text>
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
                {sortedMembers.map((item, idx) => {
                  const user = item.users;
                  const isCurrentUser = item.user_id === currentUserId;
                  const groupName = sortedGroupHeaders.get(idx);

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
                      <Pressable
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
                              {user.name || "名前未設定"}
                            </Text>
                            {item.role === "admin" && (
                              <Feather name="star" size={9} color="#EAB308" />
                            )}
                          </View>
                          {isCurrentUser && <Text style={styles.nameCellYou}>あなた</Text>}
                        </View>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
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
                  {sortedMembers.map((item, idx) => {
                    const isCurrentUser = item.user_id === currentUserId;
                    const groupName = sortedGroupHeaders.get(idx);

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
                        <Pressable
                          onPress={() => handleMemberPress(item)}
                          style={[
                            styles.memberRow,
                            styles.memberRowBorderTop,
                            isCurrentUser && styles.memberRowCurrent,
                          ]}
                        >
                          {styleColumns.map(({ style, distances, colors }) =>
                            distances.map((distance) => {
                              const bestTime = getBestTime(item.id, style, distance);
                              const isNew = bestTime?.hasCompetition
                                ? differenceInDays(new Date(), parseISO(bestTime.createdAt)) <= 30
                                : false;
                              return (
                                <View
                                  key={`${item.id}-${style}-${distance}`}
                                  style={[
                                    styles.timeCell,
                                    {
                                      backgroundColor: isInvalidCombination(style, distance)
                                        ? "#E5E7EB"
                                        : colors.bg,
                                    },
                                    styles.cellBorderRight,
                                  ]}
                                >
                                  {bestTime ? (
                                    <Text
                                      style={[
                                        styles.timeCellValue,
                                        isNew && styles.timeCellValueNew,
                                      ]}
                                    >
                                      {formatTime(bestTime.time)}
                                      {bestTime.poolType === 1 && (
                                        <Text style={styles.timeCellSuffix}> L</Text>
                                      )}
                                    </Text>
                                  ) : (
                                    <Text style={styles.timeCellEmpty}>—</Text>
                                  )}
                                </View>
                              );
                            }),
                          )}
                        </Pressable>
                      </React.Fragment>
                    );
                  })}
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

  /* 統計ヘッダー */
  statsHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statsText: {
    fontSize: 12,
    color: "#6B7280",
  },
  statsValue: {
    fontWeight: "600",
    color: "#111827",
  },
  statsAdmin: {
    color: "#EAB308",
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
