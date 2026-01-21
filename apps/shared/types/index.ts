// =============================================================================
// 型定義エクスポート - Swim Hub共通パッケージ
// =============================================================================

// データベース型（後方互換性のため保持）
export * from './index'

// 新しいドメイン別型定義（推奨）
export * from './common'
export * from './user'
export * from './practice'
export * from './record'
export * from './competition'
export * from './team'
export * from './attendance'
export * from './calendar'
export * from './supabase-schema'

// UI・フォーム型
export * from './ui'

// 認証関連型
export * from './auth'

// 目標管理型
export * from './goals'