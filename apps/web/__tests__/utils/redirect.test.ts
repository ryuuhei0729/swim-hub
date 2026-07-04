/**
 * Sprint Contract: ログイン画面リデザイン — C-3 検証
 * getSafeRedirectUrl のセキュリティ修正 (C-3) テスト
 *
 * 検証観点:
 *   - 正常系: 正当な相対パスが通る (リグレッションなし)
 *   - 異常系: エンコードバイパス (%2F%2F) が拒否される
 *   - 異常系: バックスラッシュ (/\) が拒否される
 *   - 異常系: プロトコル相対 URL (//) が拒否される
 *   - 異常系: 絶対 URL が拒否される
 *   - 境界値: null, 空文字
 */

import { describe, expect, it } from "vitest";
import { getSafeRedirectUrl } from "@/utils/redirect";

describe("getSafeRedirectUrl", () => {
  // ----------------------------------------------------------------
  // 正常系: 正当なパスが通ること (C-3 リグレッション確認)
  // ----------------------------------------------------------------
  describe("正常系: 正当なパスは通る", () => {
    it("/dashboard はそのまま返る", () => {
      expect(getSafeRedirectUrl("/dashboard")).toBe("/dashboard");
    });

    it("/ja/mypage はそのまま返る", () => {
      expect(getSafeRedirectUrl("/ja/mypage")).toBe("/ja/mypage");
    });

    it("/en/records/123 はそのまま返る", () => {
      expect(getSafeRedirectUrl("/en/records/123")).toBe("/en/records/123");
    });

    it("クエリパラメータ付きパス /dashboard?tab=practice はそのまま返る", () => {
      expect(getSafeRedirectUrl("/dashboard?tab=practice")).toBe("/dashboard?tab=practice");
    });

    it("エンコードされた日本語パス /ja/%E3%83%9E%E3%82%A4%E3%83%9A%E3%83%BC%E3%82%B8 はそのまま返る", () => {
      expect(getSafeRedirectUrl("/ja/%E3%83%9E%E3%82%A4%E3%83%9A%E3%83%BC%E3%82%B8")).toBe(
        "/ja/%E3%83%9E%E3%82%A4%E3%83%9A%E3%83%BC%E3%82%B8",
      );
    });
  });

  // ----------------------------------------------------------------
  // null / 空文字: defaultPath ("/dashboard") を返す
  // ----------------------------------------------------------------
  describe("null / 空文字は /dashboard にフォールバック", () => {
    it("null → /dashboard", () => {
      expect(getSafeRedirectUrl(null)).toBe("/dashboard");
    });

    it("空文字 → /dashboard", () => {
      expect(getSafeRedirectUrl("")).toBe("/dashboard");
    });
  });

  // ----------------------------------------------------------------
  // 異常系: オープンリダイレクト攻撃パターン (拒否)
  // ----------------------------------------------------------------
  describe("異常系: オープンリダイレクト攻撃パターンは拒否", () => {
    it("絶対 URL (https://evil.com) → /dashboard", () => {
      expect(getSafeRedirectUrl("https://evil.com")).toBe("/dashboard");
    });

    it("絶対 URL (http://evil.com/path) → /dashboard", () => {
      expect(getSafeRedirectUrl("http://evil.com/path")).toBe("/dashboard");
    });

    it("プロトコル相対 URL (//evil.com) → /dashboard", () => {
      expect(getSafeRedirectUrl("//evil.com")).toBe("/dashboard");
    });

    it("プロトコル相対 URL (//evil.com/path) → /dashboard", () => {
      expect(getSafeRedirectUrl("//evil.com/path")).toBe("/dashboard");
    });

    it("バックスラッシュバイパス (/\\evil.com) → /dashboard", () => {
      expect(getSafeRedirectUrl("/\\evil.com")).toBe("/dashboard");
    });
  });

  // ----------------------------------------------------------------
  // C-3 新規: エンコードバイパス攻撃パターン (拒否)
  // ----------------------------------------------------------------
  describe("C-3 新規: エンコードバイパス攻撃は拒否", () => {
    it("/%2F%2Fevil.com (//evil.com のエンコード) → /dashboard", () => {
      // デコード後: //evil.com → startsWith('//')で拒否
      expect(getSafeRedirectUrl("/%2F%2Fevil.com")).toBe("/dashboard");
    });

    it("/%5Cevil.com (/\\evil.com のエンコード) → /dashboard", () => {
      // デコード後: /\evil.com → startsWith('/\\')で拒否
      expect(getSafeRedirectUrl("/%5Cevil.com")).toBe("/dashboard");
    });

    it("/%2fevil.com (小文字エンコード) → /dashboard", () => {
      // デコード後: //evil.com → 拒否
      expect(getSafeRedirectUrl("/%2fevil.com")).toBe("/dashboard");
    });
  });

  // ----------------------------------------------------------------
  // 境界値
  // ----------------------------------------------------------------
  describe("境界値", () => {
    it("ルートパス '/' はそのまま返る", () => {
      expect(getSafeRedirectUrl("/")).toBe("/");
    });

    it("不正な percent エンコード (/bad%2Xpath) は /dashboard にフォールバック", () => {
      // decodeURIComponent が例外を投げる
      expect(getSafeRedirectUrl("/bad%2Xpath")).toBe("/dashboard");
    });

    it("スラッシュ1つで始まる正常パス /abc はそのまま返る", () => {
      expect(getSafeRedirectUrl("/abc")).toBe("/abc");
    });
  });
});
