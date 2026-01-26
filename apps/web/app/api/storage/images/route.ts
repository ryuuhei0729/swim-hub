/**
 * 練習記録/大会記録画像のアップロード/削除 API
 * R2優先、Supabase Storageフォールバック
 */
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { isR2Enabled, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

type ImageType = 'practices' | 'competitions'

/**
 * POST: 画像をアップロード
 * Body: FormData with file, type, recordId, imageType (original/thumbnail)
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as ImageType | null // practices | competitions
    const recordId = formData.get('recordId') as string | null
    const imageType = formData.get('imageType') as 'original' | 'thumbnail' | null

    if (!file || !type || !recordId || !imageType) {
      return NextResponse.json({
        error: 'file, type, recordId, imageType が必要です'
      }, { status: 400 })
    }

    if (!['practices', 'competitions'].includes(type)) {
      return NextResponse.json({ error: '無効なtype' }, { status: 400 })
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
    const prefix = imageType === 'thumbnail' ? 'thumb' : 'original'
    const fileName = `${prefix}_${uuid}.webp`

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      const key = `${type}/${user.id}/${recordId}/${fileName}`
      const buffer = Buffer.from(await file.arrayBuffer())
      const publicUrl = await uploadToR2(buffer, key, file.type)

      return NextResponse.json({
        url: publicUrl,
        path: `${user.id}/${recordId}/${fileName}`
      })
    }

    // フォールバック: Supabase Storage
    const supabase = await createAuthenticatedServerClient()
    const bucketName = type === 'practices' ? 'practice-images' : 'competition-images'
    const filePath = `${user.id}/${recordId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Supabase Storageアップロードエラー:', uploadError)
      return NextResponse.json({ error: '画像のアップロードに失敗しました' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath)

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filePath
    })
  } catch (error) {
    console.error('画像アップロードエラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}

/**
 * DELETE: 画像を削除
 * Query: type, path
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as ImageType | null
    const path = searchParams.get('path')

    if (!type || !path) {
      return NextResponse.json({ error: 'type と path が必要です' }, { status: 400 })
    }

    if (!['practices', 'competitions'].includes(type)) {
      return NextResponse.json({ error: '無効なtype' }, { status: 400 })
    }

    // パスにユーザーIDが含まれていることを確認（セキュリティ）
    if (!path.startsWith(user.id)) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      const key = `${type}/${path}`
      await deleteFromR2(key)
      return NextResponse.json({ success: true })
    }

    // フォールバック: Supabase Storage
    const supabase = await createAuthenticatedServerClient()
    const bucketName = type === 'practices' ? 'practice-images' : 'competition-images'

    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove([path])

    if (deleteError) {
      console.error('Supabase Storage削除エラー:', deleteError)
      return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('画像削除エラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}
