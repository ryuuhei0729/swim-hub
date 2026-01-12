// lib/supabase-auth/authGoogle.ts
"use server";

import { createClient } from "@/lib/supabase-auth/server";
import { redirect } from "next/navigation";
import { getCurrentEnvConfig } from "@/lib/env";

// ---------------------------------------------
// Googleログイン
// ---------------------------------------------
export async function signInWithGoogle() {
    // クライアントを作成
    const supabase = await createClient();
    
    // アプリケーションのURLを取得（OAuthコールバック用）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || getCurrentEnvConfig().appUrl;
    const redirectTo = `${appUrl}/api/auth/callback`;
    
    const { data: { url }, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
            redirectTo,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
            scopes: 'https://www.googleapis.com/auth/calendar',
        },
    });
    if (error) console.error('Googleログインエラー:', error.message)
    if (!error && url) redirect(url);
}

// ---------------------------------------------
// Googleログアウト
// ---------------------------------------------
export async function signOut() {
    // クライアントを作成
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Googleログアウトエラー:', error.message)
    if (!error) return true;
    return false;
}
