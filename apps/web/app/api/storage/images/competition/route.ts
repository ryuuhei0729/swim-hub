/**
 * 大会記録画像のアップロード/削除 API
 * R2優先、Supabase Storageフォールバック
 *
 * 注意: 圧縮版画像のみ保存（オリジナルは保存しない）
 * DB登録なし - パスはcompetitions.image_pathsで管理
 */
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { isR2Enabled, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { NextRequest, NextResponse } from 'next/server'
import nodePath from 'path'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * POST: 大会画像をアップロード（圧縮版のみ）
 * Body: FormData with file, competitionId
 * Returns: { path: string } - 保存されたパス
 */
export async function POST(request: NextRequest) {
  let r2Key: string | null = null

  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const competitionId = formData.get('competitionId') as string | null

    if (!file || !competitionId) {
      return NextResponse.json({
        error: 'file, competitionId が必要です'
      }, { status: 400 })
    }

    // バリデーション
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG、PNG、WebPのみ対応しています' }, { status: 400 })
    }

    // ファイル名を生成
    const uuid = crypto.randomUUID()
    const fileName = `${uuid}.webp`
    const filePath = `${user.id}/${competitionId}/${fileName}`

    const r2Enabled = isR2Enabled()

    if (r2Enabled) {
      // R2にアップロード
      r2Key = `competition-images/${filePath}`
      const buffer = Buffer.from(await file.arrayBuffer())
      await uploadToR2(buffer, r2Key, 'image/webp')
    } else {
      // Supabase Storageにアップロード
      const supabase = await createAuthenticatedServerClient()
      const { error: uploadError } = await supabase.storage
        .from('competition-images')
        .upload(filePath, file, {
          contentType: 'image/webp',
          upsert: false
        })

      if (uploadError) {
        console.error('Supabase Storageアップロードエラー:', uploadError)
        return NextResponse.json({ error: '画像のアップロードに失敗しました' }, { status: 500 })
      }
    }

    // パスのみ返す（DB登録なし）
    return NextResponse.json({ path: filePath })
  } catch (error) {
    // エラー時のロールバック
    if (r2Key && isR2Enabled()) {
      await deleteFromR2(r2Key).catch(console.error)
    }
    console.error('大会画像アップロードエラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}

/**
 * DELETE: 大会画像を削除
 * Query: path - 削除する画像のパス
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')

    if (!path) {
      return NextResponse.json({ error: 'path が必要です' }, { status: 400 })
    }

    // パストラバーサル攻撃を防ぐための検証
    // 絶対パスやバックスラッシュを拒否
    if (path.startsWith('/') || path.includes('\\')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    // POSIX正規化して'..'セグメントを検出
    const normalizedPath = nodePath.posix.normalize(path)
    if (normalizedPath.includes('..')) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }
    // 最初のセグメントがユーザーIDであることを確認
    const firstSegment = normalizedPath.split('/')[0]
    if (firstSegment !== user.id) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const r2Enabled = isR2Enabled()
    if (r2Enabled) {
      const r2Key = `competition-images/${path}`
      await deleteFromR2(r2Key)
    } else {
      const supabase = await createAuthenticatedServerClient()
      const { error: deleteError } = await supabase.storage
        .from('competition-images')
        .remove([path])

      if (deleteError) {
        console.error('Supabase Storage削除エラー:', deleteError)
        return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('大会画像削除エラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}
