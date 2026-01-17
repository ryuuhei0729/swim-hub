import { describe, expect, it } from 'vitest'
import {
  calculateAge,
  calculateGoalSetTargetTime,
  getStyleCoefficient
} from '../../utils/goalSetCalculator'

describe('calculateGoalSetTargetTime', () => {
  it('基本的な計算が正しく行われる', () => {
    const params = {
      Y: 60.0, // 100m目標タイム: 60秒
      X2: 20, // 年齢: 20歳
      X3: 3, // 主観的達成度: 3
      X4: 1, // 性別: 男性
      X5: 0, // ゴールセット実施水路: 短水路
      X6: 0, // 競技会の水路: 短水路
      X7: 0 // 種目係数: 自由形
    }

    const result = calculateGoalSetTargetTime(params)
    // 計算式: X1 = (Y - (7.32 - 0.13*X2 + 0.56*X3 - 1.45*X4 - 2.37*X5 + 1.50*X6 + X7)) / 1.72
    // X1 = (60 - (7.32 - 0.13*20 + 0.56*3 - 1.45*1 - 2.37*0 + 1.50*0 + 0)) / 1.72
    // X1 = (60 - (7.32 - 2.6 + 1.68 - 1.45)) / 1.72
    // X1 = (60 - 4.95) / 1.72
    // X1 = 55.05 / 1.72 ≈ 32.01
    expect(result).toBeCloseTo(32.01, 1)
  })

  it('長水路で実施する場合の計算が正しく行われる', () => {
    const params = {
      Y: 65.0,
      X2: 25,
      X3: 3,
      X4: 0, // 女性
      X5: 1, // 長水路
      X6: 1, // 競技会も長水路
      X7: 0 // 自由形
    }

    const result = calculateGoalSetTargetTime(params)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })

  it('背泳ぎの種目係数が正しく適用される', () => {
    const params = {
      Y: 70.0,
      X2: 18,
      X3: 3,
      X4: 1,
      X5: 0,
      X6: 0,
      X7: 1.53 // 背泳ぎ
    }

    const result = calculateGoalSetTargetTime(params)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })

  it('平泳ぎの種目係数が正しく適用される', () => {
    const params = {
      Y: 80.0,
      X2: 22,
      X3: 3,
      X4: 1,
      X5: 0,
      X6: 0,
      X7: 2.34 // 平泳ぎ
    }

    const result = calculateGoalSetTargetTime(params)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(0)
  })

  it('結果が小数点第2位で四捨五入される', () => {
    const params = {
      Y: 60.0,
      X2: 20,
      X3: 3,
      X4: 1,
      X5: 0,
      X6: 0,
      X7: 0
    }

    const result = calculateGoalSetTargetTime(params)
    // 小数点第2位までしかないことを確認
    const decimalPlaces = (result.toString().split('.')[1] || '').length
    expect(decimalPlaces).toBeLessThanOrEqual(2)
  })

  it('X3のデフォルト値が3として使用される', () => {
    const params1 = {
      Y: 60.0,
      X2: 20,
      X3: 3,
      X4: 1,
      X5: 0,
      X6: 0,
      X7: 0
    }

    const params2 = {
      Y: 60.0,
      X2: 20,
      // X3を省略
      X4: 1,
      X5: 0,
      X6: 0,
      X7: 0
    }

    const result1 = calculateGoalSetTargetTime(params1)
    const result2 = calculateGoalSetTargetTime(params2)
    expect(result1).toBe(result2)
  })
})

describe('calculateAge', () => {
  it('正しい年齢を計算できる', () => {
    const today = new Date()
    const birthYear = today.getFullYear() - 20
    const birthday = `${birthYear}-01-15`
    
    const age = calculateAge(birthday)
    expect(age).toBe(20)
  })

  it('今年まだ誕生日を迎えていない場合、年齢が1つ少なくなる', () => {
    const today = new Date()
    const birthYear = today.getFullYear() - 20
    // 今日より後の日付（まだ誕生日を迎えていない）
    // 12月の場合は1月に、それ以外は次の月にする
    let futureMonth = today.getMonth() + 2 // 2ヶ月後を指定
    let futureYear = birthYear
    if (futureMonth > 12) {
      futureMonth = 1
      futureYear = birthYear + 1
    }
    const birthday = `${futureYear}-${String(futureMonth).padStart(2, '0')}-15`
    
    const age = calculateAge(birthday)
    expect(age).toBe(19)
  })

  it('nullを渡すとnullを返す', () => {
    const age = calculateAge(null)
    expect(age).toBeNull()
  })

  it('空文字列を渡すとnullを返す', () => {
    const age = calculateAge('')
    expect(age).toBeNull()
  })

  it('有効な日付文字列を処理できる', () => {
    const birthday = '2000-06-15'
    const age = calculateAge(birthday)
    expect(typeof age).toBe('number')
    expect(age).toBeGreaterThan(0)
  })
})

describe('getStyleCoefficient', () => {
  it('自由形（fr）の係数が0を返す', () => {
    expect(getStyleCoefficient('fr')).toBe(0)
    expect(getStyleCoefficient('Fr')).toBe(0)
    expect(getStyleCoefficient('FR')).toBe(0)
  })

  it('バタフライ（fly）の係数が0を返す', () => {
    expect(getStyleCoefficient('fly')).toBe(0)
    expect(getStyleCoefficient('Fly')).toBe(0)
    expect(getStyleCoefficient('FLY')).toBe(0)
  })

  it('背泳ぎ（ba）の係数が1.53を返す', () => {
    expect(getStyleCoefficient('ba')).toBe(1.53)
    expect(getStyleCoefficient('Ba')).toBe(1.53)
    expect(getStyleCoefficient('BA')).toBe(1.53)
  })

  it('平泳ぎ（br）の係数が2.34を返す', () => {
    expect(getStyleCoefficient('br')).toBe(2.34)
    expect(getStyleCoefficient('Br')).toBe(2.34)
    expect(getStyleCoefficient('BR')).toBe(2.34)
  })

  it('個人メドレー（im）の係数が0を返す（自由形として扱う）', () => {
    expect(getStyleCoefficient('im')).toBe(0)
    expect(getStyleCoefficient('Im')).toBe(0)
    expect(getStyleCoefficient('IM')).toBe(0)
  })

  it('不明な種目の場合、デフォルトで0を返す', () => {
    expect(getStyleCoefficient('unknown')).toBe(0)
    expect(getStyleCoefficient('')).toBe(0)
    expect(getStyleCoefficient('xyz')).toBe(0)
  })
})
