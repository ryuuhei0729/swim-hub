import { describe, expect, it } from "vitest";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
  isActionItemsExpanded,
  parseActionItemsCollapseState,
} from "../../utils/dashboardActionItems";

const A = actionItemKey.attendance("practice", "p1");
const B = actionItemKey.entry("c1");
const C = actionItemKey.record("c2");

describe("isActionItemsExpanded", () => {
  it("保存が無い・開いた状態で保存されていれば開く", () => {
    expect(isActionItemsExpanded(null, [A])).toBe(true);
    expect(isActionItemsExpanded({ collapsed: false, keys: [A] }, [A])).toBe(true);
  });

  it("閉じた時点の項目だけ (または減った) なら閉じたまま", () => {
    expect(isActionItemsExpanded({ collapsed: true, keys: [A, B] }, [A, B])).toBe(false);
    expect(isActionItemsExpanded({ collapsed: true, keys: [A, B] }, [B])).toBe(false);
    expect(isActionItemsExpanded({ collapsed: true, keys: [A, B] }, [])).toBe(false);
  });

  it("閉じた時点に無かった項目が現れたら開く (件数が同じでも)", () => {
    // 1件解決して別の1件が増えた
    expect(isActionItemsExpanded({ collapsed: true, keys: [A, B] }, [A, C])).toBe(true);
    // 同じチームで未回答の練習が増えた
    expect(
      isActionItemsExpanded({ collapsed: true, keys: [A] }, [A, actionItemKey.attendance("practice", "p2")]),
    ).toBe(true);
  });
});

describe("parseActionItemsCollapseState", () => {
  it("正しい値を読む", () => {
    expect(parseActionItemsCollapseState(JSON.stringify({ collapsed: true, keys: [A] }))).toEqual({
      collapsed: true,
      keys: [A],
    });
  });

  it("空・壊れた JSON・形が違う値は null", () => {
    expect(parseActionItemsCollapseState(null)).toBe(null);
    expect(parseActionItemsCollapseState("")).toBe(null);
    expect(parseActionItemsCollapseState("{broken")).toBe(null);
    expect(parseActionItemsCollapseState('{"collapsed":"yes","keys":[]}')).toBe(null);
    expect(parseActionItemsCollapseState('{"collapsed":true,"count":2}')).toBe(null);
    expect(parseActionItemsCollapseState('{"collapsed":true,"keys":[1]}')).toBe(null);
    expect(parseActionItemsCollapseState("null")).toBe(null);
  });
});

describe("actionItemKey / actionItemsCollapseStorageKey", () => {
  it("種類と ID ごとに別のキーになる", () => {
    expect(new Set([A, B, C, actionItemKey.entry("c2")]).size).toBe(4);
    expect(actionItemsCollapseStorageKey("u1")).not.toBe(actionItemsCollapseStorageKey("u2"));
  });
});
