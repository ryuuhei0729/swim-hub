// =============================================================================
// 期間の軸: 年度判定 / 選択肢 / 逆引き / 注意書きの述語
//   ([V-P2-69] [V-P2-01] [V-P2-02] [V-P2-57] [V-P2-60] [V-P2-29])
//
// 対象:
//   apps/shared/utils/date.ts             … resolveFiscalYear (4/1 基準)
//   apps/shared/utils/rankingEventAxis.ts … 選択肢・逆引き・注意書きの述語
//
// ⚠️ **`resolveFiscalYear` は第2弾で新設されたのにテストが1件も無かった**
//    (`domesticRecords.ts` の `resolveAgeCategory` 経由で間接的に守られている
//     だけだった)。直接テストを置く。
//
// ─────────────────────────────────────────────────────────────────────────────
// タイムゾーンについて
//
// `resolveFiscalYear` は `today.getMonth()` / `getFullYear()` = **ローカル時刻**
// を読む。PM 裁定 (2026-09-09) で Asia/Tokyo 固定にはしない — 海外在住の
// ユーザーが自分の地域の日付を見るのは誤りではなく、年度リストは UI の便宜で、
// **集計の権威は RPC 側の `c.date` (日付型) にある**ため。
//
// そのため本ファイルは **`new Date(y, m, d)` (ローカル成分指定) で日付を作る**。
// `new Date("2027-04-01T00:00:00Z")` のような UTC 指定にすると、TZ=UTC の CI と
// Asia/Tokyo の手元で `getMonth()` が違う値になり**環境依存の赤**になる。
// ─────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFiscalYear } from "../../utils/date";
import {
  RANKING_EXPLICIT_FISCAL_YEAR_COUNT,
  buildRankingPeriodChoices,
  parseRankingPeriodValue,
  shouldShowFiscalYearNote,
  toRankingPeriodValue,
  type RankingFilterState,
  type RankingPeriodChoice,
} from "../../utils/rankingEventAxis";
import type { RankingPeriod } from "../../types";

// =============================================================================
describe("[V-P2-69] resolveFiscalYear — 4/1 基準の年度判定", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    // [ラベル, ローカル日付, 期待年度]
    ["4/1 (年度の開始)", new Date(2027, 3, 1), 2027],
    ["3/31 (年度の最終日)", new Date(2027, 2, 31), 2026],
    ["1/1 (年度の途中・年が変わった直後)", new Date(2027, 0, 1), 2026],
    ["12/31 (年度の途中)", new Date(2026, 11, 31), 2026],
    ["4/30", new Date(2026, 3, 30), 2026],
    ["2/29 (閏年)", new Date(2028, 1, 29), 2027],
  ])("%s → FY%i", (_label, today, expected) => {
    expect(resolveFiscalYear(today)).toBe(expected);
  });

  it("🚨 3/31 と 4/1 の1日差で年度が変わる (オフバイワンの本体)", () => {
    // 隣接2日を対で見る。片方だけの assert では `>= 3` を `> 3` や `>= 2` に
    // 変えても片側が通ってしまう
    expect(resolveFiscalYear(new Date(2027, 2, 31))).toBe(2026);
    expect(resolveFiscalYear(new Date(2027, 3, 1))).toBe(2027);
    expect(resolveFiscalYear(new Date(2027, 3, 1)) - resolveFiscalYear(new Date(2027, 2, 31))).toBe(
      1,
    );
  });

  it("🚨 3月と4月以外の月境界では年度が変わらない (境界が 4/1 だけである否定形)", () => {
    // `>= 3` (0-indexed の4月) 以外の月に境界を作る実装への退行を検出。
    // 2026年度は 2026-04-01 〜 2027-03-31 なので、その間のどの月末でも 2026
    for (const [month, day] of [
      [4, 30],
      [5, 30],
      [6, 31],
      [7, 31],
      [8, 30],
      [9, 31],
      [10, 30],
      [11, 31],
    ] as const) {
      expect(resolveFiscalYear(new Date(2026, month, day)), `2026-${month + 1}-${day}`).toBe(2026);
    }
    for (const [month, day] of [
      [0, 31],
      [1, 28],
      [2, 31],
    ] as const) {
      expect(resolveFiscalYear(new Date(2027, month, day)), `2027-${month + 1}-${day}`).toBe(2026);
    }
  });

  it("🚨 引数を省略すると `new Date()` にフォールバックする (この経路だけが TZ 依存)", () => {
    // ⚠️ **この経路の存在自体を固定する。** 呼び出し側 (`buildRankingPeriodChoices`)
    //    は `today` を渡せる設計になっているが、渡さない呼び出しが残っており
    //    そこだけがシステム時刻とローカル TZ に依存する。
    //    省略時の挙動が変わる (例: UTC 固定にする) と、年度リストの見え方が
    //    境界の前後で変わるので、**暗黙にせず明示的に固定しておく**。
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 3, 1, 0, 30)); // ローカル 4/1 00:30
    expect(resolveFiscalYear()).toBe(2027);

    vi.setSystemTime(new Date(2027, 2, 31, 23, 30)); // ローカル 3/31 23:30
    expect(resolveFiscalYear()).toBe(2026);
  });
});

// =============================================================================
describe("[V-P2-60] 期間の選択肢 — 明示年度と「以前」バケットが隣接して重複しない", () => {
  /** 現年度を固定して選択肢を得る (`new Date()` に依存しない) */
  const choicesAt = (fiscalYear: number): RankingPeriodChoice[] =>
    // ローカル成分で「その年度の 6/1」を作る = 年度は fiscalYear になる
    buildRankingPeriodChoices(new Date(fiscalYear, 5, 1));

  it("通算 + 明示3年度 + 以前 の 5 件で、順序が固定されている", () => {
    // 期待値はリテラル。`RANKING_EXPLICIT_FISCAL_YEAR_COUNT` を式に使うと
    // 定数を変えたときテストが一緒に動いてしまい何も固定できない
    expect(choicesAt(2026).map((choice) => choice.value)).toEqual([
      "allTime",
      "fy:2026",
      "fy:2025",
      "fy:2024",
      "fyle:2023",
    ]);
  });

  it("明示年度の件数が定数と一致する (定数だけ変えて配列が追従しない状態を検出)", () => {
    expect(RANKING_EXPLICIT_FISCAL_YEAR_COUNT).toBe(3);
    const explicit = choicesAt(2026).filter((choice) => choice.period.kind === "fiscalYear");
    expect(explicit).toHaveLength(RANKING_EXPLICIT_FISCAL_YEAR_COUNT);
  });

  it("🚨 「以前」の上端は明示年度の最小より**ちょうど 1 小さい**", () => {
    const choices = choicesAt(2026);
    const explicitYears = choices
      .filter((choice) => choice.period.kind === "fiscalYear")
      .map((choice) => (choice.period as { year: number }).year);
    const orEarlier = choices.find((choice) => choice.period.kind === "fiscalYearOrEarlier");

    expect(orEarlier).toBeDefined();
    const orEarlierYear = (orEarlier!.period as { year: number }).year;
    expect(orEarlierYear).toBe(Math.min(...explicitYears) - 1);
  });

  it("🚨 どの年度も2つのバケットに属さない (二重計上の検出)", () => {
    const choices = choicesAt(2026);
    const explicitYears = choices
      .filter((choice) => choice.period.kind === "fiscalYear")
      .map((choice) => (choice.period as { year: number }).year);
    const orEarlierYear = (
      choices.find((choice) => choice.period.kind === "fiscalYearOrEarlier")!.period as {
        year: number;
      }
    ).year;

    // 「以前」は上端以下すべてを含むので、明示年度がその範囲に入っていたら二重計上
    for (const year of explicitYears) {
      expect(year, `FY${year} が「以前」バケットにも入る`).toBeGreaterThan(orEarlierYear);
    }
  });

  it("🚨 明示年度と「以前」の上端の間に穴が無い (どこにも入らない年度の検出)", () => {
    const choices = choicesAt(2026);
    const explicitYears = choices
      .filter((choice) => choice.period.kind === "fiscalYear")
      .map((choice) => (choice.period as { year: number }).year)
      .sort((a, b) => a - b);
    const orEarlierYear = (
      choices.find((choice) => choice.period.kind === "fiscalYearOrEarlier")!.period as {
        year: number;
      }
    ).year;

    // 明示年度が連続していること (2026, 2025, 2024 → 昇順で 2024,2025,2026)
    for (let i = 1; i < explicitYears.length; i += 1) {
      expect(explicitYears[i]! - explicitYears[i - 1]!, "明示年度が連続していない").toBe(1);
    }
    // 明示最小の1つ前が「以前」の上端 = 隙間ゼロ
    expect(explicitYears[0]! - orEarlierYear).toBe(1);
  });

  it("現年度が変わっても同じ構造になる (基準年度に依存しない)", () => {
    expect(choicesAt(2030).map((choice) => choice.value)).toEqual([
      "allTime",
      "fy:2030",
      "fy:2029",
      "fy:2028",
      "fyle:2027",
    ]);
  });

  it("同じ `today` を渡せば同じ結果になる (TZ に依存しない)", () => {
    const a = buildRankingPeriodChoices(new Date(2026, 5, 1));
    const b = buildRankingPeriodChoices(new Date(2026, 5, 1));
    expect(a).toEqual(b);
  });
});

// =============================================================================
describe("[V-P2-01][V-P2-02][V-P2-57] value ⇄ RankingPeriod", () => {
  const CHOICES = buildRankingPeriodChoices(new Date(2026, 5, 1));

  it("3 variant すべてが value に写る", () => {
    expect(toRankingPeriodValue({ kind: "allTime" })).toBe("allTime");
    expect(toRankingPeriodValue({ kind: "fiscalYear", year: 2026 })).toBe("fy:2026");
    expect(toRankingPeriodValue({ kind: "fiscalYearOrEarlier", year: 2023 })).toBe("fyle:2023");
  });

  it("選択肢 5 件すべてが双射 (value → period → value で戻る)", () => {
    for (const choice of CHOICES) {
      const parsed = parseRankingPeriodValue(choice.value, CHOICES);
      expect(parsed, `${choice.value} がパースできない`).not.toBeNull();
      expect(toRankingPeriodValue(parsed!)).toBe(choice.value);
      expect(parsed).toEqual(choice.period);
    }
    // 5 つの value が互いに異なる
    expect(new Set(CHOICES.map((choice) => choice.value)).size).toBe(5);
  });

  it("🚨 `fy:` と `fyle:` を取り違えない (接頭辞の混同)", () => {
    // 2023 は「以前」バケットの年なので `fy:2023` は選択肢に無い
    expect(parseRankingPeriodValue("fy:2023", CHOICES)).toBeNull();
    expect(parseRankingPeriodValue("fyle:2023", CHOICES)).toEqual({
      kind: "fiscalYearOrEarlier",
      year: 2023,
    });
    // 逆に 2026 は明示年度なので `fyle:2026` は選択肢に無い
    expect(parseRankingPeriodValue("fy:2026", CHOICES)).toEqual({
      kind: "fiscalYear",
      year: 2026,
    });
    expect(parseRankingPeriodValue("fyle:2026", CHOICES)).toBeNull();
  });

  it("🚨 [V-P2-57] 選択肢に出していない年度は通らない", () => {
    // 静的リストだけを見る実装 (`/^fy:\d+$/` の正規表現でパースする等) では
    // 検出できない観点。**画面に出している配列そのもの**を引く設計の担保
    for (const bad of ["fy:2019", "fy:2030", "fyle:2019", "fyle:2030"]) {
      expect(parseRankingPeriodValue(bad, CHOICES), `${bad} が通った`).toBeNull();
    }
  });

  it("🚨 [V-P2-02] 未知の value を弾く (as キャストで迂回しない)", () => {
    for (const bad of [
      "",
      "fy:",
      "fyle:",
      "fy:abc",
      "fyle:abc",
      "fy:2026.5",
      "fy:-1",
      "2026",
      "fy:2026 ",
      " fy:2026",
      "FY:2026",
      "alltime",
      "allTime ",
      "relay:free",
    ]) {
      expect(parseRankingPeriodValue(bad, CHOICES), `${JSON.stringify(bad)} が通った`).toBeNull();
    }
  });

  it("空の choices を渡すと何も通らない (逆引きの母集団が choices である証拠)", () => {
    for (const choice of CHOICES) {
      expect(parseRankingPeriodValue(choice.value, [])).toBeNull();
    }
  });
});

// =============================================================================
describe("[V-P2-29] shouldShowFiscalYearNote — 注意書きの真理値表", () => {
  const base: RankingFilterState = {
    event: { mode: "individual", style: "Fr" },
    distance: 50,
    poolType: 1,
    genderCategory: "male",
    scope: "allCompetitions",
    period: { kind: "fiscalYear", year: 2026 },
    aggregation: "personalBest",
  };

  const ALL_TIME: RankingPeriod = { kind: "allTime" };
  const FY: RankingPeriod = { kind: "fiscalYear", year: 2026 };
  const FYLE: RankingPeriod = { kind: "fiscalYearOrEarlier", year: 2023 };

  it.each([
    // [ラベル, state の差分, 期待値]
    ["個人 + allCompetitions + 年度 → 出す", {}, true],
    [
      "🚨 個人 + allCompetitions + 「以前」→ 出す (RPC に年度を渡す枝なので同じ除外が起きる)",
      { period: FYLE },
      true,
    ],
    [
      "🚨 個人 + teamCompetitions + 年度 → 出さない (通算でも既に落ちているので誤読させる)",
      { scope: "teamCompetitions" as const },
      false,
    ],
    ["個人 + allCompetitions + 通算 → 出さない", { period: ALL_TIME }, false],
    ["個人 + teamCompetitions + 通算 → 出さない", { scope: "teamCompetitions" as const, period: ALL_TIME }, false],
    [
      "🚨 リレー + allCompetitions + 年度 → 出さない (競技上その行を生む経路が無い)",
      { event: { mode: "relay" as const, relayKind: "free" as const } },
      false,
    ],
    [
      "🚨 リレー + 「以前」→ 出さない",
      { event: { mode: "relay" as const, relayKind: "medley" as const }, period: FYLE },
      false,
    ],
    [
      "リレー + 通算 → 出さない",
      { event: { mode: "relay" as const, relayKind: "free" as const }, period: ALL_TIME },
      false,
    ],
  ])("%s", (_label, patch, expected) => {
    expect(shouldShowFiscalYearNote({ ...base, ...patch })).toBe(expected);
  });

  it("🚨 `=== \"fiscalYear\"` と書くと「以前」だけ注意書きが出ない (判定は !== allTime)", () => {
    // 実装が `state.period.kind === "fiscalYear"` に変わると
    // `fiscalYearOrEarlier` で false になる。上の真理値表の2行目がそれを捕まえるが、
    // **意図を明示するために独立した it でも固定する**
    expect(shouldShowFiscalYearNote({ ...base, period: FY })).toBe(true);
    expect(shouldShowFiscalYearNote({ ...base, period: FYLE })).toBe(true);
  });

  it("水路・距離・性別・集計は判定に影響しない (軸を増やしていない)", () => {
    // 否定形。判定に余計な軸が混ざると、条件を変えただけで注意書きが消える
    for (const patch of [
      { poolType: 0 as const },
      { distance: 1500 },
      { genderCategory: "female" as const },
      { aggregation: "allRaces" as const },
    ]) {
      expect(shouldShowFiscalYearNote({ ...base, ...patch }), JSON.stringify(patch)).toBe(true);
    }
  });
});
