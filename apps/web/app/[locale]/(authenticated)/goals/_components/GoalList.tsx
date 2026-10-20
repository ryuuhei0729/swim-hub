"use client";

import React, { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { TrashIcon, PencilIcon } from "@heroicons/react/24/outline";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { useGoalCurrentBestTimeQuery } from "@apps/shared/hooks/queries/goals";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatSignedSeconds } from "@apps/shared/utils/time";
import type { Goal } from "@apps/shared/types";

type GoalListItem = Goal & {
  // null = 大会情報なし (個人大会削除・チーム退会)。呼び出し元 (useGoalsQuery の select)
  // が必ず null に正規化して渡すため undefined は来ない (GoalsClient.tsx の1箇所のみから
  // 渡される)。判定は === null の1本のまま緩めない
  competition?: { title: string | null; date: string } | null;
  style?: { name_jp: string };
};

interface GoalListProps {
  goals: GoalListItem[];
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string) => void;
  onDeleteGoal: () => Promise<void>;
  onEditGoal: (goalId: string) => void;
}

/**
 * 大会目標リストコンポーネント
 */
export default function GoalList({
  goals,
  selectedGoalId,
  onSelectGoal,
  onDeleteGoal,
  onEditGoal,
}: GoalListProps) {
  const t = useTranslations("goals");
  const { supabase } = useAuth();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);

  const handleDelete = async (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation();
    if (confirm(t("list.deleteConfirm"))) {
      try {
        await goalAPI.deleteGoal(goalId);
        await onDeleteGoal();
      } catch (error) {
        console.error("目標削除エラー:", error);
        alert(t("list.deleteFailed"));
      }
    }
  };

  const handleEdit = (e: React.MouseEvent, goalId: string) => {
    e.stopPropagation();
    onEditGoal(goalId);
  };

  if (goals.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <p className="text-gray-500 text-center py-4 sm:py-8 text-xs sm:text-base">
          {t("list.empty")}
          <br />
          {t("list.emptyDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((goal) => (
        <GoalListCard
          key={goal.id}
          goal={goal}
          isSelected={selectedGoalId === goal.id}
          onSelect={() => onSelectGoal(goal.id)}
          onEdit={(e) => handleEdit(e, goal.id)}
          onDelete={(e) => handleDelete(e, goal.id)}
        />
      ))}
    </div>
  );
}

function GoalListCard({
  goal,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
}: {
  goal: GoalListItem;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const t = useTranslations("goals");
  const locale = useLocale() as SupportedLocale;
  const { supabase } = useAuth();
  const { data: currentBestTime } = useGoalCurrentBestTimeQuery(supabase, goal.id);
  const isAchieved = goal.status === "achieved";
  // 大会情報が無い目標 (大会削除後・チーム退会後) は閲覧・削除のみ。編集導線を出さない
  const competitionUnavailable = goal.competition === null;
  // competitionFallback は competition はあるが title が空のときだけ使う
  const competitionName = competitionUnavailable
    ? t("list.competitionInfoUnavailable")
    : goal.competition?.title || t("list.competitionFallback");
  const styleName = goal.style?.name_jp || t("list.styleFallback");
  const competitionDate = goal.competition?.date;
  // 目標タイムと現在のベストの差 (Best-0.01)。ベストが分からない (取得中・失敗・記録なし・
  // 大会情報なしで水路が分からない) ときは出さない
  const diffFromBest =
    !competitionUnavailable && currentBestTime != null
      ? t("list.diffFromBest", { diff: formatSignedSeconds(goal.target_time - currentBestTime) })
      : null;

  return (
    <div
      onClick={onSelect}
      className={`
        rounded-lg shadow p-4 cursor-pointer transition-all
        ${isSelected ? "ring-2 ring-blue-500" : "hover:shadow-md"}
        ${isAchieved ? "bg-green-50 border border-green-200" : "bg-white"}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* 1行に収める。大会名が長いときは … で省略する (日付は縮めない) */}
          <div className="flex items-center gap-2 text-sm">
            {competitionDate && (
              <span className="shrink-0 font-semibold text-gray-700 tabular-nums">
                {formatDate(competitionDate, "numeric", locale)}
              </span>
            )}
            <span className="min-w-0 truncate text-gray-500">{competitionName}</span>
          </div>
          {competitionUnavailable && (
            <p className="text-[10px] text-amber-600 mt-0.5">{t("list.editUnavailableReason")}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!competitionUnavailable && (
            <button
              onClick={onEdit}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              title={t("list.edit")}
              aria-label={t("list.edit")}
            >
              <PencilIcon className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-600 transition-colors p-1"
            title={t("list.delete")}
            aria-label={t("list.delete")}
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 細いカード (lg〜xl) で種目名と並び切らないときは、タイムを右寄せのまま次の行に回す */}
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
        {/* 達成バッジは種目名の横に置く。1行目に置くと、細いカード (lg〜xl) で日付と合わせて
            行幅を超え、大会名が消えてバッジが編集・削除ボタンに重なった。
            種目名は折り返さず、並び切らなければバッジの方を次の行に回す */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="whitespace-nowrap text-base font-bold text-blue-700">{styleName}</h3>
          {isAchieved && (
            <span className="inline-flex shrink-0 items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              {t("list.achievedBadge")}
            </span>
          )}
        </div>
        <p className="ml-auto shrink-0 tabular-nums">
          <span className="text-lg font-bold text-blue-700">{formatTimeBest(goal.target_time)}</span>
          {diffFromBest && <span className="ml-1 text-xs text-gray-500">{diffFromBest}</span>}
        </p>
      </div>
    </div>
  );
}
