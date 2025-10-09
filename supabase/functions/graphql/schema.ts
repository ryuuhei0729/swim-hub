// GraphQLスキーマ定義（TypeScript）
export const typeDefs = `
# 水泳選手マネジメントシステム GraphQLスキーマ（個人利用機能対応）

scalar DateTime
scalar JSON
scalar Date

# エラーハンドリング用の型定義
interface Error {
  message: String!
  code: String
  field: String
}

type ValidationError implements Error {
  message: String!
  code: String
  field: String
  details: [ValidationDetail!]
}

type ValidationDetail {
  field: String!
  message: String!
  value: String
}

type NetworkError implements Error {
  message: String!
  code: String
  field: String
  retryable: Boolean!
}

type AuthenticationError implements Error {
  message: String!
  code: String
  field: String
  redirectTo: String
}

union GraphQLError = ValidationError | NetworkError | AuthenticationError

# ページネーション用の型定義
type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
  totalCount: Int
}

interface Connection {
  pageInfo: PageInfo!
  edges: [Edge!]!
}

interface Edge {
  cursor: String!
  node: Node!
}

interface Node {
  id: ID!
}

# 具体的なConnection型
type PracticeConnection implements Connection {
  pageInfo: PageInfo!
  edges: [PracticeEdge!]!
}

type PracticeEdge implements Edge {
  cursor: String!
  node: Practice!
}

type RecordConnection implements Connection {
  pageInfo: PageInfo!
  edges: [RecordEdge!]!
}

type RecordEdge implements Edge {
  cursor: String!
  node: Record!
}

type CompetitionConnection implements Connection {
  pageInfo: PageInfo!
  edges: [CompetitionEdge!]!
}

type CompetitionEdge implements Edge {
  cursor: String!
  node: Competition!
}

# ユーザー関連
enum UserRole {
  PLAYER
  COACH
  DIRECTOR
  MANAGER
}

# チーム関連
enum TeamRole {
  ADMIN
  USER
}


enum EntryStatus {
  UPCOMING
  OPEN
  CLOSED
}

# プール種別は Integer で管理 (0: 短水路, 1: 長水路)

# 泳法
enum SwimStroke {
  FREESTYLE
  BACKSTROKE
  BREASTSTROKE
  BUTTERFLY
  INDIVIDUAL_MEDLEY
}

# 大会カテゴリ
enum CompetitionCategory {
  OFFICIAL      # 公式
  RECORD_MEET   # 記録会
  TIME_TRIAL    # タイムトライアル
}

# 目標タイプ
enum GoalType {
  TIME              # タイム目標
  TECHNIQUE         # 技術面目標
  TRAINING_FREQUENCY # 練習頻度目標
  TRAINING_DISTANCE  # 練習距離目標
}

type User {
  id: ID!
  email: String # ユーザーメールアドレス（nullable）
  name: String # ユーザー名
  profile: Profile
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Profile {
  id: ID!
  userId: ID!
  user: User!
  name: String!
  gender: Int! # 0: male, 1: female
  profileImagePath: String # Supabase Storageのパス
  birthday: Date
  bio: String
  teams: [TeamMembership!]! # 所属チーム
  createdAt: DateTime!
  updatedAt: DateTime!
}

# イベント関連
enum EventType {
  PRACTICE
  COMPETITION
  MEETING
  OTHER
}

type Event {
  id: ID!
  title: String!
  description: String
  eventType: EventType!
  startTime: DateTime!
  endTime: DateTime!
  location: String
  createdBy: ID!
  creator: Profile!
  attendances: [Attendance!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 出席関連
enum AttendanceStatus {
  PRESENT
  ABSENT
  OTHER
}

type Attendance {
  id: ID!
  eventId: ID!
  event: Event!
  userId: ID!
  user: Profile!
  status: AttendanceStatus!
  notes: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 種目・泳法関連
type Style {
  id: ID!
  nameJp: String!
  name: String!
  distance: Int!
  stroke: SwimStroke!
}

# 練習タグ関連
type PracticeTag {
  id: ID!
  userId: ID!
  name: String!
  color: String!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 練習（日単位）関連
type Practice implements Node {
  id: ID!
  userId: ID!
  user: User # ユーザー情報
  date: Date!
  place: String
  note: String
  teamId: ID
  team: Team
  isPersonal: Boolean! # team_idがNULLかどうか
  practiceLogs: [PracticeLog!]!
  # チーム練習の場合のみ出欠情報を含める
  attendance: TeamAttendance
  createdAt: DateTime!
  updatedAt: DateTime!
  # 楽観的更新サポート
  version: Int!
  optimisticId: String
  isOptimistic: Boolean!
}

# 練習記録（メニュー単位）関連
type PracticeLog {
  id: ID!
  userId: ID!
  practiceId: ID!
  practice: Practice
  style: String!
  styleId: Int # スタイルID
  time: Float # タイム
  repCount: Int!
  setCount: Int!
  distance: Int!
  circle: Float
  note: String
  times: [PracticeTime!]!
  tags: [PracticeTag!]
  createdAt: DateTime!
  updatedAt: DateTime!
  # 楽観的更新サポート
  version: Int!
  optimisticId: String
  isOptimistic: Boolean!
}

# 練習タイム記録
type PracticeTime {
  id: ID!
  userId: ID!
  practiceLogId: ID!
  repNumber: Int!
  setNumber: Int!
  time: Float!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 大会関連（remote_migration.sqlと同じ構造）
type Competition implements Node {
  id: ID!
  title: String!
  date: Date!
  place: String
  poolType: Int # 0: short, 1: long (デフォルト: 0)
  note: String
  teamId: ID
  team: Team
  isPersonal: Boolean! # team_idがNULLかどうか
  entryStatus: EntryStatus!
  records: [Record!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 記録関連（remote_migration.sqlと同じ構造）
type Record implements Node {
  id: ID!
  userId: ID!
  user: User # ユーザー情報
  competitionId: ID
  competition: Competition
  styleId: Int! # INTEGERに対応
  style: Style!
  time: Float!
  videoUrl: String
  note: String
  isRelaying: Boolean! # リレー種目かどうか
  teamId: ID
  team: Team
  splitTimes: [SplitTime!]!
  # 楽観的更新サポート
  version: Int!
  optimisticId: String
  isOptimistic: Boolean!
}

# スプリットタイム（remote_migration.sqlと同じ構造）
type SplitTime {
  id: ID!
  recordId: ID!
  distance: Int!
  splitTime: Float!
}

# 個人目標管理関連（individual_features_migration.sqlと同じ構造）
type PersonalGoal {
  id: ID!
  userId: ID!
  goalType: GoalType!
  styleId: Int # INTEGERに対応
  style: Style
  poolType: Int # 0: short, 1: long
  targetTime: Float
  title: String!
  description: String
  targetDate: Date
  startDate: Date!
  isAchieved: Boolean!
  achievedDate: Date
  progress: [GoalProgress!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# 目標進捗記録
type GoalProgress {
  id: ID!
  personalGoalId: ID!
  progressDate: Date!
  progressValue: Float
  progressNote: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# ベストタイム管理（individual_features_migration.sqlと同じ構造）
type BestTime {
  id: ID!
  userId: ID!
  styleId: Int! # INTEGERに対応
  style: Style!
  poolType: Int! # 0: short, 1: long
  bestTime: Float!
  recordId: ID
  record: Record
  achievedDate: Date!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# チーム関連型定義
type Team {
  id: ID!
  name: String!
  description: String
  inviteCode: String!
  createdBy: ID!
  creator: Profile!
  members: [TeamMembership!]!
  groups: [TeamGroup!]!
  announcements: [TeamAnnouncement!]!
  entries: [TeamEntry!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TeamMembership {
  id: ID!
  teamId: ID!
  team: Team!
  userId: ID!
  user: Profile!
  role: TeamRole!
  joinedAt: Date!
  leftAt: Date
  isActive: Boolean!
  groups: [TeamGroup!]! # 所属グループ
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TeamGroup {
  id: ID!
  teamId: ID!
  team: Team!
  name: String!
  description: String
  createdBy: ID!
  creator: Profile!
  members: [Profile!]! # グループ所属メンバー
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TeamAnnouncement {
  id: ID!
  teamId: ID!
  team: Team!
  title: String!
  content: String!
  createdBy: ID!
  creator: Profile!
  isPublished: Boolean!
  publishedAt: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}


type TeamAttendance {
  id: ID!
  scheduleId: ID!
  schedule: Practice!
  userId: ID!
  user: Profile!
  status: AttendanceStatus
  note: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TeamEntry {
  id: ID!
  teamId: ID!
  team: Team!
  competitionId: ID!
  competition: Competition!
  userId: ID!
  user: Profile!
  styleId: Int!
  style: Style!
  entryTime: Float # エントリータイム
  note: String
  createdAt: DateTime!
  updatedAt: DateTime!
}

# お知らせ関連
enum AnnouncementPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

type Announcement {
  id: ID!
  title: String!
  content: String!
  priority: AnnouncementPriority!
  published: Boolean!
  publishedAt: DateTime
  createdBy: ID!
  createdAt: DateTime!
  updatedAt: DateTime!
}

# クエリ
type Query {
  # ユーザー関連
  me: Profile
  users: [Profile!]!
  user(id: ID!): Profile

  # 種目・泳法関連
  styles: [Style!]!
  style(id: ID!): Style

  # 練習タグ関連
  myPracticeTags: [PracticeTag!]!
  practiceTag(id: ID!): PracticeTag

  # 練習関連（個人利用機能対応）
  myPractices(startDate: Date, endDate: Date): [Practice!]!
  myPracticesConnection(
    first: Int
    after: String
    last: Int
    before: String
    startDate: Date
    endDate: Date
  ): PracticeConnection!
  practice(id: ID!): Practice
  practicesByDate(date: Date!): [Practice!]!
  
  # 練習記録（メニュー単位）関連
  myPracticeLogs(startDate: Date, endDate: Date): [PracticeLog!]!
  practiceLog(id: ID!): PracticeLog
  practiceLogsByDate(date: Date!): [PracticeLog!]!

  # 大会関連（個人利用機能対応）
  myCompetitions: [Competition!]!
  competitionsConnection(
    first: Int
    after: String
    last: Int
    before: String
  ): CompetitionConnection!
  competition(id: ID!): Competition
  
  # 記録関連（個人利用機能対応）
  myRecords(startDate: Date, endDate: Date, styleId: Int, poolType: Int): [Record!]!
  myRecordsConnection(
    first: Int
    after: String
    last: Int
    before: String
    startDate: Date
    endDate: Date
    styleId: Int
    poolType: Int
  ): RecordConnection!
  record(id: ID!): Record
  recordsByDate(date: Date!): [Record!]!

  # ベストタイム関連
  myBestTimes(poolType: Int): [BestTime!]!
  bestTime(styleId: Int!, poolType: Int!): BestTime

  # 個人目標関連
  myPersonalGoals: [PersonalGoal!]!
  personalGoal(id: ID!): PersonalGoal

  # カレンダー関連
  calendarData(year: Int!, month: Int!): CalendarData!

  # イベント関連
  events: [Event!]!
  event(id: ID!): Event
  upcomingEvents: [Event!]!

  # 出席関連
  attendances(eventId: ID): [Attendance!]!
  myAttendances: [Attendance!]!

  # お知らせ関連
  announcements: [Announcement!]!
  announcement(id: ID!): Announcement

  # チーム関連
  myTeams: [TeamMembership!]!
  team(id: ID!): Team
  teams: [Team!]!
  teamByInviteCode(inviteCode: String!): Team
  
  # チームメンバー関連
  teamMembers(teamId: ID!): [TeamMembership!]!
  teamMember(teamId: ID!, userId: ID!): TeamMembership
  
  # チームグループ関連
  teamGroups(teamId: ID!): [TeamGroup!]!
  teamGroup(id: ID!): TeamGroup
  
  # チームお知らせ関連
  teamAnnouncements(teamId: ID!): [TeamAnnouncement!]!
  teamAnnouncement(id: ID!): TeamAnnouncement

  
  # チーム出欠関連
  teamAttendance(scheduleId: ID!): [TeamAttendance!]!
  
  # チーム向け練習・大会取得
  teamPractices(teamId: ID!): [Practice!]
  teamCompetitions(teamId: ID!): [Competition!]
  myTeamAttendance(teamId: ID!): [TeamAttendance!]!
  
  # ユーザーが所属するチームの記録・練習・大会取得（ダッシュボード用）
  teamRecords: [Record!]!
  teamPracticesForCalendar(startDate: Date!, endDate: Date!): [Practice!]!
  teamCompetitionsForCalendar: [Competition!]!
  
  # チームエントリー関連
  teamEntries(teamId: ID!, competitionId: ID): [TeamEntry!]!
  myTeamEntries(teamId: ID!): [TeamEntry!]!
}

# カレンダーデータ型
type CalendarData {
  year: Int!
  month: Int!
  days: [CalendarDay!]!
  summary: CalendarSummary!
}

type CalendarDay {
  date: Date!
  hasPractice: Boolean!
  hasCompetition: Boolean!
  practiceCount: Int!
  recordCount: Int!
}

type CalendarSummary {
  totalPractices: Int!
  totalCompetitions: Int!
  totalRecords: Int!
}

# ミューテーション
type Mutation {
  # ユーザー関連
  updateProfile(input: UpdateProfileInput!): Profile!

  # 練習タグ関連
  createPracticeTag(input: CreatePracticeTagInput!): PracticeTag!
  updatePracticeTag(id: ID!, input: UpdatePracticeTagInput!): PracticeTag!
  deletePracticeTag(id: ID!): Boolean!

  # 練習関連（個人利用機能対応）
  createPractice(input: CreatePracticeInput!): Practice!
  createTeamPractice(input: CreateTeamPracticeInput!): Practice!
  updatePractice(id: ID!, input: UpdatePracticeInput!): Practice!
  deletePractice(id: ID!): Boolean!
  
  # バッチ操作用のミューテーション
  bulkCreatePractices(inputs: [CreatePracticeInput!]!): [Practice!]!
  bulkUpdatePractices(inputs: [BulkUpdatePracticeInput!]!): [Practice!]!
  bulkDeletePractices(ids: [ID!]!): [Boolean!]!
  
  # チーム向け一括練習登録（管理者のみ）
  bulkCreateTeamPractices(teamId: ID!, inputs: [CreatePracticeInput!]!): [Practice!]!
  
  # チーム向け一括大会登録（管理者のみ）
  createBulkTeamCompetitions(input: BulkTeamCompetitionsInput!): BulkTeamCompetitionsResult!
  

  # 練習記録（メニュー単位）関連
  createPracticeLog(input: CreatePracticeLogInput!): PracticeLog!
  updatePracticeLog(id: ID!, input: UpdatePracticeLogInput!): PracticeLog!
  deletePracticeLog(id: ID!): Boolean!

  # 練習タイム関連
  createPracticeTime(input: CreatePracticeTimeInput!): PracticeTime!
  updatePracticeTime(id: ID!, input: UpdatePracticeTimeInput!): PracticeTime!
  deletePracticeTime(id: ID!): Boolean!

  # 練習ログタグ関連
  addPracticeLogTag(practiceLogId: ID!, practiceTagId: ID!): Boolean!
  removePracticeLogTag(practiceLogId: ID!, practiceTagId: ID!): Boolean!

  # 大会関連（個人利用機能対応）
  createCompetition(input: CreateCompetitionInput!): Competition!
  updateCompetition(id: ID!, input: UpdateCompetitionInput!): Competition!
  deleteCompetition(id: ID!): Boolean!
  

  # 記録関連（個人利用機能対応）
  createRecord(input: CreateRecordInput!): Record!
  updateRecord(id: ID!, input: UpdateRecordInput!): Record!
  deleteRecord(id: ID!): Boolean!
  
  # 記録のバッチ操作用のミューテーション
  bulkCreateRecords(inputs: [CreateRecordInput!]!): [Record!]!
  bulkUpdateRecords(inputs: [BulkUpdateRecordInput!]!): [Record!]!
  bulkDeleteRecords(ids: [ID!]!): [Boolean!]!

  # スプリットタイム関連
  createSplitTime(input: CreateSplitTimeInput!): SplitTime!
  updateSplitTime(id: ID!, input: UpdateSplitTimeInput!): SplitTime!
  deleteSplitTime(id: ID!): Boolean!

  # 個人目標関連
  createPersonalGoal(input: CreatePersonalGoalInput!): PersonalGoal!
  updatePersonalGoal(id: ID!, input: UpdatePersonalGoalInput!): PersonalGoal!
  deletePersonalGoal(id: ID!): Boolean!

  # 目標進捗関連
  createGoalProgress(input: CreateGoalProgressInput!): GoalProgress!
  updateGoalProgress(id: ID!, input: UpdateGoalProgressInput!): GoalProgress!
  deleteGoalProgress(id: ID!): Boolean!

  # イベント関連
  createEvent(input: CreateEventInput!): Event!
  updateEvent(id: ID!, input: UpdateEventInput!): Event!
  deleteEvent(id: ID!): Boolean!

  # 出席関連
  updateAttendance(input: UpdateAttendanceInput!): Attendance!

  # お知らせ関連
  createAnnouncement(input: CreateAnnouncementInput!): Announcement!
  updateAnnouncement(id: ID!, input: UpdateAnnouncementInput!): Announcement!
  deleteAnnouncement(id: ID!): Boolean!

  # チーム関連
  createTeam(input: CreateTeamInput!): Team!
  updateTeam(id: ID!, input: UpdateTeamInput!): Team!
  deleteTeam(id: ID!): Boolean!
  joinTeam(input: JoinTeamInput!): TeamMembership!
  leaveTeam(teamId: ID!): Boolean!
  
  # チームメンバー管理
  updateTeamMembership(id: ID!, input: UpdateTeamMembershipInput!): TeamMembership!
  removeTeamMember(teamId: ID!, userId: ID!): Boolean!
  
  # チームグループ管理
  createTeamGroup(input: CreateTeamGroupInput!): TeamGroup!
  updateTeamGroup(id: ID!, input: UpdateTeamGroupInput!): TeamGroup!
  deleteTeamGroup(id: ID!): Boolean!
  assignUserToGroup(input: AssignUserToGroupInput!): Boolean!
  removeUserFromGroup(input: RemoveUserFromGroupInput!): Boolean!
  
  # チームお知らせ管理
  createTeamAnnouncement(input: CreateTeamAnnouncementInput!): TeamAnnouncement!
  updateTeamAnnouncement(id: ID!, input: UpdateTeamAnnouncementInput!): TeamAnnouncement!
  deleteTeamAnnouncement(id: ID!): Boolean!
  
  # チームスケジュール管理
  
  # チーム出欠管理
  updateTeamAttendance(input: UpdateTeamAttendanceInput!): TeamAttendance!
  
  # チームエントリー管理
  createTeamEntry(input: CreateTeamEntryInput!): TeamEntry!
  updateTeamEntry(id: ID!, input: UpdateTeamEntryInput!): TeamEntry!
  deleteTeamEntry(id: ID!): Boolean!
  bulkUpdateTeamEntries(inputs: [BulkUpdateTeamEntryInput!]!): [TeamEntry!]!
}

# 入力型
input UpdateProfileInput {
  name: String
  gender: Int # 0: male, 1: female
  birthday: Date
  bio: String
  profileImagePath: String
}

# 練習タグ入力型
input CreatePracticeTagInput {
  name: String!
  color: String
}

input UpdatePracticeTagInput {
  name: String
  color: String
}

# 練習入力型
input CreatePracticeInput {
  date: Date!
  place: String
  note: String
  teamId: ID
}

input CreateTeamPracticeInput {
  date: Date!
  place: String
  note: String
  teamId: ID!
}

input UpdatePracticeInput {
  date: Date
  place: String
  note: String
  teamId: ID
}

# バッチ操作用のInput型
input BulkUpdatePracticeInput {
  id: ID!
  input: UpdatePracticeInput!
}

input BulkUpdateRecordInput {
  id: ID!
  input: UpdateRecordInput!
}

# 練習記録入力型
input CreatePracticeLogInput {
  practiceId: ID!
  style: String!
  repCount: Int!
  setCount: Int!
  distance: Int!
  circle: Float
  note: String
}

input UpdatePracticeLogInput {
  practiceId: ID
  style: String
  repCount: Int
  setCount: Int
  distance: Int
  circle: Float
  note: String
}

# 練習タイム入力型
input CreatePracticeTimeInput {
  practiceLogId: ID!
  repNumber: Int!
  setNumber: Int!
  time: Float!
}

input UpdatePracticeTimeInput {
  repNumber: Int
  setNumber: Int
  time: Float
}

# 大会入力型
input CreateCompetitionInput {
  title: String!
  date: Date!
  place: String
  poolType: Int # 0: short, 1: long (デフォルト: 0)
  note: String
  teamId: ID
}

input UpdateCompetitionInput {
  title: String
  date: Date
  place: String
  poolType: Int
  note: String
  teamId: ID
}

# 一括大会登録用のInput型
input BulkTeamCompetitionsInput {
  teamId: ID!
  competitions: [CreateCompetitionInput!]!
}

# 一括大会登録結果型
type BulkTeamCompetitionsResult {
  success: Boolean!
  message: String!
  createdCompetitions: [Competition!]!
  errors: [CompetitionError!]!
}

# 大会登録エラー型
type CompetitionError {
  index: Int!
  title: String!
  message: String!
}

# 記録入力型
input CreateRecordInput {
  styleId: Int!
  time: Float!
  videoUrl: String
  note: String
  competitionId: ID
  isRelaying: Boolean
  teamId: ID
  splitTimes: [SplitTimeInput!]
}

input UpdateRecordInput {
  styleId: Int
  time: Float
  videoUrl: String
  note: String
  competitionId: ID
  isRelaying: Boolean
  teamId: ID
  splitTimes: [SplitTimeInput!]
}

# スプリットタイム入力型（Record作成・更新用）
input SplitTimeInput {
  distance: Int!
  splitTime: Float!
}

# スプリットタイム入力型
input CreateSplitTimeInput {
  recordId: ID!
  distance: Int!
  splitTime: Float!
}

input UpdateSplitTimeInput {
  distance: Int
  splitTime: Float
}

# 個人目標入力型
input CreatePersonalGoalInput {
  goalType: GoalType!
  styleId: Int
  poolType: Int
  targetTime: Float
  title: String!
  description: String
  targetDate: Date
  startDate: Date
}

input UpdatePersonalGoalInput {
  goalType: GoalType
  styleId: Int
  poolType: Int
  targetTime: Float
  title: String
  description: String
  targetDate: Date
  startDate: Date
  isAchieved: Boolean
  achievedDate: Date
}

# 目標進捗入力型
input CreateGoalProgressInput {
  personalGoalId: ID!
  progressDate: Date!
  progressValue: Float
  progressNote: String
}

input UpdateGoalProgressInput {
  progressDate: Date
  progressValue: Float
  progressNote: String
}

input CreateEventInput {
  title: String!
  description: String
  eventType: EventType!
  startTime: DateTime!
  endTime: DateTime!
  location: String
}

input UpdateEventInput {
  title: String
  description: String
  eventType: EventType
  startTime: DateTime
  endTime: DateTime
  location: String
}

input UpdateAttendanceInput {
  eventId: ID!
  userId: ID!
  status: AttendanceStatus!
  notes: String
}

input CreateAnnouncementInput {
  title: String!
  content: String!
  priority: AnnouncementPriority!
  published: Boolean
  publishedAt: DateTime
}

input UpdateAnnouncementInput {
  title: String
  content: String
  priority: AnnouncementPriority
  published: Boolean
  publishedAt: DateTime
}

# チーム関連入力型
input CreateTeamInput {
  name: String!
  description: String
}

input UpdateTeamInput {
  name: String
  description: String
}

input JoinTeamInput {
  inviteCode: String!
}

input UpdateTeamMembershipInput {
  role: TeamRole
  isActive: Boolean
}

input CreateTeamGroupInput {
  teamId: ID!
  name: String!
  description: String
}

input UpdateTeamGroupInput {
  name: String
  description: String
}

input AssignUserToGroupInput {
  teamGroupId: ID!
  userId: ID!
}

input RemoveUserFromGroupInput {
  teamGroupId: ID!
  userId: ID!
}

input CreateTeamAnnouncementInput {
  teamId: ID!
  title: String!
  content: String!
  isPublished: Boolean
}

input UpdateTeamAnnouncementInput {
  title: String
  content: String
  isPublished: Boolean
}



input UpdateTeamAttendanceInput {
  scheduleId: ID!
  status: AttendanceStatus
  note: String
}

input CreateTeamEntryInput {
  teamId: ID!
  competitionId: ID!
  styleId: Int!
  entryTime: Float
  note: String
}

input UpdateTeamEntryInput {
  styleId: Int
  entryTime: Float
  note: String
  status: EntryStatus
}

input BulkUpdateTeamEntryInput {
  id: ID!
  input: UpdateTeamEntryInput!
}

# =============================================================================
# リゾルバー設計の改善提案
# =============================================================================

# 1. 深いネストを避けるためのリゾルバー設計
# 
# 現在の問題：
# - Practice -> PracticeLogs -> PracticeTimes の深いネスト
# - Record -> SplitTimes の深いネスト
# 
# 改善案：
# - 各レベルで独立したクエリを提供
# - DataLoaderパターンの実装
# - 適切なフィールドレベルのリゾルバー
#
# 例：
# query {
#   myPractices {
#     id
#     date
#     # 必要に応じて個別にクエリ
#   }
#   practiceLogs(practiceId: "xxx") {
#     id
#     style
#   }
# }

# 2. パフォーマンス最適化
# 
# - 不要なフィールドの取得を避ける
# - 適切なインデックスを使用したクエリ
# - キャッシュ戦略の実装
# - N+1問題の解決

# 3. エラーハンドリング
# 
# - 統一されたエラーレスポンス
# - 適切なHTTPステータスコード
# - ユーザーフレンドリーなエラーメッセージ
# - ログとモニタリング

# 4. セキュリティ
# 
# - 認証・認可の適切な実装
# - 入力値の検証
# - SQLインジェクション対策
# - レート制限の実装
`;
