'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTimeBest } from '@/utils/formatters'
import { useAuth } from '@/contexts'
import { EntryAPI } from '@swim-hub/shared/api/entries'
import { useRouter } from 'next/navigation'
import ImageGallery, { GalleryImage } from '@/components/ui/ImageGallery'
import type { CompetitionWithEntryProps, CompetitionEntryDisplay } from '../../types'

export function CompetitionWithEntry({
  entryId: _entryId,
  competitionId,
  competitionName,
  place,
  note,
  styleId,
  styleName,
  entryTime,
  isTeamCompetition = false,
  deletedEntryIds,
  onAddRecord,
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onClose
}: CompetitionWithEntryProps) {
  const router = useRouter()
  const { supabase } = useAuth()
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase])
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>([])
  const [entries, setEntries] = useState<CompetitionEntryDisplay[]>(() => {
    if (styleId && styleName) {
      return [
        {
          id: _entryId,
          styleId,
          styleName,
          entryTime,
          note
        }
      ]
    }
    return []
  })
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [entryStatus, setEntryStatus] = useState<'before' | 'open' | 'closed' | null>(null)

  useEffect(() => {
    const fetchEntryData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          setAuthError('認証が必要です。ログインしてください。')
          router.replace('/login')
          return
        }

        // competitionのentry_statusとimage_pathsを取得
        const { data: competitionData, error: competitionError } = await supabase
          .from('competitions')
          .select('entry_status, image_paths')
          .eq('id', competitionId)
          .single()

        if (!competitionError && competitionData) {
          setEntryStatus(competitionData.entry_status || 'before')

          // 画像データを変換
          const imagePaths = (competitionData as { image_paths?: string[] }).image_paths || []
          const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
          const images: GalleryImage[] = imagePaths.map((path: string, index: number) => {
            const imageUrl = r2PublicUrl
              ? `${r2PublicUrl}/competition-images/${path}`
              : supabase.storage.from('competition-images').getPublicUrl(path).data.publicUrl
            return {
              id: path,
              thumbnailUrl: imageUrl,
              originalUrl: imageUrl,
              fileName: path.split('/').pop() || `image-${index + 1}`
            }
          })
          setCompetitionImages(images)
        }

        // EntryAPIを使用してエントリーを取得
        const allEntries = await entryApi.getEntriesByCompetition(competitionId)

        // 現在のユーザーのエントリーのみをフィルタリング
        const userEntries = allEntries.filter(entry => entry.user_id === user.id)

        if (userEntries && userEntries.length > 0) {
          const mapped = userEntries.map((entry) => {
            const style = entry.style
            return {
              id: entry.id,
              styleId: entry.style_id,
              styleName: style?.name_jp || '',
              entryTime: entry.entry_time,
              note: entry.note
            } as CompetitionEntryDisplay
          })
          setEntries(mapped)
        } else if (entries.length === 0 && styleId && styleName) {
          setEntries([
            {
              id: _entryId,
              styleId,
              styleName,
              entryTime,
              note
            }
          ])
        }
      } catch (err) {
        console.error('エントリーデータの取得エラー:', err)
        setCompetitionImages([])
      } finally {
        setLoading(false)
      }
    }

    fetchEntryData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, entryApi, deletedEntryIds?.length])

  const entryInfoList = entries.map((entry) => ({
    styleId: entry.styleId,
    styleName: entry.styleName,
    entryTime: entry.entryTime ?? undefined
  }))

  const handleAddRecordClick = () => {
    if (!onAddRecord) return

    if (entryInfoList.length > 0) {
      onAddRecord({
        competitionId,
        entryDataList: entryInfoList
      })
      onClose?.()
    } else {
      onAddRecord({ competitionId })
    }
  }

  const handleEditEntryClick = async () => {
    if (!onEditEntry) return

    // チームcompetitionの場合、entry_statusをチェック
    if (isTeamCompetition) {
      // entry_statusがまだ取得されていない場合は取得
      if (entryStatus === null) {
        try {
          const { data: competitionData, error: competitionError } = await supabase
            .from('competitions')
            .select('entry_status')
            .eq('id', competitionId)
            .single()

          if (!competitionError && competitionData) {
            const status = competitionData.entry_status || 'before'
            setEntryStatus(status)

            // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
            if (status !== 'open') {
              const statusLabel = status === 'before' ? '受付前' : '受付終了'
              window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)

              // record入力モーダルに遷移
              if (onAddRecord) {
                handleAddRecordClick()
              }
              return
            }
          }
        } catch (err) {
          console.error('エントリーステータスの取得エラー:', err)
        }
      } else if (entryStatus !== 'open') {
        // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
        const statusLabel = entryStatus === 'before' ? '受付前' : '受付終了'
        window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)

        // record入力モーダルに遷移
        if (onAddRecord) {
          handleAddRecordClick()
        }
        return
      }
    }

    if (entries.length === 0) {
      onEditEntry()
      return
    }

    onEditEntry()
  }

  return (
    <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
      {/* 大会情報ヘッダー */}
      <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-gray-900" data-testid="competition-title-display">{competitionName || '大会'}</h5>
            {isTeamCompetition && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                チーム
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onEditCompetition && (
              <button
                onClick={() => onEditCompetition(competitionImages)}
                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title="大会を編集"
                data-testid="edit-competition-button"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
            {onDeleteCompetition && (
              <button
                onClick={onDeleteCompetition}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title="大会を削除"
                data-testid="delete-competition-button"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        {place && (
          <p className="text-sm text-gray-600 mt-1" data-testid="competition-place-display">📍 {place}</p>
        )}
        {authError && (
          <p className="text-sm text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
            {authError}
          </p>
        )}
      </div>

      {/* エントリー情報ボックス */}
      <div className="p-4">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-3" data-testid="entry-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              <h6 className="text-sm font-semibold text-orange-900">エントリー済み（記録未登録）</h6>
            </div>
            <div className="flex items-center gap-1">
              {onEditEntry && (
                <button
                  onClick={handleEditEntryClick}
                  className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  title="エントリーを編集"
                  data-testid="edit-entry-button"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {loading ? (
              <p className="text-gray-500">読み込み中...</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-500">エントリー情報が見つかりません</p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 rounded-md border border-orange-200 bg-white/70 px-3 py-2 shadow-sm"
                  data-testid={`entry-summary-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-orange-900 min-w-[72px]">種目:</span>
                        <span className="text-gray-900 font-medium">{entry.styleName}</span>
                      </div>
                      {entry.entryTime && entry.entryTime > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-orange-900 min-w-[72px]">エントリータイム:</span>
                          <span className="text-gray-900 font-mono font-semibold">
                            {formatTimeBest(entry.entryTime)}
                          </span>
                        </div>
                      )}
                      {entry.note && entry.note.trim().length > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-orange-900 min-w-[72px]">メモ:</span>
                          <span className="text-gray-700">{entry.note}</span>
                        </div>
                      )}
                    </div>
                    {onDeleteEntry && (
                      <button
                        onClick={() => onDeleteEntry(entry.id)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="このエントリーを削除"
                        data-testid={`delete-entry-button-${entry.id}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* メモ */}
        {note && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">
            <p className="font-medium text-gray-700 mb-1">メモ</p>
            <p className="text-gray-600">{note}</p>
          </div>
        )}

        {/* 記録追加ボタン */}
        <button
          onClick={handleAddRecordClick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>大会記録を追加</span>
        </button>

        {/* 添付画像 */}
        {competitionImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ImageGallery images={competitionImages} />
          </div>
        )}
      </div>
    </div>
  )
}
