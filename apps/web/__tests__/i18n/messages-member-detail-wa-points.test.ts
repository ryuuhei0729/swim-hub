/**
 * メンバー詳細モーダル「WAポイント表示」機能 新規 i18n キー網羅テスト
 *
 * Sprint Contract で合意した新規キー群 (`teams.memberDetail.bestTimesTable.*`) の
 * 5言語 (ja/en/de/ko/zh) 存在を固定する。
 *
 * 一般的なキー構造の完全一致・翻訳漏れ(日本語リーク)検出は
 * `apps/shared/__tests__/messages-coverage.test.ts` が担う (既存の safety net)。
 * 本テストはそれとは独立に「このスプリントで追加すべき正確なキー名」を
 * 5言語全てで固定する、この機能専用のピン留めテストである
 * (既存の `apps/web/__tests__/i18n/messages-wa-points-compare.test.ts` と同方針)。
 *
 * Sprint Contract 検証観点:
 *   [V-I18N-01] teams.memberDetail.bestTimesTable 配下の新規キーが ja/en/de/ko/zh の
 *               5言語すべてに文字列として存在する
 *   [V-I18N-02] 訳文はmypage版 (`mypage.bestTimesTable.*`) の実際の訳文を流用していること
 *               (新規に訳を発明していないこと)。ja のみ検証 (原文一致)
 *   [V-I18N-03] en 以外の非日本語ロケール (de/ko/zh) で ja からのコピペ (未翻訳) がないこと
 *               (Reviewer 指摘パターン: 「5言語中どれかが違えば良い」ではなく個別に検証する)
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、
 * 本テストは意図的に赤くなる (Developer 実装のガイドとして機能する)。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import deMessages from "@apps/shared/messages/de.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";

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

// Sprint Contract で合意した必須キー (Interface Contract の一部)。
// Developer はこの名前空間・キー名で実装すること (変更する場合はQAに要相談)。
const SPRINT_REQUIRED_KEYS = [
  "teams.memberDetail.bestTimesTable.waPointsToggle", // 「WAポイント表示」ボタン文言
  "teams.memberDetail.bestTimesTable.legend.relayingExcludedFromWaPoints", // WAモード時の凡例文言
] as const;

const ALL_MESSAGES: Record<"ja" | "en" | "de" | "ko" | "zh", Record<string, unknown>> = {
  ja: jaMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
  de: deMessages as unknown as Record<string, unknown>,
  ko: koMessages as unknown as Record<string, unknown>,
  zh: zhMessages as unknown as Record<string, unknown>,
};

const NON_JA_LOCALES = ["en", "de", "ko", "zh"] as const;

describe("[V-I18N-01] teams.memberDetail.bestTimesTable の新規WAポイントキー (5言語パリティ)", () => {
  it.each(
    SPRINT_REQUIRED_KEYS.flatMap((key) =>
      (["ja", "en", "de", "ko", "zh"] as const).map((locale) => [key, locale] as const),
    ),
  )("%s は %s.json に非空文字列で存在する", (key, locale) => {
    const value = getValue(ALL_MESSAGES[locale], key);
    expect(typeof value, `${locale}.json: ${key} is not a string`).toBe("string");
    expect(
      (value as string).trim().length,
      `${locale}.json: ${key} is an empty string`,
    ).toBeGreaterThan(0);
  });

  // [V-I18N-02] mypage版の訳文をそのまま流用していること (ja原文の一致確認)
  it("[V-I18N-02] ja.json: waPointsToggle は mypage.bestTimesTable.waPointsToggle の訳文と同一 (流用確認)", () => {
    const memberDetailVal = getValue(
      jaMessages as unknown as Record<string, unknown>,
      "teams.memberDetail.bestTimesTable.waPointsToggle",
    );
    const mypageVal = getValue(
      jaMessages as unknown as Record<string, unknown>,
      "mypage.bestTimesTable.waPointsToggle",
    );
    expect(memberDetailVal).toBe(mypageVal);
  });

  it("[V-I18N-02] ja.json: legend.relayingExcludedFromWaPoints は mypage版の訳文と同一 (流用確認)", () => {
    const memberDetailVal = getValue(
      jaMessages as unknown as Record<string, unknown>,
      "teams.memberDetail.bestTimesTable.legend.relayingExcludedFromWaPoints",
    );
    const mypageVal = getValue(
      jaMessages as unknown as Record<string, unknown>,
      "mypage.bestTimesTable.legend.relayingExcludedFromWaPoints",
    );
    expect(memberDetailVal).toBe(mypageVal);
  });

  // [V-I18N-03] 非ja言語それぞれが ja のコピペのまま残っていないこと (個別検証、トートロジー回避)
  it.each(SPRINT_REQUIRED_KEYS.flatMap((key) => NON_JA_LOCALES.map((locale) => [key, locale] as const)))(
    "%s: %s.json の値は ja.json の値のコピペのまま (未翻訳) になっていない",
    (key, locale) => {
      const jaVal = getValue(ALL_MESSAGES.ja, key) as string;
      const localeVal = getValue(ALL_MESSAGES[locale], key) as string;
      expect(
        localeVal,
        `${locale}.json の ${key} が ja.json の値のコピペのまま: "${jaVal}"`,
      ).not.toBe(jaVal);
    },
  );

  it("en.json の値に日本語文字が含まれない (翻訳漏れ検出、この機能分のみのローカルチェック)", () => {
    const jaLeakRegex = /[ぁ-んァ-ヶー一-龯]/;
    for (const key of SPRINT_REQUIRED_KEYS) {
      const value = getValue(ALL_MESSAGES.en, key);
      expect(typeof value === "string" && jaLeakRegex.test(value)).toBe(false);
    }
  });
});
