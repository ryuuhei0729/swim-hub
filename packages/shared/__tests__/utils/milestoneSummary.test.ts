// =============================================================================
// shared/utils/milestoneSummary.test.ts  (S10, D1, A1 / 2026-10-15 表記変更)
// =============================================================================
// 期待文字列はすべてリテラル。2026-10-15 ユーザー指定の表記:
//   - タイム目標は常に1本1セットなので本数もセット数も出さない ("100m: 1:23.45")
//   - セット数は2セット以上のときだけ出す (1セットは「× 1セット」を付けない)
//   - サークルに小数は無いので 40" / 1'30" と書く ("@2:20.00サークル" ではない)
// formatTimeBest 等でテスト内に期待値を組み立てない。
// t スタブ: 実 messages/<locale>.json の goals.milestoneSummary.* を引き {var} を置換するだけ
//   (翻訳エンジンの代替であり、距離/本数/時間の組み立ては一切しない)。
// 壊したら赤: ja 文言の1文字変更 / type guard 判定順の変更 / 補間値の欠落 / 数値で渡す (string 契約) /
//   フォールバックが title でなくなる
// =============================================================================
import { describe, expect, it, vi } from "vitest";
import ja from "../../messages/ja.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import ko from "../../messages/ko.json";
import de from "../../messages/de.json";
import { formatMilestoneSummary, type SummaryTranslate } from "../../utils/milestoneSummary";
import { formatCircle } from "../../utils/time";

type Msgs = { goals: { milestoneSummary: Record<string, string> } };

function stubT(m: unknown): SummaryTranslate {
  const ms = (m as Msgs).goals.milestoneSummary;
  return (key, values) => {
    const tpl = ms[key.replace("milestoneSummary.", "")];
    if (tpl === undefined) throw new Error(`missing key ${key}`);
    return tpl.replace(/\{(\w+)\}/g, (_, v: string) => {
      if (!(v in values)) throw new Error(`missing value ${v}`);
      return values[v] as string;
    });
  };
}

const tJa = stubT(ja);
const ms = (params: Record<string, unknown>, title = "TITLE") =>
  ({ params, title }) as unknown as Parameters<typeof formatMilestoneSummary>[0];

const TIME = { distance: 100, target_time: 83.45, style: "Fr", swim_category: "Swim" };
const REPS = { distance: 50, reps: 6, sets: 1, target_average_time: 35, style: "Fr", swim_category: "Swim", circle: 90 };
const SET = { distance: 200, reps: 4, sets: 3, circle: 140, style: "Fr", swim_category: "Swim" };

describe("ja: 表記 (2026-10-15)", () => {
  it("time: 本数・セット数を出さない", () => expect(formatMilestoneSummary(ms(TIME), tJa)).toBe("100m: 1:23.45"));
  it("reps_time: 1セットはセット数を出さない", () =>
    expect(formatMilestoneSummary(ms(REPS), tJa)).toBe("50m × 6本 @35.00 平均"));
  it("reps_time: 2セット以上はセット数を出す (2 / 3)", () => {
    expect(formatMilestoneSummary(ms({ ...REPS, sets: 2 }), tJa)).toBe("50m × 6本 × 2セット @35.00 平均");
    expect(formatMilestoneSummary(ms({ ...REPS, sets: 3 }), tJa)).toBe("50m × 6本 × 3セット @35.00 平均");
  });
  it("set: 2セット以上はセット数を出し、サークルは分'秒\"", () =>
    expect(formatMilestoneSummary(ms(SET), tJa)).toBe("200m × 4本 × 3セット (2'20\"サークル) 完遂"));
  it("set: 1セットはセット数を出さず、1分未満のサークルは秒だけ", () =>
    expect(formatMilestoneSummary(ms({ ...SET, distance: 50, reps: 6, sets: 1, circle: 40 }), tJa)).toBe(
      "50m × 6本 (40\"サークル) 完遂",
    ));
  it("境界: 59.99 / 60 / 3600", () => {
    expect(formatMilestoneSummary(ms({ ...TIME, target_time: 59.99 }), tJa)).toBe("100m: 59.99");
    expect(formatMilestoneSummary(ms({ ...TIME, target_time: 60 }), tJa)).toBe("100m: 1:00.00");
    expect(formatMilestoneSummary(ms({ ...TIME, target_time: 3600 }), tJa)).toBe("100m: 60:00.00");
  });
  it("x 記号は U+00D7 (乗算記号)", () => {
    expect(formatMilestoneSummary(ms(REPS), tJa).includes("×")).toBe(true);
  });
});

describe("フォールバックと補間契約", () => {
  it("どの type guard にも当たらない params は title をそのまま返し、t を呼ばない", () => {
    const t = vi.fn<SummaryTranslate>();
    expect(formatMilestoneSummary(ms({ foo: 1 }, "自由なタイトル"), t)).toBe("自由なタイトル");
    expect(t).not.toHaveBeenCalled();
  });
  it("time: キーと補間値 (全て string) が厳密一致", () => {
    const t = vi.fn<SummaryTranslate>(() => "x");
    formatMilestoneSummary(ms(TIME), t);
    expect(t.mock.calls).toEqual([["milestoneSummary.time", { distance: "100", time: "1:23.45" }]]);
  });
  it("reps_time: 1セットは repsTime、2セット以上は repsTimeWithSets", () => {
    const t = vi.fn<SummaryTranslate>(() => "x");
    formatMilestoneSummary(ms(REPS), t);
    formatMilestoneSummary(ms({ ...REPS, sets: 3 }), t);
    expect(t.mock.calls).toEqual([
      ["milestoneSummary.repsTime", { distance: "50", reps: "6", sets: "1", time: "35.00" }],
      ["milestoneSummary.repsTimeWithSets", { distance: "50", reps: "6", sets: "3", time: "35.00" }],
    ]);
  });
  it("set: 1セットは set、2セット以上は setWithSets。サークルは formatCircle の表記", () => {
    const t = vi.fn<SummaryTranslate>(() => "x");
    formatMilestoneSummary(ms({ ...SET, sets: 1 }), t);
    formatMilestoneSummary(ms(SET), t);
    expect(t.mock.calls).toEqual([
      ["milestoneSummary.set", { distance: "200", reps: "4", sets: "1", circle: "2'20\"" }],
      ["milestoneSummary.setWithSets", { distance: "200", reps: "4", sets: "3", circle: "2'20\"" }],
    ]);
  });
  it("goalset (practice_pool_type 付き reps_time・既定の3セット) は reps_time としてセット数つきで整形", () => {
    expect(formatMilestoneSummary(ms({ ...REPS, sets: 3, practice_pool_type: 0 }), tJa)).toBe(
      "50m × 6本 × 3セット @35.00 平均",
    );
  });
  it("1000 以上の距離も桁区切りされない (数値ロケール書式回避)", () => {
    expect(formatMilestoneSummary(ms({ ...TIME, distance: 1500 }), tJa)).toBe("1500m: 1:23.45");
  });
});

describe.each([["en", en], ["zh", zh], ["ko", ko], ["de", de]] as const)("%s", (loc, m) => {
  const t = stubT(m);
  it("3 type × 1セット/複数セットとも補間漏れ ({var}) が残らず実値を含む", () => {
    for (const p of [TIME, REPS, { ...REPS, sets: 3 }, { ...SET, sets: 1 }, SET]) {
      const out = formatMilestoneSummary(ms(p), t);
      expect(out, loc).not.toMatch(/[{}]/);
      expect(out).toContain(String(p.distance));
    }
    expect(formatMilestoneSummary(ms(SET), t)).toContain("2'20\"");
  });
  it("日本語 (ひらがな/カタカナ/漢字) を含まない" + (loc === "zh" ? " ※zh は仮名のみ検査" : ""), () => {
    const re = loc === "zh" ? /[぀-ヿ]/ : /[぀-ヿ一-鿿]/;
    for (const p of [TIME, REPS, SET]) expect(formatMilestoneSummary(ms(p), t)).not.toMatch(re);
  });
});

describe("formatCircle (サークルの表記)", () => {
  it.each([
    [40, '40"'],
    [59, '59"'],
    [60, "1'00\""],
    [90, "1'30\""],
    [125, "2'05\""],
    [600, "10'00\""],
  ])("%s 秒 → %s", (sec, expected) => expect(formatCircle(sec)).toBe(expected));
  it("小数は切り捨てて出さない (サークルに小数は無い)", () => {
    expect(formatCircle(40.7)).toBe('40"');
    expect(formatCircle(90.5)).toBe("1'30\"");
  });
});
