/**
 * 期限切れ目標・マイルストーンの振り返りを「ログインしてから1回だけ」確認するためのフラグ。
 *
 * DashboardClient の中 (useRef) に持つと、ページを移って /dashboard に戻るたびに作り直され、
 * そのたびに判定が走ってスキップした振り返りがまた出てしまう。ページの外 (モジュール) に持つことで、
 * ページを再読み込みするか、ログインし直すまでは再確認しない (mobile の useExpiredGoalCheck が
 * アプリの起動中1回だけ確認するのと同じ扱い)。
 *
 * キーは「ユーザー ID + 最終ログイン日時」。ログアウトして別のユーザーや同じユーザーで
 * ログインし直したときは別のキーになり、もう一度確認する。
 */

let checkedSessionKey: string | null = null;

export function expiredGoalCheckSessionKey(userId: string, lastSignInAt?: string | null): string {
  return `${userId}:${lastSignInAt ?? ""}`;
}

export function hasCheckedExpiredGoals(sessionKey: string): boolean {
  return checkedSessionKey === sessionKey;
}

export function markExpiredGoalsChecked(sessionKey: string): void {
  checkedSessionKey = sessionKey;
}

/** 確認が終わる前にページを離れたときに戻す (次に開いたときにもう一度確認する) */
export function unmarkExpiredGoalsChecked(sessionKey: string): void {
  if (checkedSessionKey === sessionKey) checkedSessionKey = null;
}

/** テスト用: フラグを消す */
export function resetExpiredGoalCheckSession(): void {
  checkedSessionKey = null;
}
