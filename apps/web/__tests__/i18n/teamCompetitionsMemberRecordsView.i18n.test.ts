/**
 * TeamCompetitions (web) — 利用者ビュー記録閲覧解放 (Phase A2) に伴う新規 i18n キー
 * の5ロケール網羅テスト。
 *
 * Sprint Contract (PM 判定):
 *   TeamCompetitions.tsx L907 の「記録情報」ブロック (旧 admin 専用) を全ユーザーに
 *   露出させる。このブロックには従来ハードコードされた日本語が4箇所、加えて
 *   L837 の aria-label に1箇所あり、非adminに露出させる以上すべて i18n 化必須。
 *
 *   新規キー (QA 提案。既存の `teams.competitions.card.*` 命名規則に合わせた):
 *     - teams.competitions.card.recordCount        ("登録記録: {count}件")
 *     - teams.competitions.card.tapForDetails       ("タップで詳細")
 *     - teams.competitions.card.noRecords           ("登録記録なし")
 *     - teams.competitions.card.addable             ("追加可能")
 *     - teams.competitions.card.viewRecordsAriaLabel ("{title}の記録を閲覧")
 *
 *   キー名の実装権限は Web Developer にあるため、Developer が別名を採用した場合は
 *   この既存契約テストと `TeamCompetitionsMemberRecordsView.test.tsx` の双方が赤くなる
 *   (どちらかだけ直す部分実装を許さない)。
 *
 * 過去の教訓 (`feedback_swimhub_i18n_key_handoff_gap` / `feedback_swimhub_i18n_text_only_change_not_local`):
 *   apps/shared/messages/*.json は web+mobile 共有の唯一の定義元。tsc/lint/build は
 *   キー欠落を検出しない。5ロケール全てへの機械的な存在確認を必須とする。
 *
 * 【Reviewer Low 3件対応 (2026-09-19)】
 * 1. en.json の `recordCount` が Reviewer 指摘 (Medium) を受けて ICU plural 構文
 *    (`{count, plural, one {{count} record} other {{count} records}}`) に変更された。
 *    旧 `extractPlaceholders` は正規表現 `/\{[a-zA-Z0-9_]+\}/g` で `{count}` の
 *    **部分一致文字列**を拾っていただけで、たまたま ICU 文字列内にリテラルとして
 *    `{count}` が2箇所出現したため緑のまま残っていた (Web Developer 自己申告)。
 *    ICU 構文の意味を理解していないため、例えば先頭の plural 引数名だけを
 *    `{cnt, plural, ...}` のように壊しても "count" という文字列自体は内側の
 *    サブメッセージに残るため検出できなかった。
 *    → `extractArgumentNames` に置き換え、`{name` の直後が `,` (plural/select 開始)
 *    または `}` (単純プレースホルダー終端) のときだけを引数名として抽出する
 *    (ICU の入れ子サブメッセージ内の `{count}` も同じ規則で正しく拾える)。
 *    比較は「ja に含まれる引数名の集合と完全一致 (過不足なし)」に強化した。
 *    plural 引数名だけを別名に壊すと集合が {"count"} → {"cnt"} (または {"cnt","count"})
 *    に変化し、ja の {"count"} と一致しなくなるため確実に赤くなる
 *    (ミューテーションで実証済み。QA 報告参照)。
 * 2. 重複キー検出テストの `leafNames` が `NEW_KEYS` と独立したハードコード配列で、
 *    `viewRecordsAriaLabel` が抜けていた (二重管理の食い違い)。`NEW_KEYS` から
 *    リーフ名を導出する形にし、今後 `NEW_KEYS` にキーを追加すれば自動追随するようにした。
 * 3. en.json 以外 (ko/zh/de) の翻訳漏れ・コピペを検出する仕組みが無かった。
 *    ハングル/漢字の言語別判定は zh (漢字を使う) で誤検知するため採用せず、
 *    Reviewer 提案通り「ja.json の値とバイト完全一致していないこと」の対照チェックを
 *    ko/zh/de に追加した (ミューテーションで実証済み)。
 */

import { describe, expect, it } from "vitest";
import jaMessages from "@apps/shared/messages/ja.json";
import enMessages from "@apps/shared/messages/en.json";
import koMessages from "@apps/shared/messages/ko.json";
import zhMessages from "@apps/shared/messages/zh.json";
import deMessages from "@apps/shared/messages/de.json";

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

function containsJapanese(value: unknown): boolean {
  if (typeof value === "string") {
    return /[぀-ヿ一-鿿＀-￯]/.test(value);
  }
  return false;
}

/**
 * ICU MessageFormat の引数名を構文的に抽出する。
 *
 * 単純プレースホルダー (`{count}`) と plural/select 構文の制御引数
 * (`{count, plural, ...}`) の両方を、`{` の直後の識別子が `,` または `}` で
 * 終わっている箇所として検出する。ICU のサブメッセージ (`one {...}` / `other {...}`)
 * はメッセージ本体を波括弧でもう一段包むため `{{count} record}` のように `{{` が
 * 連続するが、その外側の `{` は識別子で始まらないため誤って拾わない。
 * サブメッセージ内部で参照される `{count}` は plural 引数とは独立した値参照だが、
 * 呼び出し側が渡す必要のある値という意味では同じ集合に含めるべきなので拾う
 * (= 「このメッセージを正しく描画するために t() の第2引数へ渡す必要がある
 * キー名の集合」を返す関数)。
 *
 * 完全な ICU パーサではないため、深いネストや `#`（plural 内の暗黙カウント記法）
 * 等までは扱わないが、本ファイルが検証する範囲 (単純補間 / 単一レベルの plural)
 * には十分。
 */
function extractArgumentNames(value: unknown): Set<string> {
  const result = new Set<string>();
  if (typeof value === "string") {
    const pattern = /\{\s*([a-zA-Z0-9_]+)\s*[,}]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
      const name = match[1];
      if (name) result.add(name);
    }
  }
  return result;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

const NEW_KEYS = [
  "teams.competitions.card.recordCount",
  "teams.competitions.card.tapForDetails",
  "teams.competitions.card.noRecords",
  "teams.competitions.card.addable",
  "teams.competitions.card.viewRecordsAriaLabel",
] as const;

describe("[Phase A2 / web] TeamCompetitions 利用者ビュー記録閲覧解放 — 新規 i18n キー5ロケール網羅", () => {
  it.each(LOCALES)(
    "%s: 新規キーがすべて存在し、空文字ではない文字列である",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale];
      for (const key of NEW_KEYS) {
        const value = getByPath(messages, key);
        expect(value, `${locale}.json に "${key}" が存在しない (未実装)`).toBeDefined();
        expect(typeof value, `${locale}.json の "${key}" が文字列でない`).toBe("string");
        expect((value as string).length, `${locale}.json の "${key}" が空文字`).toBeGreaterThan(0);
      }
    },
  );

  it("en.json の新規キーに日本語が含まれない (翻訳漏れゼロ)", () => {
    for (const key of NEW_KEYS) {
      const value = getByPath(enMessages, key);
      if (value === undefined) continue; // 存在確認は上のテストが担当
      expect(containsJapanese(value), `en.json の "${key}" に日本語が含まれている`).toBe(false);
    }
  });

  it.each(["teams.competitions.card.recordCount", "teams.competitions.card.viewRecordsAriaLabel"] as const)(
    '"%s" が要求する引数名の集合が ja を基準に全ロケールで過不足なく一致する' +
      " (ICU plural/select の制御引数名も含めて構文的に比較する。単純な部分文字列一致では" +
      " ICU 文字列内のネストしたリテラル `{count}` を拾って偽陽性の緑になるため使わない)",
    (key) => {
      const jaArgs = extractArgumentNames(getByPath(jaMessages, key));
      if (jaArgs.size === 0) return; // 未実装ならスキップ (存在確認は別テストが担当)

      for (const locale of LOCALES) {
        const value = getByPath(LOCALE_MESSAGES[locale], key);
        if (value === undefined) continue;
        const localeArgs = extractArgumentNames(value);
        expect(
          setsEqual(jaArgs, localeArgs),
          `${locale}.json の "${key}" が要求する引数名 {${[...localeArgs].join(", ")}} が` +
            ` ja.json の {${[...jaArgs].join(", ")}} と一致しない` +
            ` (ICU plural の引数名の付け間違い、または欠落の可能性)`,
        ).toBe(true);
      }
    },
  );

  // NEW_KEYS から導出する (ハードコードした別リストを二重管理しない。
  // Reviewer 指摘: 旧実装はここが独立した配列で `viewRecordsAriaLabel` が
  // 抜けていた。NEW_KEYS にキーを追加すれば自動的にここにも反映される)。
  const NEW_KEYS_LEAF_NAMES = NEW_KEYS.map((key) => key.split(".").pop()!);

  it.each(LOCALES)(
    "%s: 新規キー名がリーフ名で重複定義されていない (マージ事故防止)",
    (locale) => {
      const messages = LOCALE_MESSAGES[locale] as Record<string, unknown>;
      const cardBlock = getByPath(messages, "teams.competitions.card");
      if (!cardBlock || typeof cardBlock !== "object") return;
      // 同一 card ブロック直下でのキー名衝突は JSON.parse の時点で後勝ちになり
      // 静かに消えるため、パース後のオブジェクトに全キーが揃っていることで代替確認する
      // (JSON 構文上、真の重複はパース時に検出不能なため、期待キー数の充足で見る)。
      for (const leaf of NEW_KEYS_LEAF_NAMES) {
        expect(
          Object.prototype.hasOwnProperty.call(cardBlock, leaf),
          `${locale}.json の teams.competitions.card に "${leaf}" が存在しない`,
        ).toBe(true);
      }
    },
  );

  // Reviewer Low 指摘 (3): en.json 以外の翻訳漏れ・コピペを機械的に検出する仕組みが
  // 無かった。ハングル/漢字の言語別判定は zh (漢字を使う) で誤検知するため、
  // 「ja.json の値とバイト完全一致していないこと」の対照チェックで代替する。
  it.each(["ko", "zh", "de"] as const)(
    "%s: 新規キーの値が ja.json とバイト完全一致していない (翻訳漏れ・コピペ検出)",
    (locale) => {
      for (const key of NEW_KEYS) {
        const jaValue = getByPath(jaMessages, key);
        const localeValue = getByPath(LOCALE_MESSAGES[locale], key);
        if (jaValue === undefined || localeValue === undefined) continue; // 存在確認は別テストが担当
        expect(
          localeValue,
          `${locale}.json の "${key}" が ja.json と完全一致している (未翻訳のままコピペされた疑い)`,
        ).not.toBe(jaValue);
      }
    },
  );
});
