/**
 * entryTabIndex テスト (mobile)
 *
 * Sprint Contract D9 / SC11〜SC14
 * 対象: `apps/mobile/utils/entryTabIndex.ts` の `resolveInitialEntryTabIndex`
 *
 * D9: 編集アイコンから遷移したとき、押した行の entry.id に対応する項目タブを
 * アクティブにして開く。対応付けは entry.id で行い、style_id では引かない
 * (リレーは同一 style の行が複数存在しうるため)。
 */
import { describe, it, expect } from "vitest";
import { resolveInitialEntryTabIndex } from "../entryTabIndex";
import type { EntryTabIndexItem } from "../entryTabIndex";

describe("resolveInitialEntryTabIndex", () => {
  describe("[SC11] 種目ごとに対応するタブが開く", () => {
    it("種目1(先頭)の entry.id を渡すと index 0 が返る", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, "entry-1")).toBe(0);
    });

    it("種目2(2番目)の entry.id を渡すと index 1 が返る", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, "entry-2")).toBe(1);
    });
  });

  describe("[SC12] リレー: 同一 style の行が複数あっても entry.id で一意に引ける", () => {
    // style_id で引く実装だと、同一 style の行が複数あるとき常に先頭 (または誤った行) を
    // 指してしまう。entry.id (existingEntryId) だけをキーにすることを検証する。
    it("同一 style_id 相当の行が複数あっても、押した行の entry.id に対応するタブが開く", () => {
      // items は style_id を持たず existingEntryId のみを持つ (このモジュールの契約自体が
      // style による解決を許さないことを型で示す)。ここでは「同一 style から来た複数行」を
      // 模すため、内容的に区別できない行 (id だけが違う) を用意する。
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "relay-leg-1" }, // 同一 style (例: リレー第1泳者)
        { existingEntryId: "relay-leg-2" }, // 同一 style (例: リレー第2泳者)
        { existingEntryId: "relay-leg-3" },
      ];
      expect(resolveInitialEntryTabIndex(items, "relay-leg-2")).toBe(1);
      expect(resolveInitialEntryTabIndex(items, "relay-leg-3")).toBe(2);
    });
  });

  describe("[SC13] フォールバック: 存在しない entry / 未指定は先頭タブ", () => {
    it("存在しない entry.id を渡すと先頭タブ (index 0) が返る (他端末で削除された等)", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, "entry-does-not-exist")).toBe(0);
    });

    it("items が空配列でも例外を投げず index 0 を返す", () => {
      expect(resolveInitialEntryTabIndex([], "entry-1")).toBe(0);
    });
  });

  describe("[SC14] 非退行: targetEntryId を渡さない既存の遷移は先頭タブのまま", () => {
    it("targetEntryId が undefined のとき index 0 が返る", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, undefined)).toBe(0);
    });

    it("targetEntryId が null のとき index 0 が返る", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, null)).toBe(0);
    });

    it("targetEntryId が空文字のとき index 0 が返る (falsy 扱い)", () => {
      const items: EntryTabIndexItem[] = [{ existingEntryId: "entry-1" }];
      expect(resolveInitialEntryTabIndex(items, "")).toBe(0);
    });
  });

  describe("境界値: existingEntryId 未設定の項目 (新規追加中の空項目)", () => {
    it("existingEntryId が undefined の項目は一致対象にならない", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        {}, // まだ保存されていない新規項目
      ];
      expect(resolveInitialEntryTabIndex(items, undefined)).toBe(0);
      expect(resolveInitialEntryTabIndex(items, "entry-1")).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // ミューテーションによる赤の実証 (B-3)
  // -----------------------------------------------------------------------
  describe("[ミューテーション実証]", () => {
    it("存在する id を存在しない id に差し替えると結果が変わる (非0 → 0)", () => {
      const items: EntryTabIndexItem[] = [
        { existingEntryId: "entry-1" },
        { existingEntryId: "entry-2" },
      ];
      expect(resolveInitialEntryTabIndex(items, "entry-2")).toBe(1);
      expect(resolveInitialEntryTabIndex(items, "entry-not-exist")).toBe(0);
    });
  });
});
