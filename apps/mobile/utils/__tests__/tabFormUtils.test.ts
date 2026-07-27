/**
 * getTabNavAdjacency 単体テスト (mobile)
 *
 * Sprint Contract: 大会/練習入力モーダルのフッターボタン切り替え (web と同一挙動)
 * Phase B — Developer 実装完了後の実アサーション。
 *
 * テスト対象:
 *   getTabNavAdjacency<T>(visibleTabs: T[], activeTab: T, options?: {
 *     guardedNextTab?: T;
 *     isGuarded?: boolean;
 *   }): { prevTab?: T; nextTab?: T }
 *   (apps/mobile/utils/tabFormUtils.ts — web からミラー実装)
 *
 * 契約 (apps/web/__tests__/utils/tabModalUtils.test.ts と同一。web/mobile パリティ確認用):
 *   - prevTab = visibleTabs 内で activeTab の直前の要素。先頭または未検出なら undefined。
 *   - nextTab = visibleTabs 内で activeTab の直後の要素。末尾または未検出なら undefined。
 *   - options.isGuarded === true かつ 素の nextTab === options.guardedNextTab の場合、
 *     nextTab は undefined に上書きされる。
 *
 * mobile 固有の注意:
 *   - 練習タブの visibleTabs は ["practice","log"] (web は "practiceLog")。
 *   - mobile の CompetitionTabFormScreen には web の entryLocked 相当の概念が無い。
 *     entryLocked ケース (web V-NAV-04) は web 専用のため本ファイルでは検証しない。
 *   - フッター実描画・タップ動作は Playwright ではなく人間の実機確認 (Expo) が必要。
 *     本ファイルは純粋関数の入出力のみを検証する。
 */

import { describe, it, expect } from "vitest";
import { getTabNavAdjacency } from "../tabFormUtils";

type PracticeTab = "practice" | "log";
type CompetitionTab = "competition" | "entry" | "record";

// ============================================================
// [V-NAV-M01] 練習: visibleTabs=["practice","log"] (ガードなし)
// ============================================================

describe("[V-NAV-M01] getTabNavAdjacency: 練習タブ (2タブ・ガードなし・mobile)", () => {
  const visibleTabs: PracticeTab[] = ["practice", "log"];

  it("activeTab='practice' → { prevTab: undefined, nextTab: 'log' } (先頭タブは前に戻るボタンなし)", () => {
    const result = getTabNavAdjacency(visibleTabs, "practice");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBe("log");
  });

  it("activeTab='log' → { prevTab: 'practice', nextTab: undefined } (末尾タブは次に進むボタンなし)", () => {
    const result = getTabNavAdjacency(visibleTabs, "log");
    expect(result.prevTab).toBe("practice");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-M02] 大会: 未来日 (showEntryTab=true) → visibleTabs=["competition","entry","record"]
//             isGuarded=true (showRecordTab=false), guardedNextTab="record"
// ============================================================

describe("[V-NAV-M02] getTabNavAdjacency: 大会タブ・未来日 (3タブ・record ガード中・mobile)", () => {
  const visibleTabs: CompetitionTab[] = ["competition", "entry", "record"];
  const options = { guardedNextTab: "record" as const, isGuarded: true };

  it("activeTab='competition' → { prevTab: undefined, nextTab: 'entry' }", () => {
    const result = getTabNavAdjacency(visibleTabs, "competition", options);
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBe("entry");
  });

  it("activeTab='entry' → { prevTab: 'competition', nextTab: undefined } (素のnextTabは'record'だがisGuarded=trueかつguardedNextTab一致→undefinedに上書き)", () => {
    const result = getTabNavAdjacency(visibleTabs, "entry", options);
    expect(result.prevTab).toBe("competition");
    expect(result.nextTab).toBeUndefined();
  });

  it("activeTab='record' → { prevTab: 'entry', nextTab: undefined }", () => {
    const result = getTabNavAdjacency(visibleTabs, "record", options);
    expect(result.prevTab).toBe("entry");
    expect(result.nextTab).toBeUndefined();
  });
});

// ============================================================
// [V-NAV-M03] 大会: 過去/当日 (showEntryTab=false) → visibleTabs=["competition","record"]
//             isGuarded=false (showRecordTab=true), guardedNextTab="record"
// ============================================================

describe("[V-NAV-M03] getTabNavAdjacency: 大会タブ・過去/当日 (2タブ・record非ガード・mobile)", () => {
  const visibleTabs: CompetitionTab[] = ["competition", "record"];
  const options = { guardedNextTab: "record" as const, isGuarded: false };

  it("activeTab='competition' → { prevTab: undefined, nextTab: 'record' } (guardedNextTabと一致するが isGuarded=false なので上書きされない)", () => {
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
// [V-NAV-M04] 境界値・異常系 (web と同一契約のパリティ確認)
// ============================================================

describe("[V-NAV-M04] getTabNavAdjacency: 境界値・異常系 (mobile)", () => {
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

  it("options 省略時 → ガード判定なしで通常の前後計算のみ行われる", () => {
    const result = getTabNavAdjacency(["a", "b", "c"], "b");
    expect(result.prevTab).toBe("a");
    expect(result.nextTab).toBe("c");
  });

  it("visibleTabs が空配列 → prevTab/nextTab とも undefined", () => {
    const result = getTabNavAdjacency([], "anything");
    expect(result.prevTab).toBeUndefined();
    expect(result.nextTab).toBeUndefined();
  });
});
