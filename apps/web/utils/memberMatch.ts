/**
 * 選手名→チームメンバーのファジーマッチング
 */

interface TeamMember {
  id: string
  user_id: string
  users: {
    id: string
    name: string
  }
}

/**
 * 選手名からチームメンバーを検索する
 * @returns マッチしたメンバーの user_id、見つからなければ null
 */
export function findBestMemberMatch(
  swimmerName: string,
  members: TeamMember[],
  alreadyAssigned: Set<string>
): string | null {
  if (!swimmerName || swimmerName.trim() === '') return null

  const name = swimmerName.trim()
  const available = members.filter((m) => !alreadyAssigned.has(m.user_id))
  if (available.length === 0) return null

  // 1. 完全一致
  const exact = available.find((m) => m.users.name === name)
  if (exact) return exact.user_id

  // 2. 部分一致 (contains)
  const containsMatch = available.find(
    (m) => m.users.name.includes(name) || name.includes(m.users.name)
  )
  if (containsMatch) return containsMatch.user_id

  // 3. カタカナ/ひらがな正規化後に部分一致
  const normalizedName = normalizeKana(name)
  const kanaMatch = available.find((m) => {
    const normalizedMember = normalizeKana(m.users.name)
    return normalizedMember.includes(normalizedName) || normalizedName.includes(normalizedMember)
  })
  if (kanaMatch) return kanaMatch.user_id

  // 4. 文字重複スコア (50%以上でマッチ)
  let bestScore = 0
  let bestMember: TeamMember | null = null
  for (const member of available) {
    const score = characterOverlapScore(name, member.users.name)
    if (score > bestScore && score >= 0.5) {
      bestScore = score
      bestMember = member
    }
  }
  if (bestMember) return bestMember.user_id

  return null
}

/**
 * カタカナをひらがなに変換して正規化
 */
function normalizeKana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  )
}

/**
 * 文字重複スコアを計算 (0〜1)
 */
function characterOverlapScore(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0
  const charsA = new Set(a)
  const charsB = new Set(b)
  let overlap = 0
  for (const ch of charsA) {
    if (charsB.has(ch)) overlap++
  }
  return overlap / Math.max(charsA.size, charsB.size)
}

/**
 * 全選手に対して自動マッチングを実行
 * @returns swimmer.no → user_id のマッピング
 */
export function autoAssignMembers(
  swimmers: Array<{ no: number; name: string }>,
  members: TeamMember[]
): Record<number, string> {
  const assignments: Record<number, string> = {}
  const assigned = new Set<string>()

  for (const swimmer of swimmers) {
    const userId = findBestMemberMatch(swimmer.name, members, assigned)
    if (userId) {
      assignments[swimmer.no] = userId
      assigned.add(userId)
    }
  }

  return assignments
}
