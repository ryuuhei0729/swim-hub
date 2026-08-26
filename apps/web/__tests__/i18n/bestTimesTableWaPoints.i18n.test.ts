/**
 * マイページ ベストタイム表「WAポイント」トグル機能 新規 i18n キー網羅テスト
 *
 * Sprint Contract で合意した新規キーの存在を固定する
 * (apps/web/__tests__/i18n/messages-web-mobile-parity-sprint.test.ts と同方針)。
 * キー集合の ja/en/zh/ko/de 完全一致・ICUプレースホルダー対称性等の網羅チェックは
 * apps/shared/__tests__/messages-coverage.test.ts が動的に全キーを対象にしているため、
 * ここでは重複させず「本スプリントで追加すべき正確なキー名」のみを固定する。
 *
 * Sprint Contract 検証観点:
 *   [V-I18N-01] mypage.bestTimesTable.waPointsToggle (トグルボタンのラベル。
 *               ON/OFF 両状態で同一テキストを使い、状態は aria-pressed で表現する
 *               設計のため、ON用/OFF用の2キーには分けない)
 *   [V-I18N-02] mypage.bestTimesTable.legend.relayingExcludedFromWaPoints
 *               (WAポイントモードの凡例。D4: 「R: 引き継ぎあり」は誤解を招くため、
 *               「引き継ぎタイムはWAポイント対象外」であることが分かる文言に差し替える)
 *   [V-I18N-03] 上記キーが ja/en/zh/ko/de の5言語全てに存在し、空文字でない
 *   [V-I18N-04] 新キーの値が既存キー (legend.relaying) の値と完全一致していない
 *               (コピペのみで意味を変えていない誤実装の検出)
 *   [V-I18N-Regression] 既存キー (legend.relaying / legend.longCourse / includeRelay 等)
 *               が本スプリントで誤って削除・変更されていないこと
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、本テストは意図的に
 * 赤くなる (Developer 実装のガイドとして機能する)。
 */

import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import zhMessages from "@apps/shared/messages/zh.json";
import koMessages from "@apps/shared/messages/ko.json";
import deMessages from "@apps/shared/messages/de.json";

type Locale = "ja" | "en" | "zh" | "ko" | "de";

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  ja: jaMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
  zh: zhMessages as unknown as Record<string, unknown>,
  ko: koMessages as unknown as Record<string, unknown>,
  de: deMessages as unknown as Record<string, unknown>,
};

const LOCALES: Locale[] = ["ja", "en", "zh", "ko", "de"];

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

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// -----------------------------------------------------------------------
// [V-I18N-01][V-I18N-02] 本スプリントの新規キー一覧
// -----------------------------------------------------------------------
const SPRINT_REQUIRED_KEYS = [
  "mypage.bestTimesTable.waPointsToggle",
  "mypage.bestTimesTable.legend.relayingExcludedFromWaPoints",
] as const;

describe("[V-I18N] BestTimesTable WAポイントトグル 新規キーの5言語パリティ", () => {
  for (const key of SPRINT_REQUIRED_KEYS) {
    for (const locale of LOCALES) {
      it(`${locale}.json に "${key}" が存在し、空文字でない`, () => {
        const keys = flattenKeys(MESSAGES[locale]);
        expect(keys, `${locale}.json に "${key}" が存在しません (WAポイントトグル未実装)`).toContain(
          key,
        );

        const value = getNestedValue(MESSAGES[locale], key);
        expect(typeof value, `${locale}.json の "${key}" が文字列でない`).toBe("string");
        expect((value as string).trim().length, `${locale}.json の "${key}" が空文字`).toBeGreaterThan(
          0,
        );
      });
    }
  }

  // [V-I18N-04] コピペのみで意味を変えていない誤実装の検出
  for (const locale of LOCALES) {
    it(`${locale}.json: legend.relayingExcludedFromWaPoints は既存の legend.relaying と完全一致しない (コピペ検出)`, () => {
      const newValue = getNestedValue(
        MESSAGES[locale],
        "mypage.bestTimesTable.legend.relayingExcludedFromWaPoints",
      );
      const existingValue = getNestedValue(MESSAGES[locale], "mypage.bestTimesTable.legend.relaying");
      expect(newValue).not.toBe(existingValue);
    });
  }
});

// -----------------------------------------------------------------------
// [V-I18N-Regression] 既存キーが本スプリントで誤って削除・変更されていないこと
// -----------------------------------------------------------------------
describe("[V-I18N-Regression] 既存 mypage.bestTimesTable.* キーの温存確認", () => {
  const EXISTING_JA_VALUES: Record<string, string> = {
    "mypage.bestTimesTable.legend.longCourse": "L: 長水路",
    "mypage.bestTimesTable.legend.relaying": "R: 引き継ぎあり",
    "mypage.bestTimesTable.includeRelay": "引き継ぎタイムも含めて表示",
    "mypage.bestTimesTable.shortCourse": "短水路",
    "mypage.bestTimesTable.longCourse": "長水路",
    "mypage.bestTimesTable.distanceHeader": "距離",
  };

  for (const [key, expectedJaValue] of Object.entries(EXISTING_JA_VALUES)) {
    it(`ja.json の既存キー "${key}" の値が変更されていない ("${expectedJaValue}")`, () => {
      expect(getNestedValue(MESSAGES.ja, key)).toBe(expectedJaValue);
    });
  }

  it("全ロケールに既存キー legend.longCourse / legend.relaying が維持されている", () => {
    for (const locale of LOCALES) {
      const keys = flattenKeys(MESSAGES[locale]);
      expect(keys, `${locale}.json`).toContain("mypage.bestTimesTable.legend.longCourse");
      expect(keys, `${locale}.json`).toContain("mypage.bestTimesTable.legend.relaying");
    }
  });
});
