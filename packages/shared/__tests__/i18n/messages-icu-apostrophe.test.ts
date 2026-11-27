/**
 * shared/messages の ICU アポストロフィ検出テスト
 *
 * web (next-intl) は ICU MessageFormat で解釈するため、`'` の直後に `{` / `}` があると
 * そこから引用が始まり、プレースホルダーが置換されずに `{name}` のまま表示される。
 * mobile (i18next) は `'` を特別扱いしないので mobile では正しく見え、web だけが壊れる。
 * ko で `'{name}'` と書いた確認ダイアログ6件がこの形で壊れていた (引用符は ‘…’ を使う)。
 */

import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import ko from "../../messages/ko.json";
import zh from "../../messages/zh.json";

const MESSAGES = { ja, en, ko, zh, de } as const;

function collectStrings(node: unknown, prefix: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([prefix, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

describe.each(Object.entries(MESSAGES))("%s.json", (_locale, messages) => {
  it("`'` の直後に `{` / `}` がある値は無い (ICU の引用でプレースホルダーが壊れる)", () => {
    const entries: Array<[string, string]> = [];
    collectStrings(messages, "", entries);
    const broken = entries.filter(([, value]) => /'[{}]/.test(value)).map(([key]) => key);
    expect(broken).toEqual([]);
  });
});
