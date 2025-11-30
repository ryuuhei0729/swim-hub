'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthProvider'
import { Button } from '@/components/ui'
import { ArrowLeftIcon, PlusIcon, TrashIcon, ClockIcon, CalendarDaysIcon, MapPinIcon, UserGroupIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'
import TagInput from '@/components/forms/TagInput'
import TeamTimeInputModal, { TeamTimeEntry } from '@/components/team/TeamTimeInputModal'
import { PracticeTag, Practice } from '@apps/shared/types/database'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type Tag = PracticeTag

interface TeamMember {
  id: string
  user_id: string
  role: string
  users: {
    id: string
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
  times: TeamTimeEntry[]
  targetUserIds: string[] // 対象ユーザーのuser_idリスト
}

interface PracticeWithDetails extends Practice {
  team: {
    id: string
    name: string
  } | null
}

interface PracticeLogWithDetails {
  id: string
  user_id: string
  style: string
  distance: number
  rep_count: number
  set_count: number
  circle: number | null
  note: string | null
  practice_log_tags: {
    practice_tags: PracticeTag
  }[]
  practice_times: {
    id: string
    user_id: string
    set_number: number
    rep_number: number
    time: number
  }[]
}

interface PracticeLogClientProps {
  teamId: string
  practiceId: string
  practice: PracticeWithDetails
  teamName: string
  members: TeamMember[]
  existingLogs: PracticeLogWithDetails[]
  availableTags: PracticeTag[]
  presentUserIds: string[] // 出席しているメンバーのuser_idリスト
}

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: 'フリー' },
  { value: 'Ba', label: 'バック' },
  { value: 'Br', label: 'ブレスト' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
]

export default function PracticeLogClient({
  teamId,
  practiceId,
  practice,
  members,
  existingLogs,
  availableTags: initialTags,
  presentUserIds
}: PracticeLogClientProps) {
  const router = useRouter()
  const { supabase } = useAuth()
  
  const [availableTags, setAvailableTags] = useState<Tag[]>(initialTags)
  const [saving, setSaving] = useState(false)
  const [showUserSelectModal, setShowUserSelectModal] = useState(false)
  const [currentMenuIdForUserSelect, setCurrentMenuIdForUserSelect] = useState<string | null>(null)
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>([])

  // 秒数を表示用フォーマットに変換
  const formatTime = (seconds: number) => {
    if (seconds === 0) return ''
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }

  // 既存データからメニューを構築
  const buildMenusFromLogs = (): PracticeMenu[] => {
    if (existingLogs.length === 0) {
      // 新規作成時は出席者をデフォルト選択
      return [{
        id: '1',
        style: 'Fr',
        distance: 100,
        reps: 4,
        sets: 1,
        circleMin: 1,
        circleSec: 30,
        note: '',
        tags: [],
        times: [],
        targetUserIds: presentUserIds.length > 0 ? presentUserIds : members.map(m => m.user_id)
      }]
    }

    // 同じメニュー構成のログをグループ化
    const menuGroups = new Map<string, {
      style: string
      distance: number
      rep_count: number
      set_count: number
      circle: number | null
      note: string | null
      tags: PracticeTag[]
      times: TeamTimeEntry[]
      targetUserIds: string[]
    }>()

    for (const log of existingLogs) {
      const key = `${log.style}-${log.distance}-${log.rep_count}-${log.set_count}`
      
      if (!menuGroups.has(key)) {
        const tags = log.practice_log_tags
          ?.map(plt => plt.practice_tags)
          .filter((tag): tag is PracticeTag => tag != null) || []
        
        menuGroups.set(key, {
          style: log.style,
          distance: log.distance,
          rep_count: log.rep_count,
          set_count: log.set_count,
          circle: log.circle,
          note: log.note,
          tags,
          times: [],
          targetUserIds: []
        })
      }

      // このログのuser_idを対象ユーザーに追加
      const group = menuGroups.get(key)!
      if (!group.targetUserIds.includes(log.user_id)) {
        group.targetUserIds.push(log.user_id)
      }

      // メンバーのタイムを追加
      const member = members.find(m => m.user_id === log.user_id)
      if (member && log.practice_times && log.practice_times.length > 0) {
        const existingMemberTime = group.times.find(t => t.memberId === member.id)
        
        const memberTimes = log.practice_times.map(pt => ({
          setNumber: pt.set_number,
          repNumber: pt.rep_number,
          time: pt.time,
          displayValue: formatTime(pt.time)
        }))

        if (existingMemberTime) {
          existingMemberTime.times.push(...memberTimes)
        } else {
          group.times.push({
            memberId: member.id,
            times: memberTimes
          })
        }
      }
    }

    return Array.from(menuGroups.entries()).map(([_key, group], index) => ({
      id: String(index + 1),
      style: group.style,
      distance: group.distance,
      reps: group.rep_count,
      sets: group.set_count,
      circleMin: group.circle ? Math.floor(group.circle / 60) : 1,
      circleSec: group.circle ? group.circle % 60 : 30,
      note: group.note || '',
      tags: group.tags,
      times: group.times,
      targetUserIds: group.targetUserIds
    }))
  }

  const [menus, setMenus] = useState<PracticeMenu[]>(buildMenusFromLogs)
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [currentMenuId, setCurrentMenuId] = useState<string | null>(null)

  const isEditMode = existingLogs.length > 0

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
      times: [],
      targetUserIds: presentUserIds.length > 0 ? presentUserIds : members.map(m => m.user_id)
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
    setSaving(true)

    try {
      // 編集モードの場合は既存データを削除
      if (isEditMode) {
        const { error: deleteError } = await supabase
          .from('practice_logs')
          .delete()
          .eq('practice_id', practiceId)

        if (deleteError) {
          console.error('既存の練習ログ削除エラー:', deleteError)
          return
        }
      }

      // 新規作成
      let totalCreated = 0

      for (const menu of menus) {
        // 対象ユーザーのみにログを作成
        const targetMembers = members.filter(m => menu.targetUserIds.includes(m.user_id))
        
        for (const member of targetMembers) {
          const memberTimes = menu.times.find(t => t.memberId === member.id)?.times || []

          try {
            // PracticeLogを作成
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
                console.error(`PracticeLogTag作成エラー:`, tagError)
              }
            }

            totalCreated++
          } catch (memberError) {
            console.error(`メンバー ${member.users.name} の処理エラー:`, memberError)
          }
        }
      }

      if (totalCreated > 0) {
        router.push(`/teams/${teamId}?tab=practices`)
      }
    } catch (err) {
      console.error('チーム練習ログ作成エラー:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => {
    router.push(`/teams/${teamId}?tab=practices`)
  }

  // メンバーをフォーマット（TeamTimeInputModal用）
  const teamMembersForModal = members.map(m => ({
    id: m.id,
    user_id: m.user_id,
    users: m.users
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            練習一覧に戻る
          </button>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isEditMode ? 'チーム練習ログを編集' : 'チーム練習ログを追加'}
            </h1>
            <p className="text-gray-600 mb-4">
              練習参加者の記録を代理で一括入力できます
            </p>
            
            {/* 練習情報 */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-600 border-t pt-4">
              <div className="flex items-center gap-1">
                <CalendarDaysIcon className="h-4 w-4" />
                <span>{format(new Date(practice.date + 'T00:00:00'), 'yyyy年M月d日(EEE)', { locale: ja })}</span>
              </div>
              {practice.place && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span>{practice.place}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {menus.map((menu, index) => (
            <div key={menu.id} className="bg-white rounded-lg shadow p-6" data-testid={`team-practice-log-menu-${index + 1}`}>
              {/* メニューヘッダー */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  メニュー {index + 1}
                </h2>
                {menus.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMenu(menu.id)}
                    className="text-red-600 hover:text-red-800"
                    data-testid={`team-practice-log-remove-menu-${index + 1}`}
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
                    data-testid={`team-practice-log-style-${index + 1}`}
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
                    data-testid={`team-practice-log-distance-${index + 1}`}
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
                    data-testid={`team-practice-log-sets-${index + 1}`}
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
                    data-testid={`team-practice-log-reps-${index + 1}`}
                  />
                </div>
              </div>

              {/* 対象ユーザー */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  対象ユーザー
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentMenuIdForUserSelect(menu.id)
                      setTempSelectedUserIds(menu.targetUserIds)
                      setShowUserSelectModal(true)
                    }}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid={`team-practice-log-select-users-${index + 1}`}
                  >
                    <UserGroupIcon className="h-4 w-4 mr-2" />
                    ユーザーを選択
                  </button>
                  <span className="text-sm text-gray-600">
                    {menu.targetUserIds.length}名選択中
                  </span>
                </div>
                {/* 選択されたユーザーの表示 */}
                {menu.targetUserIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {menu.targetUserIds.slice(0, 5).map(userId => {
                      const member = members.find(m => m.user_id === userId)
                      return member ? (
                        <span
                          key={userId}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {member.users.name}
                        </span>
                      ) : null
                    })}
                    {menu.targetUserIds.length > 5 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        +{menu.targetUserIds.length - 5}名
                      </span>
                    )}
                  </div>
                )}
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
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid={`team-practice-log-note-${index + 1}`}
                />
              </div>

              {/* タイム入力ボタン */}
              <div className="flex items-center justify-between border-t pt-4">
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
                  data-testid={`team-practice-log-time-button-${index + 1}`}
                >
                  <ClockIcon className="h-4 w-4 mr-2" />
                  タイム入力
                </Button>
              </div>

              {/* 各人のタイム表示 */}
              {menu.times && menu.times.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">記録されたタイム</h3>
                  <div className="space-y-3">
                    {menu.times.map((memberTime: TeamTimeEntry) => {
                      const member = members.find(m => m.id === memberTime.memberId)
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
                            {validTimes.map((timeEntry, idx: number) => (
                              <div key={idx} className="bg-white p-2 rounded border text-center">
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
            data-testid="team-practice-log-add-menu-button"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            メニューを追加
          </Button>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 pt-6">
            <Button
              type="button"
              onClick={handleBack}
              variant="secondary"
              data-testid="team-practice-log-cancel-button"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="team-practice-log-submit-button"
            >
              {saving ? '保存中...' : (isEditMode ? 'チーム練習ログを更新' : 'チーム練習ログを保存')}
            </Button>
          </div>
        </form>
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
          teamMembers={teamMembersForModal.filter(m => 
            getCurrentMenu()?.targetUserIds.includes(m.user_id)
          )}
          menuNumber={menus.findIndex(m => m.id === currentMenuId) + 1}
          initialTimes={getCurrentMenu()?.times || []}
        />
      )}

      {/* ユーザー選択モーダル */}
      {showUserSelectModal && currentMenuIdForUserSelect && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div 
              className="fixed inset-0 bg-black/40 transition-opacity"
              onClick={() => setShowUserSelectModal(false)}
            />
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 max-w-lg w-full max-h-[80vh] flex flex-col">
              {/* モーダルヘッダー */}
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  対象ユーザーを選択
                </h3>
                <button
                  type="button"
                  onClick={() => setShowUserSelectModal(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* 一括選択ボタン */}
              <div className="flex gap-2 p-4 border-b bg-gray-50">
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds(members.map(m => m.user_id))}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                >
                  全員選択
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds(presentUserIds)}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded transition-colors"
                  disabled={presentUserIds.length === 0}
                >
                  出席者のみ ({presentUserIds.length}名)
                </button>
                <button
                  type="button"
                  onClick={() => setTempSelectedUserIds([])}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  選択解除
                </button>
              </div>

              {/* メンバーリスト */}
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                  {members.map(member => {
                    const isSelected = tempSelectedUserIds.includes(member.user_id)
                    const isPresent = presentUserIds.includes(member.user_id)
                    
                    return (
                      <label
                        key={member.id}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTempSelectedUserIds(prev => [...prev, member.user_id])
                            } else {
                              setTempSelectedUserIds(prev => prev.filter(id => id !== member.user_id))
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 flex-1 text-sm font-medium text-gray-900">
                          {member.users.name}
                        </span>
                        {isPresent && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            <CheckIcon className="h-3 w-3 mr-1" />
                            出席
                          </span>
                        )}
                        {member.role === 'admin' && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            管理者
                          </span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* モーダルフッター */}
              <div className="flex items-center justify-between p-4 border-t bg-gray-50">
                <span className="text-sm text-gray-600">
                  {tempSelectedUserIds.length}名選択中
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowUserSelectModal(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      updateMenu(currentMenuIdForUserSelect, 'targetUserIds', tempSelectedUserIds)
                      setShowUserSelectModal(false)
                      setCurrentMenuIdForUserSelect(null)
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    決定
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

