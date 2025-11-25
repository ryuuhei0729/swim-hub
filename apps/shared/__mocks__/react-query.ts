// =============================================================================
// React Query モック - Swim Hub共通パッケージ
// =============================================================================

import { vi } from 'vitest'

/**
 * React QueryのQueryClientモック
 */
export const createMockQueryClient = () => {
  return {
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueriesData: vi.fn(),
    removeQueries: vi.fn(),
  }
}

/**
 * React QueryのuseQueryモック
 */
export const mockUseQuery = vi.fn()

/**
 * React QueryのuseMutationモック
 */
export const mockUseMutation = vi.fn()

/**
 * React QueryのuseQueryClientモック
 */
export const mockUseQueryClient = vi.fn(() => createMockQueryClient())

