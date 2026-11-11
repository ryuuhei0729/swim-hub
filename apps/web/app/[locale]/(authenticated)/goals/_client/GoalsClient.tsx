"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import type { Goal, Style, GoalWithMilestones, Competition } from "@apps/shared/types";
import { useGoalsQuery, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import { GoalAPI } from "@apps/shared/api/goals";
import { selectUpcomingGoals } from "@apps/shared/utils/upcomingGoals";
import { useBrowserToday } from "@/hooks/useBrowserToday";
import GoalList from "../_components/GoalList";
import GoalDetail from "../_components/GoalDetail";
import GoalCreateModal from "../_components/GoalCreateModal";
import GoalEditModal from "../_components/GoalEditModal";
import { PlusIcon } from "@heroicons/react/24/outline";

interface GoalsClientProps {
  initialGoals: Goal[];
  initialCompetitions: Competition[];
  styles: Style[];
  /** 最初に選んでおく目標。一覧に無ければ (大会終了・削除済み) 一覧の先頭を選ぶ */
  initialGoalId?: string;
}

/**
 * 目標管理ページのインタラクティブ部分を担当するClient Component
 */
export default function GoalsClient({
  initialGoals,
  initialCompetitions,
  styles,
  initialGoalId,
}: GoalsClientProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const today = useBrowserToday();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(initialGoalId ?? null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  // 大会情報が無い目標 (goal.competition === null) は編集不可のため、
  // GoalEditModal には competition が必ず存在するもののみを渡す
  const [editingGoal, setEditingGoal] = useState<
    (GoalWithMilestones & { competition: Competition }) | null
  >(null);

  // React Query: 目標一覧
  const {
    data: goals = [],
    error: goalsError,
    invalidate: invalidateGoals,
  } = useGoalsQuery(supabase, {
    styles,
    initialData:
      initialGoals.length > 0 || initialCompetitions.length > 0
        ? { goals: initialGoals, competitions: initialCompetitions }
        : undefined,
  });

  // 大会が終わった目標は出さない (大会情報なしの目標は削除できるよう残す)。
  // 複数日開催は終了日で判定する。今日が決まるまで (サーバー描画中) は null
  const visibleGoals = useMemo(
    () => (today ? selectUpcomingGoals(goals, today) : null),
    [goals, today],
  );

  // 選択中の目標が一覧に無い (未選択・削除済み・大会が終わった) ときは一覧の先頭を選ぶ
  const activeGoalId =
    visibleGoals?.some((goal) => goal.id === selectedGoalId)
      ? selectedGoalId
      : (visibleGoals?.[0]?.id ?? null);

  // React Query: 選択中の目標詳細
  const {
    data: selectedGoal,
    isLoading,
    error: goalError,
    invalidate: invalidateGoalDetail,
  } = useGoalDetailQuery(supabase, activeGoalId);

  // 目標を指定して開いたとき (ダッシュボードの目標タイムから)、1カラム表示 (lg 未満) では
  // 詳細が一覧の下にあり画面外になるので、詳細を読み込んだら1回だけそこまでスクロールする。
  // 表示の切り替えではなくマウント後の1回の操作なので、幅は matchMedia で見る
  const detailRef = useRef<HTMLDivElement>(null);
  const scrolledToInitialGoal = useRef(false);
  useEffect(() => {
    if (scrolledToInitialGoal.current || !initialGoalId || selectedGoal?.id !== initialGoalId) {
      return;
    }
    scrolledToInitialGoal.current = true;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    detailRef.current?.scrollIntoView({ block: "start" });
  }, [initialGoalId, selectedGoal]);

  // 目標作成後のコールバック
  const handleGoalCreated = async () => {
    await invalidateGoals();
    setIsCreateModalOpen(false);
  };

  // 目標削除後のコールバック。削除した目標を選択していた場合は、
  // 一覧から消えた時点で activeGoalId が一覧の先頭に移る
  const handleGoalDeleted = async () => {
    try {
      await invalidateGoals();
    } catch (e) {
      console.error("キャッシュ無効化エラー:", e);
    }
  };

  // 目標更新後のコールバック
  const handleGoalUpdated = async () => {
    await Promise.all([invalidateGoals(), invalidateGoalDetail()]);
  };

  // 目標編集ボタンが押されたときのハンドラー
  // 大会情報が無い目標 (goal.competition === null) は GoalList 側で
  // 編集導線自体を出していないため通常は起こらないが、一覧取得後に大会削除・
  // チーム退会が発生する競合を考慮し、フェッチ結果側でも保険的に確認する
  const handleEditGoal = async (goalId: string) => {
    try {
      const goalAPI = new GoalAPI(supabase);
      const goal = await goalAPI.getGoalWithMilestones(goalId);
      if (!goal || !goal.competition) {
        alert(t("client.fetchFailed"));
        return;
      }
      const competition = goal.competition;
      setEditingGoal({ ...goal, competition });
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("目標詳細取得エラー:", error);
      alert(t("client.fetchFailed"));
    }
  };

  // 目標編集後のコールバック
  const handleGoalEdited = async () => {
    try {
      await Promise.all([invalidateGoals(), invalidateGoalDetail()]);
    } catch (e) {
      console.error("キャッシュ無効化エラー:", e);
    } finally {
      setIsEditModalOpen(false);
      setEditingGoal(null);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* ヘッダー（デスクトップのみ）。「新規目標作成」ボタンは一覧の下に移したため、
          practice/競技会履歴/マイページと同じ見出し+説明文のみの title card に戻す */}
      <div className="hidden lg:block bg-white rounded-lg shadow p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{t("page.title")}</h1>
        <p className="text-sm sm:text-base text-gray-600">{t("page.description")}</p>
      </div>

      {/* メインコンテンツ: リスト+詳細レイアウト */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* 左側: 大会目標リスト */}
        <div className="lg:col-span-1 space-y-3">
          {goalsError ? (
            <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-center">
              <p className="text-red-600 mb-3 text-sm sm:text-base">{t("list.loadError")}</p>
              <button
                onClick={() => invalidateGoals()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("list.retry")}
              </button>
            </div>
          ) : !visibleGoals ? (
            <div className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-16 bg-gray-200 rounded"></div>
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            </div>
          ) : (
            <>
              <GoalList
                goals={visibleGoals}
                selectedGoalId={activeGoalId}
                onSelectGoal={setSelectedGoalId}
                onDeleteGoal={handleGoalDeleted}
                onEditGoal={handleEditGoal}
              />
              {/* 新規目標作成ボタン: 一覧 (0件時は空の案内カード) の下に置く。
                  一覧とボタンの間隔は lg:col-span-1 の space-y-3 により一覧内の
                  カード間隔と揃う。見た目は アカウント画面の練習ログテンプレートの
                  一覧下ボタン (PracticeLogTemplateList.tsx) と同じ様式 */}
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="w-full py-3 border-2 border-dashed rounded-lg flex items-center justify-center gap-2 transition-colors border-gray-300 text-gray-600 hover:border-blue-500 hover:text-blue-600"
              >
                <PlusIcon className="h-5 w-5" />
                {t("page.createButton")}
              </button>
            </>
          )}
        </div>

        {/* 右側: 目標詳細。scroll-mt-20 は固定ヘッダー (高さ 65px) の下に止めるため */}
        <div ref={detailRef} className="lg:col-span-2 scroll-mt-20">
          {goalError ? (
            <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-center">
              <p className="text-red-600 mb-3 text-sm sm:text-base">{t("detail.loadError")}</p>
              <button
                onClick={() => invalidateGoalDetail()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t("detail.retry")}
              </button>
            </div>
          ) : isLoading || !visibleGoals ? (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          ) : selectedGoal ? (
            <GoalDetail
              goal={selectedGoal}
              styles={styles}
              onUpdate={handleGoalUpdated}
              onDelete={handleGoalDeleted}
            />
          ) : (
            <div className="bg-white rounded-lg shadow p-6 sm:p-12 text-center">
              <p className="text-gray-500 text-xs sm:text-lg">{t("page.selectHint")}</p>
            </div>
          )}
        </div>
      </div>

      {/* 目標作成モーダル */}
      <GoalCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={handleGoalCreated}
        styles={styles}
      />

      {/* 目標編集モーダル */}
      {editingGoal && (
        <GoalEditModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingGoal(null);
          }}
          onSuccess={handleGoalEdited}
          goal={editingGoal}
          styles={styles}
        />
      )}
    </div>
  );
}
