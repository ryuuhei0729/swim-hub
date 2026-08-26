"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthProvider";
import { EntryAPI } from "@apps/shared/api/entries";
import type { BestTime, EntryDraftRow, PoolType, Style } from "@apps/shared/types";
import {
  diffEntryRows,
  findDuplicateMemberStylePairs,
  isPrefillUntouched,
  partitionConflictingDeletes,
  type ExistingEntryRow,
} from "@apps/shared/utils/entryDiff";
import { isCompetitionDateInPast, formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatTimeBest } from "@apps/shared/utils/time";
import { styleIdToCodeKey, buildSwimStyleLabel } from "@/utils/swimStyle";
import MemberSelectModal, { type MemberSelectOption } from "@/components/team/MemberSelectModal";
import EntryBulkConfirmModal, {
  type EntryBulkConfirmRow,
} from "@/components/team/entry/EntryBulkConfirmModal";

export interface ExistingEntryDisplay {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
  targetUserName: string;
}

interface EntriesCompetitionInfo {
  id: string;
  title: string;
  date: string;
  place: string | null;
  pool_type: PoolType;
  entry_status?: "before" | "open" | "closed";
  teamName: string;
}

interface EntriesClientProps {
  teamId: string;
  competitionId: string;
  competition: EntriesCompetitionInfo;
  activeMembers: MemberSelectOption[];
  existingEntries: ExistingEntryDisplay[];
  styles: Style[];
  bestTimesByUser: Record<string, BestTime[]>;
}

function buildInitialRows(existingEntries: ExistingEntryDisplay[]): EntryDraftRow[] {
  return existingEntries.map((entry) => ({
    localId: entry.id,
    existingEntryId: entry.id,
    targetUserId: entry.user_id,
    targetUserName: entry.targetUserName,
    styleId: entry.style_id,
    entryTimeInput: entry.entry_time != null ? formatTimeBest(entry.entry_time) : "",
    note: entry.note ?? "",
    prefillSource: null,
    prefilledInput: null,
  }));
}

export default function EntriesClient({
  teamId,
  competitionId,
  competition,
  activeMembers,
  existingEntries,
  styles,
  bestTimesByUser,
}: EntriesClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("teams");
  const tCommon = useTranslations("common");
  const tEntries = useTranslations("competition.entries");
  const tStyles = useTranslations("practice.styles");
  const { supabase } = useAuth();

  const [rows, setRows] = useState<EntryDraftRow[]>(() => buildInitialRows(existingEntries));
  const [showMemberSelectModal, setShowMemberSelectModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSections, setConfirmSections] = useState<{
    newRows: EntryBulkConfirmRow[];
    updatedRows: EntryBulkConfirmRow[];
    deletedRows: EntryBulkConfirmRow[];
    unchangedRows: EntryBulkConfirmRow[];
  }>({ newRows: [], updatedRows: [], deletedRows: [], unchangedRows: [] });
  const [saving, setSaving] = useState(false);

  const styleLabel = (style: Style): string => {
    const codeKey = styleIdToCodeKey(style.id);
    if (codeKey) {
      return buildSwimStyleLabel(style.distance, tStyles(codeKey), locale);
    }
    return style.name_jp;
  };

  const findStyleById = (styleId: number | "" | undefined): Style | undefined =>
    styleId == null || styleId === "" ? undefined : styles.find((s) => s.id === styleId);

  const findBestTime = (userId: string, styleId: number): BestTime | undefined =>
    (bestTimesByUser[userId] ?? []).find((b) => b.style_id === styleId);

  const existingForDiff: ExistingEntryRow[] = existingEntries.map((e) => ({
    id: e.id,
    user_id: e.user_id,
    style_id: e.style_id,
    entry_time: e.entry_time,
    note: e.note,
  }));
  const existingById = new Map(existingForDiff.map((e) => [e.id, e]));

  const duplicatePairs = findDuplicateMemberStylePairs(rows);
  const isRowDuplicate = (row: EntryDraftRow): boolean =>
    row.styleId !== "" && duplicatePairs.has(`${row.targetUserId}:${row.styleId}`);

  const isPastDate = isCompetitionDateInPast(competition.date);
  const isClosed = competition.entry_status === "closed";

  // =========================================================================
  // 選手ごとのグルーピング（mobile TeamEntryBulkFormScreen.tsx の memberOrder /
  // rowsByMember と同じ構造・操作手順に揃える。選手カード単位でグルーピングし、
  // カード内に種目行を複数持つ）
  // =========================================================================

  const memberOrder = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    rows.forEach((r) => {
      if (!seen.has(r.targetUserId)) {
        seen.add(r.targetUserId);
        order.push(r.targetUserId);
      }
    });
    return order;
  }, [rows]);

  const rowsByMember = useMemo(() => {
    const map = new Map<string, EntryDraftRow[]>();
    rows.forEach((r) => {
      const list = map.get(r.targetUserId) ?? [];
      list.push(r);
      map.set(r.targetUserId, list);
    });
    return map;
  }, [rows]);

  const isMemberActive = (userId: string): boolean =>
    activeMembers.some((m) => m.user_id === userId);

  const createEmptyRow = (targetUserId: string): EntryDraftRow => {
    const member = activeMembers.find((m) => m.user_id === targetUserId);
    return {
      localId: crypto.randomUUID(),
      existingEntryId: null,
      targetUserId,
      targetUserName: member?.name ?? "",
      styleId: "",
      entryTimeInput: "",
      note: "",
      prefillSource: null,
      prefilledInput: null,
    };
  };

  // メンバー選択モーダルの確定ハンドラ（mobile confirmMemberSelection と同じ挙動）。
  // 選択解除されたメンバーでも、既存エントリー行 (existingEntryId あり) は残す
  // (削除は行単位の明示的な削除ボタンでのみ行う)
  const confirmMemberSelection = (selectedUserIds: string[]) => {
    setRows((prev) => {
      const kept = prev.filter(
        (r) => selectedUserIds.includes(r.targetUserId) || r.existingEntryId !== null,
      );
      const usersWithRows = new Set(kept.map((r) => r.targetUserId));
      const newRows = selectedUserIds
        .filter((uid) => !usersWithRows.has(uid))
        .map((uid) => createEmptyRow(uid));
      return [...kept, ...newRows];
    });
    setShowMemberSelectModal(false);
  };

  const addRowForMember = (targetUserId: string) => {
    setRows((prev) => [...prev, createEmptyRow(targetUserId)]);
  };

  const removeRow = (localId: string) => {
    setRows((prev) => prev.filter((r) => r.localId !== localId));
  };

  // =========================================================================
  // 種目・タイム・メモの更新（プリフィル: 仕様#4）
  // =========================================================================

  const handleStyleChange = (localId: string, newStyleId: number | "") => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        if (newStyleId === "") {
          return { ...row, styleId: "", prefillSource: null, prefilledInput: null };
        }
        // 入力欄が空のときのみ自動プリフィルする（既入力値は上書きしない）
        if (row.entryTimeInput.trim() === "") {
          const best = findBestTime(row.targetUserId, newStyleId);
          if (best) {
            const formatted = formatTimeBest(best.time);
            return {
              ...row,
              styleId: newStyleId,
              entryTimeInput: formatted,
              prefillSource: "bestTime",
              prefilledInput: formatted,
            };
          }
        }
        return { ...row, styleId: newStyleId, prefillSource: null, prefilledInput: null };
      }),
    );
  };

  const handleApplyBestTime = (localId: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId || row.styleId === "") return row;
        const best = findBestTime(row.targetUserId, row.styleId);
        if (!best) return row;
        const formatted = formatTimeBest(best.time);
        return {
          ...row,
          entryTimeInput: formatted,
          prefillSource: "bestTime",
          prefilledInput: formatted,
        };
      }),
    );
  };

  const handleTimeInputChange = (localId: string, value: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.localId !== localId) return row;
        const stillPrefilled = row.prefillSource === "bestTime" && row.prefilledInput === value;
        return {
          ...row,
          entryTimeInput: value,
          prefillSource: stillPrefilled ? "bestTime" : "manual",
        };
      }),
    );
  };

  const handleNoteChange = (localId: string, value: string) => {
    setRows((prev) => prev.map((row) => (row.localId === localId ? { ...row, note: value } : row)));
  };

  // =========================================================================
  // 保存フロー（仕様#3: 確認モーダル → 確定）
  // =========================================================================

  // 確認モーダルの表示は diffEntryRows の結果を唯一の真実として使う
  // (buildConfirmRows が独自に削除判定を再実装すると diffEntryRows の実際の挙動と
  // 食い違う恐れがある。特に「種目を未選択に戻した既存行」が削除される挙動を
  // 確認モーダルにも正しく反映させるため)
  const buildConfirmSections = (diff: ReturnType<typeof diffEntryRows>) => {
    const currentByExistingId = new Map(
      rows
        .filter((row): row is EntryDraftRow & { existingEntryId: string } => !!row.existingEntryId)
        .map((row) => [row.existingEntryId, row]),
    );

    const newRows: EntryBulkConfirmRow[] = diff.toCreate.map((insert) => {
      const sourceRow = rows.find(
        (r) => !r.existingEntryId && r.targetUserId === insert.user_id && r.styleId === insert.style_id,
      );
      const style = findStyleById(insert.style_id);
      return {
        key: sourceRow?.localId ?? `create-${insert.user_id}-${insert.style_id}`,
        targetUserName: sourceRow?.targetUserName ?? "",
        styleLabel: style ? styleLabel(style) : "-",
        beforeDisplay: null,
        afterDisplay: insert.entry_time != null ? formatTimeBest(insert.entry_time) : null,
        showUneditedBestTimeWarning: sourceRow ? isPrefillUntouched(sourceRow) : false,
      };
    });

    const updatedRows: EntryBulkConfirmRow[] = diff.toUpdate.map(({ id, patch }) => {
      const existing = existingById.get(id);
      const row = currentByExistingId.get(id);
      const styleId = patch.style_id ?? existing?.style_id;
      const style = findStyleById(styleId);
      const afterTime =
        patch.entry_time !== undefined
          ? patch.entry_time != null
            ? formatTimeBest(patch.entry_time)
            : null
          : existing?.entry_time != null
            ? formatTimeBest(existing.entry_time)
            : null;
      return {
        key: id,
        targetUserName: row?.targetUserName ?? existingEntries.find((e) => e.id === id)?.targetUserName ?? "",
        styleLabel: style ? styleLabel(style) : "-",
        beforeDisplay: existing?.entry_time != null ? formatTimeBest(existing.entry_time) : null,
        afterDisplay: afterTime,
        showUneditedBestTimeWarning: row ? isPrefillUntouched(row) : false,
      };
    });

    const deletedRows: EntryBulkConfirmRow[] = diff.toDelete.map((id) => {
      const existing = existingEntries.find((e) => e.id === id);
      const style = existing ? findStyleById(existing.style_id) : undefined;
      return {
        key: id,
        targetUserName: existing?.targetUserName ?? "",
        styleLabel: style ? styleLabel(style) : "-",
        beforeDisplay: existing?.entry_time != null ? formatTimeBest(existing.entry_time) : null,
        afterDisplay: null,
        showUneditedBestTimeWarning: false,
      };
    });

    const unchangedRows: EntryBulkConfirmRow[] = diff.unchanged.map((id) => {
      const existing = existingEntries.find((e) => e.id === id);
      const style = existing ? findStyleById(existing.style_id) : undefined;
      const timeDisplay = existing?.entry_time != null ? formatTimeBest(existing.entry_time) : null;
      return {
        key: id,
        targetUserName: existing?.targetUserName ?? "",
        styleLabel: style ? styleLabel(style) : "-",
        beforeDisplay: timeDisplay,
        afterDisplay: timeDisplay,
        showUneditedBestTimeWarning: false,
      };
    });

    return { newRows, updatedRows, deletedRows, unchangedRows };
  };

  /**
   * 保存対象の自然キー衝突を検出し、行動可能なエラーメッセージ (選手名・種目名を含む) を返す。
   * 衝突が無ければ null を返す。
   *
   * New Critical A 対応: 「衝突する削除を先に実行してから upsert/update する」という
   * 順序制御は、削除がコミットされた直後に upsert/update が別要因で失敗すると
   * 選手のエントリーを完全に失うデータ損失窓を生むため廃止した。
   * `partitionConflictingDeletes` は「書き込み前の事前バリデーション」専用として使い、
   * 衝突を検出したら **DB に1行も書き込む前に保存処理そのものを中止する**。
   */
  const findDeleteConflictError = (diff: ReturnType<typeof diffEntryRows>): string | null => {
    const { conflicting } = partitionConflictingDeletes(diff, existingForDiff, rows);
    if (conflicting.length === 0) return null;

    const description = conflicting
      .map((id) => {
        const existing = existingEntries.find((e) => e.id === id);
        const style = existing ? findStyleById(existing.style_id) : undefined;
        const name = existing?.targetUserName ?? "";
        const label = style ? styleLabel(style) : "-";
        return `${name} ${label}`;
      })
      .join(", ");

    return tEntries("deleteConflictError", { detail: description });
  };

  const handleOpenConfirm = () => {
    if (isPastDate || duplicatePairs.size > 0) return; // 保存ボタン disabled 済みの防御的ガード

    // 保存対象 (新規/更新/削除) が1件も無い場合のみアラート。
    // 「種目未選択の行が無視される」ケースと「既存行を全削除して保存する」ケースを
    // 区別するため、diff の実際の計算結果で判定する (単純な「有効な種目行の有無」では
    // 全削除の保存意図を誤ってブロックしてしまう)。
    const diff = diffEntryRows(existingForDiff, rows, competitionId, teamId);
    if (diff.toCreate.length === 0 && diff.toUpdate.length === 0 && diff.toDelete.length === 0) {
      window.alert(tEntries("noValidRowsError"));
      return;
    }

    // 確認モーダルを開く前に自然キー衝突を検出する (DB書き込み前の事前バリデーション)。
    // 確認モーダルを開いてしまうと「確定」を押すまで衝突に気付けないため、
    // この時点で検出してブロックする。
    const conflictError = findDeleteConflictError(diff);
    if (conflictError) {
      window.alert(conflictError);
      return;
    }

    setConfirmSections(buildConfirmSections(diff));
    setShowConfirmModal(true);
  };

  const handleCancelConfirm = () => {
    // フォーム状態 (rows) は保持したままモーダルだけ閉じる
    setShowConfirmModal(false);
  };

  const handleConfirmSave = async () => {
    setSaving(true);
    try {
      const entryAPI = new EntryAPI(supabase);
      const diff = diffEntryRows(existingForDiff, rows, competitionId, teamId);

      // 確認モーダルを開く時点 (handleOpenConfirm) で自然キー衝突を検出済みのため、
      // ここに到達した時点で diff.toDelete と toCreate/toUpdate は衝突しないはずである。
      // ただし確認モーダルを開いたまま画面を放置し、その間に他の操作で状態が変わる
      // 可能性もゼロではないため、書き込み直前にも防御的に再チェックする。
      const conflictError = findDeleteConflictError(diff);
      if (conflictError) {
        window.alert(conflictError);
        return;
      }

      // 書き込み順序: upsert/update を先、delete を後に固定する
      // (逆順は失敗時に「削除だけ実行され新規/更新が失われる」データ損失を起こす)。
      // 衝突する削除は上記チェックで事前にブロックされているため、この順序で
      // UNIQUE 制約違反は起きない。
      //
      // Critical 1: 新規行 (toCreate) は upsert (createBulkEntries)。
      // 既存行の更新 (toUpdate) は id ベースの updateEntry を使う。
      // upsert の衝突判定は自然キー (competition_id,user_id,style_id) のみで行われ
      // entries.id を見ないため、「既存行 X の style_id を変更した」パッチを upsert に
      // 混ぜると、Postgres は X ではなく変更後の自然キーに元から一致する別の行を
      // 衝突相手として上書きしてしまう (サイレントなデータ破壊)。
      // mobile の TeamEntryBulkFormScreen.tsx と同じ id ベースの更新に揃える。
      if (diff.toCreate.length > 0) {
        await entryAPI.createBulkEntries(
          teamId,
          diff.toCreate.map((insert) => ({
            userId: insert.user_id,
            competitionId: insert.competition_id,
            styleId: insert.style_id,
            entryTime: insert.entry_time,
            note: insert.note,
            isRelaying: false,
          })),
        );
      }
      for (const { id, patch } of diff.toUpdate) {
        await entryAPI.updateEntry(id, patch);
      }
      if (diff.toDelete.length > 0) {
        await entryAPI.deleteBulkEntries(teamId, diff.toDelete);
      }

      setShowConfirmModal(false);
      router.push(`/teams-admin/${teamId}?tab=competitions`);
    } catch (err) {
      console.error("エントリー代理一括入力の保存に失敗:", err);
      // Postgres の UNIQUE 制約違反 (23505) は、事前バリデーションで弾けなかった
      // 同時編集等の要因で稀に発生しうる。原因が推測できる分岐メッセージを出す
      // (Suggestion 1)。
      const isUniqueViolation =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "23505";
      window.alert(isUniqueViolation ? tEntries("saveFailedDuplicate") : t("record.saveFailed"));
      // フォーム状態は破棄しない。画面遷移もしない（再度保存ボタンを押せる状態を保つ）
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    router.push(`/teams-admin/${teamId}?tab=competitions`);
  };

  const saveDisabled = saving || isPastDate || duplicatePairs.size > 0;

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
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{tEntries("pageTitle")}</h1>
            <p className="text-gray-600 mb-4">{tEntries("subtitle")}</p>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <span className="font-medium">{competition.title}</span>
              </div>
              <div className="flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4" />
                <span>{formatDate(competition.date, "longWithWeekday", locale as SupportedLocale)}</span>
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

        {/* 警告バナー */}
        {isPastDate && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 text-sm flex items-center gap-1.5">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {tEntries("pastDateBlocked")}
            </p>
          </div>
        )}
        {!isPastDate && isClosed && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-yellow-800 text-sm flex items-center gap-1.5">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {tEntries("closedWarning")}
            </p>
          </div>
        )}

        {/* 対象メンバー選択 */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowMemberSelectModal(true)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <UserGroupIcon className="h-4 w-4 mr-2" />
            {t("record.selectMemberButton")}
          </button>
        </div>

        {/* 選手カード一覧（選手 → 種目行の順でグルーピング。
            mobile TeamEntryBulkFormScreen.tsx:580-697 の memberOrder/rowsByMember と同じ操作手順） */}
        {memberOrder.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-sm text-gray-500 mb-6">
            {tEntries("emptyState")}
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {memberOrder.map((userId) => {
              const memberRows = rowsByMember.get(userId) ?? [];
              const memberActive = isMemberActive(userId);
              const memberName = memberRows[0]?.targetUserName ?? "";

              return (
                <div key={userId} className="bg-white rounded-lg shadow p-4 sm:p-6">
                  {/* 選手カードヘッダー */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-base font-bold text-gray-900">{memberName}</span>
                    {!memberActive && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        {t("mobile.retiredMemberBadge")}
                      </span>
                    )}
                  </div>

                  {/* 種目行 */}
                  <div className="space-y-3">
                    {memberRows.map((row, rowIndex) => {
                      const duplicate = isRowDuplicate(row);
                      const untouchedPrefill = isPrefillUntouched(row);
                      const bestTime =
                        row.styleId !== "" ? findBestTime(row.targetUserId, row.styleId) : undefined;

                      return (
                        <div
                          key={row.localId}
                          className={`bg-gray-50 rounded-lg p-4 border ${
                            duplicate ? "border-red-400" : "border-transparent"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-gray-700">
                              {t("record.eventNumber", { n: rowIndex + 1 })}
                            </h3>
                            <button
                              type="button"
                              onClick={() => removeRow(row.localId)}
                              className="text-red-600 hover:text-red-800"
                              aria-label={tCommon("delete")}
                            >
                              <TrashIcon className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                            {/* 種目選択 */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {t("record.eventLabel")}
                              </label>
                              <select
                                value={row.styleId}
                                onChange={(e) =>
                                  handleStyleChange(
                                    row.localId,
                                    e.target.value === "" ? "" : parseInt(e.target.value, 10),
                                  )
                                }
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">{t("record.eventPlaceholder")}</option>
                                {styles.map((style) => (
                                  <option key={style.id} value={style.id}>
                                    {styleLabel(style)}
                                  </option>
                                ))}
                              </select>
                              {duplicate && (
                                <p className="mt-1 text-xs text-red-600">
                                  {tEntries("duplicateMemberStyle")}
                                </p>
                              )}
                            </div>

                            {/* タイム入力 + ベストタイム流用 */}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                {t("record.timeLabel")}
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={row.entryTimeInput}
                                  onChange={(e) => handleTimeInputChange(row.localId, e.target.value)}
                                  placeholder={t("record.timePlaceholder")}
                                  className={`flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    untouchedPrefill
                                      ? "border-yellow-300 bg-yellow-50"
                                      : "border-gray-300"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleApplyBestTime(row.localId)}
                                  disabled={!bestTime}
                                  className="shrink-0 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  {tEntries("bestTimePrefillButton")}
                                </button>
                              </div>
                              {untouchedPrefill && (
                                <p className="mt-1 text-xs text-yellow-700">
                                  {tEntries("bestTimePrefillBadge")}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* メモ */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              {t("record.memoLabel")}
                            </label>
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) => handleNoteChange(row.localId, e.target.value)}
                              placeholder={t("record.memoPlaceholder")}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 種目追加（選手カード単位） */}
                  {memberActive && (
                    <button
                      type="button"
                      onClick={() => addRowForMember(userId)}
                      className="mt-3 inline-flex items-center px-3 py-2 border border-dashed border-blue-300 rounded-md text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      {t("record.addEventButton")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 保存ボタン */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleOpenConfirm}
            disabled={saveDisabled}
            className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tEntries("saveButton")}
          </button>
        </div>
      </div>

      <MemberSelectModal
        isOpen={showMemberSelectModal}
        members={activeMembers}
        selectedUserIds={memberOrder}
        onConfirm={confirmMemberSelection}
        onCancel={() => setShowMemberSelectModal(false)}
      />

      <EntryBulkConfirmModal
        isOpen={showConfirmModal}
        newRows={confirmSections.newRows}
        updatedRows={confirmSections.updatedRows}
        deletedRows={confirmSections.deletedRows}
        unchangedRows={confirmSections.unchangedRows}
        submitting={saving}
        onCancel={handleCancelConfirm}
        onConfirm={handleConfirmSave}
      />
    </div>
  );
}
