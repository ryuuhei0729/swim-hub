import React, { useState, useEffect} from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Modal } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthProvider'
import { EntryAPI } from '@apps/shared/api/entries'
import { StyleAPI } from '@apps/shared/api/styles'
import { useCompetitionFormStore, type EntryInfo } from '@/stores/competitionFormStore'
import { formatTime } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import type { MainStackParamList } from '@/navigation/types'
import type { Style } from '@apps/shared/types/database'

type EntryFormScreenRouteProp = RouteProp<MainStackParamList, 'EntryForm'>
type EntryFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

interface EntryData {
  id: string
  styleId: string
  entryTime: number // 秒単位
  entryTimeDisplayValue: string // 入力中の表示用
  note: string
}

/**
 * エントリー登録画面
 * 大会にエントリーする種目とエントリータイムを入力
 */
export const EntryLogFormScreen: React.FC = () => {
  const route = useRoute<EntryFormScreenRouteProp>()
  const navigation = useNavigation<EntryFormScreenNavigationProp>()
  const { competitionId, entryId, date } = route.params
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  // フォーム状態
  const [entries, setEntries] = useState<EntryData[]>([
    {
      id: '1',
      styleId: '',
      entryTime: 0,
      entryTimeDisplayValue: '',
      note: '',
    },
  ])
  const [swimStyles, setSwimStyles] = useState<Style[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingStyles, setLoadingStyles] = useState(true)
  const [loadingEntry, setLoadingEntry] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [pickingEntryIndex, setPickingEntryIndex] = useState<number | null>(null)

  // Zustandストア
  const { setCreatedEntries, setLoading: setStoreLoading } = useCompetitionFormStore()

  // 種目一覧を取得
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase)
        const stylesData = await styleApi.getStyles()
        setSwimStyles(stylesData)
      } catch (error) {
        console.error('種目取得エラー:', error)
        Alert.alert('エラー', '種目の取得に失敗しました')
      } finally {
        setLoadingStyles(false)
      }
    }
    fetchStyles()
  }, [supabase])

  // エントリーデータを取得（編集モードの場合）
  useEffect(() => {
    if (!entryId || loadingStyles || swimStyles.length === 0) return

    let isMounted = true

    const fetchEntry = async () => {
      try {
        setLoadingEntry(true)
        
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')

        const { data: entry, error } = await supabase
          .from('entries')
          .select('*')
          .eq('id', entryId)
          .single()

        if (!isMounted) return

        if (error) {
          console.error('エントリー取得エラー詳細:', error)
          console.error('エントリー取得エラー - entryId:', entryId)
          if (error.code === 'PGRST116') {
            // エントリーが見つからない場合
            Alert.alert('エラー', 'エントリーが見つかりませんでした')
            navigation.goBack()
            return
          }
          throw error
        }

        if (!entry) {
          console.log('エントリーデータがnullです')
          Alert.alert('エラー', 'エントリーデータが見つかりませんでした')
          navigation.goBack()
          return
        }

        // エントリーデータでフォームを初期化
        const entryData = {
          id: entry.id,
          styleId: String(entry.style_id),
          entryTime: entry.entry_time || 0,
          entryTimeDisplayValue: entry.entry_time ? formatTime(entry.entry_time) : '',
          note: entry.note || '',
        }
        console.log('取得したエントリーデータ:', entry)
        console.log('フォーム状態を更新:', entryData)
        setEntries([entryData])
      } catch (error) {
        if (!isMounted) return
        console.error('エントリー取得エラー:', error)
        Alert.alert('エラー', 'エントリーの取得に失敗しました')
        navigation.goBack()
      } finally {
        if (isMounted) {
          setLoadingEntry(false)
        }
      }
    }

    fetchEntry()

    return () => {
      isMounted = false
    }
  }, [entryId, swimStyles.length, loadingStyles, supabase, navigation])

  // 新規作成モードの場合、最初のエントリーにデフォルトの種目を設定
  useEffect(() => {
    if (entryId || loadingStyles || swimStyles.length === 0) return
    if (entries.length > 0 && !entries[0].styleId && swimStyles.length > 0) {
      setEntries((prev) =>
        prev.map((entry, index) =>
          index === 0 ? { ...entry, styleId: String(swimStyles[0].id) } : entry
        )
      )
    }
  }, [entryId, swimStyles, loadingStyles, entries])

  // タイム文字列を秒数に変換
  const parseTimeString = (timeString: string): number => {
    if (!timeString || timeString.trim() === '') return 0

    const trimmed = timeString.trim()
    if (!trimmed) return 0

    // "1:30.50" 形式
    if (trimmed.includes(':')) {
      const [minutesStr, secondsStr] = trimmed.split(':')
      const minutes = parseInt(minutesStr)
      const seconds = parseFloat(secondsStr)

      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return 0
      }

      return minutes * 60 + seconds
    }

    // "30.50" 形式
    const parsed = parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : 0
  }

  // バリデーション
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    // 少なくとも1つのエントリーが必要
    if (entries.length === 0) {
      Alert.alert('エラー', '少なくとも1つのエントリーを追加してください')
      return false
    }

    // 種目が選択されているか
    entries.forEach((entry, index) => {
      if (!entry.styleId) {
        newErrors[`style-${index}`] = '種目を選択してください'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // エントリー追加
  const addEntry = () => {
    const firstStyle = swimStyles.length > 0 ? swimStyles[0] : null
    const newEntry: EntryData = {
      id: `entry-${Date.now()}`,
      styleId: firstStyle?.id ? String(firstStyle.id) : '',
      entryTime: 0,
      entryTimeDisplayValue: '',
      note: '',
    }
    setEntries((prev) => [...prev, newEntry])
  }

  // エントリー削除
  const removeEntry = (entryId: string) => {
    if (entries.length > 1) {
      setEntries((prev) => prev.filter((entry) => entry.id !== entryId))
    }
  }

  // エントリー更新
  const updateEntry = (entryId: string, updates: Partial<EntryData>) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry

        const updated = { ...entry, ...updates }

        // エントリータイムが更新された場合、表示値も更新
        if ('entryTimeDisplayValue' in updates) {
          const timeValue = parseTimeString(updates.entryTimeDisplayValue || '')
          updated.entryTime = timeValue
        }

        return updated
      })
    )
  }

  // エントリー登録処理
  // 保存処理（保存してダッシュボードに戻る）
  const handleSave = async () => {
    if (!validate()) {
      return
    }

    setLoading(true)
    setStoreLoading(true)

    try {
      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList: EntryInfo[] = []

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      for (const entryData of entries) {
        // 既存エントリーの重複チェック
        const { data: existingEntryData } = await supabase
          .from('entries')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id)
          .eq('style_id', parseInt(entryData.styleId))
          .maybeSingle()
        
        const existingEntry = existingEntryData || null

        let entry
        if (existingEntry) {
          // 既存エントリーがある場合は更新
          entry = await entryAPI.updateEntry(existingEntry.id, {
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note && entryData.note.trim() !== '' ? entryData.note.trim() : null,
          })
        } else {
          // 新規作成
          entry = await entryAPI.createPersonalEntry({
            competition_id: competitionId,
            style_id: parseInt(entryData.styleId),
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note && entryData.note.trim() !== '' ? entryData.note.trim() : null,
          })
        }

        // 種目情報を取得
        const style = swimStyles.find((s) => s.id === parseInt(entryData.styleId))
        if (style && entry) {
          createdEntriesList.push({
            styleId: entry.style_id,
            styleName: style.name_jp,
            entryTime: entry.entry_time ?? undefined,
          })
        }
      }

      // ストアに保存
      setCreatedEntries(createdEntriesList)

      // カレンダーのクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      // 成功: ダッシュボードに戻る
      navigation.navigate('MainTabs', { screen: 'Dashboard' })
    } catch (error) {
      console.error('エントリー登録エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : 'エントリー登録に失敗しました',
        [{ text: 'OK' }]
      )
    } finally {
      setLoading(false)
      setStoreLoading(false)
    }
  }

  // 続けて大会記録を作成（RecordLogFormへ遷移）
  const handleContinueToRecord = async () => {
    if (!validate()) {
      return
    }

    setLoading(true)
    setStoreLoading(true)

    try {
      const entryAPI = new EntryAPI(supabase)
      const createdEntriesList: EntryInfo[] = []

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      for (const entryData of entries) {
        // 既存エントリーの重複チェック
        const { data: existingEntryData } = await supabase
          .from('entries')
          .select('id')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id)
          .eq('style_id', parseInt(entryData.styleId))
          .maybeSingle()
        
        const existingEntry = existingEntryData || null

        let entry
        if (existingEntry) {
          // 既存エントリーがある場合は更新
          entry = await entryAPI.updateEntry(existingEntry.id, {
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note && entryData.note.trim() !== '' ? entryData.note.trim() : null,
          })
        } else {
          // 新規作成
          entry = await entryAPI.createPersonalEntry({
            competition_id: competitionId,
            style_id: parseInt(entryData.styleId),
            entry_time: entryData.entryTime > 0 ? entryData.entryTime : null,
            note: entryData.note && entryData.note.trim() !== '' ? entryData.note.trim() : null,
          })
        }

        // 種目情報を取得
        const style = swimStyles.find((s) => s.id === parseInt(entryData.styleId))
        if (style && entry) {
          createdEntriesList.push({
            styleId: entry.style_id,
            styleName: style.name_jp,
            entryTime: entry.entry_time ?? undefined,
          })
        }
      }

      // ストアに保存
      setCreatedEntries(createdEntriesList)

      // カレンダーのクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      // 記録入力フォームに遷移
      navigation.navigate('RecordLogForm', {
        competitionId,
        entryDataList: createdEntriesList,
        date,
      })
    } catch (error) {
      console.error('エントリー登録エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : 'エントリー登録に失敗しました',
        [{ text: 'OK' }]
      )
    } finally {
      setLoading(false)
      setStoreLoading(false)
    }
  }

  // スキップ処理
  const handleSkip = () => {
    // エントリーなしで記録入力フォームに遷移
    navigation.navigate('RecordLogForm', {
      competitionId,
      entryDataList: [],
      date,
    })
  }

  if (loadingStyles || loadingEntry) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={loadingEntry ? "エントリーを読み込み中..." : "種目を読み込み中..."} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* エントリー種目セクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>エントリー種目</Text>
            <Pressable
              style={styles.addButton}
              onPress={addEntry}
              disabled={loading}
            >
              <Feather name="plus" size={16} color="#2563EB" />
              <Text style={styles.addButtonText}>種目を追加</Text>
            </Pressable>
          </View>
        </View>

        {/* エントリー一覧 */}
        {entries.map((entry, index) => (
          <React.Fragment key={entry.id}>
            {/* エントリーヘッダー */}
            <View style={styles.entryHeaderSection}>
              <Text style={styles.entryNumber}>種目 {index + 1}</Text>
              {entries.length > 1 && (
                <Pressable
                  style={styles.removeButton}
                  onPress={() => removeEntry(entry.id)}
                  disabled={loading}
                >
                  <Feather name="trash-2" size={18} color="#EF4444" />
                </Pressable>
              )}
            </View>

            {/* 種目選択 */}
            <View style={styles.section}>
              <Text style={styles.label}>
                種目 <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                style={[styles.pickerButton, errors[`style-${index}`] && styles.pickerButtonError]}
                onPress={() => {
                  setPickingEntryIndex(index)
                  setShowStylePicker(true)
                }}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerButtonText,
                    !entry.styleId && styles.pickerButtonPlaceholder,
                  ]}
                >
                  {entry.styleId
                    ? swimStyles.find((s) => s.id.toString() === entry.styleId)?.name_jp ||
                      '種目を選択'
                    : '種目を選択'}
                </Text>
                <Feather name="chevron-down" size={20} color="#6B7280" />
              </Pressable>
              {errors[`style-${index}`] && (
                <Text style={styles.errorText}>{errors[`style-${index}`]}</Text>
              )}
            </View>

            {/* エントリータイム */}
            <View style={styles.section}>
              <Text style={styles.label}>エントリータイム</Text>
              <TextInput
                style={styles.input}
                value={entry.entryTimeDisplayValue}
                onChangeText={(text) =>
                  updateEntry(entry.id, { entryTimeDisplayValue: text })
                }
                placeholder="例: 2:05.00 または 125.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="default"
                editable={!loading}
              />
              {entry.entryTime > 0 && (
                <Text style={styles.timeHint}>
                  入力値: {formatTime(entry.entryTime)}
                </Text>
              )}
            </View>

            {/* メモ */}
            <View style={styles.section}>
              <Text style={styles.label}>メモ</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={entry.note}
                onChangeText={(text) => updateEntry(entry.id, { note: text })}
                placeholder="メモ（任意）"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>
          </React.Fragment>
        ))}
      </ScrollView>

      {/* 種目選択モーダル */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStylePicker(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowStylePicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>種目を選択</Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setShowStylePicker(false)}
              >
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView style={styles.modalBody}>
              {swimStyles.map((style) => {
                const entry = entries[pickingEntryIndex ?? 0]
                const isSelected = entry?.styleId === String(style.id)
                return (
                  <Pressable
                    key={style.id}
                    style={[
                      styles.modalOption,
                      isSelected && styles.modalOptionSelected,
                    ]}
                    onPress={() => {
                      if (pickingEntryIndex !== null) {
                        updateEntry(entries[pickingEntryIndex].id, {
                          styleId: String(style.id),
                        })
                      }
                      setShowStylePicker(false)
                      setPickingEntryIndex(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        isSelected && styles.modalOptionTextSelected,
                      ]}
                    >
                      {style.name_jp}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={20} color="#2563EB" />
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* フッター */}
      <View style={styles.footer}>
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.cancelButton, loading && styles.buttonDisabled]}
            onPress={handleSkip}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>スキップ</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <LoadingSpinner size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>保存</Text>
            )}
          </Pressable>
        </View>

        {/* 続けて大会記録を作成ボタン */}
        <Pressable
          style={[styles.continueButton, loading && styles.buttonDisabled]}
          onPress={handleContinueToRecord}
          disabled={loading}
        >
          {loading ? (
            <LoadingSpinner size="small" color="#2563EB" />
          ) : (
            <Text style={styles.continueButtonText}>続けて大会記録を作成</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  entryHeaderSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  entryNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  removeButton: {
    padding: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  optional: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '400',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  pickerButtonError: {
    borderColor: '#EF4444',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#111827',
  },
  pickerButtonPlaceholder: {
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBody: {
    maxHeight: 400,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#111827',
  },
  modalOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  timeHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
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
  continueButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
