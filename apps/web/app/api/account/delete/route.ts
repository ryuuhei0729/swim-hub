import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { isR2Enabled, listR2Objects, deleteMultipleFromR2 } from '@/lib/r2'

const STORAGE_PREFIXES = [
  'profile-images',
  'practice-images',
  'competition-images',
] as const

/**
 * Bearer tokenからユーザーを認証
 */
async function authenticateUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const accessToken = authHeader.substring(7)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase環境変数が設定されていません')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  if (error || !user) return null
  return user
}

/**
 * ユーザーのストレージファイルを削除（best-effort）
 */
async function deleteUserStorage(userId: string) {
  const errors: string[] = []

  if (isR2Enabled()) {
    for (const prefix of STORAGE_PREFIXES) {
      try {
        const keys = await listR2Objects(`${prefix}/${userId}/`)
        if (keys.length > 0) {
          await deleteMultipleFromR2(keys)
        }
      } catch (error) {
        errors.push(`R2 ${prefix}: ${error}`)
      }
    }
  } else {
    const adminClient = createAdminClient()
    for (const bucket of STORAGE_PREFIXES) {
      try {
        const { data: files } = await adminClient.storage
          .from(bucket)
          .list(userId)
        if (files && files.length > 0) {
          const filePaths = files.map(f => `${userId}/${f.name}`)
          await adminClient.storage.from(bucket).remove(filePaths)
        }
      } catch (error) {
        errors.push(`Storage ${bucket}: ${error}`)
      }
    }
  }

  return errors
}

/**
 * DELETE /api/account/delete
 * アカウント削除API
 *
 * 削除フロー:
 * 1. 個人データ（team_id IS NULL の練習・大会）を手動削除
 * 2. ストレージファイルを削除
 * 3. auth userを削除（CASCADE + SET NULLで残りを処理）
 */
export async function DELETE(request: NextRequest) {
  try {
    // 認証
    const user = await authenticateUser(request)
    if (!user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const userId = user.id
    const adminClient = createAdminClient()

    // 個人の練習・大会を手動削除（team_id IS NULLのもの）
    // チームの練習・大会はSET NULLで保持される（マイグレーション済み）
    const { error: practiceDeleteError } = await adminClient
      .from('practices')
      .delete()
      .eq('user_id', userId)
      .is('team_id', null)

    if (practiceDeleteError) {
      console.error('個人練習の削除エラー:', practiceDeleteError)
    }

    const { error: competitionDeleteError } = await adminClient
      .from('competitions')
      .delete()
      .eq('user_id', userId)
      .is('team_id', null)

    if (competitionDeleteError) {
      console.error('個人大会の削除エラー:', competitionDeleteError)
    }

    // ストレージファイル削除（best-effort）
    const storageErrors = await deleteUserStorage(userId)
    if (storageErrors.length > 0) {
      console.warn('ストレージ削除の警告:', storageErrors)
    }

    // auth user削除（CASCADE + SET NULLで残りを処理）
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Auth user削除エラー:', deleteError)
      return NextResponse.json(
        { error: 'アカウントの削除に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('アカウント削除エラー:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
