// =============================================================================
// チームAPI - relayRecords (リレーのチーム記録の書き込み)
// =============================================================================
// `relay_records` / `relay_record_legs` を差し替える**唯一の実装元**。
// web (`.../records/_client/RecordClient.tsx`) と
// mobile (`apps/mobile/screens/teamRecordBulk/saveStyleRecords.ts`、
// `TeamRecordStyleDetailScreen.tsx` から呼ばれる) の両方が呼ぶ。
//
// なぜ shared に集約するのか:
//   当初は web / mobile がそれぞれ `replaceRelayRecords` を持っており、
//   コメント・空白を除いた有意行95行が完全一致していた (差は pool_type の引数化と
//   キャストの2点だけ)。本スプリントは `relayEvents.ts` の完全複製を
//   「片方だけ更新されて静かに壊れる」理由で統合しており、
//   **insert → delete の順序・巻き戻し・「全成功時のみ削除」という今回いちばん
//   壊れると痛い部分**が統合されていないのは一貫しない。
//
// 読み取り (ランキング) は `./relayRankings.ts` (SECURITY DEFINER RPC 経由)。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { RelayRecord, RelayRecordLeg } from "../../types";
import { fromRelayEventId } from "../../utils/relayEvents";
import type { RelaySavePlan } from "../../utils/relayRecordSave";

/**
 * 差し替えの対象範囲。
 *
 * 【修正ラウンド 2026-09-17 (Critical #1)】以前はここに `relayEventId?` を持たせ、
 * 指定時は既存行の取得を `relay_kind` + `leg_distance` でも絞り込んでいた。
 * これは**同じ種目に登録された別チーム/別組の行を区別できない**。例えば
 * 400m フリーリレーに2チーム登録されている場合、`(team_id, competition_id,
 * relay_kind, leg_distance)` は両チームの行にヒットするため、片方のチームを
 * 保存すると `staleIds` にもう片方のチームの行が含まれてしまい、保存する
 * `plans` にはそのチームの分が無いため、**相手チームの `relay_records` 行が
 * 削除されて復活しない** (チームランキングの集計元なので、ランキングから
 * 静かに消える)。
 *
 * そこで `records` 側 (`computeRecordSaveDiff`) と同じ「画面が読み込んだ id
 * だけを消す」原則に揃える。DB 列条件による絞り込みは一切行わない。
 */
export interface RelayRecordReplaceScope {
  teamId: string;
  /**
   * 大会 id。**nullable にしないこと。**
   *
   * `relay_records.competition_id` は DB では NULL 許容だが、**アプリ側に
   * `competition_id = NULL` のリレー記録を作る経路を持たない** (あの null 許容は
   * 「大会に紐づかないリレー記録を直接入力する」機能のための予約。根拠は
   * `../../types/relayRecord.ts` の `competitionId` の docstring)。
   * ここを `string | null` に緩めると、その経路がこのモジュールから生まれる。
   *
   * これは**ランキングの年度注意書きを出さない根拠でもある** —
   * `utils/rankingEventAxis.ts` の `shouldShowFiscalYearNote` はリレーで
   * 注意書きを出さないが、その前提が「`competition_id = NULL` の行が存在しない」
   * ことである。緩めると前提が崩れて注意書きが必要になる。
   *
   * `apps/shared/__tests__/api/relayRecordCompetitionRequired.test.ts` が
   * `string | null` への緩和を **tsc で**止めている。
   *
   * ⚠️ **この pin の限界**: 守れるのは「既存経路が緩む」ケースだけ。
   * **まったく新しい API モジュールが `competition_id = NULL` で insert する経路は
   * 捕まらない。** そちらの道案内は `types/relayRecord.ts` の `competitionId`
   * docstring が担う (あそこに「予約を実装するときに一緒に戻すもの」を列挙してある)。
   */
  competitionId: string;
  /**
   * 大会の水路 (`competitions.pool_type`)。DB が NOT NULL なので `??` は不要。
   * 0/1 以外の異常値なら `relay_records_pool_type_check` が insert を落とす
   * (静かに片方の水路へ寄せない)。
   */
  poolType: number;
  /**
   * この保存で「古い行」として扱う対象の `relay_records.id` の集合。
   *
   * 呼び出し元 (画面のデータ取得層) が、今回のセッションで実際に読み込んだ
   * `relay_records.id` だけを渡すこと。ここに含まれる id だけが delete 候補になり、
   * それ以外 (同じ `relay_kind` + `leg_distance` を持つ別チーム/別組の行など、
   * この画面が読み込んでいない行) には一切触れない。
   *
   * 空配列なら「置き換え対象の既存行は無い」= 新規保存のみを意味する
   * (新規大会・新規種目でこのリレーが初めて保存される場合など)。
   */
  relayRecordIds: readonly string[];
}

export interface RelayRecordReplaceResult {
  /**
   * 1件でも失敗したか。呼び出し元はこれで保存全体のエラー扱いを決める。
   *
   * ⚠️ **読まれないフィールドを増やさないこと。** 以前ここに `createdCount`
   * (作成できた本数) があったが、web も mobile も `failed` しか取り出さず
   * 「書かれるだけで読まれない値」になっていた。表示やログに使うなら
   * その実装と同じスプリントで足すこと。
   */
  failed: boolean;
}

/**
 * `relay_records` に insert する列 (camelCase)。
 *
 * **PM 確定の契約 `types/relayRecord.ts` から `Pick` で導出する。** こうしないと
 * 契約型が「実装から一度も参照されない飾り」になり、制約ハーネスとして機能しない。
 * 除外しているのは DB が採番・既定値で埋める列:
 *   - `id` / `createdAt`: DB 側の DEFAULT
 *   - `createdBy`: DB 側の `DEFAULT auth.uid()`。クライアントは送らない
 *     (クライアントの認証 state に依存させない)
 *   - `legs`: 子テーブル `relay_record_legs` へ別 insert
 *
 * `note` は **契約型にも DB にも存在しない** (非 NULL を書く経路が1つも無かったため、
 * migration の列・契約型のフィールド・自然キー照合の機構をまとめて削除した)。
 * 将来メモを持たせるなら、列・入力 UI・再保存時の引き継ぎ規則を同じスプリントで
 * 揃えて入れること。
 */
type RelayRecordInsertFields = Pick<
  RelayRecord,
  | "teamId"
  | "competitionId"
  | "relayKind"
  | "legDistance"
  | "legCount"
  | "poolType"
  | "genderCategory"
  | "totalTime"
>;

/**
 * `relay_record_legs` に insert する列 (camelCase)。
 * `id` / `createdAt` は DB 側の DEFAULT なので持たない。
 */
type RelayRecordLegInsertFields = Pick<
  RelayRecordLeg,
  "legIndex" | "userId" | "styleId" | "legTime" | "reactionTime" | "recordId"
>;

/** camelCase → snake_case。列名の写像はこの2関数に閉じる。 */
function toRelayRecordRow(fields: RelayRecordInsertFields) {
  return {
    team_id: fields.teamId,
    competition_id: fields.competitionId,
    relay_kind: fields.relayKind,
    leg_distance: fields.legDistance,
    leg_count: fields.legCount,
    pool_type: fields.poolType,
    gender_category: fields.genderCategory,
    total_time: fields.totalTime,
  };
}

function toRelayRecordLegRow(relayRecordId: string, fields: RelayRecordLegInsertFields) {
  return {
    relay_record_id: relayRecordId,
    leg_index: fields.legIndex,
    user_id: fields.userId,
    style_id: fields.styleId,
    leg_time: fields.legTime,
    reaction_time: fields.reactionTime,
    record_id: fields.recordId,
  };
}

export class TeamRelayRecordsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * `records.id` 集合から、それらが属する `relay_records.id` を解決する。
   * `replace()` に渡す `RelayRecordReplaceScope.relayRecordIds` を組み立てる
   * ための補助メソッド。
   *
   * 【元は mobile 画面層にあった】 web/mobile がそれぞれ「画面が読み込んだ
   * records.id から relay_records.id を逆引きする」ロジックを持つと、片方だけ
   * 更新されて静かに壊れる (このモジュール冒頭の docstring と同じ理由)。元は
   * mobile の `screens/teamRecordBulk/saveStyleRecords.ts` の
   * `scopeRelayRecordIdsForLegRecords` にあった実装をここへ移し、mobile 側は
   * このメソッドへの薄い委譲に置き換えてある。
   *
   * 【なぜ `relay_record_legs.record_id` 経由か】`relay_records` 自体には「組」を
   * 識別する列が無い。同一チーム・同一大会・同一 relay_kind/leg_distance の行は
   * 複数組にまたがって同じ値になりうるため、DB 列条件だけでは「この画面が読み込んだ
   * 行」を一意に特定できない。`relay_record_legs.record_id` は `records.id` への FK
   * であり、その records.id 自体が既に (呼び出し元が読み込んだ) 組へ一意に紐づいて
   * いるため、これを経由すれば列条件を使わずに正確な relay_records.id 集合を得られる。
   *
   * 【呼び出し順序に関する注意】`relay_record_legs.record_id` は
   * `ON DELETE SET NULL` (元になった records 行を消してもリレー記録は残すため)。
   * 呼び出し元が対象の records 行を先に DELETE してからこのメソッドを呼ぶと、
   * 該当行の record_id は既に NULL 化されており解決できない。**records の DELETE
   * より前に呼ぶこと。**
   *
   * @param recordIds 呼び出し元が実際に読み込んだ `records.id` の集合
   *   (leg 0 は `is_relaying=false` でも対象になるため、`is_relaying` で
   *   事前に絞り込まないこと)
   * @returns 解決できた `relay_records.id` の集合。空配列を渡した場合は
   *   問い合わせずに空集合を返す
   */
  async resolveRelayRecordIdsForRecords(recordIds: readonly string[]): Promise<Set<string>> {
    if (recordIds.length === 0) return new Set();

    const { data, error } = await this.supabase
      .from("relay_record_legs")
      .select("relay_record_id")
      .in("record_id", recordIds);

    if (error) {
      // 生の PostgrestError.message はテーブル名等を含みうるため文字列に埋め込まない。
      // 失敗時は空集合を返す (置き換え対象が無い = 既存の relay_records は消さない側に
      // 倒す。データを消し損なうより、まれに重複行が残る方を選ぶ既存方針
      // (`replace()` の docstring 「データが消えるより重複が残る方を選ぶ」) と一致させる)。
      console.error("relay_record_legs 取得エラー:", error);
      return new Set();
    }

    return new Set(
      ((data ?? []) as Array<{ relay_record_id: string | null }>)
        .map((row) => row.relay_record_id)
        .filter((id): id is string => id != null),
    );
  }

  /**
   * リレー記録を差し替える。古い行の対象は `scope.relayRecordIds` に**渡された
   * id だけ** (DB 列条件による絞り込みは行わない。事実1)。
   *
   * 【なぜ upsert ではないか】
   * `id` を含まない upsert は自然キー側の一意制約に依存して別行を壊した前科が
   * あるため使わない。**新しい行を insert してから、事前に取得した古い行を
   * 明示的な id リストで delete する。**
   * 逆順 (delete → insert) にすると insert 失敗で記録が完全に消える。
   * この順序なら insert が失敗した時点で delete を行わないので、
   * 「何も残らない」状態にはならない。
   *
   * 【古い行を消す条件】
   * **全ての計画が書けたときだけ**消す。1本でも insert に失敗していたら
   * 古い行を残す: 失敗した1本のぶんは新しい行が無いので、消すとその記録が
   * 完全に失われる。残した場合は同じリレーが2行見える (重複) が、次回の保存で
   * 両方が「古い行」として消えるため自然に解消する。
   * **データが消えるより重複が残る方を選ぶ。**
   *
   * @param plans レグが1件以上ある計画のみを渡すこと (空の計画は書かない)
   * @param insertedRecordIds `records` の insert 結果。`RelaySaveLegPlan.validRecordIndex`
   *   と同じ添字で並んだ `records.id`。insert に失敗した位置は null
   *   (その位置の `record_id` は null になるが、リレー記録としての行は残す)
   * @returns `failed` が true なら呼び出し元は保存全体をエラー扱いにする。
   *   生の `PostgrestError` は throw せず console にのみ出す (テーブル名・
   *   ポリシー名を含みうるため、ユーザー向け文言は呼び出し元が持つ)
   */
  async replace(
    scope: RelayRecordReplaceScope,
    plans: readonly RelaySavePlan[],
    insertedRecordIds: ReadonlyArray<string | null>,
  ): Promise<RelayRecordReplaceResult> {
    // 古い行として消す候補は呼び出し元が渡した id 集合そのもの。DB へ問い合わせて
    // 対象を探し直すことはしない (探し直すと列条件での絞り込みに逆戻りしてしまう)。
    const staleIds = [...scope.relayRecordIds];

    let failed = false;

    for (const plan of plans) {
      // relay_event_id は DB に持たないので、種類と1レグ距離に分解して書く
      // (shared の relayEvents.ts が唯一の定義元で、DB CHECK に写して
      //  三重管理にしない)。
      const { kind, legDistance } = fromRelayEventId(plan.relayEventId);

      const recordFields: RelayRecordInsertFields = {
        teamId: scope.teamId,
        competitionId: scope.competitionId,
        relayKind: kind,
        legDistance,
        legCount: plan.legCount,
        poolType: scope.poolType,
        genderCategory: plan.genderCategory,
        totalTime: plan.totalTime,
      };

      const { data: newRelay, error: relayError } = await this.supabase
        .from("relay_records")
        .insert(toRelayRecordRow(recordFields))
        .select("id")
        .single();

      if (relayError || !newRelay) {
        console.error("リレー記録作成エラー:", relayError);
        failed = true;
        // この1本は書けなかったので、古い行も残す (下の delete が走らない)
        continue;
      }

      const legRows = plan.legs.map((leg) => {
        const legFields: RelayRecordLegInsertFields = {
          legIndex: leg.legIndex,
          userId: leg.userId,
          styleId: leg.styleId,
          legTime: leg.legTime,
          reactionTime: leg.reactionTime,
          // 対応する records 行の id。insert に失敗した位置は null のままで、
          // リレー記録としての行 (タイム) は残す。
          recordId: insertedRecordIds[leg.validRecordIndex] ?? null,
        };
        return toRelayRecordLegRow(newRelay.id, legFields);
      });

      const { error: legError } = await this.supabase.from("relay_record_legs").insert(legRows);

      if (legError) {
        console.error("リレーレグ作成エラー:", legError);
        failed = true;
        // レグ無しの親が残るとランキングにラップの無い行が出るので、
        // 今 insert した親を巻き戻す (古い行はそのまま残す)。
        const { error: rollbackError } = await this.supabase
          .from("relay_records")
          .delete()
          .eq("id", newRelay.id);
        if (rollbackError) {
          console.error("リレー記録の巻き戻しエラー:", rollbackError);
        }
        continue;
      }

    }

    // 保存対象のリレーが1本も無かった場合 (フォームからリレー種目を全部消した等) も
    // 古い行は消す。残すと `records` が消えた後もランキングに出続ける。
    if (!failed && staleIds.length > 0) {
      const { error: deleteError } = await this.supabase
        .from("relay_records")
        .delete()
        .in("id", staleIds);
      if (deleteError) {
        console.error("古いリレー記録の削除エラー:", deleteError);
        failed = true;
      }
    }

    return { failed };
  }
}
