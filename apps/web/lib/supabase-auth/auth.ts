// lib/supabase-auth/auth.ts

import { redirect } from 'next/navigation'
import { cache } from 'react'
import { createClient } from './server'

// ---------------------------------------------
// 管理者として許可するメールアドレスのリスト
// ---------------------------------------------
export const adminUsers = [
    "ryuuhei.hosoi@gmail.com",
];

// ---------------------------------------------
// 認証チェック
// ---------------------------------------------
const validateAuthWithRedirect = async () => {
    /* 未認証であればredirect、 認証できればユーザー情報を返す */
    // ユーザーを取得
    const supabase = await createClient();
    const { data: { user }} = await supabase.auth.getUser();
    // 認証失敗: ユーザーが存在しない場合 / 権限がない場合
    if (!user || !user.email || !adminUsers.includes(user.email)) {
        redirect("/login");
    };
    return user;
};

// 認証チェックをキャッシュ
export const cachedValidateAuthWithRedirect = cache(validateAuthWithRedirect);
