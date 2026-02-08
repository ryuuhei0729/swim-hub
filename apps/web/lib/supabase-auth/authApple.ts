// lib/supabase-auth/authApple.ts
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentEnvConfig } from "@/lib/env";

// ---------------------------------------------
// Appleログイン（直接Apple Authorization URLにリダイレクト）
// Supabase.coドメインがAppleに拒否されるため、独自のコールバックを使用
// ---------------------------------------------

// Cookie名定数
const APPLE_AUTH_NONCE_COOKIE = 'apple_auth_nonce';

/**
 * Apple Sign In for Web
 *
 * フロー:
 * 1. ユーザーがAppleボタンをクリック
 * 2. Apple Authorization URLにリダイレクト
 * 3. Appleがid_tokenを含むPOSTを/api/auth/callbackに送信
 * 4. コールバックがsignInWithIdTokenでセッション確立
 */
export async function signInWithApple() {
  try {
    // Apple Services ID（Apple Developer Consoleで作成）
    // 環境変数が設定されていない場合は即座にエラーをスロー
    const clientId = process.env.APPLE_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        'APPLE_CLIENT_ID environment variable is not set. ' +
        'Apple Sign In cannot proceed without a valid client ID. ' +
        'Please configure APPLE_CLIENT_ID in your environment variables.'
      );
    }

    // アプリケーションのURLを取得
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || getCurrentEnvConfig().appUrl;
    // 統一コールバックエンドポイントを使用
    const redirectUri = `${appUrl}/api/auth/callback`;

    // セキュアなnonceを生成（crypto.randomUUID()を使用）
    const nonce = crypto.randomUUID();

    // nonceをサーバーサイドのセキュアCookieに保存
    const cookieStore = await cookies();
    cookieStore.set(APPLE_AUTH_NONCE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10分間有効
      path: '/',
    });

    // stateパラメータにnonceを含める（CSRFトークンとして使用）
    const state = nonce;

    // Apple Authorization URLを構築
    const authUrl = new URL('https://appleid.apple.com/auth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code id_token');
    authUrl.searchParams.set('response_mode', 'form_post');
    authUrl.searchParams.set('scope', 'name email');
    authUrl.searchParams.set('state', state);

    redirect(authUrl.toString());
  } catch (error) {
    // Next.js redirect() throws a special error internally - rethrow it immediately
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as Record<string, unknown>).digest === 'string' &&
      ((error as Record<string, unknown>).digest as string).startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }

    // Log the full error object for debugging
    console.error('Error in signInWithApple:', error);

    // Rethrow so callers can detect failures
    throw error;
  }
}
