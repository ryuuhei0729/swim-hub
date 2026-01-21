import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types'
import { vi } from 'vitest'

/**
 * テスト用のモックSupabaseクライアント型
 * 実際にモックされるメソッドのみを含む
 */
export type MockSupabaseClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>
    signInWithPassword: ReturnType<typeof vi.fn>
    signOut: ReturnType<typeof vi.fn>
    getSession: ReturnType<typeof vi.fn>
  }
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  channel: ReturnType<typeof vi.fn>
  removeChannel: ReturnType<typeof vi.fn>
}

/**
 * テスト用のモッククエリビルダー型
 * ジェネリック型Tはクエリの結果データの型
 */
export interface MockQueryBuilder<T = unknown> {
  select: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  upsert: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  neq: ReturnType<typeof vi.fn>
  gt: ReturnType<typeof vi.fn>
  gte: ReturnType<typeof vi.fn>
  lt: ReturnType<typeof vi.fn>
  lte: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  like: ReturnType<typeof vi.fn>
  ilike: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  contains: ReturnType<typeof vi.fn>
  overlaps: ReturnType<typeof vi.fn>
  or: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  range: ReturnType<typeof vi.fn>
  returns: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  then: <TResult1 = { data: T; error: unknown; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: unknown; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>
}
