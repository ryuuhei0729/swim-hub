// =============================================================================
// チームランキング型定義 - Swim Hub共通パッケージ
//
// この型はスプリントの制約ハーネスとして PM が確定させたものであり、
// web / mobile の両実装がここに従う。フィールドの追加・削除は PM 承認を要する。
// =============================================================================

import type { PoolType, SwimStyle } from "./common";
import type { RelayKind } from "./relayRecord";

/**
 * ランキングの対象大会スコープ。
 *
 * - teamCompetitions: `competitions.team_id` がそのチームの大会に限定する。
 *   ⚠️ `records.team_id` では絞らない。書き込み経路が web / mobile で非対称で、
 *   web の大会タブとダッシュボードは `team_id` を送らないため、同じチーム大会でも
 *   web 由来の記録だけが静かに落ちる。
 * - allCompetitions: 大会所属を問わずメンバーの記録を集計する。RLS では見えない
 *   他チームの大会の記録も含む (SECURITY DEFINER RPC 経由の意図的な露出拡大)。
 */
export type RankingScope = "teamCompetitions" | "allCompetitions";
/**
 * ランキングの「種目」選択。**個人種目とリレーを1つの軸に統合したもの。**
 *
 * UI 上は1つのラジオグループ (種目) に 個人5種目 + リレー2種類 が並び、
 * 改行を挟んで表示される。「個人種目 / リレー」のビュー切替トグルは持たない
 * (ユーザー要望: 切替を消して種目の選択そのものでモードが決まる形にする)。
 *
 * **表示するランキングの種類はこの選択から導出する。** 別に view state を持たせると
 * 「種目は個人なのにリレー表が出ている」という不整合な状態が表現可能になる。
 */
export type RankingEventSelection =
  | { mode: "individual"; style: SwimStyle }
  | { mode: "relay"; relayKind: RelayKind };

/**
 * `RankingEventSelection` をラジオボタンの value (単一の文字列) に写した表現。
 *
 * 個人種目は canonical な種目コードそのまま (`"Fr"` 等)、リレーは
 * `"relay:"` 接頭辞付き (`"relay:free"` / `"relay:medley"`)。
 * 接頭辞があるので `SWIM_STYLES` の値とは構造的に衝突しない。
 *
 * ⚠️ **この文字列と `RankingEventSelection` の相互変換は shared の1箇所に集約すること。**
 * web と mobile で別々にパースすると、片方だけ新しい種目を追加したときに静かに壊れる。
 */
export type RankingEventValue = SwimStyle | `relay:${RelayKind}`;


/**
 * 性別フィルタ。**男子 / 女子の2択で、既定は男子**。
 *
 * 「男女すべて」は意図的に持たない。水泳の競技は性別で分かれて実施されるため
 * 男女を混ぜた順位表に競技上の意味が無い (混合種目はリレーにしか存在せず、
 * そちらは `RelayGenderCategory` の `mixed` で表現する)。
 *
 * RPC (`get_team_record_rankings`) の `p_gender` は NULL で「すべて」を意味する
 * 実装が残っているが、**UI からは NULL を送らない**。RPC 側を狭めていないのは、
 * 将来「すべて」を戻すときに migration が要らないようにするため。
 */
export type RankingGenderFilter = "male" | "female";

/**
 * 集計モード。
 *
 * - personalBest: 1人1行。同一メンバーの最速記録のみを残す。
 * - allRaces: 出場した全レースを1本ずつ並べる。同一メンバーが複数行に出る。
 */
export type RankingAggregation = "personalBest" | "allRaces";

/**
 * 集計期間。
 *
 * `fiscalYear` は 4/1 〜 翌3/31 の日本の年度。判定には `competitions.date` を使い、
 * `records.created_at` は使わない (一括登録記録は登録日しか持たないため、過去の
 * ベストタイムを今日入れると嘘の年度に入る)。
 */
export type RankingPeriod =
  | { kind: "allTime" }
  | { kind: "fiscalYear"; year: number }
  /**
   * その年度**以前すべて** (下端を持たない)。`year` が上端の年度。
   *
   * 🚨 **これは第1弾の RPC では表現できない。** `p_fiscal_year` は単一の整数で
   * `c.date >= make_date(y,4,1) AND c.date <= make_date(y+1,3,31)` と
   * **上下両端を閉じて**絞るため、開区間を渡す手段が無い。
   * `20260909000000` で両 RPC に `p_fiscal_year_or_earlier boolean` を足す。
   */
  | { kind: "fiscalYearOrEarlier"; year: number };

/**
 * `RankingPeriod` をラジオボタンの value (単一の文字列) に写した表現。
 *
 * 通算は `"allTime"`、年度は `"fy:"` 接頭辞付き (`"fy:2026"`)。
 * 接頭辞を付けるのは `RankingEventValue` の `"relay:"` と同じ理由で、
 * 素の数値文字列と構造的に衝突させないため。
 *
 * ⚠️ **相互変換は shared の1箇所に集約すること** (`rankingEventAxis.ts`)。
 * web と mobile で別々にパースすると片方だけ壊れる。
 */
export type RankingPeriodValue = "allTime" | `fy:${number}` | `fyle:${number}`;

// =============================================================================
// 【第2弾 追加要望】期間をプルダウン化 / 並び替え / 25m の水路連動 / 既定値変更
//
// 🚨 **migration が1本必要になった。** 「2023年度以前」が第1弾の RPC で
// 表現できないため (上記 `fiscalYearOrEarlier` の注記)。第2弾は migration 不要
// という当初の見込みは崩れている。本番適用が必要な migration は 3本 → 4本。
//
// ## 1. 期間はプルダウン (ラジオではない)
//
// 選択肢は**5つ**。ユーザー指定は「通算 (既定) / 2026年度 / 2025年度 / 2024年度 /
// 2023年度以前」で、現年度 2026 を一般化すると
//   通算 → 現年度 → 現年度-1 → 現年度-2 → 「現年度-3 年度以前」
// になる。**明示年度は3つ + 以前バケット1つ**で、
// 第2弾の `RANKING_FISCAL_YEAR_COUNT = 5` (「直近N年度」) は**この形に置き換えた**。
// 実装後の定数は `RANKING_EXPLICIT_FISCAL_YEAR_COUNT = 3` (`rankingEventAxis.ts`) で、
// **明示年度の本数だけ**を表す (選択肢の総数は 1 + N + 1 = 5)。
//
// ⚠️ **年が変わると全部ずれる。** 2027年度になったら
// 通算 / 2027 / 2026 / 2025 / 2024年度以前 になる。年度の算出は
// `resolveFiscalYear` が唯一の定義元。
//
// ⚠️ **`fiscalYearOrEarlier` の `year` は「以前バケットの上端」**であり、
// 明示年度の最小値 (現年度-2) より1つ小さい。ここを取り違えると
// **現年度-2 の年度が二重に数えられる / どこにも入らない**。
// 明示年度の最小と以前バケットの上端は**隣接して重複しない**こと。
//
// ## 2. グループの並び (ユーザー指定)
//
//   期間 → 性別 → 水路 → 種目 → 距離 → 対象 → 集計
//
// ⚠️ 第2弾で私が裁定した「両モードに出る軸 → 個人限定の軸」は**維持される**
// (`対象` / `集計` が末尾に隣接)。リレー時に末尾2つが同時に消える不変条件は
// 崩さないこと。
//
// ## 3. 長水路のとき 25m の距離を出さない
//
// 50m プールで 25m のレースは実施できない。したがって
// **`poolType === 1` (長水路) では `25` と `25m × 4` を選択肢から落とす。**
//
// ⚠️ **距離の選択肢が水路に依存するようになる。** `getRankingDistanceChoices` の
// 引数に `poolType` が増える。**水路を短水路→長水路に切り替えたときに
// 25m が選択済みだと、選べない距離が選択状態で残る**ので、
// `resolveLegDistanceOnKindChange` と同じ流儀で正規化して state に書き戻すこと
// (表示だけ変えると画面の条件とクエリ条件が食い違う)。
//
// ⚠️ 長水路 × 25m の記録が DB に在っても**到達できなくなる**。これは仕様
// (実施不可能な組み合わせなので、そのデータ自体が誤り)。
//
// ## 4. 既定値 (ユーザー指定)
//
//   通算 / 男子 / 長水路 / 自由形 / **50m** / チームの大会 / 各自のベスト
//
// ⚠️ 距離の既定が **100m → 50m** に変わる。`buildDefaultRankingFilters` の
// `DEFAULT_DISTANCE` が定義元で、**50m Fr が styles マスターに無い場合の
// フォールバック** (`groups.at(0)?.distances.at(0)`) はそのまま残す。
// =============================================================================

// =============================================================================
// 【第2弾の契約】年度別ランキング + 全レースモード
//
// ⚠️ **着手時点では migration 不要だった** (`p_aggregation` / `p_fiscal_year` は
// 第1弾で完全実装済みで、UI が渡していないだけだった)。**その後ユーザーの追加要望
// 「2023年度以前」で `20260909000000` が必要になった** — 上の追加要望ブロックが正。
// 以下の「migration 不要」を前提にした記述は**当初の見込みとして読むこと**。
//
// ## 🚨 2つの軸は「出る場所」が違う。同じに扱うな
//
// | 軸 | 個人種目 | リレー | 根拠 |
// |---|---|---|---|
// | 期間 (`period`) | ✅ | ✅ | 両 RPC が `p_fiscal_year` を持つ |
// | 集計 (`aggregation`) | ✅ | ❌ | **リレー RPC は7引数で `p_aggregation` を持たない** |
//
// リレーに集計モードが無いのは「1チーム1行に畳み込む単位が無い」ため
// (同じ4人が2回泳いだ2本は別のレースで、どちらかを「その組のベスト」に
// 畳み込む意味が無い)。8引数版は `20260908000100` で意図的に落としてある。
//
// したがって **`aggregation` は `scope` と全く同じ扱い**にする:
//   - 個人モードのときだけ絞り込みに出す
//   - リレーへ切り替えても state からは消さない (個人に戻ると選択が復元される)
//   - **リレー表示中はバッジで数えない** (画面に出ていない軸を数えると
//     ユーザーには消せないバッジになる。第1弾で `scope` について確定した規則)
// `period` は両モードに出るので**常に数える**。
//
// ## 年度の選択肢は静的
//
// ⚠️ 当初は「通算 + 直近 N 年度」だったが、**追加要望で「通算 + 明示3年度 +
// 以前バケット」に変わった** (上の追加要望ブロックが正)。静的であること自体は不変。
//
// **データから「記録が存在する年度」を導出しない。** 導出するには
// `scope = allCompetitions` の場合に他チームの大会も数える必要があり、それは
// RLS では見えない (第1弾で SECURITY DEFINER RPC にした理由と同じ)。
// つまり**専用 RPC = さらに別の migration**が必要になる。
// (`20260909000000` は「以前バケット」のためのもので、これとは別件)
//
// 結果として**記録が1件も無い年度も選択肢に出る**。これは第1弾で
// 「押しても何も起きないピルを作らない」(距離を持たない種目を落とす) と決めた
// 方針と矛盾するが、**代償が migration なので今回は空状態で受ける**。
// 空状態の文言は既存の `empty` を使い、年度専用の文言を新設しないこと。
//
// ## 年度判定は `competitions.date`。一括登録記録は年度指定時に落ちる
//
// 両 RPC は `p_fiscal_year` 指定時に `c.date` が 4/1〜翌3/31 に入る行だけを残す。
// **大会に紐づかない記録 (一括登録) は `competition_id` が NULL なので年度が
// 決まらず、除外される** (実装済み: `20260907000000:234-240` /
// `20260908000100:213-219`)。
//
// ⚠️ これは「バグではないが説明が必要」な挙動。通算では出ていた記録が年度を
// 選ぶと消えるので、**年度を選んでいるときは「大会に紐づかない記録は含まれない」
// ことを UI で伝えること**。伝えないと「記録が消えた」という問い合わせになる。
//
// ## 全レースモードの切り詰め
//
// 取得上限は `TEAM_RANKING_FETCH_LIMIT = 500` (RPC のクランプ上限と同値)。
// `personalBest` は1人1行なので 500 に届くチームはまず無いが、
// **`allRaces` は1人が何本も出るので現実的に到達する**。
// 到達したら**切り詰めが起きたことを UI で明示すること**。黙って切ると
// 「自分の記録が無い」と読める。サーバー側ページングは第3弾以降の債務。
// =============================================================================

/** ランキングの絞り込み条件。`styleId` が種目と距離の両方を一意に決める。 */
export interface TeamRankingFilters {
  /** `styles.id`。種目 × 距離を一意に決めるので距離を別に持たない。 */
  styleId: number;
  poolType: PoolType;
  gender: RankingGenderFilter;
  scope: RankingScope;
  aggregation: RankingAggregation;
  period: RankingPeriod;
}

/**
 * RPC `get_team_record_rankings` が返す1行 (順位付与前)。
 * snake_case の RPC 戻り値を camelCase に写した境界の型。
 */
export interface TeamRankingRecord {
  recordId: string;
  userId: string;
  displayName: string;
  // プロフィール画像 (avatarPath) は**持たない**。ランキング表に画像を出さない
  // 方針になったため、RPC の RETURNS TABLE からも avatar_path を落としてある
  // (supabase/migrations/20260907000000)。ここに足しても値は来ない。
  /** 秒。DB は numeric(10,2) で小数第2位まで保持する。 */
  time: number;
  styleId: number;
  /**
   * canonical 化した泳法。`styles.style` が canonical 化できなかった場合は null。
   *
   * null を許容するのは、**canonical 化に失敗した行をランキングから除外させないため**。
   * 表示に使わない列の検証を理由に行を落とすと順位の母集団が静かに欠ける。
   */
  style: SwimStyle | null;
  distance: number;
  /**
   * RPC は `r.pool_type = p_pool_type` の厳密一致で絞るため、ここに返る値は
   * 呼び出し側が渡した `PoolType` と恒等になる。よって受け取り側で再検証しない
   * (検証はトートロジーで、失敗させる余地が無いのに行を落とす経路だけを作る)。
   */
  poolType: number;
  /** `users.gender` は DB が NOT NULL DEFAULT 0 なので必ず 0 か 1。 */
  gender: number;
  competitionId: string | null;
  /** 大会名。一括登録記録は大会を持たないため null。 */
  competitionTitle: string | null;
  /** 大会実施日 (YYYY-MM-DD)。一括登録記録は null。 */
  competitionDate: string | null;
  /**
   * 記録行の作成日時。`competitionDate` が null のときの表示フォールバックにのみ使う。
   *
   * `records.created_at` は DEFAULT now() を持つが **NOT NULL 制約が無い**ため null を取りうる。
   * 表示専用の列なので、null だからといって行をランキングから落としてはいけない
   * (順位の母集団が静かに欠ける)。null のまま持ち、UI 側で日付を出さない扱いにする。
   */
  recordCreatedAt: string | null;
}

/** 順位を付与した表示用の1行。 */
export interface TeamRankingRow extends TeamRankingRecord {
  /**
   * 同着は同順位、次順位は件数分スキップする (1, 2, 2, 4)。
   * 日本水泳連盟の順位表記に準拠。`assignCompetitionRanks` が付与する。
   */
  rank: number;
}
