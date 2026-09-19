/**
 * Issue #49 QA テスト (Phase A スケルトン): teams.nonSwimmer.* の5ロケール網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-15-01] teams.nonSwimmer 名前空間の必須キーが ja/en/ko/zh/de すべてに存在する
 *   [V-15-02] en/ko/zh/de に日本語 (ひらがな/カタカナ/CJK漢字) が残っていない
 *             (「片方のアプリだけが使うキーを作らない」という R5 の裏返しとして、
 *              5ロケール分がプレースホルダーのまま出荷されていないかを検出する)
 *   [V-15-03] ICU プレースホルダー ({count} 等) が ja を基準に全ロケールで対称
 *   [V-15-04] sectionToggle は {count} プレースホルダーを持つ
 *             (「非泳者」トグルのラベルに人数を表示する設計。Web/Mobile 共通仕様として固定)
 *
 * 必須キーは PM裁定 (Issue #49 コメント, R5) に明記された最低限のセットを直接列挙する
 * (この5キーは仕様として PM が確定させた値であり、実装ソースを走査して抽出する対象ではない。
 *  ソース走査方式は「実装が使っているキー」しか拾えず、逆に「実装が使うべきなのに
 *  漏らしたキー」を検出できないため、ここでは仕様の完全性を先に固定する)。
 *
 * Phase A 時点では apps/shared/messages/*.json に teams.nonSwimmer が存在しないため、
 * このテストスイートは red になる。
 */
import { describe, expect, it } from "vitest";
import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";
import koMessages from "../../messages/ko.json";
import zhMessages from "../../messages/zh.json";
import deMessages from "../../messages/de.json";

const LOCALES = ["ja", "en", "ko", "zh", "de"] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_MESSAGES: Record<Locale, unknown> = {
  ja: jaMessages,
  en: enMessages,
  ko: koMessages,
  zh: zhMessages,
  de: deMessages,
};

// R5 で PM が明記した最低限のキー
// "checkboxLabel" は UI がチェックボックス→セグメントコントロールへ移行し
// プロダクションコードからの参照がゼロになったため除外 (Reviewer 指摘, 2026-09-17)
const REQUIRED_KEYS = [
  "infoAriaLabel",
  "infoText",
  "sectionToggle",
  "updateFailed",
] as const;

function getNonSwimmerNamespace(messages: unknown): Record<string, unknown> | undefined {
  const teams = (messages as { teams?: unknown }).teams;
  if (!teams || typeof teams !== "object") return undefined;
  const nonSwimmer = (teams as { nonSwimmer?: unknown }).nonSwimmer;
  if (!nonSwimmer || typeof nonSwimmer !== "object") return undefined;
  return nonSwimmer as Record<string, unknown>;
}

function extractIcuPlaceholders(value: unknown): Set<string> {
  if (typeof value !== "string") return new Set();
  const matches = value.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  return new Set(matches);
}

// 日本語 (ひらがな/カタカナ/CJK統合漢字) の検出。en/ko/zh/de に混入していないかの判定に使う。
// zh は漢字を使うため、この検出はひらがな/カタカナの混入検知に限定して zh の誤検出を避ける。
const HIRAGANA_KATAKANA = /[぀-ヿ]/;

describe("[V-15] teams.nonSwimmer i18n", () => {
  it.each(LOCALES)("%s: teams.nonSwimmer 名前空間が存在する", (locale) => {
    const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
    expect(ns, `${locale}.json に teams.nonSwimmer が無い`).toBeDefined();
  });

  it.each(LOCALES)("%s: 必須キーがすべて存在し、空文字ではない", (locale) => {
    const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
    expect(ns).toBeDefined();
    for (const key of REQUIRED_KEYS) {
      const value = ns?.[key];
      expect(typeof value, `${locale}.teams.nonSwimmer.${key} が文字列でない`).toBe("string");
      expect((value as string).trim().length, `${locale}.teams.nonSwimmer.${key} が空文字`).toBeGreaterThan(0);
    }
  });

  it.each(["en", "ko", "zh", "de"] as const)(
    "%s: ひらがな/カタカナが残っていない (翻訳し忘れの検出)",
    (locale) => {
      const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
      expect(ns).toBeDefined();
      for (const key of REQUIRED_KEYS) {
        const value = ns?.[key];
        expect(
          typeof value === "string" && HIRAGANA_KATAKANA.test(value),
          `${locale}.teams.nonSwimmer.${key} に日本語が残っている: "${value}"`,
        ).toBe(false);
      }
    },
  );

  it("sectionToggle は {count} プレースホルダーを持つ (全ロケール共通)", () => {
    for (const locale of LOCALES) {
      const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
      const placeholders = extractIcuPlaceholders(ns?.sectionToggle);
      expect(placeholders.has("{count}"), `${locale}.teams.nonSwimmer.sectionToggle に {count} が無い`).toBe(
        true,
      );
    }
  });

  it("ICU プレースホルダーが ja を基準に全ロケールで対称である", () => {
    const jaNs = getNonSwimmerNamespace(LOCALE_MESSAGES.ja);
    expect(jaNs).toBeDefined();

    for (const key of REQUIRED_KEYS) {
      const jaPlaceholders = extractIcuPlaceholders(jaNs?.[key]);
      for (const locale of LOCALES) {
        if (locale === "ja") continue;
        const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
        const placeholders = extractIcuPlaceholders(ns?.[key]);
        expect(
          [...placeholders].sort(),
          `${locale}.teams.nonSwimmer.${key} のプレースホルダーが ja と非対称`,
        ).toEqual([...jaPlaceholders].sort());
      }
    }
  });

  it("ja/en/ko/zh/de のキー集合が完全一致している (キーの過不足を検出)", () => {
    const jaNs = getNonSwimmerNamespace(LOCALE_MESSAGES.ja);
    expect(jaNs).toBeDefined();
    const jaKeys = Object.keys(jaNs!).sort();

    for (const locale of LOCALES) {
      if (locale === "ja") continue;
      const ns = getNonSwimmerNamespace(LOCALE_MESSAGES[locale]);
      expect(ns).toBeDefined();
      expect(Object.keys(ns!).sort(), `${locale}.teams.nonSwimmer のキー集合が ja と不一致`).toEqual(
        jaKeys,
      );
    }
  });
});
