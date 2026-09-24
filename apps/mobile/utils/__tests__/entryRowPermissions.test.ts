/**
 * entryRowPermissions テスト (mobile)
 *
 * Sprint Contract D1 / R1 / R2 / SC1〜SC4 / SC8
 * 対象: `apps/mobile/utils/entryRowPermissions.ts` の `canEditOrDeleteEntryRow`
 *
 * この関数はエントリー1行ごとに「編集/削除アイコンを表示してよいか」を判定する純関数。
 * トートロジー防止: 実装 (if 文の内部構造) をそのままコピーせず、入出力の組だけを
 * Sprint Contract の仕様から導出して assert する。
 */
import { describe, it, expect } from "vitest";
import { canEditOrDeleteEntryRow } from "../entryRowPermissions";

describe("canEditOrDeleteEntryRow", () => {
  describe("[SC3] 他ユーザーの行には出さない", () => {
    it("entry.user_id !== currentUserId のとき、entryStatus が open でも false", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-2", "open")).toBe(false);
    });
  });

  describe("[SC1/SC2] 自分の行かつ open のときのみ true", () => {
    it("自分の行 + open は true", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "open")).toBe(true);
    });
  });

  describe("[SC4/R1] 実効ステータスによる表示条件", () => {
    it("自分の行でも entryStatus='before' は false", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "before")).toBe(false);
    });

    it("自分の行でも entryStatus='closed' は false", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "closed")).toBe(false);
    });
  });

  describe("[SC8] admin 自身の行にも同様に適用される (isAdmin では分岐しない)", () => {
    it("admin 自身の user_id と currentUserId が一致し open なら true (呼び出し側は isAdmin を渡さない)", () => {
      // この関数のシグネチャに isAdmin パラメータ自体が存在しないことが、
      // 「isAdmin で分岐しない」という Sprint Contract の要件を型レベルで保証する。
      expect(canEditOrDeleteEntryRow("admin-1", "admin-1", "open")).toBe(true);
    });
  });

  describe("[R2] リレー: 行単位の判定であり、他選手のレグ行の状態には影響しない", () => {
    it("同一 currentUserId でも行ごとの user_id が違えば行ごとに結果が変わる (他選手のレグ行は false のまま)", () => {
      const currentUserId = "u-1";
      // 自分のレグ行
      expect(canEditOrDeleteEntryRow("u-1", currentUserId, "open")).toBe(true);
      // 他選手のレグ行 (同一 style だが行の user_id が異なる想定)
      expect(canEditOrDeleteEntryRow("u-2", currentUserId, "open")).toBe(false);
    });
  });

  describe("境界値: currentUserId が未確定", () => {
    it("currentUserId が null のとき false", () => {
      expect(canEditOrDeleteEntryRow("u-1", null, "open")).toBe(false);
    });

    it("currentUserId が undefined のとき false", () => {
      expect(canEditOrDeleteEntryRow("u-1", undefined, "open")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // ミューテーションによる赤の実証 (B-3): 純関数の入力を変えるだけで赤にできることの確認。
  // プロダクションコードは書き換えない。
  // -----------------------------------------------------------------------
  describe("[ミューテーション実証] 入力を変えるだけで結果が反転すること", () => {
    it("user_id を一致させた状態から不一致にずらすと true→false に変わる", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "open")).toBe(true);
      expect(canEditOrDeleteEntryRow("u-1", "u-9", "open")).toBe(false);
    });

    it("entryStatus を open から closed にずらすと true→false に変わる", () => {
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "open")).toBe(true);
      expect(canEditOrDeleteEntryRow("u-1", "u-1", "closed")).toBe(false);
    });
  });
});
