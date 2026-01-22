'use client'

import React, { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon, ClockIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import TagInput from './TagInput'

// TimeInputModalを動的インポート（バンドルサイズ削減）
const TimeInputModal = dynamic(
  () => import('./TimeInputModal'),
  { ssr: false }
)
import { useAuth } from '@/contexts'
import { PracticeTag } from '@apps/shared/types'
import { PracticeAPI } from '@apps/shared/api/practices'
import MilestoneSelectorModal from '@/app/(authenticated)/goals/_components/MilestoneSelectorModal'
import type { MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'
import { isMilestoneTimeParams, isMilestoneRepsTimeParams, isMilestoneSetParams } from '@apps/shared/types/goals'

type Tag = PracticeTag

interface PracticeMenu {
  id: string
  style: string
  swimCategory: 'Swim' | 'Pull' | 'Kick'
  distance: number | ''
  reps: number | ''
  sets: number | ''
  circleMin: number | ''
  circleSec: number | ''
  note: string
  tags: Tag[]
  times: import('@apps/shared/types/ui').TimeEntry[]
}

interface PracticeLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Array<{
    style: string
    swimCategory: 'Swim' | 'Pull' | 'Kick'
    distance: number
    reps: number
    sets: number
    circleTime: number | null
    note: string
    tags: Tag[]
    times: import('@apps/shared/types/ui').TimeEntry[]
  }>) => Promise<void>
  practiceId: string
  editData?: {
    id?: string
    style?: string
    swim_category?: 'Swim' | 'Pull' | 'Kick'
    distance?: number
    rep_count?: number
    set_count?: number
    circle?: number | null
    note?: string | null
    tags?: Tag[]
    times?: Array<{
      memberId: string
      times: import('@apps/shared/types/ui').TimeEntry[]
    }>
  } | null
  isLoading?: boolean
  availableTags: Tag[]
  setAvailableTags: (tags: Tag[]) => void
  styles?: Array<{ id: string | number; name_jp: string; distance: number }>
}

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: '自由形' },
  { value: 'Ba', label: '背泳ぎ' },
  { value: 'Br', label: '平泳ぎ' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
]

// 泳法カテゴリの選択肢
const SWIM_CATEGORIES = [
  { value: 'Swim', label: 'Swim' },
  { value: 'Pull', label: 'Pull' },
  { value: 'Kick', label: 'Kick' }
]

export default function PracticeLogForm({
  isOpen,
  onClose,
  onSubmit,
  practiceId: _practiceId,
  editData,
  isLoading = false,
  availableTags,
  setAvailableTags,
  styles: _styles = []
}: PracticeLogFormProps) {
  const { supabase: _supabase, user } = useAuth()
  const practiceAPI = new PracticeAPI(_supabase)

  // タイム表示のフォーマット関数
  const formatTime = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }
  // フォームデータの初期値
  const [_formData, _setFormData] = useState({
    practiceDate: format(new Date(), 'yyyy-MM-dd'),
    place: '',
    note: ''
  })

  // メニューデータ（複数）
  const [menus, setMenus] = useState<PracticeMenu[]>([
    {
      id: '1',
      style: 'Fr',
      swimCategory: 'Swim',
      distance: 100,
      reps: 4,
      sets: 1,
      circleMin: 1,
      circleSec: 30,
      note: '',
      tags: [],
      times: []
    }
  ])

  const hasInitializedRef = useRef(false)
  const initializedKeyRef = useRef<string | null>(null)

  // タグデータはpropsから受け取る
  
  // タイム入力モーダルの状態
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)

  // マイルストーン選択モーダルの状態
  const [isMilestoneSelectorOpen, setIsMilestoneSelectorOpen] = useState(false)

  // フォームを初期化（編集データがある場合とない場合）
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
      // editDataからswim_categoryを取得
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
          times: editData.times?.flatMap(item => item.times) || []
        }
      ])
    } else {
      setMenus([
        {
          id: '1',
          style: 'Fr',
          swimCategory: 'Swim',
          distance: 100,
          reps: 4,
          sets: 1,
          circleMin: 1,
          circleSec: 30,
          note: '',
          tags: [],
          times: []
        }
      ])
    }

    hasInitializedRef.current = true
    initializedKeyRef.current = key
  }, [isOpen, editData])

  if (!isOpen) return null

  // メニュー追加
  const addMenu = () => {
    const newId = String(Date.now())
    setMenus(prevMenus => [
      ...prevMenus,
      {
        id: newId,
        style: 'Fr',
        swimCategory: 'Swim',
        distance: 100,
        reps: 4,
        sets: 1,
        circleMin: 1,
        circleSec: 30,
        note: '',
        tags: [],
        times: []
      }
    ])
  }

  // メニュー削除
  const removeMenu = (id: string) => {
    setMenus(prevMenus => {
      if (prevMenus.length <= 1) {
        return prevMenus
      }
      return prevMenus.filter(menu => menu.id !== id)
    })
  }

  // メニュー更新
  const updateMenu = (id: string, field: keyof PracticeMenu, value: string | number | '' | Tag[]) => {
    setMenus(prevMenus =>
      prevMenus.map(menu =>
        menu.id === id ? { ...menu, [field]: value } : menu
      )
    )
  }

  // タグ選択変更
  const handleTagsChange = (menuId: string, tags: Tag[]) => {
    setMenus(prevMenus =>
      prevMenus.map(menu =>
        menu.id === menuId ? { ...menu, tags } : menu
      )
    )
  }


  // タイム入力モーダルを開く
  const openTimeModal = (menuId: string) => {
    setCurrentMenuId(menuId)
    setShowTimeModal(true)
  }

  // タイムデータを保存
  const handleTimeSave = (times: import('@apps/shared/types/ui').TimeEntry[]) => {
    if (!currentMenuId) return
    
    setMenus(prevMenus =>
      prevMenus.map(menu =>
        menu.id === currentMenuId
          ? { ...menu, times }
          : menu
      )
    )
    setShowTimeModal(false)
    setCurrentMenuId(null)
  }

  // 現在編集中のメニューを取得
  const getCurrentMenu = () => {
    return menus.find(m => m.id === currentMenuId)
  }

  // フォーム送信
  const handleSubmit = async () => {
    // データを整形
    const submitData = menus.map(menu => {
      // サークルタイムを秒に変換
      const circleMin = Number(menu.circleMin) || 0
      const circleSec = Number(menu.circleSec) || 0
      const circleTime = circleMin * 60 + circleSec

      const data = {
        style: menu.style,
        swimCategory: menu.swimCategory,
        distance: Number(menu.distance) || 100,
        reps: Number(menu.reps) || 1,
        sets: Number(menu.sets) || 1,
        circleTime: circleTime > 0 ? circleTime : null,
        note: menu.note,
        tags: menu.tags,
        times: menu.times || []
      }
      
      return data
    })


    try {
      await onSubmit(submitData)
    } catch (error) {
      console.error('フォーム送信エラー:', error)
    }
  }

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <div className="fixed inset-0 z-70 overflow-y-auto" data-testid="practice-log-form-modal">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div
          className="fixed inset-0 bg-black/40 transition-opacity"
          onClick={handleClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習記録を編集' : '練習記録を追加'}
              </h3>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleFormSubmit} className="p-6 space-y-6">

            {/* メニューセクション */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">練習メニュー</h4>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setIsMilestoneSelectorOpen(true)}
                    variant="outline"
                    className="flex items-center gap-2"
                    disabled={isLoading}
                  >
                    📌 マイルストーンから作成
                  </Button>
                  <Button
                    type="button"
                    onClick={addMenu}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
                    disabled={isLoading}
                    data-testid="add-menu-button"
                  >
                    <PlusIcon className="h-4 w-4" />
                    メニューを追加
                  </Button>
                </div>
              </div>

              {menus.map((menu, index) => (
                <div
                  key={menu.id}
                  className="border border-gray-200 rounded-lg p-4 space-y-4 bg-blue-50"
                  data-testid="practice-menu-container"
                >
                  {/* メニューヘッダー */}
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-gray-700">
                      メニュー {index + 1}
                    </h5>
                    {menus.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMenu(menu.id)}
                        className="text-red-500 hover:text-red-700"
                        disabled={isLoading}
                        data-testid={`practice-menu-remove-button-${index + 1}`}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* メニュー入力フィールド */}
                  <div className="space-y-4">
                    {/* 1行目：タグ */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        タグ
                      </label>
                      <TagInput
                        selectedTags={menu.tags}
                        availableTags={availableTags}
                        onTagsChange={(tags) => handleTagsChange(menu.id, tags)}
                        onAvailableTagsUpdate={setAvailableTags}
                        placeholder="タグを選択または作成"
                      />
                    </div>

                    {/* 2行目：種目と泳法カテゴリ */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          種目① <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                        <select
                          value={menu.style}
                          onChange={(e) =>
                            updateMenu(menu.id, 'style', e.target.value)
                          }
                            className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                          required
                          data-testid="practice-style"
                        >
                          {SWIM_STYLES.map(style => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                          <ChevronDownIcon 
                            className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          種目② <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            value={menu.swimCategory}
                            onChange={(e) =>
                              updateMenu(menu.id, 'swimCategory', e.target.value as 'Swim' | 'Pull' | 'Kick')
                            }
                            className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                            data-testid="practice-swim-category"
                          >
                            {SWIM_CATEGORIES.map(category => (
                              <option key={category.value} value={category.value}>
                                {category.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDownIcon 
                            className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3行目：距離、本数、セット数、サークル（分）、サークル（秒） */}
                    <div className="grid grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          距離(m) <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          value={menu.distance}
                          onChange={(e) =>
                            updateMenu(menu.id, 'distance', e.target.value)
                          }
                          placeholder="100"
                          min="1"
                          required
                          data-testid="practice-distance"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          本数<span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          value={menu.reps}
                          onChange={(e) =>
                            updateMenu(menu.id, 'reps', e.target.value)
                          }
                          placeholder="4"
                          min="1"
                          required
                          data-testid="practice-rep-count"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          セット数 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          value={menu.sets}
                          onChange={(e) =>
                            updateMenu(menu.id, 'sets', e.target.value)
                          }
                          placeholder="1"
                          min="1"
                          required
                          data-testid="practice-set-count"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          サークル(分)
                        </label>
                        <Input
                          type="number"
                          value={menu.circleMin}
                          onChange={(e) =>
                            updateMenu(menu.id, 'circleMin', e.target.value)
                          }
                          placeholder="1"
                          min="0"
                          data-testid="practice-circle-min"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          サークル(秒)
                        </label>
                        <Input
                          type="number"
                          value={menu.circleSec}
                          onChange={(e) =>
                            updateMenu(menu.id, 'circleSec', e.target.value)
                          }
                          placeholder="30"
                          min="0"
                          max="59"
                          data-testid="practice-circle-sec"
                        />
                      </div>
                    </div>

                    {/* タイム入力ボタン */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        練習タイム
                      </label>
                      <Button
                        type="button"
                        onClick={() => openTimeModal(menu.id)}
                        variant="outline"
                        className="w-full flex items-center justify-center gap-2"
                        data-testid="time-input-button"
                      >
                        <ClockIcon className="h-5 w-5" />
                        {menu.times && menu.times.length > 0
                          ? `タイムを編集 (${menu.times.length}件登録済み)`
                          : 'タイムを入力'}
                      </Button>
                    </div>

                    {/* 既存タイム表示 */}
                    {menu.times && menu.times.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                          <p className="text-sm font-medium text-blue-700">登録済みタイム</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-medium text-gray-800"></th>
                                {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => (
                                  <th key={setIndex + 1} className="text-center py-2 px-2 font-medium text-gray-800">
                                    {setIndex + 1}セット目
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: Number(menu.reps) || 1 }, (_, repIndex) => {
                                const repNumber = repIndex + 1
                                return (
                                  <tr key={repNumber} className="border-b border-gray-100">
                                    <td className="py-2 px-2 font-medium text-gray-700">{repNumber}本目</td>
                                    {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                                      const setNumber = setIndex + 1
                                      const time = menu.times.find((t) => t.setNumber === setNumber && t.repNumber === repNumber)
                                      const setTimes = menu.times.filter((t) => t.setNumber === setNumber && t.time > 0)
                                      const setFastest = setTimes.length > 0 ? Math.min(...setTimes.map((t) => t.time)) : 0
                                      const isFastest = time && time.time > 0 && time.time === setFastest

                                      return (
                                        <td key={setNumber} className="py-2 px-2 text-center">
                                          <span className={isFastest ? "text-blue-600 font-bold" : "text-gray-800"}>
                                            {time && time.time > 0 ? formatTime(time.time) : '-'}
                                          </span>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                              {/* 平均行 */}
                              <tr className="border-b border-gray-100 bg-gray-100">
                                <td className="py-2 px-2 font-medium text-gray-800">平均</td>
                                {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const setTimes = menu.times.filter((t) => t.setNumber === setNumber && t.time > 0)
                                  const average = setTimes.length > 0
                                    ? setTimes.reduce((sum: number, t) => sum + t.time, 0) / setTimes.length
                                    : 0
                                  return (
                                    <td key={setNumber} className="py-2 px-2 text-center">
                                      <span className="text-gray-800 font-medium">
                                        {average > 0 ? formatTime(average) : '-'}
                                      </span>
                                    </td>
                                  )
                                })}
                              </tr>
                              {/* 全体平均行 */}
                              <tr className="border-t-2 border-gray-300 bg-blue-50">
                                <td className="py-2 px-2 font-medium text-blue-800" data-testid="practice-overall-average">全体平均</td>
                                <td className="py-2 px-2 text-center" colSpan={Number(menu.sets) || 1}>
                                  <span className="text-blue-800 font-bold">
                                    {(() => {
                                      const allValidTimes = menu.times.filter((t) => t.time > 0)
                                      const overallAverage = allValidTimes.length > 0
                                        ? allValidTimes.reduce((sum: number, t) => sum + t.time, 0) / allValidTimes.length
                                        : 0
                                      return overallAverage > 0 ? formatTime(overallAverage) : '-'
                                    })()}
                                  </span>
                                </td>
                              </tr>
                              {/* 全体最速行 */}
                              <tr className="bg-blue-50">
                                <td className="py-2 px-2 font-medium text-blue-800" data-testid="practice-overall-fastest">全体最速</td>
                                <td className="py-2 px-2 text-center" colSpan={Number(menu.sets) || 1}>
                                  <span className="text-blue-800 font-bold">
                                    {(() => {
                                      const allValidTimes = menu.times.filter((t) => t.time > 0)
                                      const overallFastest = allValidTimes.length > 0
                                        ? Math.min(...allValidTimes.map((t) => t.time))
                                        : 0
                                      return overallFastest > 0 ? formatTime(overallFastest) : '-'
                                    })()}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* 5行目：メモ */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        メモ
                      </label>
                      <textarea
                        value={menu.note}
                        onChange={(e) =>
                          updateMenu(menu.id, 'note', e.target.value)
                        }
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="このメニューに関するメモ"
                        data-testid={`practice-log-note-${index + 1}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t sticky bottom-0 bg-white">
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                disabled={isLoading}
                data-testid="practice-log-cancel-button"
              >
                キャンセル
              </Button>
              <Button
                type="button"
                disabled={isLoading}
                onClick={() => void handleSubmit()}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid={editData ? 'update-practice-log-button' : 'save-practice-log-button'}
              >
                {isLoading ? (editData ? '更新中...' : '保存中...') : (editData ? '練習記録を更新' : '練習記録を保存')}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* タイム入力モーダル */}
      {currentMenuId && (
        <TimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false)
            setCurrentMenuId(null)
          }}
          onSubmit={handleTimeSave}
          setCount={Number(getCurrentMenu()?.sets) || 1}
          repCount={Number(getCurrentMenu()?.reps) || 1}
          initialTimes={(getCurrentMenu()?.times || []) as Array<{
            id: string
            setNumber: number
            repNumber: number
            time: number
            displayValue?: string
          }>}
          menuNumber={menus.findIndex(m => m.id === currentMenuId) + 1}
        />
      )}

      {/* マイルストーン選択モーダル */}
      <MilestoneSelectorModal
        isOpen={isMilestoneSelectorOpen}
        onClose={() => setIsMilestoneSelectorOpen(false)}
        onSelect={async (milestone) => {
          // マイルストーンのパラメータでフォームを自動入力
          const params = milestone.params
          let newMenu: PracticeMenu

          // milestone tagを取得または作成
          // タイトルベースのタグ名を使用（わかりやすくするため）
          const tagName = `milestone:${milestone.title}`
          // 後方互換性のため、ID形式のタグも検索
          const legacyTagName = `milestone:${milestone.id}`
          let milestoneTag: Tag | null = null

          // 既存のタグを検索（まずタイトル形式、次にID形式）
          const existingTag = availableTags.find(t => 
            t.name === tagName || t.name === legacyTagName
          )
          if (existingTag) {
            milestoneTag = existingTag
            // 既存タグがID形式の場合は、タイトル形式に更新
            if (existingTag.name === legacyTagName && user) {
              try {
                const updatedTag = await practiceAPI.updatePracticeTag(existingTag.id, tagName, existingTag.color)
                milestoneTag = updatedTag
                // 利用可能タグリストも更新
                setAvailableTags(availableTags.map(t => 
                  t.id === existingTag.id ? updatedTag : t
                ))
              } catch (error) {
                console.error('milestone tag更新エラー:', error)
                // 更新に失敗しても既存タグを使用
              }
            }
          } else if (user) {
            // タグが存在しない場合は作成
            try {
              const createdTag = await practiceAPI.createPracticeTag(tagName, '#3B82F6')
              milestoneTag = createdTag
              setAvailableTags([...availableTags, createdTag])
            } catch (error) {
              console.error('milestone tag作成エラー:', error)
            }
          }

          if (isMilestoneTimeParams(params)) {
            const p = params as MilestoneTimeParams
            newMenu = {
              id: String(Date.now()),
              style: p.style,
              swimCategory: 'Swim',
              distance: p.distance,
              reps: 1,
              sets: 1,
              circleMin: 0,
              circleSec: 0,
              note: '',
              tags: milestoneTag ? [milestoneTag] : [],
              times: []
            }
          } else if (isMilestoneRepsTimeParams(params)) {
            const p = params as MilestoneRepsTimeParams
            const circleTime = p.circle
            const circleMin = Math.floor(circleTime / 60)
            const circleSec = circleTime % 60
            newMenu = {
              id: String(Date.now()),
              style: p.style,
              swimCategory: p.swim_category,
              distance: p.distance,
              reps: p.reps,
              sets: p.sets,
              circleMin: circleMin,
              circleSec: circleSec,
              note: '',
              tags: milestoneTag ? [milestoneTag] : [],
              times: []
            }
          } else if (isMilestoneSetParams(params)) {
            const p = params as MilestoneSetParams
            const circleTime = p.circle
            const circleMin = Math.floor(circleTime / 60)
            const circleSec = circleTime % 60
            newMenu = {
              id: String(Date.now()),
              style: p.style,
              swimCategory: p.swim_category,
              distance: p.distance,
              reps: p.reps,
              sets: p.sets,
              circleMin: circleMin,
              circleSec: circleSec,
              note: '',
              tags: milestoneTag ? [milestoneTag] : [],
              times: []
            }
          } else {
            return // 未知のタイプ
          }

          // 既存のメニューをクリアして新しいメニューを設定
          setMenus([newMenu])
        }}
      />
    </div>
  )
}
