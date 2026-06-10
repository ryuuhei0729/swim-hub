/**
 * Phase 1-B: 翻訳ファイルのキー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-01] ja.json と en.json のキー構造が完全一致 (キー欠損 = リグレッション)
 *   [V-02] 各 namespace (common / nav / lp / auth / pricing / about / contact / legal) の存在確認
 *   [V-03] 必須キー (Phase 1-A から維持すべきキー) の存在確認
 *   [V-04] en.json の値に日本語ハードコードがゼロ (翻訳漏れ検出)
 *
 * NOTE: テスト本体は実装コードを参照しない。
 *       Sprint Contract で合意された namespace 構造に基づいて検証する。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";

// ---------------------------------------------------------------------------
// ヘルパー: オブジェクトのネストしたキーをフラットなパスで列挙
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// ヘルパー: 値の中に日本語文字が含まれるかチェック
// ---------------------------------------------------------------------------

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    // ひらがな・カタカナ・漢字の範囲
    return /[぀-ヿ一-鿿＀-￯]/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(containsJapanese);
  }
  return false;
}

// ---------------------------------------------------------------------------
// [V-01] ja.json と en.json のキー構造が完全一致
// ---------------------------------------------------------------------------

describe("[V-01] ja.json と en.json のキー構造一致", () => {
  it("ja.json のすべてのキーが en.json に存在する (en 欠損ゼロ)", () => {
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const enKeys = new Set(flattenKeys(enMessages as unknown as Record<string, unknown>));

    const missingInEn = jaKeys.filter((k) => !enKeys.has(k));
    expect(
      missingInEn,
      `en.json に以下のキーが欠損しています: ${missingInEn.join(", ")}`,
    ).toHaveLength(0);
  });

  it("en.json のすべてのキーが ja.json に存在する (ja 欠損ゼロ = 余剰キー検出)", () => {
    const enKeys = flattenKeys(enMessages as unknown as Record<string, unknown>);
    const jaKeys = new Set(flattenKeys(jaMessages as unknown as Record<string, unknown>));

    const missingInJa = enKeys.filter((k) => !jaKeys.has(k));
    expect(
      missingInJa,
      `ja.json に以下のキーが欠損しています: ${missingInJa.join(", ")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// [V-02] 各 namespace の存在確認
// ---------------------------------------------------------------------------

describe("[V-02] 必須 namespace の存在確認 (ja.json)", () => {
  const REQUIRED_NAMESPACES = ["common", "nav", "lp", "auth", "pricing", "about", "contact", "legal"];

  for (const ns of REQUIRED_NAMESPACES) {
    it(`namespace "${ns}" が ja.json に存在する`, () => {
      const messages = jaMessages as Record<string, unknown>;
      expect(
        messages[ns],
        `ja.json に namespace "${ns}" が存在しません`,
      ).toBeDefined();
      expect(typeof messages[ns]).toBe("object");
    });
  }
});

describe("[V-02] 必須 namespace の存在確認 (en.json)", () => {
  const REQUIRED_NAMESPACES = ["common", "nav", "lp", "auth", "pricing", "about", "contact", "legal"];

  for (const ns of REQUIRED_NAMESPACES) {
    it(`namespace "${ns}" が en.json に存在する`, () => {
      const messages = enMessages as Record<string, unknown>;
      expect(
        messages[ns],
        `en.json に namespace "${ns}" が存在しません`,
      ).toBeDefined();
      expect(typeof messages[ns]).toBe("object");
    });
  }
});

// ---------------------------------------------------------------------------
// [V-03] Phase 1-A で確立した必須キーの維持確認
// ---------------------------------------------------------------------------

describe("[V-03] Phase 1-A からの必須キー維持確認", () => {
  const PHASE_1A_REQUIRED_KEYS: string[] = [
    "common.appName",
    "common.loading",
    "common.error",
  ];

  for (const key of PHASE_1A_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json に "${key}" が存在しません (Phase 1-A からのリグレッション)`,
      ).toContain(key);
    });

    it(`en.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(enMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `en.json に "${key}" が存在しません (Phase 1-A からのリグレッション)`,
      ).toContain(key);
    });
  }

  it('common.appName の値が両ロケールで "SwimHub" であること (固有名詞は翻訳しない)', () => {
    const ja = jaMessages as unknown as Record<string, Record<string, string>>;
    const en = enMessages as unknown as Record<string, Record<string, string>>;
    expect(ja.common.appName).toBe("SwimHub");
    expect(en.common.appName).toBe("SwimHub");
  });
});

// ---------------------------------------------------------------------------
// [V-04] en.json の値に日本語ハードコードがゼロ (翻訳漏れ検出)
//
// NOTE: common.appName 等の固有名詞 (SwimHub) は日本語を含まないため除外不要。
//       ただし本文系コンテンツ (about/legal) は Phase 1-B 完成定義で
//       「UI フレーム + メタのみ翻訳、本文は日本語維持」のため、
//       本文キー (_body, _content 等のサフィックス規約があれば) は除外する。
//       Phase 1-B では about/legal の本文は日本語 OK なので、
//       このテストは UI フレームキーのみを検証する。
// ---------------------------------------------------------------------------

describe("[V-04] en.json の UI フレームキーに日本語が含まれないこと", () => {
  // UI フレームとして翻訳すべき namespace
  const UI_FRAME_NAMESPACES: string[] = ["nav", "auth", "contact"];

  for (const ns of UI_FRAME_NAMESPACES) {
    it(`en.json の namespace "${ns}" に日本語が含まれない`, () => {
      const messages = enMessages as Record<string, unknown>;
      const nsValue = messages[ns];
      if (!nsValue) return; // namespace 未実装は [V-02] が検出するため ここでは skip
      expect(
        containsJapanese(nsValue),
        `en.json の "${ns}" に日本語が含まれています (翻訳漏れ)`,
      ).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-05] auth namespace の必須キー存在確認
// ---------------------------------------------------------------------------

describe("[V-05] auth namespace の必須キー確認", () => {
  const AUTH_REQUIRED_KEYS = [
    "auth.signin.title",
    "auth.signin.subtitle",
    "auth.signin.submitButton",
    "auth.signup.title",
    "auth.signup.submitButton",
    "auth.resetPassword.title",
    "auth.resetPassword.submitButton",
    "auth.updatePassword.title",
    "auth.updatePassword.submitButton",
    "auth.fields.email",
    "auth.fields.password",
    "auth.fields.name",
    "auth.forgotPassword",
    "auth.googleSignin",
    "auth.appleSignin",
  ];

  for (const key of AUTH_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json に "${key}" が存在しません`,
      ).toContain(key);
    });
  }
});

// ---------------------------------------------------------------------------
// [V-06] nav namespace の必須キー存在確認
// ---------------------------------------------------------------------------

describe("[V-06] nav namespace の必須キー確認", () => {
  const NAV_REQUIRED_KEYS = [
    "nav.practice",
    "nav.competition",
    "nav.proxy",
    "nav.pricing",
    "nav.signup",
    "nav.login",
    "nav.logout",
    "nav.profile",
    "nav.settings",
    "nav.openMenu",
    "nav.closeMenu",
  ];

  for (const key of NAV_REQUIRED_KEYS) {
    it(`ja.json に "${key}" が存在する`, () => {
      const keys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
      expect(
        keys,
        `ja.json に "${key}" が存在しません`,
      ).toContain(key);
    });
  }
});
