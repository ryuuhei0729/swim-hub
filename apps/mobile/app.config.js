/**
 * Expo設定ファイル（動的）
 *
 * SDK 49+ では EXPO_PUBLIC_* は Metro がインライン展開するため、
 * extra への環境変数マッピングは不要。extra は EAS projectId 等の
 * ビルドメタデータのみを保持する。
 */

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    eas: {
      projectId: "fb40c5df-d4ba-4bb6-adea-41d49d34a6be",
    },
  },
});
