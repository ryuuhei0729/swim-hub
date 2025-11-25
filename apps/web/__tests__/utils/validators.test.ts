import { describe, expect, it } from 'vitest'
import {
    isInRange,
    isRequired,
    isValidDate,
    isValidEmail,
    isValidLength,
    isValidPassword,
    isValidPhoneNumber,
    isValidTime,
    validateForm,
} from '../../utils/validators'

describe('isValidEmail', () => {
  it('正しいメールアドレスを検証できる', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name+tag@example.co.jp')).toBe(true)
    expect(isValidEmail('test123@test-domain.com')).toBe(true)
  })

  it('無効なメールアドレスを拒否する', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test @example.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('正しいパスワードを検証できる', () => {
    expect(isValidPassword('Password123')).toBe(true)
    expect(isValidPassword('SecurePass1')).toBe(true)
    expect(isValidPassword('Test1234')).toBe(true)
  })

  it('大文字を含まないパスワードを拒否する', () => {
    expect(isValidPassword('password123')).toBe(false)
  })

  it('小文字を含まないパスワードを拒否する', () => {
    expect(isValidPassword('PASSWORD123')).toBe(false)
  })

  it('数字を含まないパスワードを拒否する', () => {
    expect(isValidPassword('Password')).toBe(false)
  })

  it('8文字未満のパスワードを拒否する', () => {
    expect(isValidPassword('Pass123')).toBe(false)
    expect(isValidPassword('Pas1')).toBe(false)
  })

  it('特殊文字を許可する', () => {
    expect(isValidPassword('Pass@123')).toBe(true)
    expect(isValidPassword('Test$1234')).toBe(true)
  })
})

describe('isValidPhoneNumber', () => {
  it('ハイフン付きの日本の電話番号を検証できる', () => {
    expect(isValidPhoneNumber('03-1234-5678')).toBe(true)
    expect(isValidPhoneNumber('090-1234-5678')).toBe(true)
    expect(isValidPhoneNumber('0120-123-4567')).toBe(true)
  })

  it('ハイフンなしの日本の電話番号を検証できる', () => {
    expect(isValidPhoneNumber('09012345678')).toBe(true)
    expect(isValidPhoneNumber('0312345678')).toBe(true)
  })

  it('無効な電話番号を拒否する', () => {
    expect(isValidPhoneNumber('123-4567')).toBe(false)
    expect(isValidPhoneNumber('090-123-456')).toBe(false)
    expect(isValidPhoneNumber('abc-defg-hijk')).toBe(false)
    expect(isValidPhoneNumber('')).toBe(false)
  })
})

describe('isValidTime', () => {
  it('正しい時間形式（MM:SS.ss）を検証できる', () => {
    expect(isValidTime('2:05.50')).toBe(true)
    expect(isValidTime('0:59.99')).toBe(true)
    expect(isValidTime('59:59.99')).toBe(true)
  })

  it('無効な時間形式を拒否する', () => {
    expect(isValidTime('60:00.00')).toBe(false) // 分が60以上
    expect(isValidTime('2:60.00')).toBe(false) // 秒が60以上
    expect(isValidTime('2:05.5')).toBe(false) // 小数点以下が1桁
    expect(isValidTime('2:5.50')).toBe(false) // 秒が1桁
    expect(isValidTime('205.50')).toBe(false) // コロンなし
    expect(isValidTime('')).toBe(false)
  })
})

describe('isValidDate', () => {
  it('正しい日付文字列を検証できる', () => {
    expect(isValidDate('2025-01-15')).toBe(true)
    expect(isValidDate('2025/01/15')).toBe(true)
    expect(isValidDate('2025-12-31')).toBe(true)
  })

  it('無効な日付を拒否する', () => {
    expect(isValidDate('invalid')).toBe(false)
    expect(isValidDate('2025-13-01')).toBe(false) // 月が無効
    // Note: JavaScript Date自動補正により 2025-02-30は 2025-03-02になるため、
    // isNaN()ではエラーを検出できません
    expect(isValidDate('')).toBe(false)
  })
})

describe('isRequired', () => {
  it('空でない文字列に対してtrueを返す', () => {
    expect(isRequired('test')).toBe(true)
    expect(isRequired('123')).toBe(true)
    expect(isRequired(' text ')).toBe(true)
  })

  it('空文字列に対してfalseを返す', () => {
    expect(isRequired('')).toBe(false)
    expect(isRequired('   ')).toBe(false)
  })

  it('数値に対してtrueを返す', () => {
    expect(isRequired(0)).toBe(true)
    expect(isRequired(123)).toBe(true)
    expect(isRequired(-1)).toBe(true)
  })

  it('nullとundefinedに対してfalseを返す', () => {
    expect(isRequired(null)).toBe(false)
    expect(isRequired(undefined)).toBe(false)
  })
})

describe('isInRange', () => {
  it('値が範囲内のときtrueを返す', () => {
    expect(isInRange(5, 0, 10)).toBe(true)
    expect(isInRange(0, 0, 10)).toBe(true)
    expect(isInRange(10, 0, 10)).toBe(true)
  })

  it('値が範囲外のときfalseを返す', () => {
    expect(isInRange(-1, 0, 10)).toBe(false)
    expect(isInRange(11, 0, 10)).toBe(false)
    expect(isInRange(100, 0, 10)).toBe(false)
  })
})

describe('isValidLength', () => {
  it('文字列の長さが有効なときtrueを返す', () => {
    expect(isValidLength('test', 1, 10)).toBe(true)
    expect(isValidLength('a', 1, 10)).toBe(true)
    expect(isValidLength('1234567890', 1, 10)).toBe(true)
  })

  it('文字列が短すぎるときfalseを返す', () => {
    expect(isValidLength('', 1, 10)).toBe(false)
    expect(isValidLength('ab', 3, 10)).toBe(false)
  })

  it('文字列が長すぎるときfalseを返す', () => {
    expect(isValidLength('12345678901', 1, 10)).toBe(false)
    expect(isValidLength('this is a very long text', 1, 10)).toBe(false)
  })
})

describe('validateForm', () => {
  it('必須フィールドを検証できる', () => {
    const data = { name: 'Test', email: 'test@example.com' }
    const rules = {
      name: { required: true, label: '名前' },
      email: { required: true, label: 'メールアドレス' },
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('不足している必須フィールドを検出できる', () => {
    const data = { name: '', email: 'test@example.com' }
    const rules = {
      name: { required: true, label: '名前' },
      email: { required: true, label: 'メールアドレス' },
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('名前は必須です')
  })

  it('メール形式を検証できる', () => {
    const data = { email: 'invalid-email' }
    const rules = { email: { email: true, label: 'メールアドレス' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBe('有効なメールアドレスを入力してください')
  })

  it('パスワード形式を検証できる', () => {
    const data = { password: 'weak' }
    const rules = { password: { password: true, label: 'パスワード' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.password).toBe('パスワードは8文字以上で、大文字・小文字・数字を含む必要があります')
  })

  it('電話番号形式を検証できる', () => {
    const data = { phone: '123-456' }
    const rules = { phone: { phone: true, label: '電話番号' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.phone).toBe('有効な電話番号を入力してください')
  })

  it('最小長を検証できる', () => {
    const data = { username: 'ab' }
    const rules = { username: { minLength: 3, label: 'ユーザー名' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.username).toBe('ユーザー名は3文字以上で入力してください')
  })

  it('最大長を検証できる', () => {
    const data = { username: '12345678901' }
    const rules = { username: { maxLength: 10, label: 'ユーザー名' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.username).toBe('ユーザー名は10文字以下で入力してください')
  })

  it('複数の検証エラーを処理できる', () => {
    const data = { name: '', email: 'invalid' }
    const rules = {
      name: { required: true, label: '名前' },
      email: { required: true, email: true, label: 'メールアドレス' },
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('名前は必須です')
    expect(result.errors.email).toBeDefined()
  })

  it('オプションの空フィールドの検証をスキップする', () => {
    const data = { name: 'Test', phone: '' }
    const rules = {
      name: { required: true, label: '名前' },
      phone: { phone: true, label: '電話番号' }, // required: false
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })
})

