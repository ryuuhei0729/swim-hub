/**
 * RecordsScreen 向け「エントリー済み・記録未登録」大会セクションの純フィルタロジック。
 * web `CompetitionClient.tsx:314-408` の振る舞いを移植したもの。
 */

import { parseISO, startOfDay, isValid } from "date-fns";

export interface EntryOnlyCompetitionRef {
  id: string;
  title: string | null;
  date: string; // "yyyy-MM-dd"
  place: string | null;
  poolType: number | null;
  teamId: string | null;
  teamName: string | null;
}

export interface EntryOnlyEntryRow {
  id: string; // entries.id
  competitionId: string;
  styleId: number | null;
  styleName: string | null;
  entryTime: number | null;
  competition: EntryOnlyCompetitionRef | null;
}

export interface EntryOnlyItem {
  entryId: string;
  competitionId: string;
  competitionName: string;
  date: string;
  place?: string;
  poolType?: number;
  isTeamCompetition: boolean;
  teamId?: string | null;
  teamName?: string;
  styleId?: number;
  styleName: string;
  entryTime: number | null;
}

// "yyyy-MM-dd" のような日付のみの文字列を new Date() に渡すと UTC 深夜としてパースされ、
// 負の UTC オフセットのタイムゾーンではローカル日付が前日にずれる。parseISO はタイムゾーン
// 指定の無い文字列をローカル日付として解釈するため、こちらを使う(project date-fns 規約)。
function isFutureDate(dateStr: string, today: Date): boolean {
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return false;
  return startOfDay(parsed).getTime() > startOfDay(today).getTime();
}

export function buildEntryOnlyItems(
  entryRows: EntryOnlyEntryRow[],
  recordedCompetitionIds: ReadonlySet<string>,
  today: Date,
  fallbackCompetitionName: string,
): EntryOnlyItem[] {
  return entryRows
    .filter((row) => row.competition && !recordedCompetitionIds.has(row.competitionId))
    .filter((row) => !isFutureDate(row.competition!.date, today))
    .map((row) => {
      const competition = row.competition!;
      return {
        entryId: row.id,
        competitionId: row.competitionId,
        competitionName: competition.title || fallbackCompetitionName,
        date: competition.date,
        place: competition.place || undefined,
        poolType: competition.poolType ?? undefined,
        isTeamCompetition: !!competition.teamId,
        teamId: competition.teamId,
        teamName: competition.teamName || undefined,
        styleId: row.styleId ?? undefined,
        styleName: row.styleName || "",
        entryTime: row.entryTime,
      };
    });
}
