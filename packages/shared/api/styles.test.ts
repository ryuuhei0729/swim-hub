import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockStyle, createMockSupabaseClient } from '../__mocks__/supabase'
import { StyleAPI } from './styles'

describe('StyleAPI', () => {
  let mockClient: any
  let api: StyleAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new StyleAPI(mockClient)
  })

  describe('getStyles', () => {
    it('should fetch all styles', async () => {
      const mockStyles = [
        createMockStyle({ id: '1', name_en: 'freestyle', distance: 50 }),
        createMockStyle({ id: '2', name_en: 'freestyle', distance: 100 }),
      ]

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockStyles,
          error: null,
        }),
      }))

      const result = await api.getStyles()

      expect(mockClient.from).toHaveBeenCalledWith('styles')
      expect(result).toEqual(mockStyles)
    })

    it('should throw error if query fails', async () => {
      const error = new Error('Query failed')
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      }))

      await expect(api.getStyles()).rejects.toThrow('Query failed')
    })
  })

  describe('getStyle', () => {
    it('should fetch specific style by ID', async () => {
      const mockStyle = createMockStyle({ id: '1', distance: 100 })

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockStyle,
          error: null,
        }),
      }))

      const result = await api.getStyle(1)

      expect(mockClient.from).toHaveBeenCalledWith('styles')
      expect(result).toEqual(mockStyle)
    })
  })

  describe('getStylesByStroke', () => {
    it('should fetch styles filtered by stroke', async () => {
      const mockStyles = [
        createMockStyle({ name_en: 'freestyle', distance: 50 }),
        createMockStyle({ name_en: 'freestyle', distance: 100 }),
      ]

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockStyles,
          error: null,
        }),
      }))

      const result = await api.getStylesByStroke('freestyle')

      expect(mockClient.from).toHaveBeenCalledWith('styles')
      expect(result).toEqual(mockStyles)
    })
  })
})

