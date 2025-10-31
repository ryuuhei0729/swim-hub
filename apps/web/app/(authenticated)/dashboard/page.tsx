'use client'

import { useState } from 'react'
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
import { StyleAPI, EntryAPI } from '@apps/shared/api'
import type {
  Style,
  PracticeTag,
  TeamMembership,
  Team,
  Entry
} from '@apps/shared/types/database'
import type {
  CalendarItem,
  TimeEntry
} from '@apps/shared/types/ui'

export default function DashboardPage() {
  type TeamMembershipWithTeam = TeamMembership & {
    team?: Team
  }
  
  type EntryWithStyle = Entry & {
    styleName?: string
  }
  
  type PracticeMenuFormData = {
    style: string
    distance: number
    reps: number
    sets: number
    circleTime: number | null
    note: string
    tags: PracticeTag[]
    times: TimeEntry[]
  }
  
  type EntryFormData = {
    id: string
    styleId: string
    entryTime: number
    note: string
  }
  
  type RecordFormData = {
    styleId: string
    time: number
    videoUrl?: string | null
    note?: string | null
    isRelaying: boolean
    splitTimes: Array<{
      distance: number | string
      splitTime: number
    }>
  }
  
  const { user, supabase } = useAuth()
  const [teams, setTeams] = useState<TeamMembershipWithTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)

  // タイムゾーンを考慮した日付パース
  const parseDateString = (dateString: string): Date => {
    // ISO形式の日付文字列（yyyy-MM-dd）をパース
    // parseISOはローカルタイムゾーンで解釈される
    const parsedDate = parseISO(dateString)
    
    // その日の開始時刻（00:00:00）として取得
    // startOfDayはローカルタイムゾーンの開始時刻を返す
    return startOfDay(parsedDate)
  }

  // 練習記録フォーム用の状態（2段階対応）
  const [isPracticeBasicFormOpen, setIsPracticeBasicFormOpen] = useState(false)
  const [isPracticeLogFormOpen, setIsPracticeLogFormOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  // editingDataは様々な型のデータを保持する可能性があるため、union型を使用
  type EditingData = CalendarItem | {
    id?: string
    type?: string
    competition_id?: string | null
    practice_id?: string
    entryData?: unknown
  } | null
  
  const [editingData, setEditingData] = useState<EditingData>(null)
  const [createdPracticeId, setCreatedPracticeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [availableTags, setAvailableTags] = useState<PracticeTag[]>([])

  // 大会記録フォーム用の状態（3段階対応: Competition → Entry → Record）
  const [isCompetitionBasicFormOpen, setIsCompetitionBasicFormOpen] = useState(false)
  const [isEntryLogFormOpen, setIsEntryLogFormOpen] = useState(false)
  const [isRecordLogFormOpen, setIsRecordLogFormOpen] = useState(false)
  const [createdCompetitionId, setCreatedCompetitionId] = useState<string | null>(null)
  const [createdEntries, setCreatedEntries] = useState<EntryWithStyle[]>([])
  const [styles, setStyles] = useState<Style[]>([])

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

  // カレンダーデータ用のフック（簡素化）
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)

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
    setIsLoading(true)
    try {
      if (editingData && editingData.id) {
        // 編集モード: 更新
        await updatePractice(editingData.id, basicData)
        alert('練習予定を更新しました')
      } else {
        // 新規作成モード: 作成
        await createPractice(basicData)
        alert('練習予定を作成しました')
        
        // 新規作成時は選択された日付の月をカレンダーに設定（Contextで管理）
        // この処理はCalendarProviderで自動的に処理される
      }
      
      // フォームを閉じる
      setIsPracticeBasicFormOpen(false)
      setSelectedDate(null)
      setEditingData(null)
      
      // データを再取得
      await Promise.all([refetch()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      
    } catch (error) {
      console.error('練習予定の処理に失敗しました:', error)
      alert('練習予定の処理に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // 練習メニュー作成・更新処理
  const handlePracticeLogSubmit = async (formDataArray: PracticeMenuFormData[]) => {
    setIsLoading(true)
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
        await updatePracticeLog(editingData.id, logInput)
        
        // 既存のタグデータを削除
        await supabase
          .from('practice_log_tags')
          .delete()
          .eq('practice_log_id', editingData.id || '')
        
        // 新しいタグデータを保存
        if (menu.tags && menu.tags.length > 0) {
          for (const tag of menu.tags) {
            // TODO: Supabase型推論の制約回避のため一時的にas any
            await (supabase as any)
              .from('practice_log_tags')
              .insert({
                practice_log_id: editingData.id || '',
                practice_tag_id: tag.id
              })
          }
        }
        
        // 既存のタイムデータを削除
        const { data: existingTimes } = await supabase
          .from('practice_times')
          .select('id')
          .eq('practice_log_id', editingData.id || '')
        
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
                practice_log_id: editingData.id,
                set_number: timeEntry.setNumber,
                rep_number: timeEntry.repNumber,
                time: timeEntry.time
              })
            }
          }
        }
        alert('練習記録を更新しました')
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
            for (const tag of menu.tags) {
              // TODO: Supabase型推論の制約回避のため一時的にas any
              await (supabase as any)
                .from('practice_log_tags')
                .insert({
                  practice_log_id: createdLog.id,
                  practice_tag_id: tag.id
                })
            }
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
        alert('練習記録を保存しました')
      }

      // データを再取得
      await Promise.all([refetch()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      
    } catch (error) {
      console.error('練習記録の処理に失敗しました:', error)
      alert('練習記録の処理に失敗しました。')
    } finally {
      setIsLoading(false)
      setIsPracticeLogFormOpen(false)
      setSelectedDate(null)
      setEditingData(null)
      setCreatedPracticeId(null)
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
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      
      // 成功通知
      alert('アイテムを削除しました')
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
      alert('記録の削除に失敗しました。')
    }
  }

  // 大会情報作成・更新
  const handleCompetitionBasicSubmit = async (basicData: { date: string; title: string; place: string; poolType: number; note: string }) => {
    setIsLoading(true)
    try {
      if (editingData && editingData.id) {
        // 編集モード: 更新
        await updateCompetition(editingData.id, {
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        alert('大会情報を更新しました')
        
        // 編集時は完了
        setIsCompetitionBasicFormOpen(false)
        setSelectedDate(null)
        setEditingData(null)
        
        // データを再取得
        await Promise.all([refetchRecords()])
        setCalendarRefreshKey(prev => prev + 1)
      } else {
        // 新規作成モード: 大会作成後、エントリーフォームへ
        const newCompetition = await createCompetition({
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        
        // Competition IDを保存
        setCreatedCompetitionId(newCompetition.id)
        
        // Competition作成フォームを閉じる
        setIsCompetitionBasicFormOpen(false)
        
        // エントリーフォームを開く
        setIsEntryLogFormOpen(true)
      }
      
    } catch (error) {
      console.error('大会情報の処理に失敗しました:', error)
      alert('大会情報の処理に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // エントリー登録
  const handleEntrySubmit = async (entriesData: EntryFormData[]) => {
    setIsLoading(true)
    try {
      // 編集モードの場合はeditingDataからcompetition_idを取得
      const competitionId = createdCompetitionId || 
        (editingData && typeof editingData === 'object' && 'competition_id' in editingData 
          ? editingData.competition_id 
          : undefined)
      
      if (!competitionId) {
        throw new Error('Competition ID が見つかりません')
      }

      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList = []

      // 各エントリーを作成または更新
      for (const entryData of entriesData) {
        // 編集モードでentryDataにidがある場合は更新、そうでなければチェックしてから作成/更新
        let entry
        if (entryData.id && editingData?.type === 'entry') {
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
        const style = styles.find(s => s.id === parseInt(String(entryData.styleId)))
        if (entry) {
          createdEntriesList.push({
            ...entry,
            styleName: style?.name_jp || ''
          })
        }
      }

      setCreatedEntries(createdEntriesList)
      
      // エントリーフォームを閉じる
      setIsEntryLogFormOpen(false)
      
      // 編集モードの場合は、Record作成フォームは開かない（モーダルを閉じる）
      if (editingData?.type === 'entry') {
        setEditingData(null)
        setCreatedCompetitionId(null)
        setCreatedEntries([])
        setCalendarRefreshKey(prev => prev + 1) // カレンダーを更新
        alert('エントリーを更新しました')
      } else {
        // 新規作成モード: 最初のエントリー情報を使ってRecord作成フォームを開く
        if (createdEntriesList.length > 0) {
          setIsRecordLogFormOpen(true)
        }
        alert(createdEntriesList.length === 1 ? 'エントリーを登録しました' : `${createdEntriesList.length}件のエントリーを登録しました`)
      }
    } catch (error) {
      console.error('エントリーの登録に失敗しました:', error)
      alert('エントリーの登録に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // エントリーをスキップ
  const handleEntrySkip = () => {
    if (!createdCompetitionId) {
      alert('大会IDが取得できませんでした。エントリーを先に登録してください。')
      return
    }
    setIsEntryLogFormOpen(false)
    setIsRecordLogFormOpen(true)
  }

  // 記録登録・更新
  const handleRecordLogSubmit = async (formData: RecordFormData) => {
    setIsLoading(true)
    try {
      
      const recordInput = {
        style_id: parseInt(formData.styleId),
        time: formData.time,
        video_url: formData.videoUrl || null,
        note: formData.note || null,
        is_relaying: formData.isRelaying || false,
        competition_id: createdCompetitionId || 
          (editingData && typeof editingData === 'object' && 'competition_id' in editingData
            ? editingData.competition_id || null
            : (editingData && typeof editingData === 'object' && 'metadata' in editingData && 
               editingData.metadata && typeof editingData.metadata === 'object' && 
               'record' in editingData.metadata && editingData.metadata.record &&
               typeof editingData.metadata.record === 'object' && 'competition_id' in editingData.metadata.record
              ? editingData.metadata.record.competition_id || null
              : null))
      }

      if (editingData && editingData.id) {
        // 更新処理
        await updateRecord(editingData.id, recordInput)
        
        // スプリットタイム更新
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes
            .filter((st) => {
              // distanceが数値で、splitTimeが0より大きい場合のみ
              const distance = typeof st.distance === 'number' ? st.distance : parseInt(String(st.distance))
              return !isNaN(distance) && distance > 0 && st.splitTime > 0
            })
            .map((st) => ({
              distance: typeof st.distance === 'number' ? st.distance : parseInt(String(st.distance)),
              split_time: st.splitTime  // 秒単位のDECIMAL
            }))
          
          // 有効なスプリットタイムがある場合のみ更新
          if (splitTimesData.length > 0) {
            await replaceSplitTimes(editingData.id, splitTimesData)
          }
        }
        alert('記録を更新しました')
      } else {
        // 作成処理
        const newRecord = await createRecord(recordInput)
        
        // スプリットタイム作成
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes
            .filter((st) => {
              // distanceが数値で、splitTimeが0より大きい場合のみ
              const distance = typeof st.distance === 'number' ? st.distance : parseInt(String(st.distance))
              const isValid = !isNaN(distance) && distance > 0 && st.splitTime > 0
              return isValid
            })
            .map((st) => ({
              record_id: newRecord.id,
              distance: typeof st.distance === 'number' ? st.distance : parseInt(String(st.distance)),
              split_time: st.splitTime  // 秒単位のDECIMAL
            }))
          
          // 有効なスプリットタイムがある場合のみ作成
          if (splitTimesData.length > 0) {
            await createSplitTimes(newRecord.id, splitTimesData)
          }
        }
        alert('記録を登録しました')
      }

      // データを再取得
      await Promise.all([refetchRecords()])
      setCalendarRefreshKey(prev => prev + 1)
      
    } catch (error) {
      console.error('記録の処理に失敗しました:', error)
      alert('記録の処理に失敗しました。')
    } finally {
      setIsLoading(false)
      setIsRecordLogFormOpen(false)
      setSelectedDate(null)
      setEditingData(null)
      setCreatedCompetitionId(null)
      setCreatedEntries([])
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
            setSelectedDate(date)
            setEditingData(null)
            if (type === 'practice') {
              setIsPracticeBasicFormOpen(true)
            } else {
              setIsCompetitionBasicFormOpen(true)
            }
          }} 
          onEditItem={(item) => {
            // 日付文字列をDateオブジェクトに変換（タイムゾーン考慮）
            const dateObj = parseDateString(item.date)
            setSelectedDate(dateObj)
            setEditingData(item)
            
            if (item.type === 'practice' || item.type === 'team_practice') {
              // Practice編集モーダルを開く
              setIsPracticeBasicFormOpen(true)
            } else if (item.type === 'practice_log') {
              // PracticeLog編集モーダルを開く
              setEditingData(item)
              setIsPracticeLogFormOpen(true)
            } else if (item.type === 'entry') {
              // Entry編集モーダルを開く
              setIsEntryLogFormOpen(true)
            } else if (item.type === 'record') {
              // Record編集モーダルを開く
              // 大会情報も一緒に編集データに含める
              setIsCompetitionBasicFormOpen(true)
            } else if (item.type === 'competition' || item.type === 'team_competition') {
              // Competition編集モーダルを開く
              setIsCompetitionBasicFormOpen(true)
            }
          }}
          onDeleteItem={handleDeleteItem}
          onAddPracticeLog={(practiceId) => {
            setCreatedPracticeId(practiceId)
            setEditingData(null)
            setIsPracticeLogFormOpen(true)
          }}
          onEditPracticeLog={(log) => {
            // PracticeLog編集モーダルを開く
            setEditingData(log as unknown as EditingData)
            setIsPracticeLogFormOpen(true)
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
              setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新

              alert('練習ログを削除しました')
            } catch (error) {
              console.error('練習ログの削除に失敗しました:', error)
              alert('練習ログの削除に失敗しました。')
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
              setCreatedCompetitionId(null)
              setEditingData(null)
              setIsCompetitionBasicFormOpen(true)
              return
            }
            
            setCreatedCompetitionId(competitionId)
            
            if (entryData) {
              // エントリーデータがある場合は直接Record作成フォームを開く
              console.log('Opening RecordLogForm with entryData')
              setEditingData({ entryData } as EditingData)
              setIsRecordLogFormOpen(true)
            } else {
              // エントリーデータがない場合はEntry作成フォームを開く
              console.log('Opening EntryLogForm (no entryData)')
              setEditingData(null)
              setIsEntryLogFormOpen(true)
            }
          }}
          onEditRecord={(record) => {
            // Record編集モーダルを開く
            // RecordLogFormに必要な形式に変換
            const editData = {
              id: record.id,
              style_id: record.style_id || record.style?.id,
              time: record.time || record.time_result,
              is_relaying: record.is_relaying,
              note: record.note,
              video_url: record.video_url,
              split_times: record.split_times || [],
              competition_id: record.competition_id
            }
            
            setEditingData(editData as unknown as EditingData)
            setIsRecordLogFormOpen(true)
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
              setCalendarRefreshKey(prev => prev + 1)

              alert('大会記録を削除しました')
            } catch (error) {
              console.error('大会記録の削除に失敗しました:', error)
              alert('大会記録の削除に失敗しました。')
            }
          }}
          openDayDetail={null}
        />

        {/* 第1段階: 練習基本情報フォーム */}
        <PracticeBasicForm
          isOpen={isPracticeBasicFormOpen}
          onClose={() => {
            setIsPracticeBasicFormOpen(false)
            setSelectedDate(null)
            setEditingData(null)
            setCreatedPracticeId(null)
          }}
          onSubmit={handlePracticeBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={editingData && typeof editingData === 'object' && 'metadata' in editingData
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
            setIsPracticeLogFormOpen(false)
            setSelectedDate(null)
            setEditingData(null)
            setCreatedPracticeId(null)
          }}
          onSubmit={handlePracticeLogSubmit}
          practiceId={createdPracticeId || 
            (editingData && typeof editingData === 'object' && 'practice_id' in editingData 
              ? (editingData.practice_id || '')
              : '')}
          editData={undefined}
          isLoading={isLoading}
          availableTags={availableTags}
          setAvailableTags={setAvailableTags}
          styles={[]}
        />

        {/* 第1段階: 大会基本情報フォーム */}
        <CompetitionBasicForm
          isOpen={isCompetitionBasicFormOpen}
          onClose={() => {
            setIsCompetitionBasicFormOpen(false)
            setSelectedDate(null)
            setEditingData(null)
            setCreatedCompetitionId(null)
          }}
          onSubmit={handleCompetitionBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={undefined}
          isLoading={isLoading}
        />

        {/* 第2段階: エントリー登録フォーム（SKIP可能） */}
        <EntryLogForm
          isOpen={isEntryLogFormOpen}
          onClose={() => {
            setIsEntryLogFormOpen(false)
            setSelectedDate(null)
            setCreatedCompetitionId(null)
            setCreatedEntries([])
            setEditingData(null)
          }}
          onSubmit={handleEntrySubmit}
          onSkip={handleEntrySkip}
          competitionId={createdCompetitionId || 
            (editingData && typeof editingData === 'object' && 'competition_id' in editingData 
              ? editingData.competition_id || ''
              : '')}
          isLoading={isLoading}
          styles={styles.map(s => ({ id: s.id.toString(), nameJp: s.name_jp, distance: s.distance }))}
          editData={editingData?.type === 'entry' ? editingData : undefined}
        />

        {/* 第3段階: 記録登録フォーム */}
        <RecordLogForm
          isOpen={isRecordLogFormOpen}
          onClose={() => {
            setIsRecordLogFormOpen(false)
            setSelectedDate(null)
            setEditingData(null)
            setCreatedCompetitionId(null)
            setCreatedEntries([])
          }}
          onSubmit={handleRecordLogSubmit}
          competitionId={createdCompetitionId || 
            (editingData && typeof editingData === 'object' && 'competition_id' in editingData 
              ? editingData.competition_id || ''
              : '')}
          editData={editingData?.id ? editingData : null}
          isLoading={isLoading}
          styles={styles}
          entryData={(() => {
            // editingData.entryDataからEntryInfoを作成
            if (editingData && typeof editingData === 'object' && 'entryData' in editingData 
              && editingData.entryData 
              && typeof editingData.entryData === 'object' 
              && editingData.entryData !== null) {
              const entryData = editingData.entryData
              if ('styleId' in entryData && 'styleName' in entryData && 'entryTime' in entryData) {
                const styleId = typeof entryData.styleId === 'number' ? entryData.styleId 
                  : typeof entryData.styleId === 'string' ? Number(entryData.styleId) 
                  : undefined
                const styleName = typeof entryData.styleName === 'string' ? entryData.styleName : ''
                const entryTime = typeof entryData.entryTime === 'number' ? entryData.entryTime 
                  : entryData.entryTime === null ? null 
                  : undefined
                
                if (styleId !== undefined && styleName !== undefined && entryTime !== undefined) {
                  return { styleId, styleName, entryTime } as import('@apps/shared/types/ui').EntryInfo
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
          })()}
        />
      </div>
    </div>
  )
}
