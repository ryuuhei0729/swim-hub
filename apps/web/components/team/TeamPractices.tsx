"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useRef,
  Suspense,
} from "react";
import { useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthProvider";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  CalendarDaysIcon,
  MapPinIcon,
  ClockIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import type { PracticeImageData } from "@/components/forms/PracticeBasicForm";
import { TeamPracticesAPI } from "@apps/shared/api/teams/practices";
import { PracticeAPI } from "@apps/shared/api/practices";
import Pagination from "@/components/ui/Pagination";
import DeleteConfirmModal from "@/components/ui/DeleteConfirmModal";
import TeamPracticeDetailModal from "./TeamPracticeDetailModal";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";
import type { EditingData } from "@/stores/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  TEAM_PRACTICES_PAGE_SIZE,
  useTeamPracticesPageQuery,
  type TeamPractice,
} from "@/hooks/queries/teamPracticeQueries";
import { invalidateTeamPracticeQueries } from "@/hooks/queries/teamDetailKeys";

const PracticeBasicForm = dynamic(
  () => import("@/components/forms/PracticeBasicForm"),
  {
    ssr: false,
  },
);

// 練習ログタブモーダル(自己ログ導線)。重量コンポーネントなので開いた時にのみ import する
const PracticeTabModal = dynamic(
  () => import("@/components/forms/PracticeTabModal"),
  {
    ssr: false,
  },
);

export type { TeamPractice } from "@/hooks/queries/teamPracticeQueries";

export interface TeamPracticesProps {
  teamId: string;
  isAdmin?: boolean;
}

export default function TeamPractices({
  teamId,
  isAdmin = false,
}: TeamPracticesProps) {
  const { supabase, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("teams");
  const queryClient = useQueryClient();
  // 保存・削除の失敗など、一覧の取得以外で出すエラー (以前と同じく一覧の代わりに表示する)
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  // タイム一覧モーダルで開いている練習 (null なら閉じている)
  const [selectedPractice, setSelectedPractice] = useState<{
    id: string;
    heading: string;
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = TEAM_PRACTICES_PAGE_SIZE;

  // チームの練習記録 (ページ単位)。タブを開くたびに再取得するが (staleTime 0)、
  // 再取得中は前回の内容をそのまま表示する
  const practicesQuery = useTeamPracticesPageQuery(supabase, teamId, currentPage, pageSize);
  const practices = practicesQuery.data?.practices ?? [];
  const totalCount = practicesQuery.data?.totalCount ?? 0;
  // スケルトン / 取得エラーは「表示できるデータが1件も無い」ときだけ出す
  const loading = practicesQuery.isPending;
  const displayError =
    error ?? (practicesQuery.isError && !practicesQuery.data ? t("practices.error") : null);
  const fetchError = practicesQuery.error;
  useEffect(() => {
    if (fetchError) console.error("チーム練習情報の取得に失敗:", fetchError);
  }, [fetchError]);

  const {
    isBasicFormOpen,
    selectedDate,
    editingData,
    isLoading: formLoading,
    openBasicForm,
    closeBasicForm,
    setLoading: setFormLoading,
    isOpen: isTabModalOpen,
    activeTab: tabActiveTab,
    editingPracticeId,
    availableTags,
    setAvailableTags,
    setEditingPracticeId,
    openTabModal,
    closeTabModal,
    closeAll: closePracticeStoreAll,
  } = usePracticeStore();

  // usePracticeStore は Dashboard/practice/competition/team の各画面で共有される
  // module-level singleton。マウント時・アンマウント時にタブモーダル状態を必ず閉じておかないと、
  // 他画面で開いたまま遷移してきた場合に isOpen=true が残り、このページで意図せず
  // PracticeTabModal が開いてしまう(逆方向の状態リークも防ぐ)。
  useLayoutEffect(() => {
    closePracticeStoreAll();
    return () => {
      closePracticeStoreAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 練習一覧 (全ページ)・出欠の月別サマリ・(指定時は) その練習の詳細モーダルを最新化する。
  // 保存・削除の直後に呼び、保存前の内容が残らないよう再取得の完了まで待つ。
  // 表示していないページ・閉じている詳細モーダルのキャッシュは捨てるので、保存後に
  // 1 ページ目へ戻したり詳細を開き直したりしても保存前の内容は出ない
  // (refreshQueriesAfterWrite の docstring 参照)
  const loadTeamPractices = useCallback(
    async (practiceId?: string) => {
      await invalidateTeamPracticeQueries(queryClient, teamId, practiceId);
    },
    [queryClient, teamId],
  );

  const handleAddPractice = () => {
    openBasicForm(new Date());
  };

  // 管理者向け: 既存の練習記録を編集(PracticeBasicForm を editData 付きで開く)
  const handleEditPractice = (e: React.MouseEvent, practice: TeamPractice) => {
    e.stopPropagation();
    openBasicForm(new Date(practice.date), {
      id: practice.id,
      type: "practice",
      date: practice.date,
      title: practice.title || "",
      place: practice.place || "",
      note: practice.note || "",
    } as EditingData);
  };

  const handlePracticeBasicSubmit = async (
    basicData: { date: string; title: string; place: string; note: string },
    _imageData?: PracticeImageData,
    _continueToNext?: boolean,
  ) => {
    // ユーザーがログインしていない場合はエラーを表示して早期リターン
    if (!user) {
      setError(t("practiceForm.authRequired"));
      closeBasicForm();
      return;
    }

    setFormLoading(true);
    try {
      const api = new TeamPracticesAPI(supabase);

      if (editingData?.id) {
        await api.update(editingData.id, {
          date: basicData.date,
          title: basicData.title || null,
          place: basicData.place || null,
          note: basicData.note || null,
        });
      } else {
        await api.create({
          user_id: user.id,
          team_id: teamId,
          date: basicData.date,
          title: basicData.title || null,
          place: basicData.place || null,
          note: basicData.note || null,
        });
      }

      closeBasicForm();
      await loadTeamPractices(editingData?.id);
      setCurrentPage(1);
    } catch (err) {
      console.error("練習の保存に失敗:", err);
      setError(
        editingData?.id
          ? t("practiceForm.updateFailed")
          : t("practiceForm.createFailed"),
      );
    } finally {
      setFormLoading(false);
    }
  };

  // 管理者向け: 削除確認モーダルを開く
  const handleRequestDelete = (e: React.MouseEvent, practiceId: string) => {
    e.stopPropagation();
    setPendingDeleteId(practiceId);
  };

  const handleCancelDelete = () => {
    setPendingDeleteId(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || deleting) return;
    setDeleting(true);
    try {
      const api = new TeamPracticesAPI(supabase);
      await api.remove(pendingDeleteId);
      setPendingDeleteId(null);
      await loadTeamPractices(pendingDeleteId);
    } catch (err) {
      console.error("練習の削除に失敗:", err);
      setError(t("practiceForm.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  // 一般メンバー向け: 自分のログを追加(PracticeTabModal の practiceLog タブを開く)
  const handleOpenSelfLog = () => {
    openTabModal(new Date(), undefined, "practiceLog");
    // タグ選択肢を非同期取得(モーダルは即座に開く。失敗しても致命的ではない)
    (async () => {
      try {
        const practiceAPI = new PracticeAPI(supabase);
        const tags = await practiceAPI.getPracticeTags();
        setAvailableTags(tags);
      } catch (err) {
        console.error("練習タグ取得エラー:", err);
      }
    })();
  };

  // 自分のログを保存した練習の ID。usePracticeTabSave の onSaved は引数を持たないので、
  // 作成 (createPractice) / 既存練習への再送信 (onSave の editingPracticeId) の時点で控えておき、
  // 保存後にその練習の詳細モーダルのキャッシュも落とす (保存前のログを表示しないため)
  const selfLogPracticeIdRef = useRef<string | null>(null);

  // 自分のログを追加した後、チームの練習一覧とその練習の詳細を再読込する
  const handleSelfLogSaved = useCallback(() => {
    const practiceId = selfLogPracticeIdRef.current ?? undefined;
    selfLogPracticeIdRef.current = null;
    void loadTeamPractices(practiceId);
  }, [loadTeamPractices]);

  const practiceApiForLog = new PracticeAPI(supabase);

  const handleSelfLogTabSave = usePracticeTabSave({
    supabase,
    user,
    createPractice: async (practice) => {
      const api = new TeamPracticesAPI(supabase);
      const created = await api.create({
        ...practice,
        user_id: user!.id,
        team_id: teamId,
      });
      selfLogPracticeIdRef.current = created.id;
      return created;
    },
    updatePractice: async (id, updates) => {
      const api = new TeamPracticesAPI(supabase);
      return await api.update(id, updates);
    },
    // 注: 生の PracticeAPI 呼び出しのため skipMilestoneUpdate 引数は無視される
    // (判定を持たない raw API のため無害)。タイムの一括保存とマイルストーン判定は
    // usePracticeTabSave 内部で一本化されている。従来このセルフログ追加
    // フローには判定が無かったが、共通化の結果として他2経路 (PracticeClient/
    // dashboard) と同様に判定されるようになった (意図した副次効果)。
    createPracticeLog: async (log) => practiceApiForLog.createPracticeLog(log),
    updatePracticeLog: async (id, updates) => practiceApiForLog.updatePracticeLog(id, updates),
    deletePracticeLog: async (id) => practiceApiForLog.deletePracticeLog(id),
    setPracticeLoading: setFormLoading,
    setEditingPracticeId,
    closePracticeTabModal: closeTabModal,
    onSaved: handleSelfLogSaved,
  });

  // 既存の練習への保存 (子の保存に失敗したあとの再送信) でも対象の練習 ID を控える
  const handleSelfLogSave = async (
    params: Parameters<typeof handleSelfLogTabSave>[0],
  ) => {
    if (params.editingPracticeId) {
      selfLogPracticeIdRef.current = params.editingPracticeId;
    }
    return handleSelfLogTabSave(params);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // 新しいページのクエリは useTeamPracticesPageQuery がキーの変化で取得する
  };

  // 管理者向け: 練習ログの代理入力ページへ遷移 (カードの「記録代理入力」ボタン)
  const handleOpenLogInput = (practiceId: string) => {
    if (isAdmin) {
      router.push(`/teams-admin/${teamId}/practices/${practiceId}/logs`);
    }
  };

  // メンバー全員のタイム一覧モーダルを開く (admin/非admin 共通)
  const handleOpenDetail = (practice: TeamPractice, practiceDate: string) => {
    setSelectedPractice({
      id: practice.id,
      heading: practice.title ? `${practiceDate} ${practice.title}` : practiceDate,
    });
  };

  // ヘッダーのアクションボタン(自分のログ追加・管理者向け追加)はデータ読み込み中でも
  // 即座に操作できるよう、読み込み/エラー状態のゲートより外側で常に描画する。
  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6 gap-2">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("practices.title", { count: practices.length })}
          </h2>
          <div className="flex items-center gap-2">
            {/* 一般メンバー含む全員向け: 自分のログを追加 */}
            <button
              onClick={handleOpenSelfLog}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-1 sm:mr-2" />
              {t("practices.selfLogButton")}
            </button>
            {isAdmin && (
              <button
                onClick={handleAddPractice}
                className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PlusIcon className="h-5 w-5 mr-1 sm:mr-2" />
                {t("practices.addButton")}
              </button>
            )}
          </div>
        </div>

        {/* 練習記録一覧 */}
        {loading ? (
          <div className="animate-pulse">
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          </div>
        ) : displayError ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{displayError}</p>
            <button
              onClick={() => {
                setError(null);
                void practicesQuery.refetch();
                router.refresh();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {t("practices.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {practices.map((practice) => {
              const parsedDate = parseISO(practice.date);
              const practiceDate = isValid(parsedDate)
                ? format(parsedDate, "M月d日(E)", { locale: ja })
                : "-";
              const createdAt = new Date(practice.createdAt);
              const createdAtLabel = isValid(createdAt) ? format(createdAt, "M/d HH:mm") : "-";
              const hasLogs =
                practice.practiceLogs && practice.practiceLogs.length > 0;
              // 大会カード (TeamCompetitions) と同じく、記録があればカード全体を押して
              // メンバー全員のタイム一覧を開く (admin/非admin 共通)。
              // admin のログ代理入力は「記録代理入力」ボタンに分ける
              const canViewTimes = !!hasLogs;
              const openTimes = () => handleOpenDetail(practice, practiceDate);

              return (
                <div
                  key={practice.id}
                  onClick={canViewTimes ? openTimes : undefined}
                  onKeyDown={(e) => {
                    if (canViewTimes && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      openTimes();
                    }
                  }}
                  tabIndex={canViewTimes ? 0 : undefined}
                  role={canViewTimes ? "button" : undefined}
                  aria-label={
                    canViewTimes
                      ? t("practices.card.viewTimesAriaLabel", { date: practiceDate })
                      : undefined
                  }
                  data-testid="team-practice-card"
                  className={`w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 ${
                    canViewTimes
                      ? "cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      : "cursor-default"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                        <span className="text-lg font-medium text-gray-900">
                          {practiceDate}
                        </span>
                        {isAdmin && (
                          <span className="text-sm text-gray-500">
                            by{" "}
                            {practice.users?.name ||
                              practice.createdByUser?.name ||
                              "Unknown"}
                          </span>
                        )}
                      </div>

                      {practice.title && (
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {practice.title}
                          </span>
                        </div>
                      )}

                      {practice.place && (
                        <div className="flex items-center space-x-2 mb-1">
                          <MapPinIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {practice.place}
                          </span>
                        </div>
                      )}

                      {practice.note && (
                        <p className="text-sm text-gray-600 mb-2">
                          {practice.note}
                        </p>
                      )}

                      {hasLogs ? (
                        <div className="flex items-center space-x-2">
                          <ClockIcon className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600 font-medium">
                            {t("practices.card.logsCount", {
                              count: practice.practiceLogs!.length,
                            })}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <ClockIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {t("practices.card.noLogsLabel")}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xs text-gray-500">{createdAtLabel}</p>
                      {isAdmin && (
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenLogInput(practice.id);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid="team-practice-log-input-button"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5 mr-1" />
                            {t("practices.card.recordBulkButton")}
                          </button>
                          <button
                            onClick={(e) => handleEditPractice(e, practice)}
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid="team-practice-edit-button"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            aria-label={t("practices.card.editButton")}
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5 mr-1" />
                            {t("practices.card.editButton")}
                          </button>
                          <button
                            onClick={(e) => handleRequestDelete(e, practice.id)}
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid="team-practice-delete-button"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                            aria-label={t("practices.card.deleteButton")}
                          >
                            <TrashIcon className="h-3.5 w-3.5 mr-1" />
                            {t("practices.card.deleteButton")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {practices.length === 0 && (
              <div className="text-center py-8">
                <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">{t("practices.empty")}</p>
                {isAdmin && (
                  <button
                    onClick={handleAddPractice}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    {t("practices.addButton")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ページング */}
        {totalCount > 0 && (
          <div className="mt-4 pt-4 px-4 sm:px-6 pb-6 border-t border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / pageSize)}
              totalItems={totalCount}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* チーム練習記録作成・編集モーダル */}
      <Suspense fallback={null}>
        <PracticeBasicForm
          isOpen={isBasicFormOpen}
          onClose={closeBasicForm}
          onSubmit={handlePracticeBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={
            editingData
              ? {
                  date: (editingData as { date?: string }).date,
                  title:
                    (editingData as { title?: string | null }).title ?? null,
                  place: (editingData as { place?: string }).place,
                  note: (editingData as { note?: string }).note,
                }
              : undefined
          }
          isLoading={formLoading}
          teamMode={true}
        />
      </Suspense>

      {/* 自分のログを追加(練習ログタブモーダル)。重量コンポーネントなので開いた時のみ import する */}
      {isTabModalOpen && (
        <Suspense fallback={null}>
          <PracticeTabModal
            isOpen={isTabModalOpen}
            onClose={closeTabModal}
            onSave={handleSelfLogSave}
            selectedDate={selectedDate || new Date()}
            editingData={editingPracticeId ? editingData : null}
            editingPracticeId={editingPracticeId}
            availableTags={availableTags}
            setAvailableTags={setAvailableTags}
            isLoading={formLoading}
            initialTab={tabActiveTab}
          />
        </Suspense>
      )}

      {/* 削除確認モーダル（管理者のみ） */}
      <DeleteConfirmModal
        isOpen={!!pendingDeleteId}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* メンバー全員のタイム一覧モーダル（admin/非admin 共通） */}
      {selectedPractice && (
        <TeamPracticeDetailModal
          isOpen
          onClose={() => setSelectedPractice(null)}
          practiceId={selectedPractice.id}
          heading={selectedPractice.heading}
        />
      )}
    </>
  );
}
