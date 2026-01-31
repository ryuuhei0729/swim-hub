'use client'

import React, { useState, useEffect } from 'react'
import { PencilIcon, TrashIcon, ShareIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { BoltIcon } from '@heroicons/react/24/solid'
import { format, parseISO, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ShareCardModal } from '@/components/share'
import type { PracticeShareData, PracticeMenuItem } from '@/components/share'
import { formatTime } from '@/utils/formatters'
import { useAuth } from '@/contexts'
import ImageGallery, { GalleryImage } from '@/components/ui/ImageGallery'
import type {
  Practice,
  PracticeLog,
  PracticeLogWithTimes,
  PracticeTime,
  PracticeTag
} from '@apps/shared/types'
import { PracticeLogTemplateSelectModal } from '@/components/practice-log-templates/PracticeLogTemplateSelectModal'
import { AttendanceButton } from '../AttendanceSection'
import type { PracticeDetailsProps, FormattedPracticeLog } from '../../types'

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: '自由形' },
  { value: 'Ba', label: '背泳ぎ' },
  { value: 'Br', label: '平泳ぎ' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' }
]

// コード値をラベルに変換する関数
const getStyleLabel = (styleValue: string): string => {
  const style = SWIM_STYLES.find(s => s.value === styleValue)
  if (style) return style.label
  if (SWIM_STYLES.some(s => s.label === styleValue)) return styleValue
  return styleValue
}

// 色の明度に基づいてテキスト色を決定する関数
const getTextColor = (backgroundColor: string) => {
  const hex = backgroundColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128 ? '#000000' : '#FFFFFF'
}

type PracticeWithFormattedLogs = Omit<Practice, 'practiceLogs' | 'practice_logs'> & {
  practiceLogs: FormattedPracticeLog[]
}

export function PracticeDetails({
  practiceId,
  place,
  practiceLogUpdateKey,
  onEdit,
  onDelete,
  onAddPracticeLog,
  onAddPracticeLogFromTemplate,
  onEditPracticeLog,
  onDeletePracticeLog,
  isTeamPractice = false,
  teamId,
  teamName,
  onShowAttendance
}: PracticeDetailsProps) {
  const { supabase } = useAuth()
  const [practice, setPractice] = useState<PracticeWithFormattedLogs | null>(null)
  const [practiceImages, setPracticeImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePracticeData, setSharePracticeData] = useState<PracticeShareData | null>(null)
  const [showTemplateSelect, setShowTemplateSelect] = useState(false)

  useEffect(() => {
    const loadPractice = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('practices')
          .select(`
            *,
            practice_logs (
              *,
              practice_times (*),
              practice_log_tags (
                practice_tag:practice_tags (*)
              )
            )
          `)
          .eq('id', practiceId)
          .single()

        if (error) throw error
        if (!data) throw new Error('Practice data not found')

        // データ整形
        type PracticeLogFromDB = {
          id: string
          practice_id: string
          style: string
          swim_category?: 'Swim' | 'Pull' | 'Kick'
          rep_count: number
          set_count: number
          distance: number
          circle: number | null
          note: string | null
          practice_log_tags?: Array<{ practice_tag: PracticeTag }>
          practice_times?: PracticeTime[]
          created_at?: string
          updated_at?: string
        }
        type PracticeFromDB = Practice & {
          practice_logs?: PracticeLogFromDB[]
          image_paths?: string[]
        }
        const practiceData = data as PracticeFromDB
        const formattedPractice: PracticeWithFormattedLogs = {
          ...practiceData,
          practiceLogs: (practiceData.practice_logs || []).map((log: PracticeLogFromDB): FormattedPracticeLog => ({
            id: log.id,
            practiceId: log.practice_id,
            style: log.style,
            swim_category: log.swim_category,
            repCount: log.rep_count,
            setCount: log.set_count,
            distance: log.distance,
            circle: log.circle,
            note: log.note,
            tags: log.practice_log_tags?.map((plt: { practice_tag: PracticeTag }) => plt.practice_tag) || [],
            times: log.practice_times?.map((time: PracticeTime) => ({
              id: time.id,
              time: time.time,
              repNumber: time.rep_number,
              setNumber: time.set_number
            })) || [],
            created_at: log.created_at,
            updated_at: log.updated_at
          }))
        }

        // 画像データを変換
        const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
        const imagePaths = practiceData.image_paths || []
        const images: GalleryImage[] = imagePaths.map((path: string, index: number) => {
          const imageUrl = r2PublicUrl
            ? `${r2PublicUrl}/practice-images/${path}`
            : supabase.storage.from('practice-images').getPublicUrl(path).data.publicUrl
          return {
            id: path,
            thumbnailUrl: imageUrl,
            originalUrl: imageUrl,
            fileName: path.split('/').pop() || `image-${index + 1}`
          }
        })

        setPractice(formattedPractice)
        setPracticeImages(images)
      } catch (err) {
        console.error('練習詳細の取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadPractice()
  }, [practiceId, supabase, practiceLogUpdateKey])

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">練習詳細を読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">練習詳細の取得に失敗しました</div>
    )
  }
  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || []

  return (
    <div className="mt-3">
      <div className="bg-green-50 rounded-xl p-3" data-testid="practice-detail-modal">
        {/* Practice全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div
              className="flex items-center gap-2 mb-2"
              data-testid="practice-log-summary"
            >
              <span className={`text-lg font-semibold px-3 py-1 rounded-lg flex items-center gap-2 ${
                isTeamPractice
                  ? 'text-emerald-800 bg-emerald-200'
                  : 'text-green-800 bg-green-200'
              }`}>
                <BoltIcon className="h-5 w-5" />
                練習記録
                {isTeamPractice && teamName && <span className="text-sm">({teamName})</span>}
              </span>
              {isTeamPractice && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            {place && (
              <p className="text-sm text-gray-700 mb-2 flex items-center gap-1">
                <span className="text-gray-500">📍</span>
                {place}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={() => onEdit?.(practiceImages)}
              className="p-2 text-gray-500 hover:text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              title="練習記録を編集"
              data-testid="edit-practice-button"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="練習記録を削除"
              data-testid="delete-practice-button"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Practice_logsのコンテナ */}
        <div className="space-y-3">
          {/* PracticeLogsがない場合 */}
          {practiceLogs.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-500 mb-4">練習メニューを追加してください</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowTemplateSelect(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-blue-300 rounded-lg shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  data-testid="add-from-template-button"
                >
                  <ClipboardDocumentListIcon className="h-5 w-5" />
                  テンプレートから
                </button>
                <button
                  onClick={() => onAddPracticeLog?.(practiceId)}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-green-300 rounded-lg shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                  data-testid="add-new-button"
                >
                  <PencilIcon className="h-5 w-5" />
                  新規
                </button>
              </div>
            </div>
          )}

          {/* PracticeLogsがある場合の表示 */}
          {practiceLogs.map((log, index: number) => {
            const formattedLog = log
            const allTimes = formattedLog.times || []

            return (
              <div
                key={formattedLog.id}
                className="bg-green-50 rounded-lg p-4"
                data-testid={`practice-log-item-${index + 1}`}
              >
                {/* 練習メニューのヘッダー */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {formattedLog.tags && Array.isArray(formattedLog.tags) && formattedLog.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formattedLog.tags.map((tag: PracticeTag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                            style={{
                              backgroundColor: tag.color,
                              color: getTextColor(tag.color)
                            }}
                            data-testid={`selected-tag-${tag.id}`}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 練習内容 */}
                <div className="bg-white rounded-lg p-3 mb-3 border border-green-300 relative">
                  {/* シェア・編集・削除ボタン（右上） */}
                  <div className="absolute top-3 right-3 flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const menuItems: PracticeMenuItem[] = practiceLogs.map(log => ({
                          style: log.style,
                          category: log.swim_category || 'Swim',
                          distance: log.distance,
                          repCount: log.repCount,
                          setCount: log.setCount,
                          circle: log.circle ?? undefined,
                          times: log.times?.map(t => ({
                            setNumber: t.setNumber,
                            repNumber: t.repNumber,
                            time: t.time
                          })),
                          note: log.note ?? undefined
                        }))

                        const totalDistance = practiceLogs.reduce((sum, log) =>
                          sum + (log.distance * log.repCount * log.setCount), 0)

                        const totalSets = practiceLogs.reduce((sum, log) =>
                          sum + (log.setCount || 0), 0)

                        const parsedDate = practice.date ? parseISO(practice.date) : null
                        const formattedDate = parsedDate && isValid(parsedDate)
                          ? format(parsedDate, 'yyyy年M月d日（E）', { locale: ja })
                          : ''

                        setSharePracticeData({
                          date: formattedDate,
                          title: practice.note || '練習',
                          place: place ?? undefined,
                          menuItems,
                          totalDistance,
                          totalSets,
                          userName: '',
                          teamName: teamName
                        })
                        setShowShareModal(true)
                      }}
                      className="p-2 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                      title="練習をシェア"
                      data-testid="share-practice-log-button"
                    >
                      <ShareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        const styleValue = formattedLog.style
                        const styleCode = SWIM_STYLES.find(s => s.label === styleValue)?.value ||
                                         SWIM_STYLES.find(s => s.value === styleValue)?.value ||
                                         styleValue || 'Fr'

                        const formData = {
                          id: formattedLog.id,
                          user_id: practice.user_id,
                          practice_id: formattedLog.practiceId,
                          style: styleCode,
                          swim_category: formattedLog.swim_category || 'Swim',
                          rep_count: formattedLog.repCount,
                          set_count: formattedLog.setCount,
                          distance: formattedLog.distance,
                          circle: formattedLog.circle,
                          note: formattedLog.note,
                          tags: formattedLog.tags || [],
                          times: [{
                            memberId: '',
                            times: formattedLog.times || []
                          }],
                          created_at: formattedLog.created_at,
                          updated_at: formattedLog.updated_at
                        } as unknown as PracticeLogWithTimes & { tags?: PracticeTag[] }
                        onEditPracticeLog?.(formData)
                      }}
                      className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      title="練習メニューを編集"
                      data-testid="edit-practice-log-button"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDeletePracticeLog?.(formattedLog.id)}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="練習メニューを削除"
                      data-testid="delete-practice-log-button"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs font-medium text-gray-500 mb-1">練習内容</div>
                  <div className="text-sm text-gray-800">
                    <span className="text-lg font-semibold text-green-700">{formattedLog.distance}</span>m ×{' '}
                    <span className="text-lg font-semibold text-green-700">{formattedLog.repCount}</span>
                    {formattedLog.setCount > 1 && (
                      <>
                        {' × '}
                        <span className="text-lg font-semibold text-green-700">{formattedLog.setCount}</span>
                      </>
                    )}
                    {'　　'}
                    <span className="text-lg font-semibold text-green-700">
                      {formattedLog.circle ? `${Math.floor(formattedLog.circle / 60)}'${Math.floor(formattedLog.circle % 60).toString().padStart(2, '0')}"` : '-'}
                    </span>
                    {'　'}
                    <span className="text-lg font-semibold text-green-700">{getStyleLabel(formattedLog.style)}</span>
                    {formattedLog.swim_category && formattedLog.swim_category !== 'Swim' && (
                      <>
                        {'　'}
                        <span className="text-lg font-semibold text-green-700">
                          {formattedLog.swim_category}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* タイム表示 */}
                {allTimes.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1 h-4 bg-green-500 rounded-full"></div>
                      <p className="text-sm font-medium text-green-700">タイム</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-300 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-green-300">
                            <th className="text-left py-2 px-2 font-medium text-green-800"></th>
                            {Array.from({ length: formattedLog.setCount }, (_, setIndex) => (
                              <th key={setIndex + 1} className="text-center py-2 px-2 font-medium text-green-800">
                                {setIndex + 1}セット目
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: formattedLog.repCount }, (_, repIndex) => {
                            const repNumber = repIndex + 1
                            return (
                              <tr key={repNumber} className="border-b border-green-100">
                                <td className="py-2 px-2 font-medium text-gray-700">{repNumber}本目</td>
                                {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                                  const setNumber = setIndex + 1
                                  const time = allTimes.find((t) => t.setNumber === setNumber && t.repNumber === repNumber)
                                  const setTimes = allTimes.filter((t) => t.setNumber === setNumber && t.time > 0)
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
                          <tr className="border-b border-green-100 bg-green-50">
                            <td className="py-2 px-2 font-medium text-green-800">セット平均</td>
                            {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                              const setNumber = setIndex + 1
                              const setTimes = allTimes.filter((t) => t.setNumber === setNumber && t.time > 0)
                              const average = setTimes.length > 0
                                ? setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
                                : 0
                              return (
                                <td key={setNumber} className="py-2 px-2 text-center">
                                  <span className="text-green-800 font-medium">
                                    {average > 0 ? formatTime(average) : '-'}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                          {/* 全体平均行 */}
                          <tr className="border-t-2 border-green-300 bg-blue-50">
                            <td className="py-2 px-2 font-medium text-blue-800">全体平均</td>
                            <td className="py-2 px-2 text-center" colSpan={formattedLog.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0)
                                  const overallAverage = allValidTimes.length > 0
                                    ? allValidTimes.reduce((sum, t) => sum + t.time, 0) / allValidTimes.length
                                    : 0
                                  return overallAverage > 0 ? formatTime(overallAverage) : '-'
                                })()}
                              </span>
                            </td>
                          </tr>
                          {/* 全体最速行 */}
                          <tr className="bg-blue-50">
                            <td className="py-2 px-2 font-medium text-blue-800">全体最速</td>
                            <td className="py-2 px-2 text-center" colSpan={formattedLog.setCount}>
                              <span className="text-blue-800 font-bold">
                                {(() => {
                                  const allValidTimes = allTimes.filter((t) => t.time > 0)
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

                {/* メモ */}
                {formattedLog.note && (
                  <div className="rounded-lg p-3 mb-1 border border-slate-200">
                    <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                    <div className="text-sm text-gray-700">
                      {formattedLog.note}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 添付画像 */}
        {practiceImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <ImageGallery images={practiceImages} />
          </div>
        )}
      </div>

      {/* シェアカードモーダル */}
      {showShareModal && sharePracticeData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setSharePracticeData(null)
          }}
          type="practice"
          data={sharePracticeData}
        />
      )}

      {/* テンプレート選択モーダル */}
      <PracticeLogTemplateSelectModal
        isOpen={showTemplateSelect}
        onClose={() => setShowTemplateSelect(false)}
        onSelect={(template) => {
          onAddPracticeLogFromTemplate?.(practiceId, template)
        }}
      />
    </div>
  )
}
