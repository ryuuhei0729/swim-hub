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

/**
 * AsyncStorage をエラーハンドリング付きでラップ。
 * 読み込み失敗・パースエラー・タイムアウト時に null を返して
 * Supabase SDK がハングするのを防ぐ。
 */
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      // 5秒以内に読み込めなければタイムアウト
      const result = await Promise.race([
        AsyncStorage.getItem(key),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
      return result;
    } catch (err) {
      console.error(`AsyncStorage.getItem("${key}") 失敗:`, err);
      // 壊れたデータを削除して次回起動時に問題を回避
      try {
        await AsyncStorage.removeItem(key);
      } catch {
        // 削除も失敗した場合は無視
      }
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (err) {
      console.error(`AsyncStorage.setItem("${key}") 失敗:`, err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.error(`AsyncStorage.removeItem("${key}") 失敗:`, err);
    }
  },
};

// 環境変数の検証（エラーをthrowせず、nullを返す）
let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    // React Native用Supabaseクライアント
    // safeStorage でセッションを永続化（破損時にもハングしない）
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: safeStorage,
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
