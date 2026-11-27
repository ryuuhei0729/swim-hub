/**
 * common.listToolbar.itemCount の単数・複数 (mobile = i18next)
 *
 * 「1 Einträge」「1 items」のように、1 件でも複数形になっていた (Agent testers の lena で検出)。
 * mobile の i18next は count を渡すと itemCount_one / itemCount_other を優先して引く
 * (base の itemCount は web の next-intl 用の ICU plural)。
 *
 * vitest.setup.ts は i18next を ja 固定の簡易モックに差し替えているため、ここでは
 * 本物の i18next を importActual し、apps/mobile/i18n/index.ts と同じ設定で初期化する。
 */
import { describe, it, expect, vi } from "vitest";
import ja from "../../../../packages/shared/messages/ja.json";
import en from "../../../../packages/shared/messages/en.json";
import de from "../../../../packages/shared/messages/de.json";
import zh from "../../../../packages/shared/messages/zh.json";
import ko from "../../../../packages/shared/messages/ko.json";

async function createT(lng: string) {
  const { default: i18next } = await vi.importActual<typeof import("i18next")>("i18next");
  const instance = i18next.createInstance();
  await instance.init({
    resources: {
      ja: { translation: ja },
      en: { translation: en },
      de: { translation: de },
      zh: { translation: zh },
      ko: { translation: ko },
    },
    lng,
    fallbackLng: "ja",
    compatibilityJSON: "v4",
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
    returnNull: false,
  });
  return (count: number) => instance.t("common.listToolbar.itemCount", { count });
}

describe("common.listToolbar.itemCount (i18next)", () => {
  it.each([
    ["de", 1, "1 Eintrag"],
    ["de", 2, "2 Einträge"],
    ["de", 0, "0 Einträge"],
    ["en", 1, "1 item"],
    ["en", 3, "3 items"],
    ["ja", 1, "1件"],
    ["zh", 1, "1条"],
    ["ko", 1, "1건"],
  ])("%s / count=%i → %s", async (lng, count, expected) => {
    const t = await createT(lng);
    expect(t(count)).toBe(expected);
  });
});
