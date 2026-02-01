import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useRecordsQuery,
  useReplaceSplitTimesMutation,
} from '@apps/shared/hooks/queries/records'
import { useRecordFormStore } from '@/stores/recordStore'
import { StyleAPI } from '@apps/shared/api/styles'
import { formatTime } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import type { MainStackParamList } from '@/navigation/types'
import type { Style, PoolType, Competition } from '@apps/shared/types'

type RecordFormScreenRouteProp = RouteProp<MainStackParamList, 'RecordForm'>
type RecordFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 大会記録作成・編集画面
 * 大会記録の基本情報（大会、種目、タイム、反応時間、スプリットタイム、メモ）を入力・編集
 */
export const RecordFormScreen: React.FC = () => {
  const route = useRoute<RecordFormScreenRouteProp>()
  const navigation = useNavigation<RecordFormScreenNavigationProp>()
  const { recordId, competitionId: routeCompetitionId } = route.params || {}
  const { supabase } = useAuth()
  const queryClient = useQueryClient()
  const isEditMode = !!recordId

  // Zustandストア
  const {
    competitionId: storeCompetitionId,
    styleId,
    time,
    reactionTime,
    note,
    splitTimes,
    isLoading: storeLoading,
    errors,
    setCompetitionId,
    setStyleId,
    setTime,
    setReactionTime,
    setNote,
    addSplitTime,
    removeSplitTime,
    updateSplitTime,
    setLoading,
    setError,
    clearErrors,
    initialize,
    reset,
  } = useRecordFormStore()

  // 既存データの取得（編集モード時）
  const [loadingRecord, setLoadingRecord] = useState(isEditMode)
  const [styleList, setStyleList] = useState<Style[]>([])
  const [loadingStyles, setLoadingStyles] = useState(true)
  const [competitions, setCompetitions] = useState<Competition[]>([])

  // 編集モード時は、useRecordsQueryでデータを取得してから該当のものを検索
  const {
    records = [],
    competitions: competitionsData = [],
    isLoading: loadingRecords,
  } = useRecordsQuery(supabase, {
    page: 1,
    pageSize: 1000, // 十分な件数を取得
    enableRealtime: false, // 編集画面ではリアルタイム更新は不要
  })

  // 種目一覧を取得
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase)
        const stylesData = await styleApi.getStyles()
        setStyleList(stylesData)
      } catch (error) {
        console.error('種目取得エラー:', error)
      } finally {
        setLoadingStyles(false)
      }
    }
    fetchStyles()
  }, [supabase])

  // 大会一覧を設定（配列の参照が変わるのを防ぐため、JSON.stringifyで比較）
  const competitionsKey = useMemo(
    () => JSON.stringify(competitionsData.map((c) => ({ id: c.id, title: c.title, date: c.date }))),
    [competitionsData]
  )

  useEffect(() => {
    setCompetitions(competitionsData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionsKey])

  // routeCompetitionIdが渡された場合はストアに設定
  useEffect(() => {
    if (routeCompetitionId && !isEditMode) {
      setCompetitionId(routeCompetitionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCompetitionId, isEditMode])

  const hasInitializedForEdit = useRef(false)

  // 編集モード切り替え・レコードID変更時に初期化フラグをリセット
  useEffect(() => {
    if (!isEditMode || !recordId) {
      hasInitializedForEdit.current = false
      initialize()
      setLoadingRecord(false)
      return
    }

    // 編集モード開始時にロード中フラグを立てる（実際の初期化は下のeffectで行う）
    setLoadingRecord(true)
    hasInitializedForEdit.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, recordId])

  // 編集モード時の初回初期化を一度だけ行う
  useEffect(() => {
    if (!isEditMode || !recordId || hasInitializedForEdit.current) {
      return
    }

    const record = records.find((r) => r.id === recordId)
    if (record) {
      initialize(record)
      hasInitializedForEdit.current = true
      setLoadingRecord(false)
    } else if (!loadingRecords) {
      // データが見つからない場合もロード終了
      setLoadingRecord(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, loadingRecords, isEditMode, recordId])

  // ミューテーション
  const createMutation = useCreateRecordMutation(supabase)
  const updateMutation = useUpdateRecordMutation(supabase)
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase)

  // タイム文字列を秒数に変換
  const parseTime = (timeStr: string): number | null => {
    if (!timeStr || timeStr.trim() === '') return null
    
    const trimmed = timeStr.trim()
    
    // 分:秒.小数形式をパース
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':')
      // コロンが2つ以上ある場合は不正な形式（例: "1:2:3"）
      if (parts.length !== 2) {
        return null
      }
      
      const minutes = parseFloat(parts[0])
      const seconds = parseFloat(parts[1])
      
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) ||
          Number.isNaN(minutes) || Number.isNaN(seconds) ||
          minutes < 0 || seconds < 0) {
        return null
      }
      
      return minutes * 60 + seconds
    }
    
    // 秒数のみの場合
    const seconds = parseFloat(trimmed)
    if (!Number.isFinite(seconds) || Number.isNaN(seconds) || seconds < 0) {
      return null
    }
    
    return seconds
  }

  // バリデーション
  const validate = (): boolean => {
    clearErrors()
    let isValid = true

    // 大会のバリデーション
    const finalCompetitionId = routeCompetitionId || storeCompetitionId
    if (!finalCompetitionId || finalCompetitionId.trim() === '') {
      setError('competitionId', '大会を選択してください')
      isValid = false
    }

    // 種目のバリデーション
    if (styleId === null || styleId === undefined) {
      setError('styleId', '種目を選択してください')
      isValid = false
    }

    // タイムのバリデーション
    if (time === null || time === undefined) {
      setError('time', 'タイムを入力してください')
      isValid = false
    } else if (time <= 0) {
      setError('time', 'タイムは正の数値を入力してください')
      isValid = false
    }

    // 反応時間のバリデーション
    if (reactionTime !== null && reactionTime !== undefined) {
      if (reactionTime < 0.4 || reactionTime > 1.0) {
        setError('reactionTime', '反応時間は0.40〜1.00秒の範囲で入力してください')
        isValid = false
      }
    }

    return isValid
  }

  // 保存処理
  const handleSave = async () => {
    if (!validate()) {
      return
    }

    setLoading(true)
    clearErrors()

    try {
      // 大会からプールタイプを取得
      const finalCompetitionId = routeCompetitionId || storeCompetitionId
      const selectedCompetition = competitions.find((c) => c.id === finalCompetitionId)
      const poolType: PoolType = (selectedCompetition?.pool_type ?? 0) as PoolType // デフォルトは短水路

      const recordData = {
        competition_id: finalCompetitionId,
        style_id: styleId!,
        time: time!,
        reaction_time: reactionTime,
        note: note && note.trim() !== '' ? note.trim() : null,
        is_relaying: false, // デフォルトは個人種目
        video_url: null,
        pool_type: poolType,
      }

      let savedRecord
      if (isEditMode && recordId) {
        // 更新
        savedRecord = await updateMutation.mutateAsync({
          id: recordId,
          updates: recordData,
        })
      } else {
        // 作成
        savedRecord = await createMutation.mutateAsync(recordData)
      }

      // スプリットタイムを保存（編集時は空配列でも置き換え）
      if (savedRecord) {
        const splitTimeInserts = splitTimes.map((st) => ({
          distance: st.distance,
          split_time: st.splitTime,
        }))
        await replaceSplitTimesMutation.mutateAsync({
          recordId: savedRecord.id,
          splitTimes: splitTimeInserts,
        })
      }

      // カレンダーのクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      // 成功: 前の画面に戻る
      reset()
      navigation.goBack()
    } catch (error) {
      console.error('保存エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : '保存に失敗しました',
        [{ text: 'OK' }]
      )
    } finally {
      setLoading(false)
    }
  }

  // キャンセル処理
  const handleCancel = () => {
    reset()
    navigation.goBack()
  }

  // スプリットタイムを追加
  const handleAddSplitTime = () => {
    addSplitTime({ distance: 50, splitTime: 0 })
  }

  // タイム入力の処理（文字列から秒数に変換）
  const handleTimeChange = (text: string) => {
    // 入力が空の場合はエラーをクリア
    if (text.trim() === '') {
      clearErrors()
      setTime(null)
      return
    }
    
    const parsed = parseTime(text)
    if (parsed === null) {
      // 不正な形式の場合、エラーメッセージを表示
      setError('time', 'タイムの形式が正しくありません（例: 1:23.45 または 83.45）')
      setTime(null)
    } else {
      // 正常にパースできた場合、エラーをクリア
      clearErrors()
      setTime(parsed)
    }
  }

  // 反応時間入力の処理
  const handleReactionTimeChange = (text: string) => {
    const parsed = parseFloat(text)
    if (isNaN(parsed)) {
      setReactionTime(null)
    } else {
      setReactionTime(parsed)
    }
  }

  // ローディング状態
  if (loadingRecord || loadingStyles) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="データを読み込み中..." />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        {/* 大会選択 */}
        <View style={styles.field}>
          <Text style={styles.label}>
            大会ID <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.competitionId && styles.inputError]}
            value={routeCompetitionId || storeCompetitionId || ''}
            onChangeText={(text) => {
              setCompetitionId(text.trim() !== '' ? text.trim() : null)
              if (errors.competitionId) {
                clearErrors()
              }
            }}
            placeholder="大会IDを入力"
            placeholderTextColor="#9CA3AF"
            editable={!routeCompetitionId && !storeLoading}
          />
          {errors.competitionId && <Text style={styles.errorText}>{errors.competitionId}</Text>}
          {competitions.length > 0 && (
            <Text style={styles.hintText}>
              利用可能な大会: {competitions.slice(0, 3).map((c) => c.title || c.id).join(', ')}
              {competitions.length > 3 && ` ...他${competitions.length - 3}件`}
            </Text>
          )}
        </View>

        {/* 種目選択 */}
        <View style={styles.field}>
          <Text style={styles.label}>
            種目ID <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.styleId && styles.inputError]}
            value={styleId !== null ? styleId.toString() : ''}
            onChangeText={(text) => {
              const id = parseInt(text, 10)
              if (!isNaN(id)) {
                setStyleId(id)
              } else if (text === '') {
                setStyleId(null)
              }
              if (errors.styleId) {
                clearErrors()
              }
            }}
            placeholder="種目IDを入力（例: 1, 2, 3...）"
            placeholderTextColor="#9CA3AF"
            keyboardType="number-pad"
            editable={!storeLoading}
          />
          {errors.styleId && <Text style={styles.errorText}>{errors.styleId}</Text>}
          {styleList.length > 0 && (
            <Text style={styles.hintText}>
              利用可能な種目: {styleList.slice(0, 5).map((s) => `${s.name_jp}${s.distance}m`).join(', ')}
              {styleList.length > 5 && ` ...他${styleList.length - 5}件`}
            </Text>
          )}
        </View>

        {/* タイム入力 */}
        <View style={styles.field}>
          <Text style={styles.label}>
            タイム <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.time && styles.inputError]}
            value={time !== null ? formatTime(time) : ''}
            onChangeText={handleTimeChange}
            placeholder="分:秒.小数 または 秒数"
            placeholderTextColor="#9CA3AF"
            editable={!storeLoading}
          />
          {errors.time && <Text style={styles.errorText}>{errors.time}</Text>}
        </View>

        {/* 反応時間入力 */}
        <View style={styles.field}>
          <Text style={styles.label}>反応時間（秒）</Text>
          <TextInput
            style={[styles.input, errors.reactionTime && styles.inputError]}
            value={reactionTime !== null ? reactionTime.toString() : ''}
            onChangeText={handleReactionTimeChange}
            placeholder="0.40〜1.00"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            editable={!storeLoading}
          />
          {errors.reactionTime && <Text style={styles.errorText}>{errors.reactionTime}</Text>}
        </View>

        {/* スプリットタイム入力 */}
        <View style={styles.field}>
          <View style={styles.splitTimeHeader}>
            <Text style={styles.label}>スプリットタイム</Text>
            <Pressable
              style={styles.addButton}
              onPress={handleAddSplitTime}
              disabled={storeLoading}
            >
              <Text style={styles.addButtonText}>+ 追加</Text>
            </Pressable>
          </View>
          {splitTimes.map((st, index) => (
            <View key={index} style={styles.splitTimeRow}>
              <TextInput
                style={[styles.input, styles.splitTimeDistance]}
                value={st.distance.toString()}
                onChangeText={(text) => {
                  const distance = parseInt(text, 10)
                  if (!isNaN(distance)) {
                    updateSplitTime(index, { distance })
                  }
                }}
                placeholder="距離 (m)"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                editable={!storeLoading}
              />
              <TextInput
                style={[styles.input, styles.splitTimeTime]}
                value={formatTime(st.splitTime)}
                onChangeText={(text) => {
                  // 入力が空の場合は0に設定
                  if (text.trim() === '') {
                    updateSplitTime(index, { splitTime: 0 })
                    return
                  }
                  
                  const parsed = parseTime(text)
                  if (parsed !== null) {
                    updateSplitTime(index, { splitTime: parsed })
                  }
                  // 不正な形式の場合は何もしない（既存の値を維持）
                }}
                placeholder="タイム"
                placeholderTextColor="#9CA3AF"
                editable={!storeLoading}
              />
              <Pressable
                style={styles.removeButton}
                onPress={() => removeSplitTime(index)}
                disabled={storeLoading}
              >
                <Text style={styles.removeButtonText}>削除</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* メモ入力 */}
        <View style={styles.field}>
          <Text style={styles.label}>メモ</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note || ''}
            onChangeText={(text) => setNote(text.trim() !== '' ? text : null)}
            placeholder="メモ（任意）"
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!storeLoading}
          />
        </View>

        {/* ボタン */}
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.cancelButton]}
            onPress={handleCancel}
            disabled={storeLoading}
          >
            <Text style={styles.cancelButtonText}>キャンセル</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.saveButton, storeLoading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={storeLoading}
          >
            {storeLoading ? (
              <LoadingSpinner size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>保存</Text>
            )}
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
  field: {
    gap: 8,
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
  inputError: {
    borderColor: '#DC2626',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  splitTimeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  splitTimeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  splitTimeDistance: {
    flex: 1,
  },
  splitTimeTime: {
    flex: 2,
  },
  removeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#DC2626',
    borderRadius: 6,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
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
  buttonDisabled: {
    opacity: 0.6,
  },
})
