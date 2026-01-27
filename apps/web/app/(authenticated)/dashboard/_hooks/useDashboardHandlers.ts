// =============================================================================
// ダッシュボードハンドラー関数用カスタムフック
// =============================================================================

import type { PracticeImageData } from '@/components/forms/PracticeBasicForm'
import type { CompetitionImageData } from '@/components/forms/CompetitionBasicForm'
import { useCompetitionFormStore, usePracticeFormStore } from '@/stores'
import type {
  EditingData,
  EntryFormData,
  EntryWithStyle,
  PracticeMenuFormData,
  RecordFormDataInternal
} from '@/stores/types'
import { processCompetitionImage, processPracticeImage } from '@/utils/imageUtils'
import { CompetitionAPI, EntryAPI } from '@apps/shared/api'
import type { Style, PracticeLogTagInsert } from '@apps/shared/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@swim-hub/shared/types'
import { useCallback } from 'react'
import { getCompetitionId, getPracticeId, getRecordCompetitionId } from '../_utils/dashboardHelpers'

interface UseDashboardHandlersProps {
  supabase: SupabaseClient<Database>
  user: { id: string } | null
  styles: Style[]
  // Practice hooks（実際の型に合わせる）
  createPractice: (practice: Omit<import('@swim-hub/shared/types').PracticeInsert, 'user_id'>) => Promise<import('@swim-hub/shared/types').Practice>
  updatePractice: (id: string, updates: import('@swim-hub/shared/types').PracticeUpdate) => Promise<import('@swim-hub/shared/types').Practice>
  createPracticeLog: (log: Omit<import('@swim-hub/shared/types').PracticeLogInsert, 'user_id'>) => Promise<import('@swim-hub/shared/types').PracticeLog>
  updatePracticeLog: (id: string, updates: import('@swim-hub/shared/types').PracticeLogUpdate) => Promise<import('@swim-hub/shared/types').PracticeLog>
  createPracticeTime: (time: import('@swim-hub/shared/types').PracticeTimeInsert) => Promise<import('@swim-hub/shared/types').PracticeTime>
  deletePracticeTime: (id: string) => Promise<void>
  deletePractice: (id: string) => Promise<void>
  // Record hooks（実際の型に合わせる）
  createRecord: (record: Omit<import('@swim-hub/shared/types').RecordInsert, 'user_id'>) => Promise<import('@swim-hub/shared/types').Record>
  updateRecord: (id: string, updates: import('@swim-hub/shared/types').RecordUpdate) => Promise<import('@swim-hub/shared/types').Record>
  createCompetition: (competition: Omit<import('@swim-hub/shared/types').CompetitionInsert, 'user_id'>) => Promise<import('@swim-hub/shared/types').Competition>
  updateCompetition: (id: string, updates: import('@swim-hub/shared/types').CompetitionUpdate) => Promise<import('@swim-hub/shared/types').Competition>
  deleteCompetition: (id: string) => Promise<void>
  createSplitTimes: (params: { recordId: string; splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }> }) => Promise<import('@swim-hub/shared/types').SplitTime[]>
  replaceSplitTimes: (params: { recordId: string; splitTimes: Omit<import('@swim-hub/shared/types').SplitTimeInsert, 'record_id'>[] }) => Promise<import('@swim-hub/shared/types').SplitTime[]>
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
  deletePractice,
  createRecord,
  updateRecord,
  createCompetition,
  updateCompetition,
  deleteCompetition,
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
  const handlePracticeBasicSubmit = useCallback(async (
    basicData: { date: string; title: string; place: string; note: string },
    imageData?: PracticeImageData,
    continueToNext: boolean = true
  ) => {
    setLoading(true)
    try {
      // 有効なPracticeInsert/Updateフィールドのみを送信
      const payload = {
        date: basicData.date,
        title: basicData.title || null,
        place: basicData.place || null,
        note: basicData.note || null
      }

      let practiceId: string | undefined

      if (editingData && editingData.id) {
        await updatePractice(editingData.id, payload)
        practiceId = editingData.id
        closePracticeBasicForm()
      } else {
        const createdPractice = await createPractice(payload)
        practiceId = createdPractice?.id
        closePracticeBasicForm()
        if (continueToNext) {
          openPracticeLogForm(createdPractice?.id)
        }
      }

      // 画像の処理（安全な順序: アップロード → 検証 → 削除）
      if (practiceId && imageData) {
        const uploadedImages: import('@swim-hub/shared/types').PracticeImage[] = []

        try {
          // Step 1: 新規画像をアップロード（API Route経由でR2/Supabase Storageにアップロード）
          if (imageData.newFiles.length > 0) {
            const processedImages = await Promise.all(
              imageData.newFiles.map(async (fileData) => {
                const { original, thumbnail } = await processPracticeImage(fileData.file)
                return {
                  originalFile: original,
                  thumbnailFile: thumbnail,
                  originalFileName: fileData.file.name
                }
              })
            )

            // API Route経由でアップロード（R2優先、Supabase Storageフォールバック）
            for (let i = 0; i < processedImages.length; i++) {
              const img = processedImages[i]
              const formData = new FormData()
              formData.append('originalFile', img.originalFile)
              formData.append('thumbnailFile', img.thumbnailFile)
              formData.append('practiceId', practiceId)
              formData.append('originalFileName', img.originalFileName)
              formData.append('displayOrder', i.toString())

              const response = await fetch('/api/storage/images/practice', {
                method: 'POST',
                body: formData
              })

              if (!response.ok) {
                const errorData = await response.json() as { error?: string }
                throw new Error(errorData.error || '画像のアップロードに失敗しました')
              }

              const result = await response.json() as import('@swim-hub/shared/types').PracticeImage
              uploadedImages.push(result)
            }

            // Step 2: アップロード成功を確認
            if (uploadedImages.length !== processedImages.length) {
              throw new Error('一部の画像のアップロードに失敗しました')
            }
          }

          // Step 3: アップロード成功後に削除を実行（API Route経由）
          if (imageData.deletedIds.length > 0) {
            for (const imageId of imageData.deletedIds) {
              const response = await fetch(`/api/storage/images/practice?imageId=${imageId}`, {
                method: 'DELETE'
              })
              if (!response.ok) {
                console.error(`画像ID ${imageId} の削除に失敗`)
              }
            }
          }
        } catch (imageError) {
          console.error('画像処理エラー:', imageError)

          // Step 4: ロールバック - アップロードした画像を削除（API Route経由）
          if (uploadedImages.length > 0) {
            try {
              for (const img of uploadedImages) {
                await fetch(`/api/storage/images/practice?imageId=${img.id}`, {
                  method: 'DELETE'
                })
              }
              console.log('ロールバック完了: アップロードした画像を削除しました')
            } catch (rollbackError) {
              console.error('ロールバック失敗:', rollbackError)
            }
          }

          // 画像処理エラーを再スロー
          throw new Error('画像の処理に失敗しました')
        }
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
          swim_category: menu.swimCategory || 'Swim',
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
            const insertData: PracticeLogTagInsert = {
              practice_log_id: practiceLogId,
              practice_tag_id: tag.id
            }
            // Supabaseの型推論が正しく機能しないため、型アサーションを使用
            const queryBuilder = supabase.from('practice_log_tags') as unknown as {
              insert: (values: PracticeLogTagInsert) => Promise<{ error: { message: string } | null }>
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
              } as import('@swim-hub/shared/types').PracticeTimeInsert)
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
            swim_category: menu.swimCategory || 'Swim',
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
            distance: Number(menu.distance) || 100,
            circle: menu.circleTime || null,
            note: menu.note || ''
          }
          
          const createdLog = await createPracticeLog(logInput)
          
          if (menu.tags && menu.tags.length > 0 && createdLog) {
            for (const tag of menu.tags) {
              const insertData: PracticeLogTagInsert = {
                practice_log_id: createdLog.id,
                practice_tag_id: tag.id
              }
              // Supabaseの型推論が正しく機能しないため、型アサーションを使用
              const queryBuilder = supabase.from('practice_log_tags') as unknown as {
                insert: (values: PracticeLogTagInsert) => Promise<{ error: { message: string } | null }>
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
        // Google Calendar同期を含むミューテーションを使用
        await deletePractice(itemId)
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
        // Google Calendar同期を含むミューテーションを使用
        await deleteCompetition(itemId)
      }

      refreshCalendar()
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
    }
  }, [supabase, refreshCalendar, deletePractice, deleteCompetition])

  // 大会情報作成・更新
  const handleCompetitionBasicSubmit = useCallback(async (
    basicData: { date: string; endDate: string; title: string; place: string; poolType: number; note: string },
    imageData?: CompetitionImageData,
    options?: { continueToNext?: boolean; skipEntry?: boolean }
  ) => {
    const { continueToNext = true, skipEntry = false } = options || {}

    setLoading(true)
    try {
      // 終了日は空文字の場合はnullに変換
      const endDate = basicData.endDate ? basicData.endDate : null

      let competitionId: string | undefined

      if (competitionEditingData && competitionEditingData.id) {
        await updateCompetition(competitionEditingData.id, {
          date: basicData.date,
          end_date: endDate,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null
        })
        competitionId = competitionEditingData.id
        closeCompetitionBasicForm()
      } else {
        const newCompetition = await createCompetition({
          date: basicData.date,
          end_date: endDate,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null
        })
        competitionId = newCompetition.id
        // openEntryLogForm/openRecordLogFormがisBasicFormOpen: falseをセットするので、closeCompetitionBasicFormは不要
        // closeCompetitionBasicFormを呼ぶとcreatedCompetitionIdがnullにリセットされてしまう
        if (continueToNext) {
          if (skipEntry) {
            // エントリーをスキップして記録入力へ（今日/過去の日付の場合）
            openRecordLogForm(newCompetition.id, [])
          } else {
            // エントリー登録へ（未来の日付の場合）
            openEntryLogForm(newCompetition.id)
          }
        } else {
          // 保存して終了（今日/過去の日付で「保存して終了」を選んだ場合）
          closeCompetitionBasicForm()
        }
      }

      // 画像の処理（安全な順序: アップロード → 検証 → 削除）
      if (competitionId && imageData) {
        const competitionAPI = new CompetitionAPI(supabase)
        let uploadedImages: import('@swim-hub/shared/types').CompetitionImage[] = []
        
        try {
          // Step 1: 新規画像をアップロード（先に実行してデータ損失を防ぐ）
          if (imageData.newFiles.length > 0) {
            const processedImages = await Promise.all(
              imageData.newFiles.map(async (fileData) => {
                const { original, thumbnail } = await processCompetitionImage(fileData.file)
                return {
                  originalFile: original,
                  thumbnailFile: thumbnail,
                  originalFileName: fileData.file.name
                }
              })
            )
            uploadedImages = await competitionAPI.uploadCompetitionImages(competitionId, processedImages)
            
            // Step 2: アップロード成功を確認
            if (uploadedImages.length !== processedImages.length) {
              throw new Error('一部の画像のアップロードに失敗しました')
            }
          }
          
          // Step 3: アップロード成功後に削除を実行
          if (imageData.deletedIds.length > 0) {
            await competitionAPI.deleteCompetitionImages(imageData.deletedIds)
          }
        } catch (imageError) {
          console.error('画像処理エラー:', imageError)
          
          // Step 4: ロールバック - アップロードした画像を削除
          if (uploadedImages.length > 0) {
            try {
              const uploadedIds = uploadedImages.map(img => img.id)
              await competitionAPI.deleteCompetitionImages(uploadedIds)
              console.log('ロールバック完了: アップロードした画像を削除しました')
            } catch (rollbackError) {
              console.error('ロールバック失敗:', rollbackError)
            }
          }
          
          // 画像処理エラーを再スロー
          throw new Error('画像の処理に失敗しました')
        }
      }

      refreshCalendar()
    } catch (error) {
      console.error('大会情報の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }, [competitionEditingData, updateCompetition, createCompetition, closeCompetitionBasicForm, refreshCalendar, openEntryLogForm, openRecordLogForm, setLoading, supabase])

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
        const updates: import('@swim-hub/shared/types').RecordUpdate = {
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
            splitTimes: splitTimesData as Omit<import('@swim-hub/shared/types').SplitTimeInsert, 'record_id'>[]
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
          const recordForCreate: Omit<import('@swim-hub/shared/types').RecordInsert, 'user_id'> = {
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

