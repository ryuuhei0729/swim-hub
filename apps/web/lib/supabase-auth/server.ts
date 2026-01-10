"use server";

import { CookieOptions, createServerClient } from '@supabase/ssr'
import type { Database } from '@swim-hub/shared/types/database'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        const missingVars: string[] = []
        if (!supabaseUrl) missingVars.push('NEXT_PUBLIC_SUPABASE_URL')
        if (!supabaseAnonKey) missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

        throw new Error(`Supabase環境変数が設定されていません: ${missingVars.join(', ')}`)
    }

    return createServerClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    try {
                        if (typeof window === 'undefined') {
                            cookieStore.set({ name, value, ...options });
                        }
                    } catch {
                        // Server Component内でのCookie設定エラーを無視
                        // ミドルウェアでCookieが処理される
                    }
                },
                remove(name: string, options: CookieOptions) {
                    try {
                        if (typeof window === 'undefined') {
                            cookieStore.set({ name, value: '', ...options, maxAge: 0 });
                        }
                    } catch {
                        // Server Component内でのCookie削除エラーを無視
                    }
                }
            },
        }
    )
}
