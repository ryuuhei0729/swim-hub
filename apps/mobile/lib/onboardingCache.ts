// =============================================================================
// オンボーディング完了状態の端末内キャッシュ
// =============================================================================
//
// onboarding_completed は users テーブルにあり、起動のたびにサーバーへ問い合わせている。
// 圏外で起動するとこの問い合わせが失敗し、完了済みの利用者までオンボーディング画面に
// 送られてしまっていた。最後にサーバーで確認できた値を端末に覚えておき、通信できない
// ときはそれを使う。機微な情報ではないため AsyncStorage (平文) に置く。

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "onboarding-completed:";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** 覚えている値を返す。未保存・読み込み失敗のときは null */
export async function loadCachedOnboardingCompleted(
  userId: string,
): Promise<boolean | null> {
  try {
    const value = await AsyncStorage.getItem(keyFor(userId));
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  } catch {
    return null;
  }
}

/** サーバーで確認できた値を覚える。失敗しても次回の起動時に問い合わせ直すだけなので無視する */
export async function saveCachedOnboardingCompleted(
  userId: string,
  completed: boolean,
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), completed ? "1" : "0");
  } catch {
    // 無視
  }
}
