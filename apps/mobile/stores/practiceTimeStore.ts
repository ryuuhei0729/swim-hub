// =============================================================================
// 練習タイム用Zustandストア（モバイル版）
// =============================================================================

import type { TimeEntry } from '@apps/shared/types/ui'
import { create } from 'zustand'

interface PracticeTimeState {
  // タイムデータ（menuIdをキーとして保存）
  times: Record<string, TimeEntry[]>
  
  // 現在編集中のメニューID
  currentMenuId: string | null
}

interface PracticeTimeActions {
  // タイムデータの設定
  setTimes: (menuId: string, times: TimeEntry[]) => void
  
  // タイムデータの取得
  getTimes: (menuId: string) => TimeEntry[]
  
  // タイムデータのクリア
  clearTimes: (menuId: string) => void
  
  // 現在編集中のメニューIDの設定
  setCurrentMenuId: (menuId: string | null) => void
  
  // リセット
  reset: () => void
}

const initialState: PracticeTimeState = {
  times: {},
  currentMenuId: null,
}

export const usePracticeTimeStore = create<PracticeTimeState & PracticeTimeActions>()((set, get) => ({
  ...initialState,
  
  // タイムデータの設定
  setTimes: (menuId, times) => {
    set((state) => ({
      times: {
        ...state.times,
        [menuId]: times,
      },
    }))
  },
  
  // タイムデータの取得
  getTimes: (menuId) => {
    return get().times[menuId] || []
  },
  
  // タイムデータのクリア
  clearTimes: (menuId) => {
    set((state) => {
      const newTimes = { ...state.times }
      delete newTimes[menuId]
      return { times: newTimes }
    })
  },
  
  // 現在編集中のメニューIDの設定
  setCurrentMenuId: (menuId) => {
    set({ currentMenuId: menuId })
  },
  
  // リセット
  reset: () => set(initialState),
}))
