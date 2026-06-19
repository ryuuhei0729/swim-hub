/**
 * Expo設定ファイル（動的）
 *
 * SDK 49+ では EXPO_PUBLIC_* は Metro がインライン展開するため、
 * extra への環境変数マッピングは不要。extra は EAS projectId 等の
 * ビルドメタデータのみを保持する。
 *
 * versionName（表示バージョン）はプラットフォームで分岐する。
 * expo.version は iOS/Android 共有のため、Android だけ別バージョンにするには
 * ここで上書きする必要がある。
 *   - iOS:     app.json の version（本番リリース中。維持する）
 *   - Android: 新規 Play ストアリリースのため 1.0.0 から開始
 * versionCode / buildNumber は eas.json の appVersionSource: "remote" +
 * autoIncrement で EAS が管理するため、ここでは扱わない。
 */

const ANDROID_VERSION = "1.0.0";

module.exports = ({ config }) => {
  const isAndroid = process.env.EAS_BUILD_PLATFORM === "android";
  return {
    ...config,
    version: isAndroid ? ANDROID_VERSION : config.version,
    extra: {
      ...config.extra,
      eas: {
        projectId: "fb40c5df-d4ba-4bb6-adea-41d49d34a6be",
      },
    },
  };
};
