// =============================================================================
// authErrorLocalizer.test.ts - 認証エラーローカライズのユニットテスト
// =============================================================================

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { localizeAuthError, errorMessageMap } from '../authErrorLocalizer'

// __DEV__ グローバル変数をモック
declare const __DEV__: boolean

describe('localizeAuthError', () => {
  // __DEV__ の元の値を保存
  let originalDev: boolean | undefined

  beforeEach(() => {
    originalDev = (globalThis as { __DEV__?: boolean }).__DEV__
  })

  afterEach(() => {
    if (originalDev !== undefined) {
      ;(globalThis as { __DEV__?: boolean }).__DEV__ = originalDev
    } else {
      delete (globalThis as { __DEV__?: boolean }).__DEV__
    }
  })

  describe('完全一致マッピング', () => {
    it('errorMessageMapの各キーに対して正しい日本語メッセージを返す', () => {
      for (const [key, expectedValue] of Object.entries(errorMessageMap)) {
        expect(localizeAuthError(key)).toBe(expectedValue)
      }
    })

    it('大文字小文字を無視して完全一致する', () => {
      expect(localizeAuthError('INVALID LOGIN CREDENTIALS')).toBe(
        errorMessageMap['invalid login credentials']
      )
      expect(localizeAuthError('Invalid Login Credentials')).toBe(
        errorMessageMap['invalid login credentials']
      )
    })
  })

  describe('部分一致マッピング', () => {
    it('メッセージ内にキーワードが含まれる場合、対応する日本語メッセージを返す', () => {
      expect(localizeAuthError('Error: invalid login credentials occurred')).toBe(
        errorMessageMap['invalid login credentials']
      )
      expect(localizeAuthError('Authentication failed: token expired')).toBe(
        errorMessageMap['token expired']
      )
      expect(localizeAuthError('Server returned: too many requests')).toBe(
        errorMessageMap['too many requests']
      )
    })

    it('部分一致でも大文字小文字を無視する', () => {
      expect(localizeAuthError('Error: NETWORK ERROR detected')).toBe(
        errorMessageMap['network error']
      )
    })
  })

  describe('キャンセル処理', () => {
    it('"cancel"を含むメッセージはキャンセルメッセージを返す', () => {
      expect(localizeAuthError('User cancelled')).toBe('認証がキャンセルされました')
      expect(localizeAuthError('Operation was canceled by user')).toBe(
        '認証がキャンセルされました'
      )
      expect(localizeAuthError('cancel')).toBe('認証がキャンセルされました')
    })

    it('"キャンセル"を含むメッセージはキャンセルメッセージを返す', () => {
      expect(localizeAuthError('ユーザーがキャンセルしました')).toBe(
        '認証がキャンセルされました'
      )
      expect(localizeAuthError('キャンセル')).toBe('認証がキャンセルされました')
    })
  })

  describe('日本語入力', () => {
    it('既に日本語のメッセージはそのまま返す', () => {
      expect(localizeAuthError('認証に失敗しました')).toBe('認証に失敗しました')
      expect(localizeAuthError('サーバーエラーです')).toBe('サーバーエラーです')
      expect(localizeAuthError('接続できません')).toBe('接続できません')
    })

    it('ひらがな・カタカナ・漢字を含むメッセージはそのまま返す', () => {
      expect(localizeAuthError('エラーが発生')).toBe('エラーが発生')
      expect(localizeAuthError('失敗')).toBe('失敗')
      expect(localizeAuthError('テスト')).toBe('テスト')
    })
  })

  describe('空/null/undefined入力', () => {
    it('空文字列はジェネリックメッセージを返す', () => {
      expect(localizeAuthError('')).toBe('認証エラーが発生しました。再度お試しください')
    })

    it('undefinedはジェネリックメッセージを返す', () => {
      expect(localizeAuthError(undefined as unknown as string)).toBe(
        '認証エラーが発生しました。再度お試しください'
      )
    })

    it('nullはジェネリックメッセージを返す', () => {
      expect(localizeAuthError(null as unknown as string)).toBe(
        '認証エラーが発生しました。再度お試しください'
      )
    })
  })

  describe('__DEV__フォールバック動作', () => {
    it('__DEV__がtrueの場合、未知のエラーは開発用メッセージを返す', () => {
      ;(globalThis as { __DEV__?: boolean }).__DEV__ = true

      const unknownMessage = 'some unknown error xyz123'
      const result = localizeAuthError(unknownMessage)

      expect(result).toBe(`認証エラーが発生しました: ${unknownMessage}`)
    })

    it('__DEV__がfalseの場合、未知のエラーはジェネリックメッセージを返す', () => {
      ;(globalThis as { __DEV__?: boolean }).__DEV__ = false

      const unknownMessage = 'some unknown error xyz123'
      const result = localizeAuthError(unknownMessage)

      expect(result).toBe('認証エラーが発生しました。再度お試しください')
    })
  })

  describe('errorMessageMapのカバレッジ', () => {
    it('認証関連エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('invalid login credentials')).toBe(
        'メールアドレスまたはパスワードが正しくありません'
      )
      expect(localizeAuthError('user already registered')).toBe(
        'このメールアドレスは既に登録されています'
      )
    })

    it('OAuth関連エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('access_denied')).toBe('アクセスが拒否されました')
      expect(localizeAuthError('invalid_grant')).toBe(
        '認証の有効期限が切れました。再度お試しください'
      )
    })

    it('トークン関連エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('invalid token')).toBe('認証トークンが無効です')
      expect(localizeAuthError('token expired')).toBe(
        '認証トークンの有効期限が切れました'
      )
    })

    it('セッション関連エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('session not found')).toBe(
        'セッションが見つかりません。再度ログインしてください'
      )
      expect(localizeAuthError('session expired')).toBe(
        'セッションの有効期限が切れました。再度ログインしてください'
      )
    })

    it('レート制限エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('too many requests')).toBe(
        'リクエスト回数が上限に達しました。しばらくお待ちください'
      )
    })

    it('ネットワークエラーが正しくマッピングされる', () => {
      expect(localizeAuthError('network error')).toBe(
        'ネットワークエラーが発生しました。接続を確認してください'
      )
      expect(localizeAuthError('timeout')).toBe(
        '接続がタイムアウトしました。再度お試しください'
      )
    })

    it('Apple/Google認証エラーが正しくマッピングされる', () => {
      expect(localizeAuthError('apple authentication failed')).toBe(
        'Apple認証に失敗しました'
      )
      expect(localizeAuthError('google sign in failed')).toBe(
        'Googleサインインに失敗しました'
      )
    })

    it('サーバーエラーが正しくマッピングされる', () => {
      expect(localizeAuthError('internal server error')).toBe(
        'サーバーエラーが発生しました。しばらくしてから再度お試しください'
      )
      expect(localizeAuthError('service unavailable')).toBe(
        'サービスが一時的に利用できません。しばらくしてから再度お試しください'
      )
    })
  })
})
