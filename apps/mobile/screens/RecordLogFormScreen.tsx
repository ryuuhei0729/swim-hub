import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Switch, Modal, ActivityIndicator, Keyboard, Dimensions } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useReplaceSplitTimesMutation,
} from '@apps/shared/hooks/queries/records'
import { StyleAPI } from '@apps/shared/api/styles'
import { formatTime } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import type { MainStackParamList } from '@/navigation/types'
import type { Style, PoolType, RecordInsert } from '@apps/shared/types'
import { useQuickTimeInput } from '@/hooks/useQuickTimeInput'

type RecordLogFormScreenRouteProp = RouteProp<MainStackParamList, 'RecordLogForm'>
type RecordLogFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

interface SplitTimeData {
  distance: number | string
  splitTime: number
  splitTimeDisplayValue: string
}

interface RecordFormData {
  styleId: string
  time: number
  timeDisplayValue: string
  isRelaying: boolean
  splitTimes: SplitTimeData[]
  note: string
  videoUrl: string
  reactionTime: string
}

/**
 * 記録入力画面（新規登録フロー専用）
 * タイム、リレー種目フラグ、メモ、動画URL、スプリットタイムを入力
 */
export const RecordLogFormScreen: React.FC = () => {
  const route = useRoute<RecordLogFormScreenRouteProp>()
  const navigation = useNavigation<RecordLogFormScreenNavigationProp>()
  const { competitionId, recordId, date: _date } = route.params
  const entryDataList = useMemo(() => route.params.entryDataList ?? [], [route.params.entryDataList])
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  // クイック入力フック
  const { parseInput } = useQuickTimeInput()

  // フォーム状態（複数エントリー対応）
  const [formDataList, setFormDataList] = useState<RecordFormData[]>([])
  const [swimStyles, setSwimStyles] = useState<Style[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingStyles, setLoadingStyles] = useState(true)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [pickingFormIndex, setPickingFormIndex] = useState<number | null>(null)
  const styleButtonRefs = useRef<Map<number, View>>(new Map())
  const [dropdownLayout, setDropdownLayout] = useState({ top: 0, left: 0, width: 0 })

  // 二重送信防止用のref
  const isSubmittingRef = useRef(false)

  // ミューテーション
  const createMutation = useCreateRecordMutation(supabase)
  const updateMutation = useUpdateRecordMutation(supabase)
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase)

  // 秒数を表示用文字列に変換
  const formatSecondsToDisplay = (seconds: number): string => {
    if (!seconds || seconds <= 0) return ''
    const minutes = Math.floor(seconds / 60)
    const remainder = (seconds % 60).toFixed(2).padStart(5, '0')
    return minutes > 0 ? `${minutes}:${remainder}` : remainder
  }

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

  // 記録データを取得（編集モードの場合）
  useEffect(() => {
    if (!recordId || loadingStyles || swimStyles.length === 0) return

    let isMounted = true

    const fetchRecord = async () => {
      try {
        setLoadingRecord(true)
        
        const { data: record, error } = await supabase
          .from('records')
          .select(`
            *,
            split_times(*)
          `)
          .eq('id', recordId)
          .single()

        if (!isMounted) return

        if (error) {
          console.error('記録取得エラー詳細:', error)
          console.error('記録取得エラー - recordId:', recordId)
          if (error.code === 'PGRST116') {
            // 記録が見つからない場合
            Alert.alert('エラー', '記録が見つかりませんでした')
            navigation.goBack()
            return
          }
          throw error
        }
        if (!record) {
          Alert.alert('エラー', '記録データが見つかりませんでした')
          navigation.goBack()
          return
        }

        // 記録データでフォームを初期化
        const splitTimes = (record.split_times || []).map((st: { distance: number; split_time: number }) => ({
          distance: st.distance,
          splitTime: st.split_time,
          splitTimeDisplayValue: formatSecondsToDisplay(st.split_time),
        }))

        const formData = {
          styleId: String(record.style_id),
          time: record.time,
          timeDisplayValue: formatSecondsToDisplay(record.time),
          isRelaying: record.is_relaying || false,
          splitTimes,
          note: record.note || '',
          videoUrl: record.video_url || '',
          reactionTime: record.reaction_time ? String(record.reaction_time) : '',
        }
        setFormDataList([formData])
      } catch (error) {
        if (!isMounted) return
        console.error('記録取得エラー:', error)
        Alert.alert('エラー', '記録の取得に失敗しました')
      } finally {
        if (isMounted) {
          setLoadingRecord(false)
        }
      }
    }

    fetchRecord()

    return () => {
      isMounted = false
    }
  }, [recordId, competitionId, swimStyles.length, loadingStyles, supabase, navigation])

  // エントリー情報からフォームデータを初期化（新規作成モードの場合）
  useEffect(() => {
    if (recordId || loadingStyles || swimStyles.length === 0) return

    if (entryDataList.length > 0) {
      // エントリー情報がある場合
      setFormDataList(
        entryDataList.map((entry) => ({
          styleId: String(entry.styleId),
          time: 0,
          timeDisplayValue: '',
          isRelaying: false,
          splitTimes: [],
          note: '',
          videoUrl: '',
          reactionTime: '',
        }))
      )
    } else {
      // エントリー情報がない場合（スキップした場合）
      const firstStyle = swimStyles.length > 0 ? swimStyles[0] : null
      setFormDataList([
        {
          styleId: firstStyle?.id ? String(firstStyle.id) : '',
          time: 0,
          timeDisplayValue: '',
          isRelaying: false,
          splitTimes: [],
          note: '',
          videoUrl: '',
          reactionTime: '',
        },
      ])
    }
  }, [entryDataList, swimStyles, loadingStyles, recordId])

  // タイム文字列を秒数に変換（クイック入力対応）
  const parseTimeToSeconds = (timeStr: string): number => {
    if (!timeStr || timeStr.trim() === '') return 0
    const { time } = parseInput(timeStr)
    return time
  }

  // フォームデータ更新
  const updateFormData = (index: number, updates: Partial<RecordFormData>) => {
    setFormDataList((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }

  // タイム変更
  const handleTimeChange = (index: number, value: string) => {
    const newTime = parseTimeToSeconds(value)
    const formData = formDataList[index]
    const style = swimStyles.find((s) => s.id.toString() === formData.styleId)
    const raceDistance = style?.distance

    let updatedSplitTimes = [...formData.splitTimes]

    // タイムが変更された場合、種目の距離と同じ距離のsplit-timeを自動追加/更新
    if (raceDistance && newTime > 0) {
      const existingSplitIndex = updatedSplitTimes.findIndex(
        (st) => typeof st.distance === 'number' && st.distance === raceDistance
      )

      if (existingSplitIndex >= 0) {
        // 既存のsplit-timeを更新
        updatedSplitTimes = updatedSplitTimes.map((st, idx) =>
          idx === existingSplitIndex
            ? {
                ...st,
                splitTime: newTime,
                splitTimeDisplayValue: formatSecondsToDisplay(newTime),
              }
            : st
        )
      } else {
        // 新しいsplit-timeを追加
        updatedSplitTimes.push({
          distance: raceDistance,
          splitTime: newTime,
          splitTimeDisplayValue: formatSecondsToDisplay(newTime),
        })
      }
    }

    updateFormData(index, {
      timeDisplayValue: value,
      time: newTime,
      splitTimes: updatedSplitTimes,
    })
  }

  // スプリットタイム追加（空の1行）
  const handleAddSplitTime = (index: number) => {
    const formData = formDataList[index]
    updateFormData(index, {
      splitTimes: [
        ...formData.splitTimes,
        {
          distance: 0,
          splitTime: 0,
          splitTimeDisplayValue: '',
        },
      ],
    })
  }

  // スプリットタイムを25mごとに追加
  const handleAddSplitTimesEvery25m = (index: number) => {
    const formData = formDataList[index]
    const selectedStyle = swimStyles.find((s) => String(s.id) === formData.styleId)
    if (!selectedStyle?.distance) return

    const raceDistance = selectedStyle.distance
    const existingDistances = new Set(
      formData.splitTimes
        .map((st) => (typeof st.distance === 'number' ? st.distance : parseInt(String(st.distance), 10)))
        .filter((d) => !isNaN(d) && d > 0)
    )

    const newSplits: SplitTimeData[] = []
    for (let distance = 25; distance <= raceDistance; distance += 25) {
      if (!existingDistances.has(distance)) {
        newSplits.push({ distance, splitTime: 0, splitTimeDisplayValue: '' })
      }
    }

    if (newSplits.length === 0) return
    updateFormData(index, {
      splitTimes: [...formData.splitTimes, ...newSplits],
    })
  }

  // スプリットタイムを距離でソートしてインデックスマッピングを返す
  const getSortedSplitIndices = (splitTimes: SplitTimeData[]) => {
    return splitTimes
      .map((st, idx) => ({ st, idx }))
      .sort((a, b) => {
        const distA = typeof a.st.distance === 'number' ? a.st.distance : parseInt(String(a.st.distance), 10) || 0
        const distB = typeof b.st.distance === 'number' ? b.st.distance : parseInt(String(b.st.distance), 10) || 0
        if (distA === 0 && distB === 0) return a.idx - b.idx
        if (distA === 0) return 1
        if (distB === 0) return -1
        return distA - distB
      })
  }

  // スプリットタイム削除
  const handleRemoveSplitTime = (index: number, splitIndex: number) => {
    const formData = formDataList[index]
    updateFormData(index, {
      splitTimes: formData.splitTimes.filter((_, i) => i !== splitIndex),
    })
  }

  // スプリットタイム変更
  const handleSplitTimeChange = (
    index: number,
    splitIndex: number,
    field: 'distance' | 'splitTime',
    value: string
  ) => {
    const formData = formDataList[index]
    const updatedSplitTimes = formData.splitTimes.map((st, i) => {
      if (i !== splitIndex) return st
      if (field === 'distance') {
        const numValue = parseInt(value)
        return { ...st, distance: isNaN(numValue) ? value : numValue }
      }
      const parsedTime = value.trim() === '' ? 0 : parseTimeToSeconds(value)
      return {
        ...st,
        splitTimeDisplayValue: value,
        splitTime: parsedTime,
      }
    })

    updateFormData(index, { splitTimes: updatedSplitTimes })
  }

  // ドロップダウンを開く
  const screenHeight = Dimensions.get('window').height
  const DROPDOWN_MAX_HEIGHT = 260

  const openStylePicker = useCallback((index: number) => {
    Keyboard.dismiss()
    const buttonRef = styleButtonRefs.current.get(index)
    buttonRef?.measureInWindow((x, y, width, height) => {
      const top = y + height + 4
      const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40
      setDropdownLayout({
        top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
        left: x,
        width,
      })
      setPickingFormIndex(index)
      setShowStylePicker(true)
    })
  }, [screenHeight])

  // バリデーション
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    formDataList.forEach((formData, index) => {
      if (!formData.styleId) {
        newErrors[`style-${index}`] = '種目を選択してください'
      }
      if (formData.time <= 0) {
        newErrors[`time-${index}`] = 'タイムを入力してください'
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // 保存処理
  const handleSave = async () => {
    // 二重送信防止
    if (isSubmittingRef.current) return

    if (!validate()) {
      return
    }

    isSubmittingRef.current = true
    setLoading(true)

    try {
      // 大会からプールタイプを取得
      const { data: competition, error: competitionError } = await supabase
        .from('competitions')
        .select('pool_type')
        .eq('id', competitionId)
        .single()

      if (competitionError || !competition) {
        throw competitionError || new Error('大会情報の取得に失敗しました')
      }

      const poolType: PoolType = (competition.pool_type ?? 0) as PoolType

      // 編集モードの場合
      if (recordId && formDataList.length > 0) {
        const formData = formDataList[0]
        if (formData.time <= 0) {
          Alert.alert('エラー', 'タイムを入力してください')
          setLoading(false)
          return
        }

        // 記録を更新
        const updates = {
          style_id: parseInt(formData.styleId),
          time: formData.time,
          reaction_time:
            formData.reactionTime && formData.reactionTime.trim() !== ''
              ? parseFloat(formData.reactionTime)
              : null,
          note: formData.note && formData.note.trim() !== '' ? formData.note.trim() : null,
          is_relaying: formData.isRelaying,
          video_url: formData.videoUrl && formData.videoUrl.trim() !== '' ? formData.videoUrl.trim() : null,
        }

        await updateMutation.mutateAsync({ id: recordId, updates })

        // スプリットタイムを保存
        if (formData.splitTimes.length > 0) {
          const validSplitTimes = formData.splitTimes
            .map((st) => {
              const distance =
                typeof st.distance === 'number'
                  ? st.distance
                  : st.distance === ''
                    ? NaN
                    : parseInt(String(st.distance))
              if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
                return {
                  distance,
                  split_time: st.splitTime,
                }
              }
              return null
            })
            .filter((st): st is { distance: number; split_time: number } => st !== null)

          if (validSplitTimes.length > 0) {
            await replaceSplitTimesMutation.mutateAsync({
              recordId,
              splitTimes: validSplitTimes,
            })
          }
        }
      } else {
        // 新規作成モードの場合
        for (const formData of formDataList) {
          if (formData.time <= 0) continue // タイム未入力のものはスキップ

          const recordData: Omit<RecordInsert, 'user_id'> = {
            competition_id: competitionId,
            style_id: parseInt(formData.styleId),
            time: formData.time,
            reaction_time:
              formData.reactionTime && formData.reactionTime.trim() !== ''
                ? parseFloat(formData.reactionTime)
                : null,
            note: formData.note && formData.note.trim() !== '' ? formData.note.trim() : null,
            is_relaying: formData.isRelaying,
            video_url: formData.videoUrl && formData.videoUrl.trim() !== '' ? formData.videoUrl.trim() : null,
            pool_type: poolType,
          }

          // 記録を作成
          const savedRecord = await createMutation.mutateAsync(recordData)

          // スプリットタイムを保存
          if (savedRecord && formData.splitTimes.length > 0) {
            const validSplitTimes = formData.splitTimes
              .map((st) => {
                const distance =
                  typeof st.distance === 'number'
                    ? st.distance
                    : st.distance === ''
                      ? NaN
                      : parseInt(String(st.distance))
                if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
                  return {
                    distance,
                    split_time: st.splitTime,
                  }
                }
                return null
              })
              .filter((st): st is { distance: number; split_time: number } => st !== null)

            if (validSplitTimes.length > 0) {
              await replaceSplitTimesMutation.mutateAsync({
                recordId: savedRecord.id,
                splitTimes: validSplitTimes,
              })
            }
          }
        }
      }

      // カレンダーのクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      // 成功: ダッシュボードに戻る
      navigation.navigate('MainTabs', { screen: 'Dashboard' })
    } catch (error) {
      console.error('保存エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : '保存に失敗しました',
        [{ text: 'OK' }]
      )
    } finally {
      isSubmittingRef.current = false
      setLoading(false)
    }
  }

  if (loadingStyles || loadingRecord) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={loadingRecord ? "記録を読み込み中..." : "種目を読み込み中..."} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {formDataList.map((formData, index) => {
          const entryInfo = entryDataList[index]
          const sectionIndex = index + 1

          return (
            <View key={index} style={styles.section}>
              {formDataList.length > 1 && (
                <Text style={styles.sectionTitle}>記録 {sectionIndex}</Text>
              )}

              {/* 種目表示（エントリー情報がある場合） */}
              {entryInfo && (
                <View style={styles.entryInfo}>
                  <Text style={styles.entryInfoText}>
                    {entryInfo.styleName}
                    {entryInfo.entryTime && ` (エントリータイム: ${formatTime(entryInfo.entryTime)})`}
                  </Text>
                </View>
              )}

              {/* 種目選択（エントリー情報がない場合） */}
              {!entryInfo && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    種目 <Text style={styles.required}>*</Text>
                  </Text>
                  <Pressable
                    ref={(ref) => { if (ref) styleButtonRefs.current.set(index, ref) }}
                    style={[styles.pickerButton, errors[`style-${index}`] && styles.pickerButtonError]}
                    onPress={() => openStylePicker(index)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.pickerButtonText,
                        !formData.styleId && styles.pickerButtonPlaceholder,
                      ]}
                    >
                      {formData.styleId
                        ? swimStyles.find((s) => s.id.toString() === formData.styleId)?.name_jp ||
                          '種目を選択'
                        : '種目を選択'}
                    </Text>
                    <Feather name="chevron-down" size={20} color="#6B7280" />
                  </Pressable>
                  {errors[`style-${index}`] && (
                    <Text style={styles.errorText}>{errors[`style-${index}`]}</Text>
                  )}
                </View>
              )}

              {/* タイム入力 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  タイム <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, errors[`time-${index}`] && styles.inputError]}
                  value={formData.timeDisplayValue}
                  onChangeText={(text) => handleTimeChange(index, text)}
                  placeholder="例: 2:00.00 または 2-0-0"
                  keyboardType="default"
                  editable={!loading}
                />
                {errors[`time-${index}`] && (
                  <Text style={styles.errorText}>{errors[`time-${index}`]}</Text>
                )}
              </View>

              {/* リレー種目 */}
              <View style={styles.field}>
                <View style={styles.switchContainer}>
                  <Text style={styles.label}>リレー種目</Text>
                  <Switch
                    value={formData.isRelaying}
                    onValueChange={(value) => updateFormData(index, { isRelaying: value })}
                    disabled={loading}
                  />
                </View>
              </View>

              {/* 反応時間 */}
              <View style={styles.field}>
                <Text style={styles.label}>反応時間（秒）</Text>
                <TextInput
                  style={styles.input}
                  value={formData.reactionTime}
                  onChangeText={(text) => updateFormData(index, { reactionTime: text })}
                  placeholder="0.40〜1.00"
                  keyboardType="decimal-pad"
                  editable={!loading}
                />
              </View>

              {/* メモ */}
              <View style={styles.field}>
                <Text style={styles.label}>メモ</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.note}
                  onChangeText={(text) => updateFormData(index, { note: text })}
                  placeholder="メモ（任意）"
                  multiline
                  numberOfLines={3}
                  editable={!loading}
                />
              </View>

              {/* 動画URL */}
              <View style={styles.field}>
                <Text style={styles.label}>動画URL</Text>
                <TextInput
                  style={styles.input}
                  value={formData.videoUrl}
                  onChangeText={(text) => updateFormData(index, { videoUrl: text })}
                  placeholder="https://www.youtube.com/watch?v=xxx"
                  keyboardType="url"
                  autoCapitalize="none"
                  editable={!loading}
                />
              </View>

              {/* スプリットタイム */}
              <View style={styles.field}>
                <View style={styles.splitTimeHeader}>
                  <Text style={styles.label}>スプリットタイム</Text>
                  <View style={styles.splitTimeButtons}>
                    <Pressable
                      style={[
                        styles.addButton,
                        styles.addButton25m,
                        (!formData.styleId || !swimStyles.find((s) => String(s.id) === formData.styleId)?.distance || loading) && styles.addButtonDisabled,
                      ]}
                      onPress={() => handleAddSplitTimesEvery25m(index)}
                      disabled={!formData.styleId || !swimStyles.find((s) => String(s.id) === formData.styleId)?.distance || loading}
                    >
                      <Text style={styles.addButton25mText}>追加(25mごと)</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.addButton, loading && styles.addButtonDisabled]}
                      onPress={() => handleAddSplitTime(index)}
                      disabled={loading}
                    >
                      <Feather name="plus" size={16} color="#2563EB" />
                      <Text style={styles.addButtonText}>追加</Text>
                    </Pressable>
                  </View>
                </View>
                {getSortedSplitIndices(formData.splitTimes).map(({ st: splitTime, idx: splitIndex }) => (
                  <View key={splitIndex} style={styles.splitTimeRow}>
                    <TextInput
                      style={[styles.input, styles.splitTimeDistance]}
                      value={typeof splitTime.distance === 'number' && splitTime.distance > 0 ? String(splitTime.distance) : (typeof splitTime.distance === 'string' ? splitTime.distance : '')}
                      onChangeText={(text) =>
                        handleSplitTimeChange(index, splitIndex, 'distance', text)
                      }
                      placeholder="距離 (m)"
                      keyboardType="number-pad"
                      editable={!loading}
                    />
                    <Text style={styles.splitTimeSeparator}>m:</Text>
                    <TextInput
                      style={[styles.input, styles.splitTimeTime]}
                      value={splitTime.splitTimeDisplayValue}
                      onChangeText={(text) =>
                        handleSplitTimeChange(index, splitIndex, 'splitTime', text)
                      }
                      placeholder="例: 28-0"
                      keyboardType="default"
                      editable={!loading}
                    />
                    <Pressable
                      style={styles.removeButton}
                      onPress={() => handleRemoveSplitTime(index, splitIndex)}
                      disabled={loading}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )
        })}
      </ScrollView>

      {/* 種目選択ドロップダウン */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowStylePicker(false)}
      >
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setShowStylePicker(false)}
        >
          <View
            style={[
              styles.dropdownContainer,
              { top: dropdownLayout.top, left: dropdownLayout.left, width: dropdownLayout.width },
            ]}
          >
            <ScrollView
              style={styles.dropdownScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {swimStyles.map((style) => {
                const formData = pickingFormIndex !== null ? formDataList[pickingFormIndex] : null
                const isSelected = formData?.styleId === String(style.id)
                return (
                  <Pressable
                    key={style.id}
                    style={[
                      styles.dropdownOption,
                      isSelected && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      if (pickingFormIndex !== null) {
                        updateFormData(pickingFormIndex, { styleId: String(style.id) })
                      }
                      setShowStylePicker(false)
                      setPickingFormIndex(null)
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {style.name_jp}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color="#2563EB" />
                    )}
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* フッター */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>保存</Text>
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
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  entryInfo: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  entryInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  field: {
    marginBottom: 20,
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContainer: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    maxHeight: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  dropdownOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#111827',
  },
  dropdownOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
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
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  splitTimeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  splitTimeButtons: {
    flexDirection: 'row',
    gap: 8,
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
  addButton25m: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  addButton25mText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  splitTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  splitTimeDistance: {
    width: 80,
  },
  splitTimeSeparator: {
    fontSize: 14,
    color: '#6B7280',
  },
  splitTimeTime: {
    flex: 1,
  },
  removeButton: {
    padding: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
