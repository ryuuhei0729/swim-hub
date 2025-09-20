'use client'

import React, { useState, useEffect } from 'react'
import { Button, Input } from '@/components/ui'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { format } from 'date-fns'
import TimeInputModal from './TimeInputModal'
import TagSelector from './TagSelector'
import { PracticeTag, PracticeSet, PracticeLogFormData, PracticeLogFormProps, SWIMMING_STYLES } from '@/types'


export default function PracticeLogForm({
  isOpen,
  onClose,
  onSubmit,
  onDeletePracticeLog,
  initialDate,
  editData,
  isLoading = false
}: PracticeLogFormProps) {
  const [formData, setFormData] = useState<PracticeLogFormData>({
    practiceDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    location: '',
    sets: [{
      id: '1',
      reps: 1,
      distance: 100,
      circleTime: 90,
      uiCircleMin: 1,
      uiCircleSec: 30,
      setCount: 1,
      style: 'Fr',
      note: '',
      tags: []
    }],
    note: ''
  })
  const [showTimeModal, setShowTimeModal] = useState(false)
  const [selectedSetForTime, setSelectedSetForTime] = useState<PracticeSet | null>(null)

  // タイム表示のフォーマット関数
  const formatTimeDisplay = (seconds: number): string => {
    if (seconds === 0) return '0.00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 
      ? `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`
      : `${remainingSeconds.toFixed(2)}`
  }

  // 編集データが渡された時にフォームデータを初期化
  useEffect(() => {
    if (editData && isOpen) {
      console.log('PracticeLogForm: Setting form data from editData:', editData)
      console.log('PracticeLogForm: Times data:', editData.times)
    
      // 複数のPractice_logが存在する場合の処理
      if (editData.practiceLogs && editData.practiceLogs.length > 0) {
        console.log('PracticeLogForm: Multiple practice logs detected:', editData.practiceLogs.length)
        
        // 複数のPractice_logをsets配列に変換
        const sets: PracticeSet[] = editData.practiceLogs.map((log: any, index: number) => {
          const actualSetCount: number = log.setCount || 1
          const allTimes: Array<{ setNumber: number; repNumber: number; time: number }> = (log.times || [])
          const derivedRepsFromTimes = allTimes.length > 0
            ? Math.max(...allTimes.map((t: any) => t.repNumber || 0))
            : 0
          
          return {
            id: log.id || `log-${index}`,
            reps: derivedRepsFromTimes || log.repCount || 1,
            distance: log.distance || 100,
            circleTime: log.circle || 90,
            uiCircleMin: Math.floor((log.circle || 90) / 60),
            uiCircleSec: (log.circle || 90) % 60,
            setCount: actualSetCount,
            style: log.style || 'Fr',
            note: log.note || '',
            tags: log.tags || [],
            times: allTimes
          }
        })
        
        setFormData({
          practiceDate: editData.date ? format(new Date(editData.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
          location: editData.place || '',
          sets: sets,
          note: editData.note || ''
        })
        return
      }
    
      // 単一のPractice_logの場合の従来の処理
      const actualSetCount: number = editData.setCount || 1
      const allTimes: Array<{ setNumber: number; repNumber: number; time: number }> = (editData.times || [])
      const derivedRepsFromTimes = allTimes.length > 0
        ? Math.max(...allTimes.map((t: any) => t.repNumber || 0))
        : 0
      const repsPerSet = derivedRepsFromTimes > 0
        ? derivedRepsFromTimes
        : Math.max(1, Math.floor((editData.repCount || 1) / (actualSetCount || 1)))
      const totalDistance = editData.distance || 0
      const perRepDistance = (repsPerSet > 0 && actualSetCount > 0)
        ? Math.max(1, Math.round(totalDistance / (repsPerSet * actualSetCount)))
        : (editData.distance || 100)
      const ct = editData.circle || 90

      const setsData = [{
        id: '1',
        reps: repsPerSet,
        distance: perRepDistance,
        circleTime: ct,
        uiCircleMin: Math.floor(ct / 60),
        uiCircleSec: ct % 60,
        setCount: actualSetCount,
        style: editData.style || 'Fr',
        note: editData.note || '',
        tags: editData.tags || [],
        times: allTimes
      }]

      console.log('PracticeLogForm: Generated single set data:', setsData)

      const newFormData = {
        practiceDate: editData.date || format(new Date(), 'yyyy-MM-dd'),
        location: editData.place || '',
        sets: setsData,
        note: editData.note || ''
      }

      console.log('PracticeLogForm: New form data:', newFormData)
      setFormData(newFormData)
    } else if (!editData && isOpen) {
      // 新規作成時はデフォルト値にリセット
      console.log('PracticeLogForm: Resetting to default values (new entry)')
      setFormData({
        practiceDate: initialDate ? format(initialDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        location: '',
        sets: [{
          id: '1',
          reps: 1,
          distance: 100,
          circleTime: 90,
          uiCircleMin: 1,
          uiCircleSec: 30,
          setCount: 1,
          style: 'Fr',
          note: ''
        }],
        note: ''
      })
    }
    
  }, [editData, isOpen, initialDate])


  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // サニタイズ: 空文字は0として扱い、数値型に統一
      const sanitizedSets = (formData.sets || []).map(set => ({
        ...set,
        reps: (typeof set.reps === 'number' && Number.isFinite(set.reps)) ? set.reps : 0,
        distance: (typeof set.distance === 'number' && Number.isFinite(set.distance)) ? set.distance : 0,
        circleTime: (typeof set.circleTime === 'number' && Number.isFinite(set.circleTime)) ? set.circleTime : 0,
      }))
      const sanitizedForm = { ...formData, sets: sanitizedSets }
      await onSubmit?.(sanitizedForm)
      // フォームリセット
      setFormData({
        practiceDate: format(new Date(), 'yyyy-MM-dd'),
        location: '',
        sets: [{
          id: '1',
          reps: 1,
          distance: 100,
          circleTime: 90,
          setCount: 1,
          style: 'Fr',
          note: '',
          tags: []
        }],
        note: ''
      })
      onClose()
    } catch (error) {
      console.error('練習記録の保存に失敗しました:', error)
    }
  }

  const addMenu = () => {
    setFormData(prev => {
      const base = prev.sets[0]
      const newSet: PracticeSet = {
        id: Date.now().toString(),
        reps: (typeof base?.reps === 'number' || base?.reps === '') ? (base.reps as any) : 1,
        distance: (typeof base?.distance === 'number' || base?.distance === '') ? (base.distance as any) : 100,
        circleTime: (typeof base?.circleTime === 'number' || base?.circleTime === '') ? (base.circleTime as any) : 90,
        uiCircleMin: (typeof base?.uiCircleMin === 'number' || base?.uiCircleMin === '') ? (base.uiCircleMin as any) : 1,
        uiCircleSec: (typeof base?.uiCircleSec === 'number' || base?.uiCircleSec === '') ? (base.uiCircleSec as any) : 30,
        setCount: (typeof base?.setCount === 'number' || base?.setCount === '') ? (base.setCount as any) : 1,
        style: base?.style || 'Fr',
        note: base?.note || '',
        tags: base?.tags || []
      }
      return {
        ...prev,
        sets: [...prev.sets, newSet]
      }
    })
  }

  const removeMenu = async (id: string) => {
    if (formData.sets.length > 1) {
      // 編集時で既存のPractice_logの場合、データベースからも削除
      if (editData?.practiceLogs) {
        const setToRemove = formData.sets.find(set => set.id === id)
        if (setToRemove && setToRemove.id.startsWith('existing_')) {
          const practiceLogId = setToRemove.id.replace('existing_', '')
          if (onDeletePracticeLog) {
            try {
              await onDeletePracticeLog(practiceLogId)
            } catch (error) {
              console.error('Practice_logの削除に失敗しました:', error)
              alert('Practice_logの削除に失敗しました。')
              return
            }
          }
        }
      }
      
      // フォームの状態からメニューを削除
      setFormData(prev => ({
        ...prev,
        sets: prev.sets.filter(set => set.id !== id)
      }))
    }
  }

  const updateSet = (id: string, field: keyof PracticeSet, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map(set => 
        set.id === id ? { ...set, [field]: value } : set
      )
    }))
  }

  const updateSetTags = (id: string, tags: PracticeTag[]) => {
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map(set => 
        set.id === id ? { ...set, tags } : set
      )
    }))
  }

  const updateCirclePart = (id: string, part: 'min' | 'sec', rawValue: string) => {
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map(set => {
        if (set.id !== id) return set
        const currentMin = set.uiCircleMin ?? (typeof set.circleTime === 'number' ? Math.floor(set.circleTime / 60) : '')
        const currentSec = set.uiCircleSec ?? (typeof set.circleTime === 'number' ? (set.circleTime % 60) : '')
        let nextMin: number | '' = currentMin
        let nextSec: number | '' = currentSec
        if (part === 'min') {
          if (rawValue === '') nextMin = ''
          else {
            const n = parseInt(rawValue, 10)
            nextMin = Number.isNaN(n) || n < 0 ? '' : n
          }
        } else {
          if (rawValue === '') nextSec = ''
          else {
            let n = parseInt(rawValue, 10)
            if (Number.isNaN(n) || n < 0) n = 0
            if (n > 59) n = 59
            nextSec = n
          }
        }

        // 両方数値なら秒に正規化、それ以外は空
        const nextCircle = (typeof nextMin === 'number' && typeof nextSec === 'number')
          ? (nextMin * 60 + nextSec)
          : ''

        return {
          ...set,
          uiCircleMin: nextMin,
          uiCircleSec: nextSec,
          circleTime: nextCircle
        }
      })
    }))
  }

  const handleTimeInput = (set: PracticeSet) => {
    // 選択したメニューのタイム入力
    setSelectedSetForTime(set)
    setShowTimeModal(true)
  }

  const handleTimeSubmit = (times: Array<{ id: string; setNumber: number; repNumber: number; time: number }>) => {
    // 選択したメニューにのみ反映
    const targetId = selectedSetForTime?.id
    setFormData(prev => ({
      ...prev,
      sets: prev.sets.map(s => {
        if (s.id !== targetId) return s
        const repsNum = typeof s.reps === 'number' ? s.reps : 0
        const setCountNum = typeof s.setCount === 'number' ? s.setCount : 1
        const filtered = times.filter(t => t.time > 0 && t.repNumber >= 1 && t.repNumber <= repsNum && t.setNumber >= 1 && t.setNumber <= setCountNum)
        const mapped = filtered.map(t => ({
          id: `${t.setNumber}-${t.repNumber}`,
          setNumber: t.setNumber,
          repNumber: t.repNumber,
          time: t.time
        }))
        return { ...s, times: mapped }
      })
    }))

    setShowTimeModal(false)
    setSelectedSetForTime(null)
  }


  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* ヘッダー */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {editData ? '練習記録を編集' : '練習記録を追加'}
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-500"
                onClick={onClose}
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* フォーム本体 */}
          <form onSubmit={handleSubmit} className="bg-white px-6 py-4 space-y-6">
            {/* 基本情報 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  練習日 *
                </label>
                <Input
                  type="date"
                  value={formData.practiceDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, practiceDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  場所
                </label>
                <Input
                  type="text"
                  placeholder="例: 市営プール"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
            </div>


            {/* セット詳細 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  練習内容 *
                </label>
                {!editData?.practiceLogs && (
                  <Button
                    type="button"
                    onClick={addMenu}
                    variant="outline"
                    size="sm"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    メニュー追加
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {formData.sets.map((set, index) => (
                  <div key={set.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">
                        {editData?.practiceLogs && editData.practiceLogs.length > 1 
                          ? `メニュー ${index + 1} (${set.style})` 
                          : `メニュー ${index + 1}`}
                      </h4>
                      <div className="flex items-center space-x-2">
                        <Button
                          type="button"
                          onClick={() => handleTimeInput(set)}
                          variant="outline"
                          size="sm"
                        >
                          ⏱️ タイム入力
                        </Button>
                        {/* タイムデータがある場合の表示 */}
                        {set.times && set.times.length > 0 && (
                          <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                            {set.times.filter((t: any) => t.time > 0).length}件のタイム記録
                          </div>
                        )}
                        {formData.sets.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMenu(set.id)}
                            className="text-red-600 hover:text-red-800"
                            title="このメニューを削除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          泳法
                        </label>
                        <select
                          value={set.style}
                          onChange={(e) => updateSet(set.id, 'style', e.target.value)}
                          className="w-full px-3 py-2 h-9 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {SWIMMING_STYLES.map(style => (
                            <option key={style} value={style}>{style}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          セット数
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={(set.setCount ?? 1) as number | ''}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === '') {
                              updateSet(set.id, 'setCount', '')
                            } else {
                              const numValue = parseInt(value)
                              updateSet(set.id, 'setCount', Number.isNaN(numValue) ? '' : numValue)
                            }
                          }}
                          className="text-sm h-9"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          本数
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={set.reps as number | ''}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === '') {
                              updateSet(set.id, 'reps', '')
                            } else {
                              const numValue = parseInt(value)
                              updateSet(set.id, 'reps', Number.isNaN(numValue) ? '' : numValue)
                            }
                          }}
                          className="text-sm h-9"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          距離(m)
                        </label>
                        <Input
                          type="number"
                          min="1"
                          value={set.distance as number | ''}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value === '') {
                              updateSet(set.id, 'distance', '')
                            } else {
                              const numValue = parseInt(value)
                              updateSet(set.id, 'distance', Number.isNaN(numValue) ? '' : numValue)
                            }
                          }}
                          className="text-sm h-9"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          サークル（分・秒）
                        </label>
                        <div className="flex items-center gap-1 sm:gap-2 flex-nowrap">
                          <div className="flex-1 min-w-0">
                            <Input
                              type="number"
                              min="0"
                              value={(set.uiCircleMin ?? (typeof set.circleTime === 'number' ? Math.floor(set.circleTime / 60) : '')) as number | ''}
                              onChange={(e) => updateCirclePart(set.id, 'min', e.target.value)}
                              className="text-sm h-9 w-full"
                            />
                          </div>
                          <span className="text-xs text-gray-600">分</span>
                          <div className="flex-1 min-w-0">
                            <Input
                              type="number"
                              min="0"
                              max="59"
                              value={(set.uiCircleSec ?? (typeof set.circleTime === 'number' ? (set.circleTime % 60) : '')) as number | ''}
                              onChange={(e) => updateCirclePart(set.id, 'sec', e.target.value)}
                              className="text-sm h-9 w-full"
                            />
                          </div>
                          <span className="text-xs text-gray-600">秒</span>
                        </div>
                      </div>
                      
                    </div>

                    {/* タイム表示セクション */}
                    {set.times && set.times.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <h5 className="text-xs font-medium text-blue-800 mb-2">記録されたタイム</h5>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                          {set.times
                            .filter((time: any) => time.time > 0)
                            .sort((a: any, b: any) => {
                              if (a.setNumber !== b.setNumber) {
                                return a.setNumber - b.setNumber
                              }
                              return a.repNumber - b.repNumber
                            })
                            .map((time: any, timeIndex: number) => (
                              <div key={`${time.setNumber}-${time.repNumber}-${timeIndex}`} className="text-center">
                                <div className="text-xs text-blue-600 font-medium">
                                  {time.setNumber}セットの{time.repNumber}本目
                                </div>
                                <div className="text-sm font-mono text-blue-800 bg-white px-2 py-1 rounded border">
                                  {formatTimeDisplay(time.time)}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* メニュー個別のメモ欄 */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        メニューメモ
                      </label>
                      <textarea
                        rows={2}
                        value={set.note || ''}
                        onChange={(e) => updateSet(set.id, 'note', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="このメニューについての感想や気づいたことを記録..."
                      />
                    </div>

                    {/* タグ選択 */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        タグ
                      </label>
                      <TagSelector
                        selectedTags={set.tags || []}
                        onTagsChange={(tags) => updateSetTags(set.id, tags)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* メモ */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                メモ
              </label>
              <textarea
                rows={3}
                value={formData.note}
                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="練習の感想や気づいたことを記録..."
              />
            </div>

            {/* フッター */}
            <div className="bg-gray-50 px-6 py-3 sm:flex sm:flex-row-reverse sm:px-6 -mx-6 -mb-4">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto sm:ml-3"
              >
                {isLoading ? '保存中...' : '保存'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="mt-3 w-full sm:mt-0 sm:w-auto"
              >
                キャンセル
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* タイム入力モーダル */}
      {showTimeModal && selectedSetForTime && (
        <TimeInputModal
          isOpen={showTimeModal}
          onClose={() => {
            setShowTimeModal(false)
            setSelectedSetForTime(null)
          }}
          onSubmit={handleTimeSubmit}
          setCount={(typeof selectedSetForTime.setCount === 'number' ? (selectedSetForTime.setCount as number) : 1)}
          repCount={(typeof selectedSetForTime.reps === 'number' ? (selectedSetForTime.reps as number) : 0)}
          initialTimes={(selectedSetForTime.times || []).map((t: any) => ({
            id: `${t.setNumber}-${t.repNumber}`,
            setNumber: t.setNumber,
            repNumber: t.repNumber,
            time: t.time
          }))}
          menuNumber={formData.sets.findIndex(set => set.id === selectedSetForTime.id) + 1}
        />
      )}
    </div>
  )
}
