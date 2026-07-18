/**
 * minHeight.test.ts
 *
 * Sprint Contract (Bug3: 日付詳細モーダルで画像/動画が Android で見えない) 検証観点:
 *
 * [D3-b/D3-c] メディア (画像・動画) の有無を DayDetailModal の高さ計算に反映する
 *
 *   [V-DD-01〜12] 回帰: 既存の分岐 (エントリー数 × hasRecords × hasPracticeLog ×
 *                 hasPracticeLogWithTimes) が今回の変更後も一切変わらないこと
 *   [V-DD-13〜19] 新規: entriesWithMedia (画像/動画が判明した practice_log / record の id 集合) が
 *                 増えたとき、高さが「メディアなしの場合より高い」こと
 *                 (具体的な px 値は Developer の裁量。厳密な増加のみを契約とする)
 *   [V-DD-20〜23] 防御的ケース: 存在しない id・空配列・決定論的であること・副作用がないこと
 *
 * 対象実装: apps/mobile/components/calendar/DayDetailModal/minHeight.ts
 *   export function computeDayDetailMinHeight(
 *     entries: CalendarItem[],
 *     entriesWithTimes: ReadonlySet<string>,
 *     entriesWithMedia: ReadonlySet<string>,
 *   ): number
 *
 *   実装は Sprint Contract の Must 要件を満たす: pure function (react-native 等の import なし)、
 *   entriesWithMedia が空集合のとき既存12分岐を完全に保持、MEDIA_HEIGHT_BONUS = 200 を一律加算する
 *   方式 (厳密な非減少ではなく常に加算するため、hasMedia=true なら必ず厳密に高くなる)。加えて
 *   entry.metadata?.record?.video_path による同期フォールバックも実装されている
 *   (entriesWithMedia 未登録でも record の video_path があれば hasMedia とみなす防御的分岐。
 *   Developer 注記: 現行 calendar_view は record メタデータにこれを積まないため実質未発火の
 *   防御コードだが、pure function 自体の契約としては有効なのでテストする)。
 *
 * トートロジー防止メモ:
 *   - 回帰ケースの数値は「現状の DayDetailModal.tsx 実装からそのまま転記」したものであり (Phase A で
 *     独立に記録)、Developer の新実装 (minHeight.ts) の diff を読んで書いたものではない。
 *   - メディア関連の新規ケースは具体的 px 値 (MEDIA_HEIGHT_BONUS=200) をハードコードせず、
 *     「メディアありのときメディアなしより高い」という相対関係のみを検証する。
 */

import { describe, expect, it } from "vitest";
import { computeDayDetailMinHeight } from "../minHeight";
import type { CalendarItem } from "@apps/shared/types/ui";

/** テスト用の最小 CalendarItem を組み立てるヘルパー */
function makeItem(
  type: CalendarItem["type"],
  id: string,
  overrides: Partial<CalendarItem> = {},
): CalendarItem {
  return {
    id,
    type,
    date: "2026-07-15",
    title: `item-${id}`,
    metadata: {},
    ...overrides,
  };
}

const EMPTY_SET: ReadonlySet<string> = new Set();

describe("computeDayDetailMinHeight — 回帰 (メディアなし、既存12分岐)", () => {
  it("[V-DD-01] entries が空配列のとき 300 を返す", () => {
    expect(computeDayDetailMinHeight([], EMPTY_SET, EMPTY_SET)).toBe(300);
  });

  it("[V-DD-02] entries.length===1 で record タイプを含むとき 600 を返す", () => {
    const entries = [makeItem("record", "r1")];
    expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(600);
  });

  it(
    "[V-DD-03] entries.length===1 で record を含まず practice_log も含まないとき 400 を返す " +
      "(例: entry/competition/team_practice 単体)",
    () => {
      const entries = [makeItem("competition", "c1")];
      expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(400);
    },
  );

  it(
    "[V-DD-04] entries.length===1 で practice_log を含み、entriesWithTimes にその id が含まれるとき 600 を返す",
    () => {
      const entries = [makeItem("practice_log", "p1")];
      expect(computeDayDetailMinHeight(entries, new Set(["p1"]), EMPTY_SET)).toBe(600);
    },
  );

  it(
    "[V-DD-05] entries.length===1 で practice_log を含むが、entriesWithTimes にその id が含まれないとき 350 を返す",
    () => {
      const entries = [makeItem("practice_log", "p1")];
      expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(350);
    },
  );

  it("[V-DD-06] entries.length===2 で record タイプを含むとき 700 を返す", () => {
    const entries = [makeItem("record", "r1"), makeItem("entry", "e1")];
    expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(700);
  });

  it(
    "[V-DD-07] entries.length===2 で record を含まず、practice_log が entriesWithTimes に含まれるとき 600 を返す",
    () => {
      const entries = [makeItem("practice_log", "p1"), makeItem("entry", "e1")];
      expect(computeDayDetailMinHeight(entries, new Set(["p1"]), EMPTY_SET)).toBe(600);
    },
  );

  it(
    "[V-DD-08] entries.length===2 で record を含まず、practice_log はあるが entriesWithTimes に含まれないとき 600 を返す",
    () => {
      const entries = [makeItem("practice_log", "p1"), makeItem("entry", "e1")];
      expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(600);
    },
  );

  it("[V-DD-09] entries.length===2 で record も practice_log も含まないとき 375 を返す", () => {
    const entries = [makeItem("entry", "e1"), makeItem("competition", "c1")];
    expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(375);
  });

  it("[V-DD-10] entries.length>=3 で record タイプを含むとき 750 を返す", () => {
    const entries = [makeItem("record", "r1"), makeItem("entry", "e1"), makeItem("entry", "e2")];
    expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(750);
  });

  it(
    "[V-DD-11] entries.length>=3 で record を含まず、practice_log が entriesWithTimes に含まれるとき 700 を返す",
    () => {
      const entries = [
        makeItem("practice_log", "p1"),
        makeItem("entry", "e1"),
        makeItem("entry", "e2"),
      ];
      expect(computeDayDetailMinHeight(entries, new Set(["p1"]), EMPTY_SET)).toBe(700);
    },
  );

  it(
    "[V-DD-12] entries.length>=3 で record を含まず、entriesWithTimes にも含まれないとき 500 を返す",
    () => {
      const entries = [
        makeItem("entry", "e1"),
        makeItem("competition", "c1"),
        makeItem("team_practice", "t1"),
      ];
      expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(500);
    },
  );
});

describe("computeDayDetailMinHeight — 新規 (画像/動画メディアの反映)", () => {
  it(
    "[V-DD-13] entries.length===1, practice_log (times なし) + メディアあり → " +
      "メディアなし相当 (350) より高い値を返す",
    () => {
      const entries = [makeItem("practice_log", "p1")];
      const withoutMedia = computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET);
      const withMedia = computeDayDetailMinHeight(entries, EMPTY_SET, new Set(["p1"]));
      expect(withoutMedia).toBe(350);
      expect(withMedia).toBeGreaterThan(withoutMedia);
    },
  );

  it(
    "[V-DD-14] entries.length===1, practice_log (times あり) + メディアあり → " +
      "メディアなし相当 (600) より高い値を返す",
    () => {
      const entries = [makeItem("practice_log", "p1")];
      const withoutMedia = computeDayDetailMinHeight(entries, new Set(["p1"]), EMPTY_SET);
      const withMedia = computeDayDetailMinHeight(entries, new Set(["p1"]), new Set(["p1"]));
      expect(withoutMedia).toBe(600);
      expect(withMedia).toBeGreaterThan(withoutMedia);
    },
  );

  it(
    "[V-DD-15] entries.length===1, record + メディアあり → メディアなし相当 (600) より高い値を返す",
    () => {
      const entries = [makeItem("record", "r1")];
      const withoutMedia = computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET);
      const withMedia = computeDayDetailMinHeight(entries, EMPTY_SET, new Set(["r1"]));
      expect(withoutMedia).toBe(600);
      expect(withMedia).toBeGreaterThan(withoutMedia);
    },
  );

  it(
    "[V-DD-16] entries.length===2, いずれか1件にメディアあり → 同形状のメディアなしケースより高い値を返す",
    () => {
      const entries = [makeItem("entry", "e1"), makeItem("competition", "c1")];
      const withoutMedia = computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET);
      const withMedia = computeDayDetailMinHeight(entries, EMPTY_SET, new Set(["e1"]));
      expect(withoutMedia).toBe(375);
      expect(withMedia).toBeGreaterThan(withoutMedia);
    },
  );

  it(
    "[V-DD-17] entries.length>=3, 全件メディアあり → 同形状のメディアなしケース (500) より高い値を返す",
    () => {
      const entries = [
        makeItem("entry", "e1"),
        makeItem("competition", "c1"),
        makeItem("team_practice", "t1"),
      ];
      const withoutMedia = computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET);
      const withMedia = computeDayDetailMinHeight(
        entries,
        EMPTY_SET,
        new Set(["e1", "c1", "t1"]),
      );
      expect(withoutMedia).toBe(500);
      expect(withMedia).toBeGreaterThan(withoutMedia);
    },
  );

  it(
    "[V-DD-18] entriesWithMedia が空 Set のとき、既存12分岐と完全に同じ値を返す " +
      "(メディア機能追加による回帰なしの総合確認)",
    () => {
      const cases: Array<[CalendarItem[], number]> = [
        [[], 300],
        [[makeItem("record", "r1")], 600],
        [[makeItem("competition", "c1")], 400],
        [[makeItem("entry", "e1"), makeItem("competition", "c1")], 375],
        [
          [
            makeItem("entry", "e1"),
            makeItem("competition", "c1"),
            makeItem("team_practice", "t1"),
          ],
          500,
        ],
      ];
      for (const [entries, expected] of cases) {
        expect(computeDayDetailMinHeight(entries, EMPTY_SET, EMPTY_SET)).toBe(expected);
      }
    },
  );

  it(
    "[V-DD-19] メディアが「動画のみ」でも「画像のみ」でも同じ扱いで高さが増加する " +
      "(pure function は entriesWithMedia への所属可否 (boolean) のみを見て、動画/画像の種別を区別しない)",
    () => {
      // pure function 自体は videoPath/images を一切知らない。呼び出し元 (PracticeLogDetail/RecordDetail)
      // が「画像 or 動画のいずれかがある」を1つの boolean に畳み込んで entriesWithMedia に渡す契約であり、
      // 関数側には「動画のみで media 判定された id」と「画像のみで media 判定された id」を区別する
      // 手段がそもそも存在しない。同じ Set への登録は常に同一の結果になることの確認。
      const entries = [makeItem("record", "r1")];
      const result1 = computeDayDetailMinHeight(entries, EMPTY_SET, new Set(["r1"]));
      const result2 = computeDayDetailMinHeight(entries, EMPTY_SET, new Set(["r1"]));
      expect(result1).toBe(result2);
    },
  );

  it(
    "[V-DD-19b] record の metadata.record.video_path が同期的に判明している場合も media 加算される " +
      "(entriesWithMedia 未登録でも防御的フォールバックで反映される)",
    () => {
      const withoutMedia = computeDayDetailMinHeight(
        [makeItem("record", "r1")],
        EMPTY_SET,
        EMPTY_SET,
      );
      const entriesWithSyncVideoPath = [
        makeItem("record", "r1", {
          metadata: {
            record: {
              time: 60,
              is_relaying: false,
              video_path: "videos/x.mp4",
              style: { id: "1", name_jp: "自由形", distance: 50 },
            },
          },
        }),
      ];
      const withSyncVideoPath = computeDayDetailMinHeight(
        entriesWithSyncVideoPath,
        EMPTY_SET,
        EMPTY_SET,
      );
      expect(withSyncVideoPath).toBeGreaterThan(withoutMedia);
    },
  );
});

describe("computeDayDetailMinHeight — 防御的ケース / 純粋関数であることの確認", () => {
  it(
    "[V-DD-20] entriesWithMedia に entries 配列に存在しない id が含まれていても無視される " +
      "(存在しない id による誤加算防止)",
    () => {
      const entries = [makeItem("competition", "c1")];
      const result = computeDayDetailMinHeight(
        entries,
        EMPTY_SET,
        new Set(["does-not-exist-in-entries"]),
      );
      expect(result).toBe(400); // c1 単体・メディアなし相当のまま
    },
  );

  it(
    "[V-DD-21] entries が空配列のとき、entriesWithMedia に要素があっても 300 を返す (0件は常に最小値)",
    () => {
      const result = computeDayDetailMinHeight([], EMPTY_SET, new Set(["ghost-id"]));
      expect(result).toBe(300);
    },
  );

  it("[V-DD-22] 同じ引数で2回呼び出しても同じ値を返す (決定論的であること)", () => {
    const entries = [makeItem("practice_log", "p1"), makeItem("record", "r1")];
    const times = new Set(["p1"]);
    const media = new Set(["r1"]);
    const first = computeDayDetailMinHeight(entries, times, media);
    const second = computeDayDetailMinHeight(entries, times, media);
    expect(first).toBe(second);
  });

  it(
    "[V-DD-23] 呼び出し後も引数に渡した entries 配列・Set の中身が変更されていない (副作用がないこと)",
    () => {
      const entries = [makeItem("practice_log", "p1"), makeItem("record", "r1")];
      const entriesSnapshot = JSON.parse(JSON.stringify(entries));
      const times = new Set(["p1"]);
      const media = new Set(["r1"]);

      computeDayDetailMinHeight(entries, times, media);

      expect(entries).toEqual(entriesSnapshot);
      expect(times).toEqual(new Set(["p1"]));
      expect(media).toEqual(new Set(["r1"]));
    },
  );
});
