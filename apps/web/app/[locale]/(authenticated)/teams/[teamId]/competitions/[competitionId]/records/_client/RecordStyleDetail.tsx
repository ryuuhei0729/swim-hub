"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthProvider";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import dynamic from "next/dynamic";
import {
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import type { Style } from "@apps/shared/types";
import { excludeNonSwimmers } from "@apps/shared/utils/swimmerFilter";
import { FREE_PLAN_LIMITS } from "@apps/shared/constants/premium";
import { useInvalidateTeamRankings } from "@apps/shared/hooks/queries/useInvalidateTeamRankings";
import { useOptionalQueryClient } from "@/hooks/queries/useOptionalQueryClient";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import {
  resetTeamQueriesAfterExternalSave,
  teamDetailKeys,
  teamMemberBestTimesKeys,
} from "@/hooks/queries/teamDetailKeys";
import { formatTimeBest, parseTimeToSeconds } from "@/utils/formatters";
import { LapTimeDisplay } from "@/components/forms/LapTimeDisplay";
import {
  calcLegTimesFromCumulative,
  getRelayLegBoundaries,
  isRelayingForLeg,
  type LabelledRelayEventDef,
} from "./relayEvents";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import type { MemberRecord, StyleEntry, SplitTimeEntry } from "./buildStyleEntries";
import type { TeamGoalTarget } from "@apps/shared/types/goalTargets";
import { findGoalTargetTime } from "@apps/shared/utils/goalTarget";
import GoalTargetBadge from "@/components/forms/GoalTargetBadge";
import { getBestTimeForEntry } from "@/utils/bestTimeForEntry";
import type { BestTime } from "@apps/shared/types/ui";
import MemberSelectModal, {
  type MemberSelectOption,
} from "@/components/team/MemberSelectModal";
import RecordPageHeader from "./RecordPageHeader";
import {
  buildRecordListPath,
  isEntryOfSelection,
  type RecordEventSelection,
} from "./recordEventSelection";
import {
  saveStyleRecords,
  scopeExistingRecordsForEntries,
  SaveStyleRecordsValidationError,
} from "./saveStyleRecords";
import {
  uploadProxyRecordVideos,
  type VideoUploadError,
} from "./uploadProxyRecordVideos";
import type {
  RecordCompetition,
  RecordTeamMember,
  RecordWithDetails,
} from "./types";

// TeamVideoUploaderを動的インポート
const TeamVideoUploader = dynamic(
  () => import("@/components/video/TeamVideoUploader"),
  {
    ssr: false,
  },
);

const RELAY_FREE_PLAN_MAX_SPLITS = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD * 4;

/** リレーの組 (1チームぶん) を空の状態で作る。4レグ + レグ境界のスプリット欄 */
function buildEmptyRelayEntry(
  relayDef: LabelledRelayEventDef,
  isPremium: boolean,
): StyleEntry | null {
  const firstLeg = relayDef.legs[0];
  if (!firstLeg) return null; // relayDef.legs は常に4件だが型上は保証されないため防御的に扱う

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
  const defaultSplitDistances = getRelayLegBoundaries(relayDef.id).slice(0, 3);
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

  return {
    id: crypto.randomUUID(),
    styleId: firstLeg.styleId, // 代表 styleId (第1泳者の種目)
    styleName: relayDef.label,
    relayEventId: relayDef.id,
    memberRecords: legRecords,
    relaySplitTimes: defaultSplits,
  };
}

interface RecordStyleDetailProps {
  teamId: string;
  competitionId: string;
  competition: RecordCompetition;
  members: RecordTeamMember[];
  /** 大会全体の既存 records (保存範囲はこの中からこの種目のぶんだけに絞る) */
  existingRecords: RecordWithDetails[];
  styles: Style[];
  /** 大会全体の StyleEntry (既存記録 + エントリー由来行をマージ済み) */
  allStyleEntries: StyleEntry[];
  /** 開いている種目 (styles マスター / RELAY_EVENTS に存在することは呼び出し側で確認済み) */
  selection: RecordEventSelection;
  /** 見出しに出す種目名 (翻訳済み) */
  title: string;
  relayEvents: LabelledRelayEventDef[];
  /**
   * user_id → その選手のベストタイム一覧（両水路・引き継ぎ込み）。
   * 参考バッジの表示にのみ使う。入力値のプリフィルには**絶対に使わない**
   * (エントリー画面と違い、ここは結果タイムを入力する画面なので
   *  ベストタイムが初期値として入ると実測値と区別できなくなる)。
   */
  bestTimesByUser: Record<string, BestTime[]>;
  /** 大会内メンバーの目標 (status 未絞り)。空なら目標バッジを出さない */
  goalTargets: TeamGoalTarget[];
}

/**
 * 大会記録の代理入力 - 1種目の入力画面 (mobile の TeamRecordStyleDetailScreen に相当)。
 * 種目一覧で選んだ1種目 (個人種目 or リレー種目) のメンバーの記録を入力し、
 * その種目のぶんだけを保存する。保存できたら種目一覧へ戻る。
 */
export default function RecordStyleDetail({
  teamId,
  competitionId,
  competition,
  members,
  existingRecords,
  styles,
  allStyleEntries,
  selection,
  title,
  relayEvents,
  bestTimesByUser,
  goalTargets,
}: RecordStyleDetailProps) {
  const router = useRouter();
  const t = useTranslations("teams");
  const tCommon = useTranslations("common");
  const tRecords = useTranslations("competition.records");
  const tUnsaved = useTranslations("forms.unsavedChanges");
  // 参考ラベル「エントリータイム:」は mobile (RecordLogFormScreen 等) と同じ
  // forms.recordLog.entryTimeLabel を再利用する (同義キーを増やさない)
  const tRecordLog = useTranslations("forms.recordLog");
  const { supabase, subscription } = useAuth();
  const invalidateRankings = useInvalidateTeamRankings();
  // チーム画面のキャッシュ (大会一覧・記録一覧モーダル・ベストタイム表) を落とすため。
  // Provider が無い環境 (既存テスト) では null
  const queryClient = useOptionalQueryClient();
  const isPremium = checkIsPremium(subscription);

  /**
   * リレーのチーム記録の書き込み API。差し替えの手順は shared 側が持つ
   * (web/mobile で同じ実装を複製しないため)。
   */
  const relayRecordsApi = useMemo(
    () => new TeamRelayRecordsAPI(supabase),
    [supabase],
  );

  /**
   * `user_id` → `users.gender`。リレーのチーム記録の性別区分 prefill にのみ使う。
   * `RecordTeamMember.users.gender` が必須なので欠損は型で起こらない。
   * (メンバー一覧に居ない user_id は `resolveRelayGenderCategory` が
   *  「不明」として `mixed` に寄せる。0 で埋めない)
   */
  const memberGenderByUserId = useMemo(
    () =>
      new Map(members.map((member) => [member.user_id, member.users.gender])),
    [members],
  );

  // 候補提示 (メンバー選択欄・リレー泳者選択) の直前だけをフィルタする。members 自体は
  // memberGenderByUserId (性別区分 prefill) と confirmMemberSelection 内の名前解決にも
  // 共用されているため、フィルタ済みの生配列に置き換えてはならない (PM裁定 R4)。
  const swimmerCandidates = useMemo(
    () => excludeNonSwimmers(members),
    [members],
  );

  // 共有 MemberSelectModal (MemberSelectOption[]) 向けの変換。gender は
  // users.gender (必須) をそのまま渡す (グルーピング用)
  const memberSelectCandidates: MemberSelectOption[] = useMemo(
    () =>
      swimmerCandidates.map((m) => ({
        user_id: m.user_id,
        role: m.role,
        name: m.users.name,
        is_swimmer: m.is_swimmer,
        gender: m.users.gender,
      })),
    [swimmerCandidates],
  );

  /**
   * ネイティブ `<select>` は `value` がどの `<option>` とも一致しないと、
   * ブラウザが暗黙に先頭 (空プレースホルダー) を選択してしまう。
   * 既に非泳者が割り当て済みのリレーレグでは `currentUserId` が
   * `swimmerCandidates` から漏れているため、そのままだと表示が壊れる
   * (Critical: 受け入れ基準「非泳者に変更しても既存の記録は消えない」への違反)。
   * 「候補を絞った配列」と「既存の選択値」を union してから options に渡すこと。
   */
  const withCurrentSelection = (
    candidates: RecordTeamMember[],
    currentUserId: string,
  ): RecordTeamMember[] => {
    if (!currentUserId || candidates.some((m) => m.user_id === currentUserId))
      return candidates;
    const current = members.find((m) => m.user_id === currentUserId);
    return current ? [...candidates, current] : candidates;
  };

  const relayDef =
    selection.kind === "relay"
      ? relayEvents.find((r) => r.id === selection.relayEventId)
      : undefined;

  /**
   * この種目の「組」の初期値と、保存範囲 (この種目の既存 records) を画面を開いた時点で
   * 固定する。保存範囲は入力の編集で変わってはいけないため state の初期化で1度だけ求める。
   * - 既存データに同じ種目の組が複数ある (リレーで複数チーム) 場合は全てを拾う
   * - 1件も無ければ空の組を1つ用意する
   */
  const [initialState] = useState(() => {
    const matched = allStyleEntries.filter((entry) =>
      isEntryOfSelection(entry, selection),
    );
    let initialEntries: StyleEntry[] = matched;
    if (initialEntries.length === 0) {
      const emptyEntry: StyleEntry | null =
        selection.kind === "relay"
          ? relayDef
            ? buildEmptyRelayEntry(relayDef, isPremium)
            : null
          : {
              id: crypto.randomUUID(),
              styleId: selection.styleId,
              styleName:
                styles.find((s) => s.id === selection.styleId)?.name_jp ?? "",
              memberRecords: [],
            };
      initialEntries = emptyEntry ? [emptyEntry] : [];
    }
    return {
      entries: initialEntries,
      snapshot: JSON.stringify(initialEntries),
      scopedExistingRecords: scopeExistingRecordsForEntries(
        existingRecords,
        initialEntries,
      ),
    };
  });

  const [entries, setEntries] = useState<StyleEntry[]>(initialState.entries);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [currentStyleEntryId, setCurrentStyleEntryId] = useState<string | null>(
    null,
  );
  const [videoUploadModal, setVideoUploadModal] = useState<{
    entryId: string;
    memberUserId: string;
    memberName: string;
  } | null>(null);

  const listPath = buildRecordListPath(teamId, competitionId);

  // 戻る操作・ブラウザバック・タブを閉じる操作で、入力中の記録が確認なしに消えないようにする
  // (mobile の種目詳細画面の usePreventRemove と同じ目的)
  const backToList = useCallback(() => {
    router.push(listPath);
  }, [router, listPath]);
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(entries) !== initialState.snapshot,
    [entries, initialState.snapshot],
  );
  const {
    showConfirmDialog: showLeaveConfirm,
    handleClose: requestLeave,
    handleConfirmClose: confirmLeave,
    handleCancelClose: cancelLeave,
  } = useUnsavedChangesWarning({
    isOpen: true,
    hasUnsavedChanges,
    isSubmitted: isSaved,
    onClose: backToList,
  });

  const handleBack = () => {
    if (requestLeave()) backToList();
  };

  /** リレーの組 (別チーム) を1つ足す */
  const addRelayGroup = () => {
    if (!relayDef) return;
    const newEntry = buildEmptyRelayEntry(relayDef, isPremium);
    if (!newEntry) return;
    setEntries((prev) => [...prev, newEntry]);
  };

  const removeGroup = (entryId: string) => {
    if (entries.length > 1) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
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
    return result
      ? { time: result.time, label: tRecordLog(result.labelKey) }
      : null;
  };

  /**
   * 「目標: xx.xx」バッジ用。表示対象 status・引き継ぎありの除外は findGoalTargetTime が決める
   * (ここで legIndex 等を見て再実装しない。isRelaying は行の計算済みの値をそのまま渡す)。
   */
  const goalTargetTimeFor = (
    memberUserId: string,
    styleId: number | "" | undefined,
    isRelaying: boolean,
  ): number | null => {
    if (!memberUserId || styleId === "" || styleId === undefined) return null;
    return findGoalTargetTime(goalTargets, {
      userId: memberUserId,
      competitionId,
      styleId,
      isRelaying,
    });
  };

  /** リレーのレグラベルを relayEventId から導出する。復元経路では state の relayLegLabel が undefined のため */
  const relayLegLabelOf = (
    entry: StyleEntry,
    legIndex: number,
  ): string | undefined =>
    (entry.relayEventId
      ? relayEvents.find((r) => r.id === entry.relayEventId)?.legs[legIndex]
          ?.legLabel
      : undefined) ?? entry.memberRecords[legIndex]?.relayLegLabel;

  const openMemberSelectModal = (entryId: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (entry) {
      setCurrentStyleEntryId(entryId);
      setShowMemberSelectModal(true);
    }
  };

  // MemberSelectModal に渡す selectedUserIds (修正C→修正F: レンダーのたびに新しい
  // 配列インスタンスを作ると、共有モーダル側の useEffect([isOpen, selectedUserIds])
  // が参照同一性で再発火し、モーダルを開いたまま無関係な state 更新 (動画アップロード
  // 進捗等) が起きただけで選択が開いた瞬間の値に巻き戻る。
  //
  // 修正C は依存を [entries, currentStyleEntryId] にしたが、entries は
  // setEntries(prev => prev.map(...)) のたびに (編集対象が別の種目エントリーで
  // あっても) 新しい配列参照になる。.find().memberRecords.map() は entries の
  // 参照が変わるたびに再計算されるため、対象エントリーの中身が同じでも新しい配列に
  // なってしまう残存経路があった (Reviewer指摘)。
  //
  // 二段構成にする: まず対象エントリーの memberUserId を決定的な順序で連結した
  // 文字列キーを useMemo する。文字列はプリミティブ値なので内容が同じなら
  // (entries の参照が変わっていても) React の依存比較で「変化なし」と
  // 判定され、後段の配列 useMemo は再計算されない (＝同じ配列参照を返し続ける)
  const currentStyleEntryMemberUserIdsKey = useMemo(() => {
    const entry = entries.find((e) => e.id === currentStyleEntryId);
    return entry
      ? entry.memberRecords.map((mr) => mr.memberUserId).join(",")
      : "";
  }, [entries, currentStyleEntryId]);

  const currentStyleEntrySelectedUserIds = useMemo(
    () =>
      currentStyleEntryMemberUserIdsKey === ""
        ? []
        : currentStyleEntryMemberUserIdsKey.split(","),
    [currentStyleEntryMemberUserIdsKey],
  );

  // W8: 呼び出し元はこのコンポーネント自身のみのため、MemberSelectModal の
  // onConfirm(selectedUserIds) をそのまま受け取る形に変更してよい (PM裁定)
  const confirmMemberSelection = (selectedUserIds: string[]) => {
    if (!currentStyleEntryId) return;

    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== currentStyleEntryId) return entry;

        // 新しく選択されたメンバーを追加、削除されたメンバーを除去
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
    setEntries((prev) =>
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
    setEntries((prev) =>
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

  const handleTimeChange = (
    entryId: string,
    memberUserId: string,
    value: string,
  ) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    const newTime = parseTimeToSeconds(value);

    setEntries((prev) =>
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
                (st) =>
                  typeof st.distance === "number" &&
                  st.distance === raceDistance,
              );

              if (existingSplitIndex >= 0) {
                // 既存のsplit-timeを更新
                updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
                  idx === existingSplitIndex
                    ? {
                        ...st,
                        splitTime: newTime,
                        displayValue: formatTimeBest(newTime),
                      }
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
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return splitTimes.length;
    const style = styles.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    if (!raceDistance) return splitTimes.length;
    return splitTimes.filter(
      (st) =>
        !(typeof st.distance === "number" && st.distance === raceDistance),
    ).length;
  };

  /**
   * 合計タイム入力ハンドラ（リレー種目専用）。
   * 全体距離スプリットを relaySplitTimes に同期し、各 leg の time を再計算する。
   */
  const handleRelayTotalTimeChange = (entryId: string, value: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;

        const totalSeconds = parseTimeToSeconds(value);
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const totalDistance = legBoundaries[3];
        if (totalDistance === undefined) return entry; // legBoundaries は固定4要素配列で
        // 本来常に定義されるが型上は保証されないため防御的に扱う

        // relaySplitTimes の全体距離スプリット（= totalDistance）を同期更新
        const currentSplits = entry.relaySplitTimes ?? [];
        const existingIdx = currentSplits.findIndex(
          (st) => st.distance === totalDistance,
        );
        let updatedSplits: SplitTimeEntry[];
        if (totalSeconds > 0) {
          const newSplit: SplitTimeEntry = {
            id:
              existingIdx >= 0
                ? currentSplits[existingIdx]!.id
                : crypto.randomUUID(), // existingIdx >= 0 を直前の三項演算子の条件で確認済み
            distance: totalDistance,
            splitTime: totalSeconds,
            displayValue: value,
          };
          if (existingIdx >= 0) {
            updatedSplits = currentSplits.map((st, i) =>
              i === existingIdx ? newSplit : st,
            );
          } else {
            updatedSplits = [...currentSplits, newSplit];
          }
        } else {
          updatedSplits =
            existingIdx >= 0
              ? currentSplits.filter((_, i) => i !== existingIdx)
              : currentSplits;
        }

        // leg 境界スプリットが揃っている場合に各 leg の time を再計算
        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent
          ? calcLegTimesFromCumulative(newCumulatives)
          : null;

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
    setEntries((prev) =>
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

        // leg 境界スプリットが揃っている場合に各 leg の time を再計算
        const newCumulatives = legBoundaries.map((boundary) => {
          const found = updatedSplits.find((st) => st.distance === boundary);
          return found ? found.splitTime : 0;
        });
        const allBoundariesPresent = newCumulatives.every((c) => c > 0);
        const legTimes = allBoundariesPresent
          ? calcLegTimesFromCumulative(newCumulatives)
          : null;

        // 変更されたスプリットが全体距離の場合、合計タイム欄（leg3）を同期
        const changedSplit = updatedSplits.find((st) => st.id === splitId);
        const isTotalDistanceSplit =
          field === "splitTime" &&
          changedSplit &&
          changedSplit.distance === totalDistance;

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
    setEntries((prev) =>
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
            {
              id: crypto.randomUUID(),
              distance: 0,
              splitTime: 0,
              displayValue: "",
            },
          ],
        };
      }),
    );
  };

  const addRelaySplitTimesAtInterval = (entryId: string, interval: number) => {
    setEntries((prev) =>
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
        for (
          let distance = interval;
          distance <= totalDistance;
          distance += interval
        ) {
          if (!existingDistances.has(distance)) {
            newSplits.push({
              id: crypto.randomUUID(),
              distance,
              splitTime: 0,
              displayValue: "",
            });
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

  const addRelaySplitTimesEvery25m = (entryId: string) =>
    addRelaySplitTimesAtInterval(entryId, 25);
  const addRelaySplitTimesEvery50m = (entryId: string) =>
    addRelaySplitTimesAtInterval(entryId, 50);

  const removeRelaySplitTime = (entryId: string, splitId: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId || !entry.relayEventId) return entry;
        return {
          ...entry,
          relaySplitTimes: (entry.relaySplitTimes ?? []).filter(
            (st) => st.id !== splitId,
          ),
        };
      }),
    );
  };

  const addSplitTime = (entryId: string, memberUserId: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          memberRecords: entry.memberRecords.map((mr) => {
            if (mr.memberUserId !== memberUserId) return mr;

            if (!isPremium) {
              const billableCount = countBillableSplitTimes(
                entryId,
                mr.splitTimes,
              );
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
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
    if (!style || !style.distance) return;

    const raceDistance = style.distance;

    setEntries((prev) =>
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
              const billableCount = countBillableSplitTimes(
                entryId,
                mr.splitTimes,
              );
              const newBillable = newSplitTimes.filter(
                (st) =>
                  !(
                    typeof st.distance === "number" &&
                    st.distance === raceDistance
                  ),
              );
              const maxNewBillable =
                FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
              if (maxNewBillable <= 0 && newBillable.length > 0) {
                // 最終タイムだけなら追加OK
                newSplitTimes = newSplitTimes.filter(
                  (st) =>
                    typeof st.distance === "number" &&
                    st.distance === raceDistance,
                );
                if (newSplitTimes.length === 0) return mr;
              } else if (newBillable.length > maxNewBillable) {
                let billableAdded = 0;
                newSplitTimes = newSplitTimes.filter((st) => {
                  const isRaceDist =
                    typeof st.distance === "number" &&
                    st.distance === raceDistance;
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
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
    if (!style || !style.distance) return;

    const raceDistance = style.distance;

    setEntries((prev) =>
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
              const billableCount = countBillableSplitTimes(
                entryId,
                mr.splitTimes,
              );
              const newBillable = newSplitTimes.filter(
                (st) =>
                  !(
                    typeof st.distance === "number" &&
                    st.distance === raceDistance
                  ),
              );
              const maxNewBillable =
                FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billableCount;
              if (maxNewBillable <= 0 && newBillable.length > 0) {
                newSplitTimes = newSplitTimes.filter(
                  (st) =>
                    typeof st.distance === "number" &&
                    st.distance === raceDistance,
                );
                if (newSplitTimes.length === 0) return mr;
              } else if (newBillable.length > maxNewBillable) {
                let billableAdded = 0;
                newSplitTimes = newSplitTimes.filter((st) => {
                  const isRaceDist =
                    typeof st.distance === "number" &&
                    st.distance === raceDistance;
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

  const removeSplitTime = (
    entryId: string,
    memberUserId: string,
    splitId: string,
  ) => {
    setEntries((prev) =>
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
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const style = styles.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;

    setEntries((prev) =>
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

            // split-timeが変更された場合、種目の距離と同じ距離のsplit-timeならタイムも更新
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
              // 種目の距離と同じ距離のsplit-timeが変更されたら、タイムも同期
              return {
                ...mr,
                splitTimes: updatedSplitTimes,
                time: updatedSplit.splitTime,
                timeDisplayValue:
                  updatedSplit.displayValue ||
                  formatTimeBest(updatedSplit.splitTime),
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

  const handleVideoReady = (
    entryId: string,
    memberUserId: string,
    file: File,
    thumbnail: Blob,
  ) => {
    updateMemberRecord(entryId, memberUserId, {
      videoFile: file,
      videoThumbnailBlob: thumbnail,
    });
    setVideoUploadModal(null);
  };

  const validationMessage = (err: SaveStyleRecordsValidationError): string => {
    switch (err.code) {
      case "relayFullTeam":
        return tRecords("validation.relayFullTeam");
      case "relayAllTimes":
        return tRecords("validation.relayAllTimes");
      case "cumulativeTimeInverted":
        return tRecords("validation.cumulativeTimeInverted", {
          current: err.params?.current ?? 0,
          prev: err.params?.prev ?? 0,
        });
      case "relaySplitBeforeLegStart":
        return tRecords("validation.relaySplitBeforeLegStart", {
          distance: err.params?.distance ?? 0,
          leg: err.params?.leg ?? 0,
        });
      case "atLeastOneRecord":
        return tRecords("validation.atLeastOneRecord");
    }
  };

  const videoErrorMessage = (videoError: VideoUploadError): string => {
    const { key, name, status = 0 } = videoError;
    switch (key) {
      case "errorVideoGenericFailed":
      case "errorVideoNoThumbnail":
        return tRecords(key, { name });
      default:
        return tRecords(key, { name, status });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      let result: Awaited<ReturnType<typeof saveStyleRecords>>;
      try {
        // この種目のぶんだけを保存する (他の種目の records・リレー記録には触れない)
        result = await saveStyleRecords({
          supabase,
          relayRecordsApi,
          competitionId,
          teamId,
          poolType: competition.pool_type,
          entries,
          existingRecords: initialState.scopedExistingRecords,
          memberGenderByUserId,
          styles,
        });
      } catch (err) {
        if (err instanceof SaveStyleRecordsValidationError) {
          alert(validationMessage(err));
          return;
        }
        throw err;
      }

      // 代理入力はチームメンバー全員の records を書き換えるため、
      // チーム記録ランキングのキャッシュ (staleTime 5分) を落とす。
      // この画面は React Query を経由しない生の from("records") 書き込みで、
      // useRecordsQuery の realtime も subscribeToRecords(cb, 自分の user_id) の
      // フィルタ付きなので他メンバーの行では発火しない。
      // hasError の早期 return より前に置く: 一部の行だけ書き込めた場合もキャッシュは古い。
      // (Provider が無い環境では no-op。理由は useInvalidateTeamRankings の docstring)
      invalidateRankings();
      // チーム画面のキャッシュ (カードの記録件数・記録一覧モーダル・メンバータブの
      // ベストタイム表) に残る保存前の内容を捨てる (一部だけ書き込めた場合も古い)
      if (queryClient) {
        void resetTeamQueriesAfterExternalSave(queryClient, [
          teamDetailKeys.competitionPages(teamId),
          teamDetailKeys.competitionRecords(competitionId),
          teamMemberBestTimesKeys.team(teamId),
        ]);
      }

      // エラーが発生した場合は一覧へ戻らない (入力を残して再保存できるようにする)
      if (result.hasError) {
        alert(tRecords("error.saveFailed"));
        return;
      }

      // 動画アップロード（保存されたrecordの各メンバーへ）。一部の失敗は集めて知らせる
      const videoUploadErrors = await uploadProxyRecordVideos({
        entries,
        savedRecordIdByRowId: result.savedRecordIdByRowId,
        teamId,
      });
      if (videoUploadErrors.length > 0) {
        // 記録の保存自体は成功しているが、一部の動画添付に失敗した。
        // この直後に種目一覧へ戻るため、ブロッキングな通知 (alert) で必ず伝えてから戻る
        window.alert(
          tRecords("videoPartialFailureSaved", {
            errors: videoUploadErrors.map(videoErrorMessage).join("\n"),
          }),
        );
      }

      // 保存できたら種目一覧へ戻る (mobile と同じ)。一覧はサーバーで描画し直すので、
      // カードの入力済み件数は保存後の内容になる
      setIsSaved(true);
      router.push(listPath);
    } catch (err) {
      console.error("チーム大会記録作成エラー:", err);
      alert(tRecords("error.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <RecordPageHeader
          backLabel={t("recordList.backToList")}
          onBack={handleBack}
          title={title}
          competition={competition}
        />

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {entries.map((entry, entryIndex) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-6">
              {/* 組の見出し (同じ種目に複数の組があるときだけ。リレーの別チーム等) */}
              {entries.length > 1 && (
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {t("record.groupNumber", { n: entryIndex + 1 })}
                  </h2>
                  <button
                    type="button"
                    onClick={() => removeGroup(entry.id)}
                    className="text-red-600 hover:text-red-800"
                    aria-label={t("record.removeHeatButtonLabel", {
                      n: entryIndex + 1,
                    })}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              )}

              {/* 対象メンバー選択 (個人種目) */}
              {!entry.relayEventId && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t("record.participantsHeader")}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openMemberSelectModal(entry.id)}
                      className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <UserGroupIcon className="h-4 w-4 mr-2" />
                      {t("record.selectMemberButton")}
                    </button>
                    <span className="text-sm text-gray-600">
                      {t("record.selectedMemberCount", { n: entry.memberRecords.length })}
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
                  <h3 className="text-sm font-medium text-gray-700">
                    {t("record.timesHeader")}
                  </h3>

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
                              const selectedMember = members.find(
                                (m) => m.user_id === selectedUserId,
                              );
                              updateMemberRecordByIndex(entry.id, mrIndex, {
                                memberUserId: selectedUserId,
                                memberName: selectedMember?.users.name || "",
                              });
                            }}
                            className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">
                              {tRecords("selectSwimmer")}
                            </option>
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
                          {(() => {
                            const goalTime = goalTargetTimeFor(
                              mr.memberUserId,
                              mr.relayLegStyleId,
                              mr.isRelaying,
                            );
                            if (goalTime === null) return null;
                            return (
                              <div>
                                <GoalTargetBadge
                                  time={goalTime}
                                  data-testid={`relay-leg-goal-target-badge-${mrIndex}`}
                                />
                              </div>
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
                          {t("record.totalTime")}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={entry.memberRecords[3]?.timeDisplayValue ?? ""}
                          onChange={(e) =>
                            handleRelayTotalTimeChange(entry.id, e.target.value)
                          }
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
                            {tRecords("relayLegShort", { num: mrIndex + 1 })}{" "}
                            {tRecordLog("reactionTimeLabelShort")}
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
                            {(entry.relaySplitTimes ?? []).length}/
                            {RELAY_FREE_PLAN_MAX_SPLITS}
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
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          {tRecordLog("splitAdd25m")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => addRelaySplitTimesEvery50m(entry.id)}
                          variant="outline"
                          className="text-xs py-1 px-2"
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          {tRecordLog("splitAdd50m")}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => addRelaySplitTime(entry.id)}
                          variant="outline"
                          className="text-xs py-1 px-2"
                          disabled={
                            !isPremium &&
                            (entry.relaySplitTimes ?? []).length >=
                              RELAY_FREE_PLAN_MAX_SPLITS
                          }
                        >
                          <PlusIcon className="h-3 w-3 mr-1" />
                          {tCommon("add")}
                        </Button>
                      </div>
                    </div>
                    {(entry.relaySplitTimes ?? []).length > 0 && (
                      <div className="space-y-2">
                        {[...(entry.relaySplitTimes ?? [])]
                          .sort((a, b) => a.distance - b.distance)
                          .map((split) => (
                            <div
                              key={split.id}
                              className="flex items-center gap-2"
                            >
                              <input
                                type="number"
                                value={split.distance}
                                onChange={(e) =>
                                  handleRelaySplitTimeChange(
                                    entry.id,
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
                                  handleRelaySplitTimeChange(
                                    entry.id,
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
                                  removeRelaySplitTime(entry.id, split.id)
                                }
                                className="text-red-500 hover:text-red-700"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* リレー全体の LapTimeDisplay */}
                    {(entry.relaySplitTimes ?? []).length > 0 &&
                      entry.relayEventId && (
                        <LapTimeDisplay
                          splitTimes={(() => {
                            const legBoundaries = getRelayLegBoundaries(
                              entry.relayEventId!,
                            );
                            const totalDistance = legBoundaries[3];
                            const baseSplits = (
                              entry.relaySplitTimes ?? []
                            ).map((st) => ({
                              distance: st.distance,
                              splitTime: st.splitTime,
                            }));
                            if (totalDistance === undefined) return baseSplits; // legBoundaries は
                            // 固定4要素配列で本来常に定義されるが型上は保証されないため防御的に扱う
                            const totalTime =
                              entry.memberRecords[3]?.cumulativeTimeSeconds ??
                              0;
                            if (
                              totalTime > 0 &&
                              !baseSplits.some(
                                (st) => st.distance === totalDistance,
                              )
                            ) {
                              return [
                                ...baseSplits,
                                {
                                  distance: totalDistance,
                                  splitTime: totalTime,
                                },
                              ];
                            }
                            return baseSplits;
                          })()}
                          raceDistance={
                            entry.relayEventId
                              ? getRelayLegBoundaries(entry.relayEventId)[3]
                              : undefined
                          }
                        />
                      )}
                  </div>
                </div>
              )}

              {/* 個人種目: メンバーごとの記録入力 */}
              {!entry.relayEventId && entry.memberRecords.length > 0 && (
                <div className="space-y-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700">
                    {t("record.timesHeader")}
                  </h3>
                  {entry.memberRecords.map((mr) => (
                    <div
                      key={mr.memberUserId}
                      className="bg-gray-50 rounded-lg p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="font-medium text-gray-900 mr-auto">
                          {mr.memberName}
                        </span>
                        {mr.entryTimeReference != null &&
                          mr.entryTimeReference > 0 && (
                            <span className="text-sm text-gray-500">
                              {tRecordLog("entryTimeLabel")}{" "}
                              {formatTimeBest(mr.entryTimeReference)}
                            </span>
                          )}
                        {(() => {
                          const best = bestTimeBadgeFor(
                            mr.memberUserId,
                            entry.styleId,
                            mr.isRelaying,
                          );
                          const goalTime = goalTargetTimeFor(
                            mr.memberUserId,
                            entry.styleId,
                            mr.isRelaying,
                          );
                          if (!best && goalTime === null) return null;
                          // ベストの真下に同じ右端で目標を置く。ベストが無いときは目標がその位置に来る
                          return (
                            <div className="flex flex-col items-end gap-1">
                              {best && (
                                <span
                                  data-testid={`record-best-time-badge-${mr.memberUserId}`}
                                  className="text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center"
                                >
                                  {best.label}: {formatTimeBest(best.time)}
                                </span>
                              )}
                              {goalTime !== null && (
                                <GoalTargetBadge
                                  variant="chip"
                                  time={goalTime}
                                  data-testid={`record-goal-target-badge-${mr.memberUserId}`}
                                />
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3">
                        {/* タイムとリアクションタイム */}
                        <div className="md:col-span-2">
                          <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {t("record.timeLabel")}
                              </label>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={mr.timeDisplayValue}
                                onChange={(e) =>
                                  handleTimeChange(
                                    entry.id,
                                    mr.memberUserId,
                                    e.target.value,
                                  )
                                }
                                placeholder={tRecords("timePlaceholder")}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            {/* リレー中も RT 欄は表示する。保存側 (buildRecordPayload) は
                                is_relaying に関わらず reaction_time を常に書き込んでおり、
                                「リレー中は RT を無視する」というルールは存在しない。
                                REACTION_TIME_MIN (packages/shared/utils/reactionTime.ts) が
                                「リレー引き継ぎのマイナス反応を許容する」ために -1 に
                                設定されているのは、リレーでの入力を前提としている証拠。
                                以前の非表示は歴史的な不整合であり、意図的な仕様ではない。 */}
                            <div className="w-36">
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {tRecordLog("reactionTimeLabelFull")}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="-1"
                                max="2"
                                value={mr.reactionTime || ""}
                                onChange={(e) =>
                                  updateMemberRecord(
                                    entry.id,
                                    mr.memberUserId,
                                    {
                                      reactionTime: e.target.value,
                                    },
                                  )
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
                            {t("record.relay")}
                          </label>
                        </div>

                        {/* メモ */}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {t("record.memoLabel")}
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
                            {t("record.splitTimeLabel")}
                            {!isPremium && (
                              <span className="ml-2 text-xs text-orange-600">
                                {t("record.freePlanLimitNotice")}
                              </span>
                            )}
                          </label>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              onClick={() =>
                                addSplitTimesEvery25m(entry.id, mr.memberUserId)
                              }
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={
                                !styles.find((s) => s.id === entry.styleId)
                                  ?.distance
                              }
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              {tRecordLog("splitAdd25m")}
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                addSplitTimesEvery50m(entry.id, mr.memberUserId)
                              }
                              variant="outline"
                              className="text-xs py-1 px-2"
                              disabled={
                                !styles.find((s) => s.id === entry.styleId)
                                  ?.distance
                              }
                            >
                              <PlusIcon className="h-3 w-3 mr-1" />
                              {tRecordLog("splitAdd50m")}
                            </Button>
                            <Button
                              type="button"
                              onClick={() =>
                                addSplitTime(entry.id, mr.memberUserId)
                              }
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
                                const distA =
                                  typeof a.distance === "number"
                                    ? a.distance
                                    : 0;
                                const distB =
                                  typeof b.distance === "number"
                                    ? b.distance
                                    : 0;
                                return distA - distB;
                              })
                              .map((split) => (
                                <div
                                  key={split.id}
                                  className="flex items-center gap-2"
                                >
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
                                    placeholder={tRecords(
                                      "distancePlaceholder",
                                    )}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <span className="text-gray-500 text-sm">
                                    m:
                                  </span>
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
                                    placeholder={tRecords(
                                      "splitTimePlaceholder",
                                    )}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSplitTime(
                                        entry.id,
                                        mr.memberUserId,
                                        split.id,
                                      )
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
                            {mr.videoFile
                              ? tRecords("videoHas")
                              : tRecords("videoSelect")}
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
                              const raceDistance = styles.find(
                                (s) => s.id === entry.styleId,
                              )?.distance;
                              const recordTime = mr.time;
                              if (
                                raceDistance &&
                                recordTime &&
                                recordTime > 0
                              ) {
                                const hasGoalSplit = baseSplits.some(
                                  (st) => st.distance === raceDistance,
                                );
                                if (!hasGoalSplit) {
                                  return [
                                    ...baseSplits,
                                    {
                                      distance: raceDistance,
                                      splitTime: recordTime,
                                    },
                                  ];
                                }
                              }
                              return baseSplits;
                            })()}
                            raceDistance={
                              styles.find((s) => s.id === entry.styleId)
                                ?.distance
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

          {/* リレー: 同じ種目に別の組 (チーム) を足す */}
          {selection.kind === "relay" && (
            <Button
              type="button"
              onClick={addRelayGroup}
              variant="outline"
              className="w-full"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              {t("record.addHeatButton", { n: entries.length + 1 })}
            </Button>
          )}

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 pt-6">
            <Button type="button" onClick={handleBack} variant="secondary">
              {t("record.cancelButton")}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? t("record.saving") : t("record.saveButton")}
            </Button>
          </div>
        </form>
      </div>

      {/* 未保存の入力の破棄確認 */}
      <ConfirmDialog
        isOpen={showLeaveConfirm}
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
        title={tUnsaved("title")}
        message={tUnsaved("messageBack")}
        confirmLabel={tUnsaved("confirmBack")}
        cancelLabel={tUnsaved("cancel")}
        variant="warning"
      />

      {/* メンバー選択モーダル */}
      <MemberSelectModal
        isOpen={showMemberSelectModal}
        teamId={teamId}
        supabase={supabase}
        title={tRecords("selectMembersTitle")}
        members={memberSelectCandidates}
        selectedUserIds={currentStyleEntrySelectedUserIds}
        onConfirm={confirmMemberSelection}
        onCancel={() => {
          setShowMemberSelectModal(false);
          setCurrentStyleEntryId(null);
        }}
      />

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
