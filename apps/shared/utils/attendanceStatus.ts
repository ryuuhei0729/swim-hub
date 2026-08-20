import { isCompetitionDateInPast } from "./date";
import type { AttendanceStatusType } from "../types/common";

/**
 * 出欠提出ステータスの表示派生。
 *
 * イベント日 (練習・大会いずれも `date`) が過去の場合、DB 上の `attendance_status`
 * に関わらず常に "closed" を返す。それ以外は DB 値をそのまま返す
 * (null/undefined = 「未設定」はそのまま維持し、勝手に open 扱いしない)。
 *
 * 判定は `isCompetitionDateInPast` に委譲する。同関数は `new Date()` を使うため
 * 境界は**実行端末のローカル日付**になる。これが本関数の存在理由: ユーザーごとに
 * タイムゾーンが異なる以上「ユーザーごとの受付終了タイミング」は 1行1値の DB
 * カラムでは表現できず、フロント制御以外に実装しえない。表示の権威は常にここ。
 *
 * DB 側 (migration 20260820000001 の日次ジョブ) は UI を経由しない消費者
 * (通知クエリ・分析・直 SQL) 向けの結果整合にすぎず、境界は UTC-12
 * (Anywhere on Earth) に置いてある。これは「DB で closed」⊆「本関数で closed」
 * という不変条件のため: 本関数は過去日に closed を強制するだけで DB の closed を
 * open に戻さないので、DB が先に閉じるとまだイベント当日のタイムゾーンの
 * ユーザーにも「受付終了」が見えて出欠を出せなくなる。
 *
 * `resolveEntryStatus` (utils/entryStatus.ts) と同型の表示派生。差異は
 * 「未設定 (null) という表示状態が存在するため null を既定値へ丸めない」点のみ。
 *
 * 複数日開催の大会でも境界は開始日 `date` を使う (`end_date` は見ない)。
 * `isCompetitionDateInPast` / `canSubmitAttendance` / entry 系の既存判定がすべて
 * `date` 基準であり、ここだけ `end_date` を採用すると同一イベントで
 * 「エントリーは締切なのに出欠は受付中」という食い違いが生じるため揃える。
 *
 * @param date - イベント日 (ISO 8601 形式の日付文字列) または null/undefined
 * @param attendanceStatus - DB 上の attendance_status または null/undefined
 */
export function resolveAttendanceStatus(
  date: string | null | undefined,
  attendanceStatus: AttendanceStatusType | null | undefined,
): AttendanceStatusType | null {
  if (isCompetitionDateInPast(date)) return "closed";
  return attendanceStatus ?? null;
}
