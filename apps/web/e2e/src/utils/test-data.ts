/**
 * E2Eテスト用のテストデータ生成ユーティリティ
 * テスト内での動的データ生成を集約
 */

/**
 * 一意なメールアドレスを生成
 * @param prefix プレフィックス（デフォルト: 'e2e-test'）
 * @returns 一意なメールアドレス
 */
export function generateTestEmail(prefix: string = 'e2e-test'): string {
  return `${prefix}-${Date.now()}@swimhub.com`
}

/**
 * テスト用パスワードを生成
 * @param prefix プレフィックス（デフォルト: 'E2ETest'）
 * @returns テスト用パスワード
 */
export function generateTestPassword(prefix: string = 'E2ETest'): string {
  return `${prefix}123!`
}

/**
 * テスト用ユーザー名を生成
 * @param prefix プレフィックス（デフォルト: 'E2Eテストユーザー'）
 * @returns テスト用ユーザー名
 */
export function generateTestUserName(prefix: string = 'E2Eテストユーザー'): string {
  return `${prefix}_${Date.now()}`
}

/**
 * テスト用認証情報を生成
 */
export interface TestCredentials {
  email: string
  password: string
  name: string
}

/**
 * テスト用認証情報を生成
 * @param testName テスト名（メールアドレスとユーザー名のプレフィックスに使用）
 * @returns テスト用認証情報
 */
export function generateTestCredentials(testName: string): TestCredentials {
  const sanitizedTestName = testName.toLowerCase().replace(/\s+/g, '-')
  return {
    email: generateTestEmail(sanitizedTestName),
    password: generateTestPassword(testName.replace(/\s+/g, '')),
    name: generateTestUserName(`${testName}ユーザー`),
  }
}

/**
 * 特定のテストケース用の認証情報を生成
 */
export const TestCredentialsFactory = {
  /**
   * 新規登録からログインまでの完全フローテスト用
   */
  forSignupLoginFlow(): TestCredentials {
    return generateTestCredentials('signup-login-flow')
  },

  /**
   * ログアウトテスト用
   */
  forLogoutTest(): TestCredentials {
    return generateTestCredentials('logout-test')
  },

  /**
   * 永続化テスト用
   */
  forPersistenceTest(): TestCredentials {
    return generateTestCredentials('persistence-test')
  },

  /**
   * パスワードリセットテスト用
   */
  forPasswordResetTest(): TestCredentials {
    return generateTestCredentials('reset-test')
  },

  /**
   * 単体登録テスト用
   */
  forSingleRegisterTest(): TestCredentials {
    return generateTestCredentials('single-register')
  },
}

