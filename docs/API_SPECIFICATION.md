# 水泳選手マネジメントシステム API定義書

## 概要

本システムは、水泳選手の練習記録、競技記録、個人目標を管理するためのWebアプリケーションです。GraphQLを主要なAPIとして使用し、一部でREST APIも提供しています。

## システム構成

- **Frontend**: Next.js (React)
- **Backend**: Supabase (PostgreSQL + GraphQL)
- **認証**: Supabase Auth
- **ストレージ**: Supabase Storage
- **API**: GraphQL (メイン) + REST API (一部)

## 認証

システムはSupabase Authを使用したJWT認証を採用しています。

### 認証フロー
1. ユーザーがログイン情報を入力
2. Supabase Authでセッション作成
3. JWTトークンがクライアントに返却
4. 以降のAPIリクエストにJWTトークンを含めて送信

### 認証が必要なAPI
- すべてのGraphQL Mutation
- ユーザー固有データを扱うQuery

---

## GraphQL API

### エンドポイント
```
POST /api/graphql
```

### スキーマ概要

#### スカラー型
- `DateTime`: ISO 8601形式の日時
- `Date`: YYYY-MM-DD形式の日付
- `JSON`: JSON形式のデータ

#### 列挙型

##### UserRole
```graphql
enum UserRole {
  PLAYER
  COACH
  DIRECTOR
  MANAGER
}
```

##### SwimStroke (泳法)
```graphql
enum SwimStroke {
  FREESTYLE      # 自由形
  BACKSTROKE     # 背泳ぎ
  BREASTSTROKE   # 平泳ぎ
  BUTTERFLY      # バタフライ
  INDIVIDUAL_MEDLEY  # 個人メドレー
}
```

##### GoalType (目標タイプ)
```graphql
enum GoalType {
  TIME              # タイム目標
  TECHNIQUE         # 技術面目標
  TRAINING_FREQUENCY # 練習頻度目標
  TRAINING_DISTANCE  # 練習距離目標
}
```

##### AttendanceStatus (出席状況)
```graphql
enum AttendanceStatus {
  PRESENT   # 出席
  ABSENT    # 欠席
  LATE      # 遅刻
  EXCUSED   # 公欠
}
```

##### EventType (イベント種別)
```graphql
enum EventType {
  PRACTICE     # 練習
  COMPETITION  # 大会
  MEETING      # ミーティング
  OTHER        # その他
}
```

---

## 主要なデータ型

### User (ユーザー)
```graphql
type User {
  id: ID!
  email: String!
  profile: Profile
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Profile (プロフィール)
```graphql
type Profile {
  id: ID!
  userId: ID!
  user: User!
  name: String!
  gender: Int!           # 0: 男性, 1: 女性
  profileImagePath: String
  birthday: Date
  bio: String
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Style (種目)
```graphql
type Style {
  id: ID!
  nameJp: String!        # 日本語名 (例: "50m自由形")
  name: String!          # 英語名 (例: "50Fr")
  distance: Int!         # 距離 (例: 50)
  stroke: SwimStroke!    # 泳法
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### PracticeLog (練習記録)
```graphql
type PracticeLog {
  id: ID!
  userId: ID!
  date: Date!
  place: String          # 練習場所
  style: String!         # 練習内容
  repCount: Int!         # 本数
  setCount: Int!         # セット数
  distance: Int!         # 距離
  circle: Float          # サークル (秒)
  note: String           # メモ
  times: [PracticeTime!]! # 練習タイム
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### PracticeTime (練習タイム)
```graphql
type PracticeTime {
  id: ID!
  userId: ID!
  practiceLogId: ID!
  repNumber: Int!        # 本数番号
  setNumber: Int!        # セット番号
  time: Float!           # タイム (秒)
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### Competition (大会)
```graphql
type Competition {
  id: ID!
  title: String!         # 大会名
  date: Date!           # 開催日
  place: String!        # 開催地
  poolType: Int         # 0: 短水路, 1: 長水路
  note: String          # メモ
  records: [Record!]!   # 記録
}
```

### Record (記録)
```graphql
type Record {
  id: ID!
  userId: ID!
  competitionId: ID
  competition: Competition
  styleId: Int!
  style: Style!
  time: Float!          # タイム (秒)
  videoUrl: String      # 動画URL
  note: String          # メモ
  splitTimes: [SplitTime!]! # スプリットタイム
}
```

### SplitTime (スプリットタイム)
```graphql
type SplitTime {
  id: ID!
  recordId: ID!
  distance: Int!        # 距離
  splitTime: Float!     # スプリットタイム (秒)
}
```

### PersonalGoal (個人目標)
```graphql
type PersonalGoal {
  id: ID!
  userId: ID!
  goalType: GoalType!
  styleId: Int          # タイム目標の場合のみ
  style: Style
  poolType: Int         # プール種別 (タイム目標の場合)
  targetTime: Float     # 目標タイム
  title: String!        # 目標名
  description: String   # 詳細
  targetDate: Date      # 目標達成日
  startDate: Date!      # 開始日
  isAchieved: Boolean!  # 達成フラグ
  achievedDate: Date    # 達成日
  progress: [GoalProgress!]! # 進捗記録
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

### BestTime (ベストタイム)
```graphql
type BestTime {
  id: ID!
  userId: ID!
  styleId: Int!
  style: Style!
  poolType: Int!        # 0: 短水路, 1: 長水路
  bestTime: Float!      # ベストタイム (秒)
  recordId: ID          # 記録への参照
  record: Record
  achievedDate: Date!   # 達成日
  createdAt: DateTime!
  updatedAt: DateTime!
}
```

---

## Query API

### ユーザー関連

#### 自分のプロフィール取得
```graphql
query {
  me {
    id
    name
    gender
    birthday
    profileImagePath
    bio
    createdAt
    updatedAt
  }
}
```

#### 全ユーザー取得
```graphql
query {
  users {
    id
    name
    gender
    birthday
    profileImagePath
    bio
  }
}
```

### 種目関連

#### 全種目取得
```graphql
query {
  styles {
    id
    nameJp
    name
    distance
    stroke
    createdAt
    updatedAt
  }
}
```

### 練習記録関連

#### 自分の練習記録取得
```graphql
query GetPracticeLogs($startDate: Date, $endDate: Date) {
  myPracticeLogs(startDate: $startDate, endDate: $endDate) {
    id
    userId
    date
    place
    style
    repCount
    setCount
    distance
    circle
    note
    times {
      id
      repNumber
      setNumber
      time
    }
    createdAt
    updatedAt
  }
}
```

#### 特定日の練習記録取得
```graphql
query GetPracticeLogsByDate($date: Date!) {
  practiceLogsByDate(date: $date) {
    id
    userId
    date
    place
    style
    repCount
    setCount
    distance
    circle
    note
    times {
      id
      repNumber
      setNumber
      time
    }
  }
}
```

### 記録関連

#### 自分の記録取得
```graphql
query GetRecords($startDate: Date, $endDate: Date, $styleId: Int, $poolType: Int) {
  myRecords(startDate: $startDate, endDate: $endDate, styleId: $styleId, poolType: $poolType) {
    id
    userId
    competitionId
    styleId
    time
    videoUrl
    note
    competition {
      id
      title
      date
      place
      poolType
    }
    style {
      id
      nameJp
      name
      stroke
      distance
    }
  }
}
```

### ベストタイム関連

#### 自分のベストタイム取得
```graphql
query GetMyBestTimes($poolType: Int) {
  myBestTimes(poolType: $poolType) {
    id
    userId
    styleId
    style {
      id
      nameJp
      name
      distance
      stroke
    }
    poolType
    bestTime
    recordId
    achievedDate
    createdAt
    updatedAt
  }
}
```

### 個人目標関連

#### 自分の個人目標取得
```graphql
query GetMyPersonalGoals {
  myPersonalGoals {
    id
    userId
    goalType
    styleId
    style {
      id
      nameJp
      name
      distance
      stroke
    }
    poolType
    targetTime
    title
    description
    targetDate
    startDate
    isAchieved
    achievedDate
    progress {
      id
      progressDate
      progressValue
      progressNote
    }
    createdAt
    updatedAt
  }
}
```

### カレンダー関連

#### カレンダーデータ取得
```graphql
query GetCalendarData($year: Int!, $month: Int!) {
  calendarData(year: $year, month: $month) {
    year
    month
    days {
      date
      hasPractice
      hasCompetition
      practiceCount
      recordCount
    }
    summary {
      totalPractices
      totalCompetitions
      totalRecords
    }
  }
}
```

---

## Mutation API

### プロフィール更新

#### プロフィール更新
```graphql
mutation UpdateProfile($input: UpdateProfileInput!) {
  updateProfile(input: $input) {
    id
    userId
    name
    gender
    birthday
    profileImagePath
    bio
    updatedAt
  }
}

# 入力型
input UpdateProfileInput {
  name: String
  gender: Int
  birthday: Date
  bio: String
  profileImagePath: String
}
```

### 練習記録関連

#### 練習記録作成
```graphql
mutation CreatePracticeLog($input: CreatePracticeLogInput!) {
  createPracticeLog(input: $input) {
    id
    userId
    date
    place
    style
    repCount
    setCount
    distance
    circle
    note
    createdAt
    updatedAt
  }
}

# 入力型
input CreatePracticeLogInput {
  date: Date
  practiceDate: Date    # dateの別名
  place: String
  location: String      # placeの別名
  style: String!
  repCount: Int!
  setCount: Int!
  distance: Int!
  circle: Float
  note: String
}
```

#### 練習記録更新
```graphql
mutation UpdatePracticeLog($id: ID!, $input: UpdatePracticeLogInput!) {
  updatePracticeLog(id: $id, input: $input) {
    id
    userId
    date
    place
    style
    repCount
    setCount
    distance
    circle
    note
    createdAt
    updatedAt
  }
}

# 入力型
input UpdatePracticeLogInput {
  date: Date
  place: String
  style: String
  repCount: Int
  setCount: Int
  distance: Int
  circle: Float
  note: String
}
```

#### 練習記録削除
```graphql
mutation DeletePracticeLog($id: ID!) {
  deletePracticeLog(id: $id)  # Boolean
}
```

### 記録関連

#### 記録作成
```graphql
mutation CreateRecord($input: CreateRecordInput!) {
  createRecord(input: $input) {
    id
    userId
    styleId
    time
    videoUrl
    note
    competitionId
    style {
      id
      nameJp
      name
      distance
      stroke
    }
    competition {
      id
      title
      date
      place
      poolType
    }
    createdAt
    updatedAt
  }
}

# 入力型
input CreateRecordInput {
  styleId: Int!
  time: Float!
  videoUrl: String
  note: String
  competitionId: ID
}
```

#### 記録更新
```graphql
mutation UpdateRecord($id: ID!, $input: UpdateRecordInput!) {
  updateRecord(id: $id, input: $input) {
    id
    userId
    styleId
    time
    videoUrl
    note
    competitionId
    createdAt
    updatedAt
  }
}

# 入力型
input UpdateRecordInput {
  styleId: Int
  time: Float
  videoUrl: String
  note: String
  competitionId: ID
}
```

#### 記録削除
```graphql
mutation DeleteRecord($id: ID!) {
  deleteRecord(id: $id)  # Boolean
}
```

### 大会関連

#### 大会作成
```graphql
mutation CreateCompetition($input: CreateCompetitionInput!) {
  createCompetition(input: $input) {
    id
    title
    date
    place
    poolType
    note
  }
}

# 入力型
input CreateCompetitionInput {
  title: String!
  date: Date!
  place: String!
  poolType: Int  # 0: 短水路, 1: 長水路 (デフォルト: 0)
  note: String
}
```

### 個人目標関連

#### 個人目標作成
```graphql
mutation CreatePersonalGoal($input: CreatePersonalGoalInput!) {
  createPersonalGoal(input: $input) {
    id
    userId
    goalType
    styleId
    style {
      id
      nameJp
      name
      distance
      stroke
    }
    poolType
    targetTime
    title
    description
    targetDate
    startDate
    isAchieved
    achievedDate
    createdAt
    updatedAt
  }
}

# 入力型
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
```

#### 個人目標更新
```graphql
mutation UpdatePersonalGoal($id: ID!, $input: UpdatePersonalGoalInput!) {
  updatePersonalGoal(id: $id, input: $input) {
    id
    userId
    goalType
    styleId
    poolType
    targetTime
    title
    description
    targetDate
    startDate
    isAchieved
    achievedDate
    updatedAt
  }
}

# 入力型
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
```

#### 目標進捗作成
```graphql
mutation CreateGoalProgress($input: CreateGoalProgressInput!) {
  createGoalProgress(input: $input) {
    id
    personalGoalId
    progressDate
    progressValue
    progressNote
    createdAt
    updatedAt
  }
}

# 入力型
input CreateGoalProgressInput {
  personalGoalId: ID!
  progressDate: Date!
  progressValue: Float
  progressNote: String
}
```

---

## REST API

### 認証関連

#### 認証コールバック
```
GET /api/auth/callback?code={code}&redirect_to={path}
```

**説明**: Supabase Authからのコールバックを処理し、認証セッションを確立します。

**パラメータ**:
- `code`: 認証コード (必須)
- `redirect_to`: 認証後のリダイレクト先 (オプション、デフォルト: `/dashboard`)

**レスポンス**: リダイレクト

### ヘルスチェック

#### システム状態確認
```
GET /api/health
```

**レスポンス**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

---

## データベーススキーマ

### 主要テーブル

#### users (ユーザー)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | Supabase Auth連携 |
| name | TEXT | NOT NULL | 氏名 |
| gender | INTEGER | NOT NULL, DEFAULT 0 | 性別 (0:男性, 1:女性) |
| birthday | DATE | | 生年月日 |
| profile_image_path | TEXT | | プロフィール画像パス |
| bio | TEXT | | 自己紹介 |
| created_at | TIMESTAMP | DEFAULT NOW() | 作成日時 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新日時 |

#### styles (種目) - 固定データ
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | INTEGER | PRIMARY KEY | 種目ID |
| name_jp | TEXT | NOT NULL | 日本語名 |
| name | TEXT | NOT NULL | 英語名 |
| style | TEXT | NOT NULL | 泳法 (fr/br/ba/fly/im) |
| distance | INTEGER | NOT NULL | 距離 |

#### practice_logs (練習記録)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | |
| user_id | UUID | NOT NULL, FK | ユーザーID |
| date | DATE | NOT NULL | 練習日 |
| place | TEXT | | 練習場所 |
| style | TEXT | NOT NULL | 練習内容 |
| rep_count | INTEGER | NOT NULL | 本数 |
| set_count | INTEGER | NOT NULL | セット数 |
| distance | INTEGER | NOT NULL | 距離 |
| circle | DECIMAL(10,2) | | サークル (秒) |
| note | TEXT | | メモ |

#### records (記録)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | |
| user_id | UUID | NOT NULL, FK | ユーザーID |
| competition_id | UUID | FK | 大会ID |
| style_id | INTEGER | NOT NULL, FK | 種目ID |
| time | DECIMAL(10,2) | NOT NULL | タイム (秒) |
| video_url | TEXT | | 動画URL |
| note | TEXT | | メモ |

#### competitions (大会)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | |
| title | TEXT | NOT NULL | 大会名 |
| date | DATE | NOT NULL | 開催日 |
| place | TEXT | NOT NULL | 開催地 |
| pool_type | INTEGER | DEFAULT 0 | プール種別 (0:短水路, 1:長水路) |
| note | TEXT | | メモ |

#### personal_goals (個人目標)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | |
| user_id | UUID | NOT NULL, FK | ユーザーID |
| goal_type | TEXT | NOT NULL | 目標タイプ |
| style_id | INTEGER | FK | 種目ID |
| pool_type | INTEGER | | プール種別 |
| target_time | DECIMAL(10,2) | | 目標タイム |
| title | TEXT | NOT NULL | 目標名 |
| description | TEXT | | 詳細 |
| target_date | DATE | | 目標達成日 |
| start_date | DATE | DEFAULT CURRENT_DATE | 開始日 |
| is_achieved | BOOLEAN | DEFAULT false | 達成フラグ |
| achieved_date | DATE | | 達成日 |

#### best_times (ベストタイム)
| カラム | 型 | 制約 | 説明 |
|--------|----|----|------|
| id | UUID | PRIMARY KEY | |
| user_id | UUID | NOT NULL, FK | ユーザーID |
| style_id | INTEGER | NOT NULL, FK | 種目ID |
| pool_type | INTEGER | NOT NULL | プール種別 |
| best_time | DECIMAL(10,2) | NOT NULL | ベストタイム |
| record_id | UUID | FK | 記録ID |
| achieved_date | DATE | NOT NULL | 達成日 |

---

## エラーハンドリング

### GraphQLエラー
```json
{
  "errors": [
    {
      "message": "認証が必要です",
      "locations": [{"line": 2, "column": 3}],
      "path": ["me"]
    }
  ],
  "data": null
}
```

### REST APIエラー
```json
{
  "error": "Unauthorized",
  "message": "認証が必要です",
  "statusCode": 401
}
```

---

## レート制限

現在、特別なレート制限は設定されていませんが、Supabaseの制限に従います。

---

## 使用例

### 練習記録の作成から取得まで

1. **練習記録作成**
```graphql
mutation {
  createPracticeLog(input: {
    date: "2024-01-15"
    place: "市民プール"
    style: "50m自由形"
    repCount: 8
    setCount: 4
    distance: 50
    circle: 60.0
    note: "フォーム重視"
  }) {
    id
    date
    style
  }
}
```

2. **練習記録取得**
```graphql
query {
  myPracticeLogs(startDate: "2024-01-01", endDate: "2024-01-31") {
    id
    date
    place
    style
    repCount
    setCount
    distance
    circle
    note
  }
}
```

### 個人目標の設定と進捗管理

1. **目標設定**
```graphql
mutation {
  createPersonalGoal(input: {
    goalType: TIME
    styleId: 1
    poolType: 0
    targetTime: 25.00
    title: "50m自由形 25秒切り"
    description: "短水路での目標"
    targetDate: "2024-06-30"
  }) {
    id
    title
    targetTime
  }
}
```

2. **進捗記録**
```graphql
mutation {
  createGoalProgress(input: {
    personalGoalId: "goal-id-here"
    progressDate: "2024-01-15"
    progressValue: 25.50
    progressNote: "少しずつ改善中"
  }) {
    id
    progressValue
  }
}
```

---

## 更新履歴

| バージョン | 日付 | 変更内容 |
|------------|------|----------|
| 1.0.0 | 2024-01-01 | 初版作成 |

---

本API定義書は、水泳選手マネジメントシステムの全機能を網羅しており、開発者がシステムを理解し、効率的に開発を進められるよう設計されています。
