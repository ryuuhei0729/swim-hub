import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { env } from "@/lib/env";

const supabaseUrl = env.supabaseUrl;
const supabaseAnonKey = env.supabaseAnonKey;

if (__DEV__) {
  console.log("Supabase環境変数の確認:");
  console.log("supabaseUrl:", supabaseUrl ? `${supabaseUrl.substring(0, 50)}...` : "未設定");
  console.log("supabaseAnonKey:", supabaseAnonKey ? "設定済み" : "未設定");
}

// 環境変数の検証（エラーをthrowせず、nullを返す）
let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    // React Native用Supabaseクライアント
    // AsyncStorageでセッションを永続化（タスクキル後もログイン状態を維持）
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.error("Supabaseクライアントの初期化に失敗しました:", error);
  }
} else {
  console.error(
    "Supabase環境変数が設定されていません。\n" +
      "EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。\n" +
      `現在の設定状態:\n` +
      `EXPO_PUBLIC_SUPABASE_URL: ${supabaseUrl ? "set" : "unset"}\n` +
      `EXPO_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? "set" : "unset"}`,
  );
}

// バックグラウンド復帰時にトークン自動リフレッシュを再開する
// Supabase公式推奨パターン: https://supabase.com/docs/reference/javascript/auth-startautorefresh
if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase!.auth.startAutoRefresh();
    } else {
      supabase!.auth.stopAutoRefresh();
    }
  });
}

export { supabase };
