import { chromium, type FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { LoginAction } from '../actions/LoginAction'
import { EnvConfig } from './config'

/**
 * グローバルセットアップ
 * テスト実行前の共通準備処理
 * 
 * 主な処理:
 * 1. サーバーのヘルスチェック
 * 2. ログイン処理を実行してstorageStateを保存（ログイン省略のため）
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 E2Eテストのグローバルセットアップを開始')
  
  const { baseURL } = config.projects[0].use
  
  if (!baseURL) {
    throw new Error('ベースURLが設定されていません')
  }

  // 環境変数の確認
  let testEnv: ReturnType<typeof EnvConfig.getTestEnvironment> | null = null
  try {
    testEnv = EnvConfig.getTestEnvironment()
    console.log(`✅ テスト環境設定を確認: ${testEnv.baseUrl}`)
    console.log(`✅ テストユーザー: ${testEnv.credentials.email}`)
  } catch (error) {
    console.warn('⚠️  環境変数の確認で警告:', (error as Error).message)
    // CI環境では既に設定されているはずなので、警告のみ
    // storageStateの保存はスキップ
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
  const browser = await chromium.launch({
    headless: process.env.CI ? true : false,
  })
  
  try {
    // 基本的なヘルスチェック
    const page = await browser.newPage()
    
    // サーバーの起動を待つ（リトライロジック）
    console.log(`📡 ${baseURL} への接続をテスト中...`)
    const maxRetries = 10
    const retryDelay = 3000 // 3秒
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 10000 })
        
        // ページタイトルチェック
        const title = await page.title()
        console.log(`✅ ページタイトル: ${title}`)
        
        // アプリケーションが正常に読み込まれているかチェック
        await page.waitForSelector('body', { timeout: 5000 })
        console.log('✅ アプリケーションが正常に読み込まれました')
        
        await page.close()
        break // 成功したらループを抜ける
      } catch (error) {
        lastError = error as Error
        if (attempt < maxRetries) {
          console.log(`⏳ サーバーの起動を待機中... (${attempt}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        } else {
          throw lastError
        }
      }
    }

    // ログイン状態を保存（storageState）
    if (testEnv) {
      try {
        console.log('🔐 ログイン状態を保存中...')
        // baseURLを設定してコンテキストを作成（相対パスを使用するため）
        const context = await browser.newContext({ baseURL })
        const loginPage = await context.newPage()
        
        // コンソールエラーを監視（Supabaseエラーを検出）
        const consoleErrors: string[] = []
        loginPage.on('console', (msg) => {
          if (msg.type() === 'error') {
            const text = msg.text()
            consoleErrors.push(text)
            // Database errorを検出した場合は警告を出力
            if (text.includes('Database error') || text.includes('status: 500')) {
              console.warn('⚠️  ブラウザコンソールエラー:', text)
            }
          }
        })
        
        // ページエラーを監視
        loginPage.on('pageerror', (error) => {
          console.warn('⚠️  ページエラー:', error.message)
        })
        
        // ログイン処理を実行（相対パスを使用、PlaywrightのbaseURL設定が自動適用される）
        const loginAction = new LoginAction(loginPage)
        await loginAction.execute(
          testEnv.credentials.email,
          testEnv.credentials.password
        )
        
        // ログイン成功を確認（ダッシュボードに遷移しているか）
        const currentUrl = loginPage.url()
        if (!currentUrl.includes('/dashboard')) {
          throw new Error(`ログイン後のリダイレクトが失敗しました。現在のURL: ${currentUrl}`)
        }
        
        // ダッシュボードページの読み込み完了を待つ
        await loginPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          // networkidleがタイムアウトしても続行（Supabaseのリアルタイム接続のため）
        })
        await loginPage.waitForTimeout(2000) // 追加の待機時間
        
        // storageStateを保存
        const authDir = path.resolve(__dirname, '../../playwright/.auth')
        const authFile = path.join(authDir, 'user.json')
        
        // ディレクトリが存在しない場合は作成
        if (!fs.existsSync(authDir)) {
          fs.mkdirSync(authDir, { recursive: true })
        }
        
        await context.storageState({ path: authFile })
        console.log(`✅ ログイン状態を保存しました: ${authFile}`)
        
        // コンソールエラーがあった場合は警告
        if (consoleErrors.length > 0) {
          console.warn(`⚠️  ログイン中に ${consoleErrors.length} 個のコンソールエラーが検出されましたが、ログイン状態は保存されました`)
        }
        
        await context.close()
      } catch (error) {
        console.warn('⚠️  ログイン状態の保存に失敗しました:', (error as Error).message)
        console.warn('⚠️  各テストで個別にログイン処理が実行されます')
        // エラーが発生してもテストは続行（各テストで個別にログイン）
      }
    }
  } catch (error) {
    console.error('❌ グローバルセットアップでエラーが発生:', error)
    throw error
  } finally {
    await browser.close()
  }
  console.log('✅ グローバルセットアップが完了しました')
}

export default globalSetup
