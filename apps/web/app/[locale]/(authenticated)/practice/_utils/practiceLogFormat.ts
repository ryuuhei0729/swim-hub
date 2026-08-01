import type { PracticeTag, PracticeLogWithTags, PracticeTime } from "@apps/shared/types";

/**
 * PracticeClient / PracticeLogCard 双方が参照する練習ログの整形済み型。
 * practice_logs (PracticeLogWithTags) を平坦化し、タグ配列と親 practice の一部フィールドを
 * 埋め込んだもの(PracticeClient.tsx の practiceLogs 生成ロジックが作る形)。
 */
export interface PracticeLogWithFormattedData extends PracticeLogWithTags {
  tags: PracticeTag[];
  practice?: {
    id: string;
    date: string;
    title: string | null;
    place: string | null;
    note: string | null;
    team_id?: string | null;
  };
  practiceId: string;
}

/** 全体の平均タイムを計算する(0以下のタイムは無効値として除外する) */
export function calculateOverallAverage(times: PracticeTime[]): number | null {
  if (!times || times.length === 0) {
    return null;
  }

  const validTimes = times.filter((t) => t.time > 0);
  if (validTimes.length === 0) {
    return null;
  }

  const sum = validTimes.reduce((acc, t) => acc + t.time, 0);
  return sum / validTimes.length;
}

/**
 * 平均タイムを "M:SS.cc" 形式にフォーマットする(小数第2位まで)。
 * apps/shared/utils/time.ts の formatTime は小数第1位までのため、既存の練習ページ表示
 * (小数第2位)を変えないよう独立の関数として維持する。
 */
export function formatAverageTime(seconds: number): string {
  if (seconds === 0) return "0.00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0
    ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, "0")}`
    : `${remainingSeconds.toFixed(2)}`;
}
