'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts'
import Calendar from './_components/Calendar'
import { TeamAnnouncements } from '@/components/team'
import { createClient } from '@/lib/supabase'
import { useEffect } from 'react'
import PracticeBasicForm from '@/components/forms/PracticeBasicForm'
import PracticeLogForm from '@/components/forms/PracticeLogForm'
import { usePractices } from '@shared/hooks/usePractices'
import { useCalendarData } from './_hooks/useCalendarData'

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

  // 練習記録用のフック
  const {
    createPractice,
    updatePractice,
    deletePractice,
    createPracticeLog,
    updatePracticeLog,
    deletePracticeLog,
    createPracticeTime,
    deletePracticeTime,
    refetch
  } = usePractices(supabase, {})

  // カレンダーデータ用のフック
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const { refetch: refetchCalendar } = useCalendarData(new Date(), user?.id)

  // チーム一覧とタグを取得
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

    loadTeams()
    loadTags()
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
  const handleDeleteItem = async (itemId: string, itemType?: 'practice' | 'record') => {
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
      } else {
        // 大会記録削除
        const { error } = await supabase
          .from('records')
          .delete()
          .eq('id', itemId)

        if (error) throw error
      }

      // データを再取得
      console.log('削除後データ再取得開始...')
      await Promise.all([refetch(), refetchCalendar()])
      setCalendarRefreshKey(prev => prev + 1) // カレンダー強制更新
      console.log('削除後データ再取得完了')
      
      // 成功通知
      alert('アイテムを削除しました')
    } catch (error) {
      console.error('記録の削除に失敗しました:', error)
      alert('記録の削除に失敗しました。')
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
            if (type === 'practice') {
              setSelectedDate(date)
              setEditingData(null)
              setIsPracticeBasicFormOpen(true)
            } else {
              // 大会記録はまだ未実装
              alert('大会記録の追加機能は実装中です')
            }
          }} 
          onEditItem={(item) => {
            // Practice編集モーダルを開く
            setEditingData(item)
            // 日付文字列をDateオブジェクトに変換（安全に）
            const dateObj = new Date(item.item_date + 'T00:00:00') // タイムゾーン問題を回避
            setSelectedDate(dateObj)
            setIsPracticeBasicFormOpen(true)
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
      </div>
    </div>
  )
}
