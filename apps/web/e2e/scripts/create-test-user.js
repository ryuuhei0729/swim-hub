#!/usr/bin/env node

/**
 * テスト用ユーザーを作成するスクリプト
 * E2Eテスト実行前に実行してテストユーザーを準備する
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const testUsers = [
  {
    email: 'test@example.com',
    password: 'testpassword123',
    name: 'テストユーザー'
  },
  {
    email: 'test@swimhub.com',
    password: 'TestPassword123!',
    name: 'SwimHubデフォルトユーザー'
  },
  {
    email: 'test-admin@swimhub.com',
    password: 'TestAdmin123!',
    name: 'テスト管理者'
  },
  {
    email: 'test-user@swimhub.com',
    password: 'TestUser123!',
    name: 'テストユーザー'
  },
  {
    email: 'logout-test@swimhub.com',
    password: 'LogoutTest123!',
    name: 'ログアウトテストユーザー'
  },
  {
    email: 'persistence-test@swimhub.com',
    password: 'PersistenceTest123!',
    name: '永続化テストユーザー'
  },
  {
    email: 'reset-test@swimhub.com',
    password: 'ResetTest123!',
    name: 'パスワードリセットテストユーザー'
  },
  {
    email: 'single-register@swimhub.com',
    password: 'SingleRegister123!',
    name: '単体登録テストユーザー'
  },
  {
    email: 'e2e-test@swimhub.com',
    password: 'E2ETest123!',
    name: 'E2Eテストユーザー'
  }
]

async function createTestUsers() {
  console.log('🏊 テストユーザーの作成を開始します...')
  
  for (const user of testUsers) {
    console.log(`\n📧 ユーザー作成中: ${user.email}`)
    
    try {
      // まず既存ユーザーを確認
      const { data: existingUsers } = await supabase.auth.admin.listUsers()
      const existingUser = existingUsers.users.find(u => u.email === user.email)
      
      if (existingUser) {
        console.log(`✅ ユーザー ${user.email} は既に存在します (ID: ${existingUser.id})`)
        continue
      }
      
      // 新しいユーザーを作成
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true, // メール認証をスキップ
        user_metadata: {
          name: user.name
        }
      })
      
      if (error) {
        console.error(`❌ ユーザー作成エラー (${user.email}):`, error.message)
        continue
      }
      
      console.log(`✅ ユーザー ${user.email} を作成しました (ID: ${data.user.id})`)
      
      // users テーブルにプロフィール情報を追加
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: data.user.id,
          name: user.name,
          gender: 0,
          bio: 'E2Eテスト用ユーザー',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (profileError && profileError.code !== '23505') { // 23505 = unique violation (既存の場合は無視)
        console.warn(`⚠️  プロフィール作成警告 (${user.email}):`, profileError.message)
      } else {
        console.log(`✅ プロフィール情報も作成しました`)
      }
      
    } catch (error) {
      console.error(`❌ 予期しないエラー (${user.email}):`, error.message)
    }
  }
  
  console.log('\n🎉 テストユーザーの作成が完了しました！')
}

// スクリプト実行
if (require.main === module) {
  createTestUsers().catch(console.error)
}

module.exports = { createTestUsers }
