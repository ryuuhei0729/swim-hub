// =============================================================================
// useNetworkStatus.test.ts - ネットワーク状態監視フックのユニットテスト
// =============================================================================

import type { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo'
import NetInfo from '@react-native-community/netinfo'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNetworkStatus } from '../useNetworkStatus'

const createState = (state: Partial<Omit<NetInfoState, 'type'>> & { type?: NetInfoStateType }): NetInfoState =>
  ({
    type: 'unknown' as NetInfoStateType,
    isConnected: false,
    isInternetReachable: false,
    details: null,
    ...state,
  } as NetInfoState)

describe('useNetworkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 静的モックの状態をリセット
    ;(NetInfo as unknown as { _setState: (state: Partial<NetInfoState>) => void })._setState({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi' as NetInfoStateType,
    })
  })

  it('初期状態を正しく返す', async () => {
    // モック: 接続済み状態を返す
    vi.mocked(NetInfo.fetch).mockResolvedValue(
      createState({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi' as NetInfoStateType,
      })
    )

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
      expect(result.current.isInternetReachable).toBe(true)
      expect(result.current.type).toBe('wifi')
    })
  })

  it('オフライン状態を正しく検知する', async () => {
    // モック: オフライン状態を返す
    vi.mocked(NetInfo.fetch).mockResolvedValue(
      createState({
        isConnected: false,
        isInternetReachable: false,
        type: 'none' as NetInfoStateType,
      })
    )

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isInternetReachable).toBe(false)
      expect(result.current.type).toBe('none')
    })
  })

  it('ネットワーク状態の変更を監視する', async () => {
    let listener: ((state: NetInfoState) => void) | undefined

    // モック: addEventListenerを実装
    vi.mocked(NetInfo.addEventListener).mockImplementation((callback: (state: NetInfoState) => void) => {
      listener = callback
      return () => {} // unsubscribe関数
    })

    vi.mocked(NetInfo.fetch).mockResolvedValue(
      createState({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi' as NetInfoStateType,
      })
    )

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
    })

    // ネットワーク状態を変更
    listener?.(
      createState({
        isConnected: false,
        isInternetReachable: false,
        type: 'none' as NetInfoStateType,
      })
    )

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isInternetReachable).toBe(false)
      expect(result.current.type).toBe('none')
    })
  })

  it('isInternetReachableがnullの場合を正しく処理する', async () => {
    vi.mocked(NetInfo.fetch).mockResolvedValue(
      createState({
        isConnected: true,
        isInternetReachable: null,
        type: 'cellular' as NetInfoStateType,
      })
    )

    const { result } = renderHook(() => useNetworkStatus())

    await waitFor(() => {
      expect(result.current.isConnected).toBe(true)
      expect(result.current.isInternetReachable).toBe(null)
      expect(result.current.type).toBe('cellular')
    })
  })

  it('クリーンアップ時にイベントリスナーを解除する', () => {
    const unsubscribe = vi.fn()
    vi.mocked(NetInfo.addEventListener).mockReturnValue(unsubscribe)

    vi.mocked(NetInfo.fetch).mockResolvedValue(
      createState({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi' as NetInfoStateType,
      })
    )

    const { unmount } = renderHook(() => useNetworkStatus())

    unmount()

    expect(unsubscribe).toHaveBeenCalled()
  })
})
