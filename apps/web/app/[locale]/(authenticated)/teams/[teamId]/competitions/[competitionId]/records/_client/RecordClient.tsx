"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/contexts/AuthProvider";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
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
import { excludeNonSwimmers } from "@apps/shared/utils/swimmerFilter";
import { FREE_PLAN_LIMITS } from "@apps/shared/constants/premium";
import { useInvalidateTeamRankings } from "@apps/shared/hooks/queries/useInvalidateTeamRankings";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { formatTimeBest, parseTimeToSeconds } from "@/utils/formatters";
import { styleIdToCodeKey, buildSwimStyleLabel } from "@/utils/swimStyle";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import {
  buildRelayEvents,
  RelayEventId,
  isRelayingForLeg,
  calcCumulativeTimes,
  calcLegTimesFromCumulative,
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
} from "./relayEvents";
import {
  resolveRelayGenderCategory,
  type RelaySavePlan,
} from "@apps/shared/utils/relayRecordSave";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import { computeRecordSaveDiff } from "@apps/shared/utils/recordSaveDiff";
import {
  buildStyleEntriesFromExisting,
  applyEntryAdditionsToStyleEntries,
  stampExistingEntryTimeReferences,
  type MemberRecord,
  type StyleEntry,
  type SplitTimeEntry,
} from "./buildStyleEntries";
import {
  planEntryAdditionsForRecords,
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@swim-hub/shared/utils/entryRecordMerge";
import { getBestTimeForEntry } from "@/utils/bestTimeForEntry";
import type { BestTime } from "@apps/shared/types/ui";

// TeamVideoUploaderを動的インポート
const TeamVideoUploader = dynamic(() => import("@/components/video/TeamVideoUploader"), {
  ssr: false,
});

const RELAY_FREE_PLAN_MAX_SPLITS = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD * 4;

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  // optional: 呼び出し元の select 漏れ・古いキャッシュでは無い場合がある。
  // undefined は「泳者」として扱う (apps/shared/utils/swimmerFilter.ts と同じ判定)。
  is_swimmer?: boolean;
  users: {
    id: string;
    name: string;
    /**
     * `users.gender` (0=男性 / 1=女性)。DB は integer NOT NULL DEFAULT 0 + CHECK(0,1)。
     * `relay_records.gender_category` の prefill に使う。
     *
     * **optional にしてはいけない。** 唯一の呼び出し元 `_server/RecordDataLoader.tsx`
     * は select に `gender` を入れて必ず渡している。optional にすると、将来 select から
     * `gender` が落ちたときに `memberGenderByUserId` が空の Map になり、
     * **全リレーが静かに `mixed` で保存されて男子/女子フィルタから消える**
     * (例外もログも出ない)。必須にしておけばその変更は型で落ちる。
     * ⚠️ `?? 0` で埋めてはいけない (「不明」が「男性」として静かに確定する)。
     */
    gender: number;
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


interface EntryWithUser {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
  users: {
    id: string;
    name: string;
  } | null;
}

interface RecordClientProps {
  teamId: string;
  competitionId: string;
  competition: CompetitionWithDetails;
  teamName: string;
  members: TeamMember[];
  existingRecords: RecordWithDetails[];
  styles: Style[];
  /** 大会エントリー（記録入力の初期反映用） */
  entries: EntryWithUser[];
  /**
   * user_id → その選手のベストタイム一覧（両水路・引き継ぎ込み）。
   * 参考バッジの表示にのみ使う。入力値のプリフィルには**絶対に使わない**
   * (エントリー画面と違い、ここは結果タイムを入力する画面なので
   *  ベストタイムが初期値として入ると実測値と区別できなくなる)。
   */
  bestTimesByUser: Record<string, BestTime[]>;
}

export default function RecordClient({
  teamId,
  competitionId,
  competition,
  teamName: _teamName,
  members,
  existingRecords,
  styles,
  entries,
  bestTimesByUser,
}: RecordClientProps) {
  const router = useRouter();
  const t = useTranslations("teams");
  const tCommon = useTranslations("common");
  const tRecords = useTranslations("competition.records");
  const tStyles = useTranslations("practice.styles");
  // 参考ラベル「エントリータイム:」は mobile (RecordLogFormScreen 等) と同じ
  // forms.recordLog.entryTimeLabel を再利用する (同義キーを増やさない)
  const tRecordLog = useTranslations("forms.recordLog");
  const locale = useLocale();
  const { supabase, subscription } = useAuth();
  const invalidateRankings = useInvalidateTeamRankings();

  /**
   * リレーのチーム記録の書き込み API。差し替えの手順は shared 側が持つ
   * (web/mobile で同じ実装を複製しないため)。
   */
  const relayRecordsApi = useMemo(() => new TeamRelayRecordsAPI(supabase), [supabase]);

  /**
   * `user_id` → `users.gender`。リレーのチーム記録の性別区分 prefill にのみ使う。
   * `TeamMember.users.gender` が必須なので欠損は型で起こらない。
   * (メンバー一覧に居ない user_id は `resolveRelayGenderCategory` が
   *  「不明」として `mixed` に寄せる。0 で埋めない)
   */
  const memberGenderByUserId = useMemo(
    () => new Map(members.map((member) => [member.user_id, member.users.gender])),
    [members],
  );

  // 候補提示 (メンバー選択欄・リレー泳者選択) の直前だけをフィルタする。members 自体は
  // memberGenderByUserId (性別区分 prefill) と confirmMemberSelection 内の名前解決にも
  // 共用されているため、フィルタ済みの生配列に置き換えてはならない (PM裁定 R4)。
  const swimmerCandidates = useMemo(() => excludeNonSwimmers(members), [members]);

  /**
   * ネイティブ `<select>` は `value` がどの `<option>` とも一致しないと、
   * ブラウザが暗黙に先頭 (空プレースホルダー) を選択してしまう。
   * 既に非泳者が割り当て済みのリレーレグでは `currentUserId` が
   * `swimmerCandidates` から漏れているため、そのままだと表示が壊れる
   * (Critical: 受け入れ基準「非泳者に変更しても既存の記録は消えない」への違反)。
   * 「候補を絞った配列」と「既存の選択値」を union してから options に渡すこと。
   */
  const withCurrentSelection = (candidates: TeamMember[], currentUserId: string): TeamMember[] => {
    if (!currentUserId || candidates.some((m) => m.user_id === currentUserId)) return candidates;
    const current = members.find((m) => m.user_id === currentUserId);
    return current ? [...candidates, current] : candidates;
  };

  /** style_id から翻訳済み種目ラベルを組み立てる。未知種目は name_jp をそのまま返す */
  const styleOptionLabel = (style: Style): string => {
    const codeKey = styleIdToCodeKey(style.id);
    if (codeKey) {
      return buildSwimStyleLabel(style.distance, tStyles(codeKey), locale);
    }
    return style.name_jp;
  };
  const isPremium = checkIsPremium(subscription);

  const relayEvents = useMemo(
    () =>
      buildRelayEvents({
        ba: tStyles("Ba"),
        br: tStyles("Br"),
        fly: tStyles("Fly"),
        fr: tStyles("Fr"),
        legLabel: (num, style) => tRecords("relayLegLabel", { num, style }),
        freeRelaySuffix: tRecords("freeRelaySuffix"),
        medleyRelaySuffix: tRecords("medleyRelaySuffix"),
      }),
    [tStyles, tRecords],
  );

  const [saving, setSaving] = useState(false);
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [currentStyleEntryId, setCurrentStyleEntryId] = useState<string | null>(null);
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>([]);
  const [videoUploadModal, setVideoUploadModal] = useState<{
    entryId: string;
    memberUserId: string;
    memberName: string;
  } | null>(null);

  const [styleEntries, setStyleEntries] = useState<StyleEntry[]>(() => {
    const base = buildStyleEntriesFromExisting(existingRecords, styles);

    // 大会エントリーのうち、既存記録が無い (user_id, style_id) の組だけを初期反映する
    // (仕様: 既存記録を優先し、不足分だけエントリーから追加。リレーグループには触れない)
    const entryRows: EntryRowForRecordMerge[] = entries.map((entry) => ({
      id: entry.id,
      user_id: entry.user_id,
      style_id: entry.style_id,
      entry_time: entry.entry_time,
      note: entry.note,
      userName: entry.users?.name || t("competitionRecordsModal.unknownUser"),
    }));
    const plans = planEntryAdditionsForRecords(entryRows, base, styles);
    const merged = applyEntryAdditionsToStyleEntries(base, plans);

    // 既存記録由来の行にも参考表示 (entryTimeReference) を後付けする (仕様#修正3:
    // 重複排除で追加されなかった行でも、申告タイムと結果タイムを見比べられるようにする)
    const entryTimeByUserStyle = buildEntryTimeReferenceLookup(entryRows);
    return stampExistingEntryTimeReferences(merged, entryTimeByUserStyle);
  });

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

  /**
   * 参考バッジ用のベストタイム。`styleId` を DB 識別子 `styles.name_jp` に解決してから
   * 共通の優先順位表 (`@apps/shared/utils/bestTimeForEntry`) に渡す。
   * 大会の水路 (`competitions.pool_type` は DB NOT NULL) を基準に、無ければ他水路へ落ちる。
   *
   * リレー種目では leg ごとの種目 (`relayLegStyleId`) と引き継ぎフラグ
   * (第1泳者のみ false) を渡すので、第2〜4泳者には引き継ぎベストが出る。
   */
  const bestTimeBadgeFor = (
    memberUserId: string,
    styleId: number | "" | undefined,
    isRelaying: boolean,
  ): { time: number; label: string } | null => {
    if (!memberUserId || styleId === "" || styleId === undefined) return null;
    const styleName = styles.find((st) => st.id === styleId)?.name_jp;
    if (!styleName) return null;
    const result = getBestTimeForEntry(
      styleName,
      competition.pool_type,
      isRelaying,
      bestTimesByUser[memberUserId] ?? [],
    );
    return result ? { time: result.time, label: tRecordLog(result.labelKey) } : null;
  };

  /** リレーのレグラベルを relayEventId から導出する。復元経路では state の relayLegLabel が undefined のため */
  const relayLegLabelOf = (entry: StyleEntry, legIndex: number): string | undefined =>
    (entry.relayEventId
      ? relayEvents.find((r) => r.id === entry.relayEventId)?.legs[legIndex]?.legLabel
      : undefined) ?? entry.memberRecords[legIndex]?.relayLegLabel;

  const updateRelayEntry = (entryId: string, relayEventId: RelayEventId) => {
    const relayDef = relayEvents.find((r) => r.id === relayEventId);
    if (!relayDef) return;
    const firstLeg = relayDef.legs[0];
    if (!firstLeg) return; // relayDef.legs は常に4件保証されるが型上は保証されないため防御的に扱う

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
      cumulativeTimeSeconds: 0,
    }));

    // leg 境界のスプリット欄を事前に用意（最終 leg は合計タイム欄と同期するので除外）
    const legBoundaries = getRelayLegBoundaries(relayEventId);
    const defaultSplitDistances = legBoundaries.slice(0, 3);
    const allowedCount = isPremium
      ? defaultSplitDistances.length
      : Math.max(0, Math.min(defaultSplitDistances.length, RELAY_FREE_PLAN_MAX_SPLITS));
    const defaultSplits: SplitTimeEntry[] = defaultSplitDistances
      .slice(0, allowedCount)
      .map((distance) => ({
        id: crypto.randomUUID(),
        distance,
        splitTime: 0,
        displayValue: "",
      }));

    setStyleEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              styleId: firstLeg.styleId, // 代表 styleId (第1泳者の種目)
              styleName: relayDef.label,
              relayEventId,
              memberRecords: legRecords,
              relaySplitTimes: defaultSplits,
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

  /**
   * 合計タイム入力ハンドラ（リレー種目専用）。
   * 全体距離スプリットを relaySplitTimes に同期し、各 leg の time を再計算する。
   */
  const handleRelayTotalTimeChange = (entryId: string, value: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;

        const totalSeconds = parseTimeToSeconds(value);
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const totalDistance = legBoundaries[3];
        if (totalDistance === undefined) return entry; // legBoundaries は固定4要素配列で
          // 本来常に定義されるが型上は保証されないため防御的に扱う

        // relaySplitTimes の全体距離スプリット（= totalDistance）を同期更新
        const currentSplits = entry.relaySplitTimes ?? [];
        const existingIdx = currentSplits.findIndex((st) => st.distance === totalDistance);
        let updatedSplits: SplitTimeEntry[];
        if (totalSeconds > 0) {
          const newSplit: SplitTimeEntry = {
            id: existingIdx >= 0 ? currentSplits[existingIdx]!.id : crypto.randomUUID(), // existingIdx >= 0 を直前の三項演算子の条件で確認済み
            distance: totalDistance,
            splitTime: totalSeconds,
            displayValue: value,
          };
          if (existingIdx >= 0) {
            updatedSplits = currentSplits.map((st, i) => (i === existingIdx ? newSplit : st));
          } else {
            updatedSplits = [...currentSplits, newSplit];
          }
        } else {
          updatedSplits = existingIdx >= 0
            ? currentSplits.filter((_, i) => i !== existingIdx)
            : currentSplits;
        }

        // leg 境界スプリットが揃っている場合に各 leg の time を再計算
        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent ? calcLegTimesFromCumulative(newCumulatives) : null;

        const updatedMemberRecords = entry.memberRecords.map((mr, idx) => {
          const newCum = newCumulatives[idx] ?? 0; // newCumulatives は legBoundaries と同じ
            // 長さで1:1生成される。0は「境界未確定」の sentinel で直後の `> 0` 判定が扱う
          const isLastLeg = idx === 3;
          // 最終leg（合計タイム）は入力値に常に追従させ、クリア操作も反映する
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

  /**
   * リレースプリット変更ハンドラ（relaySplitTimes ベース）。
   * leg 境界距離のスプリット変更時に対応する leg の cumulativeTimeSeconds を同期し、
   * 全境界が揃っていれば各 leg の time を再計算する。
   */
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
        if (totalDistance === undefined) return entry; // legBoundaries は固定4要素配列で
          // 本来常に定義されるが型上は保証されないため防御的に扱う

        const updatedSplits = (entry.relaySplitTimes ?? []).map((st) => {
          if (st.id !== splitId) return st;
          if (field === "distance") {
            const parsed = parseFloat(value);
            return { ...st, distance: value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed) };
          }
          return {
            ...st,
            displayValue: value,
            splitTime: parseTimeToSeconds(value),
          };
        });

        // leg 境界スプリットが揃っている場合に各 leg の time を再計算
        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent ? calcLegTimesFromCumulative(newCumulatives) : null;

        // 変更されたスプリットが全体距離の場合、合計タイム欄（leg3）を同期
        const changedSplit = updatedSplits.find((st) => st.id === splitId);
        const isTotalDistanceSplit =
          field === "splitTime" && changedSplit && changedSplit.distance === totalDistance;

        const updatedMemberRecords = entry.memberRecords.map((mr, idx) => {
          const newCum = (allBoundariesPresent ? newCumulatives[idx] : 0) ?? 0; // newCumulatives は
            // legBoundaries と同じ長さで1:1生成される。0は「境界未確定」の sentinel
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

  const addRelaySplitTime = (entryId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        const currentSplits = entry.relaySplitTimes ?? [];
        if (!isPremium && currentSplits.length >= RELAY_FREE_PLAN_MAX_SPLITS) {
          return entry;
        }
        return {
          ...entry,
          relaySplitTimes: [
            ...currentSplits,
            { id: crypto.randomUUID(), distance: 0, splitTime: 0, displayValue: "" },
          ],
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
        if (totalDistance === undefined) return entry; // legBoundaries は固定4要素配列で
          // 本来常に定義されるが型上は保証されないため防御的に扱う
        const currentSplits = entry.relaySplitTimes ?? [];
        const existingDistances = new Set(
          currentSplits.map((st) => st.distance).filter((d) => d > 0),
        );

        let newSplits: SplitTimeEntry[] = [];
        for (let distance = interval; distance <= totalDistance; distance += interval) {
          if (!existingDistances.has(distance)) {
            newSplits.push({ id: crypto.randomUUID(), distance, splitTime: 0, displayValue: "" });
          }
        }
        if (newSplits.length === 0) return entry;

        if (!isPremium) {
          const current = currentSplits.length;
          const max = RELAY_FREE_PLAN_MAX_SPLITS - current;
          if (max <= 0) return entry;
          newSplits = newSplits.slice(0, max);
        }

        return { ...entry, relaySplitTimes: [...currentSplits, ...newSplits] };
      }),
    );
  };

  const addRelaySplitTimesEvery25m = (entryId: string) => addRelaySplitTimesAtInterval(entryId, 25);
  const addRelaySplitTimesEvery50m = (entryId: string) => addRelaySplitTimesAtInterval(entryId, 50);

  const removeRelaySplitTime = (entryId: string, splitId: string) => {
    setStyleEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        return {
          ...entry,
          relaySplitTimes: (entry.relaySplitTimes ?? []).filter((st) => st.id !== splitId),
        };
      }),
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
                const parsed = parseInt(value, 10);
                return { ...st, distance: value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed) };
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
      // id: フォーム行の id (MemberRecord.id)。既存記録由来なら records.id、エントリー由来
      // なら entries.id、新規追加行なら生成値 — 文字列は区別できないので、この後の
      // upsert 振り分けは id の membership のみで行う (computeRecordSaveDiff)。
      // index: この配列内での位置。relay_record_legs.record_id を写すための
      // insertedRecordIds と同じ添字を使うために保持する。
      const validRecords: Array<{
        index: number;
        id: string;
        styleId: number;
        memberUserId: string;
        memberName: string;
        time: number;
        isRelaying: boolean;
        note: string;
        reactionTime: string;
        splitTimes: SplitTimeEntry[];
      }> = [];

      // リレーのチーム記録 (relay_records / relay_record_legs) を書くための計画。
      // ここでは1件も書き込まず、`records` への書き込みが**全て成功した後**に
      // まとめて実行する (理由は下の「リレー側の書き込みタイミング」コメント)。
      const relayPlans: RelaySavePlan[] = [];

      for (const entry of styleEntries) {
        if (entry.styleId === "") continue;

        // リレー種目の各 leg 開始通算タイム (record.time ベース)。D2 (保存時の leg 相対変換)
        // と D3 (split の事前バリデーション) で共有する。
        const legCumulativeTimes = entry.relayEventId
          ? calcCumulativeTimes(entry.memberRecords.map((mr) => mr.time))
          : [];

        // リレー種目のバリデーション
        if (entry.relayEventId) {
          const hasUnselectedMember = entry.memberRecords.some((mr) => !mr.memberUserId);
          if (hasUnselectedMember) {
            alert(tRecords("validation.relayFullTeam"));
            setSaving(false);
            return;
          }

          // 部分入力バリデーション: 全 leg 入力または全 leg 未入力のみ許容
          const cumulatives = entry.memberRecords.map((mr) => mr.cumulativeTimeSeconds ?? 0);
          const inputtedLegs = cumulatives.filter((c) => c > 0);
          if (inputtedLegs.length > 0 && inputtedLegs.length < 4) {
            alert(tRecords("validation.relayAllTimes"));
            setSaving(false);
            return;
          }

          // 累計タイム逆転バリデーション (全 leg 入力済みの場合のみ実行)
          if (inputtedLegs.length === 4) {
            for (let i = 1; i < cumulatives.length; i++) {
              const prevCum = cumulatives[i - 1];
              const currCum = cumulatives[i];
              if (prevCum === undefined || currCum === undefined) continue; // i>=1 かつ
                // i<cumulatives.length のため理論上 undefined にならないが防御的に扱う
              if (currCum <= prevCum) {
                alert(
                  tRecords("validation.cumulativeTimeInverted", { current: i + 1, prev: i }),
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
              const legIdx = legBoundaries.findIndex((boundary) => st.distance <= boundary);
              if (legIdx === -1) continue;
              const legStart = getLegStartCumulative(legCumulativeTimes, legIdx);
              if (st.splitTime <= legStart + INVERSION_TOLERANCE) {
                alert(
                  tRecords("validation.relaySplitBeforeLegStart", {
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

        // リレーのチーム記録の計画を1本ぶん用意する。レグを1件も保存しない場合
        // (全レグ未入力) はこの計画に legs が入らないので、後段で捨てられる。
        // ⚠️ **既存の `records` への書き込みは一切変えない。** ここは同じループで
        // 収集した情報を relay_records 側にも写すためだけの追加である。
        const relayPlanIndex = entry.relayEventId ? relayPlans.length : null;
        if (entry.relayEventId && relayPlanIndex !== null) {
          const totalTime = legCumulativeTimes.at(-1);
          relayPlans.push({
            relayEventId: entry.relayEventId,
            // 総合タイムは通算タイムの最終要素。**レグの和をここで再計算し直さない**
            // (calcCumulativeTimes が小数第2位で丸めながら積み上げた値をそのまま使う)。
            // 全レグ未入力のときは undefined になるので 0 を入れ、legs が空の計画として
            // 後段で捨てる (0 は CHECK (total_time > 0) にも弾かれる値なので、
            // 万一書き込もうとしても静かには通らない)。
            totalTime: totalTime ?? 0,
            legCount: entry.memberRecords.length,
            genderCategory: resolveRelayGenderCategory(
              entry.memberRecords.map((mr) => mr.memberUserId),
              memberGenderByUserId,
            ),
            legs: [],
          });
        }

        for (let legIdx = 0; legIdx < entry.memberRecords.length; legIdx++) {
          const mr = entry.memberRecords[legIdx];
          if (!mr) continue; // entry.memberRecords.length に基づく for ループのため型上のみの防御
          // リレー種目: 累計タイムが > 0 なら保存対象（区間タイムは累計から逆算されるため0になりえない）
          // 個人種目: 区間タイムが > 0 なら保存対象
          const shouldSave = entry.relayEventId
            ? (mr.cumulativeTimeSeconds ?? 0) > 0
            : mr.time > 0;
          if (shouldSave) {
            // リレー種目の場合は各 leg の styleId を使用、個人種目は entry の styleId
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
              if (legLow === undefined) continue; // legBoundaries は固定4要素配列で
                // 本来常に定義されるが、legLow=0 (leg0 の意味) と取り違えないよう ?? は使わない
              const legHigh = legBoundaries[legIdx];
              if (legHigh === undefined) continue; // legBoundaries は固定4要素配列で
                // 本来常に定義されるが型上は保証されないため防御的に扱う
              const legStart = getLegStartCumulative(legCumulativeTimes, legIdx);
              splitTimes = entry.relaySplitTimes
                .filter(
                  (st) => st.distance > legLow && st.distance <= legHigh,
                )
                .map((st) => {
                  const legRelativeSplitTime = toLegRelativeSplitTime(st.splitTime, legStart);
                  return {
                    ...st,
                    distance: legIdx === 0 ? st.distance : st.distance - legLow,
                    splitTime: legRelativeSplitTime,
                    displayValue: formatTimeBest(legRelativeSplitTime),
                  };
                });
            }

            validRecords.push({
              index: validRecords.length,
              id: mr.id,
              styleId,
              memberUserId: mr.memberUserId,
              memberName: mr.memberName,
              time: mr.time,
              isRelaying: mr.isRelaying,
              note: mr.note,
              reactionTime: mr.reactionTime || "",
              splitTimes,
            });

            // リレーのレグを計画に積む。
            // `legTime` は **区間タイム** (`mr.time`)。通算タイムではない。
            // 通算は relayEvents.ts の calcCumulativeTimes() で導出する
            // (過去に通算値が混入して lap が崩れた前科があるため DB に入れない)。
            if (relayPlanIndex !== null) {
              const plan = relayPlans[relayPlanIndex];
              if (plan) {
                plan.legs.push({
                  legIndex: legIdx,
                  userId: mr.memberUserId,
                  styleId,
                  legTime: mr.time,
                  reactionTime:
                    mr.reactionTime && mr.reactionTime.trim() !== ""
                      ? parseFloat(mr.reactionTime)
                      : null,
                  validRecordIndex: validRecords.length - 1,
                });
              }
            }
          }
        }
      }

      if (validRecords.length === 0) {
        alert(tRecords("validation.atLeastOneRecord"));
        setSaving(false);
        return;
      }

      // upsert 化: 既存 records.id 集合と現在のフォーム行 (validRecords) の差分を取り、
      // INSERT / UPDATE / DELETE に振り分ける。判定原理は mobile と同一で、web は
      // スコープが大会全体のまま (mobile のみ種目スコープ) という違いだけ。
      // 片方だけ更新されて静かに壊れないよう、判定ロジック自体は shared 側 1箇所で持つ。
      const existingRecordIds = new Set(existingRecords.map((r) => r.id));

      // `savableRelayPlans` / `needsRelayWork` / `relayRecordIds` (置き換え対象の
      // relay_records.id) は、下の DELETE (toDeleteIds) より**前に**確定させる。
      // `relay_record_legs.record_id` は「元になった records 行を消してもリレー記録は
      // 残す」ため ON DELETE SET NULL
      // (`supabase/migrations/20260908000000_add_relay_records.sql`)。先に DELETE を
      // 実行すると対象行の record_id が NULL 化され、以後はその id から
      // relay_records.id を辿れなくなる (置き換えるべき古い行を見失う)。
      //
      // web は大会全体スコープで保存するため (mobile は種目スコープ)、渡す集合も
      // 「大会全体で今回読み込んだ records.id」= `existingRecordIds` そのもの。
      //
      // is_relaying でフィルタしない。`resolveRelayRecordIdsForRecords` は
      // `record_id IN (...)` の該当行が1件でもあれば relay_records.id を解決できる
      // ため、4レグ中のどれか (is_relaying=true の第2〜4泳者だけでも) が含まれていれば
      // 通常は is_relaying=false の第1泳者を除外しても解決自体は成立する。
      // それでも絞らないのは、絞ることで得るものが無い一方、失う場合がありうるため:
      // `relay_record_legs.record_id` は `ON DELETE SET NULL`
      // (`supabase/migrations/20260908000000_add_relay_records.sql:176`、コメントに
      // 「元になった records 行を消してもリレー記録は残す」とある通り、records 単体の
      // 削除はこの画面のリレー保存フローの外側でも起こりうる前提で設計されている)。
      // 個別の `records` 行は `apps/shared/api/records.ts` の `RecordAPI.deleteRecord`
      // 経由でも消せ、これは relay_records/relay_record_legs を一切関知しない。
      // これにより「is_relaying=true の脚 (第2〜4泳者) だけが既に他経路で削除されて
      // record_id が NULL 化され、is_relaying=false の第1泳者だけが解決の手がかりとして
      // 残っている」状態が (レアケースとして) 起こりうる。is_relaying=true だけに絞ると、
      // この唯一残った手がかりをクエリ対象から外してしまい、そのグループの
      // relay_records.id を解決できなくなる (置き換えられず孤児として残る)。
      // 絞らなければこのリスクは無く、代わりに払うコストは `.in()` に渡す id 数が
      // 増えるだけ (個人種目の record_id は relay_record_legs に存在しないので
      // マッチせず、誤って別のグループを拾うこともない)。
      const savableRelayPlans = relayPlans.filter((plan) => plan.legs.length > 0);
      // リレーに関係しない保存では relay_records に**一切触れない**。
      // 「消すべき古い行が存在しうる」のは、この (competition_id, team_id) に
      // is_relaying の records があった場合だけ (relay_records はこの画面の保存か
      // is_relaying records からのバックフィルでしか作られない)。
      const needsRelayWork =
        savableRelayPlans.length > 0 || existingRecords.some((record) => record.is_relaying);
      const relayRecordIds = needsRelayWork
        ? await relayRecordsApi.resolveRelayRecordIdsForRecords(Array.from(existingRecordIds))
        : new Set<string>();

      const { toInsert, toUpdate, toDeleteIds } = computeRecordSaveDiff(
        existingRecordIds,
        validRecords,
        (record) => record.id,
      );

      // フォームから削除された既存行を削除する (split_times を先に消してから records を消す)
      if (toDeleteIds.length > 0) {
        const { error: splitDeleteError } = await supabase
          .from("split_times")
          .delete()
          .in("record_id", toDeleteIds);

        if (splitDeleteError) {
          // 生の PostgrestError.message はテーブル名等を含みうるためテンプレートに埋め込まない（情報露出対策）
          console.error("スプリットタイム削除エラー:", splitDeleteError);
          // 致命的な削除エラーなのでthrowして外側のcatchブロックで処理
          throw new Error(tRecords("error.splitDeleteFailed"));
        }

        const { error: deleteError } = await supabase
          .from("records")
          .delete()
          .in("id", toDeleteIds);

        if (deleteError) {
          // 生の PostgrestError.message はテーブル名等を含みうるためテンプレートに埋め込まない（情報露出対策）
          console.error("既存のレコード削除エラー:", deleteError);
          // 致命的な削除エラーなのでthrowして外側のcatchブロックで処理
          throw new Error(tRecords("error.recordDeleteFailed"));
        }
      }

      // 保存後の records.id を validRecords と同じ添字で並べる (relay_record_legs.record_id
      // へ写すため)。UPDATE 行は既存 id のまま、INSERT 行は新規採番された id。
      // 失敗した位置は null のまま残す。
      const insertedRecordIds: Array<string | null> = validRecords.map(() => null);
      // フォーム行 id (mr.id) → 保存後の実 records.id。動画アップロードの対象解決に使う
      // (mr.id は既存記録由来の行では records.id と一致するが、エントリー由来・新規行では
      // 一致しないため、そのまま動画アップロードの id に使うと 404 になる)。
      const savedRecordIdByRowId = new Map<string, string>();

      // UPDATE の SET句は**旧 insert payload と同一の列集合**にする。列を個別に列挙して
      // 覚えるのではなく、insert/update で同じペイロード構築関数を使うことで
      // 「旧 delete-all 方式と列単位で等価」であることをコード上で自明にする。
      // style_id / user_id / pool_type を SET句から漏らすと、既存行の種目変更・
      // リレー泳者の差し替え (leg の <select> は mr.id を据え置いたまま memberUserId
      // だけ更新する。updateRelayEntry によるレグ id の再生成が起きるのは relayEventId
      // 自体を変更したときだけで、同一リレー内で1レグの泳者だけ差し替える経路は
      // mr.id を保持するため該当する)・大会水路の事後修正が無言で反映されなくなる
      // (PM訂正 2026-09-17)。video_path / video_thumbnail_path はもともと insert
      // payload に含まれていないため、この構成で自動的に対象外になる。
      // competition_id / team_id はスコープ不変で実質 no-op だが、等価性を自明にする
      // ため除外しない。
      const buildRecordPayload = (record: (typeof validRecords)[number]) => ({
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
      });

      // 既存行の更新
      for (const record of toUpdate) {
        const { data: updatedRows, error: updateError } = await supabase
          .from("records")
          .update(buildRecordPayload(record))
          .eq("id", record.id)
          .select("id");

        if (updateError) {
          console.error(`Record更新エラー (${record.memberName}):`, updateError);
          hasError = true;
          continue;
        }

        // PostgREST は UPDATE の対象行が0件でもエラーを返さない (DELETE で実証済みの
        // 既知挙動と同じ)。この行は `existingRecords` スナップショットには残っているが、
        // 別セッション (別管理者、または別タブの自分自身) が保存の直前に同じ行を
        // 削除した場合、対象0件のまま「成功」扱いになり、この入力が無言で消える。
        // 旧 delete-all → insert-all 方式では insert 側で必ず生き残っていたので、
        // upsert 化で新たに生じた退行として INSERT にフォールバックし、
        // 入力を失わないことを優先する (PM 修正ラウンド指示)。
        let recordId = record.id;
        if (updatedRows === null) {
          // `error` が無いのに `data` が `null` になるのは PostgREST の通常挙動
          // (0行 UPDATE は `[]` を返す) から外れた異常系。下の INSERT フォールバック
          // 自体は実行するが (理由は次のコメント)、この経路だけは誰にも見えないと
          // 異常に気付けないため console.error で観測可能にしておく。
          console.error(
            `Record更新: updatedRows が null (0行なら本来 [] のはず, 異常系) (${record.memberName})`,
          );
        }
        if (!updatedRows || updatedRows.length === 0) {
          // INSERT へのフォールバックは「データが消えるより重複が残る方を選ぶ」という
          // 既存方針 (`apps/shared/api/teams/relayRecords.ts` の `replace()` docstring
          // 参照) と同じ判断。対象行が他セッションで削除済み (空配列) でも、上の
          // 異常系 (null) でも、ここで INSERT を諦めるとユーザーの入力がそのまま
          // 消える。稀に重複行が残る方を、入力を握りつぶすより優先する。
          const { data: recreated, error: recreateError } = await supabase
            .from("records")
            .insert(buildRecordPayload(record))
            .select("id")
            .single();

          if (recreateError || !recreated) {
            console.error(`Record再作成エラー (${record.memberName}):`, recreateError);
            hasError = true;
            continue;
          }
          recordId = recreated.id;
        }

        insertedRecordIds[record.index] = recordId;
        savedRecordIdByRowId.set(record.id, recordId);

        // split_timesは行単位で入れ替える（既存を削除してから新しいものを挿入）。
        // フォールバックで新規作成した行には元々 split_times が無いため、この
        // delete は 0 件ヒットの no-op になるだけで安全。
        const { error: splitDeleteError } = await supabase
          .from("split_times")
          .delete()
          .eq("record_id", recordId);

        if (splitDeleteError) {
          console.error(`SplitTime削除エラー (${record.memberName}):`, splitDeleteError);
          hasError = true;
          continue;
        }

        // 種目の距離と同じ距離のsplit_timeは保存しない
        // （ゴールタイム=split_timeなので途中経過ではない）
        const raceDistance = styles.find((s) => s.id === record.styleId)?.distance;
        const validSplitTimes = record.splitTimes.filter(
          (st) =>
            st.distance > 0 &&
            st.splitTime > 0 &&
            !(raceDistance && st.distance === raceDistance),
        );
        if (validSplitTimes.length > 0) {
          const splitTimesData = validSplitTimes.map((st) => ({
            record_id: recordId,
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

      // 新規行の作成
      for (const record of toInsert) {
        const { data: newRecord, error: recordError } = await supabase
          .from("records")
          .insert(buildRecordPayload(record))
          .select("id")
          .single();

        if (recordError) {
          console.error(`Record作成エラー (${record.memberName}):`, recordError);
          hasError = true;
          continue;
        }

        if (newRecord) {
          insertedRecordIds[record.index] = newRecord.id;
          savedRecordIdByRowId.set(record.id, newRecord.id);
        }

        // 種目の距離と同じ距離のsplit_timeは保存しない
        // （ゴールタイム=split_timeなので途中経過ではない）
        const raceDistance = styles.find((s) => s.id === record.styleId)?.distance;
        const validSplitTimes = record.splitTimes.filter(
          (st) =>
            st.distance > 0 &&
            st.splitTime > 0 &&
            !(raceDistance && st.distance === raceDistance),
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

      // ---------------------------------------------------------------------
      // リレーのチーム記録 (relay_records / relay_record_legs) を書く
      //
      // 実際の書き込み手順 (insert → 古い行の delete、巻き戻し、
      // 「全成功時のみ削除」) は `TeamRelayRecordsAPI.replace()` が唯一の実装元。
      // web と mobile が同じ実装を複製しないよう shared に集約してある。
      //
      // 【リレー側を書く条件】
      // `records` への書き込みが1件でも失敗していたら (`hasError`) リレー側は
      // **1件も書かない**。`relay_records.total_time` はランキングの並び順その
      // ものになる値で、4レグのうち一部しか `records` に書けていない状態で
      // 総合タイムを書くと「実在しない記録に基づく順位」がエラーなしで出来上がる
      // (書けなかったぶんは `record_id` が NULL になるだけで行としては完全に
      //  見えてしまう = 静かに壊れる形)。
      // リレー側を書かなければ既存の relay_records 行がそのまま残り、
      // その行のタイムは過去に実際に泳がれた値なので嘘ではない。
      // ユーザーには既存の `error.saveFailed` が出るので再試行できる。
      // ---------------------------------------------------------------------
      // `savableRelayPlans` / `needsRelayWork` / `relayRecordIds` は DELETE より
      // 前に確定済み (上記コメント参照)。

      if (needsRelayWork && !hasError) {
        const { failed: relayWriteFailed } = await relayRecordsApi.replace(
          {
            teamId,
            competitionId,
            poolType: competition.pool_type,
            // DB 列条件 (relay_kind + leg_distance) ではなく、大会全体で読み込んだ
            // records.id から解決した relay_records.id だけを渡す
            // (`apps/shared/api/teams/relayRecords.ts` の事実1)。
            relayRecordIds: Array.from(relayRecordIds),
          },
          savableRelayPlans,
          insertedRecordIds,
        );
        if (relayWriteFailed) hasError = true;
      } else if (needsRelayWork && hasError) {
        console.error("records の書き込みに失敗したため relay_records の差し替えを中止しました");
      }

      // 代理入力はチームメンバー全員の records を書き換えるため、
      // チーム記録ランキングのキャッシュ (staleTime 5分) を落とす。
      // この画面は React Query を経由しない生の from("records") 書き込みで、
      // useRecordsQuery の realtime も subscribeToRecords(cb, 自分の user_id) の
      // フィルタ付きなので他メンバーの行では発火しない。ここで落とさないと
      // 「入力 → 大会タブへ戻る → ランキング」で最大5分間、入力前の順位表が出る。
      // hasError の早期 return より前に置く: 一部の行だけ書き込めた場合もキャッシュは古い。
      // (Provider が無い環境では no-op。理由は useInvalidateTeamRankings の docstring)
      invalidateRankings();

      // エラーが発生した場合はリダイレクトしない
      if (hasError) {
        alert(tRecords("error.saveFailed"));
        return;
      }

      // 動画アップロード（保存されたrecordの各メンバーへ）
      // PracticeLogClient と同様に、partial-failure を集約してユーザーに通知する。
      // 各ステップの戻り値を確認し、無音破棄 (continue / catch console.error) を排する。
      //
      // 対象は「保存が成功した全 record (insert + update)」— upsert 化前は
      // 毎回delete+insertだったため実質insert行だけが対象だったが、UPDATE 経路の
      // 既存行にも新しい動画を添付できる必要がある。
      const videoUploadErrors: string[] = [];
      for (const entry of styleEntries) {
        for (const mr of entry.memberRecords) {
          if (!mr.videoFile || !mr.id) continue;
          // mr.id (フォーム行 id) を records.id にそのまま使わない — 既存記録由来の
          // 行では一致するが、エントリー由来・新規行では一致しないため。保存後の
          // 実 id に解決する。見つからない場合 (時間未入力等でそもそも保存対象に
          // ならなかった行) は mr.id のまま試み、既存の挙動 (404 →
          // errorVideoUploadUrlFailed) を変えない。
          const recordId = savedRecordIdByRowId.get(mr.id) ?? mr.id;
          try {
            const uploadUrlRes = await fetch("/api/storage/videos/upload-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "record", id: recordId, contentType: "video/mp4" }),
            });
            if (!uploadUrlRes.ok) {
              videoUploadErrors.push(
                tRecords("errorVideoUploadUrlFailed", { name: mr.memberName, status: uploadUrlRes.status }),
              );
              continue;
            }
            const { videoUploadUrl, thumbnailUploadUrl, videoPath: vPath, thumbnailPath: tPath } =
              await uploadUrlRes.json() as {
                videoUploadUrl: string;
                thumbnailUploadUrl: string;
                videoPath: string;
                thumbnailPath: string;
              };
            const putRes = await fetch(videoUploadUrl, { method: "PUT", body: mr.videoFile });
            if (!putRes.ok) {
              videoUploadErrors.push(
                tRecords("errorVideoUploadFailed", { name: mr.memberName, status: putRes.status }),
              );
              continue;
            }
            if (mr.videoThumbnailBlob) {
              const thumbRes = await fetch(thumbnailUploadUrl, { method: "PUT", body: mr.videoThumbnailBlob });
              if (!thumbRes.ok) {
                videoUploadErrors.push(
                  tRecords("errorVideoThumbnailFailed", { name: mr.memberName, status: thumbRes.status }),
                );
                continue;
              }
            }
            const confirmFormData = new FormData();
            confirmFormData.append("type", "record");
            confirmFormData.append("id", recordId);
            confirmFormData.append("videoPath", vPath);
            confirmFormData.append("thumbnailPath", tPath);
            if (mr.videoThumbnailBlob) {
              confirmFormData.append(
                "thumbnailBlob",
                new File([mr.videoThumbnailBlob], "thumbnail.jpg", { type: "image/jpeg" }),
              );
            }
            const confirmRes = await fetch("/api/storage/videos/confirm", {
              method: "POST",
              body: confirmFormData,
            });
            if (!confirmRes.ok) {
              videoUploadErrors.push(
                tRecords("errorVideoConfirmFailed", { name: mr.memberName, status: confirmRes.status }),
              );
              continue;
            }
            // team-assign はサムネイル必須 (サーバー側で thumbnails/.../{sourceId}.jpg を
            // コピーする)。サムネイル未生成の場合に team-assign を呼ぶと R2 に存在しない
            // オブジェクトをコピーしようとして失敗するため、呼ばず通知する。
            if (!mr.videoThumbnailBlob) {
              videoUploadErrors.push(tRecords("errorVideoNoThumbnail", { name: mr.memberName }));
              continue;
            }
            const assignRes = await fetch("/api/storage/videos/team-assign", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "record",
                sourceId: recordId,
                targetUserId: mr.memberUserId,
                teamId,
                tempVideoPath: vPath,
                tempThumbnailPath: tPath,
              }),
            });
            if (!assignRes.ok) {
              videoUploadErrors.push(
                tRecords("errorVideoAssignFailed", { name: mr.memberName, status: assignRes.status }),
              );
            }
          } catch (videoErr) {
            console.error("動画アップロードエラー:", videoErr);
            videoUploadErrors.push(tRecords("errorVideoGenericFailed", { name: mr.memberName }));
          }
        }
      }

      if (videoUploadErrors.length > 0) {
        // 記録の保存自体は成功しているが、一部の動画添付に失敗した。
        // この直後に router.push で遷移するため、ブロッキングな通知 (alert) で
        // 「保存成功 + 一部動画失敗」を必ず伝えてから遷移する (PracticeLogClient と同じ扱い)。
        window.alert(
          tRecords("videoPartialFailureSaved", { errors: videoUploadErrors.join("\n") }),
        );
      }

      router.push(`/teams-admin/${teamId}?tab=competitions`);
    } catch (err) {
      console.error("チーム大会記録作成エラー:", err);
      alert(tRecords("error.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    router.push(`/teams-admin/${teamId}?tab=competitions`);
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
            {t("record.backButton")}
          </button>

          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {t("record.pageTitle")}
            </h1>
            <p className="text-gray-600 mb-4">{tRecords("subtitle")}</p>

            {/* 大会情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <span className="font-medium">{competition.title || tRecords("competitionFallback")}</span>
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
                  {competition.pool_type === 1 ? tCommon("poolTypeLong") : tCommon("poolTypeShort")}
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
                <h2 className="text-lg font-semibold text-gray-900">{tRecords("entryHeader", { num: entryIndex + 1 })}</h2>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{tRecords("eventLabel")}</label>
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
                  <option value="">{tRecords("selectPlaceholder")}</option>
                  <optgroup label={tRecords("individualEvents")}>
                    {styles.map((style) => (
                      <option key={style.id} value={style.id}>
                        {styleOptionLabel(style)}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={t("record.relayLabel")}>
                    {relayEvents.map((relay) => (
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t("record.participantsHeader")}</label>
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

              {/* リレー種目: 3段構造 */}
              {entry.relayEventId && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700">{t("record.timesHeader")}</h3>

                  {/* 上段: 泳者4列グリッド */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {entry.memberRecords.map((mr, mrIndex) => {
                      const legMemberOptions = withCurrentSelection(
                        swimmerCandidates,
                        mr.memberUserId,
                      );
                      return (
                      <div key={`relay-leg-${mrIndex}`}>
                        <p className="text-xs font-medium text-blue-700 mb-1">
                          {relayLegLabelOf(entry, mrIndex)}
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
                          className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">{tRecords("selectSwimmer")}</option>
                          {legMemberOptions.map((m) => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.users.name}
                            </option>
                          ))}
                        </select>
                        {(() => {
                          const best = bestTimeBadgeFor(
                            mr.memberUserId,
                            mr.relayLegStyleId,
                            mr.isRelaying,
                          );
                          if (!best) return null;
                          return (
                            <p
                              data-testid={`relay-leg-best-time-badge-${mrIndex}`}
                              className="mt-1 text-xs text-green-800 bg-green-100 px-2 py-1 rounded-full inline-flex items-center"
                            >
                              {best.label}: {formatTimeBest(best.time)}
                            </p>
                          );
                        })()}
                      </div>
                      );
                    })}
                  </div>

                  {/* 中段: 合計タイム + リアクションタイム4列 */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex flex-wrap gap-4 mb-3">
                      <div className="min-w-[160px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          合計タイム
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={entry.memberRecords[3]?.timeDisplayValue ?? ""}
                          onChange={(e) => handleRelayTotalTimeChange(entry.id, e.target.value)}
                          placeholder={tRecords("relayTimePlaceholder")}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* リアクションタイム4列 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {entry.memberRecords.map((mr, mrIndex) => (
                        <div key={`relay-reaction-${mrIndex}`}>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {tRecords("relayLegShort", { num: mrIndex + 1 })} {tRecordLog("reactionTimeLabelShort")}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="-1"
                            max="2"
                            value={mr.reactionTime || ""}
                            onChange={(e) =>
                              updateMemberRecordByIndex(entry.id, mrIndex, {
                                reactionTime: e.target.value,
                              })
                            }
                            placeholder="0.65"
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 下段: スプリット1ブロック */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-600">
                        {t("record.zoneLabel")}
                        {!isPremium && (
                          <span className="ml-2 text-gray-400">
                            {(entry.relaySplitTimes ?? []).length}/{RELAY_FREE_PLAN_MAX_SPLITS}
                          </span>
                        )}
                      </label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          onClick={() => addRelaySplitTimesEvery25m(entry.id)}
                          variant="outline"
                          className="text-xs py-1 px-2"
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >= RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          追加(25mごと)
                        </Button>
                        <Button
                          type="button"
                          onClick={() => addRelaySplitTimesEvery50m(entry.id)}
                          variant="outline"
                          className="text-xs py-1 px-2"
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >= RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          追加(50mごと)
                        </Button>
                        <Button
                          type="button"
                          onClick={() => addRelaySplitTime(entry.id)}
                          variant="outline"
                          className="text-xs py-1 px-2"
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >= RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          追加
                        </Button>
                      </div>
                    </div>
                    {(entry.relaySplitTimes ?? []).length > 0 && (
                      <div className="space-y-2">
                        {[...(entry.relaySplitTimes ?? [])]
                          .sort((a, b) => a.distance - b.distance)
                          .map((split) => (
                            <div key={split.id} className="flex items-center gap-2">
                              <input
                                type="number"
                                value={split.distance}
                                onChange={(e) =>
                                  handleRelaySplitTimeChange(entry.id, split.id, "distance", e.target.value)
                                }
                                placeholder={tRecords("distancePlaceholder")}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                              <span className="text-gray-500 text-sm">m:</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={split.displayValue}
                                onChange={(e) =>
                                  handleRelaySplitTimeChange(entry.id, split.id, "splitTime", e.target.value)
                                }
                                placeholder={tRecords("splitTimePlaceholder")}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeRelaySplitTime(entry.id, split.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* リレー全体の LapTimeDisplay */}
                    {(entry.relaySplitTimes ?? []).length > 0 && entry.relayEventId && (
                      <LapTimeDisplay
                        splitTimes={(() => {
                          const legBoundaries = getRelayLegBoundaries(entry.relayEventId!);
                          const totalDistance = legBoundaries[3];
                          const baseSplits = (entry.relaySplitTimes ?? []).map((st) => ({
                            distance: st.distance,
                            splitTime: st.splitTime,
                          }));
                          if (totalDistance === undefined) return baseSplits; // legBoundaries は
                            // 固定4要素配列で本来常に定義されるが型上は保証されないため防御的に扱う
                          const totalTime = entry.memberRecords[3]?.cumulativeTimeSeconds ?? 0;
                          if (totalTime > 0 && !baseSplits.some((st) => st.distance === totalDistance)) {
                            return [...baseSplits, { distance: totalDistance, splitTime: totalTime }];
                          }
                          return baseSplits;
                        })()}
                        raceDistance={entry.relayEventId ? getRelayLegBoundaries(entry.relayEventId)[3] : undefined}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* 個人種目: メンバーごとの記録入力 */}
              {!entry.relayEventId && entry.memberRecords.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700">{t("record.timesHeader")}</h3>
                  {entry.memberRecords.map((mr) => (
                    <div key={mr.memberUserId} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="font-medium text-gray-900 mr-auto">{mr.memberName}</span>
                        {mr.entryTimeReference != null && mr.entryTimeReference > 0 && (
                          <span className="text-sm text-gray-500">
                            {tRecordLog("entryTimeLabel")} {formatTimeBest(mr.entryTimeReference)}
                          </span>
                        )}
                        {(() => {
                          const best = bestTimeBadgeFor(mr.memberUserId, entry.styleId, mr.isRelaying);
                          if (!best) return null;
                          return (
                            <span
                              data-testid={`record-best-time-badge-${mr.memberUserId}`}
                              className="text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center"
                            >
                              {best.label}: {formatTimeBest(best.time)}
                            </span>
                          );
                        })()}
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
                                inputMode="decimal"
                                value={mr.timeDisplayValue}
                                onChange={(e) => handleTimeChange(entry.id, mr.memberUserId, e.target.value)}
                                placeholder={tRecords("timePlaceholder")}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            {/* リレー中も RT 欄は表示する。保存側 (buildRecordPayload) は
                                is_relaying に関わらず reaction_time を常に書き込んでおり、
                                「リレー中は RT を無視する」というルールは存在しない。
                                REACTION_TIME_MIN (apps/shared/utils/reactionTime.ts) が
                                「リレー引き継ぎのマイナス反応を許容する」ために -1 に
                                設定されているのは、リレーでの入力を前提としている証拠。
                                以前の非表示は歴史的な不整合であり、意図的な仕様ではない。 */}
                            <div className="w-36">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                リアクションタイム
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="-1"
                                max="2"
                                value={mr.reactionTime || ""}
                                onChange={(e) =>
                                  updateMemberRecord(entry.id, mr.memberUserId, {
                                    reactionTime: e.target.value,
                                  })
                                }
                                placeholder="0.65"
                                className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* リレーチェックボックス */}
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

                        {/* メモ */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            メモ
                          </label>
                          <input
                            type="text"
                            value={mr.note}
                            onChange={(e) =>
                              updateMemberRecord(entry.id, mr.memberUserId, {
                                note: e.target.value,
                              })
                            }
                            placeholder={tRecords("notePlaceholder")}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* スプリットタイム */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-gray-600">
                            スプリットタイム
                            {!isPremium && (
                              <span className="ml-2 text-xs text-orange-600">
                                {t("record.freePlanLimitNotice")}
                              </span>
                            )}
                          </label>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              onClick={() => addSplitTimesEvery25m(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={!styles.find((s) => s.id === entry.styleId)?.distance}
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加(25mごと)
                            </Button>
                            <Button
                              type="button"
                              onClick={() => addSplitTimesEvery50m(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={!styles.find((s) => s.id === entry.styleId)?.distance}
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加(50mごと)
                            </Button>
                            <Button
                              type="button"
                              onClick={() => addSplitTime(entry.id, mr.memberUserId)}
                              variant="outline"
                              className="text-xs py-1 px-2"
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              {t("record.addSplitButton")}
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
                                    placeholder={tRecords("distancePlaceholder")}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <span className="text-gray-500 text-sm">m:</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
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
                                    placeholder={tRecords("splitTimePlaceholder")}
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
                            {mr.videoFile ? tRecords("videoHas") : tRecords("videoSelect")}
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
                              const raceDistance = styles.find((s) => s.id === entry.styleId)?.distance;
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
                            raceDistance={styles.find((s) => s.id === entry.styleId)?.distance}
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
              {saving ? t("record.saving") : t("record.saveButton")}
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
                <h3 className="text-lg font-semibold text-gray-900">{tRecords("selectMembersTitle")}</h3>
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
                  onClick={() => setTempSelectedUserIds(swimmerCandidates.map((m) => m.user_id))}
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
                  {swimmerCandidates.map((member) => {
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
          isPremium={isPremium}
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
