// バリデーション関数

// メールアドレスの検証
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// パスワードの検証
export const isValidPassword = (password: string): boolean => {
  // 最低8文字、大文字・小文字・数字を含む
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
  return passwordRegex.test(password)
}

// 電話番号の検証（日本の形式）
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^0\d{1,4}-\d{1,4}-\d{4}$|^0\d{9,10}$/
  return phoneRegex.test(phone)
}

// 時間の検証（MM:SS.ss形式）
export const isValidTime = (time: string): boolean => {
  const timeRegex = /^([0-5]?\d):([0-5]\d)\.(\d{2})$/
  return timeRegex.test(time)
}

// 日付の検証
export const isValidDate = (date: string): boolean => {
  const d = new Date(date)
  return d instanceof Date && !isNaN(d.getTime())
}

// 必須フィールドの検証
export const isRequired = (value: string | number | null | undefined): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  return value !== null && value !== undefined
}

// 数値範囲の検証
export const isInRange = (value: number, min: number, max: number): boolean => {
  return value >= min && value <= max
}

// 文字列長の検証
export const isValidLength = (value: string, min: number, max: number): boolean => {
  return value.length >= min && value.length <= max
}

// フォームバリデーション結果の型
export interface ValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

// 包括的なフォームバリデーション
export const validateForm = (data: Record<string, any>, rules: Record<string, any>): ValidationResult => {
  const errors: Record<string, string> = {}
  
  Object.keys(rules).forEach(field => {
    const value = data[field]
    const rule = rules[field]
    
    if (rule.required && !isRequired(value)) {
      errors[field] = `${rule.label || field}は必須です`
      return
    }
    
    if (value && rule.email && !isValidEmail(value)) {
      errors[field] = '有効なメールアドレスを入力してください'
      return
    }
    
    if (value && rule.password && !isValidPassword(value)) {
      errors[field] = 'パスワードは8文字以上で、大文字・小文字・数字を含む必要があります'
      return
    }
    
    if (value && rule.phone && !isValidPhoneNumber(value)) {
      errors[field] = '有効な電話番号を入力してください'
      return
    }
    
    if (value && rule.minLength && value.length < rule.minLength) {
      errors[field] = `${rule.label || field}は${rule.minLength}文字以上で入力してください`
      return
    }
    
    if (value && rule.maxLength && value.length > rule.maxLength) {
      errors[field] = `${rule.label || field}は${rule.maxLength}文字以下で入力してください`
      return
    }
  })
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}
