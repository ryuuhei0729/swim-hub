import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePracticeLogForm } from '../../components/forms/practice-log/hooks/usePracticeLogForm'
import type { PracticeLogEditData, Tag } from '../../components/forms/practice-log/types'
import type { TimeEntry } from '@apps/shared/types/ui'

describe('usePracticeLogForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('初期状態', () => {
    it('isOpen=trueのときデフォルトメニューが1つ作成される', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus).toHaveLength(1)
    })

    it('デフォルトメニューのstyleはFrである', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].style).toBe('Fr')
    })

    it('デフォルトメニューのswimCategoryはSwimである', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].swimCategory).toBe('Swim')
    })

    it('デフォルトメニューのdistanceは100である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].distance).toBe(100)
    })

    it('デフォルトメニューのrepsは4である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].reps).toBe(4)
    })

    it('デフォルトメニューのsetsは1である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].sets).toBe(1)
    })

    it('デフォルトメニューのcircleMinは1、circleSecは30である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].circleMin).toBe(1)
      expect(result.current.menus[0].circleSec).toBe(30)
    })

    it('デフォルトメニューのnoteは空文字である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].note).toBe('')
    })

    it('デフォルトメニューのtagsは空配列である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].tags).toEqual([])
    })

    it('デフォルトメニューのtimesは空配列である', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.menus[0].times).toEqual([])
    })

    it('showTimeModalの初期値はfalseである', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.showTimeModal).toBe(false)
    })

    it('currentMenuIdの初期値はnullである', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      expect(result.current.currentMenuId).toBeNull()
    })
  })

  describe('addMenu', () => {
    it('新しいメニューを追加できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.addMenu()
      })

      expect(result.current.menus).toHaveLength(2)
    })

    it('追加されたメニューはデフォルト値を持つ', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.addMenu()
      })

      const newMenu = result.current.menus[1]
      expect(newMenu.style).toBe('Fr')
      expect(newMenu.swimCategory).toBe('Swim')
      expect(newMenu.distance).toBe(100)
      expect(newMenu.reps).toBe(4)
      expect(newMenu.sets).toBe(1)
    })

    it('複数のメニューを追加できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.addMenu()
        result.current.addMenu()
        result.current.addMenu()
      })

      expect(result.current.menus).toHaveLength(4)
    })

    it('追加されたメニューは一意のIDを持つ', () => {
      vi.useFakeTimers()

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        vi.advanceTimersByTime(1)
        result.current.addMenu()
      })

      act(() => {
        vi.advanceTimersByTime(1)
        result.current.addMenu()
      })

      const ids = result.current.menus.map((m) => m.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)

      vi.useRealTimers()
    })
  })

  describe('removeMenu', () => {
    it('指定したIDのメニューを削除できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuIdToRemove = result.current.menus[0].id

      act(() => {
        result.current.addMenu()
      })

      expect(result.current.menus).toHaveLength(2)

      act(() => {
        result.current.removeMenu(menuIdToRemove)
      })

      expect(result.current.menus).toHaveLength(1)
      expect(result.current.menus.find((m) => m.id === menuIdToRemove)).toBeUndefined()
    })

    it('メニューが1つしかない場合は削除されない', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.removeMenu(menuId)
      })

      expect(result.current.menus).toHaveLength(1)
    })

    it('存在しないIDを指定しても何も起きない', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.addMenu()
      })

      const initialLength = result.current.menus.length

      act(() => {
        result.current.removeMenu('non-existent-id')
      })

      expect(result.current.menus).toHaveLength(initialLength)
    })
  })

  describe('updateMenu', () => {
    it('styleを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'style', 'Ba')
      })

      expect(result.current.menus[0].style).toBe('Ba')
    })

    it('swimCategoryを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'swimCategory', 'Kick')
      })

      expect(result.current.menus[0].swimCategory).toBe('Kick')
    })

    it('distanceを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'distance', 200)
      })

      expect(result.current.menus[0].distance).toBe(200)
    })

    it('repsを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'reps', 8)
      })

      expect(result.current.menus[0].reps).toBe(8)
    })

    it('setsを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'sets', 3)
      })

      expect(result.current.menus[0].sets).toBe(3)
    })

    it('circleMinとcircleSecを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'circleMin', 2)
        result.current.updateMenu(menuId, 'circleSec', 0)
      })

      expect(result.current.menus[0].circleMin).toBe(2)
      expect(result.current.menus[0].circleSec).toBe(0)
    })

    it('noteを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'note', 'テストメモ')
      })

      expect(result.current.menus[0].note).toBe('テストメモ')
    })

    it('存在しないIDを指定しても何も起きない', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const originalStyle = result.current.menus[0].style

      act(() => {
        result.current.updateMenu('non-existent-id', 'style', 'Ba')
      })

      expect(result.current.menus[0].style).toBe(originalStyle)
    })

    it('空文字を設定できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'distance', '')
      })

      expect(result.current.menus[0].distance).toBe('')
    })
  })

  describe('handleTagsChange', () => {
    it('タグを更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id
      const newTags: Tag[] = [
        { id: '1', name: 'スプリント', color: '#ff0000', user_id: 'u1', created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: '2', name: 'ドリル', color: '#00ff00', user_id: 'u1', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]

      act(() => {
        result.current.handleTagsChange(menuId, newTags)
      })

      expect(result.current.menus[0].tags).toEqual(newTags)
    })

    it('タグを空配列に更新できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id
      const initialTags: Tag[] = [
        { id: '1', name: 'テスト', color: '#000000', user_id: 'u1', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]

      act(() => {
        result.current.handleTagsChange(menuId, initialTags)
      })

      act(() => {
        result.current.handleTagsChange(menuId, [])
      })

      expect(result.current.menus[0].tags).toEqual([])
    })
  })

  describe('タイムモーダル操作', () => {
    it('openTimeModalでモーダルを開ける', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.openTimeModal(menuId)
      })

      expect(result.current.showTimeModal).toBe(true)
      expect(result.current.currentMenuId).toBe(menuId)
    })

    it('handleTimeSaveでタイムを保存しモーダルを閉じる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id
      const times: TimeEntry[] = [
        { setNumber: 1, repNumber: 1, time: 65.5 },
        { setNumber: 1, repNumber: 2, time: 66.0 },
      ]

      act(() => {
        result.current.openTimeModal(menuId)
      })

      act(() => {
        result.current.handleTimeSave(times)
      })

      expect(result.current.menus[0].times).toEqual(times)
      expect(result.current.showTimeModal).toBe(false)
      expect(result.current.currentMenuId).toBeNull()
    })

    it('currentMenuIdがnullのときhandleTimeSaveは何もしない', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const originalTimes = result.current.menus[0].times

      act(() => {
        result.current.handleTimeSave([{ setNumber: 1, repNumber: 1, time: 65.5 }])
      })

      expect(result.current.menus[0].times).toEqual(originalTimes)
    })

    it('getCurrentMenuで現在のメニューを取得できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.openTimeModal(menuId)
      })

      const currentMenu = result.current.getCurrentMenu()
      expect(currentMenu?.id).toBe(menuId)
    })

    it('currentMenuIdがnullのときgetCurrentMenuはundefinedを返す', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const currentMenu = result.current.getCurrentMenu()
      expect(currentMenu).toBeUndefined()
    })
  })

  describe('prepareSubmitData', () => {
    it('メニューデータを送信用形式に変換できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const submitData = result.current.prepareSubmitData()

      expect(submitData).toHaveLength(1)
      expect(submitData[0]).toEqual({
        style: 'Fr',
        swimCategory: 'Swim',
        distance: 100,
        reps: 4,
        sets: 1,
        circleTime: 90, // 1分30秒 = 90秒
        note: '',
        tags: [],
        times: [],
      })
    })

    it('circleTimeが0の場合はnullになる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'circleMin', 0)
        result.current.updateMenu(menuId, 'circleSec', 0)
      })

      const submitData = result.current.prepareSubmitData()
      expect(submitData[0].circleTime).toBeNull()
    })

    it('複数メニューを正しく変換できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.addMenu()
      })

      const menuId1 = result.current.menus[0].id
      const menuId2 = result.current.menus[1].id

      act(() => {
        result.current.updateMenu(menuId1, 'style', 'Ba')
        result.current.updateMenu(menuId1, 'distance', 50)
        result.current.updateMenu(menuId2, 'style', 'Br')
        result.current.updateMenu(menuId2, 'distance', 200)
      })

      const submitData = result.current.prepareSubmitData()

      expect(submitData).toHaveLength(2)
      expect(submitData[0].style).toBe('Ba')
      expect(submitData[0].distance).toBe(50)
      expect(submitData[1].style).toBe('Br')
      expect(submitData[1].distance).toBe(200)
    })

    it('空文字のフィールドはデフォルト値に変換される', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id

      act(() => {
        result.current.updateMenu(menuId, 'distance', '')
        result.current.updateMenu(menuId, 'reps', '')
        result.current.updateMenu(menuId, 'sets', '')
      })

      const submitData = result.current.prepareSubmitData()

      expect(submitData[0].distance).toBe(100) // Number('') || 100 = 100
      expect(submitData[0].reps).toBe(1) // Number('') || 1 = 1
      expect(submitData[0].sets).toBe(1) // Number('') || 1 = 1
    })

    it('タグとタイムが正しく含まれる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const menuId = result.current.menus[0].id
      const tags: Tag[] = [
        { id: '1', name: 'スプリント', color: '#ff0000', user_id: 'u1', created_at: '2024-01-01', updated_at: '2024-01-01' },
      ]
      const times: TimeEntry[] = [
        { setNumber: 1, repNumber: 1, time: 65.5 },
      ]

      act(() => {
        result.current.handleTagsChange(menuId, tags)
        result.current.openTimeModal(menuId)
      })

      act(() => {
        result.current.handleTimeSave(times)
      })

      const submitData = result.current.prepareSubmitData()

      expect(submitData[0].tags).toEqual(tags)
      expect(submitData[0].times).toEqual(times)
    })
  })

  describe('editDataによる初期化', () => {
    it('editDataがある場合、フォームが編集データで初期化される', () => {
      const editData: PracticeLogEditData = {
        id: 'edit-1',
        style: 'Ba',
        swim_category: 'Kick',
        distance: 50,
        rep_count: 8,
        set_count: 2,
        circle: 120, // 2分
        note: 'テストノート',
        tags: [{ id: 't1', name: 'タグ1', color: '#ff0000', user_id: 'u1', created_at: '2024-01-01', updated_at: '2024-01-01' }],
        times: [
          {
            memberId: 'm1',
            times: [{ setNumber: 1, repNumber: 1, time: 30.5 }],
          },
        ],
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus).toHaveLength(1)
      expect(result.current.menus[0].id).toBe('edit-1')
      expect(result.current.menus[0].style).toBe('Ba')
      expect(result.current.menus[0].swimCategory).toBe('Kick')
      expect(result.current.menus[0].distance).toBe(50)
      expect(result.current.menus[0].reps).toBe(8)
      expect(result.current.menus[0].sets).toBe(2)
      expect(result.current.menus[0].circleMin).toBe(2)
      expect(result.current.menus[0].circleSec).toBe(0)
      expect(result.current.menus[0].note).toBe('テストノート')
      expect(result.current.menus[0].tags).toEqual(editData.tags)
      expect(result.current.menus[0].times).toEqual([{ setNumber: 1, repNumber: 1, time: 30.5 }])
    })

    it('editDataの一部フィールドが欠けていてもデフォルト値が使われる', () => {
      const editData: PracticeLogEditData = {
        id: 'edit-2',
        style: 'Fr',
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].swimCategory).toBe('Swim')
      expect(result.current.menus[0].distance).toBe(100)
      expect(result.current.menus[0].reps).toBe(4)
      expect(result.current.menus[0].sets).toBe(1)
      expect(result.current.menus[0].circleMin).toBe(0)
      expect(result.current.menus[0].circleSec).toBe(0)
      expect(result.current.menus[0].note).toBe('')
      expect(result.current.menus[0].tags).toEqual([])
      expect(result.current.menus[0].times).toEqual([])
    })

    it('circleが秒数から分と秒に正しく分解される', () => {
      const editData: PracticeLogEditData = {
        id: 'edit-3',
        circle: 95, // 1分35秒
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].circleMin).toBe(1)
      expect(result.current.menus[0].circleSec).toBe(35)
    })

    it('circleがnullの場合は0になる', () => {
      const editData: PracticeLogEditData = {
        id: 'edit-4',
        circle: null,
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].circleMin).toBe(0)
      expect(result.current.menus[0].circleSec).toBe(0)
    })
  })

  describe('isOpen状態変化', () => {
    it('isOpenがfalseからtrueになると初期化される', () => {
      const { result, rerender } = renderHook(
        ({ isOpen, editData }) => usePracticeLogForm({ isOpen, editData }),
        { initialProps: { isOpen: false, editData: null as PracticeLogEditData | null } }
      )

      // isOpen=falseのときは何もチェックしない（初期化されていない可能性がある）

      rerender({ isOpen: true, editData: null })

      expect(result.current.menus).toHaveLength(1)
      expect(result.current.menus[0].style).toBe('Fr')
    })

    it('isOpenがfalseになると初期化フラグがリセットされる', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        style: 'Ba',
      }

      const { result, rerender } = renderHook(
        ({ isOpen, editData }) => usePracticeLogForm({ isOpen, editData }),
        { initialProps: { isOpen: true, editData } }
      )

      expect(result.current.menus[0].style).toBe('Ba')

      // モーダルを閉じる
      rerender({ isOpen: false, editData })

      // 新しいeditDataで再度開く
      const newEditData: PracticeLogEditData = {
        id: 'test-2',
        style: 'Br',
      }

      rerender({ isOpen: true, editData: newEditData })

      expect(result.current.menus[0].style).toBe('Br')
    })

    it('同じeditDataで再度開いても再初期化されない', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        style: 'Ba',
      }

      const { result, rerender } = renderHook(
        ({ isOpen, editData }) => usePracticeLogForm({ isOpen, editData }),
        { initialProps: { isOpen: true, editData } }
      )

      // スタイルを変更
      act(() => {
        result.current.updateMenu(result.current.menus[0].id, 'style', 'Fly')
      })

      expect(result.current.menus[0].style).toBe('Fly')

      // 同じpropsで再レンダリング
      rerender({ isOpen: true, editData })

      // 変更が保持されている（再初期化されていない）
      expect(result.current.menus[0].style).toBe('Fly')
    })
  })

  describe('setMenus', () => {
    it('setMenusで直接メニューを設定できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const newMenus = [
        {
          id: 'custom-1',
          style: 'IM',
          swimCategory: 'Swim' as const,
          distance: 400,
          reps: 1,
          sets: 1,
          circleMin: 6,
          circleSec: 0,
          note: 'カスタムメニュー',
          tags: [],
          times: [],
        },
      ]

      act(() => {
        result.current.setMenus(newMenus)
      })

      expect(result.current.menus).toEqual(newMenus)
    })
  })

  describe('setShowTimeModalとsetCurrentMenuId', () => {
    it('setShowTimeModalでモーダル表示状態を変更できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.setShowTimeModal(true)
      })

      expect(result.current.showTimeModal).toBe(true)

      act(() => {
        result.current.setShowTimeModal(false)
      })

      expect(result.current.showTimeModal).toBe(false)
    })

    it('setCurrentMenuIdでcurrentMenuIdを変更できる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      act(() => {
        result.current.setCurrentMenuId('test-id')
      })

      expect(result.current.currentMenuId).toBe('test-id')

      act(() => {
        result.current.setCurrentMenuId(null)
      })

      expect(result.current.currentMenuId).toBeNull()
    })
  })

  describe('コールバックの安定性', () => {
    it('addMenuは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.addMenu

      rerender()

      expect(result.current.addMenu).toBe(firstCallback)
    })

    it('removeMenuは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.removeMenu

      rerender()

      expect(result.current.removeMenu).toBe(firstCallback)
    })

    it('updateMenuは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.updateMenu

      rerender()

      expect(result.current.updateMenu).toBe(firstCallback)
    })

    it('handleTagsChangeは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.handleTagsChange

      rerender()

      expect(result.current.handleTagsChange).toBe(firstCallback)
    })

    it('openTimeModalは再レンダリングしても同じ参照を保つ', () => {
      const { result, rerender } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.openTimeModal

      rerender()

      expect(result.current.openTimeModal).toBe(firstCallback)
    })

    it('prepareSubmitDataはmenusが変わると新しい参照になる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.prepareSubmitData

      act(() => {
        result.current.addMenu()
      })

      expect(result.current.prepareSubmitData).not.toBe(firstCallback)
    })

    it('handleTimeSaveはcurrentMenuIdが変わると新しい参照になる', () => {
      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData: null })
      )

      const firstCallback = result.current.handleTimeSave

      act(() => {
        result.current.setCurrentMenuId('new-id')
      })

      expect(result.current.handleTimeSave).not.toBe(firstCallback)
    })
  })

  describe('エッジケース', () => {
    it('timesが空のeditDataでも正しく初期化される', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        times: [],
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].times).toEqual([])
    })

    it('timesがundefinedのeditDataでも正しく初期化される', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        times: undefined,
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].times).toEqual([])
    })

    it('複数メンバーのtimesが正しくフラット化される', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        times: [
          {
            memberId: 'm1',
            times: [
              { setNumber: 1, repNumber: 1, time: 30.5 },
              { setNumber: 1, repNumber: 2, time: 31.0 },
            ],
          },
          {
            memberId: 'm2',
            times: [
              { setNumber: 1, repNumber: 1, time: 32.5 },
            ],
          },
        ],
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].times).toHaveLength(3)
      expect(result.current.menus[0].times).toEqual([
        { setNumber: 1, repNumber: 1, time: 30.5 },
        { setNumber: 1, repNumber: 2, time: 31.0 },
        { setNumber: 1, repNumber: 1, time: 32.5 },
      ])
    })

    it('非常に大きいcircle値でも正しく分解される', () => {
      const editData: PracticeLogEditData = {
        id: 'test-1',
        circle: 3599, // 59分59秒
      }

      const { result } = renderHook(() =>
        usePracticeLogForm({ isOpen: true, editData })
      )

      expect(result.current.menus[0].circleMin).toBe(59)
      expect(result.current.menus[0].circleSec).toBe(59)
    })
  })
})
