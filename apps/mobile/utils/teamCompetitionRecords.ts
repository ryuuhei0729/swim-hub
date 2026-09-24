// =============================================================================
// チーム大会「記録一覧モーダル」(TeamCompetitionRecordsModal) の型・純粋ロジック
// =============================================================================
// UI から分離したテスト可能な純関数群。
// web `apps/web/components/team/TeamCompetitionRecordsModal.tsx` の
// buildDisplaySplits / グルーピングロジックの mobile 移植。
// users/styles は Supabase の JOIN 結果がオブジェクト/配列いずれの形でも
// 返り得るため、どちらの形でも吸収する (web の getUserName/getStyle と同じ方針)。
//
// リレーのチーム記録 (`relay_records`) を関わるロジックについては
// `RelayRecordWithLegs` (apps/shared/types/relayRecord.ts、境界契約は Web Dev 所有の
// apps/shared/api/teams/relayRecords.ts `getByCompetition`) を読み取り元とする。
// レグ単位の `styleId → 距離` のような対応表は新たに持たない
// (`apps/shared/utils/relayEvents.ts` から導出する。CLAUDE.md
// 「同一のドメイン対応表を2箇所にハードコードするな」)。

import type { RelayKind, RelayRecordWithLegs } from "@apps/shared/types/relayRecord";
import { RELAY_KIND_VALUES } from "@apps/shared/utils/relayEvents";

export interface RecordUser {
  name: string;
  /** private バケット内相対パス。未設定は null (avatar はイニシャルにフォールバック) */
  profile_image_path: string | null;
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
  /** DB NOT NULL (0: 短水路, 1: 長水路)。Best バッジの絞り込みキーは記録自身のこの値を使う
   * (大会の pool_type とは別物として扱う。両者が食い違うケースがあるため)。 */
  pool_type: number;
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

export interface StyleRecordGroup {
  style: StyleInfo;
  /** is_relaying === false の記録。time昇順 (速い順) */
  individual: RecordEntry[];
  /** is_relaying === true の記録。individual とは独立してtime昇順 (速い順) */
  relay: RecordEntry[];
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

/** Supabase の JOIN 結果 (オブジェクト/配列いずれも取り得る) からアバター画像パスを取り出す */
export function getRecordUserAvatarPath(
  users: RecordUser | RecordUser[] | null | undefined,
): string | null {
  if (!users) return null;
  if (Array.isArray(users)) return users[0]?.profile_image_path ?? null;
  return users.profile_image_path ?? null;
}

/** Supabase の JOIN 結果 (オブジェクト/配列いずれも取り得る) から種目情報を取り出す */
export function getRecordStyleInfo(
  styles: StyleInfo | StyleInfo[] | null | undefined,
): StyleInfo | null {
  if (!styles) return null;
  if (Array.isArray(styles)) return styles[0] || null;
  return styles;
}

/** time昇順 (速い順) にソートする (個人/リレーどちらにも使う共通処理) */
function sortByTimeAscending(records: RecordEntry[]): RecordEntry[] {
  return [...records].sort((a, b) => a.time - b.time);
}

/**
 * 記録を種目 (style_id) でグルーピングし、種目名 (name_jp) の localeCompare 順に並べる。
 * 各種目内は個人記録 (is_relaying === false) をtime昇順で並べたのち、
 * リレー記録 (is_relaying === true) を個人記録とは独立してtime昇順で並べる。
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
      individual: sortByTimeAscending(styleRecords.filter((r) => !r.is_relaying)),
      relay: sortByTimeAscending(styleRecords.filter((r) => r.is_relaying)),
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

// -----------------------------------------------------------------------------
// relay_records 由来のチーム記録 (1チーム=1行、展開でレグを表示)
// -----------------------------------------------------------------------------

/**
 * `relay_records` に取り込まれたリレーの各レグ ( `relay_record_legs.record_id` ) の
 * `records.id` 集合を返す。
 *
 * 【なぜ個人一覧からの除外に使うか】PM 実測の DB 事実: リレー1本 = `records` 4行で、
 * 先頭レグは `is_relaying = FALSE`。現行の個人一覧フィルタ (`is_relaying === false`)
 * は、この先頭レグを個人種目の行として混入表示してしまう (現行バグ)。
 * `relay_record_legs.record_id` に載っているレグは `is_relaying` の値に関わらず
 * 個人一覧・旧来のリレー平置き一覧の両方から除外し、`relay_records` 側の
 * チームまとめ行 (`groupRelayRecordsByEvent` の結果) でのみ表示する。
 *
 * legIndex 0 (`is_relaying=false`) も legIndex 1-3 (`is_relaying=true`) も同じ集合に
 * 入れる (呼び出し元で `is_relaying` による絞り込みをしない)。
 */
export function getRelayLegRecordIds(
  relayRecords: readonly RelayRecordWithLegs[],
): Set<string> {
  const ids = new Set<string>();
  for (const relay of relayRecords) {
    for (const leg of relay.legs) {
      if (leg.recordId) ids.add(leg.recordId);
    }
  }
  return ids;
}

/**
 * `records` から、`relay_records` に取り込まれ済みの行 (レグ0〜3のいずれか) を除く。
 * `groupedRecordIds` が空集合なら (バックフィル未実行・relay_records が0件の大会など)
 * 何も除かず元の配列をそのまま返す — 事実4「relay_records に紐づかない is_relaying
 * 行は従来どおり表示され、消失しない」を満たす。
 */
export function excludeGroupedRelayRecords(
  records: RecordEntry[],
  groupedRecordIds: ReadonlySet<string>,
): RecordEntry[] {
  if (groupedRecordIds.size === 0) return records;
  return records.filter((record) => !groupedRecordIds.has(record.id));
}

/** リレー1本のレグ表示用。`RelayRecordWithLegs.legs` の解決済みフィールドをそのまま使う。 */
export interface RelayLegDisplay {
  legIndex: number;
  userId: string | null;
  userName: string | null;
  profileImagePath: string | null;
  styleId: number;
  styleNameJp: string | null;
  legTime: number;
  reactionTime: number | null;
  /** 退会 / records 行削除済みは null。アバター・Best バッジは安全に非表示へフォールバックする */
  recordId: string | null;
}

/** リレー1本 = 1行 (チーム記録)。折りたたみ時はこの行だけ、展開すると legs が見える。 */
export interface RelayTeamRow {
  relayRecordId: string;
  relayKind: RelayKind;
  legDistance: number;
  legCount: number;
  poolType: number;
  totalTime: number;
  /** legIndex 昇順 (D3 契約: `getByCompetition` が返す順序をそのまま信用する) */
  legs: RelayLegDisplay[];
}

/** `RelayRecordWithLegs` (API 境界の型) を表示用の `RelayTeamRow` に変換する */
export function toRelayTeamRow(relay: RelayRecordWithLegs): RelayTeamRow {
  return {
    relayRecordId: relay.id,
    relayKind: relay.relayKind,
    legDistance: relay.legDistance,
    legCount: relay.legCount,
    poolType: relay.poolType,
    totalTime: relay.totalTime,
    legs: relay.legs.map((leg) => ({
      legIndex: leg.legIndex,
      userId: leg.userId,
      userName: leg.userName,
      profileImagePath: leg.profileImagePath,
      styleId: leg.styleId,
      styleNameJp: leg.styleNameJp,
      legTime: leg.legTime,
      reactionTime: leg.reactionTime,
      recordId: leg.recordId,
    })),
  };
}

/**
 * リレー種目 (relayKind + legDistance) でまとめた1グループ。
 *
 * **`legCount` を持たない (意図的)。** レグ数はチームごとに異なりうる (`relay_records.leg_count`
 * は `CHECK (leg_count BETWEEN 2 AND 8)` で、同一種目に3人チームと4人チームが併存しうる)。
 * かつて `legCount` をグループ側に置き「最初に挿入されたチームの値」を全チームのラベルに
 * 適用してしまい、レグ数の異なるチームが混在すると誤表示するバグがあった (PM 修正依頼)。
 * レグ数はチーム単位でのみ意味を持つので `RelayTeamRow.legCount` を読むこと。
 */
export interface RelayEventGroup {
  relayKind: RelayKind;
  legDistance: number;
  /** totalTime昇順 (速い順) */
  teams: RelayTeamRow[];
}

/**
 * リレー記録をリレー種目 (relayKind + legDistance) でグルーピングし、totalTime昇順で
 * 並べる。イベントの並び順は `RELAY_KIND_VALUES` (free → medley) → legDistance昇順。
 * 距離の対応表を新たにハードコードしない (`relayEvents.ts` が唯一の定義元)。
 */
export function groupRelayRecordsByEvent(
  relayRecords: readonly RelayRecordWithLegs[],
): RelayEventGroup[] {
  const grouped = new Map<string, RelayEventGroup>();

  for (const relay of relayRecords) {
    const key = `${relay.relayKind}:${relay.legDistance}`;
    const existing = grouped.get(key);
    const row = toRelayTeamRow(relay);
    if (existing) {
      existing.teams.push(row);
    } else {
      grouped.set(key, {
        relayKind: relay.relayKind,
        legDistance: relay.legDistance,
        teams: [row],
      });
    }
  }

  for (const group of grouped.values()) {
    group.teams.sort((a, b) => a.totalTime - b.totalTime);
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const kindDiff = RELAY_KIND_VALUES.indexOf(a.relayKind) - RELAY_KIND_VALUES.indexOf(b.relayKind);
    if (kindDiff !== 0) return kindDiff;
    return a.legDistance - b.legDistance;
  });
}
