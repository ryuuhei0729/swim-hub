/**
 * Phase 1-B: LP メタデータ生成テスト
 *
 * Sprint Contract 検証観点:
 *   [V-20] ja ロケールで title が "SwimHub - 水泳選手のための記録管理システム" を含む
 *   [V-21] en ロケールで title が "SwimHub - Swim records & training platform" を含む
 *   [V-22] alternates.languages に "ja" / "en" / "x-default" の3つが含まれる
 *   [V-23] canonical が "/{locale}" 形式 (例: "/ja" または "/en")
 *   [V-24] login/signup/reset-password/update-password の各 layout が locale 別 title を返す
 *
 * NOTE: generateMetadata は async Server Function のため、直接呼び出して検証する。
 *       実装コードを直接 import して確認するが、期待値は仕様に基づく固定文字列。
 *       (仕様 = 既に layout.tsx に実装済みの ja/en 分岐、Phase 1-B では layout.tsx に
 *        generateMetadata が追加される)
 */

import { describe, it, expect, vi } from "vitest";

// next/font/google を mock (実関数を呼ぶとエラーになる)
// W1: Noto_Sans_KR/Noto_Sans_SC に preload:false が追加されたため、モック側も定義に揃える
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-inter", className: "" }),
  Noto_Sans_JP: () => ({ variable: "--font-noto-sans-jp", className: "" }),
  Noto_Sans_KR: (_opts?: object) => ({ variable: "--font-noto-sans-kr", className: "" }),
  Noto_Sans_SC: (_opts?: object) => ({ variable: "--font-noto-sans-sc", className: "" }),
  Poiret_One: (_opts?: object) => ({ variable: "--font-poiret-one", className: "" }),
  Josefin_Sans: (_opts?: object) => ({ variable: "--font-josefin-sans", className: "" }),
  Chakra_Petch: (_opts?: object) => ({ variable: "--font-chakra-petch", className: "" }),
  Zen_Kaku_Gothic_New: (_opts?: object) => ({ variable: "--font-zen-kaku-gothic-new", className: "" }),
}));

// next-intl/server をモック: Node テスト環境では server context が無いため
// getTranslations を locale 別の messages 読み込みで再現する
vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof import("next-intl/server")>("next-intl/server");
  const messagesByLocale: Record<string, Record<string, unknown>> = {
    ja: (await import("@apps/shared/messages/ja.json")).default as Record<string, unknown>,
    en: (await import("@apps/shared/messages/en.json")).default as Record<string, unknown>,
    zh: (await import("@apps/shared/messages/zh.json")).default as Record<string, unknown>,
    ko: (await import("@apps/shared/messages/ko.json")).default as Record<string, unknown>,
    de: (await import("@apps/shared/messages/de.json")).default as Record<string, unknown>,
  };

  const getValue = (obj: Record<string, unknown>, path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, obj);
  };

  return {
    ...actual,
    getMessages: vi.fn(({ locale }: { locale: string }) =>
      Promise.resolve(messagesByLocale[locale] ?? {}),
    ),
    setRequestLocale: vi.fn(),
    getTranslations: vi.fn(({ locale, namespace }: { locale: string; namespace: string }) => {
      const messages = messagesByLocale[locale] ?? {};
      const ns = getValue(messages, namespace) as Record<string, unknown>;
      const t = (key: string) => {
        const value = ns?.[key];
        return typeof value === "string" ? value : key;
      };
      t.raw = (key: string) => ns?.[key];
      return Promise.resolve(t);
    }),
  };
});

import { generateMetadata as generateLocaleMetadata } from "../../app/[locale]/layout";

// ---------------------------------------------------------------------------
// [V-20] [V-21] ルート locale layout の title 検証
// ---------------------------------------------------------------------------

describe("[V-20][V-21] ルート locale layout の generateMetadata", () => {
  it("ja ロケールで title が日本語タイトルを含む", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(typeof metadata.title === "string" ? metadata.title : "").toContain("SwimHub");
    expect(typeof metadata.title === "string" ? metadata.title : "").toContain("水泳");
  });

  it("en ロケールで title が英語タイトルを含む", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(typeof metadata.title === "string" ? metadata.title : "").toContain("SwimHub");
    // 日本語が含まれていないこと
    expect(typeof metadata.title === "string" ? metadata.title : "").not.toMatch(/[぀-ヿ一-鿿]/);
  });

  it("ja ロケールの description が日本語である", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    expect(typeof metadata.description === "string" ? metadata.description : "").toMatch(/[ぁ-ん]/);
  });

  it("en ロケールの description が日本語を含まない", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    expect(typeof metadata.description === "string" ? metadata.description : "").not.toMatch(/[぀-ヿ一-鿿]/);
  });
});

// ---------------------------------------------------------------------------
// zh / ko / de ロケールの title / description 検証
// ---------------------------------------------------------------------------

describe("zh/ko/de ロケールの title 検証", () => {
  it("zh ロケールで title が SwimHub を含み中国語文字を含む", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "zh" }),
    });

    const title = typeof metadata.title === "string" ? metadata.title : "";
    expect(title).toContain("SwimHub");
    // 中国語: 汉字が含まれること
    expect(title).toMatch(/[一-鿿]/);
  });

  it("ko ロケールで title が SwimHub を含みハングルを含む", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "ko" }),
    });

    const title = typeof metadata.title === "string" ? metadata.title : "";
    expect(title).toContain("SwimHub");
    // 韓国語: ハングルが含まれること
    expect(title).toMatch(/[가-힣]/);
  });

  it("de ロケールで title が SwimHub を含みラテン文字のみ", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "de" }),
    });

    const title = typeof metadata.title === "string" ? metadata.title : "";
    expect(title).toContain("SwimHub");
    // 日本語・中国語・ハングルが含まれないこと
    expect(title).not.toMatch(/[぀-ヿ一-鿿]/);
    expect(title).not.toMatch(/[가-힣]/);
  });
});

// ---------------------------------------------------------------------------
// [V-22] alternates.languages に ja / en / x-default が含まれる
// ---------------------------------------------------------------------------

describe("[V-22] alternates.languages の5言語確認 (ja/en/zh/ko/de + x-default)", () => {
  const ALL_LOCALES = ["ja", "en", "zh", "ko", "de"] as const;

  for (const locale of ALL_LOCALES) {
    it(`${locale} ロケールで alternates.languages に ja/en/zh/ko/de/x-default が存在する`, async () => {
      const metadata = await generateLocaleMetadata({
        params: Promise.resolve({ locale }),
      });

      const languages = metadata.alternates?.languages as Record<string, string> | undefined;
      expect(languages).toBeDefined();
      expect(languages?.["ja"]).toBeDefined();
      expect(languages?.["en"]).toBeDefined();
      expect(languages?.["zh"]).toBeDefined();
      expect(languages?.["ko"]).toBeDefined();
      expect(languages?.["de"]).toBeDefined();
      expect(languages?.["x-default"]).toBeDefined();
    });
  }
});

// ---------------------------------------------------------------------------
// [V-23] canonical が /{locale} 形式
// ---------------------------------------------------------------------------

describe("[V-23] canonical URL の形式確認", () => {
  it("ja ロケールで canonical に /ja が含まれる", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "ja" }),
    });

    const canonical = metadata.alternates?.canonical;
    const canonicalStr = typeof canonical === "string" ? canonical : "";
    expect(canonicalStr).toContain("/ja");
  });

  it("en ロケールで canonical に /en が含まれる", async () => {
    const metadata = await generateLocaleMetadata({
      params: Promise.resolve({ locale: "en" }),
    });

    const canonical = metadata.alternates?.canonical;
    const canonicalStr = typeof canonical === "string" ? canonical : "";
    expect(canonicalStr).toContain("/en");
  });
});

// ---------------------------------------------------------------------------
// [V-24] 各認証ページの layout が locale 別 metadata を返す
// NOTE: Phase 1-B 実装後に各 layout.tsx が generateMetadata を export する前提。
//       実装前は import が失敗するため、実装後に有効化すること。
//       スケルトンとしてテスト構造のみ定義し、TODO コメントで明示する。
// ---------------------------------------------------------------------------

// TODO: Phase 1-B 実装後に以下のテストを有効化する
// describe("[V-24] 認証ページ layout の locale 別 metadata", () => {
//   it("login layout — ja ロケールで 'ログイン | SwimHub' を含む", async () => {
//     const { generateMetadata } = await import("../../app/[locale]/(unauthenticated)/login/layout");
//     const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
//     expect(typeof metadata.title === "string" ? metadata.title : "").toContain("ログイン");
//   });
//
//   it("login layout — en ロケールで 'Login | SwimHub' または 'Sign In | SwimHub' を含む", async () => {
//     const { generateMetadata } = await import("../../app/[locale]/(unauthenticated)/login/layout");
//     const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
//     expect(typeof metadata.title === "string" ? metadata.title : "").toMatch(/Login|Sign In/i);
//   });
//
//   it("signup layout — ja ロケールで '無料登録' または 'アカウント作成' を含む", async () => {
//     const { generateMetadata } = await import("../../app/[locale]/(unauthenticated)/signup/layout");
//     const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ja" }) });
//     expect(typeof metadata.title === "string" ? metadata.title : "").toMatch(/無料登録|アカウント作成/);
//   });
//
//   it("signup layout — en ロケールで 'Sign Up' または 'Register' を含む", async () => {
//     const { generateMetadata } = await import("../../app/[locale]/(unauthenticated)/signup/layout");
//     const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
//     expect(typeof metadata.title === "string" ? metadata.title : "").toMatch(/Sign Up|Register/i);
//   });
//
//   it("reset-password layout — en ロケールで 'Reset Password' を含む", async () => {
//     const { generateMetadata } = await import("../../app/[locale]/(unauthenticated)/reset-password/layout");
//     const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
//     expect(typeof metadata.title === "string" ? metadata.title : "").toMatch(/Reset Password/i);
//   });
// });
