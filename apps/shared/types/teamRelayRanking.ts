// =============================================================================
// チームリレーランキング型定義 - Swim Hub共通パッケージ
//
// 第1弾の `./teamRanking.ts` (個人種目) と同じ流儀。web / mobile の両実装が
// ここに従う。フィールドの追加・削除は PM 承認を要する。
//
// ⚠️ 保存の型契約は `./relayRecord.ts` (PM 確定) にある。こちらは
//    **RPC `get_team_relay_rankings` の境界の型**であって保存の型ではない。
//    RPC は created_by を返さず、代わりに大会名・大会日とレグの配列を返すので
//    `RelayRecord` とは別の形になる。
// =============================================================================

import type { PoolType } from "./common";
import type { RelayGenderCategory, RelayKind } from "./relayRecord";
import type { RankingPeriod } from "./teamRanking";

/**
 * 性別区分フィルタ。**男子 / 女子 / 混合の3択で、既定は男子**。
 *
 * DB 値 (`RelayGenderCategory`) と完全に一致する。「すべて」は意図的に持たない
 * — 区分をまたいで1つの順位表にすると競技上の意味が無く、男女混合のリレーは
 * `mixed` という実在の区分で表現できる。
 *
 * RPC (`get_team_relay_rankings`) の `p_gender_category` は NULL で「すべて」を
 * 意味する実装が残っているが、**UI からは NULL を送らない**。RPC 側を狭めて
 * いないのは、将来「すべて」を戻すときに migration が要らないようにするため。
 *
 * `RelayGenderCategory` のエイリアスとして残しているのは、フィルタの語彙 (UI が
 * 選ぶ値) と DB 列の語彙を型の上で区別しておくため。片方だけ広げたくなったとき
 * (例: 「すべて」の復活) に触る場所がここ1つで済む。
 */
export type RelayRankingGenderFilter = RelayGenderCategory;

/**
 * リレーランキングの絞り込み条件。
 *
 * `relayKind` × `legDistance` が種目を一意に決めるので `RelayEventId` は持たない
 * (DB も `relay_event_id` 列を持たない。理由は
 *  `apps/shared/utils/relayEvents.ts` の分解セクションのコメント)。
 *
 * ⚠️ **集計モード (aggregation) は持たない。** リレーには「1チーム1行」の概念が
 * 無いので常に全レースを列挙する。当初 `teamBest` (最速1本) を用意したが、
 * 性別区分をまたいで最速1本だけを返して意味が壊れており、UI から切り替える経路も
 * 0件の到達不能コードだったため RPC の引数ごと削除した
 * (性別区分ごとの最速は `PARTITION BY gender_category` を含めて別途設計する)。
 */
export interface TeamRelayRankingFilters {
  relayKind: RelayKind;
  /**
   * 1レグの距離 (m)。合計距離ではない。
   *
   * **絞り込みの距離軸はこれだけで、`legCount` を持たない。**
   * 現状 `RELAY_EVENTS` (`utils/relayEvents.ts`) は7種目すべて4レグで、
   * `relay_kind` / `leg_distance` は `fromRelayEventId()` 経由でしか書かれない。
   * 非4レグのリレー記録を作る経路が存在しないため、距離だけで種目が一意に決まる。
   *
   * ⚠️ `relay_records.leg_count` は `DEFAULT 4 CHECK (leg_count BETWEEN 2 AND 8)`
   * なので DB は 2x / 8x を受理する。**`RELAY_EVENTS` に 2x や 8x を追加するなら、
   * この型と RPC の `p_leg_distance` に `legCount` 軸を足すまで一緒に倒すこと。**
   * 片方だけ足すと同じ距離の 4x と 8x が1つのランキングに混ざる
   * (UI の距離選択肢の value も `legDistance` だけなので衝突する)。
   */
  legDistance: number;
  poolType: PoolType;
  genderCategory: RelayRankingGenderFilter;
  /**
   * 期間。個人種目版と**同じ型を再利用する** (`RankingPeriod`)。
   *
   * 🚨 ここに union を書き写さないこと。以前はインラインで
   * `{kind:"allTime"} | {kind:"fiscalYear"; year:number}` と写していたため、
   * `RankingPeriod` に `fiscalYearOrEarlier` を足したときにリレー側だけが
   * 古い2値のまま残り、型エラーで初めて気づいた。期間の軸は個人・リレーで
   * 同一 (どちらの RPC も `p_fiscal_year` を同じ意味で受ける) なので、
   * 定義元は1つでよい。
   */
  period: RankingPeriod;
}

/** RPC が返す `legs` JSONB の1要素を写した型。 */
export interface TeamRelayRankingLeg {
  legId: string;
  /** 0-based。第N泳者 = `legIndex + 1`。 */
  legIndex: number;
  /** 退会した泳者は `ON DELETE SET NULL` で null になる。 */
  userId: string | null;
  /**
   * 泳者名。`userId` が null (退会) の場合は null。
   * **null でも行を落とさない** — レグが欠けると通算タイムの導出が壊れる。
   */
  displayName: string | null;
  // プロフィール画像 (avatarPath) は**持たない**。ラップ表示に画像を出さない
  // 方針になったため、RPC の legs (jsonb_build_object) からも落としてある
  // (supabase/migrations/20260908000100)。ここに足しても値は来ない。
  styleId: number;
  /**
   * そのレグの泳法 (`styles.style`)。canonical 化は表示側で行う。
   * メドレーリレーではレグごとに異なる。
   */
  style: string;
  /**
   * 区間タイム (秒)。**通算タイムではない。**
   * 通算は `calcCumulativeTimes()` で導出する (DB / API に二重保存しない)。
   */
  legTime: number;
  reactionTime: number | null;
}

/**
 * RPC `get_team_relay_rankings` が返す1行 (順位付与前)。
 * snake_case の RPC 戻り値を camelCase に写した境界の型。
 */
export interface TeamRelayRankingRecord {
  relayRecordId: string;
  relayKind: RelayKind;
  legDistance: number;
  legCount: number;
  /**
   * RPC は `rr.pool_type = p_pool_type` の厳密一致で絞るため、ここに返る値は
   * 呼び出し側が渡した `PoolType` と恒等になる。よって受け取り側で再検証しない
   * (検証はトートロジーで、失敗させる余地が無いのに行を落とす経路だけを作る)。
   */
  poolType: number;
  genderCategory: RelayGenderCategory;
  /**
   * 公式の総合タイム (秒)。**`legs[].legTime` の総和で置き換えないこと。**
   * 公式記録が総和と 1/100 秒ずれる場合があり、保存値を正とする
   * (根拠は `relayRecord.ts` の `RelayRecord.totalTime` の docstring)。
   */
  totalTime: number;
  /**
   * 紐づく大会。
   *
   * ⚠️ **現状これが null になる行は存在しない。**
   * アプリの保存経路は常に大会 id を送り、バックフィルは `competition_id` が
   * NULL のグループを推測せずスキップし、FK は `ON DELETE CASCADE` なので
   * 大会削除で NULL 化されることもない。
   * null 許容は「大会に紐づかないリレー記録を直接入力する」機能 (第4弾以降) の
   * ための**予約**である。予約を撤回するなら DB の `competition_id` を NOT NULL に
   * し、下の3フィールドの null 分岐 (`relayCreatedAt` は分岐専用の列なので
   * フィールドごと) も同時に撤去すること。片方だけ残すと死んだ分岐になる。
   */
  competitionId: string | null;
  /** 大会名。null になる条件は `competitionId` の docstring と同じ (現状 0 件)。 */
  competitionTitle: string | null;
  /** 大会実施日 (YYYY-MM-DD)。null になる条件は `competitionId` と同じ (現状 0 件)。 */
  competitionDate: string | null;
  /**
   * リレー記録行の作成日時。`competitionDate` が null のときの表示フォールバック
   * にのみ使う (= 現状どの行でも表示に使われない。上記の予約が実装されたときに
   * 初めて通る)。`relay_records.created_at` は DEFAULT now() を持つが
   * **NOT NULL 制約が無い**ため null を取りうる。表示専用の列なので null だからと
   * いって行をランキングから落としてはいけない。
   */
  relayCreatedAt: string | null;
  /** `legIndex` 昇順。親だけ残った異常データでは空配列になりうる。 */
  legs: TeamRelayRankingLeg[];
}

/** 順位を付与した表示用の1行。 */
export interface TeamRelayRankingRow extends TeamRelayRankingRecord {
  /**
   * 同着は同順位、次順位は件数分スキップする (1, 2, 2, 4)。
   * 日本水泳連盟の順位表記に準拠。第1弾と同じ `assignCompetitionRanks` が付与する。
   */
  rank: number;
}
