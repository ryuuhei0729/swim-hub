/**
 * competition.records.validation.relaySplitBeforeLegStart — i18n パリティテスト
 * (Sprint Contract D3: リレー split の事前バリデーションメッセージ)
 *
 * Sprint Contract (Success Criteria S7):
 *   D3 (書き込む前に弾く事前バリデーション) が発報する検証メッセージのキーが
 *   ja/en/de/ko/zh の 5 言語すべてに存在すること。
 *
 * i18n キーの受け渡しは過去に何度も継ぎ目で落ちている
 * (feedback_swimhub_i18n_key_handoff_gap: messages JSON を Web Dev 単独所有にすると
 * App Dev 申請分が欠落。tsc/lint/build 全 green のまま通る)。web と mobile の両画面が
 * 同じキー `competition.records.validation.relaySplitBeforeLegStart` を
 * `tRecords(...)` / `t("competition.records.validation.relaySplitBeforeLegStart", ...)` で
 * 直接参照するため、5 言語すべてに存在しないと「キー名がそのまま画面に表示される」
 * 退行になる。
 *
 * このテストは apps/shared/messages/*.json の実データを読み込み、モックを一切使わずに
 * 検証する (relayLegShort.i18n.test.ts と同じ方針)。
 */

import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

const LOCALES = ["ja", "en", "ko", "zh", "de"] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_MESSAGES: Record<Locale, unknown> = {
  ja: jaMessages,
  en: enMessages,
  ko: koMessages,
  zh: zhMessages,
  de: deMessages,
};

function getByPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * next-intl / react-i18next 互換の簡易補間: 単一波括弧 `{distance}` `{leg}` を
 * 実際の値へ置換する。本体を挟まず素朴な文字列置換にとどめることで、
 * 「本番の翻訳文字列そのもの」を検証対象にする。
 */
function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));
}

const KEY = "competition.records.validation.relaySplitBeforeLegStart";

describe("competition.records.validation.relaySplitBeforeLegStart — D3 事前バリデーション i18n パリティ (S7)", () => {
  it.each(LOCALES)("%s: relaySplitBeforeLegStart が存在し、空文字ではない", (locale) => {
    const value = getByPath(LOCALE_MESSAGES[locale], KEY);
    expect(value, `${locale}.json に ${KEY} が存在しない`).toBeDefined();
    expect(typeof value, `${locale}.json の ${KEY} が文字列でない`).toBe("string");
    expect((value as string).length, `${locale}.json の ${KEY} が空文字`).toBeGreaterThan(0);
  });

  it.each(LOCALES)(
    "%s: relaySplitBeforeLegStart は next-intl 互換の {distance} と {leg} を単一波括弧で含む",
    (locale) => {
      const value = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      expect(value, `${locale}.json の ${KEY} に {distance} プレースホルダが無い`).toMatch(/\{distance\}/);
      expect(value, `${locale}.json の ${KEY} に {leg} プレースホルダが無い`).toMatch(/\{leg\}/);
      // 二重波括弧 (ICU/Handlebars 形式の誤混入) が無いことも確認する
      expect(value, `${locale}.json の ${KEY} が二重波括弧を含んでいる (next-intl 非互換)`).not.toMatch(
        /\{\{(distance|leg)\}\}/,
      );
    },
  );

  it.each(LOCALES)(
    "%s: distance/leg を展開すると具体的な数値を含む文字列になる (プレースホルダの埋め込み漏れが無い)",
    (locale) => {
      const template = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      const expanded = interpolate(template, { distance: 650, leg: 4 });
      expect(expanded, `${locale}.json: 展開結果に distance(650) が含まれない`).toContain("650");
      expect(expanded, `${locale}.json: 展開結果に leg(4) が含まれない`).toContain("4");
      // 展開後もプレースホルダの残骸 ({distance} や {leg}) が残っていないこと
      expect(expanded).not.toMatch(/\{distance\}|\{leg\}/);
    },
  );

  it("relaySplitBeforeLegStart は日本語(ja)を基準に他4言語も翻訳されている (コピペ未翻訳の検出)", () => {
    const jaValue = getByPath(LOCALE_MESSAGES.ja, KEY) as string;
    for (const locale of LOCALES) {
      if (locale === "ja") continue;
      const value = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      expect(value, `${locale}.json の ${KEY} が ja.json のコピペのまま: "${jaValue}"`).not.toBe(jaValue);
    }
  });

  it(
    "既存の validation 名前空間 (relayFullTeam / relayAllTimes / cumulativeTimeInverted) と" +
      "同じ階層に配置されている (Web/mobile 両画面が同じ完全パスで参照できることの確認)",
    () => {
      for (const locale of LOCALES) {
        const validationNode = getByPath(LOCALE_MESSAGES[locale], "competition.records.validation") as
          | Record<string, unknown>
          | undefined;
        expect(validationNode, `${locale}.json に competition.records.validation が無い`).toBeDefined();
        expect(validationNode).toHaveProperty("relayFullTeam");
        expect(validationNode).toHaveProperty("relayAllTimes");
        expect(validationNode).toHaveProperty("cumulativeTimeInverted");
        expect(validationNode).toHaveProperty("relaySplitBeforeLegStart");
      }
    },
  );
});
