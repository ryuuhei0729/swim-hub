// =============================================================================
// リレーのチーム記録 型定義 - Swim Hub共通パッケージ
//
// この型はスプリントの制約ハーネスとして PM が確定させたものであり、
// web / mobile / DB の3者がここに従う。フィールドの追加・削除は PM 承認を要する。
//
// 【なぜ新しいテーブルが必要か】
// 現状リレー1本は `records` の個別4行として保存され、DB 全体で relay に関係する列は
// `records.is_relaying` / `entries.is_relaying` の boolean 2つだけ。組を識別する ID も
// 第N泳者の情報も総合タイムの列も無い。読み取り時に「created_at 昇順で4行連続 かつ
// is_relaying が [false,true,true,true] かつ style_id の組が RELAY_EVENTS に一致」という
// ヒューリスティックで復元しているため:
//   - 取得順に依存する。ランキングは ORDER BY time で引くので4連続の並びが崩れ、
//     別チームの泳者が混ざった架空の総合タイムが算出される (エラーは出ない)
//   - 同一大会に2チーム出すと8行がインターリーブして誤ペアリングする
//   - 3人/5人の変則編成は4連続前提なので崩れる
//   - 総合タイムがレグの単純和しか表現できず、公式記録とのズレを持てない
// =============================================================================

/** リレーの種類。`relayEvents.ts` の RelayEventId から導出できる分解済みの事実。 */
export type RelayKind = "free" | "medley";

/**
 * リレーの性別区分。
 *
 * `users.gender` (0|1) をそのまま使わない理由が2つある:
 *   1. 混合リレー (mixed) を表現できない
 *   2. 導出にするとメンバーが後からプロフィールの性別を変えたとき、過去のリレー記録が
 *      黙って別区分へ移動する。`user_id` が退会で SET NULL になると導出そのものが不能になる
 * よって書き込み時に4レグの gender から prefill し、ユーザーが上書きできる値として保存する。
 */
export type RelayGenderCategory = "male" | "female" | "mixed";

/** リレーの1レグ。第N泳者 = `legIndex + 1`。 */
export interface RelayRecordLeg {
  id: string;
  /** 0-based。DB に永続化する (これまで TypeScript 上にしか存在しなかった)。 */
  legIndex: number;
  /** 退会時は `ON DELETE SET NULL`。チーム記録としての行は残す。 */
  userId: string | null;
  /** そのレグの個人種目 `styles.id`。メドレーなら4レグで別々の値になる。 */
  styleId: number;
  /**
   * 区間タイム。**通算タイムではない。**
   * 通算は `calcCumulativeTimes()` で導出する。過去に通算値が混入して lap が崩れた前科がある。
   */
  legTime: number;
  reactionTime: number | null;
  /**
   * 元になった `records` 行。既存の `is_relaying` records は置換せず上に被せるため、
   * 個人の「引き継ぎありベストタイム」機能を壊さない。バックフィルの冪等性判定にも使う。
   */
  recordId: string | null;
}

/** リレー1本 = 1行。チームの記録として保存する。 */
export interface RelayRecord {
  id: string;
  teamId: string;
  /**
   * 紐づく大会。DB の FK は **`ON DELETE CASCADE`**。
   *
   * 大会を削除するとリレー記録も消える。個人記録 (`records.competition_id` は
   * `ON DELETE SET NULL`) と非対称だが意図的で、理由は「リレー記録には削除 UI が
   * 存在せず、記録入力画面は `competition_id` で引くため NULL 行に永久に到達できない」
   * こと。SET NULL のままだとランキングに「大会: なし」で出続ける消えないゴースト行が
   * できる (Reviewer W-2)。
   *
   * 列が nullable なのは将来「大会に紐づかないリレー記録」を直接入力できるように
   * するための予約。現状その行を生む経路は無い。
   *
   * ⚠️ **この予約を実装するときは、ランキングの年度注意書きも一緒に戻すこと。**
   * `apps/web/components/team/rankings/TeamRelayRankings.tsx` は
   * 「`competition_id = NULL` のリレー記録が存在しない」ことを根拠に
   * `period.fiscalYearNote` (「年度を選ぶと大会に紐づかない記録は含まれません」)
   * を**出していない**。この予約を実装した瞬間、年度で絞ると落ちる行が実在
   * するようになるので、注意書きが無いままだと「記録が消えた」の説明が付かない
   * (mobile 側の同等画面も同時に見ること)。
   * 片方だけ変えると、この docstring かあちらのコメントのどちらかが静かに嘘になる。
   */
  competitionId: string | null;
  relayKind: RelayKind;
  /** 1レグの距離 (25/50/100/200)。`relayKind` と対で RelayEventId を一意に決める。 */
  legDistance: number;
  legCount: number;
  poolType: number;
  genderCategory: RelayGenderCategory;
  /**
   * 公式の総合タイム。`legs[].legTime` の総和と一致するのが正常だが、
   * **総和ではなくこの保存値を正とする** (公式記録が総和と1/100秒ずれる場合があるため)。
   */
  totalTime: number;
  createdAt: string | null;
  legs: RelayRecordLeg[];
}

// note フィールドは意図的に持たない。
// 当初は個人記録 (`records.note`) に倣って `relay_records.note` を置いたが、
// 非 NULL を書き込む経路が UI・API・バックフィルのどこにも存在せず、
// 「note を失わないための既存行の自然キー照合」という 27 行の機構ごと
// 存在しない値についての防御になっていた (Reviewer B-1)。
// DB 側の列も撤去済み。将来メモを持たせるなら、列と入力 UI と
// 引き継ぎ規則を同じスプリントで揃えて入れること。
