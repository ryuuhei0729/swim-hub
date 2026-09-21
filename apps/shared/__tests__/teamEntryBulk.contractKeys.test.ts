/**
 * チーム大会エントリー代理入力画面 (mobile) のラベル変更 Sprint Contract — i18n キー検証
 *
 * Sprint Contract (Phase A, PM承認済み) 検証観点:
 *   [V-04] `teams.mobile.entryBulk.prefillUntouchedWarning` が ja/en/zh/ko/de の
 *          5ファイルすべてから削除されていること
 *   [変更禁止] `teams.record.eventNumber` の値 (ja: "種目 {n}") が変わっていないこと
 *          (web と mobile で共有するキーのため、値を変えると web の見た目も変わる)
 *   [変更禁止] `teams.mobile.entryBulk.eventLabel` キー自体が残っていること
 *          (種目選択モーダルのシートタイトルで使用継続)
 *
 * キーの存在確認は `apps/web/__tests__/i18n/teamEntryBulkInput.i18n.test.ts` の
 * ソース走査方式 (SOURCE_REFERENCED_KEYS) と `apps/shared/__tests__/messages-coverage.test.ts`
 * の ja/en 構造一致チェックでも間接的にカバーされるが、いずれも「削除されたキーが
 * 本当にゼロ件か」を明示的には assert しない (前者は参照されなくなったキーをそもそも
 * 検証対象に含めない・後者はキー構造が両言語で揃っていれば削除済みキーも見逃す)。
 * このファイルは削除の事実そのものを直接固定する。
 *
 * 型安全な dot-access (`ja.teams.mobile.entryBulk.prefillUntouchedWarning`) は
 * キー削除後に tsc が落ちてしまうため使わず、汎用的なパス探索ヘルパーで検証する。
 */

import { describe, expect, it } from "vitest";

import jaMessages from "../messages/ja.json";
import enMessages from "../messages/en.json";
import zhMessages from "../messages/zh.json";
import koMessages from "../messages/ko.json";
import deMessages from "../messages/de.json";

const LOCALES = ["ja", "en", "zh", "ko", "de"] as const;
type Locale = (typeof LOCALES)[number];

const MESSAGES: Record<Locale, unknown> = {
  ja: jaMessages,
  en: enMessages,
  zh: zhMessages,
  ko: koMessages,
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

describe("teams.mobile.entryBulk — Sprint Contract i18n キー検証", () => {
  it.each(LOCALES)(
    "%s: prefillUntouchedWarning キーが削除されている (存在しないか、キー自体が無い)",
    (locale) => {
      const value = getByPath(MESSAGES[locale], "teams.mobile.entryBulk.prefillUntouchedWarning");
      expect(value, `${locale}.json に prefillUntouchedWarning が残っている`).toBeUndefined();
    },
  );

  it(
    "teams.record.eventNumber の値 (ja) は変更されていない (web と共有のキーのため)",
    () => {
      expect(getByPath(jaMessages, "teams.record.eventNumber")).toBe("種目 {n}");
    },
  );

  it.each(LOCALES)(
    "%s: teams.mobile.entryBulk.eventLabel キーは削除されていない (種目選択モーダルの" +
      "シートタイトルで使用継続するため)",
    (locale) => {
      const value = getByPath(MESSAGES[locale], "teams.mobile.entryBulk.eventLabel");
      expect(value, `${locale}.json から eventLabel が消えている`).toBeDefined();
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    },
  );
});
