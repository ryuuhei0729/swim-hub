// =============================================================================
// shared/utils/goalReflection.test.ts  (S8, D1)
// =============================================================================
// 壊したら赤: id の typo/増減/並べ替え -> 集合+順序 toEqual 赤 / 選択順を定義順にソート -> 順序ケース赤 /
//   空で "" を返す -> null 期待赤 / otherNote を trim -> 空白保持ケース赤 /
//   resolveLabel の引数を捨てる -> 引数 assert 赤
// =============================================================================
import { describe, expect, it, vi } from "vitest";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import ko from "../../messages/ko.json";
import de from "../../messages/de.json";
import {
  REFLECTION_OPTIONS,
  REFLECTION_OTHER_ID,
  buildReflectionNote,
} from "../../utils/goalReflection";

const labels: Record<string, string> = {
  goal_too_high: "目標タイムが高すぎた",
  period_too_short: "準備期間が短かった",
  practice_insufficient: "練習量が足りなかった",
  condition_poor: "コンディション不良",
  other: "その他",
};
const resolveLabel = (id: string) => labels[id] ?? "";
const formatOtherNote = (n: string) => `その他: ${n}`;

describe("REFLECTION_OPTIONS", () => {
  it("id が5件・この順で厳密一致 (現行 web の2モーダルと同一)", () => {
    expect(REFLECTION_OPTIONS.map((o) => o.id)).toEqual([
      "goal_too_high", "period_too_short", "practice_insufficient", "condition_poor", "other",
    ]);
  });
  it("labelKey が5件・この順で厳密一致", () => {
    expect(REFLECTION_OPTIONS.map((o) => o.labelKey)).toEqual([
      "goalTooHigh", "periodTooShort", "practiceInsufficient", "conditionPoor", "other",
    ]);
  });
  it("REFLECTION_OTHER_ID は 'other'", () => {
    expect(REFLECTION_OTHER_ID).toBe("other");
  });
  it.each([["ja", ja], ["en", en], ["zh", zh], ["ko", ko], ["de", de]] as const)(
    "%s: 全 labelKey が goals.goalReflection.options.* と goals.reflection.options.* の両方に実在し非空",
    (_loc, m) => {
      const g = m.goals as unknown as Record<string, { options: Record<string, string> }>;
      for (const o of REFLECTION_OPTIONS) {
        expect(g.goalReflection!.options[o.labelKey], `goalReflection.${o.labelKey}`).toBeTruthy();
        expect(g.reflection!.options[o.labelKey], `reflection.${o.labelKey}`).toBeTruthy();
      }
    },
  );
});

describe("buildReflectionNote", () => {
  const base = { resolveLabel, otherNote: "", formatOtherNote };

  it("選択1件 -> ラベルのみ", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["goal_too_high"] })).toBe("目標タイムが高すぎた");
  });
  it("選択順を保持し改行連結 (定義順・辞書順のどちらにも並べ替えない: 選択順が両者と異なる入力)", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["practice_insufficient", "goal_too_high"] })).toBe(
      "練習量が足りなかった\n目標タイムが高すぎた",
    );
  });
  it("[L5] 'other' 選択 + otherNote -> 末尾に formatOtherNote(otherNote)", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["goal_too_high", "other"], otherNote: "怪我" })).toBe(
      "目標タイムが高すぎた\nその他\nその他: 怪我",
    );
  });
  it("[L5] 'other' のみ選択 + otherNote -> 'その他' ラベルと otherNote の2行", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["other"], otherNote: "怪我" })).toBe("その他\nその他: 怪我");
  });
  it("[L5] 'other' を選んでいないなら otherNote は (入力済みでも) 含めない", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["goal_too_high"], otherNote: "怪我" })).toBe("目標タイムが高すぎた");
  });
  it("[L5] 何も選ばず otherNote だけ有る -> null (混入しない)", () => {
    expect(buildReflectionNote({ ...base, selectedIds: [], otherNote: "怪我" })).toBeNull();
  });
  it("選択0件 + otherNote 空 -> null ('' ではない)", () => {
    expect(buildReflectionNote({ ...base, selectedIds: [] })).toBeNull();
  });
  it("otherNote は trim しない: 'other' 選択時、空白のみでも有効な文字列として整形される (現行 web 準拠)", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["other"], otherNote: "  " })).toBe("その他\nその他:   ");
  });
  it("otherNote の前後空白も保持される", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["other"], otherNote: " a " })).toBe("その他\nその他:  a ");
  });
  it("resolveLabel が空文字を返す id は id 自体にフォールバック", () => {
    expect(buildReflectionNote({ ...base, selectedIds: ["unknown_id"] })).toBe("unknown_id");
  });
  it("resolveLabel は選択 id ごとに id 引数で1回ずつ呼ばれる / formatOtherNote は otherNote 引数で呼ばれる", () => {
    const rl = vi.fn(resolveLabel);
    const fo = vi.fn(formatOtherNote);
    buildReflectionNote({ selectedIds: ["goal_too_high", "other"], resolveLabel: rl, otherNote: "x", formatOtherNote: fo });
    expect(rl.mock.calls).toEqual([["goal_too_high"], ["other"]]);
    expect(fo.mock.calls).toEqual([["x"]]);
  });
  it("otherNote 空のとき formatOtherNote は呼ばれない", () => {
    const fo = vi.fn(formatOtherNote);
    buildReflectionNote({ selectedIds: ["goal_too_high"], resolveLabel, otherNote: "", formatOtherNote: fo });
    expect(fo).not.toHaveBeenCalled();
  });
});
