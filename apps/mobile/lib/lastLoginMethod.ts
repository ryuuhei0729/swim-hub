// =============================================================================
// 直近で利用したログイン手法の端末内記録
// =============================================================================
//
// ログイン画面で「直近で利用」ラベルを出すため、最後に成功したログイン手法を
// 端末に覚えておく。ログアウトしても消さない（次回ログイン時に表示するのが目的）。
// 機微な情報ではないため AsyncStorage (平文) に置く。

import AsyncStorage from "@react-native-async-storage/async-storage";

export type LoginMethod = "apple" | "google" | "email";

const STORAGE_KEY = "last-login-method";

const LOGIN_METHODS: readonly LoginMethod[] = ["apple", "google", "email"];

function isLoginMethod(value: unknown): value is LoginMethod {
  return typeof value === "string" && (LOGIN_METHODS as readonly string[]).includes(value);
}

/** 覚えている手法を返す。未保存・読み込み失敗のときは null */
export async function loadLastLoginMethod(): Promise<LoginMethod | null> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    return isLoginMethod(value) ? value : null;
  } catch {
    return null;
  }
}

/** ログイン成功時に呼ぶ。失敗してもラベルが出ないだけなので無視する */
export async function saveLastLoginMethod(method: LoginMethod): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, method);
  } catch {
    // 無視
  }
}
