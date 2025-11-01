'use client'

import { useAuth } from '@/contexts'
import CalendarContainer from './_components/CalendarContainer'
import { TeamAnnouncements } from '@/components/team'
import { useEffect } from 'react'
import { parseISO, startOfDay } from 'date-fns'
import PracticeBasicForm from '@/components/forms/PracticeBasicForm'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import CompetitionBasicForm from '@/components/forms/CompetitionBasicForm'
import EntryLogForm from '@/components/forms/EntryLogForm'
import RecordLogForm from '@/components/forms/RecordLogForm'
import { usePractices } from '@apps/shared/hooks/usePractices'
import { useRecords } from '@apps/shared/hooks/useRecords'
import { StyleAPI, EntryAPI, RecordAPI } from '@apps/shared/api'
import type {
  PracticeTag,
  PracticeLogTagInsert,
  TeamMembership,
  Team,
  SplitTime
} from '@apps/shared/types/database'
import type {
  TimeEntry
} from '@apps/shared/types/ui'
import {
  usePracticeFormStore,
  useCompetitionFormStore,
  useTeamStore,
  useUIStore
} from '@/stores'
import type {
  EditingData,
  PracticeMenuFormData,
  EntryFormData,
  RecordFormData,
  EntryWithStyle
} from '@/stores/types'

export default function DashboardPage() {
  type TeamMembershipWithTeam = TeamMembership & {
    team?: Team
  }

  const { user, supabase } = useAuth()
  
  // Zustandストア
  const {
    teams,
    teamsLoading,
    setTeams,
    setTeamsLoading,
  } = useTeamStore()
  
  const {
    calendarRefreshKey,
    refreshCalendar,
  } = useUIStore()
  
  const {
    isBasicFormOpen: isPracticeBasicFormOpen,
    isLogFormOpen: isPracticeLogFormOpen,
    selectedDate,
    editingData,
    createdPracticeId,
    isLoading,
    availableTags,
    openBasicForm: openPracticeBasicForm,
    openLogForm: openPracticeLogForm,
    closeBasicForm: closePracticeBasicForm,
    closeLogForm: closePracticeLogForm,
    closeAll: closePracticeAll,
    setSelectedDate,
    setEditingData,
    setCreatedPracticeId,
    setAvailableTags,
    setLoading,
  } = usePracticeFormStore()
  
  const {
    isBasicFormOpen: isCompetitionBasicFormOpen,
    isEntryFormOpen: isEntryLogFormOpen,
    isRecordFormOpen: isRecordLogFormOpen,
    createdCompetitionId,
    createdEntries,
    styles,
    editingData: competitionEditingData,
    openBasicForm: openCompetitionBasicForm,
    openEntryForm: openEntryLogForm,
    openRecordForm: openRecordLogForm,
    closeBasicForm: closeCompetitionBasicForm,
    closeEntryForm: closeEntryLogForm,
    closeRecordForm: closeRecordLogForm,
    closeAll: closeCompetitionAll,
    setCreatedCompetitionId,
    setCreatedEntries,
    setStyles,
  } = useCompetitionFormStore()

  // タイムゾーンを考慮した日付パース
  const parseDateString = (dateString: string): Date => {
    // ISO形式の日付文字列（yyyy-MM-dd）をパース
    // parseISOはローカルタイムゾーンで解釈される
    const parsedDate = parseISO(dateString)
    
    // その日の開始時刻（00:00:00）として取得
    // startOfDayはローカルタイムゾーンの開始時刻を返す
    return startOfDay(parsedDate)
  }

  // 練習記録用のフック
  const {
    createPractice,
    updatePractice,
    deletePractice: _deletePractice,
    createPracticeLog,
    updatePracticeLog,
    deletePracticeLog: _deletePracticeLog,
    createPracticeTime,
    deletePracticeTime,
    refetch
  } = usePractices(supabase, {})

  // 大会記録用のフック
  const {
    createRecord,
    updateRecord,
    deleteRecord: _deleteRecord,
    createCompetition,
    updateCompetition,
    createSplitTimes,
    replaceSplitTimes,
    refetch: refetchRecords
  } = useRecords(supabase, {})

  // ヘルパー関数
  const getCompetitionId = (
    createdId: string | null, 
    editingData: unknown
  ): string | undefined => {
    if (createdId) return createdId
    if (editingData && typeof editingData === 'object' && 'competition_id' in editingData) {
      return editingData.competition_id as string | undefined
    }
    return undefined
  }

  const getRecordCompetitionId = (
    createdId: string | null,
    editingData: unknown
  ): string | null => {
    if (createdId) return createdId
    if (editingData && typeof editingData === 'object' && 'competition_id' in editingData) {
      return editingData.competition_id as string | null
    }
    if (editingData && typeof editingData === 'object' && 'metadata' in editingData) {
      const metadata = (editingData as { metadata?: unknown }).metadata
      if (metadata && typeof metadata === 'object' && 'record' in metadata) {
        const record = (metadata as { record?: unknown }).record
        if (record && typeof record === 'object' && 'competition_id' in record) {
          return record.competition_id as string | null
        }
      }
    }
    return null
  }

  // EntryInfoを取得するヘルパー関数
  const getEntryDataForRecord = (editingData: unknown, createdEntries: EntryWithStyle[]): import('@apps/shared/types/ui').EntryInfo | undefined => {
    // competitionEditingData.entryDataからEntryInfoを作成
    if (editingData && typeof editingData === 'object' && 'entryData' in editingData 
      && editingData.entryData 
      && typeof editingData.entryData === 'object' 
      && editingData.entryData !== null) {
      const entryData = editingData.entryData
      // styleIdとstyleNameがあればEntryInfoとして渡す
      if ('styleId' in entryData && 'styleName' in entryData) {
        const styleId = typeof entryData.styleId === 'number' ? entryData.styleId 
          : typeof entryData.styleId === 'string' ? Number(entryData.styleId) 
          : undefined
        const styleName = typeof entryData.styleName === 'string' ? entryData.styleName : ''
        const entryTime = 'entryTime' in entryData 
          ? (typeof entryData.entryTime === 'number' ? entryData.entryTime 
            : entryData.entryTime === null ? null 
            : undefined)
          : undefined
        
        if (styleId !== undefined && styleName !== undefined) {
          return { styleId, styleName, entryTime }
        }
      }
    }
    
    // createdEntriesからEntryInfoを作成
    if (createdEntries.length > 0) {
      return {
        styleId: createdEntries[0].style_id,
        styleName: String(createdEntries[0].styleName || ''),
        entryTime: createdEntries[0].entry_time
      }
    }
    
    return undefined
  }

  // チーム一覧、タグ、種目を取得
  useEffect(() => {
    const loadTeams = async () => {
      if (!user) return
      
      try {
        setTeamsLoading(true)
        const { data, error } = await supabase
          .from('team_memberships')
          .select(`
            *,
            team:teams (
              id,
              name,
              description
            )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true)

        if (error) throw error

        setTeams((data || []) as TeamMembershipWithTeam[])
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      } finally {
        setTeamsLoading(false)
      }
    }

    const loadTags = async () => {
      if (!user) return
      
      try {
        const { data, error } = await supabase
          .from('practice_tags')
          .select('*')
          .eq('user_id', user.id)
          .order('name')

        if (error) throw error
        setAvailableTags(data || [])
      } catch (error) {
        console.error('タグ情報の取得に失敗:', error)
      }
    }

    const loadStyles = async () => {
      try {
        const styleAPI = new StyleAPI(supabase)
        const stylesData = await styleAPI.getStyles()
        setStyles(stylesData)
      } catch (error) {
        console.error('種目情報の取得に失敗:', error)
      }
    }

    loadTeams()
    loadTags()
    loadStyles()
  }, [user])

  // 練習予定作成・更新
  const handlePracticeBasicSubmit = async (basicData: { date: string; place: string; note: string }) => {
    setLoading(true)
    try {
      if (editingData && editingData.id) {
        // 編集モード: 更新
        await updatePractice(editingData.id, basicData)
      } else {
        // 新規作成モード: 作成
        await createPractice(basicData)
        
        // 新規作成時は選択された日付の月をカレンダーに設定（Contextで管理）
        // この処理はCalendarProviderで自動的に処理される
      }
      
      // フォームを閉じる
      closePracticeBasicForm()
      
      // データを再取得
      await Promise.all([refetch()])
      refreshCalendar() // カレンダー強制更新
      
    } catch (error) {
      console.error('練習予定の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }

  // 練習メニュー作成・更新処理
  const handlePracticeLogSubmit = async (formDataArray: PracticeMenuFormData[]) => {
    setLoading(true)
    try {
      const menus = Array.isArray(formDataArray) ? formDataArray : []

      if (editingData) {
        // 編集モード: 既存のPracticeLogを更新
        const menu = menus[0] // 編集時は1つのメニューのみ
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
        
        // 既存のタグデータを削除
        await supabase
          .from('practice_log_tags')
          .delete()
          .eq('practice_log_id', practiceLogId)
        
        // 新しいタグデータを保存
        if (menu.tags && menu.tags.length > 0) {
          const tagInserts: PracticeLogTagInsert[] = menu.tags.map(tag => ({
            practice_log_id: practiceLogId,
            practice_tag_id: tag.id
          }))
          await supabase
            .from('practice_log_tags')
            .insert(tagInserts)
        }
        
        // 既存のタイムデータを削除
        const { data: existingTimes } = await supabase
          .from('practice_times')
          .select('id')
          .eq('practice_log_id', practiceLogId)
        
        if (existingTimes && existingTimes.length > 0) {
          for (const time of existingTimes as Array<{ id: string }>) {
            await deletePracticeTime(time.id)
          }
        }
        
        // 新しいタイムデータを保存
        if (menu.times && menu.times.length > 0) {
          for (const timeEntry of menu.times) {
            if (timeEntry.time > 0) {
              await createPracticeTime({
                user_id: user?.id || '',
                practice_log_id: practiceLogId,
                set_number: timeEntry.setNumber,
                rep_number: timeEntry.repNumber,
                time: timeEntry.time
              })
            }
          }
        }
      } else {
        // 新規作成モード: 新しいPracticeLogを作成
        if (!createdPracticeId) {
          throw new Error('Practice ID が見つかりません')
        }

        // 各メニューをPracticeLogとして作成
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
          
          // タグデータがある場合は保存
          if (menu.tags && menu.tags.length > 0 && createdLog) {
            const tagInserts: PracticeLogTagInsert[] = menu.tags.map(tag => ({
              practice_log_id: createdLog.id,
              practice_tag_id: tag.id
            }))
            await supabase
              .from('practice_log_tags')
              .insert(tagInserts)
          }
          
          // タイムデータがある場合は保存
          if (menu.times && menu.times.length > 0 && createdLog) {
            for (const timeEntry of menu.times) {
              if (timeEntry.time > 0) {
                await createPracticeTime({
                  user_id: user?.id || '',
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

      // データを再取得
      await Promise.all([refetch()])
      refreshCalendar() // カレンダー強制更新
      
    } catch (error) {
      console.error('練習記録の処理に失敗しました:', error)
    } finally {
      setLoading(false)
      closePracticeLogForm()
    }
  }

  // アイテム削除ハンドラー
  const handleDeleteItem = async (itemId: string, itemType?: 'practice' | 'team_practice' | 'practice_log' | 'competition' | 'team_competition' | 'entry' | 'record') => {
    if (!itemType) {
      console.error('アイテムタイプが不明です')
      return
    }

    if (!confirm('この記録を削除してもよろしいですか？')) {
      return
    }

    try {
      if (itemType === 'practice' || itemType === 'team_practice') {
        // 練習記録削除
        const { error } = await supabase
          .from('practices')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      } else if (itemType === 'practice_log') {
        // 練習ログ削除
        const { error } = await supabase
          .from('practice_logs')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      } else if (itemType === 'entry') {
        // エントリー削除
        const { error } = await supabase
          .from('entries')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      } else if (itemType === 'record') {
        // 大会記録削除
        const { error } = await supabase
          .from('records')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      } else if (itemType === 'competition' || itemType === 'team_competition') {
        // 大会削除
        const { error } = await supabase
          .from('competitions')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      }

      // データを再取得
      await Promise.all([refetch(), refetchRecords()])
      refreshCalendar() // カレンダー強制更新
      
      // 成功通知
      alert('アイテムを削除しました')
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
    }
  }

  // 大会情報作成・更新
  const handleCompetitionBasicSubmit = async (basicData: { date: string; title: string; place: string; poolType: number; note: string }) => {
    setLoading(true)
    try {
      if (competitionEditingData && competitionEditingData.id) {
        // 編集モード: 更新
        await updateCompetition(competitionEditingData.id, {
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        
        // 編集時は完了
        closeCompetitionBasicForm()
        
        // データを再取得
        await Promise.all([refetchRecords()])
        refreshCalendar()
      } else {
        // 新規作成モード: 大会作成後、エントリーフォームへ
        const newCompetition = await createCompetition({
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        
        // Competition作成フォームを閉じる
        closeCompetitionBasicForm()
        
        // エントリーフォームを開く（competitionIdを渡す）
        openEntryLogForm(newCompetition.id)
      }
      
    } catch (error) {
      console.error('大会情報の処理に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }

  // エントリー登録
  const handleEntrySubmit = async (entriesData: EntryFormData[]) => {
    setLoading(true)
    try {
      const competitionId = getCompetitionId(createdCompetitionId, competitionEditingData)
      
      if (!competitionId) {
        throw new Error('Competition ID が見つかりません')
      }

      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList = []

      // 各エントリーを作成または更新
      for (const entryData of entriesData) {
        // 編集モードでentryDataにidがある場合は更新、そうでなければチェックしてから作成/更新
        let entry
        if (entryData.id && competitionEditingData?.type === 'entry') {
          // 編集モード: 既存エントリーを更新
          entry = await entryAPI.updateEntry(entryData.id, {
            style_id: parseInt(entryData.styleId), // 種目も更新
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note || null
          })
        } else {
          // 新規作成または既存チェック後作成/更新
          const existingEntry = await entryAPI.checkExistingEntry(
            competitionId,
            user?.id || '',
            parseInt(entryData.styleId)
          )

          if (existingEntry) {
            // 既存エントリーがある場合は更新
            entry = await entryAPI.updateEntry(existingEntry.id, {
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null
            })
          } else {
            // 新規作成
            entry = await entryAPI.createPersonalEntry({
              competition_id: competitionId,
              style_id: parseInt(entryData.styleId),
              entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
              note: entryData.note || null
            })
          }
        }
        
        // スタイル情報を追加（Record作成時に使用）
        const styleId = parseInt(String(entryData.styleId))
        const style = styles.find(s => s.id === styleId)
        if (!style) {
          const entryId = entry?.id || 'unknown'
          throw new Error(`Style not found for entry ${entryId}: styleId=${styleId}`)
        }
        if (entry) {
          createdEntriesList.push({
            ...entry,
            styleName: style.name_jp
          })
        }
      }

      setCreatedEntries(createdEntriesList)
      
      // エントリーフォームを閉じる
      closeEntryLogForm()
      
      // 編集モードの場合は、Record作成フォームは開かない（モーダルを閉じる）
      if (competitionEditingData?.type === 'entry') {
        refreshCalendar() // カレンダーを更新
      } else {
        // 新規作成モード: 最初のエントリー情報を使ってRecord作成フォームを開く
        if (createdEntriesList.length > 0) {
          openRecordLogForm(createdCompetitionId || undefined, createdEntriesList)
        }
      }
    } catch (error) {
      console.error('エントリーの登録に失敗しました:', error)
    } finally {
      setLoading(false)
    }
  }

  // エントリーをスキップ
  const handleEntrySkip = () => {
    if (!createdCompetitionId) {
      console.error('大会IDが取得できませんでした。エントリーを先に登録してください。')
      return
    }
    closeEntryLogForm()
    openRecordLogForm(createdCompetitionId, [])
  }

  // 記録登録・更新
  const handleRecordLogSubmit = async (formData: RecordFormData) => {
    setLoading(true)
    try {
      
      const recordInput = {
        style_id: parseInt(formData.styleId),
        time: formData.time,
        video_url: formData.videoUrl || null,
        note: formData.note || null,
        is_relaying: formData.isRelaying || false,
        competition_id: getRecordCompetitionId(createdCompetitionId, competitionEditingData)
      }

      if (competitionEditingData && competitionEditingData.id) {
        // 更新処理
        await updateRecord(competitionEditingData.id, recordInput)
        
        // スプリットタイム更新
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes.map((st) => ({
            distance: st.distance,
            split_time: st.splitTime
          }))
          
          await replaceSplitTimes(competitionEditingData.id, splitTimesData)
        }
      } else {
        // 作成処理
        const newRecord = await createRecord(recordInput)
        
        // スプリットタイム作成
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes.map((st) => ({
            distance: st.distance,
            split_time: st.splitTime
          }))
          
          await createSplitTimes(newRecord.id, splitTimesData)
        }
      }

      // データを再取得
      await Promise.all([refetchRecords()])
      refreshCalendar()
      
    } catch (error) {
      console.error('記録の処理に失敗しました:', error)
    } finally {
      setLoading(false)
      closeRecordLogForm()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full">
        {/* チームのお知らせセクション */}
        {!teamsLoading && teams.length > 0 && (
          <div className="mb-4 space-y-3">
            {teams.map((teamMembership) => (
              <div key={teamMembership.team_id} className="bg-white rounded-lg shadow">
                <div className="px-4 py-4">
                  <div className="mb-3">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {teamMembership.team?.name} のお知らせ
                    </h2>
                    {teamMembership.role === 'admin' && (
                      <span className="text-xs text-gray-500">管理者</span>
                    )}
                  </div>

                  <div className="border-t border-gray-200">
                    <TeamAnnouncements 
                      teamId={teamMembership.team_id}
                      isAdmin={teamMembership.role === 'admin'}
                      viewOnly={true}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* カレンダーエラー表示はCalendarProviderで管理 */}

        {/* カレンダーコンポーネント */}
        <CalendarContainer 
          key={calendarRefreshKey} // 強制再レンダリング
          onDateClick={(_date) => {}}
          onAddItem={(date, type) => {
            if (type === 'practice') {
              openPracticeBasicForm(date)
            } else {
              setSelectedDate(date)
              setEditingData(null)
              openCompetitionBasicForm()
            }
          }} 
          onEditItem={(item) => {
            // 日付文字列をDateオブジェクトに変換（タイムゾーン考慮）
            const dateObj = parseDateString(item.date)
            
            if (item.type === 'practice' || item.type === 'team_practice') {
              // Practice編集モーダルを開く
              openPracticeBasicForm(dateObj, item)
            } else if (item.type === 'practice_log') {
              // PracticeLog編集モーダルを開く
              openPracticeLogForm(undefined, item)
            } else if (item.type === 'entry') {
              // Entry編集モーダルを開く
              const competitionId = item.metadata?.entry?.competition_id || undefined
              openEntryLogForm(competitionId, item)
            } else if (item.type === 'competition' || item.type === 'team_competition') {
              // Competition編集モーダルを開く
              openCompetitionBasicForm(dateObj, item)
            }
          }}
          onDeleteItem={handleDeleteItem}
          onAddPracticeLog={(practiceId) => {
            openPracticeLogForm(practiceId)
          }}
          onEditPracticeLog={(log) => {
            // PracticeLog編集モーダルを開く
            // PracticeLogWithTimesをEditingData形式に変換
            const editData: EditingData = {
              id: log.id,
              practice_id: log.practice_id,
              style_id: log.style,
              note: log.note || undefined
            }
            openPracticeLogForm(undefined, editData)
          }}
          onDeletePracticeLog={async (logId) => {
            if (!confirm('この練習ログを削除してもよろしいですか？')) {
              return
            }
            
            try {
              const { error } = await supabase
                .from('practice_logs')
                .delete()
                .eq('id', logId)

              if (error) throw error

              // データを再取得
              await Promise.all([refetch()])
              refreshCalendar() // カレンダー強制更新

              alert('練習ログを削除しました')
            } catch (error) {
              console.error('練習ログの削除に失敗しました:', error)
            }
          }}
          onAddRecord={(params) => {
            const { competitionId, entryData } = params
            
            console.log('dashboard/page.tsx: onAddRecord called', {
              competitionId,
              hasEntryData: !!entryData,
              entryData
            })
            
            // competitionIdが無効な場合は競技作成フローを開く
            if (!competitionId || competitionId.trim() === '') {
              console.log('Opening CompetitionBasicForm (no valid competitionId)')
              openCompetitionBasicForm()
              return
            }
            
            if (entryData) {
              // エントリーデータがある場合は直接Record作成フォームを開く
              console.log('Opening RecordLogForm with entryData')
              const editData: EditingData = { entryData }
              openRecordLogForm(competitionId, undefined, editData)
            } else {
              // エントリーデータがない場合はEntry作成フォームを開く
              console.log('Opening EntryLogForm (no entryData)')
              openEntryLogForm(competitionId)
            }
          }}
          onEditRecord={(record) => {
            // Record編集モーダルを開く
            // RecordLogFormに必要な形式に変換
            // SplitTime[]をEditingData形式に変換
            const splitTimes = record.split_times || []
            const convertedSplitTimes: Array<{ distance: number; split_time: number }> = splitTimes.map(st => ({
              distance: st.distance,
              split_time: st.split_time
            }))
            
            const editData: EditingData = {
              id: record.id,
              style_id: record.style_id || record.style?.id,
              time: record.time || record.time_result,
              is_relaying: record.is_relaying,
              note: record.note || undefined,
              video_url: record.video_url,
              split_times: convertedSplitTimes,
              competition_id: record.competition_id
            }
            
            openRecordLogForm(record.competition_id || undefined, undefined, editData)
          }}
          onDeleteRecord={async (recordId) => {
            if (!confirm('この大会記録を削除してもよろしいですか？')) {
              return
            }
            
            try {
              const { error } = await supabase
                .from('records')
                .delete()
                .eq('id', recordId)

              if (error) throw error

              // データを再取得
              await Promise.all([refetchRecords()])
              refreshCalendar()

              alert('大会記録を削除しました')
            } catch (error) {
              console.error('大会記録の削除に失敗しました:', error)
            }
          }}
          openDayDetail={null}
        />

        {/* 第1段階: 練習基本情報フォーム */}
        <PracticeBasicForm
          isOpen={isPracticeBasicFormOpen}
          onClose={() => {
            closePracticeBasicForm()
          }}
          onSubmit={handlePracticeBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={editingData && typeof editingData === 'object' && 'metadata' in editingData && editingData.metadata
            ? {
                date: editingData.date,
                place: editingData.metadata.practice?.place || '',
                note: editingData.note || ''
              }
            : undefined}
          isLoading={isLoading}
        />

        {/* 第2段階: 練習メニューフォーム */}
        <PracticeLogForm
          isOpen={isPracticeLogFormOpen}
          onClose={() => {
            closePracticeLogForm()
          }}
          onSubmit={handlePracticeLogSubmit}
          practiceId={createdPracticeId || 
            (editingData && typeof editingData === 'object' && 'practice_id' in editingData 
              ? (editingData.practice_id || '')
              : '')}
          editData={(() => {
            if (!editingData || typeof editingData !== 'object' || !('style' in editingData)) {
              return undefined
            }
            
            // editingDataがstyleを持つことが確認できたので、PracticeLogFormのeditData形式に変換
            const data = editingData as { 
              id?: string; 
              style: string; 
              distance?: number; 
              rep_count?: number; 
              set_count?: number; 
              circle?: number | null; 
              note?: string | null; 
              tags?: PracticeTag[]; 
              times?: Array<{ memberId: string; times: TimeEntry[] }> 
            }
            
            return {
              id: data.id,
              style: String(data.style || 'Fr'),
              distance: data.distance,
              rep_count: data.rep_count,
              set_count: data.set_count,
              circle: data.circle,
              note: data.note,
              tags: data.tags,
              times: data.times
            }
          })()}
          isLoading={isLoading}
          availableTags={availableTags}
          setAvailableTags={setAvailableTags}
          styles={[]}
        />

        {/* 第1段階: 大会基本情報フォーム */}
        <CompetitionBasicForm
          isOpen={isCompetitionBasicFormOpen}
          onClose={() => {
            closeCompetitionBasicForm()
          }}
          onSubmit={handleCompetitionBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={(() => {
            if (!competitionEditingData || typeof competitionEditingData !== 'object' || !('title' in competitionEditingData)) {
              return undefined
            }
            
            const data = competitionEditingData as { 
              date?: string; 
              title?: string; 
              location?: string; 
              note?: string; 
              metadata?: { competition?: { title?: string; place?: string; pool_type?: number } } 
            }
            
            return {
              date: data.date,
              title: data.title,
              competition_name: data.metadata?.competition?.title,
              place: data.location,
              location: data.location,
              pool_type: data.metadata?.competition?.pool_type,
              note: data.note || ''
            }
          })()}
          isLoading={isLoading}
        />

        {/* 第2段階: エントリー登録フォーム（SKIP可能） */}
        <EntryLogForm
          isOpen={isEntryLogFormOpen}
          onClose={() => {
            closeEntryLogForm()
          }}
          onSubmit={handleEntrySubmit}
          onSkip={handleEntrySkip}
          competitionId={createdCompetitionId || 
            (competitionEditingData && typeof competitionEditingData === 'object' && 'competition_id' in competitionEditingData 
              ? competitionEditingData.competition_id || ''
              : '')}
          isLoading={isLoading}
          styles={styles.map(s => ({ id: s.id.toString(), nameJp: s.name_jp, distance: s.distance }))}
          editData={(() => {
            if (!competitionEditingData || competitionEditingData === null || typeof competitionEditingData !== 'object') {
              return undefined
            }
            
            if ('type' in competitionEditingData && competitionEditingData.type === 'entry') {
              const data = competitionEditingData as { 
                id?: string; 
                type: string; 
                style_id?: number; 
                entry_time?: number; 
                note?: string 
              }
              
              return {
                id: data.id,
                style_id: data.style_id,
                entry_time: data.entry_time,
                note: data.note
              }
            }
            
            return undefined
          })()}
        />

        {/* 第3段階: 記録登録フォーム */}
        <RecordLogForm
          isOpen={isRecordLogFormOpen}
          onClose={() => {
            closeRecordLogForm()
          }}
          onSubmit={handleRecordLogSubmit}
          competitionId={createdCompetitionId || 
            (competitionEditingData && typeof competitionEditingData === 'object' && 'competition_id' in competitionEditingData 
              ? competitionEditingData.competition_id || ''
              : '')}
          editData={(() => {
            if (!competitionEditingData || competitionEditingData === null || typeof competitionEditingData !== 'object' || !('id' in competitionEditingData)) {
              return null
            }
            
            const data = competitionEditingData as { 
              id?: string; 
              style_id?: number; 
              time?: number; 
              is_relaying?: boolean; 
              split_times?: Array<{ id?: string; record_id?: string; distance: number; split_time: number; created_at?: string }>; 
              note?: string; 
              video_url?: string | null 
            }
            
            // RecordLogFormのSplitTime型に変換
            const splitTimes = data.split_times?.map(st => ({
              id: st.id || '', 
              record_id: st.record_id || '', 
              distance: st.distance,
              split_time: st.split_time,
              created_at: st.created_at || '' 
            }))
            
            return {
              id: data.id,
              style_id: data.style_id,
              time: data.time,
              is_relaying: data.is_relaying,
              split_times: splitTimes,
              note: data.note,
              video_url: data.video_url === null ? undefined : data.video_url
            }
          })()}
          isLoading={isLoading}
          styles={styles}
          entryData={getEntryDataForRecord(competitionEditingData, createdEntries)}
        />
      </div>
    </div>
  )
}
