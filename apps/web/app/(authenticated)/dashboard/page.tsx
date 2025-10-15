'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts'
import Calendar from './_components/Calendar'
import { TeamAnnouncements } from '@/components/team'
import { createClient } from '@/lib/supabase'
import { useEffect } from 'react'
import PracticeBasicForm from '@/components/forms/PracticeBasicForm'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import CompetitionBasicForm from '@/components/forms/CompetitionBasicForm'
import RecordLogForm from '@/components/forms/RecordLogForm'
import { usePractices } from '@apps/shared/hooks/usePractices'
import { useRecords } from '@apps/shared/hooks/useRecords'
import { useCalendarData } from './_hooks/useCalendarData'
import { StyleAPI } from '@apps/shared/api'

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const [teams, setTeams] = useState<any[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const supabase = createClient()

  // 練習記録フォーム用の状態（2段階対応）
  const [isPracticeBasicFormOpen, setIsPracticeBasicFormOpen] = useState(false)
  const [isPracticeLogFormOpen, setIsPracticeLogFormOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [editingData, setEditingData] = useState<any>(null)
  const [createdPracticeId, setCreatedPracticeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [availableTags, setAvailableTags] = useState<any[]>([])

  // 大会記録フォーム用の状態（2段階対応）
  const [isCompetitionBasicFormOpen, setIsCompetitionBasicFormOpen] = useState(false)
  const [isRecordLogFormOpen, setIsRecordLogFormOpen] = useState(false)
  const [createdCompetitionId, setCreatedCompetitionId] = useState<string | null>(null)
  const [styles, setStyles] = useState<any[]>([])

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

  // カレンダーデータ用のフック
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const { refetch: refetchCalendar } = useCalendarData(new Date(), user?.id)

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

        if (error) throw error

        setTeams(data || [])
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
      if (editingData) {
        // 編集モード: 更新
        await updatePractice(editingData.id, basicData)
        alert('練習予定を更新しました')
      } else {
        // 新規作成モード: 作成
        await createPractice(basicData)
        alert('練習予定を作成しました')
      }
      
      // フォームを閉じる
      setIsPracticeBasicFormOpen(false)
      setSelectedDate(null)
      setEditingData(null)
      
      // データを再取得
      console.log('データ再取得開始...')
      await Promise.all([refetch(), refetchCalendar()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      console.log('データ再取得完了')
      
    } catch (error) {
      console.error('練習予定の処理に失敗しました:', error)
      alert('練習予定の処理に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // 練習メニュー作成・更新処理
  const handlePracticeLogSubmit = async (formDataArray: any[]) => {
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
        
        await updatePracticeLog(editingData.id, logInput)
        
        // 既存のタグデータを削除
        await supabase
          .from('practice_log_tags')
          .delete()
          .eq('practice_log_id', editingData.id)
        
        // 新しいタグデータを保存
        if (menu.tags && menu.tags.length > 0) {
          for (const tag of menu.tags) {
            await supabase
              .from('practice_log_tags')
              .insert({
                practice_log_id: editingData.id,
                practice_tag_id: tag.id
              } as any)
          }
        }
        
        // 既存のタイムデータを削除
        const { data: existingTimes } = await supabase
          .from('practice_times')
          .select('id')
          .eq('practice_log_id', editingData.id) as any
        
        if (existingTimes && existingTimes.length > 0) {
          for (const time of existingTimes) {
            await deletePracticeTime((time as any).id)
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
              await supabase
                .from('practice_log_tags')
                .insert({
                  practice_log_id: createdLog.id,
                  practice_tag_id: tag.id
                } as any)
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
      console.log('データ再取得開始...')
      await Promise.all([refetch(), refetchCalendar()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      console.log('データ再取得完了')
      
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
  const handleDeleteItem = async (itemId: string, itemType?: 'practice' | 'record' | 'competition') => {
    if (!itemType) {
      console.error('アイテムタイプが不明です')
      return
    }

    if (!confirm('この記録を削除してもよろしいですか？')) {
      return
    }

    try {
      if (itemType === 'practice') {
        // 練習記録削除
        const { error } = await supabase
          .from('practices')
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
      } else if (itemType === 'competition') {
        // 大会削除
        const { error } = await supabase
          .from('competitions')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      }

      // データを再取得
      console.log('削除後データ再取得開始...')
      await Promise.all([refetch(), refetchRecords(), refetchCalendar()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      console.log('削除後データ再取得完了')
      
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
      if (editingData) {
        // 編集モード: 更新
        await updateCompetition(editingData.id, {
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        alert('大会情報を更新しました')
      } else {
        // 新規作成モード: 作成
        await createCompetition({
          date: basicData.date,
          title: basicData.title,
          place: basicData.place,
          pool_type: basicData.poolType,
          note: basicData.note
        })
        alert('大会情報を保存しました')
      }
      
      setIsCompetitionBasicFormOpen(false)
      setSelectedDate(null)
      setEditingData(null)
      setCreatedCompetitionId(null)
      
      // データを再取得
      await Promise.all([refetchRecords(), refetchCalendar()])
      setCalendarRefreshKey(prev => prev + 1)
      
    } catch (error) {
      console.error('大会情報の処理に失敗しました:', error)
      alert('大会情報の処理に失敗しました。')
    } finally {
      setIsLoading(false)
    }
  }

  // 記録登録・更新
  const handleRecordLogSubmit = async (formData: any) => {
    setIsLoading(true)
    try {
      console.log('handleRecordLogSubmit - formData:', formData)
      
      const recordInput = {
        style_id: parseInt(formData.styleId),
        time: formData.time,
        video_url: formData.videoUrl || null,
        note: formData.note || null,
        is_relaying: formData.isRelaying || false,
        competition_id: createdCompetitionId || editingData?.competition_id
      }
      
      console.log('recordInput:', recordInput)

      if (editingData && editingData.id) {
        // 更新処理
        await updateRecord(editingData.id, recordInput)
        
        // スプリットタイム更新
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes
            .filter((st: any) => {
              // distanceが数値で、splitTimeが0より大きい場合のみ
              const distance = typeof st.distance === 'number' ? st.distance : parseInt(st.distance)
              return !isNaN(distance) && distance > 0 && st.splitTime > 0
            })
            .map((st: any) => ({
              distance: typeof st.distance === 'number' ? st.distance : parseInt(st.distance),
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
        console.log('スプリットタイム処理開始 - formData.splitTimes:', formData.splitTimes)
        
        if (formData.splitTimes && formData.splitTimes.length > 0) {
          const splitTimesData = formData.splitTimes
            .filter((st: any) => {
              // distanceが数値で、splitTimeが0より大きい場合のみ
              const distance = typeof st.distance === 'number' ? st.distance : parseInt(st.distance)
              const isValid = !isNaN(distance) && distance > 0 && st.splitTime > 0
              console.log(`スプリット検証 - distance: ${st.distance} (type: ${typeof st.distance}), splitTime: ${st.splitTime}, isValid: ${isValid}`)
              return isValid
            })
            .map((st: any) => ({
              record_id: newRecord.id,
              distance: typeof st.distance === 'number' ? st.distance : parseInt(st.distance),
              split_time: st.splitTime  // 秒単位のDECIMAL
            }))
          
          console.log('マッピング後のスプリットタイムデータ:', splitTimesData)
          console.log('splitTimesDataの各要素を詳細確認:')
          splitTimesData.forEach((st: any, idx: number) => {
            console.log(`  [${idx}] record_id: ${st.record_id}, distance: ${st.distance} (${typeof st.distance}), split_time: ${st.split_time} (${typeof st.split_time})`)
          })
          
          // 有効なスプリットタイムがある場合のみ作成
          if (splitTimesData.length > 0) {
            console.log('createSplitTimes呼び出し - recordId:', newRecord.id, 'data:', splitTimesData)
            await createSplitTimes(newRecord.id, splitTimesData)
          } else {
            console.log('有効なスプリットタイムがないため、作成をスキップ')
          }
        } else {
          console.log('スプリットタイムが存在しないため、作成をスキップ')
        }
        alert('記録を登録しました')
      }

      // データを再取得
      await Promise.all([refetchRecords(), refetchCalendar()])
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
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full">
        {/* ページヘッダー */}
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            ダッシュボード
          </h1>
          <p className="text-gray-600">
            {profile?.name || 'ユーザー'}さん、お疲れ様です！
          </p>
        </div>

        {/* チームのお知らせセクション */}
        {!teamsLoading && teams.length > 0 && (
          <div className="pb-6 space-y-4">
            {teams.map((teamMembership: any) => (
              <div key={teamMembership.team_id} className="bg-white rounded-lg shadow">
                <div className="p-4 sm:p-6">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {teamMembership.team?.name} のお知らせ
                    </h2>
                    {teamMembership.role === 'ADMIN' && (
                      <span className="text-xs text-gray-500">管理者</span>
                    )}
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <TeamAnnouncements 
                      teamId={teamMembership.team_id}
                      isAdmin={teamMembership.role === 'ADMIN'}
                      viewOnly={true}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* カレンダーコンポーネント */}
        <Calendar 
          key={calendarRefreshKey} // 強制再レンダリング
          onDateClick={(date) => console.log('Date clicked:', date)}
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
            // 日付文字列をDateオブジェクトに変換（安全に）
            const dateObj = new Date(item.item_date + 'T00:00:00')
            setSelectedDate(dateObj)
            setEditingData(item)
            
            if (item.item_type === 'practice') {
              // Practice編集モーダルを開く
              setIsPracticeBasicFormOpen(true)
            } else if (item.item_type === 'record') {
              // Record編集モーダルを開く
              // 大会情報も一緒に編集データに含める
              setIsCompetitionBasicFormOpen(true)
            } else if (item.item_type === 'competition') {
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
            setEditingData(log)
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
              console.log('練習ログ削除後データ再取得開始...')
              await Promise.all([refetch(), refetchCalendar()])
              setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
              console.log('練習ログ削除後データ再取得完了')

              alert('練習ログを削除しました')
            } catch (error) {
              console.error('練習ログの削除に失敗しました:', error)
              alert('練習ログの削除に失敗しました。')
            }
          }}
          onAddRecord={(competitionId) => {
            setCreatedCompetitionId(competitionId)
            setEditingData(null)
            setIsRecordLogFormOpen(true)
          }}
          onEditRecord={(record) => {
            // Record編集モーダルを開く
            // RecordLogFormに必要な形式に変換
            console.log('onEditRecord - 受信したrecord:', record)
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
            console.log('onEditRecord - 変換後のeditData:', editData)
            setEditingData(editData)
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
              console.log('大会記録削除後データ再取得開始...')
              await Promise.all([refetchRecords(), refetchCalendar()])
              setCalendarRefreshKey(prev => prev + 1)
              console.log('大会記録削除後データ再取得完了')

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
          editData={editingData}
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
          practiceId={createdPracticeId || editingData?.practice_id || ''}
          editData={editingData}
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
          editData={editingData}
          isLoading={isLoading}
        />

        {/* 第2段階: 記録登録フォーム */}
        <RecordLogForm
          isOpen={isRecordLogFormOpen}
          onClose={() => {
            setIsRecordLogFormOpen(false)
            setSelectedDate(null)
            setEditingData(null)
            setCreatedCompetitionId(null)
          }}
          onSubmit={handleRecordLogSubmit}
          competitionId={createdCompetitionId || editingData?.competition_id || ''}
          editData={editingData}
          isLoading={isLoading}
          styles={styles}
        />
      </div>
    </div>
  )
}
