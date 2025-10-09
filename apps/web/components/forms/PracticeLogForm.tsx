'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon, TagIcon, ChevronDownIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { useQuery, useMutation } from '@apollo/client/react'
import { apolloClient } from '@/lib/apollo-client'
import { GET_MY_PRACTICE_TAGS, GET_CALENDAR_DATA } from '@/graphql/queries'
import { CREATE_PRACTICE_TAG, UPDATE_PRACTICE_TAG, DELETE_PRACTICE_TAG, UPDATE_PRACTICE_LOG, UPDATE_PRACTICE_TIME, DELETE_PRACTICE_TIME, ADD_PRACTICE_LOG_TAG, REMOVE_PRACTICE_LOG_TAG } from '@/graphql/mutations'
import PracticeTagForm from './PracticeTagForm'

interface PracticeTimeInput {
  id?: string
  repNumber: number
  setNumber: number
  time: number
  timeDisplayValue?: string // 入力中の表示用
}

interface PracticeLogFormData {
  style: string
  repCount: number
  setCount: number
  distance: number
  circle: number
  note: string
  times: PracticeTimeInput[]
  tagIds: string[]
}

interface PracticeLogFormState {
  style: string
  repCount: string
  setCount: string
  distance: string
  circle: string
  circleMinutes: string // サークルの分
  circleSeconds: string // サークルの秒
  note: string
  times: PracticeTimeInput[]
  tagIds: string[]
}

interface PracticeLogEntry {
  id: string
  style: string
  repCount: string
  setCount: string
  distance: string
  circle: string
  circleMinutes: string
  circleSeconds: string
  note: string
  times: PracticeTimeInput[]
  tagIds: string[]
}

interface PracticeTag {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

interface PracticeLogFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: PracticeLogFormData[]) => Promise<void>
  practiceId: string
  editData?: any
  isLoading?: boolean
}

export default function PracticeLogForm({
  isOpen,
  onClose,
  onSubmit,
  practiceId,
  editData,
  isLoading = false
}: PracticeLogFormProps) {
  const [practiceLogEntries, setPracticeLogEntries] = useState<PracticeLogEntry[]>([
    {
      id: '1',
      style: 'Fr',
      repCount: '1',
      setCount: '1',
      distance: '50',
      circle: '90',
      circleMinutes: '1',
      circleSeconds: '30',
      note: '',
      times: [],
      tagIds: []
    }
  ])
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [currentMenuIndex, setCurrentMenuIndex] = useState(0)
  const [timeEntries, setTimeEntries] = useState<PracticeTimeInput[]>([])
  const [showTagModal, setShowTagModal] = useState(false)
  const [currentTagMenuIndex, setCurrentTagMenuIndex] = useState(0)
  const [showTagDropdown, setShowTagDropdown] = useState<number | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [editingTagId, setEditingTagId] = useState<string | null>(null)
  const [editingTagName, setEditingTagName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // タグデータを取得
  const { data: tagsData, refetch: refetchTags } = useQuery(GET_MY_PRACTICE_TAGS)
  const availableTags = (tagsData as any)?.myPracticeTags || []

  // ミューテーション
  const [createPracticeTag] = useMutation(CREATE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  const [updatePracticeTag] = useMutation(UPDATE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  const [deletePracticeTag] = useMutation(DELETE_PRACTICE_TAG, {
    refetchQueries: [{ query: GET_MY_PRACTICE_TAGS }],
    awaitRefetchQueries: true
  })

  // 編集用ミューテーション
  const [updatePracticeLog] = useMutation(UPDATE_PRACTICE_LOG, {
    refetchQueries: [
      {
        query: GET_CALENDAR_DATA,
        variables: { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }
      }
    ],
    awaitRefetchQueries: true
  })
  const [updatePracticeTime] = useMutation(UPDATE_PRACTICE_TIME)
  const [deletePracticeTime] = useMutation(DELETE_PRACTICE_TIME)
  const [addPracticeLogTag] = useMutation(ADD_PRACTICE_LOG_TAG)
  const [removePracticeLogTag] = useMutation(REMOVE_PRACTICE_LOG_TAG)

  // 新しいエントリーを追加
  const addNewEntry = () => {
    const newEntry: PracticeLogEntry = {
      id: Date.now().toString(),
      style: 'Fr',
      repCount: '1',
      setCount: '1',
      distance: '50',
      circle: '90',
      circleMinutes: '1',
      circleSeconds: '30',
      note: '',
      times: [],
      tagIds: []
    }
    setPracticeLogEntries(prev => [...prev, newEntry])
  }

  // エントリーを削除
  const removeEntry = (index: number) => {
    if (practiceLogEntries.length <= 1) return // 最低1つは残す
    setPracticeLogEntries(prev => prev.filter((_, i) => i !== index))
  }

  // タイムモーダルを開く
  const openTimeModal = (menuIndex: number) => {
    setCurrentMenuIndex(menuIndex)
    const entry = practiceLogEntries[menuIndex]
    const repCount = parseInt(entry.repCount) || 1
    const setCount = parseInt(entry.setCount) || 1
    
    // 本数×セット数分のタイムエントリーを生成
    const newTimeEntries: PracticeTimeInput[] = []
    for (let set = 1; set <= setCount; set++) {
      for (let rep = 1; rep <= repCount; rep++) {
        newTimeEntries.push({
          repNumber: rep,
          setNumber: set,
          time: 0,
          timeDisplayValue: ''
        })
      }
    }
    setTimeEntries(newTimeEntries)
    setShowTimeModal(true)
  }

  // タイムモーダルを閉じる
  const closeTimeModal = () => {
    setShowTimeModal(false)
    setTimeEntries([])
  }

  // タイムを保存
  const saveTimes = () => {
    setPracticeLogEntries(prev => 
      prev.map((entry, i) => i === currentMenuIndex ? {
        ...entry,
        times: timeEntries
      } : entry)
    )
    closeTimeModal()
  }

  // タグ選択モーダルを開く
  const openTagModal = (menuIndex: number) => {
    setCurrentTagMenuIndex(menuIndex)
    setShowTagModal(true)
  }

  // タグ選択モーダルを閉じる
  const closeTagModal = () => {
    setShowTagModal(false)
  }

  // タグを選択
  const handleTagSelect = (tag: PracticeTag) => {
    setPracticeLogEntries(prev => 
      prev.map((entry, i) => 
        i === currentTagMenuIndex 
          ? { ...entry, tagIds: [...entry.tagIds, tag.id] }
          : entry
      )
    )
    closeTagModal()
  }

  // タグを削除
  const removeTag = (menuIndex: number, tagId: string) => {
    setPracticeLogEntries(prev => 
      prev.map((entry, i) => 
        i === menuIndex 
          ? { ...entry, tagIds: entry.tagIds.filter(id => id !== tagId) }
          : entry
      )
    )
  }

  // ランダムな色を取得
  const getRandomColor = () => {
    const colors = [
      '#93C5FD', // デフォルト
      '#6B7280', // グレー
      '#A78BFA', // ブラウン
      '#FED7AA', // オレンジ
      '#FEF3C7', // 黄
      '#D1FAE5', // 緑
      '#3B82F6', // 青
      '#E0E7FF', // 紫
      '#FECACA', // ピンク
      '#EF4444'  // 赤
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // 新しいタグを作成
  const createNewTag = async (tagName: string, menuIndex: number) => {
    if (!tagName.trim()) return

    try {
      const result = await createPracticeTag({
        variables: {
          input: {
            name: tagName.trim(),
            color: getRandomColor() // ランダムカラー
          }
        }
      })

      if ((result.data as any)?.createPracticeTag) {
        const newTag = (result.data as any).createPracticeTag
        // 新しいタグを選択状態に追加
        setPracticeLogEntries(prev => 
          prev.map((entry, i) => 
            i === menuIndex 
              ? { ...entry, tagIds: [...entry.tagIds, newTag.id] }
              : entry
          )
        )
      }
    } catch (error) {
      console.error('タグの作成に失敗しました:', error)
      alert('タグの作成に失敗しました。')
    }
  }

  // タグを選択/選択解除
  const toggleTag = (menuIndex: number, tagId: string) => {
    setPracticeLogEntries(prev => 
      prev.map((entry, i) => {
        if (i === menuIndex) {
          const isSelected = entry.tagIds.includes(tagId)
      return {
            ...entry,
            tagIds: isSelected 
              ? entry.tagIds.filter(id => id !== tagId)
              : [...entry.tagIds, tagId]
          }
        }
        return entry
      })
    )
  }

  // タグの色を変更
  const changeTagColor = async (tagId: string, newColor: string) => {
    try {
      await updatePracticeTag({
        variables: {
          id: tagId,
          input: { color: newColor }
        }
      })
            } catch (error) {
      console.error('タグの色変更に失敗しました:', error)
      alert('タグの色変更に失敗しました。')
    }
  }

  // タグ名を編集開始
  const startEditingTagName = (tag: PracticeTag) => {
    setEditingTagName(tag.name)
    setIsEditingName(true)
  }

  // タグ名を保存
  const saveTagName = async (tagId: string) => {
    if (!editingTagName.trim()) return

    try {
      await updatePracticeTag({
        variables: {
          id: tagId,
          input: { name: editingTagName.trim() }
        }
      })
      setIsEditingName(false)
      setEditingTagName('')
    } catch (error) {
      console.error('タグ名の更新に失敗しました:', error)
      alert('タグ名の更新に失敗しました。')
    }
  }

  // タグ名編集をキャンセル
  const cancelEditingTagName = () => {
    setIsEditingName(false)
    setEditingTagName('')
  }

  // タグを削除
  const deleteTag = async (tagId: string) => {
    if (!confirm('このタグを削除しますか？関連するすべての練習記録からも削除されます。')) return

    try {
      await deletePracticeTag({
        variables: { id: tagId }
      })
      // 削除されたタグをすべてのエントリーからも削除
      setPracticeLogEntries(prev => 
        prev.map(entry => ({
          ...entry,
          tagIds: entry.tagIds.filter(id => id !== tagId)
        }))
      )
    } catch (error) {
      console.error('タグの削除に失敗しました:', error)
      alert('タグの削除に失敗しました。')
    }
  }

  // 平均タイムを計算
  const calculateAverageTime = (times: PracticeTimeInput[]) => {
    const validTimes = times.filter(t => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // セットごとの平均タイムを計算
  const calculateSetAverageTimes = (times: PracticeTimeInput[]) => {
    const setCount = Math.max(...times.map(t => t.setNumber), 0)
    const averages: number[] = []
    
    for (let set = 1; set <= setCount; set++) {
      const setTimes = times.filter(t => t.setNumber === set && t.time > 0)
      if (setTimes.length > 0) {
        averages[set - 1] = setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
      } else {
        averages[set - 1] = 0
      }
    }
    
    return averages
  }

  // セットごとの最速タイムを計算
  const calculateSetBestTimes = (times: PracticeTimeInput[]) => {
    const setCount = Math.max(...times.map(t => t.setNumber), 0)
    const bests: number[] = []
    
    for (let set = 1; set <= setCount; set++) {
      const setTimes = times.filter(t => t.setNumber === set && t.time > 0)
      if (setTimes.length > 0) {
        bests[set - 1] = Math.min(...setTimes.map(t => t.time))
        } else {
        bests[set - 1] = 0
      }
    }
    
    return bests
  }

  // 編集データがある場合、フォームを初期化
  useEffect(() => {
    if (editData && isOpen) {
      const circleSeconds = editData.circle || 0
      const minutes = Math.floor(circleSeconds / 60)
      const seconds = circleSeconds % 60
      
      const entry: PracticeLogEntry = {
        id: editData.id || '1',
        style: editData.style || 'Fr',
        repCount: String(editData.repCount || 1),
        setCount: String(editData.setCount || 1),
        distance: String(editData.distance || 50),
        circle: String(circleSeconds),
        circleMinutes: String(minutes),
        circleSeconds: String(Math.floor(seconds)),
        note: editData.note || '',
        times: (editData.times || []).map((time: any) => ({
          id: time.id,
          repNumber: time.repNumber,
          setNumber: time.setNumber,
          time: time.time,
          timeDisplayValue: time.time > 0 ? formatTime(time.time) : ''
        })),
        tagIds: (editData.tags || []).map((tag: any) => tag.id)
      }
      setPracticeLogEntries([entry])
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      setPracticeLogEntries([{
          id: '1',
          style: 'Fr',
        repCount: '1',
        setCount: '1',
        distance: '50',
        circle: '90',
        circleMinutes: '1',
        circleSeconds: '30',
        note: '',
        times: [],
        tagIds: []
      }])
    }
  }, [editData, isOpen])

  // プルダウン外をクリックした時の処理
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.tag-dropdown')) {
        setShowTagDropdown(null)
        setEditingTagId(null)
        setIsEditingName(false)
        setEditingTagName('')
      }
    }

    if (showTagDropdown !== null) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showTagDropdown])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editData) {
        // 編集モードの場合
        await handleEditSubmit()
      } else {
        // 新規作成モードの場合
        const sanitizedData: PracticeLogFormData[] = practiceLogEntries.map(entry => ({
          style: entry.style,
          repCount: parseInt(entry.repCount) || 1,
          setCount: parseInt(entry.setCount) || 1,
          distance: parseInt(entry.distance) || 50,
          circle: (parseInt(entry.circleMinutes) || 0) * 60 + (parseInt(entry.circleSeconds) || 0),
          note: entry.note,
          times: entry.times.map(time => ({
            repNumber: time.repNumber,
            setNumber: time.setNumber,
            time: time.time
          })),
          tagIds: entry.tagIds
        }))
        
        await onSubmit(sanitizedData)
      }
    } catch (error) {
      console.error('フォーム送信エラー:', error)
    }
  }

  // 編集時の保存処理
  const handleEditSubmit = async () => {
    try {
      for (const entry of practiceLogEntries) {
        // PracticeLogを更新
        await updatePracticeLog({
          variables: {
            id: entry.id,
            input: {
              style: entry.style,
              repCount: parseInt(entry.repCount) || 1,
              setCount: parseInt(entry.setCount) || 1,
              distance: parseInt(entry.distance) || 50,
              circle: (parseInt(entry.circleMinutes) || 0) * 60 + (parseInt(entry.circleSeconds) || 0),
              note: entry.note
            }
          }
        })

        // タイムの更新（既存のタイムを削除してから新しいタイムを作成）
        // 注意: 実際の実装では、既存のタイムを取得して比較する必要があります
        for (const time of entry.times) {
          if (time.time > 0) {
            if (time.id && time.id !== 'temp-id') {
              // 既存のタイムを更新
              await updatePracticeTime({
                variables: {
                  id: time.id,
                  input: {
                    repNumber: time.repNumber,
                    setNumber: time.setNumber,
                    time: time.time
                  }
                }
              })
            }
            // 新しいタイムの場合は、親コンポーネントで作成する必要があります
          }
        }

        // タグの更新
        // 既存のタグを取得
        const existingTagIds = (editData?.tags || []).map((tag: any) => tag.id)
        const newTagIds = entry.tagIds
        
        // 削除するタグ（既存にあって新しいリストにない）
        const tagsToRemove = existingTagIds.filter((tagId: string) => !newTagIds.includes(tagId))
        // 追加するタグ（新しいリストにあって既存にない）
        const tagsToAdd = newTagIds.filter((tagId: string) => !existingTagIds.includes(tagId))
        
        // タグを削除
        for (const tagId of tagsToRemove) {
          await removePracticeLogTag({
            variables: {
              practiceLogId: entry.id,
              practiceTagId: tagId
            }
          })
        }
        
        // タグを追加
        for (const tagId of tagsToAdd) {
          await addPracticeLogTag({
            variables: {
              practiceLogId: entry.id,
              practiceTagId: tagId
            }
          })
        }
      }
      
      // 編集モーダルを閉じる
      onClose()
    } catch (error) {
      console.error('編集の保存に失敗しました:', error)
      alert('練習メニューの更新に失敗しました。')
      throw error
    }
  }


  const formatTimeDisplay = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    return formatTime(seconds)
  }

  // タイム文字列を秒数に変換する関数
  const parseTimeString = (timeString: string): number => {
    if (!timeString) return 0
    
    // "1:30.50" 形式
    if (timeString.includes(':')) {
      const [minutes, seconds] = timeString.split(':')
      return parseInt(minutes) * 60 + parseFloat(seconds)
    }
    
    // "30.50s" 形式
    if (timeString.endsWith('s')) {
      return parseFloat(timeString.slice(0, -1))
    }
    
    // 数値のみ - 入力された値をそのまま保持
    return parseFloat(timeString)
  }

  // タイムを表示用文字列に変換する関数（入力値を保持）
  const formatTimeForDisplay = (time: number, originalValue?: string): string => {
    if (originalValue !== undefined) {
      return originalValue
    }
    if (time === 0) return ''
    return formatTime(time)
  }


  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習メニューを編集' : '練習メニューを追加'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* 練習メニュー一覧 */}
            {practiceLogEntries.map((entry, index) => (
              <div key={entry.id} className="border border-gray-200 rounded-lg p-3 space-y-3">
                {/* メニューヘッダー */}
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-medium text-gray-900">
                    メニュー {index + 1}
                      </h4>
                  {practiceLogEntries.length > 1 && (
                          <button
                            type="button"
                      onClick={() => removeEntry(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                    </div>

                {/* 練習内容 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      距離 (m)
                        </label>
                        <Input
                          type="number"
                      value={entry.distance}
                          onChange={(e) => {
                        setPracticeLogEntries(prev => 
                          prev.map((entry, i) => i === index ? { ...entry, distance: e.target.value } : entry)
                        )
                      }}
                      min="1"
                      required
                        />
                      </div>

                      <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                          本数
                        </label>
                        <Input
                          type="number"
                      value={entry.repCount}
                          onChange={(e) => {
                        setPracticeLogEntries(prev => 
                          prev.map((entry, i) => i === index ? { ...entry, repCount: e.target.value } : entry)
                        )
                      }}
                      min="1"
                      required
                        />
                      </div>

                      <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                          セット数
                        </label>
                        <Input
                          type="number"
                      value={entry.setCount}
                          onChange={(e) => {
                        setPracticeLogEntries(prev => 
                          prev.map((entry, i) => i === index ? { ...entry, setCount: e.target.value } : entry)
                        )
                      }}
                      min="1"
                      required
                        />
                      </div>
            </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      サークル
                        </label>
                    <div className="flex items-center gap-2">
                            <Input
                              type="number"
                        placeholder="分"
                        value={entry.circleMinutes}
                        onChange={(e) => {
                          setPracticeLogEntries(prev => 
                            prev.map((entry, i) => i === index ? { ...entry, circleMinutes: e.target.value } : entry)
                          )
                        }}
                              min="0"
                        className="w-24 flex-shrink-0"
                        style={{ width: '96px' }}
                            />
                      <span className="text-gray-500">分</span>
                            <Input
                              type="number"
                        placeholder="秒"
                        value={entry.circleSeconds}
                        onChange={(e) => {
                          setPracticeLogEntries(prev => 
                            prev.map((entry, i) => i === index ? { ...entry, circleSeconds: e.target.value } : entry)
                          )
                        }}
                              min="0"
                              max="59"
                        className="w-24 flex-shrink-0"
                        style={{ width: '96px' }}
                            />
                      <span className="text-gray-500">秒</span>
                          </div>
                        </div>

                      <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                          泳法
                        </label>
                        <select
                      value={entry.style}
                      onChange={(e) => {
                        setPracticeLogEntries(prev => 
                          prev.map((entry, i) => i === index ? { ...entry, style: e.target.value } : entry)
                        )
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      required
                    >
                      <option value="Fr">自由形</option>
                      <option value="Br">平泳ぎ</option>
                      <option value="Ba">背泳ぎ</option>
                      <option value="Fly">バタフライ</option>
                      <option value="IM">個人メドレー</option>
                        </select>
                  </div>
                      </div>
                      
                {/* タイム記録 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      タイム記録
                    </label>
                    <Button
                      type="button"
                      onClick={() => openTimeModal(index)}
                      className="text-sm"
                    >
                      <PlusIcon className="h-4 w-4 mr-1" />
                      タイムを追加
                    </Button>
                    </div>

                  {entry.times.length > 0 && (
                    <div className="space-y-3">
                      {(() => {
                        const setCount = Math.max(...entry.times.map(t => t.setNumber), 0)
                        const setAverages = calculateSetAverageTimes(entry.times)
                        const setBests = calculateSetBestTimes(entry.times)
                        const totalAverage = calculateAverageTime(entry.times)
                        const totalBest = Math.min(...entry.times.filter(t => t.time > 0).map(t => t.time), Infinity)
                        
                        return (
                          <>
                            <div className="bg-gray-50 p-3 rounded-lg">
                              <div className="flex gap-4">
                                {/* 本数ラベル列 */}
                                <div className="flex flex-col gap-2 text-sm">
                                  <div className="h-6"></div> {/* ヘッダー分のスペース */}
                                  {Array.from({ length: Math.max(...entry.times.map(t => t.repNumber), 0) }, (_, repIndex) => (
                                    <div key={repIndex} className="h-6 flex items-center justify-center text-gray-600">
                                      {repIndex + 1}本目:
                                </div>
                                  ))}
                                  {/* セット平均行 */}
                                  <div className="h-6 flex items-center justify-center text-gray-600 bg-green-100 px-2 rounded">
                                    セット平均:
                                </div>
                                </div>
                                
                                {/* セット列 */}
                                {Array.from({ length: setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const setTimes = entry.times.filter(t => t.setNumber === setNumber)
                                  
                                  return (
                                    <div key={setNumber} className="flex flex-col gap-2 text-sm min-w-24">
                                      {/* セットヘッダー */}
                                      <div className="h-6 flex items-center justify-center">
                                        <span className="font-medium text-gray-900">{setNumber}セット目</span>
                                      </div>
                                      
                                      {/* タイム列 */}
                                      {setTimes.map((time, repIndex) => (
                                        <div key={repIndex} className="h-6 flex items-center justify-center relative">
                                          <span className="text-gray-900">
                                            {time.time > 0 ? (time.timeDisplayValue || formatTimeDisplay(time.time)) : '未記録'}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPracticeLogEntries(prev => 
                                                prev.map((entry, i) => i === index ? {
                                                  ...entry,
                                                  times: entry.times.filter((_, ti) => ti !== entry.times.indexOf(time))
                                                } : entry)
                                              )
                                            }}
                                            className="absolute right-1 text-red-500 hover:text-red-700"
                                          >
                                            <TrashIcon className="h-3 w-3" />
                                          </button>
                              </div>
                            ))}
                                      
                                      {/* セット平均 */}
                                      <div className="h-6 flex items-center justify-center bg-green-100 px-2 rounded">
                                        <span className="text-green-600 font-medium">
                                          {setAverages[setIndex] > 0 ? formatTimeDisplay(setAverages[setIndex]) : '-'}
                                        </span>
                        </div>
                                      
                      </div>
                                  )
                                })}
                              </div>
                              
                              {/* 全体統計（全セット跨ぎ、横並び） */}
                              <div className="mt-2 flex justify-center">
                                <div className="bg-blue-100 px-4 py-2 rounded-lg">
                                  <div className="flex items-center gap-4 text-sm">
                                    <span className="text-blue-600 font-medium">
                                      全体平均: {totalAverage > 0 ? formatTimeDisplay(totalAverage) : '-'}
                                    </span>
                                    <span className="text-blue-600 font-medium">
                                      全体最速: {totalBest !== Infinity ? formatTimeDisplay(totalBest) : '-'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                        </div>
                          </>
                        )
                      })()}
                      </div>
                    )}
                    </div>

            {/* タグ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                        タグ
                      </label>
              <div className="space-y-2">
                {/* タグ選択プルダウン */}
                <div className="relative tag-dropdown">
                  <button
                    type="button"
                    onClick={() => setShowTagDropdown(showTagDropdown === index ? null : index)}
                    className="w-full flex items-center justify-between px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 min-h-[40px]"
                  >
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      {entry.tagIds.length > 0 ? (
                        entry.tagIds.map(tagId => {
                          const tag = availableTags.find(t => t.id === tagId)
                          if (!tag) return null
                          return (
                            <span
                              key={tagId}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-gray-900"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                              <span
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeTag(index, tagId)
                                }}
                                className="hover:text-gray-200 cursor-pointer"
                              >
                                <XMarkIcon className="h-3 w-3" />
                              </span>
                            </span>
                          )
                        })
                      ) : (
                        <span className="flex items-center gap-2 text-gray-500">
                          <TagIcon className="h-4 w-4" />
                          タグを選択
                        </span>
                      )}
                    </div>
                    <ChevronDownIcon className="h-4 w-4 flex-shrink-0" />
                  </button>
                  
                  {showTagDropdown === index && (
                    <div className="absolute z-10 w-80 mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                      {/* 新しいタグ作成 */}
                      <div className="p-2 border-b border-gray-200">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder="新しいタグ名を入力"
                            className="flex-1 text-sm"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') {
                                createNewTag(newTagName, index)
                                setNewTagName('')
                              }
                            }}
                          />
                          <Button
                            type="button"
                            onClick={() => {
                              createNewTag(newTagName, index)
                              setNewTagName('')
                            }}
                            disabled={!newTagName.trim()}
                            className="px-3 py-1 text-sm"
                          >
                            作成
                          </Button>
                    </div>
                    </div>

                      {/* 既存タグ一覧 */}
                      <div className="max-h-48 overflow-y-auto">
                        {availableTags.length === 0 ? (
                          <div className="p-3 text-sm text-gray-500 text-center">
                            タグがありません
                          </div>
                        ) : (
                          availableTags.map((tag: PracticeTag) => {
                            const isSelected = entry.tagIds.includes(tag.id)
                            return (
                              <div
                                key={tag.id}
                                className="flex items-center justify-between p-2 hover:bg-gray-50 cursor-pointer"
                                onClick={() => toggleTag(index, tag.id)}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <span
                                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-gray-900"
                                    style={{ backgroundColor: tag.color }}
                                  >
                                    {tag.name}
                                  </span>
                                  {isSelected && (
                                    <span className="text-xs text-blue-600 font-medium">選択中</span>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-1">
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingTagId(editingTagId === tag.id ? null : tag.id)
                                      }}
                                      className="p-1 text-gray-400 hover:text-gray-600"
                                    >
                                      <EllipsisHorizontalIcon className="h-4 w-4" />
                                    </button>
                                    
                                    {editingTagId === tag.id && (
                                      <div className="fixed bg-white border border-gray-300 rounded-lg shadow-xl p-2 z-[9999] w-56" style={{ 
                                        top: '50%', 
                                        left: '50%', 
                                        transform: 'translate(-50%, -50%)' 
                                      }}>
                                        {/* タグ名編集・削除セクション */}
                                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
                                          {isEditingName ? (
                                            <div className="flex items-center gap-1 flex-1">
                                              <Input
                                                type="text"
                                                value={editingTagName}
                                                onChange={(e) => setEditingTagName(e.target.value)}
                                                className="flex-1 text-sm"
                                                onKeyPress={(e) => {
                                                  if (e.key === 'Enter') {
                                                    saveTagName(tag.id)
                                                  } else if (e.key === 'Escape') {
                                                    cancelEditingTagName()
                                                  }
                                                }}
                                                autoFocus
                                              />
                                              <button
                                                type="button"
                                                onClick={() => saveTagName(tag.id)}
                                                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                              >
                                                保存
                                              </button>
                                              <button
                                                type="button"
                                                onClick={cancelEditingTagName}
                                                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                              >
                                                キャンセル
                                              </button>
                    </div>
                                          ) : (
                                            <>
                                              <span
                                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-gray-900"
                                                style={{ backgroundColor: tag.color }}
                                              >
                                                {tag.name}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => startEditingTagName(tag)}
                                                className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                              >
                                                編集
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => deleteTag(tag.id)}
                                                className="p-1 text-red-500 hover:text-red-700"
                                              >
                                                <TrashIcon className="h-4 w-4" />
                                              </button>
                                            </>
                                          )}
                  </div>
                                        
                                        <div className="border-t border-gray-200 pt-2">
                                          <div className="text-sm font-medium text-gray-700 mb-2">カラー</div>
                                          <div className="space-y-1">
                                            {[
                                              { name: 'デフォルト', color: '#93C5FD' },
                                              { name: 'グレー', color: '#6B7280' },
                                              { name: 'ブラウン', color: '#A78BFA' },
                                              { name: 'オレンジ', color: '#FED7AA' },
                                              { name: '黄', color: '#FEF3C7' },
                                              { name: '緑', color: '#D1FAE5' },
                                              { name: '青', color: '#3B82F6' },
                                              { name: '紫', color: '#E0E7FF' },
                                              { name: 'ピンク', color: '#FECACA' },
                                              { name: '赤', color: '#EF4444' }
                                            ].map((colorOption) => (
                                              <button
                                                key={colorOption.color}
                                                type="button"
                                                onClick={() => {
                                                  changeTagColor(tag.id, colorOption.color)
                                                  setEditingTagId(null)
                                                }}
                                                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm hover:bg-gray-50 ${
                                                  tag.color === colorOption.color ? 'bg-gray-100' : ''
                                                }`}
                                              >
                                                <div
                                                  className="w-4 h-4 rounded border border-gray-300"
                                                  style={{ backgroundColor: colorOption.color }}
                                                />
                                                <span className="text-gray-700">{colorOption.name}</span>
                                                {tag.color === colorOption.color && (
                                                  <div className="ml-auto">
                                                    <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                  </div>
                                                )}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* メモ */}
            <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                メモ
              </label>
              <textarea
                    value={entry.note}
                    onChange={(e) => {
                      setPracticeLogEntries(prev => 
                        prev.map((entry, i) => i === index ? { ...entry, note: e.target.value } : entry)
                      )
                    }}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="練習に関する特記事項"
              />
            </div>
              </div>
            ))}

            {/* メニュー追加ボタン */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={addNewEntry}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                メニュー追加
              </button>
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                onClick={onClose}
                variant="secondary"
                disabled={isLoading}
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? '保存中...' : (editData ? '更新' : '保存')}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* タイム入力モーダル */}
      {showTimeModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={closeTimeModal}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              {/* ヘッダー */}
              <div className="bg-white px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    タイム記録
                  </h3>
                  <button
                    type="button"
                    onClick={closeTimeModal}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                <div className="space-y-4">
                  {(() => {
                    const setCount = Math.max(...timeEntries.map(t => t.setNumber), 0)
                    const setAverages = calculateSetAverageTimes(timeEntries)
                    const totalAverage = calculateAverageTime(timeEntries)
                    
                    return (
                      <>
                        {Array.from({ length: setCount }, (_, setIndex) => {
                          const setNumber = setIndex + 1
                          const setTimes = timeEntries.filter(t => t.setNumber === setNumber)
                          
                          return (
                            <div key={setNumber} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-lg font-medium text-gray-900">
                                  {setNumber}セット目
                                </h4>
                                <div className="text-sm text-gray-600">
                                  平均: {setAverages[setIndex] > 0 ? formatTimeDisplay(setAverages[setIndex]) : '未記録'}
                                </div>
                              </div>
                              
                              <div className="space-y-2 pl-4">
                                {setTimes.map((time, repIndex) => {
                                  const timeIndex = timeEntries.indexOf(time)
                                  return (
                                    <div key={repIndex} className="flex items-center gap-3">
                                      <div className="w-20 text-sm text-gray-600">
                                        {time.repNumber}本目:
                                      </div>
                                      <Input
                                        type="text"
                                        placeholder="例: 1:30.50"
                                        value={time.timeDisplayValue !== undefined ? time.timeDisplayValue : (time.time > 0 ? time.time.toString() : '')}
                                        onChange={(e) => {
                                          const timeStr = e.target.value
                                          setTimeEntries(prev => {
                                            const updated = prev.map((t, i) => i === timeIndex ? { ...t, timeDisplayValue: timeStr } : t)
                                            
                                            // 入力中でもリアルタイムで平均を計算するため、一時的にtimeを更新
                                            if (timeStr && timeStr !== '') {
                                              const parsedTime = parseTimeString(timeStr)
                                              return updated.map((t, i) => i === timeIndex ? { ...t, time: parsedTime } : t)
                                            }
                                            return updated
                                          })
                                        }}
                                        onBlur={(e) => {
                                          const timeStr = e.target.value
                                          if (timeStr === '') {
                                            setTimeEntries(prev => 
                                              prev.map((t, i) => i === timeIndex ? { ...t, time: 0, timeDisplayValue: undefined } : t)
                                            )
                                          } else {
                                            const parsedTime = parseTimeString(timeStr)
                                            setTimeEntries(prev => 
                                              prev.map((t, i) => i === timeIndex ? { ...t, time: parsedTime, timeDisplayValue: timeStr } : t)
                                            )
                                          }
                                        }}
                                        className="flex-1"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                              
                              {setIndex < setCount - 1 && (
                                <div className="border-b border-gray-200 my-4"></div>
      )}
    </div>
  )
                        })}
                        
                        {/* 全体の平均タイム */}
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between">
                            <span className="text-lg font-medium text-gray-900">全体平均</span>
                            <span className="text-xl font-bold text-green-600">
                              {totalAverage > 0 ? formatTimeDisplay(totalAverage) : '未記録'}
                            </span>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>

                {/* ボタン */}
                <div className="flex justify-end gap-3 pt-6 border-t mt-6">
                  <Button
                    type="button"
                    onClick={closeTimeModal}
                    variant="secondary"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    onClick={saveTimes}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タグ選択モーダル */}
      <PracticeTagForm
        isOpen={showTagModal}
        onClose={closeTagModal}
        onTagSelect={handleTagSelect}
        selectedTags={practiceLogEntries[currentTagMenuIndex]?.tagIds || []}
        mode="select"
      />
    </div>
  )
}