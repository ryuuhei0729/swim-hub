// =============================================================================
// useNetworkStatus.test.ts - ネットワーク状態監視フックのユニットテスト
// =============================================================================

import NetInfo from '@react-native-community/netinfo'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkStatus } from '../useNetworkStatus'

describe('useNetworkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初期状態を正しく返す', async () => {
    // モック: 接続済み状態を返す
    vi.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    } as any)

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
      expect(result.current.isInternetReachable).toBe(true)
      expect(result.current.type).toBe('wifi')
    })
  })

  it('オフライン状態を正しく検知する', async () => {
    // モック: オフライン状態を返す
    vi.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
      type: 'none',
    } as any)

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isInternetReachable).toBe(false)
      expect(result.current.type).toBe('none')
    })
  })

  it('ネットワーク状態の変更を監視する', async () => {
    let listener: ((state: any) => void) | null = null

    // モック: addEventListenerを実装
    vi.spyOn(NetInfo, 'addEventListener').mockImplementation((callback: any) => {
      listener = callback
      return () => {} // unsubscribe関数
    })

    vi.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    } as any)

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // ネットワーク状態を変更
    if (listener) {
      listener({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
      })
    }

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isInternetReachable).toBe(false)
      expect(result.current.type).toBe('none')
    })
  })

  it('isInternetReachableがnullの場合を正しく処理する', async () => {
    vi.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: true,
      isInternetReachable: null,
      type: 'cellular',
    } as any)

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
      expect(result.current.isInternetReachable).toBe(null)
      expect(result.current.type).toBe('cellular')
    })
  })

  it('クリーンアップ時にイベントリスナーを解除する', () => {
    const unsubscribe = vi.fn()
    vi.spyOn(NetInfo, 'addEventListener').mockReturnValue(unsubscribe)

    vi.spyOn(NetInfo, 'fetch').mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    } as any)

    const { unmount } = renderHook(() => useNetworkStatus())

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
