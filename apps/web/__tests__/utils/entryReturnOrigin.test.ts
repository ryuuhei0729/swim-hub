/**
 * apps/web/utils/entryReturnOrigin.ts の検証
 *
 * Sprint Contract (追加スプリント: 代理入力の戻り先が起点と食い違う):
 *   SC25 — origin クエリを `../../evil` 等に改変しても、そのパスへ遷移しない
 *   (許可リストの enum に正規化し、enum → ハードコードパス定数のマップを経由する)。
 *
 * 「enum に落ちたあとは安全」(getEntryReturnPath) と「落とす処理が正しい」
 * (parseEntryReturnOrigin) は別のテストに分ける (PM 指示 #3)。
 * parseEntryReturnOrigin は不正入力を型で表現できない (string | string[] | undefined を
 * 受けるため) ので、ここで文字列レベルの攻撃パターンを直接検証する。
 */

import { describe, expect, it } from "vitest";
import { parseEntryReturnOrigin, getEntryReturnPath } from "@/utils/entryReturnOrigin";

describe("parseEntryReturnOrigin — クエリ値を許可リストの enum に正規化する", () => {
  describe("正常系: 許可リストの2値はそのまま通る", () => {
    it('"member" → "member"', () => {
      expect(parseEntryReturnOrigin("member")).toBe("member");
    });

    it('"admin" → "admin"', () => {
      expect(parseEntryReturnOrigin("admin")).toBe("admin");
    });
  });

  describe("異常系: 許可リスト外の値は既定値 (\"admin\") に落ちる", () => {
    it("undefined (クエリ自体が無い) → \"admin\"", () => {
      expect(parseEntryReturnOrigin(undefined)).toBe("admin");
    });

    it("空文字 → \"admin\"", () => {
      expect(parseEntryReturnOrigin("")).toBe("admin");
    });

    it('パストラバーサル "../../evil" → "admin" (パスへ埋め込まれない)', () => {
      expect(parseEntryReturnOrigin("../../evil")).toBe("admin");
    });

    it('絶対URL "https://evil.com" → "admin"', () => {
      expect(parseEntryReturnOrigin("https://evil.com")).toBe("admin");
    });

    it('プロトコル相対URL "//evil.com" → "admin"', () => {
      expect(parseEntryReturnOrigin("//evil.com")).toBe("admin");
    });

    it('大文字違いの "Member" (許可リストと完全一致しない) → "admin"', () => {
      expect(parseEntryReturnOrigin("Member")).toBe("admin");
    });

    it('末尾に余分な文字がある "admin " → "admin" (部分一致を許さない)', () => {
      expect(parseEntryReturnOrigin("admin ")).toBe("admin");
    });

    it('無関係な文字列 "foo" → "admin"', () => {
      expect(parseEntryReturnOrigin("foo")).toBe("admin");
    });
  });

  describe("異常系: 配列 (クエリの多重指定 ?origin=a&origin=b) は先頭採用せず既定値に落ちる", () => {
    it('["member", "admin"] → "admin" (先頭 "member" を採用しない。先頭要素採用ロジックなら "member" が' +
      "返ってしまうため、先頭が許可リスト内の値であっても配列自体を拒否できていることの決定的な証拠になる)", () => {
      expect(parseEntryReturnOrigin(["member", "admin"])).toBe("admin");
    });

    it('["../../evil"] (単一要素の配列) → "admin"', () => {
      expect(parseEntryReturnOrigin(["../../evil"])).toBe("admin");
    });

    it("[] (空配列) → \"admin\"", () => {
      expect(parseEntryReturnOrigin([])).toBe("admin");
    });
  });
});

describe("getEntryReturnPath — enum → ハードコードパス定数のマップ (enum に落ちた後の変換)", () => {
  it('"member" は /teams/{teamId}?tab=competitions を返す', () => {
    expect(getEntryReturnPath("member", "team-1")).toBe("/teams/team-1?tab=competitions");
  });

  it('"admin" は /teams-admin/{teamId}?tab=competitions を返す', () => {
    expect(getEntryReturnPath("admin", "team-1")).toBe("/teams-admin/team-1?tab=competitions");
  });

  it("teamId が変わればパス中の teamId 部分だけが変わる (固定文字列でないことの確認)", () => {
    expect(getEntryReturnPath("member", "team-999")).toBe("/teams/team-999?tab=competitions");
    expect(getEntryReturnPath("admin", "team-999")).toBe("/teams-admin/team-999?tab=competitions");
  });
});
