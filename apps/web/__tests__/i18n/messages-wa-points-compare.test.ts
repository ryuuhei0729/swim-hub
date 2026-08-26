/**
 * 「WAポイントで比較」機能 新規 i18n キー網羅テスト
 *
 * Sprint Contract で合意した新規キー群 (`teams.waPointsCompare.*`) の
 * 5言語 (ja/en/de/ko/zh) 存在を固定する。
 *
 * 一般的なキー構造の完全一致・翻訳漏れ(日本語リーク)検出は
 * `apps/shared/__tests__/messages-coverage.test.ts` が担う (既存の safety net)。
 * 本テストはそれとは独立に「このスプリントで追加すべき正確なキー名」を
 * 5言語全てで固定する、この機能専用のピン留めテストである。
 *
 * Sprint Contract 検証観点:
 *   [V-13] teams.waPointsCompare 配下の必須キーが ja/en/de/ko/zh の
 *          5言語すべてに文字列として存在する
 *
 * NOTE: 本スプリント未実装時点ではこれらのキーは存在しないため、
 * 本テストは意図的に赤くなる (Developer 実装のガイドとして機能する)。
 * キー名自体は Web Developer が実装時に変更してよいが、変更した場合は
 * このテストと Sprint Contract のインターフェース契約を合わせて更新すること
 * (QA に通知すること)。
 */

import { describe, it, expect } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import deMessages from "../../../shared/messages/de.json";
import koMessages from "../../../shared/messages/ko.json";
import zhMessages from "../../../shared/messages/zh.json";

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
  "teams.waPointsCompare.buttonLabel", // 「WAポイントで比較」ボタン文言
  "teams.waPointsCompare.infoAriaLabel", // info マークの aria-label
  "teams.waPointsCompare.infoTooltip", // hover で表示する説明文 (WAポイントとは何か)
  "teams.waPointsCompare.modalTitle", // モーダルのタイトル
  "teams.waPointsCompare.rankLabel", // ランキング表の「順位」列見出し
  "teams.waPointsCompare.pointsLabel", // 「WAポイント」列見出し
  "teams.waPointsCompare.styleLabel", // 「種目」列見出し
  "teams.waPointsCompare.courseShort", // SC (短水路) 表記
  "teams.waPointsCompare.courseLong", // LC (長水路) 表記
  "teams.waPointsCompare.empty", // 対象記録が1件も無いチームの空状態
];

const LOCALES: Array<{ name: string; messages: Record<string, unknown> }> = [
  { name: "ja", messages: jaMessages },
  { name: "en", messages: enMessages },
  { name: "de", messages: deMessages },
  { name: "ko", messages: koMessages },
  { name: "zh", messages: zhMessages },
];

describe("[V-13] WAポイントで比較 機能の i18n キー (5言語パリティ)", () => {
  for (const { name, messages } of LOCALES) {
    it.each(SPRINT_REQUIRED_KEYS)(`[V-13] ${name}.json に %s が文字列として存在する`, (key) => {
      const value = getValue(messages, key);
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    });
  }

  it("[V-13] en.json の値に日本語文字が含まれない (翻訳漏れ検出、この機能分のみのローカルチェック)", () => {
    const jaLeakRegex = /[ぁ-んァ-ヶー一-龯]/;
    for (const key of SPRINT_REQUIRED_KEYS) {
      const value = getValue(enMessages, key);
      expect(typeof value === "string" && jaLeakRegex.test(value)).toBe(false);
    }
  });
});
