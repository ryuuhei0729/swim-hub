// =============================================================================
// ゴールセット逆算ロジック
// 100m目標タイムから、50m×6本×3セットで出すべき平均タイムを逆算
// =============================================================================

/**
 * 予測式の係数
 * Y = 7.32 + 1.72X1 - 0.13X2 + 0.56X3 - 1.45X4 - 2.37X5 + 1.50X6 + 1.53X7 + 2.34X8
 * 
 * 外部サイト（https://b-swimmer.sakura.ne.jp/goal-sets-racetime.html）の実装に合わせて、
 * 種目を1つの変数X7で表現する方式を使用
 * - 自由形: 0
 * - バタフライ: 0.00001
 * - 背泳ぎ: 1.53
 * - 平泳ぎ: 2.34
 */
interface PredictionParams {
  Y: number // 100m目標タイム
  X2: number // 年齢
  X3?: number // 主観的達成度（固定値: 3、省略時は3が使用される）
  X4: number // 性別（男=1, 女=0）
  X5: number // ゴールセット実施水路（長水路=1, 短水路=0）
  X6: number // 競技会の水路（長水路=1, 短水路=0）
  X7: number // 種目係数（自由形=0, バタフライ=0.00001, 背泳ぎ=1.53, 平泳ぎ=2.34）
}

/**
 * 100m目標タイムから、50m平均タイム（X1）を逆算
 * 外部サイトの実装に合わせた計算式:
 * X1 = (Y - (7.32 - 0.13*X2 + 0.56*X3 - 1.45*X4 - 2.37*X5 + 1.50*X6 + X7)) / 1.72
 * 
 * 展開すると:
 * X1 = (Y - 7.32 + 0.13*X2 - 0.56*X3 + 1.45*X4 + 2.37*X5 - 1.50*X6 - X7) / 1.72
 */
export function calculateGoalSetTargetTime(params: PredictionParams): number {
  const {
    Y,
    X2, // 年齢
    X3 = 3, // 主観的達成度（固定値: 3）
    X4, // 性別
    X5, // ゴールセット実施水路
    X6, // 競技会の水路
    X7 // 種目係数
  } = params

  // 外部サイトの実装に合わせた逆算式
  // X1 = (Y - (7.32 - 0.13*X2 + 0.56*X3 - 1.45*X4 - 2.37*X5 + 1.50*X6 + X7)) / 1.72
  const X1 = (Y - (7.32 - 0.13 * X2 + 0.56 * X3 - 1.45 * X4 - 2.37 * X5 + 1.50 * X6 + X7)) / 1.72

  // 小数点第2位で四捨五入
  return Number(X1.toFixed(2))
}

/**
 * 年齢を計算（birthdayから）
 */
export function calculateAge(birthday: string | null): number | null {
  if (!birthday) return null

  const birthDate = new Date(birthday)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  return age
}

/**
 * 種目から種目係数（X7）を取得
 * 外部サイトの実装に合わせて、種目を1つの変数で表現
 * @param style - 種目のstyle値（'ba' | 'br' | 'fr' | 'fly' | 'im'）
 * @returns 種目係数（自由形,バタフライ=0, 背泳ぎ=1.53, 平泳ぎ=2.34）
 */
export function getStyleCoefficient(style: string): number {
  const styleLower = style.toLowerCase()
  
  switch (styleLower) {
    case 'ba': // 背泳ぎ
      return 1.53
    case 'br': // 平泳ぎ
      return 2.34
    case 'fly': // バタフライ
      return 0
    case 'fr': // 自由形
    case 'im': // 個人メドレー（自由形として扱う）
    default:
      return 0
  }
}
