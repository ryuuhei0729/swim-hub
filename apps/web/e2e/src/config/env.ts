import * as dotenv from 'dotenv'
import path from 'node:path'

// .envファイルを読み込む（相対パスで解決）
// 実行時のカレントディレクトリから相対的に解決
const envLocalPath = path.resolve(process.cwd(), 'apps/web/.env.local')
const envPath = path.resolve(process.cwd(), 'apps/web/.env')

dotenv.config({ path: envLocalPath })
dotenv.config({ path: envPath })

export interface TestEnvironment {
  baseUrl: string
  credentials: {
    email: string
    password: string
  }
}

export class EnvConfig {
  /**
   * テスト環境の設定を取得
   */
  static getTestEnvironment(): TestEnvironment {
    const baseUrl = 
      process.env.E2E_BASE_URL ||
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.BASE_URL ||
      'http://localhost:3000'
    
    const email = process.env.E2E_TEST_EMAIL
    const password = process.env.E2E_TEST_PASSWORD

    if (!email || !password) {
      throw new Error(
        '必要な環境変数が設定されていません。\n' +
        'E2E_TEST_EMAIL と E2E_TEST_PASSWORD を設定してください。\n' +
        '例: apps/web/.env.local に以下を追加:\n' +
        'E2E_TEST_EMAIL=test@example.com\n' +
        'E2E_TEST_PASSWORD=testpassword123'
      )
    }

    return {
      baseUrl,
      credentials: { email, password }
    }
  }
}

