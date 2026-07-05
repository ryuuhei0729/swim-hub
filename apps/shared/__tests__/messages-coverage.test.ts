/**
 * shared/messages 全体のロケール網羅性検証 (Phase MT)
 *
 * Phase 1 では `apps/web/__tests__/i18n/*.test.ts` がキー網羅を検証していたが、
 * shared に SSOT を移したことで mobile も同じ shared/messages を参照するように
 * なった。このテストは web/mobile の両方から呼べる軽量な universal check として
 * 以下を担保する:
 *
 *   [V-01] ja.json と en.json のキー構造完全一致 (キー欠損 = リグレッション)
 *   [V-04] en.json の値に日本語ハードコードがゼロ (翻訳漏れ検出)
 *
 * 既存の web 側 phase1c*.test.ts はより詳細な構造検証を担う。本テストはその
 * サマリ的な safety net として機能する。
 */

import { describe, it, expect } from "vitest";

import jaMessages from "../messages/ja.json";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";
import koMessages from "../messages/ko.json";
import deMessages from "../messages/de.json";

// ---------------------------------------------------------------------------
// ヘルパー
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

function getValue(obj: Record<string, unknown>, dottedKey: string): unknown {
  const parts = dottedKey.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

/**
 * 日本語ハードコード検出 Regex。
 * en.json はひらがな/カタカナ/漢字をすべて排除すべき。
 * zh/ko/de はひらがな・カタカナのみ禁止（漢字は中国語・韓国語でも正当に使用される）。
 */
const JA_REGEX = /[ぁ-んァ-ヶー一-龯]/;
// zh/ko/de 向け: ひらがな・カタカナのみ禁止（CJK漢字は中国語・韓国語でも正当）
const JA_KANA_ONLY_REGEX = /[ぁ-んァ-ヶー]/;

describe("shared/messages global coverage", () => {
  // [V-01] キー構造一致 (ja vs en)
  it("[V-01] ja.json and en.json have identical key structures", () => {
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>).sort();
    const enKeys = flattenKeys(enMessages as unknown as Record<string, unknown>).sort();

    const missingInEn = jaKeys.filter((k) => !enKeys.includes(k));
    const missingInJa = enKeys.filter((k) => !jaKeys.includes(k));

    expect(
      missingInEn,
      `Keys present in ja.json but missing from en.json:\n  ${missingInEn.join("\n  ")}`,
    ).toEqual([]);
    expect(
      missingInJa,
      `Keys present in en.json but missing from ja.json:\n  ${missingInJa.join("\n  ")}`,
    ).toEqual([]);
  });

  // [V-01-ext] zh/ko/de も ja と同じキー構造を持つ
  const localeMessages: Record<string, Record<string, unknown>> = {
    zh: zhMessages as unknown as Record<string, unknown>,
    ko: koMessages as unknown as Record<string, unknown>,
    de: deMessages as unknown as Record<string, unknown>,
  };

  it.each(["zh", "ko", "de"])(
    "[V-01-ext] %s.json has identical key structure to ja.json",
    (locale) => {
      const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>).sort();
      const localeKeys = flattenKeys(localeMessages[locale]).sort();

      const missingInLocale = jaKeys.filter((k) => !localeKeys.includes(k));
      const extraInLocale = localeKeys.filter((k) => !jaKeys.includes(k));

      expect(
        missingInLocale,
        `Keys present in ja.json but missing from ${locale}.json:\n  ${missingInLocale.join("\n  ")}`,
      ).toEqual([]);
      expect(
        extraInLocale,
        `Keys present in ${locale}.json but missing from ja.json:\n  ${extraInLocale.join("\n  ")}`,
      ).toEqual([]);
    },
  );

  // [V-04] 英語側に日本語ハードコードゼロ
  it("[V-04] en.json values do not contain any Japanese characters", () => {
    const enKeys = flattenKeys(enMessages as unknown as Record<string, unknown>);
    const violators: { key: string; value: string }[] = [];

    for (const key of enKeys) {
      const value = getValue(enMessages as unknown as Record<string, unknown>, key);
      if (typeof value === "string" && JA_REGEX.test(value)) {
        violators.push({ key, value });
      }
    }

    expect(
      violators,
      `English translations contain Japanese characters:\n${violators
        .map((v) => `  ${v.key}: ${v.value}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  // [V-04-ext] zh/ko/de 側にも日本語ハードコードがないこと
  it("[V-04-ext] zh.json values do not contain hiragana/katakana (Japanese kana leak)", () => {
    // zh は漢字を正当に使用するため、ひらがな・カタカナのみ禁止
    const zhKeys = flattenKeys(zhMessages as unknown as Record<string, unknown>);
    const violators: { key: string; value: string }[] = [];

    for (const key of zhKeys) {
      const value = getValue(zhMessages as unknown as Record<string, unknown>, key);
      if (typeof value === "string" && JA_KANA_ONLY_REGEX.test(value)) {
        violators.push({ key, value });
      }
    }

    expect(
      violators,
      `zh translations contain Japanese hiragana/katakana:\n${violators
        .map((v) => `  ${v.key}: ${v.value}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("[V-04-ext] ko.json values do not contain hiragana/katakana (Japanese kana leak)", () => {
    // ko は漢字(한자)を正当に使用するため、ひらがな・カタカナのみ禁止
    const koKeys = flattenKeys(koMessages as unknown as Record<string, unknown>);
    const violators: { key: string; value: string }[] = [];

    for (const key of koKeys) {
      const value = getValue(koMessages as unknown as Record<string, unknown>, key);
      if (typeof value === "string" && JA_KANA_ONLY_REGEX.test(value)) {
        violators.push({ key, value });
      }
    }

    expect(
      violators,
      `ko translations contain Japanese hiragana/katakana:\n${violators
        .map((v) => `  ${v.key}: ${v.value}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("[V-04-ext] de.json values do not contain any Japanese characters", () => {
    // de は CJK 文字を含まないため、従来通り JA_REGEX で全チェック
    const deKeys = flattenKeys(deMessages as unknown as Record<string, unknown>);
    const violators: { key: string; value: string }[] = [];

    for (const key of deKeys) {
      const value = getValue(deMessages as unknown as Record<string, unknown>, key);
      if (typeof value === "string" && JA_REGEX.test(value)) {
        violators.push({ key, value });
      }
    }

    expect(
      violators,
      `de translations contain Japanese characters:\n${violators
        .map((v) => `  ${v.key}: ${v.value}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  // [V-05] プレースホルダの一致確認 (zh/ko/de で {var} 形式を保持)
  it("[V-05] zh.json placeholder variables match ja.json", () => {
    const PLACEHOLDER_REGEX = /\{(\w+)\}/g;
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const mismatches: string[] = [];

    for (const key of jaKeys) {
      const jaVal = getValue(jaMessages as unknown as Record<string, unknown>, key);
      const zhVal = getValue(zhMessages as unknown as Record<string, unknown>, key);
      if (typeof jaVal !== "string" || typeof zhVal !== "string") continue;

      const jaVars = [...jaVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();
      const zhVars = [...zhVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();

      if (JSON.stringify(jaVars) !== JSON.stringify(zhVars)) {
        mismatches.push(`${key}: ja=${JSON.stringify(jaVars)} zh=${JSON.stringify(zhVars)}`);
      }
    }

    expect(
      mismatches,
      `zh.json placeholder mismatch with ja.json:\n  ${mismatches.join("\n  ")}`,
    ).toEqual([]);
  });

  it("[V-05] ko.json placeholder variables match ja.json", () => {
    const PLACEHOLDER_REGEX = /\{(\w+)\}/g;
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const mismatches: string[] = [];

    for (const key of jaKeys) {
      const jaVal = getValue(jaMessages as unknown as Record<string, unknown>, key);
      const koVal = getValue(koMessages as unknown as Record<string, unknown>, key);
      if (typeof jaVal !== "string" || typeof koVal !== "string") continue;

      const jaVars = [...jaVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();
      const koVars = [...koVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();

      if (JSON.stringify(jaVars) !== JSON.stringify(koVars)) {
        mismatches.push(`${key}: ja=${JSON.stringify(jaVars)} ko=${JSON.stringify(koVars)}`);
      }
    }

    expect(
      mismatches,
      `ko.json placeholder mismatch with ja.json:\n  ${mismatches.join("\n  ")}`,
    ).toEqual([]);
  });

  it("[V-05] de.json placeholder variables match ja.json", () => {
    const PLACEHOLDER_REGEX = /\{(\w+)\}/g;
    const jaKeys = flattenKeys(jaMessages as unknown as Record<string, unknown>);
    const mismatches: string[] = [];

    for (const key of jaKeys) {
      const jaVal = getValue(jaMessages as unknown as Record<string, unknown>, key);
      const deVal = getValue(deMessages as unknown as Record<string, unknown>, key);
      if (typeof jaVal !== "string" || typeof deVal !== "string") continue;

      const jaVars = [...jaVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();
      const deVars = [...deVal.matchAll(PLACEHOLDER_REGEX)].map((m) => m[1]).sort();

      if (JSON.stringify(jaVars) !== JSON.stringify(deVars)) {
        mismatches.push(`${key}: ja=${JSON.stringify(jaVars)} de=${JSON.stringify(deVars)}`);
      }
    }

    expect(
      mismatches,
      `de.json placeholder mismatch with ja.json:\n  ${mismatches.join("\n  ")}`,
    ).toEqual([]);
  });

  // Mobile/Web 共通の重要 namespace が存在することを sanity check
  it("required top-level namespaces exist in both locales", () => {
    const required = [
      "common",
      "auth",
      "practice",
      "competition",
      "mypage",
      "onboarding",
      "settings",
      "dashboard",
      "teams",
      "recordMobile",
      "paywallMobile",
    ];

    for (const ns of required) {
      expect(jaMessages, `ja.json missing namespace: ${ns}`).toHaveProperty(ns);
      expect(enMessages, `en.json missing namespace: ${ns}`).toHaveProperty(ns);
    }
  });

  // ---------------------------------------------------------------------------
  // [SC-01] forms.timeInput.helpTitle / helpBody — 全5言語に非空文字列で存在
  // [SC-02] helpTitle/helpBody にプレースホルダー({var})が含まれないこと
  // ---------------------------------------------------------------------------

  describe("forms.timeInput help keys (QA Sprint: i アイコンヘルプ)", () => {
    const allMessages: Record<string, Record<string, unknown>> = {
      ja: jaMessages as unknown as Record<string, unknown>,
      en: enMessages as unknown as Record<string, unknown>,
      zh: zhMessages as unknown as Record<string, unknown>,
      ko: koMessages as unknown as Record<string, unknown>,
      de: deMessages as unknown as Record<string, unknown>,
    };

    it.each(["ja", "en", "ko", "zh", "de"])(
      "[SC-01] %s.json has non-empty forms.timeInput.helpTitle",
      (locale) => {
        const val = getValue(allMessages[locale], "forms.timeInput.helpTitle");
        expect(val, `${locale}: forms.timeInput.helpTitle is missing`).toBeDefined();
        expect(typeof val, `${locale}: forms.timeInput.helpTitle is not a string`).toBe("string");
        expect((val as string).trim().length, `${locale}: forms.timeInput.helpTitle is empty`).toBeGreaterThan(0);
      },
    );

    it.each(["ja", "en", "ko", "zh", "de"])(
      "[SC-01] %s.json has non-empty forms.timeInput.helpBody",
      (locale) => {
        const val = getValue(allMessages[locale], "forms.timeInput.helpBody");
        expect(val, `${locale}: forms.timeInput.helpBody is missing`).toBeDefined();
        expect(typeof val, `${locale}: forms.timeInput.helpBody is not a string`).toBe("string");
        expect((val as string).trim().length, `${locale}: forms.timeInput.helpBody is empty`).toBeGreaterThan(0);
      },
    );

    it.each(["ja", "en", "ko", "zh", "de"])(
      "[SC-02] %s.json forms.timeInput.helpTitle has no {placeholder} variables",
      (locale) => {
        const val = getValue(allMessages[locale], "forms.timeInput.helpTitle") as string;
        const placeholders = [...(val ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[0]);
        expect(
          placeholders,
          `${locale}: forms.timeInput.helpTitle unexpectedly contains placeholder variables: ${placeholders.join(", ")}`,
        ).toEqual([]);
      },
    );

    it.each(["ja", "en", "ko", "zh", "de"])(
      "[SC-02] %s.json forms.timeInput.helpBody has no {placeholder} variables",
      (locale) => {
        const val = getValue(allMessages[locale], "forms.timeInput.helpBody") as string;
        const placeholders = [...(val ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[0]);
        expect(
          placeholders,
          `${locale}: forms.timeInput.helpBody unexpectedly contains placeholder variables: ${placeholders.join(", ")}`,
        ).toEqual([]);
      },
    );

    // helpTitle は全言語で内容が異なること（翻訳されていること）= 全て同じ文字列ではない
    it("[SC-01] helpTitle is translated (not identical across all 5 locales)", () => {
      const values = ["ja", "en", "ko", "zh", "de"].map(
        (loc) => getValue(allMessages[loc], "forms.timeInput.helpTitle") as string,
      );
      const uniqueValues = new Set(values);
      expect(
        uniqueValues.size,
        `All 5 locales have identical helpTitle — translation was not applied: ${values[0]}`,
      ).toBeGreaterThan(1);
    });

    it("[SC-01] helpBody is translated (not identical across all 5 locales)", () => {
      const values = ["ja", "en", "ko", "zh", "de"].map(
        (loc) => getValue(allMessages[loc], "forms.timeInput.helpBody") as string,
      );
      const uniqueValues = new Set(values);
      expect(
        uniqueValues.size,
        `All 5 locales have identical helpBody — translation was not applied: ${values[0]}`,
      ).toBeGreaterThan(1);
    });
  });

  // Phase M3-M8 で導入した mobile-specific サブ namespace が存在することを確認
  it("mobile-specific sub-namespaces exist (regression guard for Phase M3-M8)", () => {
    const ja = jaMessages as unknown as Record<string, Record<string, unknown>>;

    expect(ja.practice).toHaveProperty("mobile");
    expect(ja.practice).toHaveProperty("form");
    expect(ja.competition).toHaveProperty("mobile");
    expect(ja.competition).toHaveProperty("form");
    expect(ja.competition).toHaveProperty("entry");
    expect(ja.teams).toHaveProperty("mobile");
    expect(ja.mypage).toHaveProperty("mobile");
    expect(ja.settings).toHaveProperty("mobile");
    expect(ja.dashboard).toHaveProperty("mobile");
    expect(ja.onboarding).toHaveProperty("stepLabels");
  });
});
