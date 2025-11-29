// =============================================================================
// ダッシュボードハンドラー関数用カスタムフック
// =============================================================================

import type { Database } from '@/lib/supabase'
import type {
  EditingData,
  EntryFormData,
  EntryWithStyle,
  PracticeMenuFormData,
  RecordFormDataInternal
} from '@/stores/types'
import { EntryAPI } from '@apps/shared/api'
import type { Style } from '@apps/shared/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback } from 'react'
import { getCompetitionId, getRecordCompetitionId } from '../_utils/dashboardHelpers'

interface UseDashboardHandlersProps {
  supabase: SupabaseClient<Database>
  user: { id: string } | null
  styles: Style[]
  // Practice hooks（実際の型に合わせる）
  createPractice: (practice: Omit<import('@apps/shared/types/database').PracticeInsert, 'user_id'>) => Promise<import('@apps/shared/types/database').Practice>
  updatePractice: (id: string, updates: import('@apps/shared/types/database').PracticeUpdate) => Promise<import('@apps/shared/types/database').Practice>
  createPracticeLog: (log: Omit<import('@apps/shared/types/database').PracticeLogInsert, 'user_id'>) => Promise<import('@apps/shared/types/database').PracticeLog>
  updatePracticeLog: (id: string, updates: import('@apps/shared/types/database').PracticeLogUpdate) => Promise<import('@apps/shared/types/database').PracticeLog>
  createPracticeTime: (time: import('@apps/shared/types/database').PracticeTimeInsert) => Promise<import('@apps/shared/types/database').PracticeTime>
  deletePracticeTime: (id: string) => Promise<void>
  // Record hooks（実際の型に合わせる）
  createRecord: (record: Omit<import('@apps/shared/types/database').RecordInsert, 'user_id'>) => Promise<import('@apps/shared/types/database').Record>
  updateRecord: (id: string, updates: import('@apps/shared/types/database').RecordUpdate) => Promise<import('@apps/shared/types/database').Record>
  createCompetition: (competition: Omit<import('@apps/shared/types/database').CompetitionInsert, 'user_id'>) => Promise<import('@apps/shared/types/database').Competition>
  updateCompetition: (id: string, updates: import('@apps/shared/types/database').CompetitionUpdate) => Promise<import('@apps/shared/types/database').Competition>
  createSplitTimes: (params: { recordId: string; splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }> }) => Promise<import('@apps/shared/types/database').SplitTime[]>
  replaceSplitTimes: (params: { recordId: string; splitTimes: Omit<import('@apps/shared/types/database').SplitTimeInsert, 'record_id'>[] }) => Promise<import('@apps/shared/types/database').SplitTime[]>
  // Form store actions
  editingData: EditingData | null
  createdPracticeId: string | null
  competitionEditingData: EditingData | null
  createdCompetitionId: string | null
  setLoading: (loading: boolean) => void
  closePracticeBasicForm: () => void
  closePracticeLogForm: () => void
  closeCompetitionBasicForm: () => void
  closeEntryLogForm: () => void
  closeRecordLogForm: () => void
  openPracticeLogForm: (practiceId?: string, editData?: EditingData) => void
  setCreatedEntries: (entries: EntryWithStyle[]) => void
  openEntryLogForm: (competitionId: string) => void
  openRecordLogForm: (competitionId: string | undefined, entries?: EntryWithStyle[], editData?: EditingData) => void
  refreshCalendar: () => void
}

/**
 * ダッシュボードのハンドラー関数を提供するカスタムフック
 */
export function useDashboardHandlers({
  supabase,
  user,
  styles,
  createPractice,
  updatePractice,
  createPracticeLog,
  updatePracticeLog,
  createPracticeTime,
  deletePracticeTime,
  createRecord,
  updateRecord,
  createCompetition,
  updateCompetition,
  createSplitTimes,
  replaceSplitTimes,
  editingData,
  createdPracticeId,
  competitionEditingData,
  createdCompetitionId,
  setLoading,
  closePracticeBasicForm,
  closePracticeLogForm,
  closeCompetitionBasicForm,
  closeEntryLogForm,
  closeRecordLogForm,
  openPracticeLogForm,
  setCreatedEntries,
    openEntryLogForm,
    openRecordLogForm,
    refreshCalendar
}: UseDashboardHandlersProps) {
  // 練習予定作成・更新
  const handlePracticeBasicSubmit = useCallback(async (basicData: { date: string; place: string; note: string }) => {
    setLoading(true)
    try {
      // 有効なPracticeInsert/Updateフィールドのみを送信
      const payload = {
        date: basicData.date,
        place: basicData.place || null,
        note: basicData.note || null
      }
      
      if (editingData && editingData.id) {
        await updatePractice(editingData.id, payload)
        closePracticeBasicForm()
      } else {
        const createdPractice = await createPractice(payload)
        closePracticeBasicForm()
        openPracticeLogForm(createdPractice?.id)
      }
      
      refreshCalendar()
    } catch (error) {
      console.error('練習予定の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [editingData, updatePractice, createPractice, closePracticeBasicForm, openPracticeLogForm, refreshCalendar, setLoading])

  // 練習メニュー作成・更新処理
  const handlePracticeLogSubmit = useCallback(async (formDataArray: PracticeMenuFormData[]) => {
    if (!user || !user.id) {
      throw new Error('認証されたユーザーが必要です')
    }
    
    setLoading(true)
    try {
      const menus = Array.isArray(formDataArray) ? formDataArray : []

      if (editingData) {
        const menu = menus[0]
        const logInput = {
          style: menu.style || 'fr',
          rep_count: Number(menu.reps) || 1,
          set_count: Number(menu.sets) || 1,
          distance: Number(menu.distance) || 100,
          circle: menu.circleTime || null,
          note: menu.note || ''
        }
        
        if (!editingData.id) throw new Error('Editing data ID is required')
        const practiceLogId = editingData.id
        await updatePracticeLog(practiceLogId, logInput)
        
        await supabase
          .from('practice_log_tags')
          .delete()
          .eq('practice_log_id', practiceLogId)
        
        if (menu.tags && menu.tags.length > 0) {
          for (const tag of menu.tags) {
            const insertData: Database['public']['Tables']['practice_log_tags']['Insert'] = {
              practice_log_id: practiceLogId,
              practice_tag_id: tag.id
            }
            // Supabaseの型推論が正しく機能しないため、型アサーションを使用
            const queryBuilder = supabase.from('practice_log_tags') as unknown as {
              insert: (values: Database['public']['Tables']['practice_log_tags']['Insert']) => Promise<{ error: { message: string } | null }>
            }
            const { error } = await queryBuilder.insert(insertData)
            
            if (error) {
              console.error('練習ログタグの挿入に失敗しました:', error)
              throw new Error(`練習ログタグの挿入に失敗しました: ${error.message}`)
            }
          }
        }
        
        const { data: existingTimes } = await supabase
          .from('practice_times')
          .select('id')
          .eq('practice_log_id', practiceLogId)
        
        if (existingTimes && existingTimes.length > 0) {
          for (const time of existingTimes as Array<{ id: string }>) {
            await deletePracticeTime(time.id)
          }
        }
        
        if (menu.times && menu.times.length > 0) {
          for (const timeEntry of menu.times) {
            if (timeEntry.time > 0) {
              await createPracticeTime({
                user_id: user.id,
                practice_log_id: practiceLogId,
                set_number: timeEntry.setNumber,
                rep_number: timeEntry.repNumber,
                time: timeEntry.time
              } as import('@apps/shared/types/database').PracticeTimeInsert)
            }
          }
        }
      } else {
        if (!createdPracticeId) {
          throw new Error('Practice ID が見つかりません')
        }

        for (const menu of menus) {
          const logInput = {
            practice_id: createdPracticeId,
            style: menu.style || 'fr',
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
            distance: Number(menu.distance) || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          const createdLog = await createPracticeLog(logInput)
          
          if (menu.tags && menu.tags.length > 0 && createdLog) {
            for (const tag of menu.tags) {
              const insertData: Database['public']['Tables']['practice_log_tags']['Insert'] = {
                practice_log_id: createdLog.id,
                practice_tag_id: tag.id
              }
              // Supabaseの型推論が正しく機能しないため、型アサーションを使用
              const queryBuilder = supabase.from('practice_log_tags') as unknown as {
                insert: (values: Database['public']['Tables']['practice_log_tags']['Insert']) => Promise<{ error: { message: string } | null }>
              }
              const { error } = await queryBuilder.insert(insertData)
              
              if (error) {
                console.error('練習ログタグの挿入に失敗しました:', error)
                throw new Error(`練習ログタグの挿入に失敗しました: ${error.message}`)
              }
            }
          }
          
          if (menu.times && menu.times.length > 0 && createdLog) {
            for (const timeEntry of menu.times) {
              if (timeEntry.time > 0) {
                await createPracticeTime({
                  user_id: user.id,
                  practice_log_id: createdLog.id,
                  set_number: timeEntry.setNumber,
                  rep_number: timeEntry.repNumber,
                  time: timeEntry.time
                })
              }
            }
          }
        }
      }

      closePracticeLogForm()
      refreshCalendar()
    } catch (error) {
      console.error('練習記録の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [editingData, createdPracticeId, supabase, user, updatePracticeLog, createPracticeLog, deletePracticeTime, createPracticeTime, refreshCalendar, setLoading, closePracticeLogForm])

  // アイテム削除ハンドラー
  const handleDeleteItem = useCallback(async (itemId: string, itemType?: 'practice' | 'team_practice' | 'practice_log' | 'competition' | 'team_competition' | 'entry' | 'record') => {
    if (!itemType) {
      console.error('アイテムタイプが不明です')
      return
    }

    try {
      if (itemType === 'practice' || itemType === 'team_practice') {
        const { error } = await supabase
          .from('practices')
          .delete()
          .eq('id', itemId)
        if (error) throw error
      } else if (itemType === 'practice_log') {
        const { error } = await supabase
          .from('practice_logs')
          .delete()
          .eq('id', itemId)
        if (error) throw error
      } else if (itemType === 'entry') {
        const { error } = await supabase
          .from('entries')
          .delete()
          .eq('id', itemId)
        if (error) throw error
      } else if (itemType === 'record') {
        const { error } = await supabase
          .from('records')
          .delete()
          .eq('id', itemId)
        if (error) throw error
      } else if (itemType === 'competition' || itemType === 'team_competition') {
        const { error } = await supabase
          .from('competitions')
          .delete()
          .eq('id', itemId)
        if (error) throw error
      }

      refreshCalendar()
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
    }
  }, [supabase, refreshCalendar])

  // 大会情報作成・更新
  const handleCompetitionBasicSubmit = useCallback(async (basicData: { date: string; endDate: string; title: string; place: string; poolType: number; note: string }) => {
    setLoading(true)
    try {
      // 終了日は空文字の場合はnullに変換
      const endDate = basicData.endDate ? basicData.endDate : null
      
      if (competitionEditingData && competitionEditingData.id) {
        await updateCompetition(competitionEditingData.id, {
          date: basicData.date,
          end_date: endDate,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        closeCompetitionBasicForm()
        refreshCalendar()
      } else {
        const newCompetition = await createCompetition({
          date: basicData.date,
          end_date: endDate,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        refreshCalendar()
        closeCompetitionBasicForm()
        openEntryLogForm(newCompetition.id)
      }
    } catch (error) {
      console.error('大会情報の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [competitionEditingData, updateCompetition, createCompetition, closeCompetitionBasicForm, refreshCalendar, openEntryLogForm, setLoading])

  // エントリー登録
  const handleEntrySubmit = useCallback(async (entriesData: EntryFormData[]) => {
    if (!user || !user.id) {
      throw new Error('認証されたユーザーが必要です')
    }
    
    setLoading(true)
    try {
      const competitionId = getCompetitionId(createdCompetitionId, competitionEditingData)
      
      if (!competitionId) {
        throw new Error('Competition ID が見つかりません')
      }

      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList: EntryWithStyle[] = []

      for (const entryData of entriesData) {
        let entry
        if (entryData.id && competitionEditingData?.type === 'entry') {
          entry = await entryAPI.updateEntry(entryData.id, {
            style_id: parseInt(entryData.styleId),
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note || null
          })
        } else {
          const existingEntry = await entryAPI.checkExistingEntry(
            competitionId,
            user.id,
            parseInt(entryData.styleId)
          )

          if (existingEntry) {
            entry = await entryAPI.updateEntry(existingEntry.id, {
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null
            })
          } else {
            entry = await entryAPI.createPersonalEntry({
              competition_id: competitionId,
              style_id: parseInt(entryData.styleId),
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null
            })
          }
        }
        
        const styleId = parseInt(String(entryData.styleId))
        const style = styles.find(s => s.id === styleId)
        if (!style) {
          const entryId = entry?.id || 'unknown'
          throw new Error(`Style not found for entry ${entryId}: styleId=${styleId}`)
        }
        if (entry) {
          createdEntriesList.push({
            id: entry.id,
            competitionId: entry.competition_id,
            userId: entry.user_id,
            styleId: entry.style_id,
            entryTime: entry.entry_time,
            note: entry.note,
            teamId: entry.team_id,
            styleName: style.name_jp
          })
        }
      }

      refreshCalendar()

      setCreatedEntries(createdEntriesList)
      closeEntryLogForm()
      
      if (competitionEditingData?.type !== 'entry' && createdEntriesList.length > 0) {
        openRecordLogForm(createdCompetitionId || undefined, createdEntriesList)
      }
    } catch (error) {
      console.error('エントリーの登録に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [createdCompetitionId, competitionEditingData, supabase, user, styles, setCreatedEntries, closeEntryLogForm, refreshCalendar, openRecordLogForm, setLoading])

  // エントリーをスキップ
  const handleEntrySkip = useCallback(() => {
    if (!createdCompetitionId) {
      console.error('大会IDが取得できませんでした。エントリーを先に登録してください。')
      return
    }
    closeEntryLogForm()
    openRecordLogForm(createdCompetitionId, [])
  }, [createdCompetitionId, closeEntryLogForm, openRecordLogForm])

  // 記録登録・更新
  const handleRecordLogSubmit = useCallback(async (formDataList: RecordFormDataInternal[]) => {
    const dataArray = Array.isArray(formDataList) ? formDataList : [formDataList]
    setLoading(true)
    try {
      const competitionId = getRecordCompetitionId(createdCompetitionId, competitionEditingData)

      if (competitionEditingData && competitionEditingData.id) {
        const formData = dataArray[0]
        const updates: import('@apps/shared/types/database').RecordUpdate = {
          style_id: parseInt(formData.styleId),
          time: formData.time,
          video_url: formData.videoUrl || null,
          note: formData.note || null,
          is_relaying: formData.isRelaying || false
        }

        await updateRecord(competitionEditingData.id, updates)

        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes.map((st) => ({
            distance: st.distance,
            split_time: st.splitTime
          }))
          await replaceSplitTimes({
            recordId: competitionEditingData.id,
            splitTimes: splitTimesData as Omit<import('@apps/shared/types/database').SplitTimeInsert, 'record_id'>[]
          })
        }
      } else {
        if (!competitionId) {
          throw new Error('Competition ID が見つかりません')
        }

        for (const formData of dataArray) {
          const recordForCreate: Omit<import('@apps/shared/types/database').RecordInsert, 'user_id'> = {
            style_id: parseInt(formData.styleId),
            time: formData.time,
            video_url: formData.videoUrl || null,
            note: formData.note || null,
            is_relaying: formData.isRelaying || false,
            competition_id: competitionId
          }

          const newRecord = await createRecord(recordForCreate)

          if (formData.splitTimes && formData.splitTimes.length > 0) {
            const splitTimesData = formData.splitTimes.map((st) => ({
              distance: st.distance,
              split_time: st.splitTime
            }))
          await createSplitTimes({
            recordId: newRecord.id,
            splitTimes: splitTimesData as Array<{ distance: number; split_time?: number; splitTime?: number }>
          })
          }
        }
      }

      refreshCalendar()
    } catch (error) {
      console.error('記録の処理に失敗しました:', error)
    } finally {
      setLoading(false)
      closeRecordLogForm()
    }
  }, [createdCompetitionId, competitionEditingData, updateRecord, createRecord, replaceSplitTimes, createSplitTimes, refreshCalendar, setLoading, closeRecordLogForm])

  return {
    handlePracticeBasicSubmit,
    handlePracticeLogSubmit,
    handleDeleteItem,
    handleCompetitionBasicSubmit,
    handleEntrySubmit,
    handleEntrySkip,
    handleRecordLogSubmit
  }
}

