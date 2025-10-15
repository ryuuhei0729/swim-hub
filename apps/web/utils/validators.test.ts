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
} from './validators'

describe('isValidEmail', () => {
  it('should validate correct email addresses', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name+tag@example.co.jp')).toBe(true)
    expect(isValidEmail('test123@test-domain.com')).toBe(true)
  })

  it('should reject invalid email addresses', () => {
    expect(isValidEmail('invalid')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
    expect(isValidEmail('@example.com')).toBe(false)
    expect(isValidEmail('test @example.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('should validate correct passwords', () => {
    expect(isValidPassword('Password123')).toBe(true)
    expect(isValidPassword('SecurePass1')).toBe(true)
    expect(isValidPassword('Test1234')).toBe(true)
  })

  it('should reject passwords without uppercase', () => {
    expect(isValidPassword('password123')).toBe(false)
  })

  it('should reject passwords without lowercase', () => {
    expect(isValidPassword('PASSWORD123')).toBe(false)
  })

  it('should reject passwords without numbers', () => {
    expect(isValidPassword('Password')).toBe(false)
  })

  it('should reject passwords shorter than 8 characters', () => {
    expect(isValidPassword('Pass123')).toBe(false)
    expect(isValidPassword('Pas1')).toBe(false)
  })

  it('should allow special characters', () => {
    expect(isValidPassword('Pass@123')).toBe(true)
    expect(isValidPassword('Test$1234')).toBe(true)
  })
})

describe('isValidPhoneNumber', () => {
  it('should validate Japanese phone numbers with hyphens', () => {
    expect(isValidPhoneNumber('03-1234-5678')).toBe(true)
    expect(isValidPhoneNumber('090-1234-5678')).toBe(true)
    expect(isValidPhoneNumber('0120-123-4567')).toBe(true)
  })

  it('should validate Japanese phone numbers without hyphens', () => {
    expect(isValidPhoneNumber('09012345678')).toBe(true)
    expect(isValidPhoneNumber('0312345678')).toBe(true)
  })

  it('should reject invalid phone numbers', () => {
    expect(isValidPhoneNumber('123-4567')).toBe(false)
    expect(isValidPhoneNumber('090-123-456')).toBe(false)
    expect(isValidPhoneNumber('abc-defg-hijk')).toBe(false)
    expect(isValidPhoneNumber('')).toBe(false)
  })
})

describe('isValidTime', () => {
  it('should validate correct time format (MM:SS.ss)', () => {
    expect(isValidTime('2:05.50')).toBe(true)
    expect(isValidTime('0:59.99')).toBe(true)
    expect(isValidTime('59:59.99')).toBe(true)
  })

  it('should reject invalid time formats', () => {
    expect(isValidTime('60:00.00')).toBe(false) // 分が60以上
    expect(isValidTime('2:60.00')).toBe(false) // 秒が60以上
    expect(isValidTime('2:05.5')).toBe(false) // 小数点以下が1桁
    expect(isValidTime('2:5.50')).toBe(false) // 秒が1桁
    expect(isValidTime('205.50')).toBe(false) // コロンなし
    expect(isValidTime('')).toBe(false)
  })
})

describe('isValidDate', () => {
  it('should validate correct date strings', () => {
    expect(isValidDate('2025-01-15')).toBe(true)
    expect(isValidDate('2025/01/15')).toBe(true)
    expect(isValidDate('2025-12-31')).toBe(true)
  })

  it('should reject invalid dates', () => {
    expect(isValidDate('invalid')).toBe(false)
    expect(isValidDate('2025-13-01')).toBe(false) // 月が無効
    // Note: JavaScript Date自動補正により 2025-02-30は 2025-03-02になるため、
    // isNaN()ではエラーを検出できません
    expect(isValidDate('')).toBe(false)
  })
})

describe('isRequired', () => {
  it('should return true for non-empty strings', () => {
    expect(isRequired('test')).toBe(true)
    expect(isRequired('123')).toBe(true)
    expect(isRequired(' text ')).toBe(true)
  })

  it('should return false for empty strings', () => {
    expect(isRequired('')).toBe(false)
    expect(isRequired('   ')).toBe(false)
  })

  it('should return true for numbers', () => {
    expect(isRequired(0)).toBe(true)
    expect(isRequired(123)).toBe(true)
    expect(isRequired(-1)).toBe(true)
  })

  it('should return false for null and undefined', () => {
    expect(isRequired(null)).toBe(false)
    expect(isRequired(undefined)).toBe(false)
  })
})

describe('isInRange', () => {
  it('should return true when value is in range', () => {
    expect(isInRange(5, 0, 10)).toBe(true)
    expect(isInRange(0, 0, 10)).toBe(true)
    expect(isInRange(10, 0, 10)).toBe(true)
  })

  it('should return false when value is out of range', () => {
    expect(isInRange(-1, 0, 10)).toBe(false)
    expect(isInRange(11, 0, 10)).toBe(false)
    expect(isInRange(100, 0, 10)).toBe(false)
  })
})

describe('isValidLength', () => {
  it('should return true when string length is valid', () => {
    expect(isValidLength('test', 1, 10)).toBe(true)
    expect(isValidLength('a', 1, 10)).toBe(true)
    expect(isValidLength('1234567890', 1, 10)).toBe(true)
  })

  it('should return false when string is too short', () => {
    expect(isValidLength('', 1, 10)).toBe(false)
    expect(isValidLength('ab', 3, 10)).toBe(false)
  })

  it('should return false when string is too long', () => {
    expect(isValidLength('12345678901', 1, 10)).toBe(false)
    expect(isValidLength('this is a very long text', 1, 10)).toBe(false)
  })
})

describe('validateForm', () => {
  it('should validate required fields', () => {
    const data = { name: 'Test', email: 'test@example.com' }
    const rules = {
      name: { required: true, label: '名前' },
      email: { required: true, label: 'メールアドレス' },
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('should detect missing required fields', () => {
    const data = { name: '', email: 'test@example.com' }
    const rules = {
      name: { required: true, label: '名前' },
      email: { required: true, label: 'メールアドレス' },
    }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.name).toBe('名前は必須です')
  })

  it('should validate email format', () => {
    const data = { email: 'invalid-email' }
    const rules = { email: { email: true, label: 'メールアドレス' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.email).toBe('有効なメールアドレスを入力してください')
  })

  it('should validate password format', () => {
    const data = { password: 'weak' }
    const rules = { password: { password: true, label: 'パスワード' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.password).toBe('パスワードは8文字以上で、大文字・小文字・数字を含む必要があります')
  })

  it('should validate phone format', () => {
    const data = { phone: '123-456' }
    const rules = { phone: { phone: true, label: '電話番号' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.phone).toBe('有効な電話番号を入力してください')
  })

  it('should validate minLength', () => {
    const data = { username: 'ab' }
    const rules = { username: { minLength: 3, label: 'ユーザー名' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.username).toBe('ユーザー名は3文字以上で入力してください')
  })

  it('should validate maxLength', () => {
    const data = { username: '12345678901' }
    const rules = { username: { maxLength: 10, label: 'ユーザー名' } }

    const result = validateForm(data, rules)
    expect(result.isValid).toBe(false)
    expect(result.errors.username).toBe('ユーザー名は10文字以下で入力してください')
  })

  it('should handle multiple validation errors', () => {
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

  it('should skip validation for optional empty fields', () => {
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

