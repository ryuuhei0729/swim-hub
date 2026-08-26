/**
 * チームメンバータブ「ベストタイム一覧」ツールチップの一括登録ラベル 新規 i18n キー網羅テスト
 *
 * Sprint Contract で合意した新規キー (`teams.membersTimeTable.bulkEntryNote`) の
 * 5言語 (ja/en/zh/ko/de) 存在・値を固定する。
 *
 * 一般的なキー構造の完全一致・翻訳漏れ(日本語リーク)検出は
 * `apps/shared/__tests__/messages-coverage.test.ts` が担う (既存の safety net)。
 * 本テストはそれとは独立に「このスプリントで追加すべき正確なキー名と値」を
 * 5言語全てで固定する、この機能専用のピン留めテストである
 * (既存の `apps/web/__tests__/i18n/messages-wa-points-compare.test.ts` と同方針)。
 *
 * Sprint Contract 検証観点:
 *   [V-BULK-I18N-01] teams.membersTimeTable.bulkEntryNote が ja/en/zh/ko/de の
 *                     5言語すべてに、Sprint Contract で合意した正確な文字列で存在する
 *   [V-BULK-I18N-02] 既存の兄弟実装 (mypage.bestTimesTable.bulkEntryNote /
 *                     teams.memberDetail.bestTimesTable.bulkEntryNote) の ja 訳文と
 *                     同一の日本語ラベルを使っていること (新規に訳を発明していないこと)
 *   [V-BULK-I18N-03] en.json / zh.json / ko.json の値に日本語 (ひらがな・カタカナ) が
 *                     含まれない
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、
 * 本テストは意図的に赤くなる (Developer 実装のガイドとして機能する)。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import zhMessages from "../../../shared/messages/zh.json";
import koMessages from "../../../shared/messages/ko.json";
import deMessages from "../../../shared/messages/de.json";

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

const KEY = "teams.membersTimeTable.bulkEntryNote";

// Sprint Contract (Web Developer への発注仕様) で合意した正確な訳文。
// 値そのものを固定する（"非空文字列であること" だけでは typo/誤訳を検出できないため）。
const EXPECTED: Record<"ja" | "en" | "zh" | "ko" | "de", string> = {
  ja: "一括登録",
  en: "Bulk entry",
  zh: "批量登记",
  ko: "일괄 등록",
  de: "Sammeleintrag",
};

const ALL_MESSAGES: Record<keyof typeof EXPECTED, Record<string, unknown>> = {
  ja: jaMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
  zh: zhMessages as unknown as Record<string, unknown>,
  ko: koMessages as unknown as Record<string, unknown>,
  de: deMessages as unknown as Record<string, unknown>,
};

describe("[V-BULK-I18N-01] teams.membersTimeTable.bulkEntryNote の5言語パリティ", () => {
  it.each(Object.entries(EXPECTED))("%s.json: %s の値が Sprint Contract 通りである", (locale, expected) => {
    const value = getValue(ALL_MESSAGES[locale as keyof typeof EXPECTED], KEY);
    expect(value, `${locale}.json に ${KEY} が存在しない、または非文字列`).toBe(expected);
  });

  it("[V-BULK-I18N-02] ja.json: bulkEntryNote は既存の兄弟実装 (mypage.bestTimesTable) の訳文と同一である", () => {
    const value = getValue(ALL_MESSAGES.ja, KEY);
    const siblingValue = getValue(ALL_MESSAGES.ja, "mypage.bestTimesTable.bulkEntryNote");
    expect(value).toBe(siblingValue);
  });

  it("[V-BULK-I18N-02] ja.json: bulkEntryNote は既存の兄弟実装 (teams.memberDetail.bestTimesTable) の訳文と同一である", () => {
    const value = getValue(ALL_MESSAGES.ja, KEY);
    const siblingValue = getValue(ALL_MESSAGES.ja, "teams.memberDetail.bestTimesTable.bulkEntryNote");
    expect(value).toBe(siblingValue);
  });

  // [V-BULK-I18N-03] 日本語 (ひらがな・カタカナ) が非日本語ロケールに混入していないこと
  it.each(["en", "zh", "ko"] as const)(
    "[V-BULK-I18N-03] %s.json の bulkEntryNote にひらがな・カタカナが含まれない",
    (locale) => {
      const value = getValue(ALL_MESSAGES[locale], KEY) as string | undefined;
      const kanaLeakRegex = /[ぁ-んァ-ヶー]/;
      expect(typeof value === "string" && kanaLeakRegex.test(value)).toBe(false);
    },
  );
});
