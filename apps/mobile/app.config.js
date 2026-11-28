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
 *
 * EAS Update の runtimeVersion は表示バージョンと同じ値をプラットフォームごとに直接書く。
 * runtimeVersion: { policy: "appVersion" } だと expo.version から計算されるが、
 * eas update は EAS_BUILD_PLATFORM を設定しないため Android 分も iOS の version になり、
 * Android のビルド (ANDROID_VERSION) と一致せずアップデートが届かない。
 * ネイティブコードや config plugin を変えたリリースでは version を上げること
 * (runtimeVersion が同じ旧バイナリに、合わない JS が配られるのを防ぐ)。
 */

const ANDROID_VERSION = "1.0.0";
const EAS_PROJECT_ID = "fb40c5df-d4ba-4bb6-adea-41d49d34a6be";

module.exports = ({ config }) => {
  const isAndroid = process.env.EAS_BUILD_PLATFORM === "android";
  return {
    ...config,
    version: isAndroid ? ANDROID_VERSION : config.version,
    ios: {
      ...config.ios,
      runtimeVersion: config.version,
    },
    android: {
      ...config.android,
      runtimeVersion: ANDROID_VERSION,
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    extra: {
      ...config.extra,
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
  };
};
