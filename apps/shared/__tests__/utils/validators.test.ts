import { describe, expect, it } from 'vitest'
import {
  validateTime,
  validateTimeString,
  validateSwimTime,
  validateDate,
  validatePastDate,
  validateFutureDate,
  validateDistance,
  validateRepCount,
  validateSetCount,
  validateCircle,
  validateRequired,
  validateMaxLength,
  validatePoolType,
  validateStroke,
  validateAll,
  ValidationResult,
} from '../../utils/validators'

describe('validators', () => {
  // =============================================================================
  // validateTime
  // =============================================================================
  describe('validateTime', () => {
    it('正の秒数で成功する', () => {
      const result = validateTime(60)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('24時間ちょうど（86400秒）で成功する', () => {
      const result = validateTime(86400)
      expect(result.valid).toBe(true)
    })

    it('小数点を含む秒数で成功する', () => {
      const result = validateTime(65.5)
      expect(result.valid).toBe(true)
    })

    it('0で失敗する', () => {
      const result = validateTime(0)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムは0より大きい必要があります')
    })

    it('負の数で失敗する', () => {
      const result = validateTime(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムは0より大きい必要があります')
    })

    it('24時間を超える（86401秒）で失敗する', () => {
      const result = validateTime(86401)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムは24時間以内である必要があります')
    })

    it('NaNで失敗する', () => {
      const result = validateTime(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが無効です')
    })

    it('Infinityで失敗する', () => {
      const result = validateTime(Infinity)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが無効です')
    })

    it('-Infinityで失敗する', () => {
      const result = validateTime(-Infinity)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが無効です')
    })
  })

  // =============================================================================
  // validateTimeString
  // =============================================================================
  describe('validateTimeString', () => {
    it('"MM:SS.ms"形式で成功する', () => {
      const result = validateTimeString('1:23.45')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('"SS.ms"形式で成功する', () => {
      const result = validateTimeString('23.45')
      expect(result.valid).toBe(true)
    })

    it('分が2桁以上でも成功する', () => {
      const result = validateTimeString('12:34.56')
      expect(result.valid).toBe(true)
    })

    it('ミリ秒が1桁でも成功する', () => {
      const result = validateTimeString('1:23.4')
      expect(result.valid).toBe(true)
    })

    it('前後に空白があっても成功する', () => {
      const result = validateTimeString('  1:23.45  ')
      expect(result.valid).toBe(true)
    })

    it('空文字列で失敗する', () => {
      const result = validateTimeString('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムを入力してください')
    })

    it('空白のみで失敗する', () => {
      const result = validateTimeString('   ')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムを入力してください')
    })

    it('不正な形式で失敗する', () => {
      const result = validateTimeString('invalid')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
    })

    it('ミリ秒がない形式で失敗する', () => {
      const result = validateTimeString('1:23')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
    })

    it('ミリ秒が3桁以上で失敗する', () => {
      const result = validateTimeString('1:23.456')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムの形式が正しくありません（例: 1:23.45 または 23.45）')
    })

    it('nullで失敗する', () => {
      // @ts-expect-error - null をテストするため意図的に型を無視
      const result = validateTimeString(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムを入力してください')
    })

    it('undefinedで失敗する', () => {
      // @ts-expect-error - undefined をテストするため意図的に型を無視
      const result = validateTimeString(undefined)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムを入力してください')
    })
  })

  // =============================================================================
  // validateSwimTime
  // =============================================================================
  describe('validateSwimTime', () => {
    it('正の秒数で成功する', () => {
      const result = validateSwimTime(60)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('1時間ちょうど（3600秒）で成功する', () => {
      const result = validateSwimTime(3600)
      expect(result.valid).toBe(true)
    })

    it('小数点を含む秒数で成功する', () => {
      const result = validateSwimTime(65.5)
      expect(result.valid).toBe(true)
    })

    it('0で失敗する', () => {
      const result = validateSwimTime(0)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムは0より大きい必要があります')
    })

    it('負の数で失敗する', () => {
      const result = validateSwimTime(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムは0より大きい必要があります')
    })

    it('1時間を超える（3601秒）で失敗する', () => {
      const result = validateSwimTime(3601)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが大きすぎます')
    })

    it('NaNで失敗する', () => {
      const result = validateSwimTime(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが無効です')
    })

    it('Infinityで失敗する', () => {
      const result = validateSwimTime(Infinity)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('タイムが無効です')
    })
  })

  // =============================================================================
  // validateDate
  // =============================================================================
  describe('validateDate', () => {
    it('有効な日付文字列で成功する', () => {
      const result = validateDate('2024-01-15')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('ISO形式の日付で成功する', () => {
      const result = validateDate('2024-01-15T10:30:00')
      expect(result.valid).toBe(true)
    })

    it('空文字列で失敗する', () => {
      const result = validateDate('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('日付を入力してください')
    })

    it('無効な日付文字列で失敗する', () => {
      const result = validateDate('not-a-date')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な日付です')
    })

    it('nullで失敗する', () => {
      // @ts-expect-error - null をテストするため意図的に型を無視
      const result = validateDate(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('日付を入力してください')
    })
  })

  // =============================================================================
  // validatePastDate
  // =============================================================================
  describe('validatePastDate', () => {
    it('過去の日付で成功する', () => {
      const result = validatePastDate('2020-01-01')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('今日の日付で成功する', () => {
      const today = new Date().toISOString().split('T')[0]
      const result = validatePastDate(today)
      expect(result.valid).toBe(true)
    })

    it('未来の日付で失敗する', () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      const result = validatePastDate(futureDate.toISOString().split('T')[0])
      expect(result.valid).toBe(false)
      expect(result.error).toBe('未来の日付は指定できません')
    })

    it('空文字列で失敗する', () => {
      const result = validatePastDate('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('日付を入力してください')
    })

    it('無効な日付で失敗する', () => {
      const result = validatePastDate('invalid')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な日付です')
    })
  })

  // =============================================================================
  // validateFutureDate
  // =============================================================================
  describe('validateFutureDate', () => {
    it('未来の日付で成功する', () => {
      const futureDate = new Date()
      futureDate.setFullYear(futureDate.getFullYear() + 1)
      const result = validateFutureDate(futureDate.toISOString().split('T')[0])
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('今日の日付で成功する', () => {
      // ローカル日付を使用（validateFutureDateがローカル時間で比較するため）
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const result = validateFutureDate(today)
      expect(result.valid).toBe(true)
    })

    it('過去の日付で失敗する', () => {
      const result = validateFutureDate('2020-01-01')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('過去の日付は指定できません')
    })

    it('空文字列で失敗する', () => {
      const result = validateFutureDate('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('日付を入力してください')
    })

    it('無効な日付で失敗する', () => {
      const result = validateFutureDate('invalid')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な日付です')
    })
  })

  // =============================================================================
  // validateDistance
  // =============================================================================
  describe('validateDistance', () => {
    it.each([25, 50, 100, 200, 400, 800, 1500])('有効な距離 %dm で成功する', (distance) => {
      const result = validateDistance(distance)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('無効な距離で失敗する', () => {
      const result = validateDistance(75)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('距離は 25, 50, 100, 200, 400, 800, 1500 mのいずれかである必要があります')
    })

    it('0で失敗する', () => {
      const result = validateDistance(0)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('距離は')
    })

    it('負の数で失敗する', () => {
      const result = validateDistance(-50)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('距離は')
    })
  })

  // =============================================================================
  // validateRepCount
  // =============================================================================
  describe('validateRepCount', () => {
    it('1で成功する', () => {
      const result = validateRepCount(1)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('100で成功する', () => {
      const result = validateRepCount(100)
      expect(result.valid).toBe(true)
    })

    it('50で成功する', () => {
      const result = validateRepCount(50)
      expect(result.valid).toBe(true)
    })

    it('0で失敗する', () => {
      const result = validateRepCount(0)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('本数は1以上の整数である必要があります')
    })

    it('負の数で失敗する', () => {
      const result = validateRepCount(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('本数は1以上の整数である必要があります')
    })

    it('101で失敗する', () => {
      const result = validateRepCount(101)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('本数は100以下である必要があります')
    })

    it('小数で失敗する', () => {
      const result = validateRepCount(1.5)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('本数は1以上の整数である必要があります')
    })
  })

  // =============================================================================
  // validateSetCount
  // =============================================================================
  describe('validateSetCount', () => {
    it('1で成功する', () => {
      const result = validateSetCount(1)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('50で成功する', () => {
      const result = validateSetCount(50)
      expect(result.valid).toBe(true)
    })

    it('25で成功する', () => {
      const result = validateSetCount(25)
      expect(result.valid).toBe(true)
    })

    it('0で失敗する', () => {
      const result = validateSetCount(0)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('セット数は1以上の整数である必要があります')
    })

    it('負の数で失敗する', () => {
      const result = validateSetCount(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('セット数は1以上の整数である必要があります')
    })

    it('51で失敗する', () => {
      const result = validateSetCount(51)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('セット数は50以下である必要があります')
    })

    it('小数で失敗する', () => {
      const result = validateSetCount(1.5)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('セット数は1以上の整数である必要があります')
    })
  })

  // =============================================================================
  // validateCircle
  // =============================================================================
  describe('validateCircle', () => {
    it('nullで成功する（オプショナル）', () => {
      const result = validateCircle(null)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('正の秒数で成功する', () => {
      const result = validateCircle(60)
      expect(result.valid).toBe(true)
    })

    it('600秒（10分）で成功する', () => {
      const result = validateCircle(600)
      expect(result.valid).toBe(true)
    })

    it('小数点を含む秒数で成功する', () => {
      const result = validateCircle(90.5)
      expect(result.valid).toBe(true)
    })

    it('0で失敗する', () => {
      const result = validateCircle(0)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('サークルは0より大きい必要があります')
    })

    it('負の数で失敗する', () => {
      const result = validateCircle(-60)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('サークルは0より大きい必要があります')
    })

    it('601秒で失敗する', () => {
      const result = validateCircle(601)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('サークルは10分以内である必要があります')
    })

    it('NaNで失敗する', () => {
      const result = validateCircle(NaN)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('サークルは0より大きい必要があります')
    })

    it('Infinityで失敗する', () => {
      const result = validateCircle(Infinity)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('サークルは0より大きい必要があります')
    })
  })

  // =============================================================================
  // validateRequired
  // =============================================================================
  describe('validateRequired', () => {
    it('有効な文字列で成功する', () => {
      const result = validateRequired('value', 'フィールド名')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('空白を含む文字列で成功する', () => {
      const result = validateRequired('value with spaces', 'フィールド名')
      expect(result.valid).toBe(true)
    })

    it('空文字列で失敗する', () => {
      const result = validateRequired('', 'フィールド名')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('フィールド名を入力してください')
    })

    it('空白のみで失敗する', () => {
      const result = validateRequired('   ', 'フィールド名')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('フィールド名を入力してください')
    })

    it('nullで失敗する', () => {
      // @ts-expect-error - null をテストするため意図的に型を無視
      const result = validateRequired(null, 'フィールド名')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('フィールド名を入力してください')
    })

    it('undefinedで失敗する', () => {
      // @ts-expect-error - undefined をテストするため意図的に型を無視
      const result = validateRequired(undefined, 'フィールド名')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('フィールド名を入力してください')
    })
  })

  // =============================================================================
  // validateMaxLength
  // =============================================================================
  describe('validateMaxLength', () => {
    it('最大文字数以内で成功する', () => {
      const result = validateMaxLength('abc', 5, 'フィールド名')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('最大文字数ちょうどで成功する', () => {
      const result = validateMaxLength('abcde', 5, 'フィールド名')
      expect(result.valid).toBe(true)
    })

    it('空文字列で成功する', () => {
      const result = validateMaxLength('', 5, 'フィールド名')
      expect(result.valid).toBe(true)
    })

    it('nullで成功する（undefinedと同様）', () => {
      // @ts-expect-error - null をテストするため意図的に型を無視
      const result = validateMaxLength(null, 5, 'フィールド名')
      expect(result.valid).toBe(true)
    })

    it('最大文字数を超えると失敗する', () => {
      const result = validateMaxLength('abcdef', 5, 'フィールド名')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('フィールド名は5文字以内で入力してください')
    })

    it('日本語文字でも正しくカウントされる', () => {
      const result = validateMaxLength('あいうえお', 5, 'フィールド名')
      expect(result.valid).toBe(true)

      const result2 = validateMaxLength('あいうえおか', 5, 'フィールド名')
      expect(result2.valid).toBe(false)
      expect(result2.error).toBe('フィールド名は5文字以内で入力してください')
    })
  })

  // =============================================================================
  // validatePoolType
  // =============================================================================
  describe('validatePoolType', () => {
    it('"long"で成功する', () => {
      const result = validatePoolType('long')
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('"short"で成功する', () => {
      const result = validatePoolType('short')
      expect(result.valid).toBe(true)
    })

    it('無効な値で失敗する', () => {
      const result = validatePoolType('medium')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('プール種別が無効です')
    })

    it('空文字列で失敗する', () => {
      const result = validatePoolType('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('プール種別が無効です')
    })

    it('大文字で失敗する', () => {
      const result = validatePoolType('Long')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('プール種別が無効です')
    })
  })

  // =============================================================================
  // validateStroke
  // =============================================================================
  describe('validateStroke', () => {
    it.each([
      'freestyle',
      'backstroke',
      'breaststroke',
      'butterfly',
      'individual_medley',
    ])('有効な泳法 "%s" で成功する', (stroke) => {
      const result = validateStroke(stroke)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('無効な泳法で失敗する', () => {
      const result = validateStroke('sidestroke')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な泳法です')
    })

    it('空文字列で失敗する', () => {
      const result = validateStroke('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な泳法です')
    })

    it('大文字で失敗する', () => {
      const result = validateStroke('Freestyle')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な泳法です')
    })

    it('日本語名で失敗する', () => {
      const result = validateStroke('自由形')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('無効な泳法です')
    })
  })

  // =============================================================================
  // validateAll
  // =============================================================================
  describe('validateAll', () => {
    it('すべて成功する場合は成功を返す', () => {
      const validations: ValidationResult[] = [
        { valid: true },
        { valid: true },
        { valid: true },
      ]
      const result = validateAll(validations)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('空の配列で成功を返す', () => {
      const result = validateAll([])
      expect(result.valid).toBe(true)
    })

    it('最初の失敗を返す', () => {
      const validations: ValidationResult[] = [
        { valid: true },
        { valid: false, error: 'エラー1' },
        { valid: false, error: 'エラー2' },
      ]
      const result = validateAll(validations)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('エラー1')
    })

    it('最初のバリデーションが失敗した場合はそれを返す', () => {
      const validations: ValidationResult[] = [
        { valid: false, error: '最初のエラー' },
        { valid: true },
        { valid: true },
      ]
      const result = validateAll(validations)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('最初のエラー')
    })

    it('実際のバリデーション関数と組み合わせて動作する', () => {
      const validations = [
        validateTime(60),
        validateDistance(50),
        validateStroke('freestyle'),
      ]
      const result = validateAll(validations)
      expect(result.valid).toBe(true)
    })

    it('実際のバリデーション関数で失敗を検出する', () => {
      const validations = [
        validateTime(60),
        validateDistance(75), // 無効な距離
        validateStroke('freestyle'),
      ]
      const result = validateAll(validations)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('距離は')
    })
  })
})
