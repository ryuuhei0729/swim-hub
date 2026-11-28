// =============================================================================
// 保護者アカウントかどうかの端末内キャッシュ
// =============================================================================
//
// 保護者アカウント (team_memberships.role = guardian) はログイン後に保護者版の画面へ
// 切り替える。判定は is_guardian_account RPC で行うが、圏外で起動すると問い合わせが
// 失敗し、保護者に通常版の画面を出してしまう。最後にサーバーで確認できた値を端末に
// 覚えておき、通信できないときはそれを使う (onboardingCache と同じ方針)。
// 書き込みは DB 側で拒否されるので、ここはあくまで画面の出し分けのための値。

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "is-guardian:";

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** 覚えている値を返す。未保存・読み込み失敗のときは null */
export async function loadCachedIsGuardian(userId: string): Promise<boolean | null> {
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
export async function saveCachedIsGuardian(userId: string, isGuardian: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), isGuardian ? "1" : "0");
  } catch {
    // 無視
  }
}
