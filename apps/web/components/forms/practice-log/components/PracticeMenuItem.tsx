'use client'

import React from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { TrashIcon, ClockIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import TagInput from '../../TagInput'
import type { PracticeMenu, Tag } from '../types'
import { SWIM_STYLES, SWIM_CATEGORIES } from '../types'
import { formatTime, formatTimeAverage } from '@/utils/formatters'

interface PracticeMenuItemProps {
  menu: PracticeMenu
  menuIndex: number
  canRemove: boolean
  availableTags: Tag[]
  isLoading: boolean
  onRemove: () => void
  onUpdate: (field: keyof PracticeMenu, value: string | number | '' | Tag[]) => void
  onTagsChange: (tags: Tag[]) => void
  onAvailableTagsUpdate: (tags: Tag[]) => void
  onOpenTimeModal: () => void
}

/**
 * 練習メニュー入力コンポーネント
 */
export default function PracticeMenuItem({
  menu,
  menuIndex,
  canRemove,
  availableTags,
  isLoading,
  onRemove,
  onUpdate,
  onTagsChange,
  onAvailableTagsUpdate,
  onOpenTimeModal,
}: PracticeMenuItemProps) {
  return (
    <div
      className="border border-gray-200 rounded-lg p-4 space-y-4 bg-green-50"
      data-testid="practice-menu-container"
    >
      {/* メニューヘッダー */}
      <div className="flex items-center justify-between">
        <h5 className="font-medium text-gray-700">メニュー {menuIndex + 1}</h5>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-500 hover:text-red-700"
            disabled={isLoading}
            aria-label={`メニュー ${menuIndex + 1} を削除`}
            data-testid={`practice-menu-remove-button-${menuIndex + 1}`}
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* メニュー入力フィールド */}
      <div className="space-y-4">
        {/* 1行目：タグ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">タグ</label>
          <TagInput
            selectedTags={menu.tags}
            availableTags={availableTags}
            onTagsChange={onTagsChange}
            onAvailableTagsUpdate={onAvailableTagsUpdate}
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
                onChange={(e) => onUpdate('style', e.target.value)}
                className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                required
                data-testid="practice-style"
              >
                {SWIM_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
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
                  onUpdate('swimCategory', e.target.value as 'Swim' | 'Pull' | 'Kick')
                }
                className="w-full pl-3 pr-10 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                data-testid="practice-swim-category"
              >
                {SWIM_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 3行目：距離、本数、セット数（モバイル）/ 距離、本数、セット数、サークル（PC）*/}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              距離(m) <span className="text-red-500">*</span>
            </label>
            <Input
              type="number"
              value={menu.distance}
              onChange={(e) => onUpdate('distance', e.target.value)}
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
              onChange={(e) => onUpdate('reps', e.target.value)}
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
              onChange={(e) => onUpdate('sets', e.target.value)}
              placeholder="1"
              min="1"
              required
              data-testid="practice-set-count"
            />
          </div>

          <div className="hidden sm:block">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              サークル(分)
            </label>
            <Input
              type="number"
              value={menu.circleMin}
              onChange={(e) => onUpdate('circleMin', e.target.value)}
              placeholder="1"
              min="0"
              data-testid="practice-circle-min-pc"
            />
          </div>

          <div className="hidden sm:block">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              サークル(秒)
            </label>
            <Input
              type="number"
              value={menu.circleSec}
              onChange={(e) => onUpdate('circleSec', e.target.value)}
              placeholder="30"
              min="0"
              max="59"
              data-testid="practice-circle-sec-pc"
            />
          </div>
        </div>

        {/* 4行目：サークル（モバイルのみ） */}
        <div className="grid grid-cols-2 gap-2 sm:hidden">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              サークル(分)
            </label>
            <Input
              type="number"
              value={menu.circleMin}
              onChange={(e) => onUpdate('circleMin', e.target.value)}
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
              onChange={(e) => onUpdate('circleSec', e.target.value)}
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
            onClick={onOpenTimeModal}
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
          <PracticeTimesDisplay menu={menu} />
        )}

        {/* メモ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">メモ</label>
          <textarea
            value={menu.note}
            onChange={(e) => onUpdate('note', e.target.value)}
            rows={2}
            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="このメニューに関するメモ"
            data-testid={`practice-log-note-${menuIndex + 1}`}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 練習タイム表示コンポーネント
 */
function PracticeTimesDisplay({ menu }: { menu: PracticeMenu }) {
  return (
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
                <th
                  key={setIndex + 1}
                  className="text-center py-2 px-2 font-medium text-gray-800"
                >
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
                    const time = menu.times.find(
                      (t) => t.setNumber === setNumber && t.repNumber === repNumber
                    )
                    const setTimes = menu.times.filter(
                      (t) => t.setNumber === setNumber && t.time > 0
                    )
                    const setFastest =
                      setTimes.length > 0 ? Math.min(...setTimes.map((t) => t.time)) : 0
                    const isFastest = time && time.time > 0 && time.time === setFastest

                    return (
                      <td key={setNumber} className="py-2 px-2 text-center">
                        <span
                          className={
                            isFastest ? 'text-blue-600 font-bold' : 'text-gray-800'
                          }
                        >
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
                const setTimes = menu.times.filter(
                  (t) => t.setNumber === setNumber && t.time > 0
                )
                const average =
                  setTimes.length > 0
                    ? setTimes.reduce((sum: number, t) => sum + t.time, 0) / setTimes.length
                    : 0
                return (
                  <td key={setNumber} className="py-2 px-2 text-center">
                    <span className="text-gray-800 font-medium">
                      {average > 0 ? formatTimeAverage(average) : '-'}
                    </span>
                  </td>
                )
              })}
            </tr>
            {/* 全体平均行 */}
            <tr className="border-t-2 border-gray-300 bg-blue-50">
              <td
                className="py-2 px-2 font-medium text-blue-800"
                data-testid="practice-overall-average"
              >
                全体平均
              </td>
              <td
                className="py-2 px-2 text-center"
                colSpan={Number(menu.sets) || 1}
              >
                <span className="text-blue-800 font-bold">
                  {(() => {
                    const allValidTimes = menu.times.filter((t) => t.time > 0)
                    const overallAverage =
                      allValidTimes.length > 0
                        ? allValidTimes.reduce((sum: number, t) => sum + t.time, 0) /
                          allValidTimes.length
                        : 0
                    return overallAverage > 0 ? formatTimeAverage(overallAverage) : '-'
                  })()}
                </span>
              </td>
            </tr>
            {/* 全体最速行 */}
            <tr className="bg-blue-50">
              <td
                className="py-2 px-2 font-medium text-blue-800"
                data-testid="practice-overall-fastest"
              >
                全体最速
              </td>
              <td
                className="py-2 px-2 text-center"
                colSpan={Number(menu.sets) || 1}
              >
                <span className="text-blue-800 font-bold">
                  {(() => {
                    const allValidTimes = menu.times.filter((t) => t.time > 0)
                    const overallFastest =
                      allValidTimes.length > 0
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
  )
}
