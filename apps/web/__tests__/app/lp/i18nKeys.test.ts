/**
 * LP v4.2 — 翻訳キー完全性テスト
 *
 * Sprint Contract 検証観点:
 *   [V-08] 5言語（ja/en/zh/ko/de）すべてに lp.v42.* キーが存在する
 *   [V-08] 各言語でキーセットが一致している（欠損・余剰なし）
 *   [V-08] 空文字列のキーが存在しないこと
 *   [V-09] ja/en/zh/ko/de の既存の lp.* キーが欠損していないこと（リグレッション防止）
 *
 * 検証手段: [unit]
 *
 * Note:
 *   新規 LP v4.2 用のキーは `lp.v42` 名前空間に追加する想定。
 *   既存の `lp.*` キーは lp.hero / lp.features / lp.pricing / lp.cta / lp.family /
 *   lp.footer / lp.deviceMockup を含む。これらはリグレッションとして保護する。
 *
 *   Developer への要求:
 *     `apps/shared/messages/{ja,en,zh,ko,de}.json` に `lp.v42` 名前空間を追加し、
 *     以下のキーを5言語同時に実装すること:
 *
 *     lp.v42:
 *       nav.practice / nav.competition / nav.proxy / nav.pricing
 *       hero.ghostText          // "SWIMHUB" ゴーストタイポ文字列
 *       hero.h1Line1 / h1Line2 / h1Line3
 *       hero.lead / hero.badge
 *       hero.cta.signup / hero.cta.login
 *       hero.store.appStore / hero.store.googlePlay / hero.store.comingSoon
 *       hero.deviceCaption
 *       marquee.text            // マーキー反復テキスト
 *       features.{f1,f2,f3}.label / title / desc
 *       features.{f1,f2,f3}.items: string[]  // 3項目
 *       scanner.label / h2 / desc1 / desc2 / cta
 *       pricing.label / h2 / lead / detailLink
 *       pricing.free.name / price / note / items: string[] / cta
 *       pricing.premium.name / price / badge / annualNote / items: string[] / cta
 *       services.label / h2 / lead
 *       services.timer.name / tagline / desc / cta
 *       services.scanner.name / tagline / desc / cta
 *       finalCta.label / h2 / desc
 *       footer.tagline / copyright / slogan
 *       stopwatch.ariaLabel
 *       lapBar.ariaLabel
 */

import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const MESSAGES_DIR = path.resolve(
  __dirname,
  "../../../../shared/messages"
);
const LOCALES = ["ja", "en", "zh", "ko", "de"] as const;

// LP v4.2 で追加するキーのリスト（フラット化した dot-notation）
// Developer が実装する際の参照にもなる
const REQUIRED_LP_V42_KEYS = [
  "lp.v42.nav.practice",
  "lp.v42.nav.competition",
  "lp.v42.nav.proxy",
  "lp.v42.nav.pricing",
  "lp.v42.hero.ghostText",
  "lp.v42.hero.h1Line1",
  "lp.v42.hero.h1Line2",
  "lp.v42.hero.h1Line3",
  "lp.v42.hero.lead",
  "lp.v42.hero.badge",
  "lp.v42.hero.cta.signup",
  "lp.v42.hero.cta.login",
  "lp.v42.hero.store.appStore",
  "lp.v42.hero.store.googlePlay",
  "lp.v42.hero.store.comingSoon",
  "lp.v42.hero.deviceCaption",
  "lp.v42.marquee.text",
  "lp.v42.features.f1.label",
  "lp.v42.features.f1.title",
  "lp.v42.features.f1.desc",
  "lp.v42.features.f2.label",
  "lp.v42.features.f2.title",
  "lp.v42.features.f2.desc",
  "lp.v42.features.f3.label",
  "lp.v42.features.f3.title",
  "lp.v42.features.f3.desc",
  "lp.v42.scanner.label",
  "lp.v42.scanner.h2",
  "lp.v42.scanner.desc1",
  "lp.v42.scanner.desc2",
  "lp.v42.scanner.cta",
  "lp.v42.pricing.label",
  "lp.v42.pricing.h2",
  "lp.v42.pricing.lead",
  "lp.v42.pricing.detailLink",
  "lp.v42.pricing.free.name",
  "lp.v42.pricing.free.price",
  "lp.v42.pricing.free.note",
  "lp.v42.pricing.free.cta",
  "lp.v42.pricing.premium.name",
  "lp.v42.pricing.premium.price",
  "lp.v42.pricing.premium.badge",
  "lp.v42.pricing.premium.annualNote",
  "lp.v42.pricing.premium.cta",
  "lp.v42.services.label",
  "lp.v42.services.h2",
  "lp.v42.services.lead",
  "lp.v42.services.timer.name",
  "lp.v42.services.timer.tagline",
  "lp.v42.services.timer.desc",
  "lp.v42.services.timer.cta",
  "lp.v42.services.scanner.name",
  "lp.v42.services.scanner.tagline",
  "lp.v42.services.scanner.desc",
  "lp.v42.services.scanner.cta",
  "lp.v42.finalCta.label",
  "lp.v42.finalCta.h2",
  "lp.v42.finalCta.desc",
  "lp.v42.footer.tagline",
  "lp.v42.footer.copyright",
  "lp.v42.footer.slogan",
  "lp.v42.stopwatch.ariaLabel",
  "lp.v42.lapBar.ariaLabel",
] as const;

// 既存 LP キーのリグレッション保護（lp.hero.badge など、削除してはいけないもの）
const EXISTING_LP_KEYS_TO_PROTECT = [
  "lp.hero.badge",
  "lp.hero.title1",
  "lp.hero.title2",
  "lp.hero.title3",
  "lp.hero.description",
  "lp.features.feature1Title",
  "lp.features.feature2Title",
  "lp.features.feature3Title",
  "lp.features.scannerTitle",
  "lp.pricing.title",
  "lp.cta.title",
  "lp.family.title",
  "lp.footer.tagline",
] as const;

/**
 * dot-notation で JSON オブジェクトからネストされた値を取得する。
 * 存在しない場合は undefined を返す。
 */
function getNestedValue(
  obj: Record<string, unknown>,
  dotKey: string
): unknown {
  return dotKey.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function loadMessages(locale: string): Record<string, unknown> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

describe("LP v4.2 翻訳キー完全性チェック", () => {
  describe("新規 lp.v42.* キーが5言語すべてに存在する", () => {
    for (const locale of LOCALES) {
      it(`[${locale}] 必須キーがすべて存在する`, () => {
        const messages = loadMessages(locale);
        const missing: string[] = [];
        for (const key of REQUIRED_LP_V42_KEYS) {
          const value = getNestedValue(messages, key);
          if (value === undefined || value === null) {
            missing.push(key);
          }
        }
        expect(missing, `[${locale}] 欠損キー: ${missing.join(", ")}`).toHaveLength(0);
      });
    }
  });

  describe("新規 lp.v42.* キーに空文字列が存在しない", () => {
    for (const locale of LOCALES) {
      it(`[${locale}] 空文字列キーなし`, () => {
        const messages = loadMessages(locale);
        const emptyKeys: string[] = [];
        for (const key of REQUIRED_LP_V42_KEYS) {
          const value = getNestedValue(messages, key);
          if (typeof value === "string" && value.trim() === "") {
            emptyKeys.push(key);
          }
        }
        expect(emptyKeys, `[${locale}] 空文字列キー: ${emptyKeys.join(", ")}`).toHaveLength(0);
      });
    }
  });

  describe("5言語でキーセットが一致している", () => {
    it("ja をベースラインとして、他言語に欠損がない", () => {
      const jaMessages = loadMessages("ja");
      for (const locale of LOCALES.filter((l) => l !== "ja")) {
        const messages = loadMessages(locale);
        const missing: string[] = [];
        for (const key of REQUIRED_LP_V42_KEYS) {
          const jaValue = getNestedValue(jaMessages, key);
          const value = getNestedValue(messages, key);
          // ja に値があるが他言語にない場合に欠損
          if (jaValue !== undefined && value === undefined) {
            missing.push(key);
          }
        }
        expect(missing, `[${locale}] ja と比較して欠損: ${missing.join(", ")}`).toHaveLength(0);
      }
    });
  });

  describe("既存 lp.* キーが削除されていない（リグレッション保護）", () => {
    for (const locale of LOCALES) {
      it(`[${locale}] 既存キーが保持されている`, () => {
        const messages = loadMessages(locale);
        const deleted: string[] = [];
        for (const key of EXISTING_LP_KEYS_TO_PROTECT) {
          const value = getNestedValue(messages, key);
          if (value === undefined || value === null) {
            deleted.push(key);
          }
        }
        expect(deleted, `[${locale}] 削除された既存キー: ${deleted.join(", ")}`).toHaveLength(0);
      });
    }
  });
});
