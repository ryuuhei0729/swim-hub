/**
 * タブモーダル i18n: 翻訳キー網羅テスト
 *
 * Sprint Contract 検証観点:
 *   [V-I18N-01] forms.practice.tabs.* キーが ja/en/ko/zh/de 5言語に存在する
 *   [V-I18N-02] forms.competition.tabs.* キーが ja/en/ko/zh/de 5言語に存在する
 *   [V-I18N-03] forms.tabModal.* キーが ja/en/ko/zh/de 5言語に存在する
 *   [V-I18N-04] 5言語のキー集合が完全一致する (漏れがない)
 *   [V-I18N-05] en/ko/zh/de に日本語文字が含まれない
 *
 * 実装されたキー (Developer が追加):
 *   forms.practice.tabs.practice       — 「練習」タブラベル
 *   forms.practice.tabs.log            — 「練習ログ」タブラベル
 *   forms.competition.tabs.competition — 「大会」タブラベル
 *   forms.competition.tabs.entry       — 「エントリー」タブラベル
 *   forms.competition.tabs.record      — 「レコード」タブラベル
 *   forms.tabModal.save                — 一括保存ボタン
 *   forms.tabModal.saving              — 保存中ラベル
 *   forms.tabModal.cancel              — キャンセルボタン
 *   forms.tabModal.close               — 閉じるボタン
 *   forms.tabModal.fieldRequired       — 必須フィールドエラー
 *   forms.tabModal.saveAndClose        — フッター「保存して終了」ボタン
 *   forms.tabModal.next                — フッター「次に進む」ボタン
 *   forms.tabModal.back                — フッター「前に戻る」ボタン
 *   forms.tabModal.discardWarning.title    — 破棄確認タイトル
 *   forms.tabModal.discardWarning.message  — 破棄確認本文
 *   forms.tabModal.discardWarning.confirm  — 破棄確認ボタン
 *   forms.tabModal.discardWarning.cancel   — 戻るボタン
 */

import { describe, it, expect, test } from "vitest";
import jaMessages from "../../../shared/messages/ja.json";
import enMessages from "../../../shared/messages/en.json";
import koMessages from "../../../shared/messages/ko.json";
import zhMessages from "../../../shared/messages/zh.json";
import deMessages from "../../../shared/messages/de.json";

// ヘルパー: ネストしたキーをフラットなパスで列挙
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

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    return /[぀-ヿ一-鿿＀-￯]/.test(value);
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).some(containsJapanese);
  }
  return false;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, segment: string) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

// ============================================================
// 必須キー一覧 (Sprint Contract で合意 + Developer 実装済みキーを反映)
// ============================================================

const REQUIRED_TAB_MODAL_KEYS = [
  // 練習タブラベル
  "forms.practice.tabs.practice",
  "forms.practice.tabs.log",
  // 大会タブラベル
  "forms.competition.tabs.competition",
  "forms.competition.tabs.entry",
  "forms.competition.tabs.record",
  // 共通タブモーダル UI
  "forms.tabModal.save",
  "forms.tabModal.saving",
  "forms.tabModal.cancel",
  "forms.tabModal.close",
  "forms.tabModal.fieldRequired",
  // フッターボタン切り替え (次に進む/前に戻る/保存して終了)
  "forms.tabModal.saveAndClose",
  "forms.tabModal.next",
  "forms.tabModal.back",
  // 破棄警告ダイアログ
  "forms.tabModal.discardWarning.title",
  "forms.tabModal.discardWarning.message",
  "forms.tabModal.discardWarning.confirm",
  "forms.tabModal.discardWarning.cancel",
  // エントリー重複バリデーション (W-NEW-3)
  "forms.tabModal.duplicateEntryStyle",
];

const ALL_LOCALES = [
  { name: "ja", messages: jaMessages as unknown as Record<string, unknown> },
  { name: "en", messages: enMessages as unknown as Record<string, unknown> },
  { name: "ko", messages: koMessages as unknown as Record<string, unknown> },
  { name: "zh", messages: zhMessages as unknown as Record<string, unknown> },
  { name: "de", messages: deMessages as unknown as Record<string, unknown> },
];

// ============================================================
// [V-I18N-01/02/03] 必須キー存在チェック
// ============================================================

describe("[V-I18N-01/02/03] タブモーダル必須キー存在チェック (5言語)", () => {
  for (const { name, messages } of ALL_LOCALES) {
    describe(`${name}.json`, () => {
      test.each(REQUIRED_TAB_MODAL_KEYS)(`%s が存在し空でない`, (key) => {
        const value = getNestedValue(messages, key);
        expect(value, `${name}.json の "${key}" が未定義または空です`).toBeTruthy();
      });
    });
  }
});

// ============================================================
// [V-I18N-04] 5言語のキー集合完全一致
// ============================================================

describe("[V-I18N-04] forms.tabModal キー集合が5言語で完全一致する", () => {
  it("全言語の forms.tabModal キーが ja.json と一致する", () => {
    const jaFormsNs = (jaMessages as unknown as Record<string, unknown>)["forms"] as Record<string, unknown> | undefined;
    const jaTabModalNs = jaFormsNs?.["tabModal"] as Record<string, unknown> | undefined;
    expect(jaTabModalNs, "ja.json に forms.tabModal が存在しません").toBeDefined();
    if (!jaTabModalNs) return;
    const jaKeys = flattenKeys(jaTabModalNs, "forms.tabModal").sort();

    for (const { name, messages } of ALL_LOCALES.filter((l) => l.name !== "ja")) {
      const formsNs = messages["forms"] as Record<string, unknown> | undefined;
      const tabModalNs = formsNs?.["tabModal"] as Record<string, unknown> | undefined;
      expect(tabModalNs, `${name}.json に forms.tabModal が存在しません`).toBeDefined();
      if (!tabModalNs) continue;
      const keys = flattenKeys(tabModalNs, "forms.tabModal").sort();
      expect(
        keys,
        `${name}.json と ja.json の forms.tabModal キー集合が一致しません\n` +
        `ja only: ${jaKeys.filter((k) => !keys.includes(k)).join(", ")}\n` +
        `${name} only: ${keys.filter((k) => !jaKeys.includes(k)).join(", ")}`,
      ).toEqual(jaKeys);
    }
  });
});

// ============================================================
// [V-I18N-05] 非日本語ファイルに日本語が含まれない
// ============================================================

describe("[V-I18N-05] en/ko/de の forms.tabModal に日本語が含まれない", () => {
  // zh.json は中国語漢字が CJK統合漢字範囲に含まれるため日本語検出から除外する
  // (既存テストパターン準拠: messages-forms.test.ts の [V-CD-04] も en のみ確認)
  for (const { name, messages } of ALL_LOCALES.filter((l) => l.name !== "ja" && l.name !== "zh")) {
    it(`${name}.json の forms.tabModal に日本語が含まれない`, () => {
      const formsNs = messages["forms"] as Record<string, unknown> | undefined;
      const tabModalNs = formsNs?.["tabModal"];
      if (!tabModalNs) return;
      expect(
        containsJapanese(tabModalNs),
        `${name}.json の forms.tabModal に日本語文字が含まれています`,
      ).toBe(false);
    });
  }
});
