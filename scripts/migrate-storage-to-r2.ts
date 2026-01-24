/**
 * Supabase Storage → Cloudflare R2 移行スクリプト
 *
 * 使用方法:
 *   npx tsx scripts/migrate-storage-to-r2.ts
 *
 * 環境変数が必要:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - R2_ACCOUNT_ID
 *   - R2_ACCESS_KEY_ID
 *   - R2_SECRET_ACCESS_KEY
 *   - R2_BUCKET_NAME
 *
 * オプション:
 *   --dry-run    実際にはアップロードせず、対象ファイルのみ表示
 *   --bucket     特定のバケットのみ移行 (profiles, practices, competitions)
 */

import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'

// 環境変数は dotenvx が自動注入（apps/web/.env.local）

// 移行対象のバケット（Supabase Storage のバケット名）
const BUCKETS = ['profile-images', 'practice-images', 'competition-images'] as const
type BucketName = (typeof BUCKETS)[number]

// 引数パース
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const bucketArg = args.find(arg => arg.startsWith('--bucket='))
const targetBucket = bucketArg ? bucketArg.split('=')[1] as BucketName : null

// 環境変数チェック
function checkEnvVars(): void {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ]

  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    console.error('❌ 以下の環境変数が設定されていません:')
    missing.forEach(key => console.error(`   - ${key}`))
    process.exit(1)
  }
}

// Supabase クライアント初期化
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// R2 クライアント初期化
function getR2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

// R2にファイルが存在するかチェック
async function existsInR2(r2Client: S3Client, key: string): Promise<boolean> {
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: key,
      })
    )
    return true
  } catch {
    return false
  }
}

// ファイルのContent-Typeを推測
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
  }
  return types[ext || ''] || 'application/octet-stream'
}

// バケット内の全ファイルを再帰的に取得
async function listAllFiles(
  supabase: ReturnType<typeof getSupabaseClient>,
  bucket: BucketName,
  folder: string = ''
): Promise<string[]> {
  const files: string[] = []

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 1000,
  })

  if (error) {
    console.error(`❌ ${bucket}/${folder} の一覧取得に失敗:`, error.message)
    return files
  }

  for (const item of data || []) {
    const itemPath = folder ? `${folder}/${item.name}` : item.name

    if (item.id === null) {
      // フォルダの場合は再帰
      const subFiles = await listAllFiles(supabase, bucket, itemPath)
      files.push(...subFiles)
    } else {
      // ファイルの場合
      files.push(itemPath)
    }
  }

  return files
}

// 1ファイルを移行
async function migrateFile(
  supabase: ReturnType<typeof getSupabaseClient>,
  r2Client: S3Client,
  bucket: BucketName,
  filePath: string
): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  const r2Key = `${bucket}/${filePath}`

  // 既にR2に存在するかチェック
  const exists = await existsInR2(r2Client, r2Key)
  if (exists) {
    return { success: true, skipped: true }
  }

  if (isDryRun) {
    return { success: true, skipped: false }
  }

  // Supabase Storageからダウンロード
  const { data, error } = await supabase.storage.from(bucket).download(filePath)

  if (error) {
    return { success: false, skipped: false, error: error.message }
  }

  // R2にアップロード
  const buffer = Buffer.from(await data.arrayBuffer())
  const contentType = getContentType(filePath)

  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
      })
    )
    return { success: true, skipped: false }
  } catch (err) {
    return { success: false, skipped: false, error: String(err) }
  }
}

// バケットを移行
async function migrateBucket(
  supabase: ReturnType<typeof getSupabaseClient>,
  r2Client: S3Client,
  bucket: BucketName
): Promise<{ total: number; migrated: number; skipped: number; failed: number }> {
  console.log(`\n📦 ${bucket} バケットの移行を開始...`)

  const files = await listAllFiles(supabase, bucket)
  console.log(`   ${files.length} 件のファイルを検出`)

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const filePath of files) {
    const result = await migrateFile(supabase, r2Client, bucket, filePath)

    if (result.success) {
      if (result.skipped) {
        skipped++
        process.stdout.write('.')
      } else {
        migrated++
        process.stdout.write('✓')
      }
    } else {
      failed++
      console.error(`\n   ❌ ${filePath}: ${result.error}`)
    }
  }

  console.log(`\n   完了: 移行=${migrated}, スキップ=${skipped}, 失敗=${failed}`)

  return { total: files.length, migrated, skipped, failed }
}

// メイン処理
async function main() {
  console.log('='.repeat(60))
  console.log('Supabase Storage → Cloudflare R2 移行スクリプト')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('🔍 ドライランモード: 実際のアップロードは行いません')
  }

  if (targetBucket) {
    if (!BUCKETS.includes(targetBucket as BucketName)) {
      console.error(`❌ 無効なバケット名: ${targetBucket}`)
      console.error(`   有効なバケット: ${BUCKETS.join(', ')}`)
      process.exit(1)
    }
    console.log(`📁 対象バケット: ${targetBucket}`)
  } else {
    console.log(`📁 対象バケット: ${BUCKETS.join(', ')}`)
  }

  checkEnvVars()

  const supabase = getSupabaseClient()
  const r2Client = getR2Client()

  const bucketsToMigrate = targetBucket ? [targetBucket as BucketName] : BUCKETS

  const summary = {
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
  }

  for (const bucket of bucketsToMigrate) {
    const result = await migrateBucket(supabase, r2Client, bucket)
    summary.total += result.total
    summary.migrated += result.migrated
    summary.skipped += result.skipped
    summary.failed += result.failed
  }

  console.log('\n' + '='.repeat(60))
  console.log('移行完了サマリー')
  console.log('='.repeat(60))
  console.log(`   総ファイル数: ${summary.total}`)
  console.log(`   移行済み: ${summary.migrated}`)
  console.log(`   スキップ（既存）: ${summary.skipped}`)
  console.log(`   失敗: ${summary.failed}`)

  if (summary.failed > 0) {
    console.log('\n⚠️  一部のファイルが移行に失敗しました')
    process.exit(1)
  }

  if (isDryRun) {
    console.log('\n✅ ドライラン完了。実際に移行するには --dry-run を外して実行してください')
  } else {
    console.log('\n✅ 移行が正常に完了しました')
  }
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err)
  process.exit(1)
})
