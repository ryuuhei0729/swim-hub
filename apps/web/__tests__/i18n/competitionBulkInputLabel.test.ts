/**
 * competition.client.bulkInputLabel — i18n パリティテスト
 *
 * 大会未紐付けレコード（一括ベストタイム入力）分岐対応で追加されたキー。
 * web (CompetitionClient.tsx) と mobile (StandaloneRecordDetailModal.tsx) が
 * 同一の shared JSON (apps/shared/messages/*.json) を編集したため、
 * 重複キーによる上書き破損が無いことを含めて検証する。
 *
 * Sprint Contract 検証観点:
 *   [i18n パリティ] ja/en/ko/zh/de の5言語全てにキーが1回ずつ存在し、
 *     値が指定通りであること
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

const MESSAGES_DIR = path.resolve(__dirname, "../../../shared/messages");

const EXPECTED: Record<string, string> = {
  ja: "一括入力",
  en: "Bulk entry",
  ko: "일괄 입력",
  zh: "批量录入",
  de: "Sammeleintrag",
};

const LOCALE_MESSAGES: Record<string, unknown> = {
  ja: jaMessages,
  en: enMessages,
  ko: koMessages,
  zh: zhMessages,
  de: deMessages,
};

describe("competition.client.bulkInputLabel — i18n パリティ", () => {
  it.each(Object.entries(EXPECTED))(
    "%s の値が指定通りである",
    (locale, expectedValue) => {
      const messages = LOCALE_MESSAGES[locale] as {
        competition?: { client?: { bulkInputLabel?: string } };
      };
      expect(messages.competition?.client?.bulkInputLabel).toBe(expectedValue);
    },
  );

  it.each(Object.keys(EXPECTED))(
    "%s.json のソースファイル上で bulkInputLabel キーが重複していない (上書き破損の検出)",
    (locale) => {
      const raw = readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf-8");
      const occurrences = (raw.match(/"bulkInputLabel"\s*:/g) ?? []).length;
      expect(occurrences).toBe(1);
    },
  );

  it("competition.client 配下の既存キー (viewDetailAriaLabel/competitionFallback/styleFallback 等) が破損していない", () => {
    for (const locale of Object.keys(EXPECTED)) {
      const messages = LOCALE_MESSAGES[locale] as {
        competition?: { client?: Record<string, string> };
      };
      const client = messages.competition?.client;
      expect(client).toBeDefined();
      expect(typeof client?.viewDetailAriaLabel).toBe("string");
      expect(client?.viewDetailAriaLabel).not.toBe("");
      expect(typeof client?.competitionFallback).toBe("string");
      expect(typeof client?.styleFallback).toBe("string");
    }
  });
});
