/**
 * お知らせ本文 全文表示/省略トグル 新規 i18n キー網羅テスト
 *
 * Sprint Contract で合意した新規キー `teamsAdmin.announcementList.showMore` /
 * `teamsAdmin.announcementList.showLess` の存在を固定する。5言語の完全一致・
 * 日本語リークの一般網羅は apps/shared/__tests__/messages-coverage.test.ts に
 * 委譲するため (messages-web-mobile-parity-sprint.test.ts と同じ方針)、
 * ここでは「このスプリントで追加すべき正確なキー名」のみを固定する。
 *
 * Sprint Contract 検証観点:
 *   [V-7] ja.json / en.json に showMore / showLess キーが存在する
 *         (zh/ko/de の網羅・翻訳漏れ検出は messages-coverage.test.ts が担う)
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、
 * 本テストは意図的に赤くなる (Developer 実装のガイドとして機能する)。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";

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

const SPRINT_REQUIRED_KEYS = [
  "teamsAdmin.announcementList.showMore",
  "teamsAdmin.announcementList.showLess",
];

describe("お知らせ本文展開トグル i18n キー", () => {
  it.each(SPRINT_REQUIRED_KEYS)("[V-7] ja.json に %s が存在する", (key) => {
    expect(typeof getValue(jaMessages, key)).toBe("string");
  });

  it.each(SPRINT_REQUIRED_KEYS)("[V-7] en.json に %s が存在する", (key) => {
    expect(typeof getValue(enMessages, key)).toBe("string");
  });
});
