// =============================================================================
// チーム大会記録 - 一覧画面 / 詳細画面共用のデータ取得層
// =============================================================================
//
// ⚠️ 詳細画面を `WHERE style_id = X` で単独フェッチしてはいけない。リレーのレグは
// 個人種目と同じ style_id を使うため、style_id 単体では「個人記録」と
// 「リレーの一部」を区別できない。リレー検出は大会全体の created_at 連続4件
// パターンに依存している (buildStyleEntriesFromExisting の Phase 1)。
//
// 正しい方式: 大会全体の records + entries を取得 → buildStyleEntriesFromExisting +
// planEntryAdditionsForRecords でマージ → 呼び出し側 (一覧/詳細) が
// 必要な StyleEntry だけを取り出す。
//
// records の select には video_path / video_thumbnail_path を含める
// (旧画面ではここが欠けており、動画消失バグの一因だった)。
import type { SupabaseClient } from "@supabase/supabase-js";
import { StyleAPI } from "@apps/shared/api/styles";
import { UserFacingError } from "@apps/shared/utils/userFacingError";
import type { Style, PoolType } from "@apps/shared/types";
import {
  planEntryAdditionsForRecords,
  buildEntryTimeReferenceLookup,
  type EntryRowForRecordMerge,
} from "@apps/shared/utils/entryRecordMerge";
import {
  buildStyleEntriesFromExisting,
  applyEntryAdditionsToStyleEntries,
  stampExistingEntryTimeReferences,
  type StyleEntry,
  type ExistingRecord,
} from "./buildStyleEntries";

export interface TeamRecordCompetitionInfo {
  id: string;
  title: string | null;
  pool_type: PoolType;
}

export interface TeamRecordCompetitionData {
  styles: Style[];
  competition: TeamRecordCompetitionInfo;
  /** マージ前の生の records (video_path/video_thumbnail_path を含む)。
   *  保存スコープの絞り込み (computeRecordSaveDiff への existingRecordIds) に使う。 */
  existingRecords: ExistingRecord[];
  /** 既存記録 + 不足分のエントリーをマージした StyleEntry 一覧 */
  styleEntries: StyleEntry[];
  /**
   * style_id ごとの「エントリーしている人数」(distinct user_id)。
   * マージ後の StyleEntry (entryTimeReference) から数えると entry_time が
   * NULL のエントリーを取りこぼすため、entries の生データから直接数える。
   * リレーには対応する概念が無いため個人種目の style_id のみを含む。
   */
  entryUserCountByStyleId: Map<number, number>;
  isEditMode: boolean;
}

export interface LoadTeamRecordCompetitionDataParams {
  supabase: SupabaseClient;
  competitionId: string;
  teamId: string;
  /** 大会取得失敗時にユーザーへ見せる文言 (呼び出し側の i18n から渡す) */
  competitionFetchFailedMessage: string;
  /** entries.users.name が欠けている場合のフォールバック表示名 */
  unknownUserLabel: string;
}

interface RawEntryRow {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
  users?: { id: string; name: string | null } | null;
}

/**
 * 大会単位で records + entries を取得し、StyleEntry[] にマージするまでを行う。
 * 一覧画面はここから全種目ぶんのカード情報を導出し、詳細画面は該当する
 * 1件の StyleEntry だけを取り出して使う。
 */
export async function loadTeamRecordCompetitionData(
  params: LoadTeamRecordCompetitionDataParams,
): Promise<TeamRecordCompetitionData> {
  const { supabase, competitionId, teamId, competitionFetchFailedMessage, unknownUserLabel } =
    params;

  const styleApi = new StyleAPI(supabase);
  const [stylesData, competitionRes, recordsRes, entriesRes] = await Promise.all([
    styleApi.getStyles(),
    supabase
      .from("competitions")
      .select("id, title, pool_type")
      .eq("id", competitionId)
      .eq("team_id", teamId)
      .single(),
    supabase
      .from("records")
      .select(
        `id, user_id, style_id, time, is_relaying, reaction_time, note,
       video_path, video_thumbnail_path,
       split_times ( id, distance, split_time ),
       users:users!records_user_id_fkey ( id, name )`,
      )
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
    // エントリー（申告タイム）。記録の初期行反映と参照ラベル表示に使う（entry_time は
    // 入力欄には絶対に入れない）
    supabase
      .from("entries")
      .select(
        `id, user_id, style_id, entry_time, note,
       users:users!entries_user_id_fkey ( id, name )`,
      )
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
  ]);

  if (competitionRes.error || !competitionRes.data) {
    throw competitionRes.error || new UserFacingError(competitionFetchFailedMessage);
  }

  const comp = competitionRes.data as unknown as TeamRecordCompetitionInfo;
  const records = (recordsRes.data || []) as unknown as ExistingRecord[];

  // entries は補助データ（初期反映・参考表示専用）。取得失敗は記録入力をブロックせず、
  // recordsRes と同様に空配列へフォールバックする。
  if (entriesRes.error) {
    console.error("エントリー取得エラー（記録入力は続行）:", entriesRes.error);
  }
  const rawEntries = (entriesRes.error ? [] : entriesRes.data || []) as unknown as RawEntryRow[];

  // style_id ごとの distinct user_id 数 = エントリー人数。
  // entries は個人種目の style_id にのみ紐づき、リレーの概念が無いため
  // このマップにリレー種目の値は含まれない (呼び出し側が誤用しないよう
  // マップの外に一切キーを持たせない)。
  const entryUserIdsByStyleId = new Map<number, Set<string>>();
  for (const e of rawEntries) {
    const set = entryUserIdsByStyleId.get(e.style_id) ?? new Set<string>();
    set.add(e.user_id);
    entryUserIdsByStyleId.set(e.style_id, set);
  }
  const entryUserCountByStyleId = new Map<number, number>(
    [...entryUserIdsByStyleId.entries()].map(([styleId, userIds]) => [styleId, userIds.size]),
  );

  // 既存記録を優先し、不足分だけエントリーから初期行として追加する。
  // (user_id, style_id) の重複排除とリレーグループ不可侵は shared の
  // planEntryAdditionsForRecords が保証する（ここでは再実装しない）。
  const baseStyleEntries = buildStyleEntriesFromExisting(records, stylesData);
  const entryRows: EntryRowForRecordMerge[] = rawEntries.map((e) => ({
    id: e.id,
    user_id: e.user_id,
    style_id: e.style_id,
    entry_time: e.entry_time,
    note: e.note,
    userName: e.users?.name || unknownUserLabel,
  }));
  const plans = planEntryAdditionsForRecords(entryRows, baseStyleEntries, stylesData);
  const merged = applyEntryAdditionsToStyleEntries(baseStyleEntries, plans);

  // 既存記録由来の行にも参考表示 (entryTimeReference) を後付けする。
  const entryTimeByUserStyle = buildEntryTimeReferenceLookup(entryRows);
  const styleEntries = stampExistingEntryTimeReferences(merged, entryTimeByUserStyle);

  return {
    styles: stylesData,
    competition: { id: comp.id, title: comp.title, pool_type: comp.pool_type },
    existingRecords: records,
    styleEntries,
    entryUserCountByStyleId,
    isEditMode: records.length > 0,
  };
}
