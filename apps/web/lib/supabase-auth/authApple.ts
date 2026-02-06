// lib/supabase-auth/authApple.ts
"use server";

import { redirect } from "next/navigation";
import { getCurrentEnvConfig } from "@/lib/env";

// ---------------------------------------------
// Appleログイン（直接Apple Authorization URLにリダイレクト）
// Supabase.coドメインがAppleに拒否されるため、独自のコールバックを使用
// ---------------------------------------------

/**
 * Apple Sign In for Web
 *
 * フロー:
 * 1. ユーザーがAppleボタンをクリック
 * 2. Apple Authorization URLにリダイレクト
 * 3. Appleがid_tokenを含むPOSTを/api/auth/apple-callbackに送信
 * 4. コールバックがsignInWithIdTokenでセッション確立
 */
export async function signInWithApple() {
  // Apple Services ID（Apple Developer Consoleで作成）
  const clientId = process.env.APPLE_CLIENT_ID || 'app.swimhub.web';

  // アプリケーションのURLを取得
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || getCurrentEnvConfig().appUrl;
  const redirectUri = `${appUrl}/api/auth/apple-callback`;

  // stateパラメータ（CSRF保護とリダイレクト先の保存）
  const state = JSON.stringify({
    redirectTo: '/dashboard',
    nonce: Math.random().toString(36).substring(2),
  });

  // Apple Authorization URLを構築
  const authUrl = new URL('https://appleid.apple.com/auth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code id_token');
  authUrl.searchParams.set('response_mode', 'form_post');
  authUrl.searchParams.set('scope', 'name email');
  authUrl.searchParams.set('state', state);

  redirect(authUrl.toString());
}
