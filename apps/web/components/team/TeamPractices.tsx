"use client";

// =============================================================================
// 予定タブの「練習」側: カードと、カードの操作 (編集・削除・タイム一覧・記録追加・代理入力) と
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
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format, isValid, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import type { PracticeImageData } from "@/components/forms/PracticeBasicForm";
import type { ExistingImage } from "@/components/forms/PracticeImageUploader";
import { resolveGalleryImages } from "@/lib/image-url";
import { hasParentImageChanges, saveParentImages } from "@/utils/parentImageSave";
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

// 練習ログタブモーダル(カードの「記録追加」導線)。重量コンポーネントなので開いた時にのみ import する
const PracticeTabModal = dynamic(
  () => import("@/components/forms/PracticeTabModal"),
  {
    ssr: false,
  },
);

export type { TeamPractice } from "@/hooks/queries/teamPracticeQueries";

/** カード・タイム一覧の見出しに出す練習日 (例: 3月1日(土)) */
function formatPracticeCardDate(date: string): string {
  const parsed = parseISO(date);
  return isValid(parsed) ? format(parsed, "M月d日(E)", { locale: ja }) : "-";
}

export interface TeamPracticeActionsOptions {
  teamId: string;
  isAdmin?: boolean;
}

export interface TeamPracticeActions {
  /** 練習 1 件分のカード */
  renderCard: (practice: TeamPractice) => React.ReactNode;
  /** 作成・編集フォーム・記録追加・タイム一覧・削除確認のモーダル (一覧の外に 1 回だけ置く) */
  modals: React.ReactNode;
  /** 管理者ビュー: 練習を追加 */
  openAddForm: () => void;
  /** メンバー全員のタイム一覧を開く (カードを押したときと同じ。外からのリンク用) */
  openTimes: (practice: TeamPractice) => void;
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
  // タイム一覧モーダルで開いている練習 (null なら閉じている)
  const [selectedPractice, setSelectedPractice] = useState<{
    id: string;
    heading: string;
  } | null>(null);
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
    setEditingData,
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

  // 編集フォームに既存の画像を出すための取得。開き直したときに前の取得結果を反映しないよう番号で区別する
  const editImageRequestIdRef = useRef(0);

  // 管理者向け: 既存の練習記録を編集(PracticeBasicForm を editData 付きで開く)
  const handleEditPractice = (e: React.MouseEvent, practice: TeamPractice) => {
    e.stopPropagation();
    const baseEditData = {
      id: practice.id,
      type: "practice",
      date: practice.date,
      title: practice.title || "",
      place: practice.place || "",
      note: practice.note || "",
    };
    openBasicForm(new Date(practice.date), baseEditData as EditingData);

    // 既存の画像は署名付き URL の解決を待たずにフォームを開き、解決後に editingData へ足す
    // (ダッシュボードの編集と同じ。swimhub-tasks#58)
    const requestId = ++editImageRequestIdRef.current;
    void (async () => {
      try {
        const { data, error: imagePathsError } = await supabase
          .from("practices")
          .select("image_paths")
          .eq("id", practice.id)
          .single();
        if (imagePathsError) throw imagePathsError;
        const paths = (data as { image_paths: string[] | null } | null)?.image_paths ?? [];
        if (paths.length === 0) return;
        const images = await resolveGalleryImages("practice-images", paths);
        const state = usePracticeStore.getState();
        if (
          editImageRequestIdRef.current !== requestId ||
          !state.isBasicFormOpen ||
          state.editingData?.id !== practice.id ||
          images.length === 0
        ) {
          return;
        }
        setEditingData({ ...baseEditData, images } as EditingData);
      } catch (err) {
        console.error("練習の画像の取得に失敗:", err);
      }
    })();
  };

  const handlePracticeBasicSubmit = async (
    basicData: { date: string; title: string; place: string; note: string },
    imageData?: PracticeImageData,
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

      let practiceId = editingData?.id;
      if (practiceId) {
        await api.update(practiceId, {
          date: basicData.date,
          title: basicData.title || null,
          place: basicData.place || null,
          note: basicData.note || null,
        });
      } else {
        const created = await api.create({
          user_id: user.id,
          team_id: teamId,
          date: basicData.date,
          title: basicData.title || null,
          place: basicData.place || null,
          note: basicData.note || null,
        });
        practiceId = created.id;
      }

      // 画像 (追加・削除)。練習本体は保存済みなので、失敗しても一覧は更新して理由を出す
      let imageSaveFailed = false;
      if (practiceId && imageData && hasParentImageChanges(imageData)) {
        try {
          await saveParentImages(supabase, "practice", practiceId, imageData);
        } catch (imageErr) {
          console.error("練習の画像の保存に失敗:", imageErr);
          imageSaveFailed = true;
        }
      }

      closeBasicForm();
      await loadTeamPractices(practiceId);
      if (imageSaveFailed) setError(t("practiceForm.imageSaveFailed"));
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

  // 利用者ビュー向け: カードの「記録追加」から、その練習に自分のログを付ける
  // (PracticeTabModal の practiceLog タブを、既存の練習の編集モードで開く)。
  // 練習の ID を渡さずに開くと、保存時に team_id 付きの新しい練習が作られてしまう
  // (swimhub-tasks#57)。モバイルの TeamPracticeList の handleAddLog と同じ導線。
  // 管理者ビューには出さない (mobile と同じく代理入力の導線だけ。swimhub-tasks#112)
  const handleOpenSelfLog = (practice: TeamPractice) => {
    openTabModal(
      new Date(practice.date),
      {
        id: practice.id,
        type: "practice",
        date: practice.date,
        title: practice.title || "",
        place: practice.place || "",
        note: practice.note || "",
      } as EditingData,
      "practiceLog",
    );
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
  // onSave の editingPracticeId の時点で控えておき、保存後にその練習の詳細モーダルの
  // キャッシュも落とす (保存前のログを表示しないため)
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
    // 「記録追加」は常に既存の練習 (editingPracticeId あり) に付けるため、練習は作らない。
    // ここが呼ばれるのは練習 ID が無いまま保存したときだけで、それはチーム練習を
    // 勝手に増やす不具合 (swimhub-tasks#57) なので止める。
    createPractice: async () => {
      throw new Error(t("practiceForm.createFailed"));
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
    // チーム練習の日付・場所などは管理者が「編集」から変える。ここではログだけ保存する
    // (一般メンバーには practices の UPDATE 権限が無い)。PracticeTabModal にも同じ値を渡す
    allowParentUpdate: false,
  });

  // 保存先の練習 ID を控える
  const handleSelfLogSave = async (
    params: Parameters<typeof handleSelfLogTabSave>[0],
  ) => {
    if (params.editingPracticeId) {
      selfLogPracticeIdRef.current = params.editingPracticeId;
    }
    return handleSelfLogTabSave(params);
  };

  // 管理者向け: 練習ログの代理入力ページへ遷移 (カードの「記録代理入力」ボタン)
  const handleOpenLogInput = (practiceId: string) => {
    if (isAdmin) {
      router.push(`/teams-admin/${teamId}/practices/${practiceId}/logs`);
    }
  };

  // メンバー全員のタイム一覧モーダルを開く (admin/非admin 共通)
  const handleOpenTimes = useCallback((practice: TeamPractice) => {
    const practiceDate = formatPracticeCardDate(practice.date);
    setSelectedPractice({
      id: practice.id,
      heading: practice.title ? `${practiceDate} ${practice.title}` : practiceDate,
    });
  }, []);

  const renderCard = (practice: TeamPractice): React.ReactNode => {
    const practiceDate = formatPracticeCardDate(practice.date);
    // 記録が無くてもカード全体を押してメンバー全員のタイム一覧を開く (admin/非admin 共通。
    // 0件なら一覧側で空表示。mobile と同じ。swimhub-tasks#103)。
    // 中のボタンは stopPropagation してカードのクリックと分ける
    const openTimes = () => handleOpenTimes(practice);

    return (
      <div
        key={practice.id}
        onClick={openTimes}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openTimes();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={t("practices.card.viewTimesAriaLabel", { date: practiceDate })}
        data-testid="team-practice-card"
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
            {isAdmin ? (
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
            ) : (
              // この練習に自分のログを付ける (管理者ビューは「記録代理入力」から入力する)
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenSelfLog(practice);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                data-testid="team-practice-add-log-button"
                className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                aria-label={t("practices.card.addLogAriaLabel", {
                  date: practiceDate,
                })}
              >
                <PlusIcon className="h-3.5 w-3.5 mr-1" />
                {t("practices.card.addLogButton")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
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
                  images: (editingData as { images?: ExistingImage[] }).images,
                }
              : undefined
          }
          isLoading={formLoading}
          teamMode={true}
        />
      </Suspense>

      {/* 練習に自分のログを追加(練習ログタブモーダル)。重量コンポーネントなので開いた時のみ import する */}
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
            allowParentUpdate={false}
            logOwnerUserId={user?.id}
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

  return {
    renderCard,
    modals,
    openAddForm: handleAddPractice,
    openTimes: handleOpenTimes,
    error,
    clearError: () => setError(null),
  };
}
