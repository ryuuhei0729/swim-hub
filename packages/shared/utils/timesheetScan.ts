// =============================================================================
// タイム記録表の AI 読み取り (Edge Function scan-timesheet) の結果を扱う純粋関数 - Swim Hub共通パッケージ
// web (components/team/OcrScanModal) と mobile (components/teams/TimesheetScanModal) で共有する。
// =============================================================================

/** scan-timesheet が返す解析結果 (supabase/functions/scan-timesheet の出力形式) */
export interface TimesheetScanResult {
  menu: {
    distance: number;
    repCount: number;
    setCount: number;
    circle: number | null;
    description: string;
  };
  swimmers: Array<{
    no: number;
    name: string;
    style: string;
    times: (number | null)[];
  }>;
}

/** 応答が解析結果の形をしているか (想定外の応答をフォームに流し込まないため) */
export function isTimesheetScanResult(obj: unknown): obj is TimesheetScanResult {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  if (typeof o.menu !== "object" || o.menu === null) return false;
  const menu = o.menu as Record<string, unknown>;
  if (typeof menu.distance !== "number") return false;
  if (typeof menu.repCount !== "number") return false;
  if (typeof menu.setCount !== "number") return false;

  if (!Array.isArray(o.swimmers)) return false;
  for (const s of o.swimmers) {
    if (typeof s !== "object" || s === null) return false;
    const swimmer = s as Record<string, unknown>;
    if (typeof swimmer.no !== "number") return false;
    if (typeof swimmer.name !== "string") return false;
    if (!Array.isArray(swimmer.times)) return false;
  }
  return true;
}

// =============================================================================
// 選手名 → チームメンバーのあいまい一致
// =============================================================================

/** 一致判定に使うメンバーの最小形 (名前が無いメンバーは一致の対象外) */
export interface ScanMatchMember {
  user_id: string;
  users?: { name?: string | null } | null;
}

const memberName = (m: ScanMatchMember): string => m.users?.name ?? "";

/** カタカナをひらがなに変換して正規化 */
function normalizeKana(str: string): string {
  return str.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 文字重複スコア (0〜1) */
function characterOverlapScore(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const charsA = new Set(a);
  const charsB = new Set(b);
  let overlap = 0;
  for (const ch of charsA) {
    if (charsB.has(ch)) overlap++;
  }
  return overlap / Math.max(charsA.size, charsB.size);
}

/**
 * 選手名からチームメンバーを探す (完全一致 → 部分一致 → かな正規化後の部分一致 → 文字重複 50% 以上)
 * @returns 一致したメンバーの user_id。見つからなければ null
 */
export function findBestMemberMatch(
  swimmerName: string,
  members: readonly ScanMatchMember[],
  alreadyAssigned: Set<string>,
): string | null {
  if (!swimmerName || swimmerName.trim() === "") return null;

  const name = swimmerName.trim();
  const available = members.filter((m) => !alreadyAssigned.has(m.user_id) && memberName(m) !== "");
  if (available.length === 0) return null;

  const exact = available.find((m) => memberName(m) === name);
  if (exact) return exact.user_id;

  const containsMatch = available.find(
    (m) => memberName(m).includes(name) || name.includes(memberName(m)),
  );
  if (containsMatch) return containsMatch.user_id;

  const normalizedName = normalizeKana(name);
  const kanaMatch = available.find((m) => {
    const normalizedMember = normalizeKana(memberName(m));
    return normalizedMember.includes(normalizedName) || normalizedName.includes(normalizedMember);
  });
  if (kanaMatch) return kanaMatch.user_id;

  let bestScore = 0;
  let bestMember: ScanMatchMember | null = null;
  for (const member of available) {
    const score = characterOverlapScore(name, memberName(member));
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMember = member;
    }
  }
  return bestMember ? bestMember.user_id : null;
}

/**
 * 全選手に自動でメンバーを割り当てる (同じメンバーは1人の選手にだけ割り当てる)
 * @returns swimmer.no → user_id
 */
export function autoAssignMembers(
  swimmers: ReadonlyArray<{ no: number; name: string }>,
  members: readonly ScanMatchMember[],
): Record<number, string> {
  const assignments: Record<number, string> = {};
  const assigned = new Set<string>();
  for (const swimmer of swimmers) {
    const userId = findBestMemberMatch(swimmer.name, members, assigned);
    if (userId) {
      assignments[swimmer.no] = userId;
      assigned.add(userId);
    }
  }
  return assignments;
}

// =============================================================================
// 解析結果 → 練習メニュー
// =============================================================================

/** 結果確認で直したタイムのキー ("選手番号-何本目(0始まり)") */
export const scanTimeKey = (swimmerNo: number, timeIndex: number): string =>
  `${swimmerNo}-${timeIndex}`;

/** 直したタイムがあればそれを、無ければ読み取ったタイムを返す (null は空欄) */
export function resolveScanTime(
  scanResult: TimesheetScanResult,
  editedTimes: Readonly<Record<string, number | null>>,
  swimmerNo: number,
  timeIndex: number,
): number | null {
  const key = scanTimeKey(swimmerNo, timeIndex);
  if (key in editedTimes) {
    const edited = editedTimes[key];
    if (edited !== undefined) return edited;
  }
  const swimmer = scanResult.swimmers.find((s) => s.no === swimmerNo);
  return swimmer?.times[timeIndex] ?? null;
}

/** 解析結果から作る練習メニュー1件 (種目ごと)。フォーム側の形へは各アプリで詰め替える */
export interface ScanMenuDraft {
  style: string;
  distance: number;
  reps: number;
  sets: number;
  /** サークル (秒)。読み取れなければ null */
  circle: number | null;
  note: string;
  /** 割り当てたメンバーと、そのタイム (空欄・0 以下は除く) */
  members: Array<{
    userId: string;
    times: Array<{ setNumber: number; repNumber: number; time: number }>;
  }>;
}

/**
 * 解析結果を種目ごとのメニューにまとめる。メンバーを割り当てていない選手の記録は捨てる。
 * タイムの並びは [1セット目1本目, 1セット目2本目, ..., 2セット目1本目, ...]。
 */
export function buildScanMenuDrafts(
  scanResult: TimesheetScanResult,
  memberAssignments: Readonly<Record<number, string>>,
  editedTimes: Readonly<Record<string, number | null>>,
): ScanMenuDraft[] {
  const repCount = scanResult.menu.repCount || 1;
  const setCount = scanResult.menu.setCount || 1;

  const groups = new Map<string, ScanMenuDraft>();
  for (const swimmer of scanResult.swimmers) {
    const style = swimmer.style || "Fr";
    let group = groups.get(style);
    if (!group) {
      group = {
        style,
        distance: scanResult.menu.distance || 50,
        reps: repCount,
        sets: setCount,
        circle: scanResult.menu.circle || null,
        note: scanResult.menu.description || "",
        members: [],
      };
      groups.set(style, group);
    }
    const userId = memberAssignments[swimmer.no];
    if (!userId) continue;
    const times = swimmer.times
      .map((_, i) => ({
        setNumber: Math.floor(i / repCount) + 1,
        repNumber: (i % repCount) + 1,
        time: resolveScanTime(scanResult, editedTimes, swimmer.no, i) ?? 0,
      }))
      .filter((t) => t.time > 0);
    group.members.push({ userId, times });
  }
  return Array.from(groups.values());
}
