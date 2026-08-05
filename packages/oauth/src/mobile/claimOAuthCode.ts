/**
 * PKCE の認可コードは使い捨てで、同じ `<scheme>://auth/callback?code=...` URL が
 * 複数の独立した経路から届きうる (例: signInWithGoogle の warm path — つまり
 * openAuthSessionAsync の戻り URL から直接読む経路 — と、各アプリ側のグローバル
 * Linking ハンドラの安全網。Android で Custom Tabs 復帰が新規 Intent になった
 * 場合や、ブラウザ表示中にプロセスが kill されコールドスタートした場合に両方から
 * 同じ code が届く)。
 *
 * どちらか一方だけが交換を実行すべきで、後から来た側は「すでに他方が処理した」だけ
 * なのでエラーを出さず何もしないこと。JS はシングルスレッドなので、この判定を
 * `await` を挟まず同期的に行えば競合しない。
 *
 * 負けた側は、勝った側の実際の交換結果 (成功/失敗) を `result` で待てる。
 * これが無いと、勝った側の exchangeCodeForSession が実際には失敗したのに
 * 負けた側が無条件で success 扱いを返してしまう (CodeRabbit 指摘)。
 * 勝った側は交換結果が確定し次第、必ず `resolve` を呼ぶこと (例外時も忘れず呼び、
 * `result` を待つ負けた側が永久に解決しないままにならないようにする)。
 *
 * 保持するコードは直近 MAX_TRACKED_CODES 件のみ (無限にメモリを食わない)。
 *
 * 移植元: swimhub-timer/apps/mobile/lib/google-auth.ts の claimOAuthCode
 * (ロジック変更なし)。
 */
const MAX_TRACKED_CODES = 5;

export interface OAuthCodeExchangeResult {
  success: boolean;
}

interface OAuthCodeClaim {
  resolve: (result: OAuthCodeExchangeResult) => void;
  result: Promise<OAuthCodeExchangeResult>;
}

export type ClaimOAuthCodeOutcome =
  | { claimed: true; resolve: (result: OAuthCodeExchangeResult) => void }
  | { claimed: false; result: Promise<OAuthCodeExchangeResult> };

const claimedOAuthCodes = new Map<string, OAuthCodeClaim>();
const claimedOAuthCodeOrder: string[] = [];

/**
 * 同一 code を最初に処理しようとした呼び出し側だけ `claimed: true` を得て、
 * 交換結果が確定したら `resolve` を呼ぶ責任を負う。2回目以降の呼び出しは
 * `claimed: false` となり、`result` を await すれば勝った側の実際の結果
 * (成功/失敗) を取得できる — エラー表示するかどうかは呼び出し側が判断すること。
 *
 * 必ず `await` の前 (同期的な位置) で呼び出すこと。
 */
export const claimOAuthCode = (code: string): ClaimOAuthCodeOutcome => {
  const existing = claimedOAuthCodes.get(code);
  if (existing) {
    return { claimed: false, result: existing.result };
  }

  let resolve!: (result: OAuthCodeExchangeResult) => void;
  const result = new Promise<OAuthCodeExchangeResult>((res) => {
    resolve = res;
  });
  claimedOAuthCodes.set(code, { resolve, result });
  claimedOAuthCodeOrder.push(code);
  if (claimedOAuthCodeOrder.length > MAX_TRACKED_CODES) {
    const oldest = claimedOAuthCodeOrder.shift();
    if (oldest !== undefined) claimedOAuthCodes.delete(oldest);
  }
  return { claimed: true, resolve };
};
