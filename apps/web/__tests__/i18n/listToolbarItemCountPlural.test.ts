/**
 * common.listToolbar.itemCount の単数・複数 (web = next-intl)
 *
 * 「1 Einträge」「1 items」のように、1 件でも複数形になっていた (Agent testers の lena で検出)。
 * web の next-intl は base の itemCount を ICU plural として解釈する
 * (itemCount_one / itemCount_other は mobile の i18next 用)。
 */
import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import ja from "@apps/shared/messages/ja.json";
import en from "@apps/shared/messages/en.json";
import de from "@apps/shared/messages/de.json";
import zh from "@apps/shared/messages/zh.json";
import ko from "@apps/shared/messages/ko.json";

const MESSAGES = { ja, en, de, zh, ko } as const;

describe("common.listToolbar.itemCount (next-intl)", () => {
  it.each([
    ["de", 1, "1 Eintrag"],
    ["de", 2, "2 Einträge"],
    ["de", 0, "0 Einträge"],
    ["en", 1, "1 item"],
    ["en", 3, "3 items"],
    ["ja", 1, "1件"],
    ["zh", 1, "1条"],
    ["ko", 1, "1건"],
  ] as const)("%s / count=%i → %s", (locale, count, expected) => {
    const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "common" });
    expect(t("listToolbar.itemCount", { count })).toBe(expected);
  });
});
