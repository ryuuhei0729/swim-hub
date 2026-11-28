"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { TrophyIcon, ClipboardDocumentListIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useAuth } from "@/contexts";
import { useRouter } from "@/i18n/navigation";
import { teamScheduleItemHref, type TeamScheduleLink } from "@/utils/teamView";
import { useFittedModalHeight } from "@/hooks/useFittedModalHeight";
import { lockBodyScroll } from "@/utils/scrollLock";
import {
  type DayDetailModalProps,
  type CalendarItem,
  isPracticeMetadata,
  isCompetitionMetadata,
  isRecordMetadata,
  isTeamInfo,
} from "@apps/shared/types/ui";
import type { PracticeLog } from "@apps/shared/types";
import { RecordAPI } from "@apps/shared/api/records";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks";
import { resolveCalendarItemColor, getDefaultColorForType } from "@apps/shared/utils/calendarColorResolver";
import { hexToRgba, mixWithWhite, CALENDAR_COLOR_ALPHA } from "@apps/shared/utils/colorAlpha";
import {
  PracticeDetails,
  CompetitionDetails,
  CompetitionWithEntry,
  AttendanceModal,
  DeleteConfirmModal,
} from "./components";
import type { DeleteConfirmState, AttendanceModalState } from "./types";

// モジュールスコープの純関数 — practiceId 抽出ロジックを一元化
function getPracticeIdFromItem(item: CalendarItem): string | null {
  if (!isPracticeMetadata(item.metadata)) return null;
  return item.metadata.practice?.id || item.metadata.practice_id || null;
}

export default function DayDetailModal({
  isOpen,
  onClose,
  date,
  entries,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onAddPracticeLog,
  onAddPracticeLogFromTemplate,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
}: DayDetailModalProps) {
  const { supabase, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [isFetchingRecordCount, setIsFetchingRecordCount] = useState(false);
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([]);
  const [showAttendanceModal, setShowAttendanceModal] = useState<AttendanceModalState | null>(null);
  // 件数取得中の competitionId。古いフェッチが後から解決したとき、現在開いている
  // 確認対象と一致するかを .then/.catch/.finally の全てで判定するためのトークン。
  // (state は非同期クロージャ内で stale になるため ref で保持する)
  const pendingRecordCountRequestIdRef = useRef<string | null>(null);

  // 大会削除確認モーダルを開く。チーム大会は records を削除しないため件数取得を行わない
  // (誤情報の警告表示・無駄なリクエストを避ける)。件数取得の失敗は非致命: 削除自体は
  // ブロックせず、件数なしの汎用文言にフォールバックする。
  const openCompetitionDeleteConfirm = useCallback(
    (competitionId: string, type: "competition" | "team_competition", isTeamCompetition: boolean) => {
      setShowDeleteConfirm({ id: competitionId, type });
      if (isTeamCompetition) return;

      pendingRecordCountRequestIdRef.current = competitionId;
      setIsFetchingRecordCount(true);
      recordAPI
        .countRecordsByCompetition(competitionId)
        .then((count) => {
          if (pendingRecordCountRequestIdRef.current !== competitionId) return;
          setShowDeleteConfirm((prev) =>
            prev && prev.id === competitionId ? { ...prev, recordCount: count } : prev,
          );
        })
        .catch((error) => {
          if (pendingRecordCountRequestIdRef.current !== competitionId) return;
          console.error("大会記録件数の取得に失敗しました:", error);
        })
        .finally(() => {
          if (pendingRecordCountRequestIdRef.current !== competitionId) return;
          setIsFetchingRecordCount(false);
        });
    },
    [recordAPI],
  );
  const { settings: calendarColorSettings } = useCalendarColorSettingsQuery(supabase, user?.id);
  const getItemColor = (item: CalendarItem) =>
    resolveCalendarItemColor(item.type, item.metadata, calendarColorSettings);

  // 「記録を追加」チューザーのアイコン色。team_id なし(個人)の練習/大会色を解決する。
  // デフォルト色時は現状のアイコン色(トロフィー=青/クリップボード=緑)をそのまま維持する。
  const personalCompetitionColor = resolveCalendarItemColor("competition", null, calendarColorSettings);
  const personalPracticeColor = resolveCalendarItemColor("practice", null, calendarColorSettings);
  const isCompetitionColorDefault =
    personalCompetitionColor === getDefaultColorForType("competition");
  const isPracticeColorDefault = personalPracticeColor === getDefaultColorForType("practice");

  // チューザーボタンの hover 中の枠線/背景をカスタム色に追従させるための state。
  // 空状態(entries.length===0)と記録追加セクション(entries.length>0)は排他的にしか
  // 描画されないため、それぞれ1組の state をボタン種別ごとに共有してよい。
  const [isRecordButtonHovered, setIsRecordButtonHovered] = useState(false);
  const [isPracticeButtonHovered, setIsPracticeButtonHovered] = useState(false);

  const recordButtonHoverStyle =
    isCompetitionColorDefault || !isRecordButtonHovered
      ? undefined
      : {
          backgroundColor: mixWithWhite(
            personalCompetitionColor,
            CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND,
          ),
          borderColor: hexToRgba(personalCompetitionColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER),
        };
  const practiceButtonHoverStyle =
    isPracticeColorDefault || !isPracticeButtonHovered
      ? undefined
      : {
          backgroundColor: mixWithWhite(
            personalPracticeColor,
            CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND,
          ),
          borderColor: hexToRgba(personalPracticeColor, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER),
        };

  // practice_log 型アイテムのリスト（重複排除・updateKey 算出の入力）
  const practiceLogItems = useMemo(
    () => entries.filter((e) => e.type === "practice_log"),
    [entries],
  );

  // 同一 practiceId の PracticeLog を1件に絞り込んだ代表アイテム一覧。
  // null の責任はここで一本化し、後続 map 側のガードは不要にする。
  const uniquePracticeLogItems = useMemo(() => {
    const seenPracticeIds = new Set<string>();
    return practiceLogItems.filter((item) => {
      const pid = getPracticeIdFromItem(item);
      if (!pid || seenPracticeIds.has(pid)) return false;
      seenPracticeIds.add(pid);
      return true;
    });
  }, [practiceLogItems]);

  // practiceId → updateKey のマップを一度だけ構築（O(n+m)）。
  // updateKey は同一 practiceId の全ログ（全件）の id:updated_at をソート連結した文字列。
  const practiceLogUpdateKeyMap = useMemo(() => {
    const keyMap = new Map<string, string[]>();
    for (const p of practiceLogItems) {
      const pid = getPracticeIdFromItem(p);
      if (!pid) continue;
      const practiceLog = (p.metadata as { practice_log?: PracticeLog })?.practice_log;
      const entry = `${p.id}:${practiceLog?.updated_at || p.id}`;
      const arr = keyMap.get(pid);
      if (arr) {
        arr.push(entry);
      } else {
        keyMap.set(pid, [entry]);
      }
    }
    const result = new Map<string, string>();
    for (const [pid, arr] of keyMap) {
      result.set(pid, arr.sort().join(","));
    }
    return result;
  }, [practiceLogItems]);

  // 開いている間は背面のページをスクロールさせない。
  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  // カードの高さを中身に合わせ、画面に収まらない分だけ本文をスクロールさせる。
  const { containerRef, cardRef, headerRef, contentRef, footerRef, fitted, animate } =
    useFittedModalHeight(isOpen);

  if (!isOpen) return null;

  // エントリーの分類
  const practiceItems = entries.filter((e) => e.type === "practice" || e.type === "team_practice");
  const recordItems = entries.filter((e) => e.type === "record");
  const competitionItems = entries.filter(
    (e) => e.type === "competition" || e.type === "team_competition",
  );
  const entryItems = entries.filter((e) => e.type === "entry");

  const hasPracticeContent = practiceItems.length > 0 || practiceLogItems.length > 0;
  const hasRecordContent =
    competitionItems.length > 0 || entryItems.length > 0 || recordItems.length > 0;

  const isEmpty = entries.length === 0;

  const detailTestId = hasPracticeContent
    ? "practice-detail-modal"
    : hasRecordContent
      ? "record-detail-modal"
      : "day-detail-modal";

  const handleDeleteConfirm = async () => {
    if (showDeleteConfirm) {
      await onDeleteItem?.(showDeleteConfirm.id, showDeleteConfirm.type);
      if (showDeleteConfirm.type === "entry") {
        setDeletedEntryIds((prev) => [...prev, showDeleteConfirm.id]);
      }
      setShowDeleteConfirm(null);
      setIsFetchingRecordCount(false);
      pendingRecordCountRequestIdRef.current = null;
      const remainingEntries = entries.filter((e) => e.id !== showDeleteConfirm.id);
      if (remainingEntries.length === 0) {
        onClose();
      }
    }
  };

  const deleteConfirmExtraMessage =
    showDeleteConfirm &&
    (showDeleteConfirm.type === "competition" || showDeleteConfirm.type === "team_competition") &&
    typeof showDeleteConfirm.recordCount === "number" &&
    showDeleteConfirm.recordCount > 0
      ? t("deleteConfirm.competitionRecordsWarning", { count: showDeleteConfirm.recordCount })
      : undefined;

  const handleShowAttendance = (
    eventId: string,
    eventType: "practice" | "competition",
    teamId: string,
  ) => {
    setShowAttendanceModal({ eventId, eventType, teamId });
  };

  // 「チームの記録を見る」: 日付詳細は自分の記録だけなので、メンバー全員の記録は
  // チーム画面の予定タブでその練習・大会の詳細を開いて見る (利用者ビュー)
  const handleShowTeamRecords = (teamId: string, link: TeamScheduleLink) => {
    onClose();
    router.push(teamScheduleItemHref(teamId, link));
  };

  // エントリー編集ハンドラー
  const handleEditEntry = async (item: CalendarItem, competitionId: string) => {
    // getUser()とcompetitionステータスチェックを並行実行
    let user: { id: string } | null = null;
    let competitionStatusResult: { data: { entry_status?: string } | null; error: unknown } = {
      data: null,
      error: null,
    };

    try {
      const [authResult, statusResult] = await Promise.all([
        supabase.auth.getUser(),
        item.metadata?.team_id
          ? supabase.from("competitions").select("entry_status").eq("id", competitionId).single()
          : Promise.resolve({ data: null, error: null }),
      ]);
      user = authResult.data.user;
      competitionStatusResult = statusResult;
    } catch (error) {
      console.error("データ取得中にエラーが発生しました:", error);
      window.alert(t("handlers.dataLoadError"));
      return;
    }

    if (!user) return;

    // チームcompetitionの場合、entry_statusをチェック
    if (item.metadata?.team_id && !competitionStatusResult.error && competitionStatusResult.data) {
      const status = competitionStatusResult.data.entry_status || "before";
      if (status !== "open") {
        const statusLabel = status === "before" ? t("entry.statusBefore") : t("entry.statusClosed");
        window.alert(t("entry.statusAlert", { status: statusLabel }));
        onAddRecord?.({ competitionId });
        return;
      }
    }

    // エントリーデータを取得
    const { data: entryData, error } = await supabase
      .from("entries")
      .select(
        `
        *,
        style:styles!inner(id, name_jp),
        competition:competitions!inner(id, title, date, place, pool_type, team_id)
      `,
      )
      .eq("competition_id", competitionId)
      .eq("user_id", user.id);

    if (error || !entryData || entryData.length === 0) {
      console.error("エントリー取得エラー:", error);
      return;
    }

    type EntryRow = {
      id: string;
      competition_id: string;
      style_id: number;
      entry_time: number | null;
      note: string | null;
      style: { id: number; name_jp: string };
      competition: {
        id: string;
        title: string;
        date: string;
        place: string | null;
        pool_type: number;
        team_id: string | null;
      };
    };

    const rows = entryData as EntryRow[];
    const entryList = rows.map((row) => ({
      id: row.id,
      styleId: row.style_id,
      entryTime: row.entry_time,
      note: row.note ?? "",
      style: row.style,
      competition: row.competition,
    }));

    const editPayload = {
      type: "entry" as const,
      competitionId,
      entries: entryList,
      date: rows[0]?.competition.date ?? item.date ?? "",
      competition: rows[0]?.competition,
    };

    onEditItem?.({
      ...item,
      editData: editPayload,
    } as CalendarItem);
  };

  return (
    <div className="fixed inset-0 z-50" data-testid={detailTestId}>
      {/* fixed inset-0 は「いま見えている画面」の大きさになるので、SP でアドレスバーが
          出入りしても中央と上限がずれない (min-h-screen = 100vh だとずれる)。 */}
      <div ref={containerRef} className="flex h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        {/* カード: 高さは中身なり、上限は画面 − 余白。超えた分は本文だけがスクロールする。
            max-h-full は採寸できない環境向けのフォールバック。 */}
        <div
          ref={cardRef}
          className={`relative flex max-h-full w-full flex-col overflow-hidden bg-white rounded-lg shadow-2xl border-2 border-gray-300 motion-reduce:transition-none ${
            animate ? "transition-[height] duration-200 ease-out" : ""
          } ${isEmpty ? "max-w-md" : "max-w-2xl"}`}
          style={fitted ? { height: fitted.height } : undefined}
        >
          {/* ヘッダー (固定) */}
          <div
            ref={headerRef}
            className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4"
          >
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {format(date, "M月d日(E)", { locale: ja })}
            </h3>
            <button
              onClick={onClose}
              className="close-button text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="modal-close-button"
              aria-label={tCommon("aria.close")}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* 本文 (ここだけスクロール)。高さの伸縮アニメーション中にスクロールバーが
              一瞬出るのを防ぐため、上限に達しているときだけスクロール可能にする。 */}
          <div
            className={`min-h-0 flex-1 overscroll-contain ${
              !fitted || fitted.capped ? "overflow-y-auto" : "overflow-hidden"
            }`}
          >
            <div ref={contentRef} className="space-y-6 px-4 py-4 sm:px-6">
              {/* 空の状態 */}
              {isEmpty && (
                <div className="text-center">
                  <div className="flex gap-3">
                    <button
                      onClick={() => onAddItem?.(date, "record")}
                      onMouseEnter={() => setIsRecordButtonHovered(true)}
                      onMouseLeave={() => setIsRecordButtonHovered(false)}
                      className="flex-1 flex flex-col items-center justify-center px-4 py-8 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300 whitespace-nowrap"
                      style={recordButtonHoverStyle}
                      data-testid="add-record-button"
                    >
                      <TrophyIcon
                        className={`h-8 w-8 mb-2 ${isCompetitionColorDefault ? "text-blue-500" : ""}`}
                        style={isCompetitionColorDefault ? undefined : { color: personalCompetitionColor }}
                      />
                      {t("dayDetail.addRecord")}
                    </button>
                    <button
                      onClick={() => onAddItem?.(date, "practice")}
                      onMouseEnter={() => setIsPracticeButtonHovered(true)}
                      onMouseLeave={() => setIsPracticeButtonHovered(false)}
                      className="flex-1 flex flex-col items-center justify-center px-4 py-8 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 whitespace-nowrap"
                      style={practiceButtonHoverStyle}
                      data-testid="add-practice-button"
                    >
                      <ClipboardDocumentListIcon
                        className={`h-8 w-8 mb-2 ${isPracticeColorDefault ? "text-green-500" : ""}`}
                        style={isPracticeColorDefault ? undefined : { color: personalPracticeColor }}
                      />
                      {t("dayDetail.addPractice")}
                    </button>
                  </div>
                </div>
              )}

              {/* 練習セクション */}
              {hasPracticeContent && (
                <div>
                  <div className="space-y-3">
                    {practiceItems.map((item) => (
                      <PracticeDetails
                        key={item.id}
                        practiceId={item.id}
                        place={item.place}
                        isTeamPractice={item.type === "team_practice"}
                        teamId={item.metadata?.team_id}
                        teamName={
                          isPracticeMetadata(item.metadata) && isTeamInfo(item.metadata.team)
                            ? item.metadata.team.name
                            : undefined
                        }
                        onEdit={() => onEditItem?.(item)}
                        onDelete={() => setShowDeleteConfirm({ id: item.id, type: item.type })}
                        onAddPracticeLog={onAddPracticeLog}
                        onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
                        onEditPracticeLog={onEditPracticeLog}
                        onDeletePracticeLog={onDeletePracticeLog}
                        onShowAttendance={
                          item.type === "team_practice" && item.metadata?.team_id
                            ? () => handleShowAttendance(item.id, "practice", item.metadata!.team_id!)
                            : undefined
                        }
                        onShowTeamRecords={
                          item.type === "team_practice" && item.metadata?.team_id
                            ? () =>
                                handleShowTeamRecords(item.metadata!.team_id!, {
                                  kind: "practice",
                                  id: item.id,
                                })
                            : undefined
                        }
                        color={getItemColor(item)}
                      />
                    ))}

                    {uniquePracticeLogItems.map((item) => {
                      // getPracticeIdFromItem で null を保証済みなので map 内で再チェック不要
                      const practiceId = getPracticeIdFromItem(item) as string;
                      const practiceLogUpdateKey = practiceLogUpdateKeyMap.get(practiceId) ?? practiceId;

                      return (
                        <PracticeDetails
                          key={item.id}
                          practiceId={practiceId}
                          place={item.place}
                          practiceLogUpdateKey={practiceLogUpdateKey}
                          isTeamPractice={
                            isPracticeMetadata(item.metadata) ? !!item.metadata.team_id : false
                          }
                          teamId={
                            isPracticeMetadata(item.metadata) ? item.metadata.team_id : undefined
                          }
                          teamName={
                            isPracticeMetadata(item.metadata) && isTeamInfo(item.metadata.team)
                              ? item.metadata.team.name
                              : undefined
                          }
                          onEdit={(images) => {
                            const practiceData = {
                              id: practiceId,
                              type: "practice" as const,
                              date: item.date || "",
                              title: item.title || t("practice.defaultTitle"),
                              place: item.place || "",
                              note: item.note || undefined,
                              metadata: isPracticeMetadata(item.metadata)
                                ? item.metadata.practice || {}
                                : {},
                              editData: { images },
                            };
                            onEditItem?.(practiceData);
                          }}
                          onDelete={() =>
                            setShowDeleteConfirm({ id: practiceId, type: "practice" as const })
                          }
                          onAddPracticeLog={onAddPracticeLog}
                          onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
                          onEditPracticeLog={onEditPracticeLog}
                          onDeletePracticeLog={onDeletePracticeLog}
                          onShowAttendance={
                            isPracticeMetadata(item.metadata) && item.metadata.team_id
                              ? () =>
                                  handleShowAttendance(practiceId, "practice", item.metadata.team_id!)
                              : undefined
                          }
                          onShowTeamRecords={
                            isPracticeMetadata(item.metadata) && item.metadata.team_id
                              ? () =>
                                  handleShowTeamRecords(item.metadata.team_id!, {
                                    kind: "practice",
                                    id: practiceId,
                                  })
                              : undefined
                          }
                          color={getItemColor(item)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 大会セクション */}
              {hasRecordContent && (
                <div>
                  <div className="space-y-3">
                    {competitionItems.map((item) => (
                      <CompetitionDetails
                        key={item.id}
                        competitionId={item.id}
                        competitionName={item.title || t("competition.defaultName")}
                        place={item.place}
                        poolType={item.metadata?.competition?.pool_type}
                        note={item.note}
                        isTeamCompetition={item.type === "team_competition"}
                        teamId={item.metadata?.team_id}
                        teamName={
                          isCompetitionMetadata(item.metadata) && isTeamInfo(item.metadata.team)
                            ? item.metadata.team.name
                            : undefined
                        }
                        onEdit={() => {
                          onEditItem?.(item);
                          onClose();
                        }}
                        onDelete={() =>
                          openCompetitionDeleteConfirm(
                            item.id,
                            item.type as "competition" | "team_competition",
                            item.type === "team_competition",
                          )
                        }
                        onAddRecord={onAddRecord}
                        onEditRecord={onEditRecord}
                        onDeleteRecord={onDeleteRecord}
                        onClose={onClose}
                        onShowAttendance={
                          item.type === "team_competition" && item.metadata?.team_id
                            ? () =>
                                handleShowAttendance(item.id, "competition", item.metadata!.team_id!)
                            : undefined
                        }
                        onShowTeamRecords={
                          item.type === "team_competition" && item.metadata?.team_id
                            ? () =>
                                handleShowTeamRecords(item.metadata!.team_id!, {
                                  kind: "competition",
                                  id: item.id,
                                })
                            : undefined
                        }
                        color={getItemColor(item)}
                      />
                    ))}

                    {entryItems
                      .filter((item) => item.metadata?.competition?.id)
                      .map((item) => {
                        const competitionId = item.metadata?.competition?.id;
                        if (!competitionId) return null;

                        return (
                          <CompetitionWithEntry
                            key={item.id}
                            entryId={item.id}
                            competitionId={competitionId}
                            competitionName={item.metadata?.competition?.title || t("competition.defaultName")}
                            place={item.place}
                            note={item.note}
                            styleId={item.metadata?.style?.id}
                            styleName={item.metadata?.style?.name_jp || ""}
                            entryTime={item.metadata?.entry_time}
                            isTeamCompetition={!!item.metadata?.team_id}
                            deletedEntryIds={deletedEntryIds}
                            onAddRecord={onAddRecord}
                            onEditCompetition={(images) => {
                              const competitionData = {
                                id: competitionId,
                                type: "competition" as const,
                                date: item.date || "",
                                title: item.metadata?.competition?.title || "",
                                place: item.place || "",
                                note: item.note || undefined,
                                metadata: {
                                  competition: {
                                    id: competitionId,
                                    title: item.metadata?.competition?.title || "",
                                    date: item.metadata?.competition?.date || item.date,
                                    end_date: item.metadata?.competition?.end_date || null,
                                    place: item.place || "",
                                    // metadata は calendar_view の JSONB 列で未型付けだが、'entry' 型行は
                                    // jsonb_build_object('competition', to_jsonb(c.*), ...) で competitions
                                    // 行全体をそのまま埋め込むため、実データには pool_type (DB上NOT NULL)
                                    // が必ず入っている。JSON型保証が無いための防御的フォールバック。
                                    pool_type: item.metadata?.competition?.pool_type || 0,
                                  },
                                },
                                editData: { images },
                              };
                              onEditItem?.(competitionData);
                            }}
                            onDeleteCompetition={() =>
                              openCompetitionDeleteConfirm(
                                competitionId,
                                "competition",
                                !!item.metadata?.team_id,
                              )
                            }
                            onEditEntry={() => handleEditEntry(item, competitionId)}
                            onDeleteEntry={(entryId) => {
                              if (!entryId) return;
                              setShowDeleteConfirm({ id: entryId, type: "entry", competitionId });
                            }}
                            onClose={onClose}
                            onShowTeamRecords={
                              item.metadata?.team_id
                                ? () =>
                                    handleShowTeamRecords(item.metadata!.team_id!, {
                                      kind: "competition",
                                      id: competitionId,
                                    })
                                : undefined
                            }
                            color={getItemColor(item)}
                          />
                        );
                      })}

                    {recordItems.map((record) => {
                      const compId = record.metadata?.competition?.id || record.id;
                      // metadata は calendar_view の JSONB 列で未型付けだが、'record' 型行は
                      // SELECT ... jsonb_build_object(..., 'pool_type', c.pool_type, ...) FROM competitions c
                      // WHERE EXISTS (records...) で c が必須の FROM 元になるため、実データには
                      // pool_type (DB上NOT NULL) が必ず入っている。JSON型保証が無いための防御的フォールバック。
                      const poolType = record.metadata?.pool_type || 0;

                      return (
                        <CompetitionDetails
                          key={compId}
                          competitionId={compId}
                          competitionName={record.title || t("competition.defaultName")}
                          place={record.place}
                          poolType={poolType}
                          note={record.note || undefined}
                          records={[record]}
                          isTeamCompetition={record.metadata?.competition?.team_id != null}
                          teamId={record.metadata?.competition?.team_id}
                          teamName={
                            record.metadata?.competition?.team_id &&
                            isRecordMetadata(record.metadata) &&
                            isTeamInfo(record.metadata.team)
                              ? record.metadata.team.name
                              : undefined
                          }
                          onEdit={(images) => {
                            const competitionData = {
                              id: compId,
                              type: "competition" as const,
                              date: record.date || "",
                              title: record.title || "",
                              place: record.place || "",
                              note: record.note || undefined,
                              metadata: {
                                competition: {
                                  id: compId,
                                  title: record.title || "",
                                  date: record.metadata?.competition?.date || record.date,
                                  end_date: record.metadata?.competition?.end_date || null,
                                  place: record.place || "",
                                  pool_type: poolType,
                                },
                              },
                              editData: { images },
                            };
                            onEditItem?.(competitionData);
                          }}
                          onDelete={() =>
                            openCompetitionDeleteConfirm(
                              compId,
                              "competition",
                              record.metadata?.competition?.team_id != null,
                            )
                          }
                          onAddRecord={onAddRecord}
                          onEditRecord={onEditRecord}
                          onDeleteRecord={onDeleteRecord}
                          onClose={onClose}
                          onShowAttendance={
                            record.metadata?.competition?.team_id
                              ? () =>
                                  handleShowAttendance(
                                    compId,
                                    "competition",
                                    record.metadata!.competition!.team_id!,
                                  )
                              : undefined
                          }
                          onShowTeamRecords={
                            record.metadata?.competition?.team_id
                              ? () =>
                                  handleShowTeamRecords(record.metadata!.competition!.team_id!, {
                                    kind: "competition",
                                    id: compId,
                                  })
                              : undefined
                          }
                          color={getItemColor(record)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* フッター (固定): 記録が多い日でも、スクロールせずに追加できる。
              ref を付けるラッパーは常に描画し、中身だけを出し分ける。 */}
          <div ref={footerRef} className="shrink-0">
            {!isEmpty && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onAddItem?.(date, "record")}
                    onMouseEnter={() => setIsRecordButtonHovered(true)}
                    onMouseLeave={() => setIsRecordButtonHovered(false)}
                    className="flex items-center justify-center whitespace-nowrap px-2 sm:px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={recordButtonHoverStyle}
                    data-testid="add-record-button"
                  >
                    <TrophyIcon
                      className={`h-5 w-5 mr-1.5 sm:mr-2 shrink-0 ${isCompetitionColorDefault ? "text-blue-500" : ""}`}
                      style={isCompetitionColorDefault ? undefined : { color: personalCompetitionColor }}
                    />
                    {t("dayDetail.addRecord")}
                  </button>
                  <button
                    onClick={() => onAddItem?.(date, "practice")}
                    onMouseEnter={() => setIsPracticeButtonHovered(true)}
                    onMouseLeave={() => setIsPracticeButtonHovered(false)}
                    className="flex items-center justify-center whitespace-nowrap px-2 sm:px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={practiceButtonHoverStyle}
                    data-testid="add-practice-button"
                  >
                    <ClipboardDocumentListIcon
                      className={`h-5 w-5 mr-1.5 sm:mr-2 shrink-0 ${isPracticeColorDefault ? "text-green-500" : ""}`}
                      style={isPracticeColorDefault ? undefined : { color: personalPracticeColor }}
                    />
                    {t("dayDetail.addPractice")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      <DeleteConfirmModal
        isOpen={!!showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(null);
          setIsFetchingRecordCount(false);
          pendingRecordCountRequestIdRef.current = null;
        }}
        extraMessage={deleteConfirmExtraMessage}
        isConfirmDisabled={isFetchingRecordCount}
      />

      {/* 出欠情報モーダル */}
      {showAttendanceModal && (
        <AttendanceModal
          isOpen={true}
          onClose={() => setShowAttendanceModal(null)}
          eventId={showAttendanceModal.eventId}
          eventType={showAttendanceModal.eventType}
          teamId={showAttendanceModal.teamId}
        />
      )}
    </div>
  );
}
