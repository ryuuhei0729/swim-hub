"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import type { Goal, Style, GoalWithMilestones, Competition } from "@apps/shared/types";
import { useGoalsQuery, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import { GoalAPI } from "@apps/shared/api/goals";
import GoalList from "../_components/GoalList";
import GoalDetail from "../_components/GoalDetail";
import GoalCreateModal from "../_components/GoalCreateModal";
import GoalEditModal from "../_components/GoalEditModal";
import { PlusIcon } from "@heroicons/react/24/outline";

interface GoalsClientProps {
  initialGoals: Goal[];
  initialCompetitions: Competition[];
  styles: Style[];
}

/**
 * 目標管理ページのインタラクティブ部分を担当するClient Component
 */
export default function GoalsClient({
  initialGoals,
  initialCompetitions,
  styles,
}: GoalsClientProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(
    initialGoals.length > 0 ? initialGoals[0]!.id : null, // initialGoals.length > 0 を三項演算子内で確認済み
  );
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

  // React Query: 選択中の目標詳細
  const {
    data: selectedGoal,
    isLoading,
    error: goalError,
    invalidate: invalidateGoalDetail,
  } = useGoalDetailQuery(supabase, selectedGoalId);

  // 目標作成後のコールバック
  const handleGoalCreated = async () => {
    await invalidateGoals();
    setIsCreateModalOpen(false);
  };

  // 目標削除後のコールバック
  const handleGoalDeleted = async () => {
    try {
      await invalidateGoals();
    } catch (e) {
      console.error("キャッシュ無効化エラー:", e);
    } finally {
      if (selectedGoalId) {
        setSelectedGoalId(null);
      }
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
          ) : (
            <>
              <GoalList
                goals={goals}
                selectedGoalId={selectedGoalId}
                onSelectGoal={setSelectedGoalId}
                onDeleteGoal={handleGoalDeleted}
                onEditGoal={handleEditGoal}
              />
              {/* 新規目標作成ボタン: 一覧 (0件時は空の案内カード) の下に置く。
                  一覧とボタンの間隔は lg:col-span-1 の space-y-3 により一覧内の
                  カード間隔と揃う。見た目は settings/practice-log-templates の
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

        {/* 右側: 目標詳細 */}
        <div className="lg:col-span-2">
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
          ) : isLoading ? (
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
