import type { FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * グローバルティアダウン
 * テスト実行後のクリーンアップ処理
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 E2Eテストのグローバルティアダウンを開始')
  
  // テスト結果のサマリー表示
  console.log('📊 テスト実行結果:')
  console.log(`  - 設定ファイル: ${config.configFile}`)
  console.log(`  - プロジェクト数: ${config.projects.length}`)
  
  // Supabase接続確認とクリーンアップ（ローカル環境の場合）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  // CI環境ではSupabaseが停止されるため、クリーンアップはスキップ
  const isCI = process.env.CI === 'true'
  
  if (!isCI && supabaseServiceKey && supabaseUrl.includes('127.0.0.1')) {
    try {
      console.log('🧹 テストデータのクリーンアップを実行中...')
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
      
      // テスト用ユーザーの確認（オプション）
      // 実際のクリーンアップは各テストで行うため、ここではログのみ
      const { data: users, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 10 })
      if (error) {
        console.warn(`⚠️  ユーザー一覧取得で警告: ${error.message}`)
      } else {
        const testUsers = users.users.filter((user) =>
          user.email?.match(/^(test|e2e|playwright)-.*@swimhub\.com$/i)
        )
        if (testUsers.length > 0) {
          console.log(`📝 テスト用ユーザー数: ${testUsers.length}件`)
          console.log('💡 テスト用ユーザーのクリーンアップは各テストで実行されます')
        }
      }
    } catch (error) {
      console.warn('⚠️  クリーンアップ処理をスキップ:', (error as Error).message)
    }
  } else if (isCI) {
    console.log('ℹ️  CI環境のため、Supabaseクリーンアップはスキップされます（CIジョブで停止されます）')
  }
  
  console.log('✅ グローバルティアダウンが完了しました')
}

export default globalTeardown
