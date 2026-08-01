"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
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
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
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

// Supabase から返されるスネークケースの型
// Supabaseのリレーションは配列または単一オブジェクトで返る可能性がある
interface PracticeRecord {
  id: string;
  user_id: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  users?: { name: string } | { name: string }[];
  created_by_user?: { name: string } | { name: string }[];
  practice_logs?: {
    id: string;
    style: string;
    distance: number;
    practice_times?: {
      time: number;
    }[];
  }[];
}

// UI で使用するキャメルケースの型
export interface TeamPractice {
  id: string;
  userId: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  users?: {
    name: string;
  };
  createdByUser?: {
    name: string;
  };
  practiceLogs?: {
    id: string;
    style: string;
    distance: number;
    practiceTimes?: {
      time: number;
    }[];
  }[];
}

// ヘルパー: 配列または単一オブジェクトを単一オブジェクトに正規化
function normalizeUser(
  user: { name: string } | { name: string }[] | undefined,
): { name: string } | undefined {
  if (!user) return undefined;
  return Array.isArray(user) ? user[0] : user;
}

// スネークケース → キャメルケース変換関数
function mapPracticeRecordToTeamPractice(record: PracticeRecord): TeamPractice {
  return {
    id: record.id,
    userId: record.user_id,
    date: record.date,
    title: record.title,
    place: record.place,
    note: record.note,
    createdAt: record.created_at,
    createdBy: record.created_by,
    users: normalizeUser(record.users),
    createdByUser: normalizeUser(record.created_by_user),
    practiceLogs: record.practice_logs?.map((log) => ({
      id: log.id,
      style: log.style,
      distance: log.distance,
      practiceTimes: log.practice_times?.map((pt) => ({
        time: pt.time,
      })),
    })),
  };
}

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
  const [practices, setPractices] = useState<TeamPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 20;

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

  // チームの練習記録を取得（関数として抽出）
  const loadTeamPractices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (currentPage - 1) * pageSize;

      // 総件数とデータを並列取得（パフォーマンス最適化）
      const [countResult, practicesResult] = await Promise.all([
        // 総件数を取得
        supabase
          .from("practices")
          .select("*", { count: "exact", head: true })
          .eq("team_id", teamId),
        // チームIDが設定された練習記録を取得
        supabase
          .from("practices")
          .select(
            `
            id,
            user_id,
            date,
            title,
            place,
            note,
            created_at,
            created_by,
            users!practices_user_id_fkey (
              name
            ),
            created_by_user:users!practices_created_by_fkey (
              name
            ),
            practice_logs (
              id,
              style,
              distance,
              practice_times (time)
            )
          `,
          )
          .eq("team_id", teamId)
          .order("date", { ascending: false })
          .range(offset, offset + pageSize - 1),
      ]);

      if (countResult.error) throw countResult.error;
      if (practicesResult.error) throw practicesResult.error;

      setTotalCount(countResult.count || 0);
      const mappedPractices = (practicesResult.data || []).map((record) =>
        mapPracticeRecordToTeamPractice(record as PracticeRecord),
      );
      setPractices(mappedPractices);
    } catch (err) {
      console.error("チーム練習情報の取得に失敗:", err);
      setError(t("practices.error"));
    } finally {
      setLoading(false);
    }
  }, [teamId, supabase, currentPage, pageSize, t]);

  // 初回読み込みとページ変更時の読み込み
  useEffect(() => {
    loadTeamPractices();
  }, [loadTeamPractices]);

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
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        await loadTeamPractices();
      }
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
      await loadTeamPractices();
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

  // 自分のログを追加した後、チームの練習一覧を再読込する
  const handleSelfLogSaved = useCallback(() => {
    loadTeamPractices();
  }, [loadTeamPractices]);

  const practiceApiForLog = new PracticeAPI(supabase);

  const handleSelfLogTabSave = usePracticeTabSave({
    supabase,
    user,
    createPractice: async (practice) => {
      const api = new TeamPracticesAPI(supabase);
      return await api.create({
        ...practice,
        user_id: user!.id,
        team_id: teamId,
      });
    },
    updatePractice: async (id, updates) => {
      const api = new TeamPracticesAPI(supabase);
      return await api.update(id, updates);
    },
    createPracticeLog: async (log) => practiceApiForLog.createPracticeLog(log),
    updatePracticeLog: async (id, updates) =>
      practiceApiForLog.updatePracticeLog(id, updates),
    deletePracticeLog: async (id) => practiceApiForLog.deletePracticeLog(id),
    createPracticeTime: async (time) =>
      practiceApiForLog.createPracticeTime(time),
    deletePracticeTime: async (id) => practiceApiForLog.deletePracticeTime(id),
    setPracticeLoading: setFormLoading,
    setEditingPracticeId,
    closePracticeTabModal: closeTabModal,
    onSaved: handleSelfLogSaved,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // loadTeamPracticesはuseEffectで自動実行される
  };

  // 練習ログ入力ページへ遷移
  const handlePracticeClick = (practiceId: string) => {
    if (isAdmin) {
      router.push(`/teams-admin/${teamId}/practices/${practiceId}/logs`);
    }
  };

  // キーボード操作ハンドラー
  const handlePracticeKeyDown = (
    e: React.KeyboardEvent,
    practiceId: string,
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePracticeClick(practiceId);
    }
  };

  // 詳細モーダルを開く
  const handleOpenDetail = (practiceId: string) => {
    setSelectedPracticeId(practiceId);
    setShowDetailModal(true);
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
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => router.refresh()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {t("practices.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {practices.map((practice) => {
              const practiceDate = format(
                new Date(practice.date),
                "M月d日(E)",
                { locale: ja },
              );
              const hasLogs =
                practice.practiceLogs && practice.practiceLogs.length > 0;
              const ariaLabel = isAdmin
                ? hasLogs
                  ? t("practices.card.editAriaLabel", { date: practiceDate })
                  : t("practices.card.addAriaLabel", { date: practiceDate })
                : undefined;

              if (isAdmin) {
                return (
                  <div
                    key={practice.id}
                    onClick={() => handlePracticeClick(practice.id)}
                    onKeyDown={(e) => handlePracticeKeyDown(e, practice.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={ariaLabel}
                    className="w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                          <span className="text-lg font-medium text-gray-900">
                            {practiceDate}
                          </span>
                          <span className="text-sm text-gray-500">
                            by{" "}
                            {practice.users?.name ||
                              practice.createdByUser?.name ||
                              "Unknown"}
                          </span>
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
                            <span className="text-xs text-gray-500 flex items-center">
                              <PencilSquareIcon className="h-3 w-3 mr-1" />
                              {t("practices.card.clickToEdit")}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <ClockIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-500">
                              {t("practices.card.noLogsLabel")}
                            </span>
                            <span className="text-xs text-blue-600 flex items-center">
                              <PlusIcon className="h-3 w-3 mr-1" />
                              {t("practices.card.clickToAdd")}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <p className="text-xs text-gray-500">
                          {format(new Date(practice.createdAt), "M/d HH:mm")}
                        </p>
                        {hasLogs && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDetail(practice.id);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            aria-label={t("practices.card.viewAriaLabel", {
                              date: practiceDate,
                            })}
                          >
                            <EyeIcon className="h-3.5 w-3.5 mr-1" />
                            {t("practices.card.detailButton")}
                          </button>
                        )}
                        <div className="flex gap-1">
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
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div
                    key={practice.id}
                    className="w-full text-left border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
                          <span className="text-lg font-medium text-gray-900">
                            {practiceDate}
                          </span>
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

                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {format(new Date(practice.createdAt), "M/d HH:mm")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
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
            onSave={handleSelfLogTabSave}
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

      {/* チーム練習詳細モーダル（管理者のみ） */}
      {isAdmin && showDetailModal && selectedPracticeId && (
        <TeamPracticeDetailModal
          isOpen={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPracticeId(null);
          }}
          practiceId={selectedPracticeId}
        />
      )}
    </>
  );
}
