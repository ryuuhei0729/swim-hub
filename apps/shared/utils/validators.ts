// =============================================================================
// バリデーションユーティリティ - Swim Hub共通パッケージ
// =============================================================================

/**
 * バリデーション結果の型定義
 */
export interface ValidationResult {
  valid: boolean
  error?: string
}

// ヘルパー関数
const success = (): ValidationResult => ({ valid: true })
const failure = (error: string): ValidationResult => ({ valid: false, error })

// =============================================================================
// 時間バリデーション
// =============================================================================

/**
 * スイムタイム（秒数）のバリデーション
 *
 * @param seconds - 秒数
 * @returns バリデーション結果
 */
export function validateTime(seconds: number): ValidationResult {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return failure('タイムが無効です')
  }
  if (seconds <= 0) {
    return failure('タイムは0より大きい必要があります')
  }
  if (seconds > 86400) {
    return failure('タイムは24時間以内である必要があります')
  }
  return success()
}

/**
 * 時間文字列のバリデーション（"MM:SS.ms" または "SS.ms" 形式）
 *
 * @param timeString - 時間文字列
 * @returns バリデーション結果
 */
export function validateTimeString(timeString: string): ValidationResult {
  if (!timeString || typeof timeString !== 'string') {
    return failure('タイムを入力してください')
  }

  const trimmed = timeString.trim()
  if (trimmed === '') {
    return failure('タイムを入力してください')
  }

  // "MM:SS.ms" 形式
  const fullPattern = /^(\d+):(\d{1,2})\.(\d{1,2})$/
  // "SS.ms" 形式
  const shortPattern = /^(\d+)\.(\d{1,2})$/

  if (!fullPattern.test(trimmed) && !shortPattern.test(trimmed)) {
    return failure('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
  }

  return success()
}

/**
 * 競泳タイム（1時間以内）のバリデーション
 *
 * @param seconds - 秒数
 * @returns バリデーション結果
 */
export function validateSwimTime(seconds: number): ValidationResult {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
    return failure('タイムが無効です')
  }
  if (seconds <= 0) {
    return failure('タイムは0より大きい必要があります')
  }
  if (seconds > 3600) {
    return failure('タイムが大きすぎます')
  }
  return success()
}

// =============================================================================
// 日付バリデーション
// =============================================================================

/**
 * 日付のバリデーション
 *
 * @param dateString - 日付文字列
 * @returns バリデーション結果
 */
export function validateDate(dateString: string): ValidationResult {
  if (!dateString) {
    return failure('日付を入力してください')
  }

  const date = new Date(dateString)
  if (isNaN(date.getTime())) {
    return failure('無効な日付です')
  }

  return success()
}

/**
 * 過去日付のバリデーション（未来日付を禁止）
 *
 * @param dateString - 日付文字列
 * @returns バリデーション結果
 */
export function validatePastDate(dateString: string): ValidationResult {
  const dateResult = validateDate(dateString)
  if (!dateResult.valid) return dateResult

  const date = new Date(dateString)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  if (date > today) {
    return failure('未来の日付は指定できません')
  }

  return success()
}

/**
 * 未来日付のバリデーション（過去日付を禁止）
 *
 * @param dateString - 日付文字列
 * @returns バリデーション結果
 */
export function validateFutureDate(dateString: string): ValidationResult {
  const dateResult = validateDate(dateString)
  if (!dateResult.valid) return dateResult

  const date = new Date(dateString)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (date < today) {
    return failure('過去の日付は指定できません')
  }

  return success()
}

// =============================================================================
// 距離・数量バリデーション
// =============================================================================

/**
 * 競泳距離のバリデーション
 *
 * @param distance - 距離（メートル）
 * @returns バリデーション結果
 */
export function validateDistance(distance: number): ValidationResult {
  const validDistances = [25, 50, 100, 200, 400, 800, 1500]

  if (!validDistances.includes(distance)) {
    return failure(`距離は ${validDistances.join(', ')} mのいずれかである必要があります`)
  }

  return success()
}

/**
 * 本数（rep_count）のバリデーション
 *
 * @param count - 本数
 * @returns バリデーション結果
 */
export function validateRepCount(count: number): ValidationResult {
  if (!Number.isInteger(count) || count < 1) {
    return failure('本数は1以上の整数である必要があります')
  }
  if (count > 100) {
    return failure('本数は100以下である必要があります')
  }
  return success()
}

/**
 * セット数のバリデーション
 *
 * @param count - セット数
 * @returns バリデーション結果
 */
export function validateSetCount(count: number): ValidationResult {
  if (!Number.isInteger(count) || count < 1) {
    return failure('セット数は1以上の整数である必要があります')
  }
  if (count > 50) {
    return failure('セット数は50以下である必要があります')
  }
  return success()
}

/**
 * サークル（秒）のバリデーション
 *
 * @param seconds - サークル秒数（nullはオプショナル）
 * @returns バリデーション結果
 */
export function validateCircle(seconds: number | null): ValidationResult {
  if (seconds === null) return success()

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return failure('サークルは0より大きい必要があります')
  }
  if (seconds > 600) {
    return failure('サークルは10分以内である必要があります')
  }
  return success()
}

// =============================================================================
// 文字列バリデーション
// =============================================================================

/**
 * 必須文字列のバリデーション
 *
 * @param value - 値
 * @param fieldName - フィールド名
 * @returns バリデーション結果
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim() === '') {
    return failure(`${fieldName}を入力してください`)
  }
  return success()
}

/**
 * 最大文字数のバリデーション
 *
 * @param value - 値
 * @param maxLength - 最大文字数
 * @param fieldName - フィールド名
 * @returns バリデーション結果
 */
export function validateMaxLength(
  value: string,
  maxLength: number,
  fieldName: string
): ValidationResult {
  if (value && value.length > maxLength) {
    return failure(`${fieldName}は${maxLength}文字以内で入力してください`)
  }
  return success()
}

// =============================================================================
// その他のバリデーション
// =============================================================================

/**
 * プール種別のバリデーション
 *
 * @param poolType - プール種別
 * @returns バリデーション結果
 */
export function validatePoolType(poolType: string): ValidationResult {
  if (poolType !== 'long' && poolType !== 'short') {
    return failure('プール種別が無効です')
  }
  return success()
}

/**
 * 泳法のバリデーション
 *
 * @param stroke - 泳法
 * @returns バリデーション結果
 */
export function validateStroke(stroke: string): ValidationResult {
  const validStrokes = ['freestyle', 'backstroke', 'breaststroke', 'butterfly', 'individual_medley']

  if (!validStrokes.includes(stroke)) {
    return failure('無効な泳法です')
  }

  return success()
}

// =============================================================================
// 複合バリデーション
// =============================================================================

/**
 * 複数のバリデーションを実行
 *
 * @param validations - バリデーション結果の配列
 * @returns 最初に失敗したバリデーション結果、または成功
 */
export function validateAll(validations: ValidationResult[]): ValidationResult {
  for (const result of validations) {
    if (!result.valid) return result
  }
  return success()
}
