import * as WebBrowser from "expo-web-browser";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { claimOAuthCode } from "./claimOAuthCode";
import { extractTokensFromUrl, type ExtractedTokens } from "./extractTokensFromUrl";
import { getRedirectUri } from "./getRedirectUri";

/**
 * signInWithGoogle は素の async 関数であり、React フックではない。
 *
 * - loading 状態管理・エラーメッセージの i18n ローカライズはアプリ固有の関心事
 *   であり、このパッケージには持ち込まない (呼び出し側の UI 層の責務)。
 * - `use` 接頭辞は React の Hooks ルール上の誤解を招くため付けない。
 * - React Native の描画環境なしにテストが完結する。
 *
 * `WebBrowser.maybeCompleteAuthSession()` はここでは呼ばない (各アプリの起動時に
 * 1回呼ぶ既存の責務分担のまま)。
 *
 * 核心的価値: PKCE の認可コード (tokens.code) を受け取った経路は必ず
 * claimOAuthCode を通す。同じコールバック URL が warm path (このスコープ) と
 * 各アプリのグローバル Linking ハンドラの安全網の両方に届いても、
 * exchangeCodeForSession は一度しか実行されない。
 *
 * 例外安全性の契約: この関数自体は決して reject しない。signInWithOAuth /
 * openAuthSessionAsync / exchangeCodeForSession / setSession / onExchangeResult
 * のどれで例外が発生しても、関数全体を囲む try/catch が必ず {success:false, error}
 * に変換して解決する (個々の呼び出しを1つずつ try/catch で塞ぐのではなく、関数
 * 本体全体を1つの try で包むことで、将来ここに処理を追加しても同じ保証が自動的に
 * 及ぶようにしている)。
 *
 * 唯一の例外は claimOAuthCode 経由で claim した後の exchangeCodeForSession で、
 * ここだけは専用の try/catch を持つ。交換結果 (成功/失敗/例外) が確定し次第
 * outcome.resolve を呼ぶ責任があり (claimOAuthCode.ts の契約)、これを呼び忘れると
 * 同じ code の結果を待つ負けた側が永久にハングするため、外側の catch に処理を
 * 委ねる前に必ずここで resolve してから return する。
 */
export interface GoogleAuthExchangeContext {
  method: "code" | "implicit";
  session: Session;
  tokens: ExtractedTokens;
}

export type OnExchangeResult = (
  context: GoogleAuthExchangeContext,
) => Promise<{ success: boolean; error?: Error } | void> | { success: boolean; error?: Error } | void;

export interface SignInWithGoogleConfig {
  supabase: SupabaseClient;
  /** カスタムスキーム (例: "swimhub" / "swimhub-scanner" / "swimhubtimer") */
  scheme: string;
  /** "openid email profile" に追加結合するスコープ (例: カレンダー連携) */
  additionalScopes?: string[];
  queryParams?: Record<string, string>;
  browserOptions?: WebBrowser.AuthSessionOpenOptions;
  /**
   * 実際にセッションを確立した側 (claimOAuthCode に勝った側、または implicit
   * フォールバック側) でのみ呼ばれる後処理フック。provider_refresh_token の保存
   * など、アプリ固有の追加処理をここで行う。戻り値で最終結果を上書きできる。
   */
  onExchangeResult?: OnExchangeResult;
}

export interface SignInWithGoogleResult {
  success: boolean;
  error?: Error | null;
}

const toError = (thrown: unknown): Error => (thrown instanceof Error ? thrown : new Error(String(thrown)));

/**
 * onExchangeResult フックを安全に呼び出す。フックが同期的に throw した場合・
 * 返した Promise が reject した場合のいずれも、例外を signInWithGoogle の外へ
 * 伝播させず {success:false, error} に変換する。
 *
 * 呼び出し時点で claimOAuthCode の outcome (交換自体の成否) は既に確定・
 * resolve 済みのため、ここでは outcome には触れない — フックの成否と交換自体の
 * 成否は別の関心事であり、フックが失敗したからといって、同じ code を待つ負けた側
 * への通知結果 (交換は実際には成功した、という事実) を書き換えたりはしない。
 */
async function callOnExchangeResult(
  onExchangeResult: OnExchangeResult | undefined,
  context: GoogleAuthExchangeContext,
): Promise<SignInWithGoogleResult> {
  try {
    const hookResult = await onExchangeResult?.(context);
    if (hookResult && hookResult.success === false) {
      return { success: false, error: hookResult.error };
    }
    return { success: true };
  } catch (hookException) {
    return { success: false, error: toError(hookException) };
  }
}

export async function signInWithGoogle(config: SignInWithGoogleConfig): Promise<SignInWithGoogleResult> {
  try {
    const redirectUri = getRedirectUri(config.scheme);
    const scopes = ["openid", "email", "profile", ...(config.additionalScopes ?? [])].join(" ");

    const { data, error: oauthError } = await config.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUri,
        scopes,
        skipBrowserRedirect: true,
        queryParams: config.queryParams,
      },
    });

    if (oauthError || !data.url) {
      return { success: false, error: oauthError ?? new Error("url_not_received") };
    }

    const browserResult = await WebBrowser.openAuthSessionAsync(data.url, redirectUri, config.browserOptions);

    if (browserResult.type !== "success" || !browserResult.url) {
      const message =
        browserResult.type === "cancel"
          ? "auth_cancelled"
          : browserResult.type === "dismiss"
            ? "auth_dismissed"
            : "auth_failed";
      return { success: false, error: new Error(message) };
    }

    // どのアプリでも動く汎用関数のため、呼び出し側がフィールドを使うかどうかに
    // 関わらず常に全フィールドを抽出しておく (includeProviderTokens/includeRecoveryType
    // を常時有効化)。
    const tokens = extractTokensFromUrl(browserResult.url, {
      includeProviderTokens: true,
      includeRecoveryType: true,
    });

    if (tokens.error) {
      return { success: false, error: new Error(tokens.error) };
    }

    if (tokens.code) {
      const outcome = claimOAuthCode(tokens.code);

      if (!outcome.claimed) {
        // 既に他所 (この呼び出し以前の signInWithGoogle 呼び出し、または各アプリの
        // グローバル Linking ハンドラ) がこの code を claim 済み。無条件で成功扱い
        // にはせず、実際の交換結果を待って同期する。
        const otherResult = await outcome.result;
        if (!otherResult.success) {
          return { success: false, error: new Error("code_exchange_failed") };
        }
        // セッション情報はここでは得られないため、onExchangeResult は呼ばない
        // (後処理は実際に claim して交換した側だけが行う)。
        return { success: true };
      }

      // claim に勝った側はここから先、交換結果が確定し次第 (成功・失敗・例外の
      // いずれでも) 必ず outcome.resolve を呼ぶ。呼び忘れると、同じ code の
      // result を待つ負けた側が永久にハングする (この関数を包む外側の catch に
      // 処理を委ねるだけでは outcome.resolve が呼ばれないため、ここだけは専用の
      // try/catch が必要)。
      try {
        const { data: exchangeData, error: exchangeError } = await config.supabase.auth.exchangeCodeForSession(
          tokens.code,
        );

        if (exchangeError || !exchangeData.session) {
          outcome.resolve({ success: false });
          return { success: false, error: exchangeError ?? new Error("session_not_received") };
        }

        outcome.resolve({ success: true });

        return await callOnExchangeResult(config.onExchangeResult, {
          method: "code",
          session: exchangeData.session,
          tokens,
        });
      } catch (exchangeException) {
        outcome.resolve({ success: false });
        return { success: false, error: toError(exchangeException) };
      }
    }

    // フォールバック: implicit フロー (#access_token=...) で返ってきた場合
    if (tokens.accessToken && tokens.refreshToken) {
      const { data: sessionData, error: sessionError } = await config.supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });

      if (sessionError || !sessionData.session) {
        return { success: false, error: sessionError ?? new Error("session_not_received") };
      }

      return await callOnExchangeResult(config.onExchangeResult, {
        method: "implicit",
        session: sessionData.session,
        tokens,
      });
    }

    return { success: false, error: new Error("tokens_not_received") };
  } catch (unexpectedException) {
    // signInWithOAuth・openAuthSessionAsync・setSession など、専用の try/catch を
    // 持たない呼び出しが reject/throw した場合の最終防衛線。exchangeCodeForSession
    // 経路の例外は上の内側 try/catch で先に捕捉され outcome.resolve 済みなので、
    // ここには到達しない。
    return { success: false, error: toError(unexpectedException) };
  }
}
