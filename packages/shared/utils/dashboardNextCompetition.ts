import { differenceInCalendarDays, parseISO } from "date-fns";
import type { EntryStatus } from "./entryStatus";
import type { BestTime } from "../types/ui";
import type { SwimStyle } from "../types/common";
import { formatStyleAbbrev } from "./swimStyles";

/** ダッシュボードの「次の大会」に使う大会の列 */
export interface NextCompetitionCandidate {
  id: string;
  title: string | null;
  date: string;
  end_date: string | null;
  place: string | null;
  pool_type: number;
  team_id: string | null;
  entry_status: EntryStatus | null;
}

export interface NextCompetitionEntry {
  id: string;
  style_id: number;
  entry_time: number | null;
  is_relaying: boolean;
  style: { id: number; name_jp: string; distance: number; style: SwimStyle | null } | null;
}

export interface NextCompetitionGoal {
  id: string;
  style_id: number;
  target_time: number;
}

/** 次の大会カードの1行 (エントリー種目1つ分) */
export interface NextCompetitionRow {
  entryId: string;
  styleId: number;
  style: NextCompetitionEntry["style"];
  /** リレーのエントリー。個人のベスト・目標は付けない (findGoalTargetTime と同じ扱い) */
  isRelaying: boolean;
  entryTime: number | null;
  /** 大会と同じ水路の個人 (リレー以外) のベスト。無い・リレーのエントリーなら null */
  bestTime: number | null;
  goalId: string | null;
  targetTime: number | null;
  /** 目標 − ベスト (秒)。負なら目標まで縮める必要がある。ベストか目標が無ければ null */
  gapToTarget: number | null;
}

/**
 * 基準日 (today) で見た受付状態。大会日が today より前なら DB 値に関わらず closed。
 * resolveEntryStatus と同じ規則だが、端末の今日ではなく引数の today で判定する
 * (pickNextCompetition に渡した today と判定の基準をそろえるため)。
 */
export function entryStatusOn(
  date: string,
  entryStatus: EntryStatus | null,
  today: string,
): EntryStatus {
  if (date < today) return "closed";
  return entryStatus ?? "before";
}

/** 大会の最終日 (単日開催は開始日) */
function lastDayOf(competition: Pick<NextCompetitionCandidate, "date" | "end_date">): string {
  return competition.end_date ?? competition.date;
}

/**
 * 「次の大会」を選ぶ。
 *
 * - 最終日が今日以降の大会を開始日の早い順に見る (開催中の複数日大会も含む)
 * - チームの大会で、エントリーが締め切られていて自分のエントリーが無いものは飛ばす
 *   (出場しない大会なので、その次の大会を出す)
 * - 自分で登録した大会 (team_id なし) は受付状態に関係なく対象にする
 *
 * @param today 基準日 (YYYY-MM-DD)
 */
export function pickNextCompetition<T extends NextCompetitionCandidate>(
  competitions: T[],
  enteredCompetitionIds: ReadonlySet<string>,
  today: string,
): T | null {
  const upcoming = competitions
    .filter((c) => lastDayOf(c) >= today)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));

  for (const competition of upcoming) {
    if (!competition.team_id) return competition;
    if (enteredCompetitionIds.has(competition.id)) return competition;
    if (entryStatusOn(competition.date, competition.entry_status, today) !== "closed") {
      return competition;
    }
  }
  return null;
}

/**
 * エントリー・目標・ベストタイムを、次の大会カードの行にまとめる。
 * ベストは大会と同じ水路の、リレー以外の記録だけを見る。リレーのエントリーにはベストも目標も付けない。
 */
export function buildNextCompetitionRows(
  entries: NextCompetitionEntry[],
  goals: NextCompetitionGoal[],
  bestTimes: BestTime[],
  poolType: number,
): NextCompetitionRow[] {
  return entries.map((entry) => {
    if (entry.is_relaying) {
      return {
        entryId: entry.id,
        styleId: entry.style_id,
        style: entry.style,
        isRelaying: true,
        entryTime: entry.entry_time,
        bestTime: null,
        goalId: null,
        targetTime: null,
        gapToTarget: null,
      };
    }
    const best = bestTimes.find(
      (b) => b.style_id === entry.style_id && b.pool_type === poolType && !b.is_relaying,
    );
    const goal = goals.find((g) => g.style_id === entry.style_id);
    const bestTime = best ? best.time : null;
    const targetTime = goal ? goal.target_time : null;
    return {
      entryId: entry.id,
      styleId: entry.style_id,
      style: entry.style,
      isRelaying: false,
      entryTime: entry.entry_time,
      bestTime,
      goalId: goal ? goal.id : null,
      targetTime,
      gapToTarget:
        bestTime !== null && targetTime !== null
          ? Math.round((targetTime - bestTime) * 100) / 100
          : null,
    };
  });
}

/**
 * 次の大会の行に出す種目名。公式略称の書き方 (例: "100m Fr") にする。
 * 種目コードか距離が無いときは formatStyleAbbrev と同じ順で代わりを探す。
 */
export function formatNextCompetitionEvent(style: NextCompetitionEntry["style"]): string {
  if (style?.style && style.distance != null) return `${style.distance}m ${style.style}`;
  return formatStyleAbbrev(style);
}

/** 大会の開始日まで何日か (当日は 0)。開催中の複数日大会は 0 */
export function daysUntilCompetition(date: string, today: string): number {
  return Math.max(0, differenceInCalendarDays(parseISO(date), parseISO(today)));
}

/**
 * 次の大会カードの表示状態。
 * - none: 予定の大会が無い
 * - noEntries: 大会はあるが自分のエントリー種目が無い
 * - entries: エントリー種目がある (目標の有無は行ごとに見る)
 */
export type NextCompetitionState = "none" | "noEntries" | "entries";

export function resolveNextCompetitionState(
  competition: NextCompetitionCandidate | null,
  entryCount: number,
): NextCompetitionState {
  if (!competition) return "none";
  return entryCount > 0 ? "entries" : "noEntries";
}
