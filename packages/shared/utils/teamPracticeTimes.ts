// =============================================================================
// チーム練習「タイム一覧」(mobile TeamPracticeTimesModal / web TeamPracticeDetailModal) の型・純粋ロジック
// =============================================================================
// 練習の practice_logs を「同じメニュー」ごとにまとめ、メニューの中でメンバーを
// 平均タイムの速い順に並べる。UI から分離してテストできるようにしている。
//
// メニューのまとめ方は web `apps/web/components/team/TeamPracticeDetailModal.tsx` の
// getMenuKey と同じ (泳法・距離・本数・セット数・サークル・種別がすべて同じものを 1 つにする)。
// practice_logs.style は CHECK 制約の無い自由記述列で "fr" のような小文字の旧データが
// 混ざり得るため、toStyleCode() で正規化してからキーにする。
//
// タイムの 0 以下は「未入力」として扱う (web / PracticeLogItem と同じ)。

import { toStyleCode } from "./swimStyles";
import type { PracticeTag } from "../types/practice";

export interface PracticeTimeEntry {
  id: string;
  time: number;
  rep_number: number;
  set_number: number;
  user_id: string;
}

export interface PracticeLogUser {
  name: string;
  /** private バケット内相対パス。未設定は null (アバターはイニシャルになる) */
  profile_image_path: string | null;
}

export interface PracticeLogEntry {
  id: string;
  user_id: string;
  style: string;
  swim_category: "Swim" | "Pull" | "Kick";
  rep_count: number;
  set_count: number;
  distance: number;
  circle: number | null;
  note: string | null;
  created_at?: string | null;
  practice_times: PracticeTimeEntry[] | null;
  practice_log_tags:
    | Array<{ practice_tag_id: string; practice_tags: PracticeTag | null }>
    | null;
  /** Supabase の JOIN 結果はオブジェクト/配列のどちらでも返り得る */
  users: PracticeLogUser | PracticeLogUser[] | null;
}

export interface PracticeTimesDetail {
  id: string;
  date: string;
  title: string | null;
  place: string | null;
  note: string | null;
  practice_logs: PracticeLogEntry[];
}

export interface MemberSetTimes {
  setNumber: number;
  /** 1 本目から rep_count 本目まで。未入力は null */
  times: (number | null)[];
  /** そのセットの入力済みタイムの平均。1 本も無ければ null */
  average: number | null;
}

export interface MemberTimesRow {
  /** 行のキー。同じ人が同じメニューを 2 回記録していることもあるのでログ ID を使う */
  logId: string;
  userId: string;
  name: string;
  avatarPath: string | null;
  note: string | null;
  sets: MemberSetTimes[];
  /** 全セットを通した入力済みタイムの平均。1 本も無ければ null */
  average: number | null;
  /** 入力済みタイムの最速。1 本も無ければ null */
  fastest: number | null;
  /** 入力済みの本数 */
  recordedCount: number;
  /** 本来の本数 (rep_count × set_count) */
  totalCount: number;
}

export interface PracticeMenuGroup {
  key: string;
  style: string;
  swimCategory: PracticeLogEntry["swim_category"];
  distance: number;
  repCount: number;
  setCount: number;
  circle: number | null;
  tags: PracticeTag[];
  /** 平均の速い順。タイムが 1 本も無い人は最後 */
  members: MemberTimesRow[];
}

function getUser(users: PracticeLogEntry["users"]): PracticeLogUser | null {
  if (!users) return null;
  if (Array.isArray(users)) return users[0] ?? null;
  return users;
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function getMenuKey(log: PracticeLogEntry): string {
  const styleCode = toStyleCode(log.style) ?? log.style;
  return `${styleCode}_${log.distance}_${log.rep_count}_${log.set_count}_${log.circle}_${log.swim_category}`;
}

export function buildMemberTimesRow(log: PracticeLogEntry, unknownUserName: string): MemberTimesRow {
  const user = getUser(log.users);
  const validTimes = (log.practice_times ?? []).filter((t) => t.time > 0);

  const sets: MemberSetTimes[] = Array.from({ length: log.set_count }, (_, si) => {
    const setNumber = si + 1;
    const times = Array.from({ length: log.rep_count }, (_, ri) => {
      const repNumber = ri + 1;
      const hit = validTimes.find((t) => t.set_number === setNumber && t.rep_number === repNumber);
      return hit ? hit.time : null;
    });
    const recorded = times.filter((t): t is number => t !== null);
    return { setNumber, times, average: averageOf(recorded) };
  });

  // 平均・最速は表に並べたタイム (本数・セット数の範囲内) だけで出す。
  // 範囲外の rep/set 番号のタイムが残っていても表示と数字が食い違わないようにする
  const shown = sets.flatMap((s) => s.times).filter((t): t is number => t !== null);

  return {
    logId: log.id,
    userId: log.user_id,
    name: user?.name || unknownUserName,
    avatarPath: user?.profile_image_path ?? null,
    note: log.note,
    sets,
    average: averageOf(shown),
    fastest: shown.length > 0 ? Math.min(...shown) : null,
    recordedCount: shown.length,
    totalCount: log.rep_count * log.set_count,
  };
}

/** 平均の速い順。タイムが無い人は最後 (その中では元の順を保つ) */
export function compareMemberRows(a: MemberTimesRow, b: MemberTimesRow): number {
  if (a.average === null && b.average === null) return 0;
  if (a.average === null) return 1;
  if (b.average === null) return -1;
  return a.average - b.average;
}

/**
 * practice_logs をメニューごとにまとめる。メニューの順は、そのメニューが最初に
 * 現れたログの順 (取得時に created_at で並べている)。
 */
export function buildPracticeMenuGroups(
  logs: PracticeLogEntry[],
  unknownUserName: string,
): PracticeMenuGroup[] {
  const groups = new Map<string, PracticeMenuGroup>();

  for (const log of logs) {
    const key = getMenuKey(log);
    let group = groups.get(key);
    if (!group) {
      // タグは web と同じく、そのメニューで最初に現れたログのものを出す
      const tags = (log.practice_log_tags ?? [])
        .map((lt) => lt.practice_tags)
        .filter((tag): tag is PracticeTag => tag !== null);
      group = {
        key,
        style: log.style,
        swimCategory: log.swim_category,
        distance: log.distance,
        repCount: log.rep_count,
        setCount: log.set_count,
        circle: log.circle,
        tags,
        members: [],
      };
      groups.set(key, group);
    }
    group.members.push(buildMemberTimesRow(log, unknownUserName));
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    // Array.prototype.sort は安定ソートなので、同じ平均・タイム無し同士は元の順のまま
    group.members.sort(compareMemberRows);
  }
  return result;
}
