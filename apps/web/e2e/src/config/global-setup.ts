import { chromium, type FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { EnvConfig } from './env'

/**
 * グローバルセットアップ
 * テスト実行前の共通準備処理
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 E2Eテストのグローバルセットアップを開始')
  
  const { baseURL } = config.projects[0].use
  
  if (!baseURL) {
    throw new Error('ベースURLが設定されていません')
  }

  // 環境変数の確認
  try {
    const testEnv = EnvConfig.getTestEnvironment()
    console.log(`✅ テスト環境設定を確認: ${testEnv.baseUrl}`)
    console.log(`✅ テストユーザー: ${testEnv.credentials.email}`)
  } catch (error) {
    console.warn('⚠️  環境変数の確認で警告:', (error as Error).message)
    // CI環境では既に設定されているはずなので、警告のみ
  }

  // Supabase接続確認（ローカル環境の場合）
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (supabaseServiceKey && supabaseUrl.includes('127.0.0.1')) {
    try {
      console.log('📡 Supabase接続を確認中...')
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
      
      // 簡単な接続テスト（ユーザー一覧取得）
      const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
      if (error) {
        console.warn(`⚠️  Supabase接続確認で警告: ${error.message}`)
      } else {
        console.log('✅ Supabase接続を確認しました')
      }
    } catch (error) {
      console.warn('⚠️  Supabase接続確認をスキップ:', (error as Error).message)
      // 接続確認に失敗してもテストは続行（CI環境では既に起動済みの可能性がある）
    }
  }

  // ブラウザ起動
  const browser = await chromium.launch()
  
  try {
    // 基本的なヘルスチェック
    const page = await browser.newPage()
    
    console.log(`📡 ${baseURL} への接続をテスト中...`)
    await page.goto(baseURL)
    
    // ページタイトルチェック
    const title = await page.title()
    console.log(`✅ ページタイトル: ${title}`)
    
    // アプリケーションが正常に読み込まれているかチェック
    await page.waitForSelector('body', { timeout: 30000 })
    console.log('✅ アプリケーションが正常に読み込まれました')
    
    await page.close()
  } catch (error) {
    console.error('❌ グローバルセットアップでエラーが発生:', error)
    throw error
  } finally {
    await browser.close()
  }
  console.log('✅ グローバルセットアップが完了しました')
}

export default globalSetup
