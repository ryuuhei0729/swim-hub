'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { RecordAPI } from '@apps/shared/api/records'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline'

// =============================================================================
// 型定義
// =============================================================================

// 種目タブ
type StyleTab = 'fr' | 'br' | 'ba' | 'fly' | 'im'

// 種目定義
interface StyleDefinition {
  id: number
  nameJp: string
  style: string
  distance: number
}

// 入力データ
interface BestTimeInput {
  time: string      // 入力値（文字列）
  note: string      // 備考
  timeInSeconds?: number  // パース済みタイム（秒）
  error?: string    // エラーメッセージ
}

// =============================================================================
// 定数定義
// =============================================================================

// 種目マスターデータ（stylesテーブルと同期）
const STYLES: StyleDefinition[] = [
  { id: 1, nameJp: '25m自由形', style: 'fr', distance: 25 },
  { id: 2, nameJp: '50m自由形', style: 'fr', distance: 50 },
  { id: 3, nameJp: '100m自由形', style: 'fr', distance: 100 },
  { id: 4, nameJp: '200m自由形', style: 'fr', distance: 200 },
  { id: 5, nameJp: '400m自由形', style: 'fr', distance: 400 },
  { id: 6, nameJp: '800m自由形', style: 'fr', distance: 800 },
  { id: 7, nameJp: '1500m自由形', style: 'fr', distance: 1500 },
  { id: 8, nameJp: '25m平泳ぎ', style: 'br', distance: 25 },
  { id: 9, nameJp: '50m平泳ぎ', style: 'br', distance: 50 },
  { id: 10, nameJp: '100m平泳ぎ', style: 'br', distance: 100 },
  { id: 11, nameJp: '200m平泳ぎ', style: 'br', distance: 200 },
  { id: 12, nameJp: '25m背泳ぎ', style: 'ba', distance: 25 },
  { id: 13, nameJp: '50m背泳ぎ', style: 'ba', distance: 50 },
  { id: 14, nameJp: '100m背泳ぎ', style: 'ba', distance: 100 },
  { id: 15, nameJp: '200m背泳ぎ', style: 'ba', distance: 200 },
  { id: 16, nameJp: '25mバタフライ', style: 'fly', distance: 25 },
  { id: 17, nameJp: '50mバタフライ', style: 'fly', distance: 50 },
  { id: 18, nameJp: '100mバタフライ', style: 'fly', distance: 100 },
  { id: 19, nameJp: '200mバタフライ', style: 'fly', distance: 200 },
  { id: 20, nameJp: '100m個人メドレー', style: 'im', distance: 100 },
  { id: 21, nameJp: '200m個人メドレー', style: 'im', distance: 200 },
  { id: 22, nameJp: '400m個人メドレー', style: 'im', distance: 400 },
]

// 種目タブ定義
const STYLE_TABS: Array<{ id: StyleTab; name: string; color: string }> = [
  { id: 'fr', name: '自由形', color: 'yellow' },
  { id: 'br', name: '平泳ぎ', color: 'green' },
  { id: 'ba', name: '背泳ぎ', color: 'red' },
  { id: 'fly', name: 'バタフライ', color: 'blue' },
  { id: 'im', name: '個人メドレー', color: 'purple' },
]

// 種目別距離定義
const DISTANCES_BY_STYLE: Record<StyleTab, number[]> = {
  fr: [25, 50, 100, 200, 400, 800, 1500],
  br: [25, 50, 100, 200],
  ba: [25, 50, 100, 200],
  fly: [25, 50, 100, 200],
  im: [100, 200, 400],
}

// プール種別定義
const POOL_TYPES = [
  { value: 0, label: '短水路', shortLabel: '短水路' },
  { value: 1, label: '長水路', shortLabel: '長水路' },
] as const

// =============================================================================
// ユーティリティ関数
// =============================================================================

/**
 * タイム文字列を秒数に変換
 */
function parseTimeToSeconds(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null
  
  const cleanStr = timeStr.trim()
  if (!cleanStr) return null
  
  // 形式1: m:ss.00 または mm:ss.00
  const colonFormat2Decimal = /^(\d{1,2}):(\d{2})\.(\d{2})$/
  const colonMatch2Decimal = cleanStr.match(colonFormat2Decimal)
  if (colonMatch2Decimal) {
    const minutes = parseInt(colonMatch2Decimal[1], 10)
    const seconds = parseInt(colonMatch2Decimal[2], 10)
    const centiseconds = parseInt(colonMatch2Decimal[3], 10)
    if (seconds >= 60) return null
    return minutes * 60 + seconds + centiseconds / 100
  }
  
  // 形式2: m:ss.0 または mm:ss.0
  const colonFormat1Decimal = /^(\d{1,2}):(\d{2})\.(\d{1})$/
  const colonMatch1Decimal = cleanStr.match(colonFormat1Decimal)
  if (colonMatch1Decimal) {
    const minutes = parseInt(colonMatch1Decimal[1], 10)
    const seconds = parseInt(colonMatch1Decimal[2], 10)
    const deciseconds = parseInt(colonMatch1Decimal[3], 10)
    if (seconds >= 60) return null
    return minutes * 60 + seconds + deciseconds / 10
  }
  
  // 形式3: m:ss または mm:ss
  const colonFormatNoDecimal = /^(\d{1,2}):(\d{2})$/
  const colonMatchNoDecimal = cleanStr.match(colonFormatNoDecimal)
  if (colonMatchNoDecimal) {
    const minutes = parseInt(colonMatchNoDecimal[1], 10)
    const seconds = parseInt(colonMatchNoDecimal[2], 10)
    if (seconds >= 60) return null
    return minutes * 60 + seconds
  }
  
  // 形式4: ss.00
  const simpleFormat2Decimal = /^(\d{1,2})\.(\d{2})$/
  const simpleMatch2Decimal = cleanStr.match(simpleFormat2Decimal)
  if (simpleMatch2Decimal) {
    const totalSeconds = parseInt(simpleMatch2Decimal[1], 10)
    const centiseconds = parseInt(simpleMatch2Decimal[2], 10)
    return totalSeconds + centiseconds / 100
  }
  
  // 形式5: ss.0
  const simpleFormat1Decimal = /^(\d{1,2})\.(\d{1})$/
  const simpleMatch1Decimal = cleanStr.match(simpleFormat1Decimal)
  if (simpleMatch1Decimal) {
    const totalSeconds = parseInt(simpleMatch1Decimal[1], 10)
    const deciseconds = parseInt(simpleMatch1Decimal[2], 10)
    return totalSeconds + deciseconds / 10
  }
  
  // 形式6: ss
  const simpleFormatNoDecimal = /^(\d{1,2})$/
  const simpleMatchNoDecimal = cleanStr.match(simpleFormatNoDecimal)
  if (simpleMatchNoDecimal) {
    const totalSeconds = parseInt(simpleMatchNoDecimal[1], 10)
    return totalSeconds
  }
  
  return null
}

/**
 * style_idを取得
 */
function getStyleId(styleCode: string, distance: number): number | null {
  const style = STYLES.find(s => s.style === styleCode && s.distance === distance)
  return style ? style.id : null
}

/**
 * 長水路で有効な種目かチェック
 */
function isValidForLongCourse(styleCode: string, distance: number): boolean {
  // 25mは長水路では存在しない
  if (distance === 25) return false
  // 長水路の100m個人メドレーは存在しない
  if (styleCode === 'im' && distance === 100) return false
  return true
}

/**
 * リレイングが可能な種目かチェック
 */
function canRelay(styleCode: string, distance: number): boolean {
  // リレーメドレーは全てリレイング可能
  if (styleCode === 'relay') return true
  // 背泳ぎと個人メドレーはリレイング不可
  if (styleCode === 'ba' || styleCode === 'im') return false
  // 200m以上は自由形のみリレイング可能
  if (distance >= 200 && styleCode !== 'fr') return false
  return true
}

// =============================================================================
// メインコンポーネント
// =============================================================================

export default function BulkBestTimeClient() {
  const router = useRouter()
  const { supabase } = useAuth()
  const [activeTab, setActiveTab] = useState<StyleTab>('fr')
  const [inputs, setInputs] = useState<Map<string, BestTimeInput>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const recordAPI = useMemo(() => {
    if (!supabase) return null
    return new RecordAPI(supabase)
  }, [supabase])

  // 入力キーの生成
  const getInputKey = useCallback((styleId: number, poolType: number, isRelaying: boolean) => {
    return `${styleId}_${poolType}_${isRelaying ? '1' : '0'}`
  }, [])

  // 入力値の更新
  const handleInputChange = useCallback((
    styleId: number,
    poolType: number,
    isRelaying: boolean,
    field: 'time' | 'note',
    value: string
  ) => {
    const key = getInputKey(styleId, poolType, isRelaying)
    const current = inputs.get(key) || { time: '', note: '' }
    
    const updated = { ...current, [field]: value }
    
    // タイムが変更された場合、バリデーション
    if (field === 'time') {
      if (value.trim()) {
        const timeInSeconds = parseTimeToSeconds(value)
        if (timeInSeconds === null || timeInSeconds <= 0) {
          updated.error = 'タイム形式が不正です（例: 1:23.45 または 23.45）'
          updated.timeInSeconds = undefined
        } else {
          updated.error = undefined
          updated.timeInSeconds = timeInSeconds
        }
      } else {
        updated.error = undefined
        updated.timeInSeconds = undefined
      }
    }
    
    const newInputs = new Map(inputs)
    if (updated.time || updated.note) {
      newInputs.set(key, updated)
    } else {
      newInputs.delete(key)
    }
    setInputs(newInputs)
  }, [inputs, getInputKey])

  // 入力済み件数のカウント
  const validInputCount = useMemo(() => {
    let count = 0
    inputs.forEach((input) => {
      if (input.time && !input.error && input.timeInSeconds !== undefined) {
        count++
      }
    })
    return count
  }, [inputs])

  // 一括登録処理
  const handleBulkRegister = useCallback(async () => {
    if (!recordAPI) return
    
    // 有効な入力のみを抽出
    const records: Array<{
      style_id: number
      time: number
      is_relaying: boolean
      note: string | null
      pool_type: number
    }> = []
    
    inputs.forEach((input, key) => {
      if (input.time && !input.error && input.timeInSeconds !== undefined) {
        const [styleIdStr, poolTypeStr, isRelayingStr] = key.split('_')
        records.push({
          style_id: parseInt(styleIdStr, 10),
          time: input.timeInSeconds,
          is_relaying: isRelayingStr === '1',
          note: input.note.trim() || null,
          pool_type: Number(poolTypeStr),
        })
      }
    })
    
    if (records.length === 0) {
      setError('登録するデータがありません')
      return
    }
    
    setLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      const result = await recordAPI.createBulkRecords(records)
      
      if (result.errors.length === 0) {
        setSuccess(`${result.created}件の記録を登録しました`)
        // 入力をクリア
        setInputs(new Map())
      } else {
        setError(`一部の登録に失敗しました: ${result.errors.join(', ')}`)
      }
    } catch (err) {
      setError('一括登録に失敗しました')
      console.error('一括登録エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [inputs, recordAPI])

  const handleBack = useCallback(() => {
    router.push('/mypage')
  }, [router])

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBack}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="戻る"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              ベストタイム一括入力
            </h1>
            <p className="text-gray-600 mt-1">
              種目ごとにベストタイムを直接入力できます
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400 shrink-0" />
              <div className="ml-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 成功表示 */}
        {success && (
          <div className="p-4 bg-green-50 border-b border-green-200">
            <div className="flex">
              <CheckCircleIcon className="h-5 w-5 text-green-400 shrink-0" />
              <div className="ml-3">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {/* 種目タブ */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto" aria-label="種目タブ">
            {STYLE_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-6 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* テーブル */}
        <div className="p-6">
          <BestTimeTable
            styleTab={activeTab}
            inputs={inputs}
            onInputChange={handleInputChange}
            getInputKey={getInputKey}
          />
        </div>

        {/* フッター */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              入力済み: <strong className="text-gray-900">{validInputCount}件</strong>
            </p>
            <button
              onClick={handleBulkRegister}
              disabled={loading || validInputCount === 0}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  登録中...
                </>
              ) : (
                '一括登録する'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// サブコンポーネント: ベストタイムテーブル
// =============================================================================

interface BestTimeTableProps {
  styleTab: StyleTab
  inputs: Map<string, BestTimeInput>
  onInputChange: (
    styleId: number,
    poolType: number,
    isRelaying: boolean,
    field: 'time' | 'note',
    value: string
  ) => void
  getInputKey: (styleId: number, poolType: number, isRelaying: boolean) => string
}

function BestTimeTable({ styleTab, inputs, onInputChange, getInputKey }: BestTimeTableProps) {
  const distances = DISTANCES_BY_STYLE[styleTab]
  
  // リレイング列を表示するか
  const showRelaying = styleTab !== 'ba' && styleTab !== 'im'
  
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
              距離
            </th>
            {POOL_TYPES.map((poolType) => {
              const colSpan = showRelaying ? 4 : 2
              return (
                <th
                  key={poolType.value}
                  colSpan={colSpan}
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200"
                >
                  {poolType.label}
                </th>
              )
            })}
          </tr>
          <tr>
            <th className="px-4 py-3 border-r border-gray-200"></th>
            {POOL_TYPES.map((poolType) => (
              <React.Fragment key={poolType.value}>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  タイム
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200">
                  備考
                </th>
                {showRelaying && (
                  <>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  引き継ぎ
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-200">
                      備考
                    </th>
                  </>
                )}
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {distances.map((distance) => {
            const styleId = getStyleId(styleTab, distance)
            if (!styleId) return null
            
            return (
              <tr key={distance} className="hover:bg-gray-50">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-200">
                  {distance}m
                </td>
                {POOL_TYPES.map((poolType) => {
                  // 長水路で無効な種目はスキップ
                  const isValid = poolType.value === 0 || isValidForLongCourse(styleTab, distance)
                  const canRelayThis = canRelay(styleTab, distance)
                  
                  return (
                    <React.Fragment key={poolType.value}>
                      {/* 通常タイム */}
                      <TimeInputCell
                        styleId={styleId}
                        poolType={poolType.value}
                        isRelaying={false}
                        inputs={inputs}
                        onInputChange={onInputChange}
                        getInputKey={getInputKey}
                        disabled={!isValid}
                      />
                      <NoteInputCell
                        styleId={styleId}
                        poolType={poolType.value}
                        isRelaying={false}
                        inputs={inputs}
                        onInputChange={onInputChange}
                        getInputKey={getInputKey}
                        disabled={!isValid}
                        isLast={!showRelaying}
                      />
                      
                      {/* リレイングタイム */}
                      {showRelaying && (
                        <>
                          <TimeInputCell
                            styleId={styleId}
                            poolType={poolType.value}
                            isRelaying={true}
                            inputs={inputs}
                            onInputChange={onInputChange}
                            getInputKey={getInputKey}
                            disabled={!isValid || !canRelayThis}
                          />
                          <NoteInputCell
                            styleId={styleId}
                            poolType={poolType.value}
                            isRelaying={true}
                            inputs={inputs}
                            onInputChange={onInputChange}
                            getInputKey={getInputKey}
                            disabled={!isValid || !canRelayThis}
                            isLast={true}
                          />
                        </>
                      )}
                    </React.Fragment>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// =============================================================================
// サブコンポーネント: タイム入力セル
// =============================================================================

interface TimeInputCellProps {
  styleId: number
  poolType: number
  isRelaying: boolean
  inputs: Map<string, BestTimeInput>
  onInputChange: (
    styleId: number,
    poolType: number,
    isRelaying: boolean,
    field: 'time' | 'note',
    value: string
  ) => void
  getInputKey: (styleId: number, poolType: number, isRelaying: boolean) => string
  disabled?: boolean
}

function TimeInputCell({
  styleId,
  poolType,
  isRelaying,
  inputs,
  onInputChange,
  getInputKey,
  disabled = false
}: TimeInputCellProps) {
  const key = getInputKey(styleId, poolType, isRelaying)
  const input = inputs.get(key)
  const hasError = input?.error

  if (disabled) {
    return (
      <td className="px-3 py-2 text-center bg-gray-100">
        <span className="text-gray-400">━</span>
      </td>
    )
  }

  return (
    <td className="px-3 py-2">
      <input
        type="text"
        value={input?.time || ''}
        onChange={(e) => onInputChange(styleId, poolType, isRelaying, 'time', e.target.value)}
        placeholder="1:23.45"
        className={`
          w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 placeholder-gray-400
          ${hasError
            ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
            : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
          }
        `}
      />
      {hasError && (
        <p className="mt-1 text-xs text-red-600">{input.error}</p>
      )}
    </td>
  )
}

// =============================================================================
// サブコンポーネント: 備考入力セル
// =============================================================================

interface NoteInputCellProps {
  styleId: number
  poolType: number
  isRelaying: boolean
  inputs: Map<string, BestTimeInput>
  onInputChange: (
    styleId: number,
    poolType: number,
    isRelaying: boolean,
    field: 'time' | 'note',
    value: string
  ) => void
  getInputKey: (styleId: number, poolType: number, isRelaying: boolean) => string
  disabled?: boolean
  isLast?: boolean
}

function NoteInputCell({
  styleId,
  poolType,
  isRelaying,
  inputs,
  onInputChange,
  getInputKey,
  disabled = false,
  isLast = false
}: NoteInputCellProps) {
  const key = getInputKey(styleId, poolType, isRelaying)
  const input = inputs.get(key)

  if (disabled) {
    return (
      <td className={`px-3 py-2 text-center bg-gray-100 ${isLast ? 'border-r border-gray-200' : ''}`}>
        <span className="text-gray-400">━</span>
      </td>
    )
  }

  return (
    <td className={`px-3 py-2 ${isLast ? 'border-r border-gray-200' : ''}`}>
      <input
        type="text"
        value={input?.note || ''}
        onChange={(e) => onInputChange(styleId, poolType, isRelaying, 'note', e.target.value)}
        placeholder="大会名など"
        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
      />
    </td>
  )
}
