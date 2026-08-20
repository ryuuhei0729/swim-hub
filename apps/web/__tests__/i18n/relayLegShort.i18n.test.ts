/**
 * competition.records.relayLegShort — リレー RT ラベル用の短縮キー i18n パリティテスト
 *
 * Sprint Contract (続き・Reviewer 指摘対応):
 *   RecordClient.tsx の RT ラベルはこれまで `mr.relayLegLabel?.split(" ")[0]` で
 *   `relayLegLabel` (フルラベル。例: "第{num}泳者 ({style})") を空白区切りして
 *   先頭要素を接頭辞として使っていた。この方式は en/de で破損する:
 *     - en: "Leg {num} ({style})".split(" ")[0] === "Leg" (num が消える → 全レグ同一)
 *     - de: "{num}. Schwimmer ({style})".split(" ")[0] === "{num}." (Schwimmer が消える)
 *   修正は `split` を撤去し、専用の短縮キー `relayLegShort` (num のみ埋め込み、
 *   style は含まない) を新設して `tRecords("relayLegShort", { num })` を直接呼ぶ形にした。
 *
 * このテストの目的:
 *   既存の `apps/web/__tests__/records/relayLegLabelRestore.test.tsx` は next-intl の
 *   useTranslations をモックしており、`relayLegLabel` キーだけ固定フォーマット
 *   (`LEG{num} {style}`) を返す。このモックは実際の en/de 訳文の構造 (num の位置、
 *   区切り文字の有無) を反映していないため、`split(" ")[0]` のような実装が en/de で
 *   壊れていても検出できない (構造的な検出漏れ)。
 *
 *   よって本テストは `apps/shared/messages/*.json` の実データを読み込み、モックを
 *   一切使わずに検証する。
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
 * next-intl 互換の簡易補間: 単一波括弧 `{num}` を実際の数値へ置換する。
 * next-intl 本体を挟まず素朴な文字列置換にとどめることで、
 * 「本番の翻訳文字列そのもの」を検証対象にする (テスト側の実装再現を避ける)。
 */
function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}

const KEY = "competition.records.relayLegShort";

describe("competition.records.relayLegShort — リレー RT ラベル短縮キー i18n パリティ (実データ検証)", () => {
  it.each(LOCALES)(
    "%s: relayLegShort が存在し、空文字ではない",
    (locale) => {
      const value = getByPath(LOCALE_MESSAGES[locale], KEY);
      expect(value, `${locale}.json に ${KEY} が存在しない`).toBeDefined();
      expect(typeof value, `${locale}.json の ${KEY} が文字列でない`).toBe("string");
      expect((value as string).length, `${locale}.json の ${KEY} が空文字`).toBeGreaterThan(0);
    },
  );

  it.each(LOCALES)(
    "%s: relayLegShort は next-intl 互換の {num} プレースホルダを単一波括弧で含む",
    (locale) => {
      const value = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      expect(value, `${locale}.json の ${KEY} に {num} プレースホルダが無い`).toMatch(/\{num\}/);
      // 二重波括弧 (ICU/Handlebars 形式の誤混入) が無いことも確認する
      expect(value, `${locale}.json の ${KEY} が二重波括弧を含んでいる (next-intl 非互換)`).not.toMatch(
        /\{\{num\}\}/,
      );
    },
  );

  it.each(LOCALES)(
    "%s: num=1..4 を展開した RT ラベルが4件ともレグごとに異なる文字列になる " +
      "(人間の意図: en の『Leg {num} (...) を split(\" \")[0] すると全レグ Leg で" +
      "区別が消える』型の退行を機械的に検出する。num の埋め込みが欠落・固定化されると" +
      "このテストが red になる)",
    (locale) => {
      const template = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      const legLabels = [1, 2, 3, 4].map((num) => interpolate(template, { num }));

      expect(new Set(legLabels).size, `${locale}.json: 展開結果が全レグで同一になっている: ${JSON.stringify(legLabels)}`).toBe(
        4,
      );
    },
  );

  it.each(LOCALES)(
    "%s: relayLegShort は relayLegLabel (フルラベル) と異なる文字列である " +
      "(人間の意図: 短縮キーがフルラベルのコピペのまま追加されていないこと。" +
      "en/de は特にコピペだと style 付きのまま長くなり RT ラベルの意図と食い違う)",
    (locale) => {
      const shortTemplate = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      const fullTemplate = getByPath(
        LOCALE_MESSAGES[locale],
        "competition.records.relayLegLabel",
      ) as string;
      expect(shortTemplate).not.toBe(fullTemplate);
    },
  );

  it("relayLegShort は日本語(ja)を基準に他4言語も翻訳されている (コピペ未翻訳の検出)", () => {
    const jaValue = getByPath(LOCALE_MESSAGES.ja, KEY) as string;
    for (const locale of LOCALES) {
      if (locale === "ja") continue;
      const value = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      expect(value, `${locale}.json の ${KEY} が ja.json のコピペのまま: "${jaValue}"`).not.toBe(
        jaValue,
      );
    }
  });

  /**
   * 不変条件 (Reviewer 指摘・後続スプリント):
   *   relayLegLabel (フルラベル) は現在5言語すべてで `relayLegShort + " ({style})"` の
   *   形をしている。この一致を強制するテストが無いと、将来どちらか一方だけ文言変更
   *   された際に静かに乖離する (例: relayLegLabel だけ語順を変える、relayLegShort だけ
   *   短縮表現を変える等)。
   *
   *   人間の意図: relayLegShort は relayLegLabel から style 部分 (" ({style})") を
   *   取り除いた接頭辞であるべき、という設計上の関係を固定する。
   */
  it.each(LOCALES)(
    "%s: relayLegLabel は relayLegShort + \" ({style})\" と一致する (フルラベル/短縮ラベルの構造的な不変条件)",
    (locale) => {
      const shortTemplate = getByPath(LOCALE_MESSAGES[locale], KEY) as string;
      const fullTemplate = getByPath(
        LOCALE_MESSAGES[locale],
        "competition.records.relayLegLabel",
      ) as string;
      expect(
        fullTemplate,
        `${locale}.json: relayLegLabel ("${fullTemplate}") が relayLegShort + " ({style})" ("${shortTemplate} ({style})") と一致しない`,
      ).toBe(`${shortTemplate} ({style})`);
    },
  );
});
