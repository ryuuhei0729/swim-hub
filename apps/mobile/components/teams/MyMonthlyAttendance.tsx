import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert, Modal } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { AttendanceStatus, TeamEvent } from '@swim-hub/shared/types'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ja } from 'date-fns/locale'

export interface MyMonthlyAttendanceProps {
  teamId: string
}

interface AttendanceEditState {
  status: AttendanceStatus | null
  note: string
}

interface MonthItem {
  year: number
  month: number
  status: 'has_unanswered' | 'all_answered' | null
  eventCount: number
  answeredCount: number
}

/**
 * 月別出欠管理コンポーネント（モバイル版）
 */
export const MyMonthlyAttendance: React.FC<MyMonthlyAttendanceProps> = ({ teamId }) => {
  const { supabase } = useAuth()
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])

  // 月リスト表示用の状態
  const [monthList, setMonthList] = useState<MonthItem[]>([])
  const [loadingMonthList, setLoadingMonthList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // モーダル表示用の状態
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // モーダル内の出欠情報とイベント情報（既存のロジックを再利用）
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(false)

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({})
  const [saving, setSaving] = useState(false)

  // 各月のステータスを計算
  const calculateMonthStatus = useCallback(async (year: number, month: number): Promise<{ eventCount: number; answeredCount: number; status: 'has_unanswered' | 'all_answered' | null }> => {
    const [startDateStr, endDateStr] = getMonthDateRange(year, month)
    
    // イベント数を取得
    const [practicesResult, competitionsResult] = await Promise.all([
      supabase
        .from('practices')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr),
      supabase
        .from('competitions')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
    ])
    
    if (practicesResult.error) throw practicesResult.error
    if (competitionsResult.error) throw competitionsResult.error
    
    const eventCount = (practicesResult.count || 0) + (competitionsResult.count || 0)
    
    // 自分の出欠回答数を取得
    const attendanceData = await attendanceAPI.getMyAttendancesByMonth(teamId, year, month)
    const answeredCount = attendanceData.length
    
    return {
      eventCount,
      answeredCount,
      status: eventCount === 0 ? null : (answeredCount < eventCount ? 'has_unanswered' : 'all_answered')
    }
  }, [teamId, supabase, attendanceAPI])

  // 月リストを取得
  const loadMonthList = useCallback(async () => {
    try {
      setLoadingMonthList(true)
      setError(null)

      const now = new Date()
      const startDateStr = format(startOfMonth(now), 'yyyy-MM-dd')
      const oneYearLater = addMonths(now, 12)
      const endDateStr = format(endOfMonth(oneYearLater), 'yyyy-MM-dd')
      
      // 練習・大会を取得（日付のみ）
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr),
        supabase
          .from('competitions')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error
      
      // 月ごとにグループ化
      const monthSet = new Set<string>()
      const allDates = [
        ...(practicesResult.data || []).map(p => p.date),
        ...(competitionsResult.data || []).map(c => c.date)
      ]
      
      allDates.forEach(dateStr => {
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        monthSet.add(monthKey)
      })
      
      // 月リストを作成してステータスを計算
      const monthList: MonthItem[] = []
      const sortedMonthKeys = Array.from(monthSet).sort()
      
      for (const monthKey of sortedMonthKeys) {
        const [yearStr, monthStr] = monthKey.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)
        
        const status = await calculateMonthStatus(year, month)
        monthList.push({
          year,
          month,
          ...status
        })
      }
      
      setMonthList(monthList)
    } catch (err) {
      console.error('月リストの取得に失敗:', err)
      setError('月リストの取得に失敗しました')
    } finally {
      setLoadingMonthList(false)
    }
  }, [teamId, supabase, calculateMonthStatus])

  // 月別の出欠情報を取得（モーダル用）
  const loadAttendances = useCallback(async () => {
    if (!selectedMonth) return

    try {
      setLoading(true)
      setError(null)

      // 月の開始日と終了日を計算
      const [startDateStr, endDateStr] = getMonthDateRange(selectedMonth.year, selectedMonth.month)

      // 練習と大会を取得
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true })
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      // イベントを統合
      const practices: TeamEvent[] = (practicesResult.data || []).map((p) => ({
        ...p,
        type: 'practice' as const
      }))
      const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: 'competition' as const
      }))
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setEvents(allEvents)

      // 出欠情報を取得
      const attendanceData = await attendanceAPI.getMyAttendancesByMonth(
        teamId,
        selectedMonth.year,
        selectedMonth.month
      )
      setAttendances(attendanceData)

      // 編集状態を初期化（既存の出欠情報から）
      const initialEditStates: Record<string, AttendanceEditState> = {}
      attendanceData.forEach((attendance) => {
        const eventId = attendance.practice_id || attendance.competition_id
        if (eventId) {
          initialEditStates[eventId] = {
            status: attendance.status,
            note: attendance.note || ''
          }
        }
      })
      // イベントがあって出欠情報がない場合は未回答として初期化
      allEvents.forEach((event) => {
        if (!initialEditStates[event.id]) {
          initialEditStates[event.id] = {
            status: null,
            note: ''
          }
        }
      })
      setEditStates(initialEditStates)
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, selectedMonth, supabase, attendanceAPI])

  // 月リストを初期読み込み
  useEffect(() => {
    loadMonthList()
  }, [loadMonthList])

  // モーダルが開かれたときに詳細データを読み込む
  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      loadAttendances()
    }
  }, [selectedMonth, isModalOpen, loadAttendances])

  // ステータス変更
  const handleStatusChange = (eventId: string, status: AttendanceStatus | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        status
      }
    }))
  }

  // 備考変更
  const handleNoteChange = (eventId: string, note: string) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        note
      }
    }))
  }

  // まとめて保存
  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setError(null)

      // 編集された出欠情報のみを抽出
      const updates = events
        .map((event) => {
          const editState = editStates[event.id]
          if (!editState) return null

          // 既存の出欠情報を取得
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )

          // 変更がない場合はスキップ
          if (existingAttendance) {
            if (
              existingAttendance.status === editState.status &&
              (existingAttendance.note || '') === editState.note
            ) {
              return null
            }
          } else if (editState.status === null && editState.note === '') {
            // 新規で未回答の場合はスキップ
            return null
          }

          return {
            attendanceId: existingAttendance?.id || '',
            status: editState.status,
            note: editState.note || null
          }
        })
        .filter((u): u is { attendanceId: string; status: AttendanceStatus | null; note: string | null } => u !== null)

      if (updates.length === 0) {
        // 変更がない場合は何もしない
        return
      }

      // 新規作成が必要な出欠情報を特定
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const newAttendances = events
        .filter((event) => {
          const editState = editStates[event.id]
          if (!editState) return false
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )
          return !existingAttendance && (editState.status !== null || editState.note !== '')
        })
        .map((event) => {
          const editState = editStates[event.id]
          return {
            user_id: user.id,
            practice_id: event.type === 'practice' ? event.id : null,
            competition_id: event.type === 'competition' ? event.id : null,
            status: editState.status,
            note: editState.note || null
          }
        })

      // 新規作成と更新を実行
      // 新規作成
      if (newAttendances.length > 0) {
        const { error: insertError } = await supabase
          .from('team_attendance')
          .insert(newAttendances)

        if (insertError) throw insertError
      }

      // 更新（既存のIDがあるもののみ）
      const updateOnly = updates.filter((u) => u.attendanceId !== '')
      if (updateOnly.length > 0) {
        await attendanceAPI.bulkUpdateMyAttendances(updateOnly)
      }

      // 再読み込み
      await loadAttendances()
      // 月リストも更新
      await loadMonthList()
      
      // 保存成功後、モーダルを閉じる
      handleCloseModal()
      Alert.alert('保存完了', '出欠情報を保存しました', [{ text: 'OK' }])
    } catch (err) {
      console.error('出欠情報の保存に失敗:', err)
      const errorMessage = err instanceof Error ? err.message : '出欠情報の保存に失敗しました'
      setError(errorMessage)
      Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
    } finally {
      setSaving(false)
    }
  }

  // 月アイテムをクリック
  const handleMonthClick = (year: number, month: number) => {
    setSelectedMonth({ year, month })
    setIsModalOpen(true)
  }

  // モーダルを閉じる
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedMonth(null)
    setEditStates({})
  }

  // 月名を取得
  const getMonthLabel = (year: number, month: number) => {
    return `${year}年${month}月`
  }

  // 月のステータスバッジ
  const StatusBadge = ({ status }: { status: 'has_unanswered' | 'all_answered' | null }) => {
    if (status === null) return null
    
    return (
      <View style={status === 'has_unanswered' ? styles.monthStatusBadgeUnanswered : styles.monthStatusBadgeAnswered}>
        <Text style={status === 'has_unanswered' ? styles.monthStatusBadgeTextUnanswered : styles.monthStatusBadgeTextAnswered}>
          {status === 'has_unanswered' ? '未回答あり' : '全て回答済み'}
        </Text>
      </View>
    )
  }

  // イベントのステータスバッジ
  const getStatusBadge = (status: 'open' | 'closed' | null | undefined) => {
    switch (status) {
      case 'open':
        return (
          <View style={styles.statusBadgeOpen}>
            <Text style={styles.statusBadgeTextOpen}>提出受付中</Text>
          </View>
        )
      case 'closed':
        return (
          <View style={styles.statusBadgeClosed}>
            <Text style={styles.statusBadgeTextClosed}>提出締切</Text>
          </View>
        )
      default:
        return (
          <View style={styles.statusBadgeDefault}>
            <Text style={styles.statusBadgeTextDefault}>未設定</Text>
          </View>
        )
    }
  }

  if (loadingMonthList) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>読み込み中...</Text>
        </View>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    )
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* 月リスト表示 */}
        {monthList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>表示できる月がありません</Text>
          </View>
        ) : (
          <View style={styles.monthListContainer}>
            {monthList.map((monthItem) => (
              <Pressable
                key={`${monthItem.year}-${monthItem.month}`}
                style={styles.monthItem}
                onPress={() => handleMonthClick(monthItem.year, monthItem.month)}
              >
                <Text style={styles.monthItemText}>
                  {getMonthLabel(monthItem.year, monthItem.month)}
                </Text>
                <StatusBadge status={monthItem.status} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 月詳細モーダル */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          {/* モーダルヘッダー */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedMonth ? getMonthLabel(selectedMonth.year, selectedMonth.month) : ''}
            </Text>
            <Pressable onPress={handleCloseModal} style={styles.modalCloseButton}>
              <Feather name="x" size={24} color="#374151" />
            </Pressable>
          </View>

          {/* モーダルコンテンツ */}
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>読み込み中...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={styles.eventsContainer}>
                {/* イベント一覧 */}
                {events.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>この月にはイベントがありません</Text>
                  </View>
                ) : (
                  <>
                    {events.map((event) => {
                      const editState = editStates[event.id] || { status: null, note: '' }

                      return (
                        <View
                          key={`${event.type}-${event.id}`}
                          style={[
                            styles.eventCard,
                            event.type === 'competition' && styles.eventCardCompetition
                          ]}
                        >
                          {/* イベント情報とステータスバッジ */}
                          <View style={styles.eventHeader}>
                            <View style={styles.eventInfo}>
                              <Text style={styles.eventDate}>
                                {format(new Date(event.date), 'M月d日(E)', { locale: ja })}
                              </Text>
                              <Text style={styles.eventTitle}>
                                {event.type === 'competition' ? event.title : '練習'}
                              </Text>
                              {event.place && (
                                <Text style={styles.eventPlace}>@{event.place}</Text>
                              )}
                            </View>
                            {getStatusBadge(event.attendance_status)}
                          </View>

                          {/* 出欠選択 */}
                          <View style={styles.attendanceButtons}>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === 'present' && styles.attendanceButtonActivePresent
                              ]}
                              onPress={() => handleStatusChange(event.id, 'present')}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === 'present' && styles.attendanceButtonTextActive
                                ]}
                              >
                                出席
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === 'absent' && styles.attendanceButtonActiveAbsent
                              ]}
                              onPress={() => handleStatusChange(event.id, 'absent')}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === 'absent' && styles.attendanceButtonTextActive
                                ]}
                              >
                                欠席
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === 'other' && styles.attendanceButtonActiveOther
                              ]}
                              onPress={() => handleStatusChange(event.id, 'other')}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === 'other' && styles.attendanceButtonTextActive
                                ]}
                              >
                                その他
                              </Text>
                            </Pressable>
                          </View>

                          {/* 備考入力 */}
                          <TextInput
                            style={styles.noteInput}
                            value={editState.note}
                            onChangeText={(text) => handleNoteChange(event.id, text)}
                            placeholder="備考を入力（任意）"
                            multiline
                            numberOfLines={2}
                          />
                        </View>
                      )
                    })}

                    {/* まとめて保存ボタン */}
                    <Pressable
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                      onPress={handleSaveAll}
                      disabled={saving}
                    >
                      <Text style={styles.saveButtonText}>
                        {saving ? '保存中...' : selectedMonth ? `${getMonthLabel(selectedMonth.year, selectedMonth.month)}分をまとめて保存` : '保存'}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 16,
    margin: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  monthListContainer: {
    gap: 8,
  },
  monthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
  },
  monthItemText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
  monthStatusBadgeUnanswered: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  monthStatusBadgeTextUnanswered: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  monthStatusBadgeAnswered: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  monthStatusBadgeTextAnswered: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  emptyContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  eventsContainer: {
    gap: 16,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
  },
  eventCardCompetition: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  eventDate: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  eventPlace: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadgeOpen: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextOpen: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '500',
  },
  statusBadgeClosed: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextClosed: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
  },
  statusBadgeDefault: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextDefault: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  attendanceButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  attendanceButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  attendanceButtonActivePresent: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  attendanceButtonActiveAbsent: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  attendanceButtonActiveOther: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  attendanceButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  attendanceButtonTextActive: {
    color: '#111827',
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
