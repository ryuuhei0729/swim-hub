/**
 * entryOnlyFilter テスト (Sprint Contract Phase A スケルトン → Phase B 本実装用)
 *
 * 対象: `utils/entryOnlyFilter.ts`（未実装。T-1 の実装で新設される想定）
 *   RecordsScreen 向けの「エントリー済み・記録未登録」大会セクションの純フィルタロジック。
 *   web `CompetitionClient.tsx:314-408` の振る舞いを移植するための契約:
 *
 *   export interface EntryOnlyCompetitionRef {
 *     id: string;
 *     title: string | null;
 *     date: string; // "yyyy-MM-dd"
 *     place: string | null;
 *     poolType: number | null;
 *     teamId: string | null;
 *     teamName: string | null;
 *   }
 *   export interface EntryOnlyEntryRow {
 *     id: string; // entries.id
 *     competitionId: string;
 *     styleId: number | null;
 *     styleName: string | null;
 *     entryTime: number | null;
 *     competition: EntryOnlyCompetitionRef | null;
 *   }
 *   export interface EntryOnlyItem {
 *     entryId: string;
 *     competitionId: string;
 *     competitionName: string;
 *     date: string;
 *     place?: string;
 *     poolType?: number;
 *     isTeamCompetition: boolean;
 *     teamId?: string | null;
 *     teamName?: string;
 *     styleId?: number;
 *     styleName: string;
 *     entryTime: number | null;
 *   }
 *   export function buildEntryOnlyItems(
 *     entryRows: EntryOnlyEntryRow[],
 *     recordedCompetitionIds: ReadonlySet<string>,
 *     today: Date,
 *     fallbackCompetitionName: string,
 *   ): EntryOnlyItem[]
 *
 * Sprint Contract 検証観点:
 *   [V-01] 記録が1件も無い大会のエントリーは一覧に含まれる
 *   [V-02] 同一大会に対して(別の種目のエントリーであっても) records が1件でも存在すれば、
 *          その大会の全エントリーが除外される(大会単位の判定であり、エントリー単位ではない)
 *   [V-03] 大会日が今日より後(未来日)のエントリーは除外される
 *   [V-04] 大会日が「今日」ちょうどのエントリーは除外されない(未来日ではない)
 *   [V-05] competition が null(JOIN欠落)の行は例外を投げずに除外される
 *   [V-06] 大会名が null/空文字のとき fallbackCompetitionName で補完される
 *   [V-07] entryRows が空配列なら空配列を返す(クラッシュしない)
 *
 * トートロジー防止メモ: 期待値は web CompetitionClient.tsx の実装記述(コメント内契約)から
 * 手動で算出したハードコード値であり、本ファイル内で同じフィルタ処理を再実装して比較していない。
 */

import { describe, expect, it } from "vitest";
import {
  buildEntryOnlyItems,
  type EntryOnlyEntryRow,
} from "../entryOnlyFilter";

const FALLBACK_NAME = "(大会名未設定)";

function makeRow(overrides: Partial<EntryOnlyEntryRow> = {}): EntryOnlyEntryRow {
  return {
    id: "entry-1",
    competitionId: "comp-1",
    styleId: 1,
    styleName: "100mFr",
    entryTime: 5800,
    competition: {
      id: "comp-1",
      title: "春季大会",
      date: "2026-01-01",
      place: "市民プール",
      poolType: 0,
      teamId: null,
      teamName: null,
    },
    ...overrides,
  };
}

describe("buildEntryOnlyItems", () => {
  const today = new Date("2026-07-28T00:00:00");

  it("[V-01] 記録が1件も無い過去大会のエントリーは一覧に含まれる", () => {
    const rows = [
      makeRow({
        id: "entry-1",
        competitionId: "comp-1",
        competition: {
          id: "comp-1",
          title: "春季大会",
          date: "2026-01-01",
          place: "市民プール",
          poolType: 0,
          teamId: null,
          teamName: null,
        },
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      entryId: "entry-1",
      competitionId: "comp-1",
      competitionName: "春季大会",
      date: "2026-01-01",
      place: "市民プール",
      poolType: 0,
      isTeamCompetition: false,
      styleName: "100mFr",
      entryTime: 5800,
    });
  });

  it("[V-02] 同一大会に別種目の記録が1件でもあれば、その大会の全エントリーが除外される", () => {
    const rows = [
      makeRow({ id: "entry-fr", competitionId: "comp-1", styleId: 1, styleName: "100mFr" }),
      makeRow({ id: "entry-br", competitionId: "comp-1", styleId: 2, styleName: "100mBr" }),
    ];
    // comp-1 に対する records が(別種目・別エントリー由来でも)1件でも存在する
    const recordedCompetitionIds = new Set(["comp-1"]);

    const result = buildEntryOnlyItems(rows, recordedCompetitionIds, today, FALLBACK_NAME);

    expect(result).toHaveLength(0);
  });

  it("[V-03] 大会日が未来(明日)のエントリーは除外される", () => {
    const rows = [
      makeRow({
        competition: {
          id: "comp-future",
          title: "来月の大会",
          date: "2026-07-29",
          place: null,
          poolType: 1,
          teamId: null,
          teamName: null,
        },
        competitionId: "comp-future",
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result).toHaveLength(0);
  });

  it("[V-04] 大会日が今日ちょうどのエントリーは除外されない", () => {
    const rows = [
      makeRow({
        competition: {
          id: "comp-today",
          title: "本日開催",
          date: "2026-07-28",
          place: null,
          poolType: 0,
          teamId: null,
          teamName: null,
        },
        competitionId: "comp-today",
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result).toHaveLength(1);
    expect(result[0].competitionId).toBe("comp-today");
  });

  it("[V-05] competition が null の行は除外され、例外も投げない", () => {
    const rows = [makeRow({ competition: null })];

    expect(() => buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME)).not.toThrow();
    expect(buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME)).toHaveLength(0);
  });

  it("[V-06] 大会名が null のとき fallbackCompetitionName で補完される", () => {
    const rows = [
      makeRow({
        competition: {
          id: "comp-1",
          title: null,
          date: "2026-01-01",
          place: null,
          poolType: 0,
          teamId: null,
          teamName: null,
        },
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result[0].competitionName).toBe(FALLBACK_NAME);
  });

  it("[V-06b] 大会名が空文字のとき fallbackCompetitionName で補完される", () => {
    const rows = [
      makeRow({
        competition: {
          id: "comp-1",
          title: "",
          date: "2026-01-01",
          place: null,
          poolType: 0,
          teamId: null,
          teamName: null,
        },
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result[0].competitionName).toBe(FALLBACK_NAME);
  });

  it("[V-07] entryRows が空配列なら空配列を返す", () => {
    expect(buildEntryOnlyItems([], new Set(), today, FALLBACK_NAME)).toEqual([]);
  });

  it("チーム大会の場合 isTeamCompetition=true・teamName が引き継がれる", () => {
    const rows = [
      makeRow({
        competition: {
          id: "comp-team",
          title: "チーム対抗戦",
          date: "2026-01-01",
          place: "第一プール",
          poolType: 1,
          teamId: "team-1",
          teamName: "Aチーム",
        },
        competitionId: "comp-team",
      }),
    ];

    const result = buildEntryOnlyItems(rows, new Set(), today, FALLBACK_NAME);

    expect(result[0]).toMatchObject({
      isTeamCompetition: true,
      teamId: "team-1",
      teamName: "Aチーム",
    });
  });
});
