import type { FullConfig } from '@playwright/test'

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
  
  // 必要に応じてクリーンアップ処理を追加
  // 例: テストデータベースのクリーンアップ
  // 例: 一時ファイルの削除
  // 例: 外部サービスへの通知
  
  console.log('✅ グローバルティアダウンが完了しました')
}

export default globalTeardown
