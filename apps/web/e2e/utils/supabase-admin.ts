import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const FALLBACK_SUPABASE_URL = 'http://127.0.0.1:54321'
const CLEANUP_TABLES_IN_ORDER = [
  'team_attendance',
  'records',
  'entries',
  'competitions',
  'practice_logs',
  'practices'
] as const

let cachedAdminClient: SupabaseClient | null = null

/**
 * Supabase 管理者権限を利用するために必須の環境変数が設定されているか検証する
 */
export function ensureSupabaseAdminEnv(): void {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY が未設定です。apps/web/.env.local に service role key を追加してください。'
    )
  }
}

/**
 * Supabase 管理者クライアントを取得する（シングルトン）
 */
export function getSupabaseAdminClient(): SupabaseClient {
  ensureSupabaseAdminEnv()
  if (!cachedAdminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }
  return cachedAdminClient
}

/**
 * 指定したメールアドレスのユーザーIDを取得する（存在しなければエラー）
 */
export async function getUserIdByEmail(email: string): Promise<string> {
  const client = getSupabaseAdminClient()
  let page = 1
  const perPage = 100

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw new Error(`Failed to list users: ${error.message}`)
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id

    if (data.users.length < perPage) break
    page += 1
  }

  throw new Error(`User not found for email: ${email}`)
}

/**
 * 指定ユーザーの関連データを削除する
 */
export async function cleanupUserData(
  userId: string,
  tables: readonly string[] = CLEANUP_TABLES_IN_ORDER
): Promise<void> {
  const client = getSupabaseAdminClient()

  for (const table of tables) {
    const { error } = await client.from(table).delete().eq('user_id', userId)
    if (error && error.code !== 'PGRST116') {
      console.warn(`[SupabaseAdmin] Failed to cleanup ${table}: ${error.message}`)
    }
  }
}

export { CLEANUP_TABLES_IN_ORDER }

