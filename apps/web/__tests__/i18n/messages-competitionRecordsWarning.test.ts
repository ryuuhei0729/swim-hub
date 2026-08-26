/**
 * 大会削除 API に records 削除を連動させるスプリント (delete_competition_with_records)
 * で追加された `dashboard.deleteConfirm.competitionRecordsWarning` の5言語パリティテスト。
 *
 * 「この大会の記録 N 件も削除されます」という件数付き警告を web (DayDetailModal /
 * CompetitionDetailModal) と mobile (useDayDetailHandlers) の両方が
 * `t("dashboard.deleteConfirm.competitionRecordsWarning", { count })` で参照する。
 *
 * このリポジトリでは i18n キーの継ぎ目 (ある言語だけ追加漏れ) が繰り返し発生しており、
 * tsc/lint/build が全 green のまま欠落が本番まで通過した実績がある (next-intl / react-i18next
 * はキーが無いとキー文字列をそのまま出す/フォールバックするため型エラーにならない)。
 * そのため専用の存在確認テストを追加する。
 *
 * [V-I18N-01] 5言語すべてにキーが存在し、空文字列でない
 * [V-I18N-02] 5言語すべてに `{count}` プレースホルダーが含まれる (補間漏れ検出。
 *             件数を出さずに固定文言にすり替えると検出できなくなる)
 * [V-I18N-03] ja 以外に日本語がハードコードされていない (コピペ忘れ検出)
 * [V-I18N-04] 5言語の翻訳文がすべて異なる (ja=en等の取り違え防止)
 */

import { describe, expect, test } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import koMessages from "../../../shared/messages/ko.json";
import zhMessages from "../../../shared/messages/zh.json";
import deMessages from "../../../shared/messages/de.json";

const KEY_PATH = "dashboard.deleteConfirm.competitionRecordsWarning";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// en は ひらがな/カタカナ/漢字を全て排除すべき。
// zh/ko は漢字(CJK統合漢字)を正当に使うため、ひらがな・カタカナのみを日本語ハードコードとして検出する
const JA_REGEX = /[ぁ-んァ-ヶー一-龯]/;
const JA_KANA_ONLY_REGEX = /[ぁ-んァ-ヶー]/;

function containsJapanese(value: string, locale: string): boolean {
  const regex = locale === "en" ? JA_REGEX : JA_KANA_ONLY_REGEX;
  return regex.test(value);
}

const ALL_LOCALES = [
  { name: "ja", messages: jaMessages as unknown as Record<string, unknown> },
  { name: "en", messages: enMessages as unknown as Record<string, unknown> },
  { name: "ko", messages: koMessages as unknown as Record<string, unknown> },
  { name: "zh", messages: zhMessages as unknown as Record<string, unknown> },
  { name: "de", messages: deMessages as unknown as Record<string, unknown> },
];

describe("[V-I18N] dashboard.deleteConfirm.competitionRecordsWarning の5言語パリティ", () => {
  test.each(ALL_LOCALES.map((l) => [l.name, l.messages] as const))(
    `%s.json に ${KEY_PATH} が存在し、空文字列でない`,
    (name, messages) => {
      const value = getNestedValue(messages, KEY_PATH);
      expect(value, `${name}.json の "${KEY_PATH}" が未定義または空です`).toBeTruthy();
      expect(typeof value).toBe("string");
    },
  );

  test.each(ALL_LOCALES.map((l) => [l.name, l.messages] as const))(
    `%s.json の ${KEY_PATH} に {count} プレースホルダーが含まれる (補間漏れ検出)`,
    (name, messages) => {
      const value = getNestedValue(messages, KEY_PATH) as string;
      expect(
        value.includes("{count}"),
        `${name}.json の "${KEY_PATH}" に {count} プレースホルダーが含まれていません: "${value}"`,
      ).toBe(true);
    },
  );

  test.each(
    ALL_LOCALES.filter((l) => l.name !== "ja").map((l) => [l.name, l.messages] as const),
  )(`%s.json の ${KEY_PATH} に日本語がハードコードされていない (翻訳漏れ検出)`, (name, messages) => {
    const value = getNestedValue(messages, KEY_PATH) as string;
    expect(
      containsJapanese(value, name),
      `${name}.json の "${KEY_PATH}" に日本語文字が含まれています: "${value}"`,
    ).toBe(false);
  });

  test("5言語の翻訳文がすべて異なる (コピペ忘れ検出、ja=en 等の取り違え防止)", () => {
    const values = ALL_LOCALES.map((l) => getNestedValue(l.messages, KEY_PATH) as string);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size, `翻訳文が重複しています: ${JSON.stringify(values)}`).toBe(
      ALL_LOCALES.length,
    );
  });
});
