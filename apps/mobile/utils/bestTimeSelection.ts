/**
 * チームメンバー表のベストタイム選択ロジック(純関数)
 * web `useMemberBestTimes.ts` の getBestTimeForMember / MembersTimeTable の
 * getTimeDisplay と同じ意味論を移植したもの。
 */

export interface BestTimeCandidate {
  id: string;
  time: number; // 秒
  poolType: 0 | 1; // 0: 短水路, 1: 長水路
  isRelaying: boolean;
}

export function selectBestTime(
  candidates: BestTimeCandidate[],
  includeRelaying: boolean,
): BestTimeCandidate | null {
  const eligible = includeRelaying ? candidates : candidates.filter((c) => !c.isRelaying);

  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) => (current.time < best.time ? current : best));
}

export function formatBestTimeSuffix(
  bestTime: Pick<BestTimeCandidate, "poolType" | "isRelaying">,
): string {
  let suffix = "";
  if (bestTime.poolType === 1) suffix += "L";
  if (bestTime.isRelaying) suffix += "R";
  return suffix;
}
