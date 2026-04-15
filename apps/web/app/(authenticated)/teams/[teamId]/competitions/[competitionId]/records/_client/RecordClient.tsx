"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthProvider";
import Button from "@/components/ui/Button";
import dynamic from "next/dynamic";
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UserGroupIcon,
  XMarkIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { Competition, Style } from "@apps/shared/types";
import { FREE_PLAN_LIMITS } from "@apps/shared/constants/premium";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { formatTimeBest, parseTimeToSeconds } from "@/utils/formatters";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import {
  RELAY_EVENTS,
  RelayEventId,
  isRelayingForLeg,
} from "./relayEvents";

// TeamVideoUploaderを動的インポート
const TeamVideoUploader = dynamic(() => import("@/components/video/TeamVideoUploader"), {
  ssr: false,
});

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  users: {
    id: string;
    name: string;
  };
}

interface CompetitionWithDetails extends Competition {
  team: {
    id: string;
    name: string;
  } | null;
}

interface RecordWithDetails {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  video_path: string | null;
  note: string | null;
  is_relaying: boolean;
  pool_type: number | null;
  team_id: string | null;
  reaction_time?: number | null;
  split_times: {
    id: string;
    distance: number;
    split_time: number;
  }[];
  users: {
    id: string;
    name: string;
  } | null;
  styles: {
    id: number;
    name_jp: string;
    distance: number;
  } | null;
}

interface SplitTimeEntry {
  id: string;
  distance: number;
  splitTime: number;
  displayValue: string;
}

interface MemberRecord {
  id: string;
  memberUserId: string;
  memberName: string;
  time: number;
  timeDisplayValue: string;
  reactionTime: string; // 反応時間（秒単位、0.40~1.00程度）
  isRelaying: boolean;
  note: string;
  splitTimes: SplitTimeEntry[];
  videoFile?: File | null;
  videoThumbnailBlob?: Blob | null;
  // リレー種目の場合に使用: 各 leg が独自の styleId を持つ
  relayLegStyleId?: number;
  relayLegLabel?: string;
}

interface StyleEntry {
  id: string;
  styleId: number | "";
  styleName: string;
  memberRecords: MemberRecord[];
  relayEventId?: RelayEventId | null;
}

interface RecordClientProps {
  teamId: string;
  competitionId: string;
  competition: CompetitionWithDetails;
  teamName: string;
  members: TeamMember[];
  existingRecords: RecordWithDetails[];
  styles: Style[];
}

export default function RecordClient({
  teamId,
  competitionId,
  competition,
  teamName: _teamName,
  members,
  existingRecords,
  styles,
}: RecordClientProps) {
  const router = useRouter();
  const { supabase, subscription } = useAuth();
  const isPremium = subscription?.plan === "premium";

  const [saving, setSaving] = useState(false);
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [currentStyleEntryId, setCurrentStyleEntryId] = useState<string | null>(null);
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>([]);
  const [videoUploadModal, setVideoUploadModal] = useState<{
    entryId: string;
    memberUserId: string;
    memberName: string;
  } | null>(null);

  // 既存データから種目エントリを構築
  const buildStyleEntriesFromExisting = (): StyleEntry[] => {
    if (existingRecords.length === 0) {
      // 新規作成時: 空のエントリを1つ作成
      return [
        {
          id: "1",
          styleId: "",
          styleName: "",
          memberRecords: [],
        },
      ];
    }

    // 既存データがある場合: 種目ごとにグループ化
    const styleMap = new Map<number, StyleEntry>();

    for (const record of existingRecords) {
      const styleId = record.style_id;
      const style = styles.find((s) => s.id === styleId);

      if (!styleMap.has(styleId)) {
        styleMap.set(styleId, {
          id: String(styleId),
          styleId: styleId,
          styleName: style?.name_jp || "",
          memberRecords: [],
        });
      }

      const entry = styleMap.get(styleId)!;
      entry.memberRecords.push({
        id: record.id,
        memberUserId: record.user_id,
        memberName: record.users?.name || "Unknown",
        time: record.time,
        timeDisplayValue: formatTimeBest(record.time),
        reactionTime: record.reaction_time?.toString() || "",
        isRelaying: record.is_relaying,
        note: record.note || "",
        splitTimes: (record.split_times || []).map((st, idx) => ({
          id: st.id || String(idx + 1),
          distance: st.distance,
          splitTime: st.split_time,
          displayValue: formatTimeBest(st.split_time),
        })),
      });
    }

    return Array.from(styleMap.values());
  };

  const [styleEntries, setStyleEntries] = useState<StyleEntry[]>(buildStyleEntriesFromExisting);
  const isEditMode = existingRecords.length > 0;

  const addStyleEntry = () => {
    const newEntry: StyleEntry = {
      id: crypto.randomUUID(),
      styleId: "",
      styleName: "",
      memberRecords: [],
    };
    setStyleEntries((prev) => [...prev, newEntry]);
  };

  const removeStyleEntry = (entryId: string) => {
    if (styleEntries.length > 1) {
      setStyleEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  };

  const updateStyleEntry = (entryId: string, styleId: number) => {
    const style = styles.find((s) => s.id === styleId);
    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? { ...entry, styleId, styleName: style?.name_jp || "", relayEventId: null }
          : entry,
      ),
    );
  };

  const updateRelayEntry = (entryId: string, relayEventId: RelayEventId) => {
    const relayDef = RELAY_EVENTS.find((r) => r.id === relayEventId);
    if (!relayDef) return;

    // リレー種目ではすべての leg を空の MemberRecord として初期化
    const legRecords: MemberRecord[] = relayDef.legs.map((leg) => ({
      id: crypto.randomUUID(),
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
    }));

    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              styleId: relayDef.legs[0].styleId, // 代表 styleId (第1泳者の種目)
              styleName: relayDef.label,
              relayEventId,
              memberRecords: legRecords,
            }
          : entry,
      ),
    );
  };

  const openMemberSelectModal = (entryId: string) => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (entry) {
      setCurrentStyleEntryId(entryId);
      setTempSelectedUserIds(entry.memberRecords.map((mr) => mr.memberUserId));
      setShowMemberSelectModal(true);
    }
  };

  const confirmMemberSelection = () => {
    if (!currentStyleEntryId) return;

    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== currentStyleEntryId) return entry;

        // 新しく選択されたメンバーを追加、削除されたメンバーを除去
        const newMemberRecords: MemberRecord[] = [];

        for (const userId of tempSelectedUserIds) {
          const existing = entry.memberRecords.find((mr) => mr.memberUserId === userId);
          if (existing) {
            newMemberRecords.push(existing);
          } else {
            const member = members.find((m) => m.user_id === userId);
            if (member) {
              newMemberRecords.push({
                id: crypto.randomUUID(),
                memberUserId: userId,
                memberName: member.users.name,
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

    setShowMemberSelectModal(false);
    setCurrentStyleEntryId(null);
  };

  const updateMemberRecordByIndex = (
    entryId: string,
    legIndex: number,
    updates: Partial<MemberRecord>,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          memberRecords: entry.memberRecords.map((mr, idx) =>
            idx === legIndex ? { ...mr, ...updates } : mr,
          ),
        };
      }),
    );
  };

  const updateMemberRecord = (
    entryId: string,
    memberUserId: string,
    updates: Partial<MemberRecord>,
  ) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          memberRecords: entry.memberRecords.map((mr) =>
            mr.memberUserId === memberUserId ? { ...mr, ...updates } : mr,
          ),
        };
      }),
    );
  };

  const handleTimeChangeByIndex = (entryId: string, legIndex: number, value: string) => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const mr = entry.memberRecords[legIndex];
    if (!mr) return;

    // リレー leg は relayLegStyleId を使用
    const legStyleId = mr.relayLegStyleId ?? (entry.styleId as number);
    const style = styles.find((s) => s.id === legStyleId);
    const raceDistance = style?.distance;
    const newTime = parseTimeToSeconds(value);

    setStyleEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e;
        return {
          ...e,
          memberRecords: e.memberRecords.map((rec, idx) => {
            if (idx !== legIndex) return rec;

            let updatedSplitTimes = [...rec.splitTimes];

            if (raceDistance && newTime > 0) {
              const existingSplitIndex = updatedSplitTimes.findIndex(
                (st) => typeof st.distance === "number" && st.distance === raceDistance,
              );

              if (existingSplitIndex >= 0) {
                updatedSplitTimes = updatedSplitTimes.map((st, i) =>
                  i === existingSplitIndex
                    ? { ...st, splitTime: newTime, displayValue: formatTimeBest(newTime) }
                    : st,
                );
              } else {
                updatedSplitTimes = [
                  ...updatedSplitTimes,
                  {
                    id: crypto.randomUUID(),
                    distance: raceDistance,
                    splitTime: newTime,
                    displayValue: formatTimeBest(newTime),
                  },
                ];
              }
            }

            return {
              ...rec,
              timeDisplayValue: value,
              time: newTime,
              splitTimes: updatedSplitTimes,
            };
          }),
        };
      }),
    );
  };

  const handleTimeChange = (entryId: string, memberUserId: string, value: string) => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
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

            // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
            if (raceDistance && newTime > 0) {
              const existingSplitIndex = updatedSplitTimes.findIndex(
                (st) => typeof st.distance === "number" && st.distance === raceDistance,
              );

              if (existingSplitIndex >= 0) {
                // 既存のsplit-timeを更新
                updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
                  idx === existingSplitIndex
                    ? { ...st, splitTime: newTime, displayValue: formatTimeBest(newTime) }
                    : st,
                );
              } else {
                // 新しいsplit-timeを追加
                updatedSplitTimes = [
                  ...updatedSplitTimes,
                  {
                    id: crypto.randomUUID(),
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

  // 最終タイム（種目距離と同じ距離のsplit-time）を除いた、課金対象のsplit-time数を返す
  const countBillableSplitTimes = (
    entryId: string,
    splitTimes: SplitTimeEntry[],
  ): number => {
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return splitTimes.length;
    const style = styles.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    if (!raceDistance) return splitTimes.length;
    return splitTimes.filter(
      (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
    ).length;
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
              const billableCount = countBillableSplitTimes(entryId, mr.splitTimes);
              if (billableCount >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD) {
                return mr;
              }
            }

            return {
              ...mr,
              splitTimes: [
                ...mr.splitTimes,
                {
                  id: crypto.randomUUID(),
                  distance: 0,
                  splitTime: 0,
                  displayValue: "",
                },
              ],
            };
          }),
        };
      }),
    );
  };

  const addSplitTimesEvery25m = (entryId: string, memberUserId: string) => {
    if (!memberUserId) return;
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
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
                .map((st) => (typeof st.distance === "number" ? st.distance : 0))
                .filter((d) => d > 0),
            );

            // 25m間隔で種目の距離までsplit-timeを追加
            let newSplitTimes: SplitTimeEntry[] = [];
            for (let distance = 25; distance <= raceDistance; distance += 25) {
              // 既に存在する距離はスキップ
              if (!existingDistances.has(distance)) {
                newSplitTimes.push({
                  id: crypto.randomUUID(),
                  distance,
                  splitTime: 0,
                  displayValue: "",
                });
              }
            }

            if (newSplitTimes.length === 0) return mr;

            // Free ユーザーの場合、制限内に収まるよう切り詰める（最終タイムは除外してカウント）
            if (!isPremium) {
              const billableCount = countBillableSplitTimes(entryId, mr.splitTimes);
              const newBillable = newSplitTimes.filter(
                (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
              );
              const maxNewBillable = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
              if (maxNewBillable <= 0 && newBillable.length > 0) {
                // 最終タイムだけなら追加OK
                newSplitTimes = newSplitTimes.filter(
                  (st) => typeof st.distance === "number" && st.distance === raceDistance,
                );
                if (newSplitTimes.length === 0) return mr;
              } else if (newBillable.length > maxNewBillable) {
                let billableAdded = 0;
                newSplitTimes = newSplitTimes.filter((st) => {
                  const isRaceDist = typeof st.distance === "number" && st.distance === raceDistance;
                  if (isRaceDist) return true;
                  if (billableAdded < maxNewBillable) {
                    billableAdded++;
                    return true;
                  }
                  return false;
                });
              }
            }

            return {
              ...mr,
              splitTimes: [...mr.splitTimes, ...newSplitTimes],
            };
          }),
        };
      }),
    );
  };

  const addSplitTimesEvery50m = (entryId: string, memberUserId: string) => {
    if (!memberUserId) return;
    const entry = styleEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
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
                .map((st) => (typeof st.distance === "number" ? st.distance : 0))
                .filter((d) => d > 0),
            );

            // 50m間隔で種目の距離までsplit-timeを追加
            let newSplitTimes: SplitTimeEntry[] = [];
            for (let distance = 50; distance <= raceDistance; distance += 50) {
              if (!existingDistances.has(distance)) {
                newSplitTimes.push({
                  id: crypto.randomUUID(),
                  distance,
                  splitTime: 0,
                  displayValue: "",
                });
              }
            }

            if (newSplitTimes.length === 0) return mr;

            // Free ユーザーの場合、制限内に収まるよう切り詰める（最終タイムは除外してカウント）
            if (!isPremium) {
              const billableCount = countBillableSplitTimes(entryId, mr.splitTimes);
              const newBillable = newSplitTimes.filter(
                (st) => !(typeof st.distance === "number" && st.distance === raceDistance),
              );
              const maxNewBillable = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
              if (maxNewBillable <= 0 && newBillable.length > 0) {
                newSplitTimes = newSplitTimes.filter(
                  (st) => typeof st.distance === "number" && st.distance === raceDistance,
                );
                if (newSplitTimes.length === 0) return mr;
              } else if (newBillable.length > maxNewBillable) {
                let billableAdded = 0;
                newSplitTimes = newSplitTimes.filter((st) => {
                  const isRaceDist = typeof st.distance === "number" && st.distance === raceDistance;
                  if (isRaceDist) return true;
                  if (billableAdded < maxNewBillable) {
                    billableAdded++;
                    return true;
                  }
                  return false;
                });
              }
            }

            return {
              ...mr,
              splitTimes: [...mr.splitTimes, ...newSplitTimes],
            };
          }),
        };
      }),
    );
  };

  const removeSplitTime = (entryId: string, memberUserId: string, splitId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          memberRecords: entry.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;
            return {
              ...mr,
              splitTimes: mr.splitTimes.filter((st) => st.id !== splitId),
            };
          }),
        };
      }),
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

    const style = styles.find((s) => s.id === entry.styleId);
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
                return { ...st, distance: value === "" ? 0 : parseInt(value) || 0 };
              }
              return {
                ...st,
                displayValue: value,
                splitTime: parseTimeToSeconds(value),
              };
            });

            // split-timeが変更された場合、種目の距離と同じ距離のsplit-timeならタイムも更新
            const updatedSplit = updatedSplitTimes.find((st) => st.id === splitId);
            if (
              field === "splitTime" &&
              raceDistance &&
              updatedSplit &&
              typeof updatedSplit.distance === "number" &&
              updatedSplit.distance === raceDistance
            ) {
              // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
              return {
                ...mr,
                splitTimes: updatedSplitTimes,
                time: updatedSplit.splitTime,
                timeDisplayValue:
                  updatedSplit.displayValue || formatTimeBest(updatedSplit.splitTime),
              };
            }

            return {
              ...mr,
              splitTimes: updatedSplitTimes,
            };
          }),
        };
      }),
    );
  };

  const handleVideoReady = (entryId: string, memberUserId: string, file: File, thumbnail: Blob) => {
    updateMemberRecord(entryId, memberUserId, { videoFile: file, videoThumbnailBlob: thumbnail });
    setVideoUploadModal(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    let hasError = false;

    try {
      // 有効なレコードを収集
      const validRecords: Array<{
        styleId: number;
        memberUserId: string;
        memberName: string;
        time: number;
        isRelaying: boolean;
        note: string;
        reactionTime: string;
        splitTimes: SplitTimeEntry[];
      }> = [];

      for (const entry of styleEntries) {
        if (entry.styleId === "") continue;

        // リレー種目のバリデーション: 全 leg のメンバーが選択されているか確認
        if (entry.relayEventId) {
          const hasUnselectedMember = entry.memberRecords.some((mr) => !mr.memberUserId);
          if (hasUnselectedMember) {
            alert("リレー種目はメンバー4名全員を選択してください");
            setSaving(false);
            return;
          }
        }

        for (const mr of entry.memberRecords) {
          if (mr.time > 0) {
            // リレー種目の場合は各 leg の styleId を使用、個人種目は entry の styleId
            const styleId = entry.relayEventId
              ? (mr.relayLegStyleId ?? (entry.styleId as number))
              : (entry.styleId as number);
            validRecords.push({
              styleId,
              memberUserId: mr.memberUserId,
              memberName: mr.memberName,
              time: mr.time,
              isRelaying: mr.isRelaying,
              note: mr.note,
              reactionTime: mr.reactionTime || "",
              splitTimes: mr.splitTimes,
            });
          }
        }
      }

      if (validRecords.length === 0) {
        alert("少なくとも1つの記録を入力してください");
        setSaving(false);
        return;
      }

      // 編集モードの場合は既存データを削除
      if (isEditMode) {
        for (const record of existingRecords) {
          if (record.split_times && record.split_times.length > 0) {
            const { error: splitDeleteError } = await supabase
              .from("split_times")
              .delete()
              .eq("record_id", record.id);

            if (splitDeleteError) {
              console.error("スプリットタイム削除エラー:", splitDeleteError);
              // 致命的な削除エラーなのでthrowして外側のcatchブロックで処理
              throw new Error(`スプリットタイムの削除に失敗しました: ${splitDeleteError.message}`);
            }
          }
        }

        const { error: deleteError } = await supabase
          .from("records")
          .delete()
          .eq("competition_id", competitionId)
          .eq("team_id", teamId);

        if (deleteError) {
          console.error("既存のレコード削除エラー:", deleteError);
          // 致命的な削除エラーなのでthrowして外側のcatchブロックで処理
          throw new Error(`既存レコードの削除に失敗しました: ${deleteError.message}`);
        }
      }

      // 新規レコードを作成
      for (const record of validRecords) {
        const { data: newRecord, error: recordError } = await supabase
          .from("records")
          .insert({
            competition_id: competitionId,
            user_id: record.memberUserId,
            team_id: teamId,
            style_id: record.styleId,
            time: record.time,
            note: record.note || null,
            is_relaying: record.isRelaying,
            pool_type: competition.pool_type,
            reaction_time:
              record.reactionTime && record.reactionTime.trim() !== ""
                ? parseFloat(record.reactionTime)
                : null,
          })
          .select("id")
          .single();

        if (recordError) {
          console.error(`Record作成エラー (${record.memberName}):`, recordError);
          hasError = true;
          continue;
        }

        const validSplitTimes = record.splitTimes.filter(
          (st) => st.distance > 0 && st.splitTime > 0,
        );
        if (validSplitTimes.length > 0 && newRecord) {
          const splitTimesData = validSplitTimes.map((st) => ({
            record_id: newRecord.id,
            distance: st.distance as number,
            split_time: st.splitTime,
          }));

          const { error: splitError } = await supabase.from("split_times").insert(splitTimesData);

          if (splitError) {
            console.error(`SplitTime作成エラー (${record.memberName}):`, splitError);
            hasError = true;
          }
        }
      }

      // エラーが発生した場合はリダイレクトしない
      if (hasError) {
        alert("保存中にエラーが発生しました。もう一度お試しください。");
        return;
      }

      // 動画アップロード（保存されたrecordの各メンバーへ）
      for (const entry of styleEntries) {
        for (const mr of entry.memberRecords) {
          if (!mr.videoFile || !mr.id) continue;
          try {
            const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "record", id: mr.id, contentType: "video/mp4" }),
            });
            if (!uploadUrlRes.ok) continue;
            const { videoUploadUrl, thumbnailUploadUrl, videoPath: vPath, thumbnailPath: tPath } =
              await uploadUrlRes.json() as {
                videoUploadUrl: string;
                thumbnailUploadUrl: string;
                videoPath: string;
                thumbnailPath: string;
              };
            await fetch(videoUploadUrl, { method: "PUT", body: mr.videoFile });
            if (mr.videoThumbnailBlob) {
              await fetch(thumbnailUploadUrl, { method: "PUT", body: mr.videoThumbnailBlob });
            }
            const confirmFormData = new FormData();
            confirmFormData.append("type", "record");
            confirmFormData.append("id", mr.id);
            confirmFormData.append("videoPath", vPath);
            confirmFormData.append("thumbnailPath", tPath);
            if (mr.videoThumbnailBlob) {
              confirmFormData.append(
                "thumbnailBlob",
                new File([mr.videoThumbnailBlob], "thumbnail.webp", { type: "image/webp" }),
              );
            }
            await fetch("/api/storage/videos/confirm", { method: "POST", body: confirmFormData });
            await fetch("/api/storage/videos/team-assign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "record",
                sourceId: mr.id,
                targetUserId: mr.memberUserId,
                teamId,
                tempVideoPath: vPath,
                tempThumbnailPath: tPath,
              }),
            });
          } catch (videoErr) {
            console.error("動画アップロードエラー:", videoErr);
          }
        }
      }

      router.push(`/teams/${teamId}?tab=competitions`);
    } catch (err) {
      console.error("チーム大会記録作成エラー:", err);
      alert("保存中にエラーが発生しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    router.push(`/teams/${teamId}?tab=competitions`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            大会一覧に戻る
          </button>

          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isEditMode ? "チーム大会記録を編集" : "チーム大会記録を追加"}
            </h1>
            <p className="text-gray-600 mb-4">種目ごとにメンバーの記録を入力できます</p>

            {/* 大会情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <span className="font-medium">{competition.title || "大会"}</span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4" />
                <span>
                  {format(new Date(competition.date + "T00:00:00"), "yyyy年M月d日(EEE)", {
                    locale: ja,
                  })}
                </span>
              </div>
              {competition.place && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span>{competition.place}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                  {competition.pool_type === 1 ? "長水路" : "短水路"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {styleEntries.map((entry, entryIndex) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-6">
              {/* 種目ヘッダー */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">種目 {entryIndex + 1}</h2>
                {styleEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStyleEntry(entry.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* 種目選択 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">種目</label>
                <select
                  value={entry.relayEventId ? `relay:${entry.relayEventId}` : entry.styleId}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("relay:")) {
                      updateRelayEntry(entry.id, val.slice(6) as RelayEventId);
                    } else if (val !== "") {
                      updateStyleEntry(entry.id, parseInt(val));
                    }
                  }}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">選択してください</option>
                  <optgroup label="個人種目">
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name_jp}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="リレー種目">
                    {RELAY_EVENTS.map((relay) => (
                      <option key={relay.id} value={`relay:${relay.id}`}>
                        {relay.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* 対象メンバー選択 (個人種目) */}
              {!entry.relayEventId && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">対象メンバー</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openMemberSelectModal(entry.id)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <UserGroupIcon className="h-4 w-4 mr-2" />
                      メンバーを選択
                    </button>
                    <span className="text-sm text-gray-600">
                      {entry.memberRecords.length}名選択中
                    </span>
                  </div>
                  {entry.memberRecords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {entry.memberRecords.map((mr) => (
                        <span
                          key={mr.memberUserId}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {mr.memberName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* メンバーごとの記録入力 */}
              {entry.memberRecords.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700">記録入力</h3>
                  {entry.memberRecords.map((mr, mrIndex) => (
                    <div key={entry.relayEventId ? `relay-leg-${mrIndex}` : mr.memberUserId} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        {entry.relayEventId ? (
                          // リレー種目: 泳者ラベル + メンバー選択セレクト
                          <div className="flex-1">
                            <p className="text-xs font-medium text-blue-700 mb-1">
                              {mr.relayLegLabel}
                            </p>
                            <select
                              value={mr.memberUserId}
                              onChange={(e) => {
                                const selectedUserId = e.target.value;
                                const selectedMember = members.find((m) => m.user_id === selectedUserId);
                                updateMemberRecordByIndex(entry.id, mrIndex, {
                                  memberUserId: selectedUserId,
                                  memberName: selectedMember?.users.name || "",
                                });
                              }}
                              className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">泳者を選択</option>
                              {members.map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                  {m.users.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">{mr.memberName}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                        {/* タイムとリアクションタイム */}
                        <div className="md:col-span-2">
                          <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                タイム
                              </label>
                              <input
                                type="text"
                                value={mr.timeDisplayValue}
                                onChange={(e) =>
                                  entry.relayEventId
                                    ? handleTimeChangeByIndex(entry.id, mrIndex, e.target.value)
                                    : handleTimeChange(entry.id, mr.memberUserId, e.target.value)
                                }
                                placeholder="例: 1:30.50"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="w-36">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                リアクションタイム
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.40"
                                max="1.00"
                                value={mr.reactionTime || ""}
                                onChange={(e) =>
                                  entry.relayEventId
                                    ? updateMemberRecordByIndex(entry.id, mrIndex, {
                                        reactionTime: e.target.value,
                                      })
                                    : updateMemberRecord(entry.id, mr.memberUserId, {
                                        reactionTime: e.target.value,
                                      })
                                }
                                placeholder="0.65"
                                className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* リレーチェックボックス: 個人種目のみ表示 */}
                        {!entry.relayEventId && (
                          <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={mr.isRelaying}
                                onChange={(e) =>
                                  updateMemberRecord(entry.id, mr.memberUserId, {
                                    isRelaying: e.target.checked,
                                  })
                                }
                                className="rounded border-gray-300"
                              />
                              リレー
                            </label>
                          </div>
                        )}

                        {/* メモ */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            メモ
                          </label>
                          <input
                            type="text"
                            value={mr.note}
                            onChange={(e) =>
                              entry.relayEventId
                                ? updateMemberRecordByIndex(entry.id, mrIndex, {
                                    note: e.target.value,
                                  })
                                : updateMemberRecord(entry.id, mr.memberUserId, {
                                    note: e.target.value,
                                  })
                            }
                            placeholder="メモ"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* スプリットタイム */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-gray-600">
                            スプリットタイム
                          </label>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              onClick={() => addSplitTimesEvery25m(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={
                                (entry.relayEventId ? !mr.memberUserId : false) ||
                                (entry.relayEventId
                                  ? !styles.find((s) => s.id === mr.relayLegStyleId)?.distance
                                  : !styles.find((s) => s.id === entry.styleId)?.distance)
                              }
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加(25mごと)
                            </Button>
                            <Button
                              type="button"
                              onClick={() => addSplitTimesEvery50m(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={
                                (entry.relayEventId ? !mr.memberUserId : false) ||
                                (entry.relayEventId
                                  ? !styles.find((s) => s.id === mr.relayLegStyleId)?.distance
                                  : !styles.find((s) => s.id === entry.styleId)?.distance)
                              }
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加(50mごと)
                            </Button>
                            <Button
                              type="button"
                              onClick={() => addSplitTime(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={entry.relayEventId ? !mr.memberUserId : false}
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加
                            </Button>
                          </div>
                        </div>
                        {mr.splitTimes.length > 0 && (
                          <div className="space-y-2">
                            {[...mr.splitTimes]
                              .sort((a, b) => {
                                const distA = typeof a.distance === "number" ? a.distance : 0;
                                const distB = typeof b.distance === "number" ? b.distance : 0;
                                return distA - distB;
                              })
                              .map((split) => (
                                <div key={split.id} className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={split.distance}
                                    onChange={(e) =>
                                      updateSplitTime(
                                        entry.id,
                                        mr.memberUserId,
                                        split.id,
                                        "distance",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="距離"
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <span className="text-gray-500 text-sm">m:</span>
                                  <input
                                    type="text"
                                    value={split.displayValue}
                                    onChange={(e) =>
                                      updateSplitTime(
                                        entry.id,
                                        mr.memberUserId,
                                        split.id,
                                        "splitTime",
                                        e.target.value,
                                      )
                                    }
                                    placeholder="例: 30.50"
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSplitTime(entry.id, mr.memberUserId, split.id)
                                    }
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                          </div>
                        )}

                        {/* 動画選択ボタン */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            type="button"
                            onClick={() =>
                              setVideoUploadModal({
                                entryId: entry.id,
                                memberUserId: mr.memberUserId,
                                memberName: mr.memberName,
                              })
                            }
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                              mr.videoFile
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-gray-300 bg-white text-gray-600 hover:border-blue-400"
                            }`}
                          >
                            <VideoCameraIcon className="h-3.5 w-3.5" />
                            {mr.videoFile ? "動画あり" : "動画を選択"}
                          </button>
                        </div>

                        {/* Lap-Time表示 */}
                        {mr.splitTimes.length > 0 && (
                          <LapTimeDisplay
                            splitTimes={(() => {
                              const baseSplits = mr.splitTimes.map((st) => ({
                                distance: st.distance,
                                splitTime: st.splitTime,
                              }));
                              const legStyleId = entry.relayEventId
                                ? (mr.relayLegStyleId ?? (entry.styleId as number))
                                : (entry.styleId as number);
                              const raceDistance = styles.find(
                                (s) => s.id === legStyleId,
                              )?.distance;
                              const recordTime = mr.time;
                              if (raceDistance && recordTime && recordTime > 0) {
                                const hasGoalSplit = baseSplits.some(
                                  (st) => st.distance === raceDistance,
                                );
                                if (!hasGoalSplit) {
                                  return [
                                    ...baseSplits,
                                    { distance: raceDistance, splitTime: recordTime },
                                  ];
                                }
                              }
                              return baseSplits;
                            })()}
                            raceDistance={
                              entry.relayEventId
                                ? styles.find((s) => s.id === mr.relayLegStyleId)?.distance
                                : styles.find((s) => s.id === entry.styleId)?.distance
                            }
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* 種目追加ボタン */}
          <Button type="button" onClick={addStyleEntry} variant="outline" className="w-full">
            <PlusIcon className="h-4 w-4 mr-2" />
            種目を追加
          </Button>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" onClick={handleBack} variant="secondary">
              キャンセル
            </Button>
            <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "保存中..." : isEditMode ? "チーム大会記録を更新" : "チーム大会記録を保存"}
            </Button>
          </div>
        </form>
      </div>

      {/* メンバー選択モーダル */}
      {showMemberSelectModal && currentStyleEntryId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowMemberSelectModal(false)}
            />
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 max-w-lg w-full max-h-[80vh] flex flex-col">
              {/* モーダルヘッダー */}
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">対象メンバーを選択</h3>
                <button
                  type="button"
                  onClick={() => setShowMemberSelectModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* 一括選択ボタン */}
              <div className="flex gap-2 p-4 border-b bg-gray-50">
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds(members.map((m) => m.user_id))}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                >
                  全員選択
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds([])}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  選択解除
                </button>
              </div>

              {/* メンバーリスト */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {members.map((member) => {
                    const isSelected = tempSelectedUserIds.includes(member.user_id);

                    return (
                      <label
                        key={member.id}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTempSelectedUserIds((prev) => [...prev, member.user_id]);
                            } else {
                              setTempSelectedUserIds((prev) =>
                                prev.filter((id) => id !== member.user_id),
                              );
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 flex-1 text-sm font-medium text-gray-900">
                          {member.users.name}
                        </span>
                        {member.role === "admin" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            管理者
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* モーダルフッター */}
              <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                <span className="text-sm text-gray-600">{tempSelectedUserIds.length}名選択中</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowMemberSelectModal(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmMemberSelection}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    決定
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 動画アップロードモーダル */}
      {videoUploadModal && (
        <TeamVideoUploader
          targetUserId={videoUploadModal.memberUserId}
          targetUserName={videoUploadModal.memberName}
          onVideoReady={(file, thumbnail) =>
            handleVideoReady(
              videoUploadModal.entryId,
              videoUploadModal.memberUserId,
              file,
              thumbnail,
            )
          }
          onCancel={() => setVideoUploadModal(null)}
        />
      )}
    </div>
  );
}
