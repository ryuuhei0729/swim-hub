// lib/supabase-auth/authApple.ts
"use server";

import { createClient } from "@/lib/supabase-auth/server";
import { redirect } from "next/navigation";
import { getCurrentEnvConfig } from "@/lib/env";

// ---------------------------------------------
// Appleログイン
// ---------------------------------------------
export async function signInWithApple() {
    // クライアントを作成
    const supabase = await createClient();

    // アプリケーションのURLを取得（OAuthコールバック用）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || getCurrentEnvConfig().appUrl;
    const redirectTo = `${appUrl}/api/auth/callback`;

    const { data: { url }, error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
            redirectTo,
        },
    });
    if (error) console.error('Appleログインエラー:', error.message)
    if (!error && url) redirect(url);
}
