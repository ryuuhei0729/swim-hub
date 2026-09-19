// =============================================================================
// リレーのチーム記録の保存ロジック (純粋関数) - Swim Hub共通パッケージ
// =============================================================================
//
// web (`apps/web/app/.../records/_client/RecordClient.tsx`) と
// mobile (`apps/mobile/screens/TeamRecordStyleDetailScreen.tsx`) の
// **どちらも同じリレー入力 UI を持ち、同じ relay_records を書く**。
// 保存する値の組み立て (計画の型) と性別区分の prefill をここに集約する。
// Supabase クライアントには触らない — 実際の書き込み (insert → 古い行の delete、
// 巻き戻し、全成功時のみ削除) は `../api/teams/relayRecords.ts` の
// `TeamRelayRecordsAPI.replace()` が唯一の実装元である。
//
// 型契約は `../types/relayRecord.ts` (PM 確定)。
// =============================================================================

import type { RelayGenderCategory } from "../types/relayRecord";
import type { RelayEventId } from "./relayEvents";

/** 保存する1レグ。`legTime` は **区間タイム** で通算タイムではない。 */
export interface RelaySaveLegPlan {
  /** 0-based。第N泳者 = `legIndex + 1`。 */
  legIndex: number;
  userId: string;
  /** そのレグの個人種目 `styles.id`。メドレーなら4レグで別々の値になる。 */
  styleId: number;
  /** 区間タイム (秒)。通算は `calcCumulativeTimes()` で導出する。 */
  legTime: number;
  reactionTime: number | null;
  /**
   * 呼び出し側が `records` の insert 結果 (採番された id の配列) と突き合わせる
   * ための添字。shared 側はこの値の意味を解釈しない。
   */
  validRecordIndex: number;
}

/** 保存するリレー1本。 */
export interface RelaySavePlan {
  relayEventId: RelayEventId;
  /**
   * 総合タイム (秒)。`legs[].legTime` の総和ではなく
   * `calcCumulativeTimes()` の最終要素をそのまま使う
   * (丸めを二重に行わないため。根拠は `RelayRecord.totalTime` の docstring)。
   */
  totalTime: number;
  legCount: number;
  genderCategory: RelayGenderCategory;
  legs: RelaySaveLegPlan[];
}

/**
 * 4レグの泳者から性別区分を prefill する。
 *
 * `relay_records.gender_category` は **導出ではなく保存値** である
 * (根拠は `relayRecord.ts` の `RelayGenderCategory` の docstring)。
 * ここで決めるのは書き込み時の初期値だけで、以後この値が正となる。
 *
 * 判定:
 *   - 全員の性別が判明していて全員 0 → `male`
 *   - 全員の性別が判明していて全員 1 → `female`
 *   - それ以外 (混在、または1人でも性別不明) → `mixed`
 *
 * ⚠️ 性別不明 (メンバー一覧に居ない user_id) を `?? 0` で男性に寄せてはいけない。
 *    `users.gender` は DB が NOT NULL なので「メンバー一覧に載っているユーザーの
 *    性別が undefined」は起こらず、undefined になるのは
 *    **そもそも一覧に無い user_id を渡された場合だけ**である。
 *    そこで 0 を入れると「不明」が「男性」として静かに確定してしまう。
 *    混在扱い (`mixed`) は「一様ではない」という意味で不明を正しく含む。
 *
 * ⚠️ 泳者が0人の場合も `mixed` を返す。呼び出し側はレグが1件も無い計画を
 *    保存しないため、この戻り値が DB に入ることはない。
 */
export function resolveRelayGenderCategory(
  legUserIds: readonly string[],
  genderByUserId: ReadonlyMap<string, number>,
): RelayGenderCategory {
  if (legUserIds.length === 0) return "mixed";

  let allMale = true;
  let allFemale = true;

  for (const userId of legUserIds) {
    const gender = genderByUserId.get(userId);
    if (gender === undefined) return "mixed";
    if (gender !== 0) allMale = false;
    if (gender !== 1) allFemale = false;
  }

  if (allMale) return "male";
  if (allFemale) return "female";
  return "mixed";
}
