/**
 * プロフィール画像のアップロード/削除 API
 * R2優先、Supabase Storageフォールバック
 */
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { isR2Enabled, uploadToR2, listR2Objects, deleteMultipleFromR2 } from '@/lib/r2'
import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/**
 * POST: プロフィール画像をアップロード
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'ファイルが必要です' }, { status: 400 })
    }

    // バリデーション
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'JPEG、PNG、WebPのみ対応しています' }, { status: 400 })
    }

    // ファイル名を生成
    const ext = file.name.split('.').pop() || 'webp'
    const fileName = `${Date.now()}.${ext}`
    const key = `profiles/avatars/${user.id}/${fileName}`

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      // 既存の画像を削除
      const existingFiles = await listR2Objects(`profiles/avatars/${user.id}/`)
      if (existingFiles.length > 0) {
        await deleteMultipleFromR2(existingFiles)
      }

      // 新しい画像をアップロード
      const buffer = Buffer.from(await file.arrayBuffer())
      const publicUrl = await uploadToR2(buffer, key, file.type)

      return NextResponse.json({ url: publicUrl })
    }

    // フォールバック: Supabase Storage
    const supabase = await createAuthenticatedServerClient()
    const userFolderPath = `avatars/${user.id}`

    // 既存の画像を削除
    const { data: files } = await supabase.storage
      .from('profile-images')
      .list(userFolderPath)

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${userFolderPath}/${f.name}`)
      await supabase.storage.from('profile-images').remove(filePaths)
    }

    // 新しい画像をアップロード
    const filePath = `${userFolderPath}/${fileName}`
    const { error: uploadError } = await supabase.storage
      .from('profile-images')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Supabase Storageアップロードエラー:', uploadError)
      return NextResponse.json({ error: '画像のアップロードに失敗しました' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('profile-images')
      .getPublicUrl(filePath)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error) {
    console.error('プロフィール画像アップロードエラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}

/**
 * DELETE: プロフィール画像を削除
 */
export async function DELETE() {
  try {
    const user = await getServerUser()
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // R2が有効な場合はR2を使用
    if (isR2Enabled()) {
      const existingFiles = await listR2Objects(`profiles/avatars/${user.id}/`)
      if (existingFiles.length > 0) {
        await deleteMultipleFromR2(existingFiles)
      }
      return NextResponse.json({ success: true })
    }

    // フォールバック: Supabase Storage
    const supabase = await createAuthenticatedServerClient()
    const userFolderPath = `avatars/${user.id}`

    const { data: files } = await supabase.storage
      .from('profile-images')
      .list(userFolderPath)

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${userFolderPath}/${f.name}`)
      await supabase.storage.from('profile-images').remove(filePaths)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('プロフィール画像削除エラー:', error)
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 })
  }
}
