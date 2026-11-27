// =============================================================================
// ダッシュボード「前回の練習」カードの表示用ロジック
// =============================================================================
//
// 取得は hooks/queries/dashboard.ts の useLastPracticeQuery。ここは画面に出す形への
// 変換だけを持ち、web / mobile のカードが同じ行データを使う。

import { calcAverage, calcFastest } from "./time";

export interface LastPracticeTime {
  set_number: number;
  rep_number: number;
  time: number;
}

export interface LastPracticeLog {
  id: string;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  distance: number;
  rep_count: number;
  set_count: number;
  circle: number | null;
  created_at: string;
  practice_times: LastPracticeTime[] | null;
}

export interface LastPractice {
  id: string;
  date: string;
  title: string | null;
  place: string | null;
  practice_logs: LastPracticeLog[];
}

export interface LastPracticeRow {
  logId: string;
  category: LastPracticeLog["swim_category"];
  style: string;
  distance: number;
  repCount: number;
  setCount: number;
  circle: number | null;
  /** セット順・本数順に並べた、入力済みのタイム (秒) */
  times: number[];
  /** 最速 (秒)。タイムが無ければ null */
  fastest: number | null;
  /** 平均 (秒)。タイムが無ければ null */
  average: number | null;
}

/**
 * 練習のメニューを、登録した順 (created_at) に表示用の行へ変換する。
 * タイムはセット→本の順に並べ、0 以下 (未入力扱い) は除く。
 */
export function buildLastPracticeRows(logs: LastPracticeLog[]): LastPracticeRow[] {
  return [...logs]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((log) => {
      const times = [...(log.practice_times ?? [])]
        .filter((t) => typeof t.time === "number" && t.time > 0)
        .sort((a, b) => a.set_number - b.set_number || a.rep_number - b.rep_number)
        .map((t) => t.time);
      const entries = times.map((time) => ({ time }));
      return {
        logId: log.id,
        category: log.swim_category,
        style: log.style,
        distance: log.distance,
        repCount: log.rep_count,
        setCount: log.set_count,
        circle: log.circle,
        times,
        fastest: calcFastest(entries),
        average: calcAverage(entries),
      };
    });
}

/**
 * メニューの「距離×本数」(セットが2以上なら「×セット」も付ける)。例: 100×5, 50×4×2
 */
export function formatLastPracticeMenu(
  row: Pick<LastPracticeRow, "distance" | "repCount" | "setCount">,
): string {
  const base = `${row.distance}×${row.repCount}`;
  return row.setCount > 1 ? `${base}×${row.setCount}` : base;
}

/** ダッシュボードで横に並べるカード (並び順はこの順で固定) */
export const DASHBOARD_CARDS = ["nextCompetition", "lastPractice"] as const;
export type DashboardCardKey = (typeof DASHBOARD_CARDS)[number];

/**
 * 最初に見せるカードを選ぶ。並び順は変えず、開いたときにどちらを表示しておくかだけを決める。
 * 1. 大会が今日・明日 (開催中を含む) → 次の大会
 * 2. 練習の予定が今日・明日にある → 前回の練習
 * 3. どちらも無い → 次の大会
 *
 * @param nextCompetitionDate 次の大会の開始日 (yyyy-MM-dd)。大会が無ければ null
 * @param hasPracticeSoon 今日・明日に練習の予定があるか (欠席と回答したチーム練習は除いて数える)
 * @param tomorrow 明日 (yyyy-MM-dd)
 */
export function pickInitialDashboardCard(params: {
  nextCompetitionDate: string | null;
  hasPracticeSoon: boolean;
  tomorrow: string;
}): DashboardCardKey {
  const { nextCompetitionDate, hasPracticeSoon, tomorrow } = params;
  // 次の大会は「今日以降に開始 or 開催中」の大会なので、開始日が明日以前なら今日・明日にかかっている
  if (nextCompetitionDate !== null && nextCompetitionDate <= tomorrow) return "nextCompetition";
  return hasPracticeSoon ? "lastPractice" : "nextCompetition";
}
