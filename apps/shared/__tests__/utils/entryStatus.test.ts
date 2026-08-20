/**
 * resolveEntryStatus 単体テスト (Sprint Contract SC-8)
 *
 * QA Phase A: Developer 実装前に先行して書く。実装ファイル
 * `apps/shared/utils/entryStatus.ts` が存在しないため、このテストは
 * 現時点で import エラーにより赤くなるのが正しい (Phase B で緑化を確認する)。
 *
 * 契約 (PM Sprint Contract D-4, D-1, DL-1):
 *   resolveEntryStatus(date, entryStatus) は「大会日が過去なら常に closed、
 *   それ以外は DB の entry_status をそのまま (null/undefined は 'before' 既定)」
 *   を返す純粋関数。DB 値は書き換えない = 表示派生のみ。
 *
 * トートロジー回避方針:
 * - 日付は `new Date()` からの相対計算で生成する (固定日付のハードコード禁止)。
 *   ただし同一テスト実行中の日跨ぎによるフレークを避けるため vi.useFakeTimers で
 *   「現在時刻」を固定した上で、その固定時刻からの相対 (前日/当日/翌日) を使う。
 * - `isCompetitionDateInPast` (既存関数、変更対象外) との整合性もクロスチェックし、
 *   Developer が独自の日付比較ロジックを新設していないことを behavior レベルで担保する
 *   (契約: 新設禁止 かつ 既存関数を再利用すること)。
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { addDays, format, subDays } from "date-fns";
import { isCompetitionDateInPast } from "../../utils/date";
// 実装未着手のため、このパスは Phase B で Developer が作成する想定。
// (現時点では import 自体がモジュール解決エラーになり、テストは赤になる)
import { resolveEntryStatus, type EntryStatus } from "../../utils/entryStatus";

const STATUSES: EntryStatus[] = ["before", "open", "closed"];

describe("resolveEntryStatus", () => {
  // 現在時刻を固定し、その相対で today/yesterday/tomorrow を導出する。
  // ハードコードされた特定の日付には一切依存しない。
  const FIXED_NOW = new Date("2026-03-15T12:00:00");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const TODAY = format(FIXED_NOW, "yyyy-MM-dd");
  const YESTERDAY = format(subDays(FIXED_NOW, 1), "yyyy-MM-dd");
  const TOMORROW = format(addDays(FIXED_NOW, 1), "yyyy-MM-dd");

  // ---------------------------------------------------------------------
  // 境界値: date = null / undefined / 空文字 / 不正形式
  // → 自動 closed しない。DB 値をそのまま (安全側)。
  // ---------------------------------------------------------------------
  describe.each([
    ["null", null],
    ["undefined", undefined],
    ["空文字", ""],
    ["不正形式 (not-a-date)", "not-a-date"],
    ["不正形式 (スラッシュ区切り)", "2026/03/15"],
  ] as const)("date = %s のとき", (_label, date) => {
    it.each(STATUSES)("entryStatus=%s はそのまま返る (自動 closed しない)", (status) => {
      expect(resolveEntryStatus(date, status)).toBe(status);
    });

    it("entryStatus が未指定 (null) のときは既定値 'before' を返す", () => {
      expect(resolveEntryStatus(date, null)).toBe("before");
    });

    it("entryStatus が未指定 (undefined) のときは既定値 'before' を返す", () => {
      expect(resolveEntryStatus(date, undefined)).toBe("before");
    });
  });

  // ---------------------------------------------------------------------
  // 今日 → 過去扱いしない (DB 値のまま)
  // ---------------------------------------------------------------------
  describe("date = 今日", () => {
    it.each(STATUSES)("entryStatus=%s はそのまま返る (今日は過去扱いしない)", (status) => {
      expect(resolveEntryStatus(TODAY, status)).toBe(status);
    });

    it("entryStatus 未指定なら 'before' を返す", () => {
      expect(resolveEntryStatus(TODAY, undefined)).toBe("before");
    });
  });

  // ---------------------------------------------------------------------
  // 未来 → 過去扱いしない (DB 値のまま。closed を勝手に open へ戻さない)
  // ---------------------------------------------------------------------
  describe("date = 未来 (明日)", () => {
    it.each(STATUSES)("entryStatus=%s はそのまま返る", (status) => {
      expect(resolveEntryStatus(TOMORROW, status)).toBe(status);
    });
  });

  // ---------------------------------------------------------------------
  // 過去 → DB 値に関わらず常に 'closed' (表示派生。DB は書き換えない)
  // ---------------------------------------------------------------------
  describe("date = 過去 (昨日)", () => {
    it.each(STATUSES)(
      "entryStatus=%s であっても 'closed' を返す (過去日は自動的に受付終了表示)",
      (status) => {
        expect(resolveEntryStatus(YESTERDAY, status)).toBe("closed");
      },
    );

    it("entryStatus が未指定でも 'closed' を返す (既定値 'before' より過去判定が優先される)", () => {
      expect(resolveEntryStatus(YESTERDAY, null)).toBe("closed");
      expect(resolveEntryStatus(YESTERDAY, undefined)).toBe("closed");
    });

    it("既に DB closed の過去日は冪等に 'closed' を返す", () => {
      expect(resolveEntryStatus(YESTERDAY, "closed")).toBe("closed");
    });
  });

  // ---------------------------------------------------------------------
  // 既存 isCompetitionDateInPast との整合性クロスチェック
  // (Developer が独自の日付比較ロジックを新設していないことを behavior で担保)
  // ---------------------------------------------------------------------
  describe("isCompetitionDateInPast との整合性", () => {
    const CANDIDATE_DATES = [null, undefined, "", "not-a-date", TODAY, YESTERDAY, TOMORROW];

    it.each(CANDIDATE_DATES)(
      "date=%s: 過去判定が一致する場合のみ 'closed' を返す",
      (date) => {
        const expectClosed = isCompetitionDateInPast(date);
        const result = resolveEntryStatus(date, "open");
        if (expectClosed) {
          expect(result).toBe("closed");
        } else {
          expect(result).toBe("open");
        }
      },
    );
  });
});
