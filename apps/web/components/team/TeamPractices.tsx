"use client";

// =============================================================================
// 予定タブの「練習」側: カードと、カードの操作 (編集・削除・詳細・自分のログ追加) と
// そのモーダル群。一覧の取得と並べ方は TeamSchedule.tsx が持つ (練習と大会を 1 本に
// 混ぜるため。mobile の TeamPracticeList の PracticeItem / useTeamPracticeActions と同じ分け方)。
// =============================================================================

import React, {
  useState,
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
  CalendarDaysIcon,
  MapPinIcon,
  PencilSquareIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import type { PracticeImageData } from "@/components/forms/PracticeBasicForm";
import { TeamPracticesAPI } from "@apps/shared/api/teams/practices";
import { PracticeAPI } from "@apps/shared/api/practices";
import DeleteConfirmModal from "@/components/ui/DeleteConfirmModal";
import TeamPracticeDetailModal from "./TeamPracticeDetailModal";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";
import type { EditingData } from "@/stores/types";
import { useQueryClient } from "@tanstack/react-query";
import type { TeamPractice } from "@/hooks/queries/teamPracticeQueries";
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

export interface TeamPracticeActionsOptions {
  teamId: string;
  isAdmin?: boolean;
}

export interface TeamPracticeActions {
  /** 練習 1 件分のカード */
  renderCard: (practice: TeamPractice) => React.ReactNode;
  /** 作成・編集フォーム・自分のログ追加・詳細・削除確認のモーダル (一覧の外に 1 回だけ置く) */
  modals: React.ReactNode;
  /** 管理者ビュー: 練習を追加 */
  openAddForm: () => void;
  /** 利用者ビュー: 自分のログを追加 */
  openSelfLog: () => void;
  /** 保存・削除の失敗 (一覧の代わりに表示する) */
  error: string | null;
  clearError: () => void;
}

export function useTeamPracticeActions({
  teamId,
  isAdmin = false,
}: TeamPracticeActionsOptions): TeamPracticeActions {
  const { supabase, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("teams");
  const queryClient = useQueryClient();
  // 保存・削除の失敗など、一覧の取得以外で出すエラー (以前と同じく一覧の代わりに表示する)
  const [error, setError] = useState<string | null>(null);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(
    null,
  );
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // 練習一覧 (今日以降・過去)・出欠の月別サマリ・(指定時は) その練習の詳細モーダルを最新化する。
  // 保存・削除の直後に呼び、保存前の内容が残らないよう再取得の完了まで待つ。
  // 表示していない一覧・閉じている詳細モーダルのキャッシュは捨てるので、保存後に
  // 過去を開き直したり詳細を開き直したりしても保存前の内容は出ない
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

  // 利用者ビュー向け: 自分のログを追加(PracticeTabModal の practiceLog タブを開く)。
  // 管理者ビューには出さない (mobile と同じく代理入力の導線だけ。swimhub-tasks #112)
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

  const renderCard = (practice: TeamPractice): React.ReactNode => {
    const parsedPracticeDate = parseISO(practice.date);
    const practiceDate = isValid(parsedPracticeDate)
      ? format(parsedPracticeDate, "M月d日(E)", { locale: ja })
      : "-";
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

            </div>

            <div className="flex flex-col items-end gap-2">
              {/* 記録が無くてもタイム一覧を開ける (0件なら一覧側で空表示。swimhub-tasks #103) */}
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

            </div>
          </div>
        </div>
      );
    }
  };

  const modals = (
    <>
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

  return {
    renderCard,
    modals,
    openAddForm: handleAddPractice,
    openSelfLog: handleOpenSelfLog,
    error,
    clearError: () => setError(null),
  };
}
