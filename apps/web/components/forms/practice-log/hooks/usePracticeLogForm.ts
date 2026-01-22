'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PracticeMenu, Tag, PracticeLogEditData, PracticeLogSubmitData } from '../types'
import type { TimeEntry } from '@apps/shared/types/ui'

interface UsePracticeLogFormOptions {
  isOpen: boolean
  editData?: PracticeLogEditData | null
}

interface UsePracticeLogFormReturn {
  menus: PracticeMenu[]
  setMenus: React.Dispatch<React.SetStateAction<PracticeMenu[]>>
  showTimeModal: boolean
  setShowTimeModal: (value: boolean) => void
  currentMenuId: string | null
  setCurrentMenuId: (value: string | null) => void
  addMenu: () => void
  removeMenu: (id: string) => void
  updateMenu: (id: string, field: keyof PracticeMenu, value: string | number | '' | Tag[]) => void
  handleTagsChange: (menuId: string, tags: Tag[]) => void
  openTimeModal: (menuId: string) => void
  handleTimeSave: (times: TimeEntry[]) => void
  getCurrentMenu: () => PracticeMenu | undefined
  prepareSubmitData: () => PracticeLogSubmitData[]
}

function createDefaultMenu(id: string = '1'): PracticeMenu {
  return {
    id,
    style: 'Fr',
    swimCategory: 'Swim',
    distance: 100,
    reps: 4,
    sets: 1,
    circleMin: 1,
    circleSec: 30,
    note: '',
    tags: [],
    times: [],
  }
}

/**
 * PracticeLogForm の状態管理フック
 */
export const usePracticeLogForm = ({
  isOpen,
  editData,
}: UsePracticeLogFormOptions): UsePracticeLogFormReturn => {
  const [menus, setMenus] = useState<PracticeMenu[]>([createDefaultMenu()])
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)

  const hasInitializedRef = useRef(false)
  const initializedKeyRef = useRef<string | null>(null)

  // フォームを初期化
  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false
      initializedKeyRef.current = null
      return
    }

    const key = editData?.id ?? '__new__'

    if (hasInitializedRef.current && initializedKeyRef.current === key) {
      return
    }

    if (editData) {
      const circleTime = editData.circle || 0
      const circleMin = Math.floor(circleTime / 60)
      const circleSec = circleTime % 60
      const swimCategory = editData.swim_category || 'Swim'

      setMenus([
        {
          id: editData.id || '1',
          style: editData.style || 'Fr',
          swimCategory: swimCategory as 'Swim' | 'Pull' | 'Kick',
          distance: editData.distance || 100,
          reps: editData.rep_count || 4,
          sets: editData.set_count || 1,
          circleMin: circleMin || 0,
          circleSec: circleSec || 0,
          note: editData.note || '',
          tags: editData.tags || [],
          times: editData.times?.flatMap((item) => item.times) || [],
        },
      ])
    } else {
      setMenus([createDefaultMenu()])
    }

    hasInitializedRef.current = true
    initializedKeyRef.current = key
  }, [isOpen, editData])

  const addMenu = useCallback(() => {
    const newId = String(Date.now())
    setMenus((prevMenus) => [...prevMenus, createDefaultMenu(newId)])
  }, [])

  const removeMenu = useCallback((id: string) => {
    setMenus((prevMenus) => {
      if (prevMenus.length <= 1) return prevMenus
      return prevMenus.filter((menu) => menu.id !== id)
    })
  }, [])

  const updateMenu = useCallback(
    (id: string, field: keyof PracticeMenu, value: string | number | '' | Tag[]) => {
      setMenus((prevMenus) =>
        prevMenus.map((menu) => (menu.id === id ? { ...menu, [field]: value } : menu))
      )
    },
    []
  )

  const handleTagsChange = useCallback((menuId: string, tags: Tag[]) => {
    setMenus((prevMenus) =>
      prevMenus.map((menu) => (menu.id === menuId ? { ...menu, tags } : menu))
    )
  }, [])

  const openTimeModal = useCallback((menuId: string) => {
    setCurrentMenuId(menuId)
    setShowTimeModal(true)
  }, [])

  const handleTimeSave = useCallback(
    (times: TimeEntry[]) => {
      if (!currentMenuId) return

      setMenus((prevMenus) =>
        prevMenus.map((menu) => (menu.id === currentMenuId ? { ...menu, times } : menu))
      )
      setShowTimeModal(false)
      setCurrentMenuId(null)
    },
    [currentMenuId]
  )

  const getCurrentMenu = useCallback(() => {
    return menus.find((m) => m.id === currentMenuId)
  }, [menus, currentMenuId])

  const prepareSubmitData = useCallback((): PracticeLogSubmitData[] => {
    return menus.map((menu) => {
      const circleMin = Number(menu.circleMin) || 0
      const circleSec = Number(menu.circleSec) || 0
      const circleTime = circleMin * 60 + circleSec

      return {
        style: menu.style,
        swimCategory: menu.swimCategory,
        distance: Number(menu.distance) || 100,
        reps: Number(menu.reps) || 1,
        sets: Number(menu.sets) || 1,
        circleTime: circleTime > 0 ? circleTime : null,
        note: menu.note,
        tags: menu.tags,
        times: menu.times || [],
      }
    })
  }, [menus])

  return {
    menus,
    setMenus,
    showTimeModal,
    setShowTimeModal,
    currentMenuId,
    setCurrentMenuId,
    addMenu,
    removeMenu,
    updateMenu,
    handleTagsChange,
    openTimeModal,
    handleTimeSave,
    getCurrentMenu,
    prepareSubmitData,
  }
}

export default usePracticeLogForm
