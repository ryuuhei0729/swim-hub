"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntryAPI } from "@apps/shared/api/entries";
import {
  TEAM_VIEW_QUERY_OPTIONS,
  invalidateTeamCompetitionQueries,
  teamDetailKeys,
} from "@/hooks/queries/teamDetailKeys";
import { RecordAPI } from "@apps/shared/api/records";
import { useAuth } from "@/contexts/AuthProvider";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useStyleLabel } from "@/hooks/useStyleLabel";
import { UserFacingError, toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import { isEntryTabVisible } from "@/utils/tabModalUtils";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import { resolveEntryStatus } from "@apps/shared/utils/entryStatus";
import type { EntryReturnOrigin } from "@/utils/entryReturnOrigin";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface TeamCompetitionEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
  teamId: string;
  /**
   * いま表示しているのが管理者ビューか (`TeamCompetitions.tsx` の `isAdmin` prop をそのまま渡す)。
   * 受付状況の変更・代理入力ボタンはこの値で出し分ける (表示中のビューで判定する。
   * mobile と同じ。swimhub-tasks #67)。実ロール admin でも利用者ビューなら
   * 一般メンバーと同じ「エントリーを追加」を出す。
   * 実際に出すのは、念のため DB から取ったロール (`data.isAdmin`) も admin のときだけ。
   * `handleAdminBulkEntryClick` の遷移先 origin クエリ (追加スプリント D12) にも使う。
   */
  routeIsAdmin: boolean;
  /**
   * 自分のエントリーを追加/編集する画面 (CompetitionTabModal のエントリータブ) を開く。
   * 行の編集アイコンと「エントリーを追加」ボタン (D10改訂) の両方から呼ばれる (R6)。
   * CompetitionTabModal 側が competitionId + 自分の user_id で対象大会の自分の
   * 全エントリーを再取得するため、対象の絞り込みは不要だが、
   * 編集アイコンから呼ぶ場合は `entryId` (D9) を渡すことで、その entry.id に対応する
   * 項目タブがアクティブな状態で開く。「エントリーを追加」ボタンから呼ぶ場合は
   * `entryId` を渡さず、先頭タブを開く (従来どおり)。
   */
  onOpenSelfEntry: (entryId?: string) => void;
}

/** `competitions` テーブルから直接取得する、このモーダルが必要とする最小限のフィールド */
interface TeamCompetitionRow {
  team_id: string | null;
  title: string | null;
  date: string;
  place: string | null;
  entry_status: string | null;
}

/**
 * 大会情報をチームスコープで直接取得する。
 *
 * 個人スコープの `recordApi.getCompetitions()` (`.or("user_id.eq.<自分>,user_id.is.null")`)
 * だと自分以外の管理者が作成したチーム大会が取得できず「大会が見つかりません」に
 * 誤って落ちるため、`competitions` テーブルを `id` + `team_id` で直接絞り込む
 * (`entries/_server/EntriesDataLoader.tsx` と同型)。`team_id` も条件に含めることで
 * 「別チームの大会 ID を渡された」ケースも同時に弾ける。
 */
async function fetchTeamCompetition(
  supabase: SupabaseClient,
  competitionId: string,
  teamId: string,
): Promise<TeamCompetitionRow | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("team_id, title, date, place, entry_status")
    .eq("id", competitionId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw error;
  return data as TeamCompetitionRow | null;
}

function isValidEntryStatus(
  status: string | null,
): status is "before" | "open" | "closed" {
  return status === "before" || status === "open" || status === "closed";
}

/**
 * エントリー行が現在ログイン中のユーザー自身のものかどうかを判定する純関数。
 */
export function isOwnEntryRow(
  entryUserId: string,
  currentUserId: string | null | undefined,
): boolean {
  return !!currentUserId && entryUserId === currentUserId;
}

/**
 * 自分のエントリー行に編集/削除アイコンを表示してよいかどうかを判定する純関数 (PM裁定 R1)。
 *
 * R1 の文言は「entry_status === "open" かつ大会日が過去でない」だが、web の編集導線が
 * 実際に着地する先は CompetitionTabModal のエントリータブであり、そのタブは
 * `isEntryTabVisible(date)` (未来日のみ true。今日は false) のときしか表示されない
 * (CompetitionTabModal.tsx の showEntryTab)。ここで代わりに `isCompetitionDateInPast`
 * (今日は false = 表示) を使うと、大会日が今日のときアイコンは表示されるのに、編集を
 * 押した先の CompetitionTabModal はエントリータブを非表示にして "competition" タブへ
 * 静かにフォールバックし (isEntryTabVisible(today) は false のため)、ユーザーは編集
 * フォームに到達できない「見えているのに押しても意味が無い」状態になってしまう。
 * 着地先の実際の編集可能性に一致させるため、ここでは `isEntryTabVisible` を使う。
 */
export function canEditOrDeleteEntry(
  entryStatus: string | null | undefined,
  competitionDate: string | null | undefined,
): boolean {
  return entryStatus === "open" && isEntryTabVisible(competitionDate);
}

export default function TeamCompetitionEntryModal({
  isOpen,
  onClose,
  competitionId,
  competitionTitle,
  teamId,
  routeIsAdmin,
  onOpenSelfEntry,
}: TeamCompetitionEntryModalProps) {
  const { supabase, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("teams");
  // 種目名は DB の name_jp を直接出すと全ロケールで日本語になるため、ロケールに合わせて組み立てる
  const styleLabel = useStyleLabel();
  const tCommon = useTranslations("common");
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);
  const recordApi = useMemo(() => new RecordAPI(supabase), [supabase]);
  const queryClient = useQueryClient();
  // ステータス変更・削除の失敗 (以前と同じく一覧の代わりに表示する)
  const [actionError, setActionError] = useState<string | null>(null);
  type EntryRow = {
    id: string;
    user_id: string;
    style_id: number;
    entry_time: number | null;
    note: string | null;
    users: { id: string; name: string } | null;
    styles: { id: number; name_jp: string; distance: number } | null;
  };

  type EntryByStyleData = {
    competition: {
      team_id: string;
      title: string;
      date: string;
      place: string | null;
      entry_status: "before" | "open" | "closed";
    };
    entriesByStyle: Record<
      number,
      {
        style: { id: number; name_jp: string; distance: number } | null;
        entries: EntryRow[];
      }
    >;
    isAdmin: boolean;
    totalEntries: number;
  };
  const [updatingStatus, setUpdatingStatus] = useState(false);
  // 受付状況の変更の確認待ち (確認してから保存する。mobile と同じ。swimhub-tasks #68)
  const [pendingStatus, setPendingStatus] = useState<"before" | "open" | "closed" | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<EntryRow | null>(null);
  const [deletingEntry, setDeletingEntry] = useState(false);

  // エントリー一覧。開くたびに再取得するが (staleTime 0)、前回開いたときの内容があれば先に表示する。
  // 閲覧者のロール (isAdmin) を含むので userId もキーに入れる
  const entriesQuery = useQuery({
    queryKey: teamDetailKeys.competitionEntries(teamId, competitionId, user?.id ?? null),
    queryFn: async (): Promise<EntryByStyleData> => {
      // 1) 競技会情報取得（team_id + id で直接絞り込み。個人スコープの getCompetitions() だと
      // 自分以外の管理者が作成したチーム大会を取得できないため使わない）
      const competition = await fetchTeamCompetition(supabase, competitionId, teamId);
      if (!competition) throw new UserFacingError(t("competitionEntryModal.competitionNotFound"));
      // fetchTeamCompetition が team_id で絞るため現状は到達不能。型ナローイングと将来の絞り込み変更に備えた保険として残す。
      if (!competition.team_id) throw new UserFacingError(t("competitionEntryModal.notTeamCompetition"));

      // 2) 現在ユーザーのロール取得
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new UserFacingError(t("competitionEntryModal.authRequired"));
      const { data: membership, error: membershipError } = await supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", competition.team_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();
      if (membershipError) throw membershipError;

      // 3) エントリー一覧取得（EntryAPIを使用）
      const entries = await entryApi.getEntriesByCompetition(competitionId);

      // 4) 種目ごとにグルーピング
      const entriesByStyle = entries.reduce(
        (acc: Record<number, { style: EntryRow["styles"]; entries: EntryRow[] }>, entry) => {
          const styleId = entry.style_id;
          const style = entry.style
            ? {
                id: entry.style.id,
                name_jp: entry.style.name_jp,
                distance: entry.style.distance,
              }
            : null;
          const user = entry.user
            ? {
                id: entry.user.id,
                name: entry.user.name || t("competitionEntryModal.unknownUser"),
              }
            : null;
          if (!acc[styleId]) acc[styleId] = { style: style, entries: [] };
          acc[styleId].entries.push({
            id: entry.id,
            user_id: entry.user_id,
            style_id: entry.style_id,
            entry_time: entry.entry_time,
            note: entry.note,
            users: user,
            styles: style,
          });
          return acc;
        },
        {} as Record<number, { style: EntryRow["styles"]; entries: EntryRow[] }>,
      );

      return {
        competition: {
          team_id: competition.team_id || "",
          // 表示上のタイトルは props の competitionTitle を使う (キャッシュの中身を props に依存させない)
          title: competition.title || "",
          date: competition.date,
          place: competition.place,
          entry_status: isValidEntryStatus(competition.entry_status)
            ? competition.entry_status
            : "before",
        },
        isAdmin: membership?.role === "admin",
        entriesByStyle,
        totalEntries: entries.length,
      };
    },
    enabled: isOpen,
    ...TEAM_VIEW_QUERY_OPTIONS,
  });
  const data = entriesQuery.data ?? null;
  // 管理者向けの操作は「管理者ビューで開いている」かつ「実際に管理者」のときだけ出す
  const showAdminControls = routeIsAdmin && (data?.isAdmin ?? false);
  // 大会日が過去なら DB の値に関わらず締切として扱う (表示だけ。DB は書き換えない)
  const effectiveEntryStatus = data
    ? resolveEntryStatus(data.competition.date, data.competition.entry_status)
    : "before";
  const isPastCompetition = data ? isCompetitionDateInPast(data.competition.date) : false;
  // 読み込み表示 / 取得エラーは表示できる内容が無いときだけ出す
  const loading = !data && entriesQuery.isPending;
  const fetchError = entriesQuery.error;
  const error =
    actionError ??
    (!data && fetchError
      ? toUserFacingMessage(fetchError, t("competitionEntryModal.fetchFailed"))
      : null);
  useEffect(() => {
    if (fetchError) console.error("エントリー情報の取得に失敗:", fetchError);
  }, [fetchError]);

  // 保存・削除の後に再取得する。カード一覧 (大会タブ) のエントリー数・ステータスも変わるので一緒に落とす
  const loadEntries = useCallback(async () => {
    setActionError(null);
    await invalidateTeamCompetitionQueries(queryClient, teamId, competitionId);
  }, [queryClient, teamId, competitionId]);

  // セレクトで選んだら確認ダイアログを出す (同じ値なら何もしない)
  const handleStatusSelect = (newStatus: "before" | "open" | "closed") => {
    if (data && data.competition.entry_status === newStatus) return;
    setPendingStatus(newStatus);
  };

  const handleConfirmStatusChange = () => {
    const next = pendingStatus;
    setPendingStatus(null);
    if (next) void handleStatusChange(next);
  };

  const handleStatusChange = async (newStatus: "before" | "open" | "closed") => {
    // 現在のステータスと同じ場合は何もしない
    if (data && data.competition.entry_status === newStatus) {
      return;
    }
    // 過去の大会は変更できない (mobile と同じ)
    if (isPastCompetition) return;

    try {
      setUpdatingStatus(true);
      // 管理者チェックと更新（team_id + id で直接絞り込み。理由は loadEntries と同じ）
      const competition = await fetchTeamCompetition(supabase, competitionId, teamId);
      if (!competition) throw new UserFacingError(t("competitionEntryModal.competitionNotFound"));
      // loadEntries と同じ理由で到達不能だが保険として残す
      if (!competition.team_id) throw new UserFacingError(t("competitionEntryModal.notTeamCompetition"));

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new UserFacingError(t("competitionEntryModal.authRequired"));
      const { data: membership, error: membershipError } = await supabase
        .from("team_memberships")
        .select("role")
        .eq("team_id", competition.team_id)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single();
      if (membershipError) throw membershipError;
      if (membership?.role !== "admin") throw new UserFacingError(t("competitionEntryModal.adminRequired"));

      await recordApi.updateCompetition(competitionId, { entry_status: newStatus });
      await loadEntries(); // 再読み込み
    } catch (err) {
      console.error("ステータス変更に失敗:", err);
      setActionError(toUserFacingMessage(err, t("competitionEntryModal.statusChangeFailed")));
    } finally {
      setUpdatingStatus(false);
    }
  };

  // 自分のエントリー行の削除確認を開く (要件A / R2: 行単位のみ、他選手のレグ行には触れない)
  const handleRequestDeleteEntry = (entry: EntryRow) => {
    setPendingDeleteEntry(entry);
  };

  const handleCancelDeleteEntry = () => {
    if (deletingEntry) return;
    setPendingDeleteEntry(null);
  };

  const handleConfirmDeleteEntry = async () => {
    if (!pendingDeleteEntry || deletingEntry) return;
    setDeletingEntry(true);
    try {
      await entryApi.deleteEntry(pendingDeleteEntry.id);
      setPendingDeleteEntry(null);
      // SC9: 失敗時は一覧を書き換えず(実データのまま)エラーのみ表示する。
      // 成功時のみ再取得し、削除した行だけが実際に消えたことを DB 実データで確認する。
      await loadEntries();
    } catch (err) {
      console.error("エントリーの削除に失敗:", err);
      setActionError(toUserFacingMessage(err, t("competitionEntryModal.deleteFailed")));
      setPendingDeleteEntry(null);
    } finally {
      setDeletingEntry(false);
    }
  };

  // admin: エントリー代理一括入力ページへ遷移 (要件B後半 / D4 でカードから移設)。
  // 追加スプリント D12: 往路 (routeIsAdmin) を enum の origin クエリで運ぶ。
  // クエリの値をパス文字列に直接埋め込まない (R11) — ここで埋め込むのは
  // "member" | "admin" の2値のみに絞られた EntryReturnOrigin 型の値であり、
  // 遷移先の entries/page.tsx がこれを再度 enum に正規化してから使う。
  const handleAdminBulkEntryClick = () => {
    const origin: EntryReturnOrigin = routeIsAdmin ? "admin" : "member";
    router.push(`/teams/${teamId}/competitions/${competitionId}/entries?origin=${origin}`);
  };

  const getStatusLabel = (status: "before" | "open" | "closed") => {
    switch (status) {
      case "before":
        return t("competitions.entryStatus.before");
      case "open":
        return t("competitions.entryStatus.open");
      case "closed":
        return t("competitions.entryStatus.closed");
    }
  };

  const getStatusColor = (status: "before" | "open" | "closed") => {
    switch (status) {
      case "before":
        return "bg-gray-100 text-gray-800";
      case "open":
        return "bg-green-100 text-green-800";
      case "closed":
        return "bg-red-100 text-red-800";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto" data-testid="team-competition-entry-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-black/40 transition-opacity z-10" onClick={onClose}></div>

        <div
          className="relative z-20 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full"
          data-testid="team-competition-entry-dialog"
        >
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {competitionTitle}{t("competitionEntryModal.titleSuffix")}
                </h3>
                {data && (
                  <p className="text-sm text-gray-500 mt-1">
                    {t("competitionEntryModal.totalEntries", { count: data.totalEntries })}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                data-testid="team-competition-entry-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {loading && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">{t("competitionEntryModal.loading")}</p>
              </div>
            )}

            {error && (
              <div
                className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4"
                data-testid="team-competition-entry-error"
              >
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* エントリーステータス管理 */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label
                        htmlFor="entry-status"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        {t("competitionEntryModal.entryStatusLabel")}
                      </label>
                      {/* 過去の大会は締切として表示するだけで変更できない (mobile と同じ) */}
                      {showAdminControls && !isPastCompetition ? (
                        <select
                          id="entry-status"
                          value={data.competition.entry_status}
                          onChange={(e) =>
                            handleStatusSelect(e.target.value as "before" | "open" | "closed")
                          }
                          disabled={updatingStatus}
                          className="block w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="team-competition-entry-status-select"
                        >
                          <option value="before">{t("competitions.entryStatus.before")}</option>
                          <option value="open">{t("competitions.entryStatus.open")}</option>
                          <option value="closed">{t("competitions.entryStatus.closed")}</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(effectiveEntryStatus)}`}
                          data-testid="team-competition-entry-status-badge"
                        >
                          {getStatusLabel(effectiveEntryStatus)}
                        </span>
                      )}
                    </div>

                    {/* admin向けの現在値バッジ（select は選択肢一覧を表示するだけで色分けされないため併記する。
                        非adminは左側の span で既にステータスを表示済みのため、ここでは出さない） */}
                    {showAdminControls && !isPastCompetition && (
                      <div className="ml-4">
                        <span
                          className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(data.competition.entry_status)}`}
                        >
                          {getStatusLabel(data.competition.entry_status)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* セルフエントリー導線 (要件B後半 / D6): 利用者ビュー「エントリーを追加」(D10改訂) /
                    管理者ビュー「エントリーを代理入力」。表示中のビューで出し分ける
                    (実ロール admin でも利用者ビューなら「エントリーを追加」。mobile と同じ。swimhub-tasks #67)。
                    代理入力ボタンは mobile (TeamCompetitionEntryModal.tsx) と同じく受付中 (open)
                    のときだけ表示する (swimhub-tasks #60)。
                    利用者ビューのボタンは着地先 (CompetitionTabModal のエントリータブ) が
                    実際に編集可能な状態のときだけ表示する (R1 と同じ canEditOrDeleteEntry)。 */}
                <div className="mb-6">
                  {showAdminControls ? (
                    effectiveEntryStatus === "open" && (
                      <button
                        type="button"
                        onClick={handleAdminBulkEntryClick}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                        data-testid="team-competition-entry-bulk-button"
                      >
                        <ClipboardDocumentCheckIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        {t("competitionEntryModal.adminBulkEntryButton")}
                      </button>
                    )
                  ) : (
                    canEditOrDeleteEntry(effectiveEntryStatus, data.competition.date) && (
                      <button
                        type="button"
                        onClick={() => onOpenSelfEntry()}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                        data-testid="team-competition-entry-self-button"
                      >
                        <PlusIcon className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        {t("competitionEntryModal.selfEntryButton")}
                      </button>
                    )
                  )}
                </div>

                {/* 種目別エントリー一覧 */}
                <div className="space-y-6">
                  {Object.keys(data.entriesByStyle).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>{t("competitionEntryModal.emptyNoEntry")}</p>
                      {effectiveEntryStatus === "open" && (
                        <p className="mt-2 text-sm">
                          {t("competitionEntryModal.emptyOpenHint")}
                        </p>
                      )}
                    </div>
                  )}

                  {Object.entries(data.entriesByStyle).map(([styleId, styleData]) => (
                    <div
                      key={styleId}
                      className="border border-gray-200 rounded-lg overflow-hidden"
                      data-testid={`team-competition-entry-style-${styleId}`}
                    >
                      {/* 種目ヘッダー (要件C / D8: 件数に単位「件」を付与) */}
                      <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
                        <h4 className="font-semibold text-blue-900">
                          {t("competitionEntryModal.styleGroupHeader", {
                            style: styleLabel(styleData.style) ?? t("competitionEntryModal.unknownStyle"),
                            count: styleData.entries.length,
                          })}
                        </h4>
                      </div>

                      {/* エントリー一覧 */}
                      <div className="divide-y divide-gray-200">
                        {styleData.entries.map((entry, index: number) => {
                          const entryStyleName =
                            styleLabel(styleData.style) ?? t("competitionEntryModal.unknownStyle");
                          // 要件A / SC3・SC8: 自分の行のみ（管理者自身の行も含む）に編集/削除を出す
                          const canModify =
                            isOwnEntryRow(entry.user_id, user?.id) &&
                            canEditOrDeleteEntry(effectiveEntryStatus, data.competition.date);
                          return (
                            <div key={entry.id} className="px-4 py-3 hover:bg-gray-50">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">
                                    {index + 1}. {entry.users?.name ?? t("competitionEntryModal.unknownUser")}
                                  </p>
                                  {entry.entry_time && (
                                    <p className="text-sm text-gray-600 mt-1">
                                      {t("competitionEntryModal.entryTimeLabel")}{" "}
                                      <span className="font-mono font-semibold">
                                        {formatTimeBest(entry.entry_time)}
                                      </span>
                                    </p>
                                  )}
                                  {entry.note && (
                                    <p className="text-sm text-gray-500 mt-1">{entry.note}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {canModify && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => onOpenSelfEntry(entry.id)}
                                        className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                                        aria-label={t("competitionEntryModal.editEntryAria", {
                                          style: entryStyleName,
                                        })}
                                        data-testid={`team-competition-entry-edit-${entry.id}`}
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRequestDeleteEntry(entry)}
                                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                                        aria-label={t("competitionEntryModal.deleteEntryAria", {
                                          style: entryStyleName,
                                        })}
                                        data-testid={`team-competition-entry-delete-${entry.id}`}
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm"
              data-testid="team-competition-entry-close-action"
            >
              {t("competitionEntryModal.close")}
            </button>
          </div>
        </div>
      </div>

      {/* 受付状況の変更の確認 (mobile のカード上プルダウンと同じ文言) */}
      <ConfirmDialog
        isOpen={pendingStatus !== null}
        onConfirm={handleConfirmStatusChange}
        onCancel={() => setPendingStatus(null)}
        title={t("mobile.teamCompetitionEntryModal.confirmTitle")}
        message={
          pendingStatus
            ? t(
                pendingStatus === "open"
                  ? "mobile.teamCompetitionEntryModal.confirmOpen"
                  : pendingStatus === "closed"
                    ? "mobile.teamCompetitionEntryModal.confirmClosed"
                    : "mobile.teamCompetitionEntryModal.confirmBefore",
              )
            : ""
        }
        confirmLabel={tCommon("ok")}
        variant="warning"
      />

      {/* 削除確認ダイアログ (要件A) */}
      <ConfirmDialog
        isOpen={!!pendingDeleteEntry}
        onConfirm={() => void handleConfirmDeleteEntry()}
        onCancel={handleCancelDeleteEntry}
        title={t("competitionEntryModal.deleteConfirmTitle")}
        message={t("competitionEntryModal.deleteConfirmMessage")}
        confirmLabel={tCommon("delete")}
        variant="danger"
      />
    </div>
  );
}
