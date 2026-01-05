// =============================================================================
// ダッシュボードハンドラー関数用カスタムフック
// =============================================================================

import { useCompetitionFormStore, usePracticeFormStore } from '@/stores'
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
import type { Database } from '@swim-hub/shared/types/database'
import { useCallback } from 'react'
import { getCompetitionId, getPracticeId, getRecordCompetitionId } from '../_utils/dashboardHelpers'

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
  const handlePracticeBasicSubmit = useCallback(async (basicData: { date: string; title: string; place: string; note: string }) => {
    setLoading(true)
    try {
      // 有効なPracticeInsert/Updateフィールドのみを送信
      const payload = {
        date: basicData.date,
        title: basicData.title || null,
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
        // ストアから直接最新の値を取得（useCallbackのクロージャー問題を回避）
        const { createdPracticeId: storePracticeId, editingData: storeEditingData } = usePracticeFormStore.getState()
        const practiceId = getPracticeId(storePracticeId, storeEditingData) || getPracticeId(createdPracticeId, editingData)
        if (!practiceId) {
          throw new Error('Practice ID が見つかりません')
        }

        for (const menu of menus) {
          const logInput = {
            practice_id: practiceId,
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
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null
        })
        closeCompetitionBasicForm()
        refreshCalendar()
      } else {
        const newCompetition = await createCompetition({
          date: basicData.date,
          end_date: endDate,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null
        })
        refreshCalendar()
        // openEntryLogFormがisBasicFormOpen: falseをセットするので、closeCompetitionBasicFormは不要
        // closeCompetitionBasicFormを呼ぶとcreatedCompetitionIdがnullにリセットされてしまう
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
      // UUID形式のIDかどうかをチェックする関数
      const isValidUUID = (id: string): boolean => {
        // UUID形式の正規表現: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(id)
      }

      // ストアから直接最新の値を取得（useCallbackのクロージャー問題を回避）
      const { createdCompetitionId: storeCompetitionId, editingData: storeEditingData } = useCompetitionFormStore.getState()
      const competitionId = getCompetitionId(storeCompetitionId, storeEditingData) || getCompetitionId(createdCompetitionId, competitionEditingData)
      
      if (!competitionId) {
        throw new Error('Competition ID が見つかりません')
      }

      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList: EntryWithStyle[] = []

      // competitionのteam_idを取得（チームのcompetitionかどうかを判定）
      const { data: competitionData, error: competitionError } = await supabase
        .from('competitions')
        .select('team_id')
        .eq('id', competitionId)
        .single()
      
      if (competitionError) {
        throw competitionError
      }
      
      type CompetitionWithTeamId = {
        team_id: string | null
      }
      const competition = competitionData as CompetitionWithTeamId | null
      const isTeamCompetition = competition?.team_id !== null && competition?.team_id !== undefined

      // 編集モードの場合、既存のエントリーをすべて取得
      const existingEntriesMap = new Map<string, { id: string; style_id: number }>()
      const existingEntriesByIdMap = new Map<string, { id: string; style_id: number }>()
      if (competitionEditingData?.type === 'entry') {
        // 編集モードの場合、この大会のすべての既存エントリーを取得
        const { data: allExistingEntries } = await supabase
          .from('entries')
          .select('id, style_id')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id)

        if (allExistingEntries) {
          allExistingEntries.forEach((entry: { id: string; style_id: number }) => {
            existingEntriesMap.set(String(entry.style_id), { id: entry.id, style_id: entry.style_id })
            existingEntriesByIdMap.set(entry.id, { id: entry.id, style_id: entry.style_id })
          })
        }
      }

      const processedEntryIds = new Set<string>()

      // フォームに入力されているエントリーを保存/更新
      for (const entryData of entriesData) {
        let entry
        if (entryData.id && competitionEditingData?.type === 'entry' && isValidUUID(entryData.id)) {
          // 既存のエントリーIDがある場合（編集モードで既存エントリーを編集している場合）
          // UUID形式であることを確認（一時的なID 'entry-...' を除外）
          // 種目を変更する場合、重複チェック
          const originalEntry = existingEntriesByIdMap.get(entryData.id)
          const styleIdNum = parseInt(entryData.styleId)
          const isStyleChanged = originalEntry && originalEntry.style_id !== styleIdNum
          
          if (isStyleChanged) {
            // 変更後の種目が既に他のエントリーで使用されていないかチェック
            const existingEntryWithSameStyle = existingEntriesMap.get(String(styleIdNum))
            if (existingEntryWithSameStyle && existingEntryWithSameStyle.id !== entryData.id) {
              const styleName = styles.find(s => s.id === styleIdNum)?.name_jp || '不明'
              throw new Error(`種目「${styleName}」は既にエントリー済みです`)
            }
          }
          
          entry = await entryAPI.updateEntry(entryData.id, {
            style_id: styleIdNum,
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note || null
          })
          processedEntryIds.add(entryData.id)
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
            processedEntryIds.add(existingEntry.id)
          } else {
            // チームのcompetitionの場合はcreateTeamEntryを使用
            if (isTeamCompetition && competition?.team_id) {
              entry = await entryAPI.createTeamEntry(
                competition.team_id,
                user.id,
                {
                  competition_id: competitionId,
                  style_id: parseInt(entryData.styleId),
                  entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
                  note: entryData.note || null
                }
              )
          } else {
            entry = await entryAPI.createPersonalEntry({
              competition_id: competitionId,
              style_id: parseInt(entryData.styleId),
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null
            })
            }
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

      // 編集モードの場合、フォームに存在しない既存エントリーを削除
      if (competitionEditingData?.type === 'entry' && existingEntriesMap.size > 0) {
        for (const existingEntry of existingEntriesMap.values()) {
          if (!processedEntryIds.has(existingEntry.id)) {
            // フォームに存在しない既存エントリーを削除
            await entryAPI.deleteEntry(existingEntry.id)
          }
        }
      }

      refreshCalendar()

      setCreatedEntries(createdEntriesList)
      closeEntryLogForm()
      
      if (competitionEditingData?.type !== 'entry' && createdEntriesList.length > 0) {
        // competitionIdを使う（createdCompetitionIdではなく、getCompetitionIdで取得した値）
        openRecordLogForm(competitionId || undefined, createdEntriesList)
      }
    } catch (error) {
      console.error('エントリーの登録に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [createdCompetitionId, competitionEditingData, supabase, user, styles, setCreatedEntries, closeEntryLogForm, refreshCalendar, openRecordLogForm, setLoading])

  // エントリーをスキップ
  const handleEntrySkip = useCallback(() => {
    // ストアから直接最新の値を取得（useCallbackのクロージャー問題を回避）
    const { createdCompetitionId: storeCompetitionId, editingData: storeEditingData } = useCompetitionFormStore.getState()
    const competitionId = getCompetitionId(storeCompetitionId, storeEditingData) || getCompetitionId(createdCompetitionId, competitionEditingData)
    if (!competitionId) {
      console.error('大会IDが取得できませんでした。エントリーを先に登録してください。')
      return
    }
    closeEntryLogForm()
    openRecordLogForm(competitionId, [])
  }, [createdCompetitionId, competitionEditingData, closeEntryLogForm, openRecordLogForm])

  // 記録登録・更新
  const handleRecordLogSubmit = useCallback(async (formDataList: RecordFormDataInternal[]) => {
    const dataArray = Array.isArray(formDataList) ? formDataList : [formDataList]
    setLoading(true)
    try {
      // ストアから直接最新の値を取得（useCallbackのクロージャー問題を回避）
      const { createdCompetitionId: storeCompetitionId, editingData: storeEditingData } = useCompetitionFormStore.getState()
      const competitionId = getRecordCompetitionId(storeCompetitionId, storeEditingData) || getRecordCompetitionId(createdCompetitionId, competitionEditingData)

      // 編集データもストアから取得（競合を避けるため、引数の値を優先しつつストアの値もフォールバックとして使用）
      const effectiveEditingData = competitionEditingData || storeEditingData

      if (effectiveEditingData && effectiveEditingData.id) {
        const formData = dataArray[0]
        const updates: import('@apps/shared/types/database').RecordUpdate = {
          style_id: parseInt(formData.styleId),
          time: formData.time,
          video_url: formData.videoUrl || null,
          note: formData.note || null,
          is_relaying: formData.isRelaying || false,
          reaction_time: formData.reactionTime && formData.reactionTime.trim() !== '' 
            ? parseFloat(formData.reactionTime) 
            : null
        }

        await updateRecord(effectiveEditingData.id, updates)

        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes.map((st) => ({
            distance: st.distance,
            split_time: st.splitTime
          }))
          await replaceSplitTimes({
            recordId: effectiveEditingData.id,
            splitTimes: splitTimesData as Omit<import('@apps/shared/types/database').SplitTimeInsert, 'record_id'>[]
          })
        }
      } else {
        if (!competitionId) {
          throw new Error('Competition ID が見つかりません')
        }

        // 大会のプール種別を取得（records.pool_type に保存するため）
        const { data: competition, error: competitionError } = await supabase
          .from('competitions')
          .select('pool_type')
          .eq('id', competitionId)
          .single()

        if (competitionError || !competition) {
          throw competitionError || new Error('大会情報の取得に失敗しました')
        }

        const competitionPoolType = (competition as { pool_type: 0 | 1 }).pool_type

        for (const formData of dataArray) {
          const recordForCreate: Omit<import('@apps/shared/types/database').RecordInsert, 'user_id'> = {
            style_id: parseInt(formData.styleId),
            time: formData.time,
            video_url: formData.videoUrl || null,
            note: formData.note || null,
            is_relaying: formData.isRelaying || false,
            competition_id: competitionId,
            pool_type: competitionPoolType,
            reaction_time: formData.reactionTime && formData.reactionTime.trim() !== '' 
              ? parseFloat(formData.reactionTime) 
              : null
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
  }, [createdCompetitionId, competitionEditingData, supabase, updateRecord, createRecord, replaceSplitTimes, createSplitTimes, refreshCalendar, setLoading, closeRecordLogForm])

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

