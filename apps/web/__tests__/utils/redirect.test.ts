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

  // ----------------------------------------------------------------
  // ガード: getSafeRedirectUrl は locale プレフィックスを一切加工しない
  // (Sprint Contract: 二重 locale プレフィックス 404 バグ修正・PM確定設計)
  //
  // 背景: バグ修正の設計は「呼び出し側 (login/page.tsx 等 3箇所) が
  // getSafeRedirectUrl の戻り値を stripLocale() に個別に通す」であり、
  // getSafeRedirectUrl 自身に stripLocale を組み込む「共通化」は禁止されている。
  // 理由: lib/supabase-auth/middleware.ts:30 (OAuth code フロー) は
  // getSafeRedirectUrl の戻り値が locale 付きであることに依存して動作しており、
  // ここで locale を剥がすと OAuth ログインのリダイレクト先ロケールが壊れる。
  // このテストは「将来誰かが getSafeRedirectUrl の中に stripLocale を混ぜてしまったら
  // 赤くなる」ことで、その退行を検出するガードとして機能する。
  // ----------------------------------------------------------------
  describe("ガード: locale プレフィックスは加工されずそのまま返る (OAuth経路の退行防止)", () => {
    it("/ja/dashboard (locale付き) はそのまま /ja/dashboard を返す (locale を剥がさない)", () => {
      expect(getSafeRedirectUrl("/ja/dashboard")).toBe("/ja/dashboard");
    });

    it("/en/mypage (他ロケール) はそのまま /en/mypage を返す (locale を剥がさない)", () => {
      expect(getSafeRedirectUrl("/en/mypage")).toBe("/en/mypage");
    });
  });
});

// =====================================================================
// 項目2 (Phase A RED, 2026-08-30): getSafeRedirectUrl の厳格化
//   - ".." トラバーサル拒否
//   - 制御文字 (0x00-0x1F, 0x7F, 0x80-0x9F) 拒否
//   判定は decoded (decodeURIComponent 後の値) に対して行う。
//
// 🚫 返り値の契約は変わらない: 上のテスト群 (20件) + resolveSafeLocalRedirect
// (localeRedirect.test.ts, 13件) は無改修で green のまま。ここでは「新しく
// 拒否されるようになるべきケース」だけを追加する。
//
// 現状 (実装前) の期待: 本 describe ブロック内のテストは全て RED になるのが
// 正しい (getSafeRedirectUrl はまだ ".." も制御文字も見ていないため)。
// =====================================================================
describe("項目2 (RED): .. トラバーサル拒否", () => {
  it("/foo/../bar (トラバーサル) → /dashboard", () => {
    expect(getSafeRedirectUrl("/foo/../bar")).toBe("/dashboard");
  });

  it("/../evil.com (先頭からのトラバーサル) → /dashboard", () => {
    expect(getSafeRedirectUrl("/../evil.com")).toBe("/dashboard");
  });

  it("/ja/../../evil (locale付き + 多段トラバーサル) → /dashboard", () => {
    expect(getSafeRedirectUrl("/ja/../../evil")).toBe("/dashboard");
  });

  it("エンコードされたトラバーサル /ja/%2e%2e/evil (decoded後に .. が現れる) → /dashboard", () => {
    // decodeURIComponent("/ja/%2e%2e/evil") === "/ja/../evil"
    expect(getSafeRedirectUrl("/ja/%2e%2e/evil")).toBe("/dashboard");
  });
});

describe("項目2 (RED): 制御文字 (0x00-0x1F, 0x7F, 0x80-0x9F) 拒否", () => {
  it("生のNUL文字 (0x00) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x00) + "board")).toBe("/dashboard");
  });

  it("生のタブ文字 (0x09) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x09) + "board")).toBe("/dashboard");
  });

  it("生の改行文字 (0x0A) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x0a) + "board")).toBe("/dashboard");
  });

  it("生のCR文字 (0x0D) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x0d) + "board")).toBe("/dashboard");
  });

  it("0x1F (制御文字範囲の上端) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x1f) + "board")).toBe("/dashboard");
  });

  it("%00 (エンコードされたNUL, decoded後に0x00) → /dashboard", () => {
    expect(getSafeRedirectUrl("/dashboard%00")).toBe("/dashboard");
  });

  it("%0A (エンコードされた改行, decoded後に0x0A) → /dashboard", () => {
    expect(getSafeRedirectUrl("/dashboard%0A")).toBe("/dashboard");
  });

  it("0x7F (DEL) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x7f) + "board")).toBe("/dashboard");
  });

  it("0x80 (C1制御文字の下端) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x80) + "board")).toBe("/dashboard");
  });

  it("0x9F (C1制御文字の上端) を含むパス → /dashboard", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x9f) + "board")).toBe("/dashboard");
  });

  // 境界値: 範囲外の文字は誤って拒否されない (非退行の確認)
  it("[非退行] 0x20 (半角スペース) を含むパスは拒否されない", () => {
    expect(getSafeRedirectUrl("/dash" + String.fromCharCode(0x20) + "board")).toBe("/dash board");
  });

  it("[非退行] 0xA0 (制御文字範囲の直後、NBSP) を含むパスは拒否されない", () => {
    const withNbsp = "/dash" + String.fromCharCode(0xa0) + "board";
    expect(getSafeRedirectUrl(withNbsp)).toBe(withNbsp);
  });
});
