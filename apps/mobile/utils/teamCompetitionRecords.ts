// =============================================================================
// チーム大会「記録一覧モーダル」(TeamCompetitionRecordsModal) の型・純粋ロジック
// =============================================================================
// UI から分離したテスト可能な純関数群。
// web `apps/web/components/team/TeamCompetitionRecordsModal.tsx` の
// buildDisplaySplits / グルーピングロジックの mobile 移植。
// users/styles は Supabase の JOIN 結果がオブジェクト/配列いずれの形でも
// 返り得るため、どちらの形でも吸収する (web の getUserName/getStyle と同じ方針)。

export interface RecordUser {
  name: string;
}

export interface SplitTimeEntry {
  id: string;
  distance: number;
  split_time: number;
}

export interface StyleInfo {
  id: number;
  name_jp: string;
  name: string;
  style: string;
  distance: number;
}

export interface RecordEntry {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  reaction_time: number | null;
  is_relaying: boolean;
  note: string | null;
  users: RecordUser | RecordUser[] | null;
  styles: StyleInfo | StyleInfo[] | null;
  split_times: SplitTimeEntry[];
}

export interface CompetitionDetail {
  id: string;
  title: string | null;
  date: string;
  place: string | null;
  pool_type: number; // 0: 短水路(25m), 1: 長水路(50m)
  note: string | null;
}

/** 種目別グルーピング後、個人/リレーそれぞれ独立採番された記録 */
export interface RankedRecordEntry extends RecordEntry {
  /** 同一種目・同一区分 (個人/リレー) 内での順位 (1始まり、time昇順) */
  rank: number;
}

export interface StyleRecordGroup {
  style: StyleInfo;
  /** is_relaying === false の記録。time昇順で1始まりの独立採番 */
  individual: RankedRecordEntry[];
  /** is_relaying === true の記録。individual とは独立してtime昇順で1始まりの採番 */
  relay: RankedRecordEntry[];
}

/** Supabase の JOIN 結果 (オブジェクト/配列いずれも取り得る) からユーザー名を取り出す */
export function getRecordUserName(
  users: RecordUser | RecordUser[] | null | undefined,
  unknownLabel: string,
): string {
  if (!users) return unknownLabel;
  if (Array.isArray(users)) return users[0]?.name || unknownLabel;
  return users.name || unknownLabel;
}

/** Supabase の JOIN 結果 (オブジェクト/配列いずれも取り得る) から種目情報を取り出す */
export function getRecordStyleInfo(
  styles: StyleInfo | StyleInfo[] | null | undefined,
): StyleInfo | null {
  if (!styles) return null;
  if (Array.isArray(styles)) return styles[0] || null;
  return styles;
}

/** time昇順にソートし、1始まりの rank を振る (個人/リレーどちらにも使う共通処理) */
function rankByTimeAscending(records: RecordEntry[]): RankedRecordEntry[] {
  return [...records]
    .sort((a, b) => a.time - b.time)
    .map((record, index) => ({ ...record, rank: index + 1 }));
}

/**
 * 記録を種目 (style_id) でグルーピングし、種目名 (name_jp) の localeCompare 順に並べる。
 * 各種目内は個人記録 (is_relaying === false) をtime昇順で採番したのち、
 * リレー記録 (is_relaying === true) を個人記録とは独立してtime昇順で採番する
 * (リレーの1件目は必ず rank=1 になる)。
 * style 情報が取得できない記録 (JOIN欠落) は除外する。
 */
export function groupRecordsByStyle(records: RecordEntry[]): StyleRecordGroup[] {
  const grouped = new Map<number, { style: StyleInfo; records: RecordEntry[] }>();

  for (const record of records) {
    const style = getRecordStyleInfo(record.styles);
    if (!style) continue;

    const existing = grouped.get(record.style_id);
    if (existing) {
      existing.records.push(record);
    } else {
      grouped.set(record.style_id, { style, records: [record] });
    }
  }

  return Array.from(grouped.values())
    .map(({ style, records: styleRecords }) => ({
      style,
      individual: rankByTimeAscending(styleRecords.filter((r) => !r.is_relaying)),
      relay: rankByTimeAscending(styleRecords.filter((r) => r.is_relaying)),
    }))
    .sort((a, b) => a.style.name_jp.localeCompare(b.style.name_jp));
}

/**
 * スプリット表示用の配列を構築する (web `buildDisplaySplits` の移植)。
 * distance昇順に並べたのち、種目距離 (raceDistance) と同じ distance の split が
 * 無い場合のみ、ゴールタイム (recordTime) を最終splitとして補完する。
 */
export function buildDisplaySplits(
  splitTimes: SplitTimeEntry[],
  raceDistance: number,
  recordTime: number,
): Array<{ distance: number; splitTime: number }> {
  const baseSplits = [...splitTimes]
    .sort((a, b) => a.distance - b.distance)
    .map((st) => ({ distance: st.distance, splitTime: st.split_time }));

  if (baseSplits.length === 0) return baseSplits;

  // ゴールタイムを最終splitとして追加（種目の距離と同じ距離のsplitがない場合）
  if (raceDistance && recordTime && recordTime > 0) {
    const hasGoalSplit = baseSplits.some((st) => st.distance === raceDistance);
    if (!hasGoalSplit) {
      return [...baseSplits, { distance: raceDistance, splitTime: recordTime }];
    }
  }

  return baseSplits;
}
