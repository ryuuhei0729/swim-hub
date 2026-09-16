// =============================================================================
// tagColors.test.ts — パレット定義の不変条件
// =============================================================================
//
// ■ 何を守るテストか
//   2026-09-16 にパレットを 10色 → 8色 へ削減し、外した2色 (`#7DD3FC` / `#D1D5DB`)
//   は **保存済みデータには残る**ため、以下の非対称を意図的に作った:
//
//     TAG_COLORS          … ピッカーに出す色 (8)
//     LEGACY_TAG_COLORS   … かつて選べた色 (2)。新規に選ばせないが値としては有効
//     STORABLE_TAG_COLORS … 保存を許可する色 (= 8 + 2)。Zod の検証対象
//
//   🚨 **`STORABLE_TAG_COLORS` を `TAG_COLORS` に揃えてはいけない。**
//   カレンダー色の保存は「変更しない側の色を既存値のまま再送する」実装なので、
//   検証を8色に絞ると **旧色を保存済みのユーザーがもう片方を変えた瞬間に
//   parse() が throw して保存不能**になる。しかも旧色はピッカーに無いので
//   選び直すこともできず、ユーザーは自力で回復できない。
//
//   この非対称は「うっかり揃える」方向へ壊れやすい (8色に統一するのが自然に見える)。
//   本ファイルはその退行を検出する。
//
// ■ トートロジー回避
//   期待値は定数配列から導出せず、**外した2色を手書き**して突き合わせる。
//   実装の配列をそのまま比較すると、何に書き換えても緑のままになる。
// =============================================================================

import { describe, it, expect } from "vitest";

import {
  DEFAULT_TAG_COLOR,
  LEGACY_TAG_COLORS,
  STORABLE_TAG_COLORS,
  TAG_COLORS,
  getColorForName,
  getRandomTagColor,
} from "../../constants/tagColors";
import { CalendarColorInputSchema } from "../../types/calendarColors";

/** 2026-09-16 にパレットから外した色 (手書き。実装から導出しない) */
const REMOVED_IN_2026_09 = ["#7DD3FC", "#D1D5DB"] as const;
/** パレットに一度も含まれたことがない色 (拒否されるべき対照) */
const NEVER_IN_PALETTE = ["#34D399", "#000000", "#FFFFFF", "93C5FD", ""] as const;

describe("パレット定義", () => {
  it("TAG_COLORS はちょうど8色で重複が無い", () => {
    expect(TAG_COLORS).toHaveLength(8);
    expect(new Set(TAG_COLORS).size).toBe(8);
  });

  it("TAG_COLORS に 2026-09 で外した色が含まれていない", () => {
    for (const color of REMOVED_IN_2026_09) {
      expect(TAG_COLORS as readonly string[], `${color} がピッカーに復活している`).not.toContain(
        color,
      );
    }
  });

  it("LEGACY_TAG_COLORS は外した2色そのものである", () => {
    expect([...LEGACY_TAG_COLORS].sort()).toEqual([...REMOVED_IN_2026_09].sort());
  });

  it("DEFAULT_TAG_COLOR は TAG_COLORS に含まれない (選択肢ではない)", () => {
    expect(TAG_COLORS as readonly string[]).not.toContain(DEFAULT_TAG_COLOR);
  });

  it("全要素が #RRGGBB 形式の大文字である", () => {
    for (const color of STORABLE_TAG_COLORS) {
      expect(color, `${color} の形式が不正`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// 非対称の本体
// ---------------------------------------------------------------------------
describe("STORABLE_TAG_COLORS は TAG_COLORS の真の上位集合である", () => {
  it("選択肢8色はすべて保存できる", () => {
    for (const color of TAG_COLORS) {
      expect(STORABLE_TAG_COLORS as readonly string[], `${color} が保存不可`).toContain(color);
    }
  });

  it("🚨 保存可能集合は選択肢より**広い** (揃えると旧色ユーザーが保存不能になる)", () => {
    expect(STORABLE_TAG_COLORS.length).toBeGreaterThan(TAG_COLORS.length);
    expect(STORABLE_TAG_COLORS).toHaveLength(TAG_COLORS.length + LEGACY_TAG_COLORS.length);

    // 「広いだけ」ではなく、**広がっている中身が旧色である**ことまで固定する
    const onlyStorable = (STORABLE_TAG_COLORS as readonly string[]).filter(
      (c) => !(TAG_COLORS as readonly string[]).includes(c),
    );
    expect(onlyStorable.sort()).toEqual([...REMOVED_IN_2026_09].sort());
  });

  it("重複が無い", () => {
    expect(new Set(STORABLE_TAG_COLORS).size).toBe(STORABLE_TAG_COLORS.length);
  });
});

// ---------------------------------------------------------------------------
// Zod 検証の実挙動 (定数を眺めるだけでなく parse を通す)
// ---------------------------------------------------------------------------
describe("CalendarColorInputSchema の受理/拒否", () => {
  it("選択肢8色は parse を通る", () => {
    for (const color of TAG_COLORS) {
      expect(() =>
        CalendarColorInputSchema.parse({ practice_color: color, competition_color: null }),
      ).not.toThrow();
    }
  });

  it("🚨 旧色を含む入力も parse を通る (回復不能な保存不能状態を作らない)", () => {
    for (const color of REMOVED_IN_2026_09) {
      expect(
        () =>
          CalendarColorInputSchema.parse({ practice_color: color, competition_color: null }),
        `${color} (旧色) が拒否された。旧色を保存済みのユーザーが保存できなくなる`,
      ).not.toThrow();
    }
  });

  it("旧色と新色の混在 (片方だけ変更する実際の保存形) も通る", () => {
    // 「大会色は旧色のまま・練習色だけ新色に変更」= 実装が実際に送る形
    expect(() =>
      CalendarColorInputSchema.parse({
        practice_color: TAG_COLORS[0],
        competition_color: "#7DD3FC",
      }),
    ).not.toThrow();
  });

  it("パレット外の色は拒否される (広げすぎていないことの対照)", () => {
    for (const color of NEVER_IN_PALETTE) {
      expect(
        () =>
          CalendarColorInputSchema.parse({ practice_color: color, competition_color: null }),
        `${color} が通ってしまう`,
      ).toThrow();
    }
  });

  it("null は許容される (未設定 = 個人設定にフォールバック)", () => {
    expect(() =>
      CalendarColorInputSchema.parse({ practice_color: null, competition_color: null }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 色の導出関数は **選択肢の8色** しか返さない
// ---------------------------------------------------------------------------
describe("色の導出は選択肢からのみ行う", () => {
  it("getColorForName は常に TAG_COLORS の要素を返す", () => {
    for (const name of ["フリー", "Kick", "", "a", "水曜メニュー", "🏊‍♀️"]) {
      expect(TAG_COLORS as readonly string[], `name="${name}"`).toContain(getColorForName(name));
    }
  });

  it("getColorForName は同じ名前に同じ色を返す (決定的)", () => {
    expect(getColorForName("フリー")).toBe(getColorForName("フリー"));
  });

  it("getRandomTagColor は常に TAG_COLORS の要素を返す", () => {
    for (let i = 0; i < 50; i++) {
      expect(TAG_COLORS as readonly string[]).toContain(getRandomTagColor());
    }
  });
});
