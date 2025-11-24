// =============================================================================
// React Query クエリキー定義 - Swim Hub共通パッケージ
// =============================================================================

/**
 * 練習記録のクエリキー
 */
export const practiceKeys = {
  all: ['practices'] as const,
  lists: () => [...practiceKeys.all, 'list'] as const,
  list: (filters?: { startDate?: string; endDate?: string }) =>
    [...practiceKeys.lists(), filters] as const,
  detail: (id: string) => [...practiceKeys.all, 'detail', id] as const,
  byDate: (date: string) => [...practiceKeys.all, 'date', date] as const,
  tags: () => [...practiceKeys.all, 'tags'] as const,
} as const

/**
 * 大会記録のクエリキー
 */
export const recordKeys = {
  all: ['records'] as const,
  lists: () => [...recordKeys.all, 'list'] as const,
  list: (filters?: { startDate?: string; endDate?: string; styleId?: number }) =>
    [...recordKeys.lists(), filters] as const,
  detail: (id: string) => [...recordKeys.all, 'detail', id] as const,
  competitions: () => [...recordKeys.all, 'competitions'] as const,
  competitionsList: (filters?: { startDate?: string; endDate?: string }) =>
    [...recordKeys.competitions(), 'list', filters] as const,
  competitionDetail: (id: string) => [...recordKeys.competitions(), 'detail', id] as const,
} as const

/**
 * チームのクエリキー
 */
export const teamKeys = {
  all: ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list: () => [...teamKeys.lists()] as const,
  detail: (id: string) => [...teamKeys.all, 'detail', id] as const,
  members: (teamId: string) => [...teamKeys.detail(teamId), 'members'] as const,
  announcements: (teamId: string) => [...teamKeys.detail(teamId), 'announcements'] as const,
  announcementDetail: (teamId: string, id: string) =>
    [...teamKeys.announcements(teamId), 'detail', id] as const,
} as const

/**
 * お知らせのクエリキー
 */
export const announcementKeys = {
  all: ['announcements'] as const,
  lists: () => [...announcementKeys.all, 'list'] as const,
  list: (teamId: string) => [...announcementKeys.lists(), teamId] as const,
  detail: (teamId: string, id: string) =>
    [...announcementKeys.list(teamId), 'detail', id] as const,
} as const

/**
 * 種目のクエリキー（マスターデータ）
 */
export const styleKeys = {
  all: ['styles'] as const,
  lists: () => [...styleKeys.all, 'list'] as const,
  list: () => [...styleKeys.lists()] as const,
  detail: (id: number) => [...styleKeys.all, 'detail', id] as const,
  byStroke: (stroke: string) => [...styleKeys.all, 'stroke', stroke] as const,
} as const

/**
 * ユーザーのクエリキー
 */
export const userKeys = {
  all: ['user'] as const,
  profile: (userId: string) => [...userKeys.all, 'profile', userId] as const,
  teams: (userId: string) => [...userKeys.all, 'teams', userId] as const,
  current: () => [...userKeys.all, 'current'] as const,
  currentProfile: () => [...userKeys.all, 'current', 'profile'] as const,
  currentTeams: () => [...userKeys.all, 'current', 'teams'] as const,
} as const

