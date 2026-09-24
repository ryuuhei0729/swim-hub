// =============================================================================
// teamSettingsTabMessages.test.ts — QA Sprint Contract Phase A スケルトン
// =============================================================================
//
// 対象: apps/shared/messages/{ja,en,de,ko,zh}.json
//
// ■ なぜ専用テストが要るか (Planner の申し送りに対する QA の訂正)
//   Planner は「messages-coverage.test.ts が5ロケール漏れで赤になる」と報告したが、
//   **実測の結果これは誤り**。messages-coverage.test.ts が見ているのは
//     [V-01] ja と en の**キー構造**一致
//     [V-04] en.json の値に日本語が混ざっていないこと
//   の2点だけで、**値だけを変える変更 (スコープB 項目2) は素通しする**。
//   さらに既存の AdminViewToggle.test.tsx は
//     expect(screen.getByText(jaMessages.teams.mobile.adminToggle.admin))
//   と JSON を参照しているためトートロジーで、値を変えても緑のままになる。
//   よって「PM の指定した文言に実際になっているか」を literal で固定する
//   テストがどこにも無い。本ファイルがその唯一の番人になる。
//
// ■ Sprint Contract 検証観点
//   [V-B20] teams.mobile.adminToggle.admin / .user が PM 指定の5ロケール値と完全一致
//   [V-B21] 死にキー teams.mobile.adminToggle.label は5ロケールとも残っている
//           (PM 裁定「触らない」。ついでに消す変更が入ったらここで落ちる)
//   [V-A40] 設定タブが使う i18n キーが5ロケールすべてに存在し、非空文字列である
//   [V-A41] en の値に日本語が混ざっていない (未翻訳のコピペ検出)
//   [V-A42] ja の設定タブ用ラベルは互いに重複しない
//           (テストが getByText で一意に引ける前提。コピペミスの検出も兼ねる)
//
// Phase A 時点では [V-B20] と [V-A40]〜[V-A42] が赤になる。
// =============================================================================

import { describe, it, expect } from "vitest";

import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import koMessages from "../../messages/ko.json";
import zhMessages from "../../messages/zh.json";

const LOCALES = {
  ja: jaMessages,
  en: enMessages,
  de: deMessages,
  ko: koMessages,
  zh: zhMessages,
} as const satisfies Record<string, Record<string, unknown>>;

type LocaleName = keyof typeof LOCALES;

function getByDottedKey(messages: Record<string, unknown>, dottedKey: string): unknown {
  let cur: unknown = messages;
  for (const part of dottedKey.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// [V-B20] スコープB 項目2: トグル文言の値を PM 指定どおりに変える
// 期待値は PM の表からの **手書き literal**。JSON から読んだ値を使い回さない
// (それをやると値を何に変えても緑のままになる = 既存 AdminViewToggle.test.tsx の罠)
// ---------------------------------------------------------------------------
const EXPECTED_ADMIN_TOGGLE: Record<LocaleName, { admin: string; user: string }> = {
  ja: { admin: "管理者", user: "利用者" },
  en: { admin: "Admin", user: "Member" },
  de: { admin: "Administrator", user: "Mitglied" },
  ko: { admin: "관리자", user: "멤버" },
  zh: { admin: "管理员", user: "成员" },
};

describe("[V-B20] teams.mobile.adminToggle の文言 (5ロケール)", () => {
  it.each(Object.keys(LOCALES) as LocaleName[])(
    "%s: admin / user が PM 指定の文言と完全一致する",
    (locale) => {
      const actual = getByDottedKey(LOCALES[locale], "teams.mobile.adminToggle");
      expect(actual).toMatchObject(EXPECTED_ADMIN_TOGGLE[locale]);
    },
  );

  // [V-B21] キー構造は不変 — 死にキー label を巻き込みで消さない
  it.each(Object.keys(LOCALES) as LocaleName[])(
    "%s: 死にキー teams.mobile.adminToggle.label は残っている (触らない)",
    (locale) => {
      const label = getByDottedKey(LOCALES[locale], "teams.mobile.adminToggle.label");
      expect(typeof label).toBe("string");
      expect(label).not.toBe("");
    },
  );

  // 「全部同じ文字列にして通す」逃げ道を塞ぐ対照確認
  it("admin と user は同じ文言ではない (全ロケール)", () => {
    for (const locale of Object.keys(LOCALES) as LocaleName[]) {
      const toggle = getByDottedKey(LOCALES[locale], "teams.mobile.adminToggle") as {
        admin?: string;
        user?: string;
      };
      expect(toggle.admin, `${locale}.admin`).not.toBe(toggle.user);
    }
  });
});

// ---------------------------------------------------------------------------
// [V-A40] スコープA: 設定タブが使う i18n キー
//
// QA が Phase A で確定させるキー一覧 (Contract 補強)。
// web / mobile 双方の設定タブがこの namespace を読む (shared/messages は
// web+mobile 共通の唯一の定義元なので fork しないこと)。
// ---------------------------------------------------------------------------
const REQUIRED_SETTINGS_TAB_KEYS = [
  // タブのラベル
  "teams.tabs.settings", // web (TEAM_TAB_DEFS の labelKey は "tabs.settings")
  "teams.mobile.tabSettings", // mobile (BASE_TABS の nameKey)
  // [チーム情報]
  "teams.settingsTab.teamInfoTitle",
  "teams.settingsTab.editTeamInfo",
  // [招待コード]
  "teams.settingsTab.inviteCodeTitle",
  "teams.settingsTab.copyInviteCode",
  // [カレンダー記録色]
  "teams.settingsTab.calendarColorTitle",
  // [チーム操作]
  "teams.settingsTab.teamActionsTitle",
  "teams.settingsTab.createTeam",
  "teams.settingsTab.joinTeam",
  // [危険な操作]
  "teams.settingsTab.dangerZoneTitle",
  "teams.settingsTab.leaveTeam",
  "teams.settingsTab.deleteTeam",
  // 最後の管理者の脱退ブロック (PM 裁定 C)
  "teams.settingsTab.lastAdminCannotLeave",
] as const;

// 日本語 (ひらがな・カタカナ・漢字) の検出。既存 messages-coverage.test.ts と同じ意図
const JAPANESE_RE = /[぀-ゟ゠-ヿ一-鿿]/;

describe("[V-A40] 設定タブの i18n キー (5ロケール)", () => {
  it.each(Object.keys(LOCALES) as LocaleName[])(
    "%s: 必要なキーがすべて存在し、非空文字列である",
    (locale) => {
      const missing: string[] = [];
      for (const key of REQUIRED_SETTINGS_TAB_KEYS) {
        const value = getByDottedKey(LOCALES[locale], key);
        if (typeof value !== "string" || value.trim() === "") missing.push(key);
      }
      expect(missing, `${locale} に欠けている/空のキー`).toEqual([]);
    },
  );

  // [V-A41] en が日本語のままコピペされていないこと
  it("[V-A41] en の設定タブ文言に日本語が混ざっていない", () => {
    const untranslated = REQUIRED_SETTINGS_TAB_KEYS.filter((key) => {
      const value = getByDottedKey(enMessages, key);
      return typeof value === "string" && JAPANESE_RE.test(value);
    });
    expect(untranslated).toEqual([]);
  });

  // [V-A42] ja のラベルが一意であること (getByText が一意に引ける前提を守る)
  //
  // 対象は teams.settingsTab.* のみ。タブのラベル 2 件
  // (teams.tabs.settings / teams.mobile.tabSettings) は web と mobile で同じ
  // 「設定」になるのが正しいので、重複判定から外す。
  it("[V-A42] ja の teams.settingsTab.* のラベルは互いに重複しない", () => {
    const sectionKeys = REQUIRED_SETTINGS_TAB_KEYS.filter((key) =>
      key.startsWith("teams.settingsTab."),
    );
    const values = sectionKeys
      .map((key) => getByDottedKey(jaMessages, key))
      .filter((v): v is string => typeof v === "string");
    expect(new Set(values).size).toBe(values.length);
  });
});
