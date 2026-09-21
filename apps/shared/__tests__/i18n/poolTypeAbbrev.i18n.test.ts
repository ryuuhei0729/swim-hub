// =============================================================================
// poolTypeAbbrev.i18n.test.ts — 水路トグル略称キーの5ロケール網羅 (QA Phase A)
// =============================================================================
//
// Sprint Contract (スマホ幅 Web UI 改善) の Deliverable:
//   apps/shared/messages/{ja,en,ko,zh,de}.json に
//   forms.competition.pool_short_abbrev / pool_long_abbrev を追加する。
//   CompetitionTabModal:1179 の水路トグルが sm 未満でこの略称を表示する。
//
// なぜ messages-coverage.test.ts だけでは足りないか:
//   messages-coverage は「ja と他ロケールのキー構造が一致すること」を見る。
//   5ロケール全部に入れ忘れればそこで落ちるが、
//     (a) 「どの値であるべきか」(PM 裁定: Short/Long 系。SC/LC は使わない)
//     (b) 「既存の pool_short / pool_long を書き換えていないこと」
//     (c) 「mobile が読む competition.form.poolTypeShort を巻き込んでいないこと」
//   は検出できない。(b)(c) は略称化のついでに既存キーを短くしてしまう事故が
//   起きやすい箇所で、web の <select><option> (CompetitionBasicForm:481) と
//   mobile 画面が同時に静かに壊れる。よってここで値そのものを pin する。
//
// pin の方針:
//   既存キー (b)(c) は「現在値との完全一致」で pin する (回帰検出が目的)。
//   新規キー (a) は「Contract の表と完全一致」で pin する (PM 裁定が目的)。
//   どちらも実装を読んで書いたのではなく Contract / 変更前の実測値から書いている。

import { describe, expect, it } from "vitest";

import jaMessages from "../../messages/ja.json";
import enMessages from "../../messages/en.json";
import koMessages from "../../messages/ko.json";
import zhMessages from "../../messages/zh.json";
import deMessages from "../../messages/de.json";

const LOCALES = ["ja", "en", "ko", "zh", "de"] as const;
type Locale = (typeof LOCALES)[number];

const MESSAGES: Record<Locale, Record<string, unknown>> = {
  ja: jaMessages as unknown as Record<string, unknown>,
  en: enMessages as unknown as Record<string, unknown>,
  ko: koMessages as unknown as Record<string, unknown>,
  zh: zhMessages as unknown as Record<string, unknown>,
  de: deMessages as unknown as Record<string, unknown>,
};

function getByPath(obj: Record<string, unknown>, dotted: string): unknown {
  let cur: unknown = obj;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

// Sprint Contract の表 (PM 裁定 4: Short/Long 系を採用し SC/LC は使わない)
const EXPECTED_ABBREV: Record<Locale, { short: string; long: string }> = {
  ja: { short: "短水", long: "長水" },
  en: { short: "Short", long: "Long" },
  ko: { short: "단수로", long: "장수로" },
  zh: { short: "短池", long: "长池" },
  de: { short: "Kurz", long: "Lang" },
};

// 変更前 (2026-09-21 QA 実測) の値。略称化に巻き込まれて書き換わっていないことを見る。
const FROZEN_FULL_LABELS: Record<Locale, { short: string; long: string }> = {
  ja: { short: "短水路 (25m)", long: "長水路 (50m)" },
  en: { short: "Short Course (25m)", long: "Long Course (50m)" },
  ko: { short: "단수로 (25m)", long: "장수로 (50m)" },
  zh: { short: "短池 (25m)", long: "长池 (50m)" },
  de: { short: "Kurzbahn (25m)", long: "Langbahn (50m)" },
};

/**
 * mobile (apps/mobile) が読む `competition.form.poolTypeShort/Long` の凍結値。
 *
 * 現時点では FROZEN_FULL_LABELS と 10 エントリすべて同値だが、**意図的に別の表として持つ**。
 * この 2 つは別 namespace の別キーであり、片方だけが変更される事故
 * (web の表記だけ変えて mobile を置き去りにする / その逆) を検出するのが目的だから。
 * 共通化すると「両方を同時に書き換える」変更が素通りしてしまい、
 * [I-03] と [I-04] を分けている意味が消える。
 * CLAUDE.md の「同一のドメイン対応表を2箇所にハードコードするな」は
 * 「片方だけ更新されて静かに壊れる」ことを防ぐ規約であり、ここは
 * **まさにその乖離を検出するための対照表**なので導出させない。
 */
const FROZEN_MOBILE_LABELS: Record<Locale, { short: string; long: string }> = {
  ja: { short: "短水路 (25m)", long: "長水路 (50m)" },
  en: { short: "Short Course (25m)", long: "Long Course (50m)" },
  ko: { short: "단수로 (25m)", long: "장수로 (50m)" },
  zh: { short: "短池 (25m)", long: "长池 (50m)" },
  de: { short: "Kurzbahn (25m)", long: "Langbahn (50m)" },
};

describe("forms.competition 水路ラベル i18n", () => {
  describe("[I-01] 新規: pool_short_abbrev / pool_long_abbrev が5ロケールすべてに存在する", () => {
    it.each(LOCALES)("%s に pool_short_abbrev がある", (locale) => {
      const value = getByPath(MESSAGES[locale], "forms.competition.pool_short_abbrev");
      expect(typeof value, `${locale}.json の forms.competition.pool_short_abbrev が無い`).toBe(
        "string",
      );
      expect(value).not.toBe("");
    });

    it.each(LOCALES)("%s に pool_long_abbrev がある", (locale) => {
      const value = getByPath(MESSAGES[locale], "forms.competition.pool_long_abbrev");
      expect(typeof value, `${locale}.json の forms.competition.pool_long_abbrev が無い`).toBe(
        "string",
      );
      expect(value).not.toBe("");
    });
  });

  describe("[I-02] 新規キーの値が Sprint Contract の表と一致する", () => {
    it.each(LOCALES)("%s の略称が Contract の表どおり", (locale) => {
      expect(getByPath(MESSAGES[locale], "forms.competition.pool_short_abbrev")).toBe(
        EXPECTED_ABBREV[locale].short,
      );
      expect(getByPath(MESSAGES[locale], "forms.competition.pool_long_abbrev")).toBe(
        EXPECTED_ABBREV[locale].long,
      );
    });

    // PM 裁定 4 の根拠 (2026-08-31 に LC/SC 表記がユーザー判断で差し戻された) を守る。
    // 表との完全一致だけだと「表の方を SC/LC に書き換える」逃げ道が残るため独立に禁止する。
    it.each(LOCALES)("%s の略称に SC / LC を使っていない", (locale) => {
      const short = String(getByPath(MESSAGES[locale], "forms.competition.pool_short_abbrev"));
      const long = String(getByPath(MESSAGES[locale], "forms.competition.pool_long_abbrev"));
      expect(short).not.toMatch(/\bSC\b/);
      expect(long).not.toMatch(/\bLC\b/);
    });
  });

  describe("[I-03] 回帰: 既存の pool_short / pool_long が変わっていない", () => {
    it.each(LOCALES)("%s の pool_short / pool_long が変更前と同一", (locale) => {
      expect(getByPath(MESSAGES[locale], "forms.competition.pool_short")).toBe(
        FROZEN_FULL_LABELS[locale].short,
      );
      expect(getByPath(MESSAGES[locale], "forms.competition.pool_long")).toBe(
        FROZEN_FULL_LABELS[locale].long,
      );
    });
  });

  describe("[I-04] 回帰: mobile が読む competition.form.poolTypeShort / poolTypeLong が変わっていない", () => {
    it.each(LOCALES)("%s の competition.form.poolType* が変更前と同一", (locale) => {
      expect(getByPath(MESSAGES[locale], "competition.form.poolTypeShort")).toBe(
        FROZEN_MOBILE_LABELS[locale].short,
      );
      expect(getByPath(MESSAGES[locale], "competition.form.poolTypeLong")).toBe(
        FROZEN_MOBILE_LABELS[locale].long,
      );
    });
  });

  describe("[I-05] 略称はフル表記より短い (そもそも略称になっているか)", () => {
    it.each(LOCALES)("%s の略称 < フル表記の文字数", (locale) => {
      const shortAbbrev = String(
        getByPath(MESSAGES[locale], "forms.competition.pool_short_abbrev") ?? "",
      );
      const longAbbrev = String(
        getByPath(MESSAGES[locale], "forms.competition.pool_long_abbrev") ?? "",
      );
      // 比較相手はテスト内の凍結値ではなく **JSON の実値** を読む。
      // 凍結値と比べると「JSON のフル表記を短くする」変更を検出できない
      // ([I-03] が別途捕まえるが、このケース自体が無意味になるのを避ける)。
      const fullShort = String(getByPath(MESSAGES[locale], "forms.competition.pool_short") ?? "");
      const fullLong = String(getByPath(MESSAGES[locale], "forms.competition.pool_long") ?? "");
      // Array.from で文字数 (コードポイント) を数える。length はサロゲートペアで狂う。
      expect(Array.from(shortAbbrev).length).toBeLessThan(Array.from(fullShort).length);
      expect(Array.from(longAbbrev).length).toBeLessThan(Array.from(fullLong).length);
    });
  });
});
