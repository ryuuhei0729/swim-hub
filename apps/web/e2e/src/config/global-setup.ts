import { chromium, type FullConfig } from '@playwright/test'

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
  console.log('✅ グローバルセットアップが完了しました')
}

export default globalSetup
