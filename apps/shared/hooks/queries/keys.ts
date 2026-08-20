// =============================================================================
// React Query クエリキー定義 - Swim Hub共通パッケージ
// =============================================================================

/**
 * 練習記録のクエリキー
 */
export const practiceKeys = {
  all: ["practices"] as const,
  lists: () => [...practiceKeys.all, "list"] as const,
  list: (filters?: { startDate?: string; endDate?: string; page?: number; pageSize?: number }) =>
    [...practiceKeys.lists(), filters] as const,
  count: (filters?: { startDate?: string; endDate?: string }) =>
    [...practiceKeys.all, "count", filters] as const,
  detail: (id: string) => [...practiceKeys.all, "detail", id] as const,
  byDate: (date: string) => [...practiceKeys.all, "date", date] as const,
  tags: () => [...practiceKeys.all, "tags"] as const,
} as const;

/**
 * 大会記録のクエリキー
 */
export const recordKeys = {
  all: ["records"] as const,
  lists: () => [...recordKeys.all, "list"] as const,
  list: (filters?: {
    startDate?: string;
    endDate?: string;
    styleId?: number;
    page?: number;
    pageSize?: number;
  }) => [...recordKeys.lists(), filters] as const,
  count: (filters?: { startDate?: string; endDate?: string; styleId?: number }) =>
    [...recordKeys.all, "count", filters] as const,
  // lists() 配下に置き、記録の追加・更新時の lists() invalidate / realtime に追随させる
  // filters 抜きのプレフィックスとして invalidateQueries から利用する (filters を含む
  // listBestCandidates() の生成配列は従来と完全に同一のまま)
  bestCandidates: () => [...recordKeys.lists(), "bestCandidates"] as const,
  listBestCandidates: (filters?: {
    userId?: string;
    styleId?: number;
    isRelaying?: boolean;
    poolType?: number | null;
  }) => [...recordKeys.bestCandidates(), filters] as const,
  detail: (id: string) => [...recordKeys.all, "detail", id] as const,
  competitions: () => [...recordKeys.all, "competitions"] as const,
  competitionsList: (filters?: { startDate?: string; endDate?: string }) =>
    [...recordKeys.competitions(), "list", filters] as const,
  competitionDetail: (id: string) => [...recordKeys.competitions(), "detail", id] as const,
  bestTimes: (userId?: string) => [...recordKeys.all, "bestTimes", userId] as const,
} as const;

/**
 * チームのクエリキー
 */
export const teamKeys = {
  all: ["teams"] as const,
  lists: () => [...teamKeys.all, "list"] as const,
  list: () => [...teamKeys.lists()] as const,
  detail: (id: string) => [...teamKeys.all, "detail", id] as const,
  members: (teamId: string) => [...teamKeys.detail(teamId), "members"] as const,
  pendingMembers: (teamId: string) => [...teamKeys.detail(teamId), "pendingMembers"] as const,
  announcements: (teamId: string) => [...teamKeys.detail(teamId), "announcements"] as const,
  announcementDetail: (teamId: string, id: string) =>
    [...teamKeys.announcements(teamId), "detail", id] as const,
  practices: (teamId: string) => [...teamKeys.detail(teamId), "practices"] as const,
  competitions: (teamId: string) => [...teamKeys.detail(teamId), "competitions"] as const,
  attendanceByPractice: (practiceId: string) =>
    [...teamKeys.all, "attendance", "practice", practiceId] as const,
  attendanceByCompetition: (competitionId: string) =>
    [...teamKeys.all, "attendance", "competition", competitionId] as const,
} as const;

/**
 * お知らせのクエリキー
 */
export const announcementKeys = {
  all: ["announcements"] as const,
  lists: () => [...announcementKeys.all, "list"] as const,
  list: (teamId: string, viewOnly?: boolean) =>
    [...announcementKeys.lists(), teamId, { viewOnly }] as const,
  detail: (teamId: string, id: string) =>
    [...announcementKeys.lists(), teamId, "detail", id] as const,
} as const;

/**
 * 種目のクエリキー（マスターデータ）
 */
export const styleKeys = {
  all: ["styles"] as const,
  lists: () => [...styleKeys.all, "list"] as const,
  list: () => [...styleKeys.lists()] as const,
  detail: (id: number) => [...styleKeys.all, "detail", id] as const,
  byStroke: (stroke: string) => [...styleKeys.all, "stroke", stroke] as const,
} as const;

/**
 * ユーザーのクエリキー
 */
export const userKeys = {
  all: ["user"] as const,
  profile: (userId: string) => [...userKeys.all, "profile", userId] as const,
  teams: (userId: string) => [...userKeys.all, "teams", userId] as const,
  current: () => [...userKeys.all, "current"] as const,
  currentProfile: () => [...userKeys.all, "current", "profile"] as const,
  currentTeams: () => [...userKeys.all, "current", "teams"] as const,
} as const;

/**
 * ダッシュボード統計のクエリキー
 */
export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: (userId: string, month: string) => [...dashboardKeys.all, "stats", userId, month] as const,
} as const;

/**
 * 通知（出欠未回答・エントリー未提出）のクエリキー
 */
export const notificationKeys = {
  all: ["notifications"] as const,
  unanswered: (userId: string, teamIds: string[]) =>
    [...notificationKeys.all, "unanswered", userId, ...[...teamIds].sort()] as const,
  unsubmitted: (userId: string, teamIds: string[]) =>
    [...notificationKeys.all, "unsubmitted", userId, ...[...teamIds].sort()] as const,
} as const;

/**
 * カレンダー記録色設定のクエリキー
 */
export const calendarColorKeys = {
  all: ["calendarColors"] as const,
  settings: (userId: string) => [...calendarColorKeys.all, "settings", userId] as const,
} as const;

/**
 * 練習ログテンプレートのクエリキー
 */
export const practiceLogTemplateKeys = {
  all: ["practiceLogTemplates"] as const,
  lists: () => [...practiceLogTemplateKeys.all, "list"] as const,
  list: () => [...practiceLogTemplateKeys.lists()] as const,
  detail: (id: string) => [...practiceLogTemplateKeys.all, "detail", id] as const,
  count: () => [...practiceLogTemplateKeys.all, "count"] as const,
} as const;

/**
 * 理想LAP (race_pace_models) のクエリキー
 * 全ユーザー共通の参照データなので userId を含めない
 */
export const racePaceKeys = {
  all: ["racePaceModels"] as const,
  models: (filters: {
    gender: string;
    poolType: number;
    stroke: string;
    distance: number;
    ageCategory?: string;
  }) => [...racePaceKeys.all, "models", filters] as const,
  coverage: (filters: {
    gender: string;
    poolType: number;
    stroke: string;
    distance: number;
    ageCategory?: string;
  }) => [...racePaceKeys.all, "coverage", filters] as const,
} as const;
