import { chromium, type FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// テスト用ユーザー情報
export const TEST_USERS = {
  ADMIN: {
    email: 'test-admin@swimhub.com',
    password: 'TestAdmin123!',
    name: 'テスト管理者'
  },
  REGULAR: {
    email: 'test-user@swimhub.com', 
    password: 'TestUser123!',
    name: 'テストユーザー'
  }
} as const

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
  
  // テスト用ユーザーのセットアップ（新規登録フローで自動作成するため無効化）
  // await setupTestUsers()
  
  console.log('✅ グローバルセットアップが完了しました')
}

async function setupTestUsers() {
  console.log('👤 テストユーザーのセットアップを開始')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  
  // 既存のテストユーザーをクリーンアップ
  try {
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const testEmails = Object.values(TEST_USERS).map(user => user.email) as string[]
    
    for (const user of existingUsers.users) {
      if (user.email && testEmails.includes(user.email)) {
        await supabase.auth.admin.deleteUser(user.id)
        console.log(`🗑️  既存のテストユーザーを削除: ${user.email}`)
      }
    }
  } catch (error) {
    console.warn('⚠️  ユーザークリーンアップ警告:', (error as any).message)
  }
  
  // 新しいテストユーザーを作成
  for (const [role, userData] of Object.entries(TEST_USERS)) {
    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email: userData.email,
        password: userData.password,
        email_confirm: true,
        user_metadata: {
          name: userData.name
        }
      })
      
      if (error) {
        console.error(`❌ ${role}ユーザー作成エラー:`, error.message)
        continue
      }
      
      console.log(`✅ ${role}ユーザーを作成: ${userData.email} (ID: ${data.user.id})`)
      
      // usersテーブルのプロフィール情報を作成（テーブルが存在する場合のみ）
      try {
        await supabase
          .from('users')
          .insert({
            id: data.user.id,
            name: userData.name,
            gender: 0,
            bio: `E2Eテスト用${role}ユーザー`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        console.log(`✅ ${role}プロフィール情報も作成`)
      } catch (profileError) {
        // プロフィール作成失敗は警告のみ（テーブルが存在しない場合があるため）
        console.warn(`⚠️  ${role}プロフィール作成スキップ:`, (profileError as any).message)
      }
    } catch (error) {
      console.error(`❌ ${role}ユーザー作成で予期しないエラー:`, (error as any).message)
    }
  }
  
  console.log('✅ テストユーザーのセットアップが完了')
}

export default globalSetup
