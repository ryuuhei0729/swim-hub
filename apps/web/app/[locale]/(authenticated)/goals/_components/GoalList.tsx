"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatTimeBest } from "@/utils/formatters";
import { useAuth } from "@/contexts";
import { useGoalCurrentBestTimeQuery } from "@apps/shared/hooks/queries/goals";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { formatSignedSeconds } from "@apps/shared/utils/time";
import type { Goal, Style } from "@apps/shared/types";
import { useStyleLabel } from "@/hooks/useStyleLabel";

type GoalListItem = Goal & {
  // null = 大会情報なし (個人大会削除・チーム退会)。呼び出し元 (useGoalsQuery の select)
  // が必ず null に正規化して渡すため undefined は来ない (GoalsClient.tsx の1箇所のみから
  // 渡される)。判定は === null の1本のまま緩めない
  competition?: { title: string | null; date: string } | null;
  style?: Pick<Style, "name_jp"> & Partial<Pick<Style, "id" | "style" | "distance">>;
};

interface GoalListProps {
  goals: GoalListItem[];
  selectedGoalId: string | null;
  onSelectGoal: (goalId: string) => void;
}

/**
 * 大会目標リストコンポーネント
 * 編集・削除は詳細 (GoalDetail) の右上だけに置く (mobile の GoalCard / GoalDetailScreen と同じ)
 */
export default function GoalList({ goals, selectedGoalId, onSelectGoal }: GoalListProps) {
  const t = useTranslations("goals");

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
        />
      ))}
    </div>
  );
}

function GoalListCard({
  goal,
  isSelected,
  onSelect,
}: {
  goal: GoalListItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("goals");
  const locale = useLocale() as SupportedLocale;
  const styleLabel = useStyleLabel();
  const { supabase } = useAuth();
  const { data: currentBestTime } = useGoalCurrentBestTimeQuery(supabase, goal.id);
  const isAchieved = goal.status === "achieved";
  // 大会情報が無い目標 (大会削除後・チーム退会後) は閲覧・削除のみ (詳細で編集ボタンを出さない)
  const competitionUnavailable = goal.competition === null;
  // competitionFallback は competition はあるが title が空のときだけ使う
  const competitionName = competitionUnavailable
    ? t("list.competitionInfoUnavailable")
    : goal.competition?.title || t("list.competitionFallback");
  const styleName = styleLabel(goal.style) || t("list.styleFallback");
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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${competitionName} ${styleName}`}
      aria-pressed={isSelected}
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
