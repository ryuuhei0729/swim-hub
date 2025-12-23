import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
} from '@apps/shared/hooks/queries/practices'
import { practiceKeys } from '@apps/shared/hooks/queries/keys'
import { PracticeAPI } from '@apps/shared/api/practices'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import type { MainStackParamList } from '@/navigation/types'
import type { PracticeTag, PracticeTime } from '@apps/shared/types/database'
import type { TimeEntry } from '@apps/shared/types/ui'
import { formatTime } from '@/utils/formatters'
import { usePracticeTimeStore } from '@/stores/practiceTimeStore'

type PracticeLogFormScreenRouteProp = RouteProp<MainStackParamList, 'PracticeLogForm'>
type PracticeLogFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

// 種目の選択肢
const SWIM_STYLES = [
  { value: 'Fr', label: 'フリー' },
  { value: 'Ba', label: 'バック' },
  { value: 'Br', label: 'ブレスト' },
  { value: 'Fly', label: 'バタフライ' },
  { value: 'IM', label: '個人メドレー' },
]

interface PracticeMenu {
  id: string
  style: string
  distance: number | ''
  reps: number | ''
  sets: number | ''
  circleMin: number | ''
  circleSec: number | ''
  note: string
  tags: PracticeTag[]
  times: Array<TimeEntry & { id?: string }>
}

/**
 * 練習ログ作成・編集画面
 * 練習ログの詳細情報（距離、本数、セット数、サークル、種目、タイム、タグ）を入力・編集
 */
export const PracticeLogFormScreen: React.FC = () => {
  const route = useRoute<PracticeLogFormScreenRouteProp>()
  const navigation = useNavigation<PracticeLogFormScreenNavigationProp>()
  const { practiceId, practiceLogId } = route.params
  const { supabase } = useAuth()
  const queryClient = useQueryClient()
  const isEditMode = practiceLogId !== undefined

  // メニューデータ（複数）
  const [menus, setMenus] = useState<PracticeMenu[]>([
    {
      id: `menu-${Date.now()}`,
      style: 'Fr',
      distance: '',
      reps: '',
      sets: '',
      circleMin: '',
      circleSec: '',
      note: '',
      tags: [],
      times: [],
    },
  ])

  // 利用可能なタグ（タグ機能実装時に使用）
  // const [availableTags, setAvailableTags] = useState<PracticeTag[]>([])
  // const [loadingTags, setLoadingTags] = useState(true)

  // 既存データの取得（編集モード時）
  const [loadingPracticeLog, setLoadingPracticeLog] = useState(isEditMode)
  const initializedRef = useRef(false)

  // タグ一覧を取得（タグ機能実装時に有効化）
  // useEffect(() => {
  //   const loadTags = async () => {
  //     try {
  //       setLoadingTags(true)
  //       const api = new PracticeAPI(supabase)
  //       const tags = await api.getPracticeTags()
  //       setAvailableTags(tags)
  //     } catch (error) {
  //       console.error('タグ取得エラー:', error)
  //     } finally {
  //       setLoadingTags(false)
  //     }
  //   }
  //   loadTags()
  // }, [supabase])

  // 既存データの取得（編集モード時）
  useEffect(() => {
    if (initializedRef.current) return

    if (isEditMode && practiceLogId !== undefined) {
      const loadPracticeLog = async () => {
        try {
          setLoadingPracticeLog(true)
          
          // 直接Supabaseからpractice_logを取得
          const { data: practiceLogData, error: logError } = await supabase
            .from('practice_logs')
            .select(`
              *,
              practice_times (*),
              practice_log_tags (
                practice_tag_id,
                practice_tags (
                  id,
                  name,
                  color
                )
              )
            `)
            .eq('id', practiceLogId)
            .single()

          if (logError) throw logError
          if (!practiceLogData) {
            console.error('練習ログが見つかりませんでした')
            setLoadingPracticeLog(false)
            return
          }

          // データを整形
          const circleMin = practiceLogData.circle ? Math.floor(practiceLogData.circle / 60) : ''
          const circleSec = practiceLogData.circle ? practiceLogData.circle % 60 : ''

          // タイムデータを整形
          const times: Array<TimeEntry & { id?: string }> = (practiceLogData.practice_times || []).map((time: PracticeTime) => ({
            id: time.id,
            setNumber: time.set_number,
            repNumber: time.rep_number,
            time: time.time,
          }))

          // タグデータを整形
          const tags: PracticeTag[] =
            (practiceLogData.practice_log_tags || []).map((plt: { practice_tags: PracticeTag }) => plt.practice_tags).filter(Boolean) || []

          setMenus([
            {
              id: practiceLogData.id,
              style: practiceLogData.style,
              distance: practiceLogData.distance,
              reps: practiceLogData.rep_count,
              sets: practiceLogData.set_count,
              circleMin,
              circleSec,
              note: practiceLogData.note || '',
              tags,
              times,
            },
          ])
          initializedRef.current = true
          setLoadingPracticeLog(false)
        } catch (error) {
          console.error('練習ログ取得エラー:', error)
          Alert.alert(
            'エラー',
            error instanceof Error ? error.message : '練習ログの取得に失敗しました',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          )
          setLoadingPracticeLog(false)
        }
      }

      loadPracticeLog()
    } else {
      initializedRef.current = true
      setLoadingPracticeLog(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, practiceLogId, practiceId])

  // ミューテーション
  const createMutation = useCreatePracticeLogMutation(supabase)
  const updateMutation = useUpdatePracticeLogMutation(supabase)

  // メニュー追加
  const addMenu = () => {
    setMenus((prev) => [
      ...prev,
      {
        id: `menu-${Date.now()}-${Math.random()}`,
        style: 'Fr',
        distance: '',
        reps: '',
        sets: '',
        circleMin: '',
        circleSec: '',
        note: '',
        tags: [],
        times: [],
      },
    ])
  }

  // メニュー削除
  const removeMenu = (id: string) => {
    setMenus((prev) => {
      if (prev.length <= 1) {
        return prev
      }
      return prev.filter((menu) => menu.id !== id)
    })
  }

  // メニュー更新
  const updateMenu = (id: string, field: keyof PracticeMenu, value: string | number | '' | PracticeTag[] | Array<TimeEntry & { id?: string }>) => {
    setMenus((prev) =>
      prev.map((menu) => (menu.id === id ? { ...menu, [field]: value } : menu))
    )
  }

  // タイム入力画面へ遷移
  const handleTimeInput = (menuId: string) => {
    const menu = menus.find((m) => m.id === menuId)
    if (!menu) return

    // 現在編集中のメニューIDを保存
    setCurrentMenuId(menuId)

    navigation.navigate('PracticeTimeForm', {
      practiceLogId: isEditMode && menuId === practiceLogId && practiceLogId !== undefined ? practiceLogId : undefined,
      setCount: Number(menu.sets) || 1,
      repCount: Number(menu.reps) || 1,
      initialTimes: menu.times.map((t) => ({
        id: t.id || `${t.setNumber}-${t.repNumber}`,
        setNumber: t.setNumber,
        repNumber: t.repNumber,
        time: t.time,
      })),
    })
  }

  // タイムデータのストア
  const { getTimes, setCurrentMenuId } = usePracticeTimeStore()

  // タイム入力画面から戻ってきた時の処理
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // タイム入力画面から戻ってきた時に、保存されたタイムデータを取得
      const currentMenuId = usePracticeTimeStore.getState().currentMenuId
      if (currentMenuId) {
        const savedTimes = getTimes(currentMenuId)
        if (savedTimes.length > 0) {
          // TimeEntryにidを追加
          const timesWithId = savedTimes.map((t) => ({
            ...t,
            id: `${t.setNumber}-${t.repNumber}-${Date.now()}`,
          }))
          updateMenu(currentMenuId, 'times', timesWithId)
        }
        setCurrentMenuId(null)
      }
    })

    return unsubscribe
  }, [navigation, getTimes, setCurrentMenuId])

  // バリデーション
  const validate = (): boolean => {
    for (const menu of menus) {
      if (!menu.style || menu.style.trim() === '') {
        Alert.alert('エラー', '種目を選択してください')
        return false
      }
      if (!menu.distance || Number(menu.distance) <= 0) {
        Alert.alert('エラー', '距離を入力してください')
        return false
      }
      if (!menu.reps || Number(menu.reps) <= 0) {
        Alert.alert('エラー', '本数を入力してください')
        return false
      }
      if (!menu.sets || Number(menu.sets) <= 0) {
        Alert.alert('エラー', 'セット数を入力してください')
        return false
      }
    }
    return true
  }

  // 保存処理
  const handleSave = async () => {
    if (!validate()) {
      return
    }

    try {
      const api = new PracticeAPI(supabase)

      for (const menu of menus) {
        // サークルタイムを秒に変換
        const circleMin = Number(menu.circleMin) || 0
        const circleSec = Number(menu.circleSec) || 0
        const circleTime = circleMin * 60 + circleSec

        const logData = {
          practice_id: practiceId,
          style: menu.style,
          distance: Number(menu.distance),
          rep_count: Number(menu.reps),
          set_count: Number(menu.sets),
          circle: circleTime > 0 ? circleTime : null,
          note: menu.note && menu.note.trim() !== '' ? menu.note.trim() : null,
        }

        if (isEditMode && menu.id === practiceLogId && practiceLogId !== undefined) {
          // 更新
          await updateMutation.mutateAsync({
            id: practiceLogId,
            updates: logData,
          })

          // タイムを更新
          await api.replacePracticeTimes(
            practiceLogId,
            menu.times ? menu.times.map((t) => ({
              set_number: t.setNumber,
              rep_number: t.repNumber,
              time: t.time,
            })) : []
          )

          // タグを更新
          // TODO: タグの更新処理を実装
        } else {
          // 作成
          const createdLog = await createMutation.mutateAsync(logData)

          // タイムを作成
          await api.replacePracticeTimes(
            createdLog.id,
            menu.times ? menu.times.map((t) => ({
              set_number: t.setNumber,
              rep_number: t.repNumber,
              time: t.time,
            })) : []
          )

          // タグを作成
          // TODO: タグの作成処理を実装
        }
      }

      // カレンダーのクエリを無効化してリフレッシュ
      // カレンダーと練習一覧のクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })

      // 成功: 前の画面に戻る（練習タブから来た場合は練習タブに戻る）
      navigation.goBack()
    } catch (error) {
      console.error('保存エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : '保存に失敗しました',
        [{ text: 'OK' }]
      )
    }
  }

  // キャンセル処理
  const handleCancel = () => {
    navigation.goBack()
  }

  // ローディング状態
  if (loadingPracticeLog) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="練習ログを読み込み中..." />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        {/* メニューセクション */}
        <View style={styles.menuSection}>
          <View style={styles.menuHeader}>
            <Text style={styles.sectionTitle}>練習メニュー</Text>
            <Pressable style={styles.addButton} onPress={addMenu}>
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>メニューを追加</Text>
            </Pressable>
          </View>

          {menus.map((menu, index) => (
            <View key={menu.id} style={styles.menuContainer}>
              {/* メニューヘッダー */}
              <View style={styles.menuItemHeader}>
                <Text style={styles.menuNumber}>メニュー {index + 1}</Text>
                {menus.length > 1 && (
                  <Pressable
                    style={styles.removeButton}
                    onPress={() => removeMenu(menu.id)}
                  >
                    <Feather name="trash-2" size={18} color="#EF4444" />
                  </Pressable>
                )}
              </View>

              {/* 種目 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  種目 <Text style={styles.required}>*</Text>
                </Text>
                <View style={styles.pickerContainer}>
                  {SWIM_STYLES.map((style) => (
                    <Pressable
                      key={style.value}
                      style={[
                        styles.pickerOption,
                        menu.style === style.value && styles.pickerOptionSelected,
                      ]}
                      onPress={() => updateMenu(menu.id, 'style', style.value)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          menu.style === style.value && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {style.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 距離、本数、セット数 */}
              <View style={styles.row}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    距離(m) <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={menu.distance.toString()}
                    onChangeText={(text) => {
                      const num = text === '' ? '' : Number(text)
                      updateMenu(menu.id, 'distance', num)
                    }}
                    placeholder="100"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    本数 <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={menu.reps.toString()}
                    onChangeText={(text) => {
                      const num = text === '' ? '' : Number(text)
                      updateMenu(menu.id, 'reps', num)
                    }}
                    placeholder="4"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    セット数 <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={menu.sets.toString()}
                    onChangeText={(text) => {
                      const num = text === '' ? '' : Number(text)
                      updateMenu(menu.id, 'sets', num)
                    }}
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* サークル（分・秒） */}
              <View style={styles.row}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>サークル(分)</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.circleMin.toString()}
                    onChangeText={(text) => {
                      const num = text === '' ? '' : Number(text)
                      updateMenu(menu.id, 'circleMin', num)
                    }}
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>サークル(秒)</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.circleSec.toString()}
                    onChangeText={(text) => {
                      const num = text === '' ? '' : Number(text)
                      updateMenu(menu.id, 'circleSec', num)
                    }}
                    placeholder="30"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* タイム入力ボタン */}
              <View style={styles.field}>
                <Text style={styles.label}>練習タイム</Text>
                <Pressable
                  style={styles.timeButton}
                  onPress={() => handleTimeInput(menu.id)}
                >
                  <Feather name="clock" size={16} color="#374151" />
                  <Text style={styles.timeButtonText}>
                    {menu.times && menu.times.length > 0
                      ? `タイムを編集 (${menu.times.length}件登録済み)`
                      : 'タイムを入力'}
                  </Text>
                </Pressable>
              </View>

              {/* 既存タイム表示 */}
              {menu.times && menu.times.length > 0 && (
                <View style={styles.timesContainer}>
                  <Text style={styles.timesLabel}>登録済みタイム</Text>
                  <View style={styles.timesTable}>
                    {Array.from({ length: Number(menu.sets) || 1 }, (_, setIndex) => {
                      const setNumber = setIndex + 1
                      const setTimes = menu.times.filter(
                        (t) => t.setNumber === setNumber && t.time > 0
                      )
                      const setAverage =
                        setTimes.length > 0
                          ? setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
                          : 0
                      const setFastest =
                        setTimes.length > 0 ? Math.min(...setTimes.map((t) => t.time)) : 0

                      return (
                        <View key={setNumber} style={styles.setRow}>
                          <Text style={styles.setLabel}>{setNumber}セット目</Text>
                          <View style={styles.setTimes}>
                            {Array.from({ length: Number(menu.reps) || 1 }, (_, repIndex) => {
                              const repNumber = repIndex + 1
                              const time = menu.times.find(
                                (t) => t.setNumber === setNumber && t.repNumber === repNumber
                              )
                              const isFastest =
                                time && time.time > 0 && time.time === setFastest

                              return (
                                <View key={repNumber} style={styles.timeCell}>
                                  <Text style={styles.timeCellLabel}>{repNumber}本目</Text>
                                  <Text
                                    style={[
                                      styles.timeCellValue,
                                      isFastest && styles.timeCellValueFastest,
                                    ]}
                                  >
                                    {time && time.time > 0 ? formatTime(time.time) : '-'}
                                  </Text>
                                </View>
                              )
                            })}
                          </View>
                          {setAverage > 0 && (
                            <Text style={styles.setAverage}>
                              平均: {formatTime(setAverage)}
                            </Text>
                          )}
                        </View>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* メモ */}
              <View style={styles.field}>
                <Text style={styles.label}>メモ</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={menu.note}
                  onChangeText={(text) => updateMenu(menu.id, 'note', text)}
                  placeholder="メモ（任意）"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              {/* タグ入力 */}
              <View style={styles.field}>
                <Text style={styles.label}>タグ</Text>
                <Text style={styles.tagPlaceholder}>
                  タグ機能は後で実装します
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ボタン */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.cancelButton]}
            onPress={handleCancel}
          >
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.saveButton]}
            onPress={handleSave}
          >
            <Text style={styles.saveButtonText}>保存</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  content: {
    padding: 16,
  },
  form: {
    gap: 20,
  },
  menuSection: {
    gap: 16,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  menuContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  menuNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  removeButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
    gap: 8,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  required: {
    color: '#DC2626',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  pickerOptionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  pickerOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  pickerOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  timeButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  timesContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  timesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  timesTable: {
    gap: 12,
  },
  setRow: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  setLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  setTimes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeCell: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    padding: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  timeCellLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 4,
  },
  timeCellValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  timeCellValueFastest: {
    color: '#2563EB',
  },
  setAverage: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  tagPlaceholder: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    backgroundColor: '#2563EB',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
