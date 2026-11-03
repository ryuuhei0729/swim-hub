"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { lockBodyScroll } from "@/utils/scrollLock";
// 判定モード (確認モード) の設定を、どのページの判定よりも先に読み込ませる
import "@/utils/milestoneJudgment";
import { GoalAPI } from "@apps/shared/api/goals";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import type { Milestone } from "@apps/shared/types";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";
import { formatTimeBest } from "@apps/shared/utils/time";

/** 候補の根拠 (achieved_value) から「記録: 29.85」「平均: 31.20」の行を作る。出せなければ null */
function evidenceOf(
  milestone: Milestone,
): { key: "recordTime" | "averageTime"; time: number } | null {
  const value = milestone.achievement_candidate?.achieved_value;
  if (!value) return null;
  if (typeof value.time === "number") return { key: "recordTime", time: value.time };
  if (typeof value.average_time === "number") return { key: "averageTime", time: value.average_time };
  return null;
}

/**
 * 達成の確認ダイアログ (mobile の MilestoneAchievementPrompter と同じ挙動)。
 * 判定は確認モード (utils/milestoneJudgment.ts) なので、条件を満たす記録が見つかっても
 * 自動では達成にせず達成候補を置く。ここで候補を1件ずつ「もしかしてマイルストーンを
 * 達成しましたか？」と聞き、「達成！」で達成に、「キャンセル」で候補を取り下げる
 * (その時点より前の記録では二度と聞かない)。
 *
 * 判定 (練習・大会記録の保存後、目標ページ・ダッシュボードを開いたとき) のあとに候補を
 * 取り直すので、どの画面にいても出る。目標ページの判定はサーバーで走るため、
 * ページ遷移のたびにも取り直す。
 * 「キャンセル」は候補を取り下げる操作なので、枠外クリックや Esc では閉じない
 * (うっかり閉じて取り下げにならないように)。
 */
export default function MilestoneAchievementPrompter() {
  const t = useTranslations("goals");
  const tCommon = useTranslations("common");
  const { supabase, user } = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const { data: pending, refetch } = useQuery({
    queryKey: goalKeys.pendingAchievements(),
    queryFn: () => goalAPI.getPendingAchievementMilestones(),
    enabled: !!user,
  });

  // ページ遷移時 (サーバー側で判定が走るページを含む) に候補を取り直す。
  // 最初の表示は useQuery 自身が取りに行くので、遷移したときだけ
  const lastPathnameRef = useRef(pathname);
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    if (user) void refetch();
  }, [pathname, user, refetch]);

  const milestone = pending?.[0] ?? null;
  const milestoneId = milestone?.id ?? null;

  useEffect(() => {
    if (!milestoneId) return;
    setError(false);
    confirmButtonRef.current?.focus();
    return lockBodyScroll();
  }, [milestoneId]);

  if (!milestone || typeof document === "undefined") return null;

  const answer = async (action: () => Promise<unknown>) => {
    if (answering) return;
    setAnswering(true);
    setError(false);
    try {
      await action();
      // 一覧・詳細の状態と、残りの候補 (次のダイアログ) を取り直す
      await queryClient.invalidateQueries({ queryKey: goalKeys.all });
    } catch (e) {
      console.error("マイルストーン達成確認エラー:", e);
      setError(true);
    } finally {
      setAnswering(false);
    }
  };

  const summary = milestone.type !== "other" ? formatMilestoneSummary(milestone, t) : null;
  const evidence = evidenceOf(milestone);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="milestone-achievement-title"
      aria-describedby="milestone-achievement-description"
      data-testid="milestone-achievement-prompt"
    >
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 p-2 rounded-full bg-green-100">
            <TrophyIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="milestone-achievement-title" className="text-lg font-semibold text-gray-900">
              {t("achievementPrompt.title")}
            </h3>
            <div id="milestone-achievement-description" className="mt-2 space-y-1 text-sm text-gray-700">
              <p className="font-medium text-gray-900 break-words">{milestone.title}</p>
              {summary && summary !== milestone.title && (
                <p className="tabular-nums">{summary}</p>
              )}
              {evidence && (
                <p className="text-green-700 tabular-nums">
                  {t(`achievementPrompt.${evidence.key}`, { time: formatTimeBest(evidence.time) })}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {t("milestone.completionFailed")}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={answering}
            onClick={() => void answer(() => goalAPI.dismissMilestoneCandidate(milestone))}
            data-testid="milestone-achievement-dismiss"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
          >
            {tCommon("cancel")}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            disabled={answering}
            onClick={() => void answer(() => goalAPI.confirmMilestoneAchievement(milestone))}
            data-testid="milestone-achievement-confirm"
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
          >
            {t("achievementPrompt.confirm")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
