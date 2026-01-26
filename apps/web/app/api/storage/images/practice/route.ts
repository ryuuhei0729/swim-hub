/**
 * 練習記録画像のアップロード/削除 API
 * R2優先、Supabase Storageフォールバック
 * ストレージアップロード + DB登録を一括で行う
 */
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { isR2Enabled, uploadToR2, deleteFromR2 } from '@/lib/r2'
import { NextRequest, NextResponse } from 'next/server'
import type { PracticeImage } from '@swim-hub/shared/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * POST: 練習画像をアップロード（オリジナル + サムネイル）
 * Body: FormData with originalFile, thumbnailFile, practiceId, originalFileName, displayOrder
 */
export async function POST(request: NextRequest) {
  let originalKey: string | null = null
  let thumbnailKey: string | null = null
  let originalPath: string | null = null
  let thumbnailPath: string | null = null
  const supabase = await createAuthenticatedServerClient()

  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const formData = await request.formData()
    const originalFile = formData.get('originalFile') as File | null
    const thumbnailFile = formData.get('thumbnailFile') as File | null
    const practiceId = formData.get('practiceId') as string | null
    const originalFileName = formData.get('originalFileName') as string | null
    const displayOrderStr = formData.get('displayOrder') as string | null

    if (!originalFile || !thumbnailFile || !practiceId || !originalFileName) {
      return NextResponse.json({
        error: 'originalFile, thumbnailFile, practiceId, originalFileName が必要です'
      }, { status: 400 })
    }

    const displayOrder = displayOrderStr ? parseInt(displayOrderStr, 10) : 0

    // バリデーション
    if (originalFile.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(originalFile.type)) {
      return NextResponse.json({ error: 'JPEG、PNG、WebPのみ対応しています' }, { status: 400 })
    }

    // ファイル名を生成
    const uuid = crypto.randomUUID()
    const originalName = `original_${uuid}.webp`
    const thumbnailName = `thumb_${uuid}.webp`

    const r2Enabled = isR2Enabled()

    // デバッグ: R2設定の確認
    console.log('[R2 Debug] isR2Enabled:', r2Enabled)
    console.log('[R2 Debug] R2_ACCOUNT_ID exists:', !!process.env.R2_ACCOUNT_ID)
    console.log('[R2 Debug] R2_ACCESS_KEY_ID exists:', !!process.env.R2_ACCESS_KEY_ID)
    console.log('[R2 Debug] R2_SECRET_ACCESS_KEY exists:', !!process.env.R2_SECRET_ACCESS_KEY)
    console.log('[R2 Debug] R2_BUCKET_NAME exists:', !!process.env.R2_BUCKET_NAME)
    console.log('[R2 Debug] R2_PUBLIC_URL exists:', !!process.env.R2_PUBLIC_URL)

    if (r2Enabled) {
      // R2にアップロード
      originalKey = `practices/${user.id}/${practiceId}/${originalName}`
      thumbnailKey = `practices/${user.id}/${practiceId}/${thumbnailName}`

      const originalBuffer = Buffer.from(await originalFile.arrayBuffer())
      const thumbnailBuffer = Buffer.from(await thumbnailFile.arrayBuffer())

      await uploadToR2(originalBuffer, originalKey, 'image/webp')
      await uploadToR2(thumbnailBuffer, thumbnailKey, 'image/webp')

      // DBに保存するパス（R2のキーからプレフィックスを除いた部分）
      originalPath = `${user.id}/${practiceId}/${originalName}`
      thumbnailPath = `${user.id}/${practiceId}/${thumbnailName}`
    } else {
      // Supabase Storageにアップロード
      originalPath = `${user.id}/${practiceId}/${originalName}`
      thumbnailPath = `${user.id}/${practiceId}/${thumbnailName}`

      const { error: originalError } = await supabase.storage
        .from('practice-images')
        .upload(originalPath, originalFile, {
          contentType: 'image/webp',
          upsert: false
        })

      if (originalError) {
        console.error('オリジナル画像のアップロードエラー:', originalError)
        return NextResponse.json({ error: 'オリジナル画像のアップロードに失敗しました' }, { status: 500 })
      }

      const { error: thumbnailError } = await supabase.storage
        .from('practice-images')
        .upload(thumbnailPath, thumbnailFile, {
          contentType: 'image/webp',
          upsert: false
        })

      if (thumbnailError) {
        // サムネイルアップロードに失敗したらオリジナルも削除
        await supabase.storage.from('practice-images').remove([originalPath])
        console.error('サムネイル画像のアップロードエラー:', thumbnailError)
        return NextResponse.json({ error: 'サムネイル画像のアップロードに失敗しました' }, { status: 500 })
      }
    }

    // データベースに記録を作成
    const insertData = {
      practice_id: practiceId,
      user_id: user.id,
      original_path: originalPath,
      thumbnail_path: thumbnailPath,
      file_name: originalFileName,
      file_size: originalFile.size,
      display_order: displayOrder
    }

    // NOTE: Supabaseの型推論が環境によってneverになることがあるため、型アサーションを使用
    const { data, error: dbError } = await (supabase
      .from('practice_images') as ReturnType<typeof supabase.from>)
      .insert(insertData as Record<string, unknown>)
      .select()
      .single()

    if (dbError) {
      // DB挿入に失敗したらストレージのファイルも削除
      if (r2Enabled && originalKey && thumbnailKey) {
        await deleteFromR2(originalKey).catch(console.error)
        await deleteFromR2(thumbnailKey).catch(console.error)
      } else if (originalPath && thumbnailPath) {
        await supabase.storage.from('practice-images').remove([originalPath, thumbnailPath])
      }
      console.error('DB登録エラー:', dbError)
      return NextResponse.json({ error: '画像情報の登録に失敗しました' }, { status: 500 })
    }

    return NextResponse.json(data as PracticeImage)
  } catch (error) {
    // エラー時のロールバック
    const r2Enabled = isR2Enabled()
    if (r2Enabled) {
      if (originalKey) await deleteFromR2(originalKey).catch(console.error)
      if (thumbnailKey) await deleteFromR2(thumbnailKey).catch(console.error)
    } else {
      if (originalPath) await supabase.storage.from('practice-images').remove([originalPath]).catch(console.error)
      if (thumbnailPath) await supabase.storage.from('practice-images').remove([thumbnailPath]).catch(console.error)
    }
    console.error('練習画像アップロードエラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}

/**
 * DELETE: 練習画像を削除
 * Query: imageId
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const imageId = searchParams.get('imageId')

    if (!imageId) {
      return NextResponse.json({ error: 'imageId が必要です' }, { status: 400 })
    }

    const supabase = await createAuthenticatedServerClient()

    // NOTE: Supabaseの型推論が環境によってneverになることがあるため、型アサーションを使用
    // 画像情報を取得
    const { data: imageData, error: fetchError } = await (supabase
      .from('practice_images') as ReturnType<typeof supabase.from>)
      .select('*')
      .eq('id', imageId)
      .eq('user_id', user.id)
      .single()

    const image = imageData as { original_path: string; thumbnail_path: string } | null

    if (fetchError || !image) {
      return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })
    }

    // ストレージから削除
    const r2Enabled = isR2Enabled()
    if (r2Enabled) {
      const originalKey = `practices/${image.original_path}`
      const thumbnailKey = `practices/${image.thumbnail_path}`
      await deleteFromR2(originalKey).catch(console.error)
      await deleteFromR2(thumbnailKey).catch(console.error)
    } else {
      await supabase.storage
        .from('practice-images')
        .remove([image.original_path, image.thumbnail_path])
    }

    // DBから削除
    const { error: deleteError } = await (supabase
      .from('practice_images') as ReturnType<typeof supabase.from>)
      .delete()
      .eq('id', imageId)

    if (deleteError) {
      console.error('DB削除エラー:', deleteError)
      return NextResponse.json({ error: '画像の削除に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('練習画像削除エラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}
