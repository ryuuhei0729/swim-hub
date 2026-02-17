export {
  formatTime,
  formatTimeAverage,
  formatTimeBest,
  parseTimeToSeconds,
  formatDate,
  formatNumber,
  formatPercentage,
  formatStroke,
  formatRole,
  formatAttendanceStatus,
} from './formatters'
export type { DateStyle } from './formatters'

export {
  isValidEmail,
  isValidPassword,
  isValidPhoneNumber,
  isValidTime,
  isValidDate,
  isRequired,
  isInRange,
  isValidLength,
  validateForm,
} from './validators'
export type { ValidationResult, ValidationRule } from './validators'

export { getSafeRedirectUrl } from './redirect'

// 共通ユーティリティ関数
export { cn } from './cn'

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9)
}

export const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export const truncate = (str: string, length: number): string => {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}
