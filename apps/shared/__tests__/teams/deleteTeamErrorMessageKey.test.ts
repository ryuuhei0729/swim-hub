// =============================================================================
// deleteTeamErrorMessageKey.test.ts — QA 検証
// =============================================================================
//
// 対象: apps/shared/api/teams/core.ts の
//       `getDeleteTeamErrorMessageKey()` / `DELETE_TEAM_ERROR_MESSAGE_KEYS`
//
// ■ 何を守るテストか
//   RPC `delete_team_preserving_records` (migration 20260910000001) は失敗理由を
//   `auth_required` / `team_not_found` / `not_authorized` という **snake_case の
//   機械可読コード**で返す。`deleteTeam()` はそのコードを `UserFacingError` の
//   message に載せて throw し、**UI 層がこの関数でキーに変換してから t() する**。
//
//   この経路には壊れ方が2つある:
//     (a) コード→キーの対応がずれる  → ユーザーに別の理由が表示される
//     (b) キーは正しいが messages に無い → next-intl / react-i18next が
//         キー文字列 (`teams.settingsTab.deleteErrors.notAuthorized`) を
//         そのまま画面に出す
//   (b) は **型では防げない**。`DeleteTeamMessageKey` はリテラル union なので
//   タイポは型で弾けるが、「型には書いたが JSON に足し忘れた」は素通りする。
//   よって本ファイルは (a) と (b) を**両方**検証する。
//
// ■ トートロジー回避
//   コード→キーの期待値は `DELETE_TEAM_ERROR_MESSAGE_KEYS` から導出せず、
//   **テスト内に手書きした定数**と突き合わせる。実装の表をそのまま読んで比較すると
//   表を何に書き換えても緑のままになる。
//   一方 (b) の「キーが messages に存在するか」は **TS の表と JSON という独立した
//   2つの情報源**を突き合わせるので、表を走査してよい (むしろ走査しないと
//   将来増えたコードが検査から漏れる)。
// =============================================================================

import { describe, it, expect } from "vitest";

import {
  TeamOperationError,
  DELETE_TEAM_ERROR_MESSAGE_KEYS,
  DELETE_TEAM_FALLBACK_MESSAGE_KEY,
  getDeleteTeamErrorMessageKey,
} from "../../api/teams/core";
import { UserFacingError, toUserFacingMessage } from "../../utils/userFacingError";

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

/** ドット区切りキーを解決する。存在しなければ undefined */
function resolveKey(messages: Record<string, unknown>, dottedKey: string): unknown {
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
// (a) コード → i18n キーの対応。**期待値は手書き**
//     migration 20260910000001 の RETURN jsonb_build_object('error', ...) と
//     1対1で対応する
// ---------------------------------------------------------------------------
const EXPECTED_CODE_TO_KEY: [code: string, key: string][] = [
  ["auth_required", "teams.settingsTab.deleteErrors.authRequired"],
  ["team_not_found", "teams.settingsTab.deleteErrors.teamNotFound"],
  ["not_authorized", "teams.settingsTab.deleteErrors.notAuthorized"],
];

const FALLBACK_KEY = "teams.settingsTab.deleteFailed";

describe("getDeleteTeamErrorMessageKey — コード → i18n キー", () => {
  it.each(EXPECTED_CODE_TO_KEY)("%s → %s", (code, expectedKey) => {
    expect(getDeleteTeamErrorMessageKey(new TeamOperationError(code))).toBe(expectedKey);
  });

  it("3コードはそれぞれ異なるキーに写る (取り違え・使い回しの検出)", () => {
    const keys = EXPECTED_CODE_TO_KEY.map(([code]) =>
      getDeleteTeamErrorMessageKey(new TeamOperationError(code)),
    );
    expect(new Set(keys).size).toBe(EXPECTED_CODE_TO_KEY.length);
    // どれも汎用フォールバックに潰れていないこと
    expect(keys).not.toContain(FALLBACK_KEY);
  });

  it("未知のコードは汎用キー (deleteFailed) に落ちる", () => {
    expect(getDeleteTeamErrorMessageKey(new TeamOperationError("some_new_code"))).toBe(FALLBACK_KEY);
    // deleteTeam が deleted_team_count !== 1 のときに投げるコードも未知扱い
    expect(getDeleteTeamErrorMessageKey(new TeamOperationError("delete_not_applied"))).toBe(
      FALLBACK_KEY,
    );
    // RPC の data が null だったときのコード
    expect(getDeleteTeamErrorMessageKey(new TeamOperationError("unknown_error"))).toBe(FALLBACK_KEY);
  });

  it("空文字コードでも汎用キーに落ちる (境界)", () => {
    expect(getDeleteTeamErrorMessageKey(new TeamOperationError(""))).toBe(FALLBACK_KEY);
  });

  // ===========================================================================
  // M2-4 の安全性の核: TeamOperationError は UserFacingError の instance であってはならない。
  //
  // `toUserFacingMessage()` は `error instanceof UserFacingError` のときだけ
  // message を素通しする。仮に TeamOperationError が UserFacingError を継承していると、
  // 将来うっかり `toUserFacingMessage(err)` を通した瞬間に `not_authorized` という
  // 機械可読コードがそのまま画面へ出る。継承関係そのものを固定して退行を防ぐ。
  // ===========================================================================
  it("[M2-4] TeamOperationError は UserFacingError の instance ではない", () => {
    const coded = new TeamOperationError("not_authorized");

    expect(coded).toBeInstanceOf(TeamOperationError);
    expect(coded).toBeInstanceOf(Error);
    expect(coded instanceof UserFacingError).toBe(false);
    // コードは message と code の両方から辿れる (ログ用 / 変換用)
    expect(coded.code).toBe("not_authorized");
    expect(coded.message).toBe("not_authorized");
  });

  it("[M2-4] TeamOperationError を toUserFacingMessage に通してもコードが露出せず汎用文言になる", () => {
    const fallback = "チームの削除に失敗しました";
    const shown = toUserFacingMessage(new TeamOperationError("not_authorized"), fallback);

    expect(shown).toBe(fallback);
    expect(shown).not.toContain("not_authorized");
  });

  it("[M2-4 対照] 本来の UserFacingError は toUserFacingMessage で素通しされる", () => {
    // TeamOperationError 側の結果が「実装が壊れていて常に fallback」ではないことの対照。
    // この2本が揃って初めて「型で区別できている」と言える
    const shown = toUserFacingMessage(new UserFacingError("表示してよい文言"), "fallback");
    expect(shown).toBe("表示してよい文言");
  });

  it("UserFacingError にコードを載せても対応表を引かない (TeamOperationError と混ぜない)", () => {
    // `UserFacingError` は「message をそのまま画面に出してよい」ことを型で表明する
    // クラスなので、コードの運搬に使ってはいけない。もし誤って使われた場合でも
    // 対応表は引かず汎用キーに落ちることを固定する (取り違えの二重防止)。
    expect(getDeleteTeamErrorMessageKey(new UserFacingError("not_authorized"))).toBe(FALLBACK_KEY);
    expect(getDeleteTeamErrorMessageKey(new UserFacingError("team_not_found"))).toBe(FALLBACK_KEY);
  });

  it("TeamOperationError でないエラーは汎用キーに落ちる (生の PostgrestError を表示しない)", () => {
    // 生のエラーはテーブル名や RLS ポリシー詳細を含みうる。
    // その message がキー扱いで画面に出ないことを固定する
    const raw = new Error('relation "teams" violates row-level security policy');
    expect(getDeleteTeamErrorMessageKey(raw)).toBe(FALLBACK_KEY);
    expect(getDeleteTeamErrorMessageKey(undefined)).toBe(FALLBACK_KEY);
    expect(getDeleteTeamErrorMessageKey(null)).toBe(FALLBACK_KEY);
    expect(getDeleteTeamErrorMessageKey("not_authorized")).toBe(FALLBACK_KEY);
  });

  it("エクスポートされた汎用キー定数が手書き期待値と一致する", () => {
    expect(DELETE_TEAM_FALLBACK_MESSAGE_KEY).toBe(FALLBACK_KEY);
  });

  it("対応表に想定外のコードが増えていない (増えたらこのテストの更新が要る)", () => {
    expect(Object.keys(DELETE_TEAM_ERROR_MESSAGE_KEYS).sort()).toEqual(
      EXPECTED_CODE_TO_KEY.map(([code]) => code).sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// (b) 返しうるキーが **5ロケールすべての messages に実在する**か。
//     ここは TS の表と JSON という独立した2情報源の突き合わせなので表を走査する
//     (走査しないと将来コードが増えたとき検査から漏れる)
// ---------------------------------------------------------------------------
describe("getDeleteTeamErrorMessageKey が返すキーは5ロケールに実在する", () => {
  const allReturnableKeys = [
    ...Object.values(DELETE_TEAM_ERROR_MESSAGE_KEYS),
    DELETE_TEAM_FALLBACK_MESSAGE_KEY,
  ];

  it("前提: 検査対象のキーが4件ある (表3件 + フォールバック1件)", () => {
    expect(new Set(allReturnableKeys).size).toBe(4);
  });

  it.each(Object.keys(LOCALES) as LocaleName[])(
    "%s: 返しうるキーがすべて非空文字列として存在する",
    (locale) => {
      const missing = allReturnableKeys.filter((key) => {
        const value = resolveKey(LOCALES[locale], key);
        return typeof value !== "string" || value.trim() === "";
      });
      expect(missing, `${locale} に欠けている/空のキー`).toEqual([]);
    },
  );

  it("ja: 4つの文言が互いに重複しない (コピペで同じ文言を貼っていない)", () => {
    const values = allReturnableKeys.map((key) => resolveKey(jaMessages, key));
    expect(new Set(values).size).toBe(allReturnableKeys.length);
  });

  it("en: 返しうる文言に日本語が混ざっていない (未翻訳コピペの検出)", () => {
    const untranslated = allReturnableKeys.filter((key) => {
      const value = resolveKey(enMessages, key);
      return typeof value === "string" && /[぀-ヿ一-鿿]/.test(value);
    });
    expect(untranslated).toEqual([]);
  });

  it("返り値がキーそのものではなく実文言に解決できる (キー文字列が画面に出ない)", () => {
    for (const [code] of EXPECTED_CODE_TO_KEY) {
      const key = getDeleteTeamErrorMessageKey(new TeamOperationError(code));
      const jaText = resolveKey(jaMessages, key);
      expect(typeof jaText, `${code} → ${key} が ja で解決できない`).toBe("string");
      // 解決結果がキー文字列そのものだったら変換できていない
      expect(jaText).not.toBe(key);
    }
  });
});
