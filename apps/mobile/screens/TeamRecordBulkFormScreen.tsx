import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys, recordKeys } from "@apps/shared/hooks/queries/keys";
import { StyleAPI } from "@apps/shared/api/styles";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import {
  planEntryAdditionsForRecords,
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@apps/shared/utils/entryRecordMerge";
import {
  normalizeReactionTime,
  toReactionTimeValue,
} from "@apps/shared/utils/reactionTime";
import { formatTimeBest } from "@/utils/formatters";
import { localizedStyleName } from "@/utils/styleName";
import { LapTimeDisplay } from "@/components/records/LapTimeDisplay";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { VideoUploader } from "@/components/shared/VideoUploader";
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import { MemberSelectModal } from "@/components/teams/MemberSelectModal";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import {
  uploadVideoForTeamMember,
  MissingThumbnailError,
} from "@/utils/videoUpload";
import { useQuickTimeInput } from "@/hooks/useQuickTimeInput";
import type { MainStackParamList } from "@/navigation/types";
import type { Style, PoolType, RecordInsert } from "@apps/shared/types";
import {
  buildRelayEvents,
  RelayEventId,
  isRelayingForLeg,
  calcCumulativeTimes,
  calcLegTimesFromCumulative,
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
} from "./teamRecordBulk/relayEvents";
import {
  buildStyleEntriesFromExisting,
  applyEntryAdditionsToStyleEntries,
  stampExistingEntryTimeReferences,
  type MemberRecord,
  type StyleEntry,
  type SplitTimeEntry,
  type ExistingRecord,
} from "./teamRecordBulk/buildStyleEntries";

type RouteProps = RouteProp<MainStackParamList, "TeamRecordBulkForm">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

const RELAY_FREE_PLAN_MAX_SPLITS = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD * 4;

/** RN には crypto.randomUUID がないため簡易 ID 生成（クライアント内のみで使用） */
let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `e-${Date.now().toString(36)}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

interface CompetitionInfo {
  id: string;
  title: string | null;
  pool_type: PoolType;
}

/**
 * チーム大会記録の一括代理入力画面（管理者専用 / Web 完全パリティ）
 * - 種目エントリごとにメンバーを複数選択し、メンバー行ごとにタイム入力
 * - 個人種目 + リレー種目（leg/累計、relaySplit）
 * - 編集モード（既存記録ロード → 全削除→再挿入）
 * - 代理動画添付（team-assign 経由、Premium ゲート）
 */
export const TeamRecordBulkFormScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { competitionId, teamId } = route.params;
  const { supabase, subscription, user, getAccessToken } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isPremium = checkIsPremium(subscription);
  const { parseInput } = useQuickTimeInput();

  const parseTimeToSeconds = (value: string): number => {
    if (!value || value.trim() === "") return 0;
    return parseInput(value).time;
  };

  // メンバー一覧（権限判定にも使用）
  const { members, isLoading: membersLoading } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  const [styles_, setStyles] = useState<Style[]>([]);
  const [competition, setCompetition] = useState<CompetitionInfo | null>(null);
  const [styleEntries, setStyleEntries] = useState<StyleEntry[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingRecords, setExistingRecords] = useState<ExistingRecord[]>([]);

  // メンバー選択モーダル
  const [memberModalEntryId, setMemberModalEntryId] = useState<string | null>(
    null,
  );
  // 種目選択モーダル
  const [stylePickerEntryId, setStylePickerEntryId] = useState<string | null>(
    null,
  );
  // リレー泳者選択モーダル（entryId + legIndex）
  const [legPicker, setLegPicker] = useState<{
    entryId: string;
    legIndex: number;
  } | null>(null);

  const relayEvents = useMemo(
    () =>
      buildRelayEvents({
        ba: t("practice.styles.Ba"),
        br: t("practice.styles.Br"),
        fly: t("practice.styles.Fly"),
        fr: t("practice.styles.Fr"),
        legLabel: (num, style) =>
          t("competition.records.relayLegLabel", { num, style }),
        freeRelaySuffix: t("competition.records.freeRelaySuffix"),
        medleyRelaySuffix: t("competition.records.medleyRelaySuffix"),
      }),
    [t],
  );

  // 種目・大会・既存記録をロード
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const styleApi = new StyleAPI(supabase);
        const [stylesData, competitionRes, recordsRes, entriesRes] =
          await Promise.all([
            styleApi.getStyles(),
            supabase
              .from("competitions")
              .select("id, title, pool_type")
              .eq("id", competitionId)
              .eq("team_id", teamId)
              .single(),
            supabase
              .from("records")
              .select(
                `id, user_id, style_id, time, is_relaying, reaction_time, note,
               split_times ( id, distance, split_time ),
               users:users!records_user_id_fkey ( id, name )`,
              )
              .eq("competition_id", competitionId)
              .eq("team_id", teamId)
              .order("created_at", { ascending: true }),
            // エントリー（申告タイム）。記録の初期行反映と参照ラベル表示に使う（entry_time は
            // 入力欄には絶対に入れない。仕様#1）
            supabase
              .from("entries")
              .select(
                `id, user_id, style_id, entry_time, note,
               users:users!entries_user_id_fkey ( id, name )`,
              )
              .eq("competition_id", competitionId)
              .eq("team_id", teamId)
              .order("created_at", { ascending: true }),
          ]);

        if (!isMounted) return;

        if (competitionRes.error || !competitionRes.data) {
          throw (
            competitionRes.error ||
            new Error(t("recordMobile.competitionFetchFailed"))
          );
        }

        const comp = competitionRes.data as unknown as {
          id: string;
          title: string | null;
          pool_type: PoolType;
        };
        const records = (recordsRes.data || []) as unknown as ExistingRecord[];
        // entries は補助データ（初期反映・参考表示専用）。取得失敗は記録入力をブロックせず、
        // recordsRes と同様に空配列へフォールバックする（web RecordDataLoader.tsx と同じ設計。
        // Reviewer 指摘: entries を fatal 扱いすると本機能追加前は無かった単一障害点が生まれる）。
        if (entriesRes.error) {
          console.error(
            "エントリー取得エラー（記録入力は続行）:",
            entriesRes.error,
          );
        }
        const rawEntries = (entriesRes.error
          ? []
          : entriesRes.data || []) as unknown as Array<{
          id: string;
          user_id: string;
          style_id: number;
          entry_time: number | null;
          note: string | null;
          users?: { id: string; name: string | null } | null;
        }>;

        setStyles(stylesData);
        setCompetition({
          id: comp.id,
          title: comp.title,
          pool_type: comp.pool_type,
        });
        setExistingRecords(records);
        setIsEditMode(records.length > 0);

        // 既存記録を優先し、不足分だけエントリーから初期行として追加する（仕様#2）。
        // (user_id, style_id) の重複排除とリレーグループ不可侵は shared の
        // planEntryAdditionsForRecords が保証する（mobile 側では再実装しない）。
        const baseStyleEntries = buildStyleEntriesFromExisting(
          records,
          stylesData,
        );
        const entryRows: EntryRowForRecordMerge[] = rawEntries.map((e) => ({
          id: e.id,
          user_id: e.user_id,
          style_id: e.style_id,
          entry_time: e.entry_time,
          note: e.note,
          userName:
            e.users?.name || t("teams.competitionRecordsModal.unknownUser"),
        }));
        const plans = planEntryAdditionsForRecords(
          entryRows,
          baseStyleEntries,
          stylesData,
        );
        const merged = applyEntryAdditionsToStyleEntries(
          baseStyleEntries,
          plans,
        );

        // 既存記録由来の行にも参考表示 (entryTimeReference) を後付けする（仕様#修正3:
        // 重複排除で追加されなかった行でも、申告タイムと結果タイムを見比べられるようにする）
        const entryTimeByUserStyle = buildEntryTimeReferenceLookup(entryRows);
        setStyleEntries(
          stampExistingEntryTimeReferences(merged, entryTimeByUserStyle),
        );
      } catch (err) {
        if (!isMounted) return;
        console.error("チーム記録ロードエラー:", err);
        setLoadError(
          err instanceof Error ? err.message : t("recordMobile.saveFailed"),
        );
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [supabase, competitionId, teamId, t]);

  // ---- StyleEntry 操作（Web RecordClient と同ロジック）----

  const addStyleEntry = () => {
    setStyleEntries((prev) => [
      ...prev,
      { id: genId(), styleId: "", styleName: "", memberRecords: [] },
    ]);
  };

  const removeStyleEntry = (entryId: string) => {
    setStyleEntries((prev) =>
      prev.length > 1 ? prev.filter((e) => e.id !== entryId) : prev,
    );
  };

  const updateStyleEntry = (entryId: string, styleId: number) => {
    const style = styles_.find((s) => s.id === styleId);
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              styleId,
              styleName: style?.name_jp || "",
              relayEventId: null,
            }
          : entry,
      ),
    );
  };

  const updateRelayEntry = (entryId: string, relayEventId: RelayEventId) => {
    const relayDef = relayEvents.find((r) => r.id === relayEventId);
    if (!relayDef) return;

    const legRecords: MemberRecord[] = relayDef.legs.map((leg) => ({
      id: genId(),
      memberUserId: "",
      memberName: "",
      time: 0,
      timeDisplayValue: "",
      reactionTime: "",
      isRelaying: isRelayingForLeg(leg.legIndex),
      note: "",
      splitTimes: [],
      relayLegStyleId: leg.styleId,
      relayLegLabel: leg.legLabel,
      cumulativeTimeSeconds: 0,
    }));

    const legBoundaries = getRelayLegBoundaries(relayEventId);
    const defaultSplitDistances = legBoundaries.slice(0, 3);
    const allowedCount = isPremium
      ? defaultSplitDistances.length
      : Math.max(
          0,
          Math.min(defaultSplitDistances.length, RELAY_FREE_PLAN_MAX_SPLITS),
        );
    const defaultSplits: SplitTimeEntry[] = defaultSplitDistances
      .slice(0, allowedCount)
      .map((distance) => ({
        id: genId(),
        distance,
        splitTime: 0,
        displayValue: "",
      }));

    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              styleId: relayDef.legs[0].styleId,
              styleName: relayDef.label,
              relayEventId,
              memberRecords: legRecords,
              relaySplitTimes: defaultSplits,
            }
          : entry,
      ),
    );
  };

  const confirmMemberSelection = (
    entryId: string,
    selectedUserIds: string[],
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const newMemberRecords: MemberRecord[] = [];
        for (const userId of selectedUserIds) {
          const existing = entry.memberRecords.find(
            (mr) => mr.memberUserId === userId,
          );
          if (existing) {
            newMemberRecords.push(existing);
          } else {
            const member = members.find((m) => m.user_id === userId);
            if (member) {
              newMemberRecords.push({
                id: genId(),
                memberUserId: userId,
                memberName: member.users?.name || "",
                time: 0,
                timeDisplayValue: "",
                reactionTime: "",
                isRelaying: false,
                note: "",
                splitTimes: [],
              });
            }
          }
        }
        return { ...entry, memberRecords: newMemberRecords };
      }),
    );
    setMemberModalEntryId(null);
  };

  const updateMemberRecordByIndex = (
    entryId: string,
    legIndex: number,
    updates: Partial<MemberRecord>,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id !== entryId
          ? entry
          : {
              ...entry,
              memberRecords: entry.memberRecords.map((mr, idx) =>
                idx === legIndex ? { ...mr, ...updates } : mr,
              ),
            },
      ),
    );
  };

  const updateMemberRecord = (
    entryId: string,
    memberUserId: string,
    updates: Partial<MemberRecord>,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id !== entryId
          ? entry
          : {
              ...entry,
              memberRecords: entry.memberRecords.map((mr) =>
                mr.memberUserId === memberUserId ? { ...mr, ...updates } : mr,
              ),
            },
      ),
    );
  };

  // 反応時間: 他の記録入力画面 (RecordLogFormScreen / CompetitionTabFormScreen) と同じく
  // blur 時に -1〜2 へクランプする
  const handleReactionTimeBlurByIndex = (
    entryId: string,
    legIndex: number,
    value: string,
  ) => {
    updateMemberRecordByIndex(entryId, legIndex, {
      reactionTime: normalizeReactionTime(value),
    });
  };

  const handleReactionTimeBlur = (
    entryId: string,
    memberUserId: string,
    value: string,
  ) => {
    updateMemberRecord(entryId, memberUserId, {
      reactionTime: normalizeReactionTime(value),
    });
  };

  const handleTimeChange = (
    entryId: string,
    memberUserId: string,
    value: string,
  ) => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const style = styles_.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    const newTime = parseTimeToSeconds(value);

    setStyleEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          memberRecords: e.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;
            let updatedSplitTimes = [...mr.splitTimes];
            if (raceDistance && newTime > 0) {
              const idx = updatedSplitTimes.findIndex(
                (st) =>
                  typeof st.distance === "number" &&
                  st.distance === raceDistance,
              );
              if (idx >= 0) {
                updatedSplitTimes = updatedSplitTimes.map((st, i) =>
                  i === idx
                    ? {
                        ...st,
                        splitTime: newTime,
                        displayValue: formatTimeBest(newTime),
                      }
                    : st,
                );
              } else {
                updatedSplitTimes = [
                  ...updatedSplitTimes,
                  {
                    id: genId(),
                    distance: raceDistance,
                    splitTime: newTime,
                    displayValue: formatTimeBest(newTime),
                  },
                ];
              }
            }
            return {
              ...mr,
              timeDisplayValue: value,
              time: newTime,
              splitTimes: updatedSplitTimes,
            };
          }),
        };
      }),
    );
  };

  const countBillableSplitTimes = (
    entryId: string,
    splitTimes: SplitTimeEntry[],
  ): number => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return splitTimes.length;
    const style = styles_.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    if (!raceDistance) return splitTimes.length;
    return splitTimes.filter(
      (st) =>
        !(typeof st.distance === "number" && st.distance === raceDistance),
    ).length;
  };

  const handleRelayTotalTimeChange = (entryId: string, value: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        const totalSeconds = parseTimeToSeconds(value);
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const totalDistance = legBoundaries[3];

        const currentSplits = entry.relaySplitTimes ?? [];
        const existingIdx = currentSplits.findIndex(
          (st) => st.distance === totalDistance,
        );
        let updatedSplits: SplitTimeEntry[];
        if (totalSeconds > 0) {
          const newSplit: SplitTimeEntry = {
            id: existingIdx >= 0 ? currentSplits[existingIdx].id : genId(),
            distance: totalDistance,
            splitTime: totalSeconds,
            displayValue: value,
          };
          updatedSplits =
            existingIdx >= 0
              ? currentSplits.map((st, i) =>
                  i === existingIdx ? newSplit : st,
                )
              : [...currentSplits, newSplit];
        } else {
          updatedSplits =
            existingIdx >= 0
              ? currentSplits.filter((_, i) => i !== existingIdx)
              : currentSplits;
        }

        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent
          ? calcLegTimesFromCumulative(newCumulatives)
          : null;

        const updatedMemberRecords = entry.memberRecords.map((mr, idx) => {
          const newCum = newCumulatives[idx];
          const isLastLeg = idx === 3;
          const cumTime = isLastLeg
            ? totalSeconds
            : newCum > 0
              ? newCum
              : (mr.cumulativeTimeSeconds ?? 0);
          const legTime = legTimes ? (legTimes[idx] ?? mr.time) : mr.time;
          return {
            ...mr,
            cumulativeTimeSeconds: cumTime,
            time: legTime,
            timeDisplayValue: isLastLeg ? value : mr.timeDisplayValue,
          };
        });

        return {
          ...entry,
          relaySplitTimes: updatedSplits,
          memberRecords: updatedMemberRecords,
        };
      }),
    );
  };

  const handleRelaySplitTimeChange = (
    entryId: string,
    splitId: string,
    field: "distance" | "splitTime",
    value: string,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const totalDistance = legBoundaries[3];

        const updatedSplits = (entry.relaySplitTimes ?? []).map((st) => {
          if (st.id !== splitId) return st;
          if (field === "distance") {
            const parsed = parseFloat(value);
            return {
              ...st,
              distance: value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed),
            };
          }
          return {
            ...st,
            displayValue: value,
            splitTime: parseTimeToSeconds(value),
          };
        });

        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent
          ? calcLegTimesFromCumulative(newCumulatives)
          : null;

        const changedSplit = updatedSplits.find((st) => st.id === splitId);
        const isTotalDistanceSplit =
          field === "splitTime" &&
          changedSplit &&
          changedSplit.distance === totalDistance;

        const updatedMemberRecords = entry.memberRecords.map((mr, idx) => {
          const newCum = allBoundariesPresent ? newCumulatives[idx] : 0;
          const cumTime = newCum > 0 ? newCum : (mr.cumulativeTimeSeconds ?? 0);
          const legTime = legTimes ? (legTimes[idx] ?? mr.time) : mr.time;
          const updates: Partial<MemberRecord> = {
            cumulativeTimeSeconds: cumTime,
            time: legTimes ? legTime : mr.time,
          };
          if (isTotalDistanceSplit && idx === 3) {
            updates.timeDisplayValue = value;
          }
          return { ...mr, ...updates };
        });

        return {
          ...entry,
          relaySplitTimes: updatedSplits,
          memberRecords: updatedMemberRecords,
        };
      }),
    );
  };

  const addRelaySplitTimesAtInterval = (entryId: string, interval: number) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const totalDistance = legBoundaries[3];
        const currentSplits = entry.relaySplitTimes ?? [];
        const existingDistances = new Set(
          currentSplits.map((st) => st.distance).filter((d) => d > 0),
        );
        let newSplits: SplitTimeEntry[] = [];
        for (
          let distance = interval;
          distance <= totalDistance;
          distance += interval
        ) {
          if (!existingDistances.has(distance)) {
            newSplits.push({
              id: genId(),
              distance,
              splitTime: 0,
              displayValue: "",
            });
          }
        }
        if (newSplits.length === 0) return entry;
        if (!isPremium) {
          const max = RELAY_FREE_PLAN_MAX_SPLITS - currentSplits.length;
          if (max <= 0) return entry;
          newSplits = newSplits.slice(0, max);
        }
        return { ...entry, relaySplitTimes: [...currentSplits, ...newSplits] };
      }),
    );
  };

  const addRelaySplitTime = (entryId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        const currentSplits = entry.relaySplitTimes ?? [];
        if (!isPremium && currentSplits.length >= RELAY_FREE_PLAN_MAX_SPLITS)
          return entry;
        return {
          ...entry,
          relaySplitTimes: [
            ...currentSplits,
            { id: genId(), distance: 0, splitTime: 0, displayValue: "" },
          ],
        };
      }),
    );
  };

  const removeRelaySplitTime = (entryId: string, splitId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id !== entryId || !entry.relayEventId
          ? entry
          : {
              ...entry,
              relaySplitTimes: (entry.relaySplitTimes ?? []).filter(
                (st) => st.id !== splitId,
              ),
            },
      ),
    );
  };

  const addSplitTime = (entryId: string, memberUserId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          memberRecords: entry.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;
            if (!isPremium) {
              const billable = countBillableSplitTimes(entryId, mr.splitTimes);
              if (billable >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD)
                return mr;
            }
            return {
              ...mr,
              splitTimes: [
                ...mr.splitTimes,
                { id: genId(), distance: 0, splitTime: 0, displayValue: "" },
              ],
            };
          }),
        };
      }),
    );
  };

  const addSplitTimesAtInterval = (
    entryId: string,
    memberUserId: string,
    interval: number,
  ) => {
    if (!memberUserId) return;
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const style = styles_.find((s) => s.id === entry.styleId);
    if (!style || !style.distance) return;
    const raceDistance = style.distance;

    setStyleEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          memberRecords: e.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;
            const existingDistances = new Set(
              mr.splitTimes
                .map((st) =>
                  typeof st.distance === "number" ? st.distance : 0,
                )
                .filter((d) => d > 0),
            );
            let newSplitTimes: SplitTimeEntry[] = [];
            for (
              let distance = interval;
              distance <= raceDistance;
              distance += interval
            ) {
              if (!existingDistances.has(distance)) {
                newSplitTimes.push({
                  id: genId(),
                  distance,
                  splitTime: 0,
                  displayValue: "",
                });
              }
            }
            if (newSplitTimes.length === 0) return mr;
            if (!isPremium) {
              const billable = countBillableSplitTimes(entryId, mr.splitTimes);
              const newBillable = newSplitTimes.filter(
                (st) =>
                  !(
                    typeof st.distance === "number" &&
                    st.distance === raceDistance
                  ),
              );
              const maxNewBillable =
                FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billable;
              if (maxNewBillable <= 0 && newBillable.length > 0) {
                newSplitTimes = newSplitTimes.filter(
                  (st) =>
                    typeof st.distance === "number" &&
                    st.distance === raceDistance,
                );
                if (newSplitTimes.length === 0) return mr;
              } else if (newBillable.length > maxNewBillable) {
                let added = 0;
                newSplitTimes = newSplitTimes.filter((st) => {
                  const isRaceDist =
                    typeof st.distance === "number" &&
                    st.distance === raceDistance;
                  if (isRaceDist) return true;
                  if (added < maxNewBillable) {
                    added++;
                    return true;
                  }
                  return false;
                });
              }
            }
            return { ...mr, splitTimes: [...mr.splitTimes, ...newSplitTimes] };
          }),
        };
      }),
    );
  };

  const removeSplitTime = (
    entryId: string,
    memberUserId: string,
    splitId: string,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id !== entryId
          ? entry
          : {
              ...entry,
              memberRecords: entry.memberRecords.map((mr) =>
                mr.memberUserId !== memberUserId
                  ? mr
                  : {
                      ...mr,
                      splitTimes: mr.splitTimes.filter(
                        (st) => st.id !== splitId,
                      ),
                    },
              ),
            },
      ),
    );
  };

  const updateSplitTime = (
    entryId: string,
    memberUserId: string,
    splitId: string,
    field: "distance" | "splitTime",
    value: string,
  ) => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const style = styles_.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;

    setStyleEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          memberRecords: e.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;
            const updatedSplitTimes = mr.splitTimes.map((st) => {
              if (st.id !== splitId) return st;
              if (field === "distance") {
                const parsed = parseInt(value, 10);
                return {
                  ...st,
                  distance:
                    value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed),
                };
              }
              return {
                ...st,
                displayValue: value,
                splitTime: parseTimeToSeconds(value),
              };
            });
            const updatedSplit = updatedSplitTimes.find(
              (st) => st.id === splitId,
            );
            if (
              field === "splitTime" &&
              raceDistance &&
              updatedSplit &&
              typeof updatedSplit.distance === "number" &&
              updatedSplit.distance === raceDistance
            ) {
              return {
                ...mr,
                splitTimes: updatedSplitTimes,
                time: updatedSplit.splitTime,
                timeDisplayValue:
                  updatedSplit.displayValue ||
                  formatTimeBest(updatedSplit.splitTime),
              };
            }
            return { ...mr, splitTimes: updatedSplitTimes };
          }),
        };
      }),
    );
  };

  // ---- 保存（Web RecordClient handleSubmit と同フロー）----
  const handleSubmit = async () => {
    if (saving) return;
    if (!competition) return;
    setSaving(true);
    let hasError = false;

    try {
      const validRecords: Array<{
        styleId: number;
        memberUserId: string;
        memberName: string;
        time: number;
        isRelaying: boolean;
        note: string;
        reactionTime: string;
        splitTimes: SplitTimeEntry[];
        videoAsset?: { uri: string; mimeType?: string } | null;
      }> = [];

      for (const entry of styleEntries) {
        if (entry.styleId === "") continue;

        // リレー種目の各 leg 開始通算タイム (record.time ベース)。D3 (split の事前バリデーション)
        // と leg 相対 split 変換 (leg 分配) で共有する (Web RecordClient.handleSubmit と同ロジック)。
        const legCumulativeTimes = entry.relayEventId
          ? calcCumulativeTimes(entry.memberRecords.map((mr) => mr.time))
          : [];

        if (entry.relayEventId) {
          const hasUnselectedMember = entry.memberRecords.some(
            (mr) => !mr.memberUserId,
          );
          if (hasUnselectedMember) {
            Alert.alert(
              t("common.error"),
              t("competition.records.validation.relayFullTeam"),
            );
            setSaving(false);
            return;
          }
          const cumulatives = entry.memberRecords.map(
            (mr) => mr.cumulativeTimeSeconds ?? 0,
          );
          const inputtedLegs = cumulatives.filter((c) => c > 0);
          if (inputtedLegs.length > 0 && inputtedLegs.length < 4) {
            Alert.alert(
              t("common.error"),
              t("competition.records.validation.relayAllTimes"),
            );
            setSaving(false);
            return;
          }
          if (inputtedLegs.length === 4) {
            for (let i = 1; i < cumulatives.length; i++) {
              if (cumulatives[i] <= cumulatives[i - 1]) {
                Alert.alert(
                  t("common.error"),
                  t("competition.records.validation.cumulativeTimeInverted", {
                    current: i + 1,
                    prev: i,
                  }),
                );
                setSaving(false);
                return;
              }
            }
          }

          // リレー split の事前バリデーション（書き込む前に弾く）:
          // 各 split (通算値) が、その split が属する leg の開始通算タイム以下だと
          // 物理的に成立しない (leg 開始前に split が発生することはない)。
          // 浮動小数点誤差を吸収するため 0.005 秒の許容を入れる。
          if (entry.relaySplitTimes && entry.relaySplitTimes.length > 0) {
            const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
            const INVERSION_TOLERANCE = 0.005;
            for (const st of entry.relaySplitTimes) {
              if (st.splitTime <= 0) continue;
              const legIdx = legBoundaries.findIndex(
                (boundary) => st.distance <= boundary,
              );
              if (legIdx === -1) continue;
              const legStart = getLegStartCumulative(
                legCumulativeTimes,
                legIdx,
              );
              if (st.splitTime <= legStart + INVERSION_TOLERANCE) {
                Alert.alert(
                  t("common.error"),
                  t("competition.records.validation.relaySplitBeforeLegStart", {
                    distance: st.distance,
                    leg: legIdx + 1,
                  }),
                );
                setSaving(false);
                return;
              }
            }
          }
        }

        for (let legIdx = 0; legIdx < entry.memberRecords.length; legIdx++) {
          const mr = entry.memberRecords[legIdx];
          const shouldSave = entry.relayEventId
            ? (mr.cumulativeTimeSeconds ?? 0) > 0
            : mr.time > 0;
          if (!shouldSave) continue;

          const styleId = entry.relayEventId
            ? (mr.relayLegStyleId ?? (entry.styleId as number))
            : (entry.styleId as number);

          // リレー種目: relaySplitTimes を各 leg に分配して leg 内距離・leg 相対タイムに変換
          // (distance は従来どおり leg 内相対に変換、splitTime も同様に通算値から
          // leg 開始通算タイムを引いた leg 相対値に変換する。records.time が既に
          // 同じ変換を行っている既存パターンに追従する)
          let splitTimes = mr.splitTimes;
          if (entry.relayEventId && entry.relaySplitTimes) {
            const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
            const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
            const legHigh = legBoundaries[legIdx];
            const legStart = getLegStartCumulative(legCumulativeTimes, legIdx);
            splitTimes = entry.relaySplitTimes
              .filter((st) => st.distance > legLow && st.distance <= legHigh)
              .map((st) => {
                const legRelativeSplitTime = toLegRelativeSplitTime(
                  st.splitTime,
                  legStart,
                );
                return {
                  ...st,
                  distance: legIdx === 0 ? st.distance : st.distance - legLow,
                  splitTime: legRelativeSplitTime,
                  displayValue: formatTimeBest(legRelativeSplitTime),
                };
              });
          }

          validRecords.push({
            styleId,
            memberUserId: mr.memberUserId,
            memberName: mr.memberName,
            time: mr.time,
            isRelaying: mr.isRelaying,
            note: mr.note,
            reactionTime: mr.reactionTime || "",
            splitTimes,
            videoAsset: mr.videoAsset ?? null,
          });
        }
      }

      if (validRecords.length === 0) {
        Alert.alert(
          t("common.error"),
          t("competition.records.validation.atLeastOneRecord"),
        );
        setSaving(false);
        return;
      }

      // 編集モード: 既存の split → records を削除（Web 準拠）
      if (isEditMode) {
        for (const record of existingRecords) {
          if (record.split_times && record.split_times.length > 0) {
            const { error: splitDeleteError } = await supabase
              .from("split_times")
              .delete()
              .eq("record_id", record.id);
            if (splitDeleteError) {
              throw new Error(
                t("competition.records.error.splitDeleteFailed", {
                  detail: splitDeleteError.message,
                }),
              );
            }
          }
        }
        const existingRecordIds = existingRecords.map((r) => r.id);
        const { error: deleteError } = await supabase
          .from("records")
          .delete()
          .in("id", existingRecordIds);
        if (deleteError) {
          throw new Error(
            t("competition.records.error.recordDeleteFailed", {
              detail: deleteError.message,
            }),
          );
        }
      }

      // 代理 insert（shared API を経由せず supabase.from を直叩き = Web 同方式）
      const savedRecordIds: Array<{
        recordId: string;
        record: (typeof validRecords)[number];
      }> = [];
      for (const record of validRecords) {
        const insertPayload: RecordInsert = {
          competition_id: competitionId,
          user_id: record.memberUserId,
          team_id: teamId,
          style_id: record.styleId,
          time: record.time,
          note: record.note || null,
          is_relaying: record.isRelaying,
          pool_type: competition.pool_type,
          reaction_time: toReactionTimeValue(record.reactionTime),
        };
        const { data: newRecord, error: recordError } = await supabase
          .from("records")
          .insert(insertPayload)
          .select("id")
          .single();

        if (recordError || !newRecord) {
          console.error(
            `Record作成エラー (${record.memberName}):`,
            recordError,
          );
          hasError = true;
          continue;
        }

        savedRecordIds.push({ recordId: newRecord.id, record });

        // 種目距離と同 distance の split は除外（ゴールタイム = split ではない）
        const raceDistance = styles_.find(
          (s) => s.id === record.styleId,
        )?.distance;
        const validSplitTimes = record.splitTimes.filter(
          (st) =>
            st.distance > 0 &&
            st.splitTime > 0 &&
            !(raceDistance && st.distance === raceDistance),
        );
        if (validSplitTimes.length > 0) {
          const splitTimesData = validSplitTimes.map((st) => ({
            record_id: newRecord.id,
            distance: st.distance as number,
            split_time: st.splitTime,
          }));
          const { error: splitError } = await supabase
            .from("split_times")
            .insert(splitTimesData);
          if (splitError) {
            console.error(
              `SplitTime作成エラー (${record.memberName}):`,
              splitError,
            );
            hasError = true;
          }
        }
      }

      // 部分失敗時はリダイレクトしない（Web 準拠）。集約表示。
      if (hasError) {
        Alert.alert(
          t("common.error"),
          t("competition.records.error.saveFailed"),
        );
        setSaving(false);
        return;
      }

      // 代理動画アップロード（team-assign 経由）。Premium のみ。失敗は記録保存を妨げず集約する
      // （練習ログ画面 TeamPracticeLogBulkFormScreen と挙動を揃える。W-4）。
      const videoErrors: string[] = [];
      if (isPremium) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          videoErrors.push(t("practice.mobile.videoUploadFailedSession"));
        } else {
          for (const { recordId, record } of savedRecordIds) {
            if (!record.videoAsset) continue;
            try {
              // read replica 反映待ち（team-assign が records を SELECT するため）
              await new Promise((resolve) => setTimeout(resolve, 300));
              await uploadVideoForTeamMember({
                type: "record",
                id: recordId,
                targetUserId: record.memberUserId,
                teamId,
                videoUri: record.videoAsset.uri,
                mimeType: record.videoAsset.mimeType,
                accessToken,
              });
            } catch (videoErr) {
              console.error("代理動画アップロードエラー:", videoErr);
              // サムネ未生成は team-assign が必須のため添付不可。専用メッセージで通知。
              const key =
                videoErr instanceof MissingThumbnailError
                  ? "teamsAdmin.practiceLog.errorVideoNoThumbnail"
                  : "teamsAdmin.practiceLog.errorVideoGenericFailed";
              videoErrors.push(t(key, { name: record.memberName }));
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({
        queryKey: teamKeys.competitions(teamId),
      });
      // この操作を行った管理者自身のローカルキャッシュ上の記録一覧（大会タブ）を最新化する。
      // invalidateQueries はこの端末のキャッシュにしか作用せず、代理登録された各メンバー
      // 本人の端末には影響しない（別デバイスのキャッシュはクロスデバイスでは無効化できない）
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() });

      // 記録保存は成功済み。動画の部分失敗のみの場合は「保存成功 + 一部動画失敗」を通知して戻る。
      if (videoErrors.length > 0) {
        Alert.alert(
          t("common.notice"),
          t("teamsAdmin.practiceLog.videoPartialFailureSaved", {
            errors: videoErrors.join("\n"),
          }),
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
        setSaving(false);
        return;
      }

      navigation.goBack();
    } catch (err) {
      console.error("チーム大会記録作成エラー:", err);
      Alert.alert(
        t("common.error"),
        err instanceof Error
          ? err.message
          : t("competition.records.error.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- 描画 ----
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
        <ErrorView
          message={loadError}
          fullScreen
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  // 権限ゲート（RLS が二重防御）。非 admin はエラー表示して戻す。
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>
            {t("teams.mobile.webGuide")}
          </Text>
          <Pressable
            style={styles.permissionButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.permissionButtonText}>
              {t("teams.record.backButton")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const memberModalEntry =
    styleEntries.find((e) => e.id === memberModalEntryId) ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 大会情報 */}
        <View style={styles.compHeader}>
          <Text style={styles.compTitle}>
            {competition?.title || t("competition.records.competitionFallback")}
          </Text>
          <Text style={styles.compSubtitle}>
            {t("teams.record.description")}
          </Text>
          <TimeInputHelp showCarryOver style={{ marginTop: 8 }} />
        </View>

        {styleEntries.map((entry, entryIndex) => {
          const selectedStyle = styles_.find((s) => s.id === entry.styleId);
          const hasDistance = !!selectedStyle?.distance;
          const relayDef = entry.relayEventId
            ? relayEvents.find((r) => r.id === entry.relayEventId)
            : undefined;
          return (
            <View key={entry.id} style={styles.entryCard}>
              {/* 種目ヘッダー */}
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>
                  {t("teams.record.eventNumber", { n: entryIndex + 1 })}
                </Text>
                {styleEntries.length > 1 && (
                  <Pressable
                    onPress={() => removeStyleEntry(entry.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.delete")}
                  >
                    <Feather name="trash-2" size={18} color="#DC2626" />
                  </Pressable>
                )}
              </View>

              {/* 種目選択 */}
              <View style={styles.field}>
                <Text style={styles.label}>{t("teams.record.eventLabel")}</Text>
                <Pressable
                  style={styles.pickerButton}
                  onPress={() => setStylePickerEntryId(entry.id)}
                >
                  <Text
                    style={[
                      styles.pickerButtonText,
                      entry.styleId === "" &&
                        !entry.relayEventId &&
                        styles.placeholder,
                    ]}
                  >
                    {entry.relayEventId
                      ? (relayDef?.label ?? entry.styleName)
                      : selectedStyle
                        ? localizedStyleName(selectedStyle, t)
                        : t("teams.record.eventPlaceholder")}
                  </Text>
                  <Feather name="chevron-down" size={18} color="#6B7280" />
                </Pressable>
              </View>

              {/* 個人種目: メンバー選択 */}
              {!entry.relayEventId && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    {t("teams.record.participantsHeader")}
                  </Text>
                  <Pressable
                    style={styles.selectMemberButton}
                    onPress={() => setMemberModalEntryId(entry.id)}
                  >
                    <Feather name="users" size={16} color="#2563EB" />
                    <Text style={styles.selectMemberText}>
                      {t("teams.record.selectMemberButton")}
                    </Text>
                  </Pressable>
                  <Text style={styles.countLabel}>
                    {t("teams.record.selectedMemberCount", {
                      n: entry.memberRecords.length,
                    })}
                  </Text>
                </View>
              )}

              {/* リレー種目 */}
              {entry.relayEventId && (
                <View style={styles.relaySection}>
                  <Text style={styles.subHeader}>
                    {t("teams.record.timesHeader")}
                  </Text>

                  {/* 泳者選択 + RT */}
                  {entry.memberRecords.map((mr, mrIndex) => (
                    <View key={`leg-${mrIndex}`} style={styles.legCard}>
                      <Text style={styles.legLabel}>
                        {relayDef?.legs[mrIndex]?.legLabel ?? mr.relayLegLabel}
                      </Text>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() =>
                          setLegPicker({ entryId: entry.id, legIndex: mrIndex })
                        }
                      >
                        <Text
                          style={[
                            styles.pickerButtonText,
                            !mr.memberUserId && styles.placeholder,
                          ]}
                        >
                          {mr.memberName ||
                            t("teams.record.relaySwimmerPlaceholder")}
                        </Text>
                        <Feather
                          name="chevron-down"
                          size={18}
                          color="#6B7280"
                        />
                      </Pressable>
                      <View style={styles.rtField}>
                        <Text style={styles.smallLabel}>
                          {t("teams.record.reactionTime")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={mr.reactionTime || ""}
                          onChangeText={(text) =>
                            updateMemberRecordByIndex(entry.id, mrIndex, {
                              reactionTime: text,
                            })
                          }
                          onBlur={() =>
                            handleReactionTimeBlurByIndex(
                              entry.id,
                              mrIndex,
                              mr.reactionTime || "",
                            )
                          }
                          placeholder="0.65"
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  ))}

                  {/* 合計タイム */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {t("teams.record.totalTime")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={entry.memberRecords[3]?.timeDisplayValue ?? ""}
                      onChangeText={(text) =>
                        handleRelayTotalTimeChange(entry.id, text)
                      }
                      placeholder={t("teams.record.totalTimePlaceholder")}
                    />
                  </View>

                  {/* リレースプリット */}
                  <View style={styles.field}>
                    <View style={styles.splitHeader}>
                      <Text style={styles.smallLabel}>
                        {t("teams.record.zoneLabel")}
                        {!isPremium &&
                          ` ${(entry.relaySplitTimes ?? []).length}/${RELAY_FREE_PLAN_MAX_SPLITS}`}
                      </Text>
                      <View style={styles.splitButtons}>
                        <Pressable
                          style={[styles.splitAddBtn, styles.splitAdd25]}
                          onPress={() =>
                            addRelaySplitTimesAtInterval(entry.id, 25)
                          }
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <Text style={styles.splitAddText25}>
                            {t("teams.record.addSplit25m")}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.splitAddBtn, styles.splitAdd50]}
                          onPress={() =>
                            addRelaySplitTimesAtInterval(entry.id, 50)
                          }
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <Text style={styles.splitAddText50}>
                            {t("teams.record.addSplit50m")}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.splitAddBtn}
                          onPress={() => addRelaySplitTime(entry.id)}
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <Text style={styles.splitAddText}>
                            {t("teams.record.addSplitManual")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    {[...(entry.relaySplitTimes ?? [])]
                      .sort((a, b) => a.distance - b.distance)
                      .map((split) => (
                        <View key={split.id} style={styles.splitRow}>
                          <TextInput
                            style={[styles.input, styles.splitDistance]}
                            value={
                              split.distance > 0 ? String(split.distance) : ""
                            }
                            onChangeText={(text) => {
                              if (text === "" || /^\d+(\.\d*)?$/.test(text)) {
                                handleRelaySplitTimeChange(
                                  entry.id,
                                  split.id,
                                  "distance",
                                  text,
                                );
                              }
                            }}
                            placeholder={t(
                              "teams.record.splitDistancePlaceholder",
                            )}
                            keyboardType="decimal-pad"
                          />
                          <Text style={styles.splitSeparator}>m:</Text>
                          <TextInput
                            style={[styles.input, styles.splitTime]}
                            value={split.displayValue}
                            onChangeText={(text) =>
                              handleRelaySplitTimeChange(
                                entry.id,
                                split.id,
                                "splitTime",
                                text,
                              )
                            }
                            placeholder={t("teams.record.splitTimePlaceholder")}
                          />
                          <Pressable
                            style={styles.removeSplitBtn}
                            onPress={() =>
                              removeRelaySplitTime(entry.id, split.id)
                            }
                          >
                            <Feather name="trash-2" size={16} color="#EF4444" />
                          </Pressable>
                        </View>
                      ))}
                  </View>
                </View>
              )}

              {/* 個人種目: メンバーごとの入力 */}
              {!entry.relayEventId &&
                entry.memberRecords.length > 0 &&
                entry.memberRecords.map((mr) => {
                  return (
                    <View key={mr.memberUserId} style={styles.memberCard}>
                      <Text style={styles.memberName}>{mr.memberName}</Text>

                      {/* エントリータイム参照ラベル（読み取り専用。記録タイムの入力欄には反映しない。仕様#1） */}
                      {mr.entryTimeReference != null &&
                        mr.entryTimeReference > 0 && (
                          <View style={styles.entryTimeBadge}>
                            <Text style={styles.entryTimeBadgeText}>
                              {t("forms.recordLog.entryTimeLabel")}{" "}
                              {formatTimeBest(mr.entryTimeReference)}
                            </Text>
                          </View>
                        )}

                      {/* タイム */}
                      <View style={styles.field}>
                        <Text style={styles.smallLabel}>
                          {t("teams.record.timeLabel")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={mr.timeDisplayValue}
                          onChangeText={(text) =>
                            handleTimeChange(entry.id, mr.memberUserId, text)
                          }
                          placeholder={t("teams.record.timePlaceholder")}
                        />
                      </View>

                      {/* リレー & RT */}
                      <View style={styles.inlineRow}>
                        <View style={styles.switchField}>
                          <Text style={styles.smallLabel}>
                            {t("teams.record.relay")}
                          </Text>
                          <Switch
                            value={mr.isRelaying}
                            onValueChange={(v) =>
                              updateMemberRecord(entry.id, mr.memberUserId, {
                                isRelaying: v,
                              })
                            }
                          />
                        </View>
                        {!mr.isRelaying && (
                          <View style={styles.rtFieldInline}>
                            <Text style={styles.smallLabel}>
                              {t("teams.record.reactionTime")}
                            </Text>
                            <TextInput
                              style={styles.input}
                              value={mr.reactionTime || ""}
                              onChangeText={(text) =>
                                updateMemberRecord(entry.id, mr.memberUserId, {
                                  reactionTime: text,
                                })
                              }
                              onBlur={() =>
                                handleReactionTimeBlur(
                                  entry.id,
                                  mr.memberUserId,
                                  mr.reactionTime || "",
                                )
                              }
                              placeholder="0.65"
                              keyboardType="decimal-pad"
                            />
                          </View>
                        )}
                      </View>

                      {/* メモ */}
                      <View style={styles.field}>
                        <Text style={styles.smallLabel}>
                          {t("teams.record.memoLabel")}
                        </Text>
                        <TextInput
                          style={styles.input}
                          value={mr.note}
                          onChangeText={(text) =>
                            updateMemberRecord(entry.id, mr.memberUserId, {
                              note: text,
                            })
                          }
                          placeholder={t("teams.record.memoPlaceholder")}
                        />
                      </View>

                      {/* スプリット */}
                      <View style={styles.field}>
                        <View style={styles.splitHeader}>
                          <Text style={styles.smallLabel}>
                            {t("teams.record.splitTimeLabel")}
                          </Text>
                          <View style={styles.splitButtons}>
                            <Pressable
                              style={[
                                styles.splitAddBtn,
                                styles.splitAdd25,
                                !hasDistance && styles.disabledBtn,
                              ]}
                              onPress={() =>
                                addSplitTimesAtInterval(
                                  entry.id,
                                  mr.memberUserId,
                                  25,
                                )
                              }
                              disabled={!hasDistance}
                            >
                              <Text style={styles.splitAddText25}>
                                {t("teams.record.addSplit25m")}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.splitAddBtn,
                                styles.splitAdd50,
                                !hasDistance && styles.disabledBtn,
                              ]}
                              onPress={() =>
                                addSplitTimesAtInterval(
                                  entry.id,
                                  mr.memberUserId,
                                  50,
                                )
                              }
                              disabled={!hasDistance}
                            >
                              <Text style={styles.splitAddText50}>
                                {t("teams.record.addSplit50m")}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={styles.splitAddBtn}
                              onPress={() =>
                                addSplitTime(entry.id, mr.memberUserId)
                              }
                            >
                              <Text style={styles.splitAddText}>
                                {t("teams.record.addSplitManual")}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                        {[...mr.splitTimes]
                          .sort((a, b) => {
                            const da =
                              typeof a.distance === "number" ? a.distance : 0;
                            const db =
                              typeof b.distance === "number" ? b.distance : 0;
                            return da - db;
                          })
                          .map((split) => (
                            <View key={split.id} style={styles.splitRow}>
                              <TextInput
                                style={[styles.input, styles.splitDistance]}
                                value={
                                  split.distance > 0
                                    ? String(split.distance)
                                    : ""
                                }
                                onChangeText={(text) => {
                                  if (
                                    text === "" ||
                                    /^\d+(\.\d*)?$/.test(text)
                                  ) {
                                    updateSplitTime(
                                      entry.id,
                                      mr.memberUserId,
                                      split.id,
                                      "distance",
                                      text,
                                    );
                                  }
                                }}
                                placeholder={t(
                                  "teams.record.splitDistancePlaceholder",
                                )}
                                keyboardType="decimal-pad"
                              />
                              <Text style={styles.splitSeparator}>m:</Text>
                              <TextInput
                                style={[styles.input, styles.splitTime]}
                                value={split.displayValue}
                                onChangeText={(text) =>
                                  updateSplitTime(
                                    entry.id,
                                    mr.memberUserId,
                                    split.id,
                                    "splitTime",
                                    text,
                                  )
                                }
                                placeholder={t(
                                  "teams.record.splitTimePlaceholder",
                                )}
                              />
                              <Pressable
                                style={styles.removeSplitBtn}
                                onPress={() =>
                                  removeSplitTime(
                                    entry.id,
                                    mr.memberUserId,
                                    split.id,
                                  )
                                }
                              >
                                <Feather
                                  name="trash-2"
                                  size={16}
                                  color="#EF4444"
                                />
                              </Pressable>
                            </View>
                          ))}
                        {!isPremium &&
                          countBillableSplitTimes(entry.id, mr.splitTimes) >=
                            FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD && (
                            <View style={styles.premiumBadgeWrap}>
                              <PremiumBadge
                                feature="split_time_limit"
                                compact
                              />
                            </View>
                          )}

                        {/* ラップタイム表示（web LapTimeDisplay 相当）。
                          種目の距離は選択中の style から算出して race タブの計算に使用する。 */}
                        <LapTimeDisplay
                          splitTimes={mr.splitTimes.map((st) => ({
                            distance:
                              typeof st.distance === "number"
                                ? st.distance
                                : "",
                            splitTime: st.splitTime,
                          }))}
                          raceDistance={selectedStyle?.distance}
                        />
                      </View>

                      {/* 代理動画（Premium ゲート）。VideoUploader は本人アップロードを行わず、
                        選択された保留アセットを memberRecord に保持し、保存後 team-assign で送る。 */}
                      <View style={styles.field}>
                        <Text style={styles.smallLabel}>
                          {t("teams.record.videoSelect")}
                        </Text>
                        {isPremium ? (
                          <VideoUploader
                            type="record"
                            isPremium={isPremium}
                            existingVideoPath={null}
                            existingThumbnailPath={null}
                            onPendingVideoAsset={(asset) =>
                              updateMemberRecord(entry.id, mr.memberUserId, {
                                videoAsset: asset,
                              })
                            }
                          />
                        ) : (
                          <PremiumBadge feature="video_upload" compact />
                        )}
                      </View>
                    </View>
                  );
                })}
            </View>
          );
        })}

        {/* 種目追加 */}
        <Pressable style={styles.addEventButton} onPress={addStyleEntry}>
          <Feather name="plus" size={16} color="#2563EB" />
          <Text style={styles.addEventText}>
            {t("teams.record.addEventButton")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* フッター */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          style={styles.cancelFooterBtn}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.cancelFooterText}>
            {t("teams.record.cancelButton")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, saving && styles.disabledBtn]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {t("teams.record.saveButton")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>

      {/* メンバー選択モーダル（個人種目） */}
      <MemberSelectModal
        visible={!!memberModalEntryId}
        members={members}
        selectedUserIds={
          memberModalEntry?.memberRecords.map((mr) => mr.memberUserId) ?? []
        }
        onConfirm={(ids) =>
          memberModalEntryId && confirmMemberSelection(memberModalEntryId, ids)
        }
        onCancel={() => setMemberModalEntryId(null)}
      />

      {/* 種目選択モーダル */}
      <SlideUpModal
        visible={!!stylePickerEntryId}
        backdropAccessibilityLabel={t("common.close")}
        onClose={() => setStylePickerEntryId(null)}
        overlayColor="rgba(0,0,0,0.4)"
        sheetStyle={styles.pickerSheet}
      >
        <View style={styles.pickerSheetHeader}>
          <Text style={styles.pickerSheetTitle}>
            {t("teams.record.eventLabel")}
          </Text>
          <Pressable onPress={() => setStylePickerEntryId(null)} hitSlop={8}>
            <Feather name="x" size={22} color="#6B7280" />
          </Pressable>
        </View>
        <ScrollView>
          <Text style={styles.optgroupLabel}>
            {t("teams.record.individualEvents")}
          </Text>
          {styles_.map((style) => (
            <Pressable
              key={`s-${style.id}`}
              style={styles.pickerOption}
              onPress={() => {
                if (stylePickerEntryId)
                  updateStyleEntry(stylePickerEntryId, style.id);
                setStylePickerEntryId(null);
              }}
            >
              <Text style={styles.pickerOptionText}>
                {localizedStyleName(style, t)}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.optgroupLabel}>
            {t("teams.record.relayLabel")}
          </Text>
          {relayEvents.map((relay) => (
            <Pressable
              key={`r-${relay.id}`}
              style={styles.pickerOption}
              onPress={() => {
                if (stylePickerEntryId)
                  updateRelayEntry(stylePickerEntryId, relay.id);
                setStylePickerEntryId(null);
              }}
            >
              <Text style={styles.pickerOptionText}>{relay.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SlideUpModal>

      {/* リレー泳者選択モーダル */}
      <SlideUpModal
        visible={!!legPicker}
        backdropAccessibilityLabel={t("common.close")}
        onClose={() => setLegPicker(null)}
        overlayColor="rgba(0,0,0,0.4)"
        sheetStyle={styles.pickerSheet}
      >
        <View style={styles.pickerSheetHeader}>
          <Text style={styles.pickerSheetTitle}>
            {t("teams.record.relaySwimmerPlaceholder")}
          </Text>
          <Pressable onPress={() => setLegPicker(null)} hitSlop={8}>
            <Feather name="x" size={22} color="#6B7280" />
          </Pressable>
        </View>
        <ScrollView>
          {members.map((m) => (
            <Pressable
              key={`leg-opt-${m.user_id}`}
              style={styles.pickerOption}
              onPress={() => {
                if (legPicker) {
                  updateMemberRecordByIndex(
                    legPicker.entryId,
                    legPicker.legIndex,
                    {
                      memberUserId: m.user_id,
                      memberName: m.users?.name || "",
                    },
                  );
                }
                setLegPicker(null);
              }}
            >
              <Text style={styles.pickerOptionText}>
                {m.users?.name || t("teams.mobile.unnamedMember")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SlideUpModal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  compHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  compTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  compSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  entryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  entryTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  smallLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  pickerButtonText: { fontSize: 15, color: "#111827" },
  placeholder: { color: "#9CA3AF" },
  selectMemberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  selectMemberText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  countLabel: { fontSize: 13, color: "#6B7280", marginTop: 6 },
  relaySection: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  subHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 10,
  },
  legCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  legLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1D4ED8",
    marginBottom: 6,
  },
  rtField: { marginTop: 8 },
  rtFieldInline: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  memberCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  entryTimeBadge: {
    backgroundColor: "#DBEAFE", // blue-100 (RecordLogFormScreen と同じ参照ラベル配色)
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  entryTimeBadgeText: {
    fontSize: 12,
    color: "#1D4ED8", // blue-700
  },
  inlineRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
    alignItems: "flex-end",
  },
  switchField: { gap: 4 },
  splitHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  splitButtons: { flexDirection: "row", gap: 6 },
  splitAddBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  splitAdd25: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  splitAdd50: { backgroundColor: "#059669", borderColor: "#059669" },
  splitAddText: { fontSize: 11, fontWeight: "600", color: "#2563EB" },
  splitAddText25: { fontSize: 11, fontWeight: "600", color: "#FFFFFF" },
  splitAddText50: { fontSize: 11, fontWeight: "600", color: "#FFFFFF" },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  splitDistance: { width: 80 },
  splitSeparator: { fontSize: 14, color: "#6B7280" },
  splitTime: { flex: 1 },
  removeSplitBtn: { padding: 4 },
  premiumBadgeWrap: { marginTop: 8 },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  addEventText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  cancelFooterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelFooterText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  disabledBtn: { opacity: 0.5 },
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
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 16,
  },
  pickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pickerSheetTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  optgroupLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  pickerOptionText: { fontSize: 15, color: "#111827" },
});
