/**
 * getTabNavAdjacency 単体テスト (web)
 *
 * Sprint Contract: 大会/練習入力モーダルのフッターボタン切り替え
 * Phase B — Developer 実装完了後の実アサーション。
 *
 * テスト対象:
 *   getTabNavAdjacency<T>(visibleTabs: T[], activeTab: T, options?: {
 *     guardedNextTab?: T;
 *     isGuarded?: boolean;
 *   }): { prevTab?: T; nextTab?: T }
 *   (apps/web/utils/tabModalUtils.ts)
 *
 * 契約 (Planner仕様 + QA 確定事項):
 *   - prevTab = visibleTabs 内で activeTab の直前の要素。先頭または未検出なら undefined。
 *   - nextTab = visibleTabs 内で activeTab の直後の要素。末尾または未検出なら undefined。
 *   - options.isGuarded === true かつ 素の nextTab === options.guardedNextTab の場合、
 *     nextTab は undefined に上書きされる (ガードされたタブへの「次に進む」を出さない)。
 *   - フッター描画側の契約 (getTabNavAdjacency の戻り値からの導出。UI 検証は E2E で行う):
 *       prevTab あり → [前に戻る](outline) を左に表示
 *       nextTab あり → [次に進む](primary) を右に表示
 *       [保存して終了] は常に表示。nextTab あり→outline / nextTab なし→primary
 *
 * 注意:
 *   - このテストは純粋関数の入出力のみを検証する (jsdom 上で重いモーダルはレンダリングしない)。
 *   - CompetitionTabModal / PracticeTabModal のフッター実描画・クリック動作は
 *     Playwright ブラウザ実機検証 (Phase B) で検証する。
 *   - Developer の実装を見て逆算したアサーションではなく、Sprint Contract の期待値をそのまま検証する。
 */

import { describe, it, expect } from "vitest";
import { getTabNavAdjacency } from "../../utils/tabModalUtils";

type PracticeTab = "practice" | "practiceLog";
type CompetitionTab = "competition" | "entry" | "record";

// ============================================================
// [V-NAV-01] 練習: visibleTabs=["practice","practiceLog"] (ガードなし)
// ============================================================

describe("[V-NAV-01] getTabNavAdjacency: 練習タブ (2タブ・ガードなし)", () => {
  const visibleTabs: PracticeTab[] = ["practice", "practiceLog"];

  it("activeTab='practice' → { prevTab: undefined, nextTab: 'practiceLog' } (先頭タブは前に戻るボタンなし)", () => {
    const result = getTabNavAdjacency(visibleTabs, "practice");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBe("practiceLog");
  });

  it("activeTab='practiceLog' → { prevTab: 'practice', nextTab: undefined } (末尾タブは次に進むボタンなし)", () => {
    const result = getTabNavAdjacency(visibleTabs, "practiceLog");
    expect(result.prevTab).toBe("practice");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-02] 大会: 未来日 (showEntryTab=true) → visibleTabs=["competition","entry","record"]
//            isGuarded=true (showRecordTab=false), guardedNextTab="record"
// ============================================================

describe("[V-NAV-02] getTabNavAdjacency: 大会タブ・未来日 (3タブ・record ガード中)", () => {
  const visibleTabs: CompetitionTab[] = ["competition", "entry", "record"];
  const options = { guardedNextTab: "record" as const, isGuarded: true };

  it("activeTab='competition' → { prevTab: undefined, nextTab: 'entry' } (次はentry。guardedNextTabと不一致なので素通り)", () => {
    const result = getTabNavAdjacency(visibleTabs, "competition", options);
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBe("entry");
  });

  it("activeTab='entry' → { prevTab: 'competition', nextTab: undefined } (素のnextTabは'record'だがisGuarded=trueかつguardedNextTab一致→undefinedに上書き)", () => {
    const result = getTabNavAdjacency(visibleTabs, "entry", options);
    expect(result.prevTab).toBe("competition");
    expect(result.nextTab).toBeUndefined();
  });

  it("activeTab='record' → { prevTab: 'entry', nextTab: undefined } (末尾タブ。ガード中でも前に戻るは効く)", () => {
    const result = getTabNavAdjacency(visibleTabs, "record", options);
    expect(result.prevTab).toBe("entry");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-03] 大会: 過去/当日 (showEntryTab=false) → visibleTabs=["competition","record"]
//            isGuarded=false (showRecordTab=true), guardedNextTab="record"
// ============================================================

describe("[V-NAV-03] getTabNavAdjacency: 大会タブ・過去/当日 (2タブ・record非ガード)", () => {
  const visibleTabs: CompetitionTab[] = ["competition", "record"];
  const options = { guardedNextTab: "record" as const, isGuarded: false };

  it("activeTab='competition' → { prevTab: undefined, nextTab: 'record' } (guardedNextTabと一致するがisGuarded=falseなので上書きされない)", () => {
    const result = getTabNavAdjacency(visibleTabs, "competition", options);
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBe("record");
  });

  it("activeTab='record' → { prevTab: 'competition', nextTab: undefined }", () => {
    const result = getTabNavAdjacency(visibleTabs, "record", options);
    expect(result.prevTab).toBe("competition");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-04] 大会: entryLocked=true かつ未来日 → visibleTabs=["competition","record"] (entry除外)
//            isGuarded=true (showRecordTab=false), guardedNextTab="record"
//            → competition の「次に進む」も消える特殊ケース (次が無意味なガード先のため)
// ============================================================

describe("[V-NAV-04] getTabNavAdjacency: 大会タブ・entryLocked+未来日 (2タブ・record ガード中)", () => {
  const visibleTabs: CompetitionTab[] = ["competition", "record"];
  const options = { guardedNextTab: "record" as const, isGuarded: true };

  it("activeTab='competition' → { prevTab: undefined, nextTab: undefined } (素のnextTabは'record'だがガード一致→undefined。次に進むボタン自体が出ない)", () => {
    const result = getTabNavAdjacency(visibleTabs, "competition", options);
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBeUndefined();
  });

  it("activeTab='record' → { prevTab: 'competition', nextTab: undefined }", () => {
    const result = getTabNavAdjacency(visibleTabs, "record", options);
    expect(result.prevTab).toBe("competition");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-05] 境界値・異常系
// ============================================================

describe("[V-NAV-05] getTabNavAdjacency: 境界値・異常系", () => {
  it("visibleTabs が単一要素 (長さ1) → prevTab/nextTab とも undefined", () => {
    const result = getTabNavAdjacency(["only"], "only");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBeUndefined();
  });

  it("activeTab が visibleTabs に含まれない (不正状態) → prevTab/nextTab とも undefined (クラッシュしない)", () => {
    const result = getTabNavAdjacency(["a", "b", "c"], "not-in-list");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBeUndefined();
  });

  it("guardedNextTab が visibleTabs に存在しない値 → 通常の nextTab 計算のみが行われガード判定は素通り (no-op)", () => {
    const result = getTabNavAdjacency(["a", "b", "c"], "a", {
      guardedNextTab: "not-in-list",
      isGuarded: true,
    });
    expect(result.nextTab).toBe("b");
  });

  it("options 省略時 (guardedNextTab/isGuarded 未指定) → ガード判定なしで通常の前後計算のみ行われる", () => {
    const result = getTabNavAdjacency(["a", "b", "c"], "b");
    expect(result.prevTab).toBe("a");
    expect(result.nextTab).toBe("c");
  });

  it("visibleTabs が空配列 → prevTab/nextTab とも undefined", () => {
    const result = getTabNavAdjacency([], "anything");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBeUndefined();
  });

  it("isGuarded=true だが nextTab が guardedNextTab と一致しない → nextTab は上書きされない", () => {
    const result = getTabNavAdjacency(["a", "b", "c"], "a", {
      guardedNextTab: "c",
      isGuarded: true,
    });
    expect(result.nextTab).toBe("b");
  });

  it("isGuarded=false のとき、nextTab が guardedNextTab と一致していても上書きされない", () => {
    const result = getTabNavAdjacency(["a", "b"], "a", {
      guardedNextTab: "b",
      isGuarded: false,
    });
    expect(result.nextTab).toBe("b");
  });
});
