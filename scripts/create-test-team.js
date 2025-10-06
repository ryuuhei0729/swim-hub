#!/usr/bin/env node

/**
 * テスト用チームとユーザーを作成するスクリプト
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://otzdsnsdmgoxmxendfln.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createTestData() {
  console.log('🏊 テストデータの作成を開始します...')
  
  try {
    // 1. テストユーザーを作成
    console.log('\n📧 テストユーザーを作成中...')
    
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: 'test@test.test',
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: {
        name: 'テストユーザー'
      }
    })
    
    if (userError) {
      console.error('❌ ユーザー作成エラー:', userError.message)
      return
    }
    
    console.log(`✅ テストユーザーを作成しました (ID: ${userData.user.id})`)
    
    // 2. users テーブルにプロフィール情報を追加
    const { error: profileError } = await supabase
      .from('users')
      .upsert({
        id: userData.user.id,
        name: 'テストユーザー',
        gender: 0,
        bio: 'テスト用ユーザー',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    
    if (profileError) {
      console.warn('⚠️  プロフィール作成警告:', profileError.message)
    } else {
      console.log('✅ プロフィール情報も作成しました')
    }
    
    // 3. テストチームを作成
    console.log('\n👥 テストチームを作成中...')
    
    const { data: teamData, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: 'テストチーム',
        description: 'テスト用のチームです',
        invite_code: generateInviteCode(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (teamError) {
      console.error('❌ チーム作成エラー:', teamError.message)
      return
    }
    
    console.log(`✅ テストチームを作成しました (ID: ${teamData.id}, 招待コード: ${teamData.invite_code})`)
    
    // 4. チームメンバーシップを作成（管理者として）
    console.log('\n🔗 チームメンバーシップを作成中...')
    
    const { data: membershipData, error: membershipError } = await supabase
      .from('team_memberships')
      .insert({
        team_id: teamData.id,
        user_id: userData.user.id,
        role: 'admin',
        joined_at: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (membershipError) {
      console.error('❌ メンバーシップ作成エラー:', membershipError.message)
      return
    }
    
    console.log(`✅ チームメンバーシップを作成しました (ID: ${membershipData.id})`)
    
    // 5. テスト用のお知らせを作成
    console.log('\n📢 テスト用のお知らせを作成中...')
    
    const { data: announcementData, error: announcementError } = await supabase
      .from('announcements')
      .insert({
        team_id: teamData.id,
        title: 'テストお知らせ',
        content: 'これはテスト用のお知らせです。\n\nチーム機能の動作確認のために作成されました。',
        created_by: userData.user.id,
        is_published: true,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (announcementError) {
      console.error('❌ お知らせ作成エラー:', announcementError.message)
    } else {
      console.log(`✅ テスト用のお知らせを作成しました (ID: ${announcementData.id})`)
    }
    
    console.log('\n🎉 テストデータの作成が完了しました！')
    console.log('\n📋 作成されたデータ:')
    console.log(`   - ユーザー: test@test.test (ID: ${userData.user.id})`)
    console.log(`   - チーム: テストチーム (ID: ${teamData.id})`)
    console.log(`   - 招待コード: ${teamData.invite_code}`)
    console.log(`   - メンバーシップ: 管理者権限`)
    console.log('\n🔗 ログイン情報:')
    console.log('   - メール: test@test.test')
    console.log('   - パスワード: TestPassword123!')
    
  } catch (error) {
    console.error('❌ 予期しないエラー:', error.message)
  }
}

// 招待コード生成関数
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// スクリプト実行
if (require.main === module) {
  createTestData().catch(console.error)
}

module.exports = { createTestData }