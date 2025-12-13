import * as holiday_jp from '@holiday-jp/holiday_jp'
import { format } from 'date-fns'

/**
 * 指定された日付が日本の祝日かどうかを判定
 * @param date 判定する日付
 * @returns 祝日の場合はtrue、そうでなければfalse
 */
export function isHoliday(date: Date): boolean {
  const dateStr = format(date, 'yyyy-MM-dd')
  const holidays = holiday_jp.between(new Date(dateStr), new Date(dateStr))
  return holidays.length > 0
}
