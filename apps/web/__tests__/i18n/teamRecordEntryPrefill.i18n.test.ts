/**
 * competition.records.* / forms.recordLog.entryTimeLabel
 * — 「エントリー行の初期反映」機能の i18n パリティテスト
 *
 * Sprint Contract:
 *   「チーム詳細 → 大会カード → 記録入力」を開いたとき、その大会に登録済みの
 *   エントリー内容 (選手 × 種目) を初期行として反映する。エントリータイムは
 *   読み取り専用の参考ラベル (例: 「エントリー: 1:23.45」) として表示する (仕様#1)。
 *
 * 【2026-08-12 PM指摘への対応】当初この参考ラベルは「新規キーを1件追加する」前提で
 * 計画されていたが、App Developer の実測により `forms.recordLog.entryTimeLabel`
 * (`RecordLogFormScreen.tsx:860` / `CompetitionTabFormScreen.tsx:1959`) が
 * **既にまったく同じ用途** (読み取り専用のエントリータイム参照ラベル) で
 * ja/en/ko/zh/de の5言語すべてに存在することが判明した。新規キーは追加せず、
 * このキーを web/mobile 双方で再利用する方針に変更された (前スプリントで
 * `competition.entries.entryHeader` と `teams.record.eventNumber` が重複し
 * 統合した事故と同型)。よってこのテストの主眼は「新規キーの存在確認」ではなく
 * 「既存キー forms.recordLog.entryTimeLabel が5言語に存在し続けること」と
 * 「RecordClient.tsx / TeamRecordBulkFormScreen.tsx が実際に参照しているキーが
 * すべて揃っていること」の2点になる。
 *
 * 後段のソース走査方式は前スプリント (teamEntryBulkInput.i18n.test.ts) の反省を
 * 踏襲する: ハードコードしたキー配列ではなく、実装ファイルを実際に走査して
 * 参照されているキーを抽出する。ただし forms.recordLog.entryTimeLabel は
 * web 側でどの useTranslations バインディング経由で呼ばれるか (Developer 実装待ち)
 * 未確定なため、ソース走査とは別に直接キー存在チェックも用意する (下記)。
 *
 * 各バインディング (t→namespace) はソースコードを実際に読んで確認した実測値:
 *   - RecordClient.tsx (web): t→"teams", tCommon→"common",
 *     tRecords→"competition.records", tStyles→"practice.styles"
 *   - TeamRecordBulkFormScreen.tsx (mobile, react-i18next): t は常にフルパスの
 *     キーを直接渡す (namespace prefix なし) — forms.recordLog.entryTimeLabel は
 *     このパターンでソース走査に自動的に含まれる
 *
 * 動的キー (テンプレートリテラル) は対象外 (静的に決まらないため)。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const LOCALES = ["ja", "en", "ko", "zh", "de"] as const;
type Locale = (typeof LOCALES)[number];

const LOCALE_MESSAGES: Record<Locale, unknown> = {
  ja: jaMessages,
  en: enMessages,
  ko: koMessages,
  zh: zhMessages,
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

function extractReferencedKeys(filePath: string, bindings: Record<string, string>): Set<string> {
  const source = readFileSync(path.join(REPO_ROOT, filePath), "utf-8");
  const keys = new Set<string>();

  for (const [varName, namespace] of Object.entries(bindings)) {
    const pattern = new RegExp(`\\b${varName}\\(\\s*["']([\\w.]+)["']`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const key = match[1];
      keys.add(namespace ? `${namespace}.${key}` : key);
    }
  }

  return keys;
}

const SOURCE_FILES: Array<{ path: string; bindings: Record<string, string> }> = [
  {
    path: "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/records/_client/RecordClient.tsx",
    bindings: {
      t: "teams",
      tCommon: "common",
      tRecords: "competition.records",
      tStyles: "practice.styles",
    },
  },
  {
    path: "apps/mobile/screens/TeamRecordBulkFormScreen.tsx",
    bindings: { t: "" }, // react-i18next: t は常にフルパスキー
  },
];

// 実装ファイルを実際に走査して抽出した、現時点で参照されている全キー
// (ハードコードではなく、テスト実行時に毎回ソースから再抽出する)
const SOURCE_REFERENCED_KEYS = Array.from(
  new Set(SOURCE_FILES.flatMap(({ path: p, bindings }) => [...extractReferencedKeys(p, bindings)])),
);

describe("チーム大会記録入力 — エントリー行初期反映機能 i18n パリティ", () => {
  it(
    "ソース走査による抽出キー数が妥当な範囲である (人間の意図: 抽出ロジック自体が" +
      "壊れて0件になっていないか、逆に正規表現が暴走して異常な件数になっていないかの" +
      "健全性チェック。この数値自体は実装の変更で自然に増減してよい)",
    () => {
      expect(SOURCE_REFERENCED_KEYS.length).toBeGreaterThan(15);
      expect(SOURCE_REFERENCED_KEYS.length).toBeLessThan(200);
    },
  );

  it.each(LOCALES)(
    "%s: RecordClient.tsx / TeamRecordBulkFormScreen.tsx から実際に参照されている" +
      "翻訳キーがすべて存在し、空文字ではない (人間の意図: エントリー参考ラベル用の" +
      "新規キーを Developer が追加した瞬間、このテストは再抽出により自動的にその" +
      "キーを検証対象へ含める。ハードコードした『知っているキー』のリストでは" +
      "この追随ができない — 前スプリントで実際に発生した追加漏れの再発防止)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      for (const keyPath of SOURCE_REFERENCED_KEYS) {
        const value = getByPath(messages, keyPath);
        expect(value, `${locale}.json に ${keyPath} が存在しない`).toBeDefined();
        expect(typeof value, `${locale}.json の ${keyPath} が文字列でない`).toBe("string");
        expect((value as string).length, `${locale}.json の ${keyPath} が空文字`).toBeGreaterThan(0);
      }
    },
  );

  it.each(LOCALES)(
    "%s: 既存の記録入力フォームの主要文言 (保存ボタン・種目ラベル) が破損していない" +
      "(人間の意図: エントリー行マージ機能の追加で既存キーを上書き・削除していないこと" +
      "を保証する)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      expect(getByPath(messages, "competition.records.eventLabel")).toBeTruthy();
      expect(getByPath(messages, "competition.records.timePlaceholder")).toBeTruthy();
      expect(getByPath(messages, "teams.record.saveButton")).toBeTruthy();
    },
  );

  it.each(LOCALES)(
    "%s: 参考ラベルとして再利用が確定した forms.recordLog.entryTimeLabel が" +
      "5言語すべてに存在し、空文字ではない (人間の意図: PM確定仕様 [2026-08-12]。" +
      "新規キーを追加せず、RecordLogFormScreen.tsx / CompetitionTabFormScreen.tsx で" +
      "既に読み取り専用のエントリータイム参照ラベルとして使われているこのキーを" +
      "web/mobile 双方で再利用する。既存キーの重複を防ぐガードでもある: このキーが" +
      "5言語のどれか1つでも欠けたり削除されたりした場合、この機能だけでなく" +
      "既存2画面のバッジ表示も同時に壊れることを明示する)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      const value = getByPath(messages, "forms.recordLog.entryTimeLabel");
      expect(value, `${locale}.json に forms.recordLog.entryTimeLabel が存在しない`).toBeDefined();
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
    },
  );

  it.each(LOCALES)(
    "%s: 重複キー teams.record.entryTimeReference が5言語すべてから削除されている" +
      "(人間の意図: PM確定仕様 [2026-08-12・修正1]。forms.recordLog.entryTimeLabel に" +
      "統合されたため、Web Developer が一時的に新設した teams.record.entryTimeReference は" +
      "削除済み (2026-08-12着地確認済み)。このテストは今後の回帰防止ガードとして残す: " +
      "『同じ用途のキーが2つ並存する』(前スプリントの competition.entries.entryHeader / " +
      "teams.record.eventNumber 重複と同型の事故) を再発させないためのもの)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      const value = getByPath(messages, "teams.record.entryTimeReference");
      expect(
        value,
        `${locale}.json に teams.record.entryTimeReference がまだ残っている (削除予定のキー)`,
      ).toBeUndefined();
    },
  );
});
