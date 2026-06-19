const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Android リリースビルド (:app:lintVitalRelease) が ExtraTranslation で失敗するのを防ぐ
 * config plugin。
 *
 * app.json の `locales`(./locales/*.json)は iOS の InfoPlist.strings 用ローカライズだが、
 * Expo prebuild はこれを Android の res/values-b+xx/strings.xml にも
 * CFBundleDisplayName / NSCameraUsageDescription など iOS 専用キーとして生成する。
 * デフォルトロケール (res/values/strings.xml) に同名キーが無いため Android lint が
 * ExtraTranslation を致命的エラーと判定し、リリースビルドが中断する。
 *
 * これらのキーは iOS 専用で Android 実行時には参照されないため、当該 lint チェックのみ
 * 無効化する(他の lint チェックは有効のまま)。android/ は CNG で再生成されるため
 * build.gradle 直編集ではなくこの plugin で適用する。
 */
const LINT_BLOCK = `
    lint {
        disable 'ExtraTranslation'
    }`;

module.exports = function withAndroidLintFix(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `withAndroidLintFix: app/build.gradle は Groovy 前提ですが ${cfg.modResults.language} でした`,
      );
    }

    const contents = cfg.modResults.contents;
    if (contents.includes("disable 'ExtraTranslation'")) {
      return cfg; // 既に適用済み(冪等)
    }

    // 先頭の `android {` ブロック直後に lint 設定を挿入する
    // (行頭インデントや改行差で取りこぼさないよう許容的にマッチする)
    const androidBlock = /^[ \t]*android\s*\{/m;
    if (!androidBlock.test(contents)) {
      throw new Error("withAndroidLintFix: app/build.gradle に android {} ブロックが見つかりません");
    }
    cfg.modResults.contents = contents.replace(androidBlock, (match) => `${match}${LINT_BLOCK}`);
    return cfg;
  });
};
