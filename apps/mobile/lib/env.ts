/**
 * 環境変数の統一アクセスヘルパー
 *
 * Expo SDK 49+ では Metro が EXPO_PUBLIC_* をビルド時にインライン展開するため、
 * process.env.EXPO_PUBLIC_* だけで EAS クラウド / ローカル両方で動作する。
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "",
  webApiUrl: process.env.EXPO_PUBLIC_WEB_API_URL || "https://swim-hub.app",
  r2PublicUrl: process.env.EXPO_PUBLIC_R2_PUBLIC_URL ?? "",
  revenuecatIosApiKey: process.env.EXPO_PUBLIC_REVENUCAT_IOS_API_KEY ?? "",
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT || "development",
  webAppResetPasswordUrl: process.env.EXPO_PUBLIC_WEB_APP_RESET_PASSWORD_URL || "https://swim-hub.app/reset-password",
} as const;
