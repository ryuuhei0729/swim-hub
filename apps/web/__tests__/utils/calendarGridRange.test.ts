/**
 * getCalendarGridRange ユニットテスト
 *
 * テスト観点: Sprint Contract [V-05]
 * カレンダーグリッドの可視範囲（日曜起点、前月末〜翌月初を含む）が
 * 正しく計算されることを検証する。
 *
 * 重要: このテストは実装に依存しない。
 * 手計算で求めた具体的な日付文字列でアサーションする（トートロジー回避）。
 *
 * TZ 非依存化の方針:
 * - 曜日チェックは new Date(dateStr + "T00:00:00Z").getUTCDay() で行う。
 *   new Date("yyyy-MM-dd") はブラウザ/Node により UTC 深夜として解釈されるため、
 *   getDay()（ローカル時刻基準）を使うと UTC-1 以西の環境で誤った曜日を返す。
 *   getUTCDay() なら常に UTC 基準で曜日を取得できる。
 * - 日数差分は T00:00:00Z で明示的に UTC として Date を生成し、
 *   getTime() のミリ秒差分で算出する（DST の影響を受けない）。
 */

import { describe, it, expect } from "vitest";
import { getCalendarGridRange } from "@/app/[locale]/(authenticated)/dashboard/_utils/calendarGridRange";

describe("getCalendarGridRange", () => {
  // =========================================================================
  // 通常ケース（主バグ対象: 2026年6月）
  // =========================================================================
  describe("2026年6月 (月初=月曜, 月末=火曜) — 主バグケース", () => {
    it("startDate が 5/31（前月末の日曜）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2026, 5, 15));
      expect(startDate).toBe("2026-05-31");
    });

    it("endDate が 7/4（翌月の最初の土曜）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2026, 5, 15));
      expect(endDate).toBe("2026-07-04");
    });

    it("月の途中の任意の日を渡しても同じ結果になる", () => {
      const fromFirst = getCalendarGridRange(new Date(2026, 5, 1));
      const fromMiddle = getCalendarGridRange(new Date(2026, 5, 15));
      const fromLast = getCalendarGridRange(new Date(2026, 5, 30));
      expect(fromFirst.startDate).toBe(fromMiddle.startDate);
      expect(fromFirst.endDate).toBe(fromMiddle.endDate);
      expect(fromFirst.startDate).toBe(fromLast.startDate);
      expect(fromFirst.endDate).toBe(fromLast.endDate);
    });
  });

  // =========================================================================
  // 境界ケース1: 月初が日曜（前月はみ出しゼロ）
  // 2025年6月: 月初=日曜(0), 月末=月曜(1)
  // =========================================================================
  describe("2025年6月 (月初=日曜) — 前月はみ出しゼロ", () => {
    it("startDate が月初当日 6/1 になる（前月にはみ出さない）", () => {
      const { startDate } = getCalendarGridRange(new Date(2025, 5, 1));
      expect(startDate).toBe("2025-06-01");
    });

    it("endDate が 7/5（翌月の最初の土曜）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2025, 5, 1));
      expect(endDate).toBe("2025-07-05");
    });
  });

  // =========================================================================
  // 境界ケース2: 月末が土曜（翌月はみ出しゼロ）
  // 2026年1月: 月初=木曜(4), 月末=土曜(6)
  // =========================================================================
  describe("2026年1月 (月末=土曜) — 翌月はみ出しゼロ", () => {
    it("endDate が月末当日 1/31 になる（翌月にはみ出さない）", () => {
      const { endDate } = getCalendarGridRange(new Date(2026, 0, 1));
      expect(endDate).toBe("2026-01-31");
    });

    it("startDate が 12/28（前月末の日曜）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2026, 0, 1));
      expect(startDate).toBe("2025-12-28");
    });
  });

  // =========================================================================
  // 境界ケース3: 月末が日曜（翌月6日まではみ出す — 最大はみ出し）
  // 2025年11月: 月初=土曜(6), 月末=日曜(0)
  // グリッドが6週になるケース
  // =========================================================================
  describe("2025年11月 (月末=日曜, 月初=土曜) — 翌月6日はみ出し・6週グリッド", () => {
    it("startDate が 10/26（前月末の日曜）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2025, 10, 1));
      expect(startDate).toBe("2025-10-26");
    });

    it("endDate が 12/6（翌月の6日=土曜）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2025, 10, 1));
      expect(endDate).toBe("2025-12-06");
    });
  });

  // =========================================================================
  // 境界ケース4: 月初が土曜・月末が月曜（6週グリッド）
  // 2026年8月: 月初=土曜(6), 月末=月曜(1)
  // =========================================================================
  describe("2026年8月 (月初=土曜, 月末=月曜) — 6週グリッド", () => {
    it("startDate が 7/26（前月末の日曜）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2026, 7, 1));
      expect(startDate).toBe("2026-07-26");
    });

    it("endDate が 9/5（翌月の最初の土曜）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2026, 7, 1));
      expect(endDate).toBe("2026-09-05");
    });
  });

  // =========================================================================
  // 戻り値の型・形式チェック
  // =========================================================================
  describe("戻り値の形式", () => {
    it("startDate と endDate を含むオブジェクトを返す", () => {
      const result = getCalendarGridRange(new Date(2026, 5, 1));
      expect(result).toHaveProperty("startDate");
      expect(result).toHaveProperty("endDate");
    });

    it("startDate と endDate は yyyy-MM-dd 形式の文字列である", () => {
      const { startDate, endDate } = getCalendarGridRange(new Date(2026, 5, 1));
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("startDate は endDate より前になる", () => {
      const { startDate, endDate } = getCalendarGridRange(new Date(2026, 5, 1));
      expect(startDate < endDate).toBe(true);
    });

    it("startDate は常に日曜日（0）に対応する日付になる", () => {
      // 2026年6月の startDate = 2026-05-31 (日曜)
      // TZ 非依存: "yyyy-MM-dd" 文字列を UTC深夜として解釈し getUTCDay() で曜日を取得
      const { startDate } = getCalendarGridRange(new Date(2026, 5, 1));
      const day = new Date(startDate + "T00:00:00Z").getUTCDay();
      expect(day).toBe(0); // 0 = 日曜
    });

    it("endDate は常に土曜日（6）に対応する日付になる", () => {
      // 2026年6月の endDate = 2026-07-04 (土曜)
      // TZ 非依存: "yyyy-MM-dd" 文字列を UTC深夜として解釈し getUTCDay() で曜日を取得
      const { endDate } = getCalendarGridRange(new Date(2026, 5, 1));
      const day = new Date(endDate + "T00:00:00Z").getUTCDay();
      expect(day).toBe(6); // 6 = 土曜
    });
  });

  // =========================================================================
  // グリッド週数チェック（5週または6週）
  // =========================================================================
  describe("グリッド日数の整合性", () => {
    it("2026年6月のグリッドは35日（5週）になる", () => {
      const { startDate, endDate } = getCalendarGridRange(new Date(2026, 5, 1));
      // TZ 非依存: T00:00:00Z を付与して UTC 深夜として生成し、getTime() 差分で日数を算出
      const start = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T00:00:00Z");
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(diffDays).toBe(35);
    });

    it("2025年11月のグリッドは42日（6週）になる", () => {
      const { startDate, endDate } = getCalendarGridRange(new Date(2025, 10, 1));
      // TZ 非依存: T00:00:00Z を付与して UTC 深夜として生成し、getTime() 差分で日数を算出
      const start = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T00:00:00Z");
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(diffDays).toBe(42);
    });
  });

  // =========================================================================
  // うるう年ケース（T-2 リグレッション保険）
  // 2024年2月: 月末 = 2/29 (木曜=4), 月初 = 2/1 (木曜=4)
  // =========================================================================
  describe("2024年2月 (うるう年・月末=木曜) — T-2 リグレッション保険", () => {
    it("startDate が 1/28（前月末の日曜）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2024, 1, 1));
      expect(startDate).toBe("2024-01-28");
    });

    it("endDate が 3/2（翌月の最初の土曜）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2024, 1, 1));
      expect(endDate).toBe("2024-03-02");
    });

    it("グリッドは35日（5週）になる", () => {
      const { startDate, endDate } = getCalendarGridRange(new Date(2024, 1, 1));
      const start = new Date(startDate + "T00:00:00Z");
      const end = new Date(endDate + "T00:00:00Z");
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
      expect(diffDays).toBe(35);
    });

    it("startDate が日曜（UTC基準）になる", () => {
      const { startDate } = getCalendarGridRange(new Date(2024, 1, 1));
      expect(new Date(startDate + "T00:00:00Z").getUTCDay()).toBe(0);
    });

    it("endDate が土曜（UTC基準）になる", () => {
      const { endDate } = getCalendarGridRange(new Date(2024, 1, 1));
      expect(new Date(endDate + "T00:00:00Z").getUTCDay()).toBe(6);
    });
  });
});
