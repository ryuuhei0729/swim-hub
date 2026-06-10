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

const JA_REGEX = /[ぁ-んァ-ヶー一-龯]/;

describe("shared/messages global coverage", () => {
  // [V-01] キー構造一致
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
