/**
 * competition.entries.* / teams.mobile.entryBulk.* / teams.mobile.retiredMemberBadge /
 * teams.competitions.card.entryBulkInputButton / teams.mobile.teamCompetitionList.entryBulkButton
 * — 管理者代理一括入力機能の i18n パリティテスト
 *
 * Sprint Contract:
 *   「チーム大会のエントリー登録を、管理者が選手の代理で一括入力できる機能」
 *   の新規UI文言が ja/en/ko/zh/de の5言語すべてに存在すること。
 *
 * 【2026-08-12 PM指摘への対応】当初この存在確認テストは ja.json から手動で列挙した
 * ハードコードキーリスト (ALL_KEYS) 方式だった。これは「テストを書いた時点で" +
 * 私が知っていたキー」しか検証できず、実際に
 * `teams.mobile.entryBulk.saveFailedDuplicate` の追加漏れをPM/Web Developerが
 * 別途報告するまで検出できなかった (この種の漏れは3ラウンド連続で発生した実績がある)。
 * PM推奨に従い、**実装ファイルを実際にソース走査して参照されているキーを抽出する方式**
 * (SOURCE_REFERENCED_KEYS) に置き換える。この方式なら、Developer が新しい
 * t("...") 呼び出しを追加した瞬間にこのテストが自動的にその新キーを検証対象に含める。
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

/**
 * entries機能の実装ファイルを走査し、実際に t(...)/tXxx(...) で参照されている
 * 翻訳キーの完全パスを抽出する。
 *
 * 各ファイルの `useTranslations("namespace")` / `useTranslation()` バインディングは
 * ソースコードを直接読んで確認済みの実測値 (推測ではない):
 *   - EntriesClient.tsx: t→"teams", tCommon→"common", tEntries→"competition.entries",
 *     tStyles→"practice.styles"
 *   - EntryBulkConfirmModal.tsx: t→"competition.entries.confirmModal", tCommon→"common"
 *   - MemberSelectModal.tsx (web): t→"teams", tEntries→"competition.entries"
 *   - TeamEntryBulkFormScreen.tsx (mobile, react-i18next): t は常にフルパスのキーを
 *     直接渡す (namespace prefix なし)
 *
 * 動的キー (`t(\`practice.styleAbbrev.${x}\`)` 等のテンプレートリテラル) は対象外
 * (静的に決まらないため)。
 */
function extractReferencedKeys(
  filePath: string,
  bindings: Record<string, string>,
): Set<string> {
  const source = readFileSync(path.join(REPO_ROOT, filePath), "utf-8");
  const keys = new Set<string>();

  for (const [varName, namespace] of Object.entries(bindings)) {
    const pattern = new RegExp(`\\b${varName}\\(\\s*["']([\\w.]+)["']`, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const key = match[1];
      if (!key) continue; // 正規表現の捕捉グループ ([\w.]+) は一致すれば必ず非空文字列
      keys.add(namespace ? `${namespace}.${key}` : key);
    }
  }

  return keys;
}

const SOURCE_FILES: Array<{ path: string; bindings: Record<string, string> }> = [
  {
    path: "apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/[competitionId]/entries/_client/EntriesClient.tsx",
    bindings: {
      t: "teams",
      tCommon: "common",
      tEntries: "competition.entries",
      tStyles: "practice.styles",
    },
  },
  {
    path: "apps/web/components/team/entry/EntryBulkConfirmModal.tsx",
    bindings: { t: "competition.entries.confirmModal", tCommon: "common" },
  },
  {
    path: "apps/web/components/team/MemberSelectModal.tsx",
    bindings: { t: "teams", tEntries: "competition.entries" },
  },
  {
    path: "apps/mobile/screens/TeamEntryBulkFormScreen.tsx",
    bindings: { t: "" }, // react-i18next: t は常にフルパスキー
  },
];

// 実装ファイルを実際に走査して抽出した、現時点で参照されている全キー
// (ハードコードではなく、テスト実行時に毎回ソースから再抽出する)
const SOURCE_REFERENCED_KEYS = Array.from(
  new Set(SOURCE_FILES.flatMap(({ path: p, bindings }) => [...extractReferencedKeys(p, bindings)])),
);

// entries機能に無関係な既存キー (例: common.delete, practice.styles.Fr 等) も
// 抽出結果に含まれるが、それらは元々存在するはずのキーなので同じ検証で問題ない
// (「既存キー破壊」の検出にもなる)。

const MISC_KEYS = [
  "teams.mobile.retiredMemberBadge",
  "teams.competitions.card.entryBulkInputButton",
  "teams.mobile.teamCompetitionList.entryBulkButton",
  // mobile専用の23505重複エラー文言 (2026-08-12 追加)。App Developer の参照先切り替え
  // (competition.entries.saveFailedDuplicate → こちら) が未着地の間も、
  // SOURCE_REFERENCED_KEYS だけでは検出できないため明示的に列挙する。
  // 切り替え後は SOURCE_REFERENCED_KEYS が自動的にこのキーを含むようになる。
  "teams.mobile.entryBulk.saveFailedDuplicate",
];

const ALL_KEYS = Array.from(new Set([...SOURCE_REFERENCED_KEYS, ...MISC_KEYS]));

describe("チーム大会エントリー管理者代理一括入力 — i18n パリティ", () => {
  it(
    "ソース走査による抽出キー数が妥当な範囲である (人間の意図: 抽出ロジック自体が" +
      "壊れて0件になっていないか、逆に正規表現が暴走して異常な件数になっていないかの" +
      "健全性チェック。この数値自体は実装の変更で自然に増減してよい)",
    () => {
      expect(SOURCE_REFERENCED_KEYS.length).toBeGreaterThan(20);
      expect(SOURCE_REFERENCED_KEYS.length).toBeLessThan(200);
    },
  );

  it.each(LOCALES)(
    "%s: ソースコードから実際に参照されている翻訳キーがすべて存在し、空文字ではない" +
      " (人間の意図: 5言語対応は前提条件。ハードコードした『知っているキー』のリストではなく、" +
      "実装が実際に呼んでいるキーを直接検証することで、Developer が新しい t(...) 呼び出しを" +
      "追加した瞬間にこのテストが自動的に追随する)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      for (const keyPath of ALL_KEYS) {
        const value = getByPath(messages, keyPath);
        expect(value, `${locale}.json に ${keyPath} が存在しない`).toBeDefined();
        expect(typeof value, `${locale}.json の ${keyPath} が文字列でない`).toBe("string");
        expect((value as string).length, `${locale}.json の ${keyPath} が空文字`).toBeGreaterThan(0);
      }
    },
  );

  it.each(LOCALES)(
    "%s.json のソースファイル上で新規キーが重複定義されていない" +
      " (人間の意図: 前例 competitionBulkInputLabel.test.ts で検出された『web/mobile" +
      "同時編集による重複キー上書き破損』と同じ事故を、この機能でも再発させない。" +
      "仕様#3『web と mobile を同時実装』は重複キー事故のリスクが特に高い)",
    (locale) => {
      const raw = readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf-8");
      // リーフキー名 (パスの末尾) で重複を検出する。ネスト構造上、同名キーが
      // 意図的に別の場所に存在するのは正常 (例: confirmButton は複数箇所にある) ため、
      // ここでは「一意な名前である可能性が高い」キーに限定して検査する。
      const uniqueLeafNames = ["entryBulkInputButton", "entryBulkButton", "retiredMemberBadge"];
      for (const leafName of uniqueLeafNames) {
        const occurrences = (raw.match(new RegExp(`"${leafName}"\\s*:`, "g")) ?? []).length;
        expect(occurrences, `${locale}.json 内で "${leafName}" キーが重複定義されている`).toBe(1);
      }
    },
  );

  it.each(LOCALES)(
    "%s: 既存の「代理入力」「一括入力」「{n}名選択中」「対象メンバーを選択」相当キーが" +
      "破損していない (人間の意図: 新規キー追加のマージ作業で既存の翻訳を" +
      "上書き・削除していないことを保証する)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      // Planner/PdM が実測で確認した既存キー (Phase A で確認済みのパス。
      // node script実測で正確な namespace を再確認: selectMembersTitle は
      // competition.records 配下、selectedMemberCount/memberSelectTitle は
      // teams.record 配下)
      expect(getByPath(messages, "competition.records.selectMembersTitle")).toBeTruthy();
      expect(getByPath(messages, "teams.record.selectedMemberCount")).toBeTruthy();
      expect(getByPath(messages, "teams.record.memberSelectTitle")).toBeTruthy();
    },
  );

  it.each(LOCALES)(
    "【QA発見・要対応】%s: mobile の衝突検出アラート文言キー " +
      "(teams.mobile.entryBulk.conflictingDeleteTitle / conflictingDeleteMessage) は " +
      "TeamEntryBulkFormScreen.tsx:305-306 で使用されているが、5言語のいずれにも" +
      "追加されていない (人間の意図: New Critical A [自然キー衝突の事前バリデーション] の" +
      "アラートが正しく翻訳されず、キー名または英語フォールバックのまま表示される" +
      "回帰を検出する。このテストは意図的にFAILしたままにし、Developer が" +
      "キーを追加した時点でPASSに変わる)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      expect(
        getByPath(messages, "teams.mobile.entryBulk.conflictingDeleteTitle"),
        `${locale}.json に conflictingDeleteTitle が存在しない (実装で使用中のキー)`,
      ).toBeDefined();
      expect(
        getByPath(messages, "teams.mobile.entryBulk.conflictingDeleteMessage"),
        `${locale}.json に conflictingDeleteMessage が存在しない (実装で使用中のキー)`,
      ).toBeDefined();
    },
  );
});
