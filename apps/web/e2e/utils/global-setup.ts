import { chromium, type FullConfig } from '@playwright/test'
import { spawn } from 'node:child_process'
import path from 'node:path'

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
  
  // テスト用ユーザーのセットアップ
  await setupTestUsers()
  
  console.log('✅ グローバルセットアップが完了しました')
}

async function setupTestUsers() {
  const scriptPath = path.resolve(process.cwd(), 'e2e/scripts/reset-test-data.js')
  console.log('♻️ テストデータをリセットします')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`reset-test-data.js exited with code ${code ?? 'unknown'}`))
      }
    })

    child.on('error', reject)
  })
}

export default globalSetup
