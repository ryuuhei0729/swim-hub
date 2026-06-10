// =============================================================================
// react-i18next 型補完 - モバイルアプリ
// =============================================================================
// ja.json をデフォルトリソース型として登録し、t("common.save") 等のキーを
// コンパイル時に型補完・型検査する。

import "react-i18next";
import type ja from "@apps/shared/messages/ja.json";

declare module "react-i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof ja;
    };
  }
}
