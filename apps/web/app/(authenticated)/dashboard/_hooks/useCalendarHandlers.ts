// =============================================================================
// カレンダーイベントハンドラー用カスタムフック
// =============================================================================

import type { EditingData, EntryWithStyle } from '@/stores/types'
import type { CalendarItemType, PracticeLogWithTimes, PracticeTag, PracticeImage, CompetitionImage } from '@apps/shared/types'
import type { CalendarItem, EntryInfo, TimeEntry } from '@apps/shared/types/ui'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types'
import { parseISO, startOfDay } from 'date-fns'
import { useCallback } from 'react'

type PracticeImageRow = PracticeImage
type CompetitionImageRow = CompetitionImage

// スプリットタイム型（編集時に使用）
export interface RecordSplitTime {
  distance: number
  split_time: number
}

// 記録型（編集時に使用）
export interface RecordForEdit {
  id: string
  style_id: number
  style?: { id: number }
  time?: number
  time_result?: number
  is_relaying?: boolean
  note?: string | null
  video_url?: string | null
  reaction_time?: number | null
  split_times?: RecordSplitTime[]
  competition_id?: string | null
}

interface UseCalendarHandlersProps {
  supabase: SupabaseClient<Database>
  // Form store actions
  openPracticeBasicForm: (date?: Date, item?: CalendarItem) => void
  openPracticeLogForm: (practiceId?: string, editData?: EditingData) => void
  openCompetitionBasicForm: (date?: Date, item?: CalendarItem) => void
  openEntryLogForm: (competitionId?: string, editData?: EditingData) => void
  openRecordLogForm: (competitionId: string | undefined, entries?: EntryWithStyle[], editData?: EditingData) => void
  setSelectedDate: (date: Date) => void
  setEditingData: (data: EditingData | null) => void
  handleDeleteItem: (itemId: string, itemType?: CalendarItemType) => Promise<void>
  refreshCalendar: () => void
}

/**
 * カレンダーのイベントハンドラーを提供するカスタムフック
 */
export function useCalendarHandlers({
  supabase,
  openPracticeBasicForm,
  openPracticeLogForm,
  openCompetitionBasicForm,
  openEntryLogForm,
  openRecordLogForm,
  setSelectedDate,
  setEditingData,
  handleDeleteItem,
  refreshCalendar
}: UseCalendarHandlersProps) {
  // タイムゾーンを考慮した日付パース
  const parseDateString = useCallback((dateString: string): Date => {
    const parsedDate = parseISO(dateString)
    return startOfDay(parsedDate)
  }, [])

  // 日付クリックハンドラー（現在は未使用）
  const onDateClick = useCallback((_date: Date) => {
    // 必要に応じて実装
  }, [])

  // アイテム追加ハンドラー（CalendarPropsでは'practice' | 'record'のみ受け取る）
  const onAddItem = useCallback((date: Date, type: 'practice' | 'record') => {
    if (type === 'practice') {
      openPracticeBasicForm(date)
    } else {
      setSelectedDate(date)
      setEditingData(null)
      openCompetitionBasicForm(date)
    }
  }, [openPracticeBasicForm, openCompetitionBasicForm, setSelectedDate, setEditingData])

  // アイテム編集ハンドラー
  const onEditItem = useCallback(async (item: CalendarItem) => {
    const dateObj = parseDateString(item.date)
    
    if (item.type === 'practice' || item.type === 'team_practice') {
      // 練習編集時は画像情報を取得
      let itemWithImages = item
      if (item.id) {
        try {
          // NOTE: Supabaseの型推論が環境によってneverになることがあるため、Row型を明示して受け取る
          const { data: images } = (await supabase
            .from('practice_images')
            // NOTE: PostgRESTのselect型推論が崩れてneverになるケースがあるため、ここでは '*' を使用する
            .select('*')
            .eq('practice_id', item.id)
            .order('display_order')) as unknown as { data: PracticeImageRow[] | null }
          
          if (images && images.length > 0) {
            const formattedImages = images.map((img) => ({
              id: img.id,
              thumbnailUrl: supabase.storage.from('practice-images').getPublicUrl(img.thumbnail_path).data.publicUrl,
              originalUrl: supabase.storage.from('practice-images').getPublicUrl(img.original_path).data.publicUrl,
              fileName: img.file_name
            }))
            
            // itemに画像情報を追加
            itemWithImages = {
              ...item,
              editData: {
                ...(item.editData || {}),
                images: formattedImages
              }
            }
          }
        } catch (error) {
          console.error('画像情報の取得エラー:', error)
        }
      }
      openPracticeBasicForm(dateObj, itemWithImages)
    } else if (item.type === 'practice_log') {
      openPracticeLogForm(undefined, item)
    } else if (item.type === 'entry') {
      // editDataからcompetitionIdを取得（DayDetailModalから渡される場合）
      let competitionId: string | undefined
      let editData: EditingData | undefined
      let isTeamCompetition = false
      
      if (item.editData && typeof item.editData === 'object') {
        // editDataが存在する場合、そこからcompetitionIdを取得
        if ('competitionId' in item.editData) {
          competitionId = item.editData.competitionId as string
        }
        // editDataをEditingDataとして使用
        editData = item.editData as EditingData
        // competitionオブジェクトからteam_idを取得
        if ('competition' in item.editData && item.editData.competition) {
          const competition = item.editData.competition as { team_id?: string | null }
          isTeamCompetition = !!competition.team_id
        }
      }
      
      // フォールバック: metadataから取得
      if (!competitionId) {
        competitionId = item.metadata?.entry?.competition_id || item.metadata?.competition?.id
      }
      
      // チームcompetitionかどうかを判定
      if (!isTeamCompetition) {
        isTeamCompetition = !!item.metadata?.team_id
      }
      
      if (competitionId) {
        // チームcompetitionの場合、entry_statusをチェック
        if (isTeamCompetition) {
          // entry_statusを取得してチェック
          try {
            const { data: competitionData, error: competitionError } = await supabase
              .from('competitions')
              .select('entry_status')
              .eq('id', competitionId)
              .single()

            if (!competitionError && competitionData) {
              const status = (competitionData as { entry_status?: string | null }).entry_status || 'before'
              if (status !== 'open') {
                // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
                const statusLabel = status === 'before' ? '受付前' : '受付終了'
                window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)
                
                // record入力モーダルに遷移
                if (editData && 'entryDataList' in editData && editData.entryDataList) {
                  openRecordLogForm(competitionId, undefined, { entryDataList: editData.entryDataList })
                } else {
                  openRecordLogForm(competitionId)
                }
                return
              }
            }
            // entry_statusが'open'の場合は通常通りエントリー登録フォームを開く
            openEntryLogForm(competitionId, editData)
          } catch (err: unknown) {
            console.error('エントリーステータスの取得エラー:', err)
            // エラー時は通常通りエントリー登録フォームを開く
            openEntryLogForm(competitionId, editData)
          }
        } else {
          // 個人competitionの場合は通常通りエントリー登録フォームを開く
          openEntryLogForm(competitionId, editData)
        }
      }
    } else if (item.type === 'competition' || item.type === 'team_competition') {
      // 大会編集時は画像情報を取得
      let itemWithImages = item
      if (item.id) {
        try {
          // NOTE: Supabaseの型推論が環境によってneverになることがあるため、Row型を明示して受け取る
          const { data: images } = (await supabase
            .from('competition_images')
            // NOTE: PostgRESTのselect型推論が崩れてneverになるケースがあるため、ここでは '*' を使用する
            .select('*')
            .eq('competition_id', item.id)
            .order('display_order')) as unknown as { data: CompetitionImageRow[] | null }

          if (images && images.length > 0) {
            const formattedImages = images.map((img) => ({
              id: img.id,
              thumbnailUrl: supabase.storage.from('competition-images').getPublicUrl(img.thumbnail_path).data.publicUrl,
              originalUrl: supabase.storage.from('competition-images').getPublicUrl(img.original_path).data.publicUrl,
              fileName: img.file_name
            }))

            // itemに画像情報を追加
            itemWithImages = {
              ...item,
              editData: {
                ...(item.editData || {}),
                images: formattedImages
              }
            }
          }
        } catch (error) {
          console.error('画像情報の取得エラー:', error)
        }
      }
      openCompetitionBasicForm(dateObj, itemWithImages)
    }
  }, [parseDateString, openPracticeBasicForm, openPracticeLogForm, openEntryLogForm, openCompetitionBasicForm, openRecordLogForm, supabase])

  // アイテム削除ハンドラー（handleDeleteItemを使用）
  const onDeleteItem = useCallback(async (itemId: string, itemType?: CalendarItemType) => {
    await handleDeleteItem(itemId, itemType)
  }, [handleDeleteItem])

  // 練習ログ追加ハンドラー
  const onAddPracticeLog = useCallback((practiceId: string) => {
    openPracticeLogForm(practiceId)
  }, [openPracticeLogForm])

  // 練習ログ編集ハンドラー
  const onEditPracticeLog = useCallback((log: (PracticeLogWithTimes & { tags?: PracticeTag[] }) & {
    practiceId?: string
    times?: Array<{ memberId: string; times: TimeEntry[] }> | TimeEntry[]
  }) => {
    // timesの構造を確認して変換
    let times: Array<{ memberId: string; times: TimeEntry[] }> = []
    if (log.times && Array.isArray(log.times)) {
      // DayDetailModalから渡される形式: [{ memberId: '', times: [...] }]
      if (log.times.length > 0 && 'times' in log.times[0]) {
        times = log.times as Array<{ memberId: string; times: TimeEntry[] }>
      } else {
        // 既存の形式: TimeEntry[]
        times = [{ memberId: '', times: log.times as TimeEntry[] }]
      }
    }
    
    const editData: EditingData = {
      id: log.id,
      practiceId: log.practice_id || log.practiceId,
      style: log.style || 'Fr',
      swim_category: log.swim_category || 'Swim',
      distance: log.distance,
      rep_count: log.rep_count,
      set_count: log.set_count,
      circle: log.circle,
      note: log.note || undefined,
      tags: log.tags,
      times: times
    }
    openPracticeLogForm(undefined, editData)
  }, [openPracticeLogForm])

  // 練習ログ削除ハンドラー
  const onDeletePracticeLog = useCallback(async (logId: string) => {
    try {
      const { error } = await supabase
        .from('practice_logs')
        .delete()
        .eq('id', logId)

      if (error) throw error

      refreshCalendar()
    } catch (error) {
      console.error('練習ログの削除に失敗しました:', error)
    }
  }, [supabase, refreshCalendar])

  // 記録追加ハンドラー
  const onAddRecord = useCallback(async (params: { competitionId?: string; entryData?: EntryInfo; entryDataList?: EntryInfo[] }) => {
    const { competitionId, entryData, entryDataList } = params
    
    if (!competitionId || competitionId.trim() === '') {
      openCompetitionBasicForm()
      return
    }

    if (entryDataList && entryDataList.length > 0) {
      const editData: EditingData = { entryDataList }
      openRecordLogForm(competitionId || undefined, undefined, editData)
      return
    }

    if (entryData) {
      const editData: EditingData = { entryData }
      openRecordLogForm(competitionId || undefined, undefined, editData)
    } else if (competitionId) {
      // 大会情報を取得してチームcompetitionかどうか、日付が過去かどうかをチェック
      try {
        const { data: competitionData, error: competitionError } = await supabase
          .from('competitions')
          .select('entry_status, team_id, date')
          .eq('id', competitionId)
          .single()

        if (!competitionError && competitionData) {
          const isTeamCompetition = !!(competitionData as { team_id?: string | null }).team_id
          const competitionDate = (competitionData as { date?: string | null }).date

          // 日付が今日以前かどうかを判定（parseDateStringを使用してUTCパース問題を回避）
          const isDateTodayOrPast = () => {
            if (!competitionDate) return false
            const compDate = parseDateString(competitionDate)
            const today = startOfDay(new Date())
            return compDate <= today
          }

          // 今日/過去の日付の場合は直接RecordLogFormに遷移（エントリーをスキップ）
          if (isDateTodayOrPast()) {
            openRecordLogForm(competitionId, [])
            return
          }

          // チームcompetitionの場合、entry_statusをチェック
          if (isTeamCompetition) {
            const status = (competitionData as { entry_status?: string | null }).entry_status || 'before'
            if (status !== 'open') {
              // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
              const statusLabel = status === 'before' ? '受付前' : '受付終了'
              window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)

              // record入力モーダルに遷移
              openRecordLogForm(competitionId)
              return
            }
          }
        }
        // entry_statusが'open'または個人competitionの場合は通常通りエントリー登録フォームを開く
        openEntryLogForm(competitionId)
      } catch (err: unknown) {
        console.error('エントリーステータスの取得エラー:', err)
        // エラー時は通常通りエントリー登録フォームを開く
        openEntryLogForm(competitionId)
      }
    }
  }, [openCompetitionBasicForm, openRecordLogForm, openEntryLogForm, supabase])

  // 記録編集ハンドラー
  const onEditRecord = useCallback((record: RecordForEdit) => {
    const splitTimes = record.split_times || []
    const convertedSplitTimes: Array<{ distance: number; splitTime: number }> = splitTimes.map((st: RecordSplitTime) => ({
      distance: st.distance,
      splitTime: st.split_time
    }))
    
    const editData: EditingData = {
      id: record.id,
      styleId: record.style_id ?? record.style?.id,
      time: record.time ?? record.time_result,
      isRelaying: record.is_relaying,
      note: record.note ?? undefined,
      videoUrl: record.video_url ?? undefined,
      reactionTime: record.reaction_time ?? undefined,
      splitTimes: convertedSplitTimes,
      competitionId: record.competition_id ?? undefined
    }
    
    openRecordLogForm(record.competition_id ?? undefined, undefined, editData)
  }, [openRecordLogForm])

  // 記録削除ハンドラー
  const onDeleteRecord = useCallback(async (recordId: string) => {
    try {
      const { error } = await supabase
        .from('records')
        .delete()
        .eq('id', recordId)

      if (error) throw error

      refreshCalendar()
    } catch (error) {
      console.error('大会記録の削除に失敗しました:', error)
    }
  }, [supabase, refreshCalendar])

  return {
    onDateClick,
    onAddItem: onAddItem as (date: Date, type: CalendarItemType) => void, // 型定義ではCalendarItemType全体を受け取るが、実際は'practice' | 'record'のみ
    onEditItem,
    onDeleteItem,
    onAddPracticeLog,
    onEditPracticeLog,
    onDeletePracticeLog,
    onAddRecord,
    onEditRecord,
    onDeleteRecord
  }
}

