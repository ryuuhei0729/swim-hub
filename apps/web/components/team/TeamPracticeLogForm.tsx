'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { Button } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon, ClockIcon } from '@heroicons/react/24/outline'
import TagInput from '../forms/TagInput'
import TeamTimeInputModal, { TeamTimeEntry } from '@/components/team/TeamTimeInputModal'
import { PracticeTag } from '@apps/shared/types/database'

type Tag = PracticeTag

interface TeamMember {
  id: string
  user_id: string
  users: {
    name: string
  }
}

interface PracticeMenu {
  id: string
  style: string
  distance: number | ''
  reps: number
  sets: number
  circleMin: number
  circleSec: number
  note: string
  tags: Tag[]
  times: TeamTimeEntry[] // チーム用タイムエントリの配列
}

// 編集モード用のデータ型（TeamPractices.tsxから渡されるデータ構造）
interface EditDataItem {
  id: string
  style: string
  distance: number
  rep_count: number
  set_count: number
  circle: number | null
  note: string | null
  tags: PracticeTag[]
  times: TeamTimeEntry[]
}

interface TeamPracticeLogFormProps {
  isOpen: boolean
  onClose: () => void
  practiceId: string
  teamMembers: TeamMember[]
  onSuccess: () => void
  editData?: EditDataItem[] // 編集モード用のデータ
}

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: 'フリー' },
  { value: 'Ba', label: 'バック' },
  { value: 'Br', label: 'ブレスト' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
]

export default function TeamPracticeLogForm({
  isOpen,
  onClose,
  practiceId,
  teamMembers,
  onSuccess,
  editData
}: TeamPracticeLogFormProps) {
  const { supabase } = useAuth()

  // 利用可能なタグ
  const [availableTags, setAvailableTags] = useState<Tag[]>([])

  // メニューデータ（複数）
  const [menus, setMenus] = useState<PracticeMenu[]>([
    {
      id: '1',
      style: 'Fr',
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

  // タイム入力モーダルの状態
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)

  // 秒数を表示用フォーマットに変換
  const formatTime = (seconds: number) => {
    if (seconds === 0) return ''
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }

  // フォームを初期化（編集データがある場合とない場合）
  useEffect(() => {
    if (isOpen) {
      if (editData) {
        // 編集モード: 既存データで初期化
        // editDataからメニューデータを構築
        const menuData = editData.map((log: EditDataItem, index: number) => ({
          id: log.id || String(index + 1),
          style: log.style || 'Fr',
          distance: log.distance || 100,
          reps: log.rep_count || 4,
          sets: log.set_count || 1,
          circleMin: 1,
          circleSec: 30,
          note: log.note || '',
          tags: log.tags || [],
          times: log.times || [] // TeamPractices.tsxで既に適切な構造に変換済み
        }))
        
        setMenus(menuData)
      } else {
        // 新規作成モード: デフォルト値で初期化
        setMenus([{
          id: '1',
          style: 'Fr',
          distance: 100,
          reps: 4,
          sets: 1,
          circleMin: 1,
          circleSec: 30,
          note: '',
          tags: [],
          times: []
        }])
      }
    }
  }, [isOpen, editData])

  // タグを取得
  useEffect(() => {
    if (isOpen) {
      loadAvailableTags()
    }
  }, [isOpen])

  const loadAvailableTags = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('practice_tags')
        .select('*')
        .eq('user_id', user.id)
        .order('name')

      if (error) throw error
      setAvailableTags(data || [])
    } catch (err) {
      console.error('タグの取得に失敗:', err)
    }
  }

  const getCurrentMenu = () => {
    return menus.find(menu => menu.id === currentMenuId)
  }

  const addMenu = () => {
    const newMenu: PracticeMenu = {
      id: Date.now().toString(),
      style: 'Fr',
      distance: 100,
      reps: 4,
      sets: 1,
      circleMin: 1,
      circleSec: 30,
      note: '',
      tags: [],
      times: []
    }
    setMenus(prev => [...prev, newMenu])
  }

  const removeMenu = (menuId: string) => {
    if (menus.length > 1) {
      setMenus(prev => prev.filter(menu => menu.id !== menuId))
    }
  }

  const updateMenu = <K extends keyof PracticeMenu>(menuId: string, field: K, value: PracticeMenu[K]) => {
    setMenus(prev => prev.map(menu => 
      menu.id === menuId ? { ...menu, [field]: value } : menu
    ))
  }

  const handleTimeSave = (menuId: string, times: TeamTimeEntry[]) => {
    updateMenu(menuId, 'times', times)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editData) {
        // 編集モード: 既存データを更新
        await handleUpdate()
      } else {
        // 新規作成モード: 新しいデータを作成
        await handleCreate()
      }
    } catch (err) {
      console.error('チーム練習ログ処理エラー:', err)
    }
  }

  const handleCreate = async () => {
    let totalCreated = 0
    let totalErrors = 0

    try {
      // 各メンバーに対して、各メニューのデータを作成
      for (const menu of menus) {
        // 各メンバーに対してPracticeLogを作成（タイムが入力されていなくても作成）
        for (const member of teamMembers) {
          const memberTimes = menu.times.find(t => t.memberId === member.id)?.times || []

          try {
            // PracticeLogを作成（タイムがなくても作成）
            const { data: practiceLog, error: logError } = await supabase
              .from('practice_logs')
              .insert({
                practice_id: practiceId,
                user_id: member.user_id,
                style: menu.style,
                rep_count: Number(menu.reps) || 1,
                set_count: Number(menu.sets) || 1,
                distance: Number(menu.distance) || 100,
                note: menu.note
              })
              .select('id')
              .single()

            if (logError) {
              console.error(`PracticeLog作成エラー (${member.users.name}):`, logError)
              totalErrors++
              continue
            }

            // PracticeTimeを作成（タイムがある場合のみ）
            if (memberTimes.length > 0) {
              const practiceTimes = memberTimes.map((timeEntry) => ({
                practice_log_id: practiceLog.id,
                user_id: member.user_id,
                set_number: timeEntry.setNumber,
                rep_number: timeEntry.repNumber,
                time: timeEntry.time
              }))

              const { error: timesError } = await supabase
                .from('practice_times')
                .insert(practiceTimes)

              if (timesError) {
                console.error(`PracticeTime作成エラー (${member.users.name}):`, timesError)
                // タイムエラーは致命的ではないので続行
              }
            }

            // PracticeLogTagを作成
            for (const tag of menu.tags) {
              const { error: tagError } = await supabase
                .from('practice_log_tags')
                .insert({
                  practice_log_id: practiceLog.id,
                  practice_tag_id: tag.id
                })

              if (tagError) {
                console.error(`PracticeLogTag作成エラー (${member.users.name}, ${tag.name}):`, tagError)
                // タグエラーは致命的ではないので続行
              }
            }

            totalCreated++
          } catch (memberError) {
            console.error(`メンバー ${member.users.name} の処理エラー:`, memberError)
            totalErrors++
          }
        }
      }

      if (totalCreated > 0) {
        onSuccess()
        onClose()
      }
    } catch (err) {
      console.error('チーム練習ログ作成エラー:', err)
    }
  }

  const handleUpdate = async () => {
    // 編集モードでは、既存のPractice_Logを削除して新しく作成する
    // （シンプルな実装のため）
    
    // 既存のPractice_Logを削除
    const { error: deleteError } = await supabase
      .from('practice_logs')
      .delete()
      .eq('practice_id', practiceId)

    if (deleteError) {
      console.error('既存の練習ログ削除エラー:', deleteError)
      return
    }

    // 新しく作成
    await handleCreate()
  }

  const handleClose = () => {
    setMenus([
      {
        id: '1',
        style: 'Fr',
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
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-1 px-4 pb-1 text-center sm:block sm:p-0 max-h-screen">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-2 sm:align-middle sm:max-w-4xl sm:w-full max-h-[98vh] overflow-y-auto">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? 'チーム練習ログを編集' : 'チーム練習ログを追加'}
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={handleClose}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="bg-white">
            <div className="px-6 py-6">
              <div className="space-y-6">
                {menus.map((menu, index) => (
                  <div key={menu.id} className="border border-gray-200 rounded-lg p-4">
                    {/* メニューヘッダー */}
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-semibold text-gray-900">
                        メニュー {index + 1}
                      </h4>
                      {menus.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeMenu(menu.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    {/* メニュー設定 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      {/* 種目 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          種目
                        </label>
                        <select
                          value={menu.style}
                          onChange={(e) => updateMenu(menu.id, 'style', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {SWIM_STYLES.map(style => (
                            <option key={style.value} value={style.value}>
                              {style.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 距離 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          距離 (m)
                        </label>
                        <input
                          type="number"
                          value={menu.distance}
                          onChange={(e) => updateMenu(menu.id, 'distance', e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="25"
                          step="25"
                        />
                      </div>

                      {/* セット数 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          セット数
                        </label>
                        <input
                          type="number"
                          value={menu.sets}
                          onChange={(e) => updateMenu(menu.id, 'sets', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="1"
                        />
                      </div>

                      {/* 本数 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          本数
                        </label>
                        <input
                          type="number"
                          value={menu.reps}
                          onChange={(e) => updateMenu(menu.id, 'reps', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          min="1"
                        />
                      </div>
                    </div>

                    {/* タグ */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        タグ
                      </label>
                      <TagInput
                        selectedTags={menu.tags}
                        availableTags={availableTags}
                        onTagsChange={(tags) => updateMenu(menu.id, 'tags', tags)}
                        onAvailableTagsUpdate={setAvailableTags}
                      />
                    </div>

                    {/* メモ */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        メモ
                      </label>
                      <textarea
                        value={menu.note}
                        onChange={(e) => updateMenu(menu.id, 'note', e.target.value)}
                        placeholder="メニューの詳細や注意点など"
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* タイム入力ボタン */}
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600">
                        {menu.sets}セット × {menu.reps}本 = {menu.sets * menu.reps}本のタイム入力
                        <br />
                        <span className="text-xs text-gray-500">（タイム入力は任意です）</span>
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          setCurrentMenuId(menu.id)
                          setShowTimeModal(true)
                        }}
                        className="inline-flex items-center"
                      >
                        <ClockIcon className="h-4 w-4 mr-2" />
                        タイム入力
                      </Button>
                    </div>

                    {/* 各人のタイム表示 */}
                    {menu.times && menu.times.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-3">記録されたタイム</h4>
                        <div className="space-y-3">
                          {menu.times.map((memberTime: TeamTimeEntry) => {
                            const member = teamMembers.find(m => m.id === memberTime.memberId)
                            if (!member || !memberTime.times || memberTime.times.length === 0) return null
                            
                            const validTimes = memberTime.times.filter((t) => t.time > 0)
                            if (validTimes.length === 0) return null
                            
                            return (
                              <div key={memberTime.memberId} className="bg-gray-50 p-3 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    {member.users?.name || 'Unknown User'}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {validTimes.length}本記録済み
                                  </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-xs">
                                  {validTimes.map((timeEntry, index: number) => (
                                    <div key={index} className="bg-white p-2 rounded border text-center">
                                      <div className="text-gray-500">
                                        {timeEntry.setNumber}セット-{timeEntry.repNumber}本
                                      </div>
                                      <div className="font-mono text-gray-800">
                                        {timeEntry.displayValue || formatTime(timeEntry.time)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* メニュー追加ボタン */}
                <Button
                  type="button"
                  onClick={addMenu}
                  variant="outline"
                  className="w-full"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  メニューを追加
                </Button>
              </div>
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t sticky bottom-0 bg-white px-6 pb-4">
              <Button
                type="button"
                onClick={handleClose}
                variant="secondary"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700"
              >
                {editData ? 'チーム練習ログを更新' : 'チーム練習ログを保存'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* チームタイム入力モーダル */}
      {currentMenuId && (
        <TeamTimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false)
            setCurrentMenuId(null)
          }}
          onSubmit={(times: TeamTimeEntry[]) => handleTimeSave(currentMenuId, times)}
          setCount={getCurrentMenu()?.sets || 1}
          repCount={getCurrentMenu()?.reps || 1}
          teamMembers={teamMembers}
          menuNumber={menus.findIndex(m => m.id === currentMenuId) + 1}
          initialTimes={getCurrentMenu()?.times || []}
        />
      )}
    </div>
  )
}
