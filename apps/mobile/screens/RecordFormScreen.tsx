import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, Keyboard, Dimensions } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useUpdateCompetitionMutation,
  useRecordsQuery,
  useReplaceSplitTimesMutation,
} from '@apps/shared/hooks/queries/records'
import { useRecordFormStore } from '@/stores/recordStore'
import { useShallow } from 'zustand/react/shallow'
import { StyleAPI } from '@apps/shared/api/styles'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ImageUploader, ImageFile, ExistingImage } from '@/components/shared/ImageUploader'
import {
  uploadImages,
  deleteImages,
  getExistingImagesFromPaths,
} from '@/utils/imageUpload'
import type { MainStackParamList } from '@/navigation/types'
import type { Style, PoolType, Competition } from '@apps/shared/types'
import { useQuickTimeInput } from '@/hooks/useQuickTimeInput'

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
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()
  const isEditMode = !!recordId

  // クイック入力フック（メインタイム用、スプリットタイム用）
  const { parseInput: parseMainTime } = useQuickTimeInput()
  const { parseInput: parseSplitTime } = useQuickTimeInput()

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
    setSplitTimes,
    addSplitTime,
    removeSplitTime,
    updateSplitTime,
    setLoading,
    setError,
    clearErrors,
    initialize,
    reset,
  } = useRecordFormStore(
    useShallow((state) => ({
      competitionId: state.competitionId,
      styleId: state.styleId,
      time: state.time,
      reactionTime: state.reactionTime,
      note: state.note,
      splitTimes: state.splitTimes,
      isLoading: state.isLoading,
      errors: state.errors,
      setCompetitionId: state.setCompetitionId,
      setStyleId: state.setStyleId,
      setTime: state.setTime,
      setReactionTime: state.setReactionTime,
      setNote: state.setNote,
      setSplitTimes: state.setSplitTimes,
      addSplitTime: state.addSplitTime,
      removeSplitTime: state.removeSplitTime,
      updateSplitTime: state.updateSplitTime,
      setLoading: state.setLoading,
      setError: state.setError,
      clearErrors: state.clearErrors,
      initialize: state.initialize,
      reset: state.reset,
    }))
  )

  // 既存データの取得（編集モード時）
  const [loadingRecord, setLoadingRecord] = useState(isEditMode)
  const [styleList, setStyleList] = useState<Style[]>([])
  const [loadingStyles, setLoadingStyles] = useState(true)
  const [competitions, setCompetitions] = useState<Competition[]>([])

  // ドロップダウンピッカーの状態
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [showCompetitionPicker, setShowCompetitionPicker] = useState(false)
  const competitionButtonRef = useRef<View>(null)
  const styleButtonRef = useRef<View>(null)
  const [dropdownLayout, setDropdownLayout] = useState({ top: 0, left: 0, width: 0 })

  // タイム表示用の状態（入力中は文字列、blur時にパース）
  const [timeDisplayValue, setTimeDisplayValue] = useState('')
  const [splitTimeDisplayValues, setSplitTimeDisplayValues] = useState<Record<number, string>>({})

  // 画像の状態管理
  const [newImageFiles, setNewImageFiles] = useState<ImageFile[]>([])
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([])
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([])

  // 秒数を表示用文字列に変換
  const formatSecondsToDisplay = (seconds: number): string => {
    if (!seconds || seconds <= 0) return ''
    const minutes = Math.floor(seconds / 60)
    const remainder = (seconds % 60).toFixed(2).padStart(5, '0')
    return minutes > 0 ? `${minutes}:${remainder}` : remainder
  }

  // 画像変更のハンドラー
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles)
    setDeletedImageIds(deletedIds)
  }, [])

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

  // 大会が選択されたら既存画像を読み込み
  const currentCompetitionId = routeCompetitionId || storeCompetitionId
  useEffect(() => {
    if (!currentCompetitionId || competitions.length === 0) {
      setExistingImages([])
      return
    }

    const selectedCompetition = competitions.find((c) => c.id === currentCompetitionId)
    if (selectedCompetition) {
      const images = getExistingImagesFromPaths(
        supabase,
        selectedCompetition.image_paths,
        'competition-images'
      )
      setExistingImages(images)
    } else {
      setExistingImages([])
    }
  }, [currentCompetitionId, competitions, supabase])

  const hasInitializedForEdit = useRef(false)

  // 二重送信防止用のref
  const isSubmittingRef = useRef(false)

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
      // 編集時にタイム表示値を初期化
      if (record.time && record.time > 0) {
        setTimeDisplayValue(formatSecondsToDisplay(record.time))
      }
      // スプリットタイム表示値を初期化
      if (record.split_times) {
        const displayValues: Record<number, string> = {}
        record.split_times.forEach((st: { split_time: number }, idx: number) => {
          if (st.split_time > 0) {
            displayValues[idx] = formatSecondsToDisplay(st.split_time)
          }
        })
        setSplitTimeDisplayValues(displayValues)
      }
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
  const updateCompetitionMutation = useUpdateCompetitionMutation(supabase)

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
    // 二重送信防止
    if (isSubmittingRef.current) return

    if (!validate()) {
      return
    }

    if (!user) {
      Alert.alert('エラー', '認証が必要です', [{ text: 'OK' }])
      return
    }

    isSubmittingRef.current = true
    setLoading(true)
    clearErrors()

    // アップロードした画像パス（ロールバック用）
    let uploadedImagePaths: string[] = []

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

      // レコード保存成功後に画像の処理（大会に紐づける）
      if (finalCompetitionId && (deletedImageIds.length > 0 || newImageFiles.length > 0)) {
        try {
          // 新規画像をアップロード（先にアップロードしてパスを取得）
          if (newImageFiles.length > 0) {
            const uploadResults = await uploadImages(
              supabase,
              user.id,
              finalCompetitionId,
              newImageFiles.map((f) => ({
                base64: f.base64,
                fileExtension: f.fileExtension,
              })),
              'competition-images'
            )
            uploadedImagePaths = uploadResults.map((r) => r.path)
          }

          // 既存画像パスから削除されたものを除外し、新規画像パスを追加
          const currentPaths = existingImages
            .filter((img) => !deletedImageIds.includes(img.id))
            .map((img) => img.id) // idがパス
          const updatedImagePaths = [...currentPaths, ...uploadedImagePaths]

          // 大会の画像パスを更新
          await updateCompetitionMutation.mutateAsync({
            id: finalCompetitionId,
            updates: {
              image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
            },
          })

          // 大会の画像パス更新成功後に削除対象画像をストレージから削除
          if (deletedImageIds.length > 0) {
            await deleteImages(supabase, deletedImageIds, 'competition-images')
          }
        } catch (imageError) {
          // 画像処理失敗時はアップロードした画像をロールバック
          if (uploadedImagePaths.length > 0) {
            try {
              await deleteImages(supabase, uploadedImagePaths, 'competition-images')
            } catch (rollbackError) {
              console.error('画像ロールバックエラー:', rollbackError)
            }
          }
          // レコードは保存済みなので、画像エラーは警告として表示
          console.error('画像処理エラー:', imageError)
          Alert.alert(
            '警告',
            'レコードは保存されましたが、画像の処理に失敗しました',
            [{ text: 'OK' }]
          )
        }
      }

      // カレンダーのクエリを無効化してリフレッシュ
      queryClient.invalidateQueries({ queryKey: ['calendar'] })

      // 成功: 前の画面に戻る
      reset()
      navigation.goBack()
    } catch (error) {
      console.error('保存エラー:', error)
      // レコード保存失敗時はアップロードした画像をロールバック
      if (uploadedImagePaths.length > 0) {
        try {
          await deleteImages(supabase, uploadedImagePaths, 'competition-images')
        } catch (rollbackError) {
          console.error('画像ロールバックエラー:', rollbackError)
        }
      }
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

  // キャンセル処理
  const handleCancel = () => {
    reset()
    navigation.goBack()
  }

  // スプリットタイムを追加（空の1行）
  const handleAddSplitTime = () => {
    addSplitTime({ distance: 0, splitTime: 0 })
  }

  // スプリットタイムを25mごとに追加
  const handleAddSplitTimesEvery25m = () => {
    const selectedStyle = styleList.find((s) => s.id === styleId)
    if (!selectedStyle?.distance) return

    const raceDistance = selectedStyle.distance
    const existingDistances = new Set(splitTimes.map((st) => st.distance))
    const newSplits: Array<{ distance: number; splitTime: number }> = []

    for (let distance = 25; distance <= raceDistance; distance += 25) {
      if (!existingDistances.has(distance)) {
        newSplits.push({ distance, splitTime: 0 })
      }
    }

    if (newSplits.length === 0) return

    // 既存のスプリットタイムに新しいものを追加
    const updatedSplitTimes = [...splitTimes, ...newSplits]
    setSplitTimes(updatedSplitTimes)
  }

  // スプリットタイムを距離でソートして表示用のインデックスマッピングを作成
  const sortedSplitIndices = useMemo(() => {
    return splitTimes
      .map((st, index) => ({ st, index }))
      .sort((a, b) => {
        // distance=0 は末尾に
        if (a.st.distance === 0 && b.st.distance === 0) return a.index - b.index
        if (a.st.distance === 0) return 1
        if (b.st.distance === 0) return -1
        return a.st.distance - b.st.distance
      })
  }, [splitTimes])

  // 選択中の種目の距離
  const selectedStyleDistance = useMemo(() => {
    if (styleId === null || styleId === undefined) return null
    const style = styleList.find((s) => s.id === styleId)
    return style?.distance ?? null
  }, [styleId, styleList])

  // タイム入力の処理（blur時に文字列から秒数に変換）
  const handleTimeBlur = () => {
    const text = timeDisplayValue.trim()
    if (text === '') {
      clearErrors()
      setTime(null)
      return
    }

    const { time: parsed } = parseMainTime(text)
    if (parsed <= 0) {
      setError('time', 'タイムの形式が正しくありません（例: 1:23.45 または 31-2）')
      setTime(null)
    } else {
      clearErrors()
      setTime(parsed)
      setTimeDisplayValue(formatSecondsToDisplay(parsed))
    }
  }

  // ドロップダウンを開く（ボタン位置を計測して表示）
  const screenHeight = Dimensions.get('window').height
  const DROPDOWN_MAX_HEIGHT = 260

  const openCompetitionPicker = useCallback(() => {
    Keyboard.dismiss()
    competitionButtonRef.current?.measureInWindow((x, y, width, height) => {
      const top = y + height + 4
      const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40
      setDropdownLayout({
        top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
        left: x,
        width,
      })
      setShowCompetitionPicker(true)
    })
  }, [screenHeight])

  const openStylePicker = useCallback(() => {
    Keyboard.dismiss()
    styleButtonRef.current?.measureInWindow((x, y, width, height) => {
      const top = y + height + 4
      const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40
      setDropdownLayout({
        top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
        left: x,
        width,
      })
      setShowStylePicker(true)
    })
  }, [screenHeight])

  // 反応時間入力の処理
  const handleReactionTimeChange = (text: string) => {
    const parsed = parseFloat(text)
    if (isNaN(parsed)) {
      setReactionTime(null)
    } else {
      setReactionTime(parsed)
    }
  }

  // 大会選択の表示名を取得
  const selectedCompetitionName = useMemo(() => {
    const id = routeCompetitionId || storeCompetitionId
    if (!id) return null
    const comp = competitions.find((c) => c.id === id)
    return comp ? (comp.title || comp.id) : null
  }, [routeCompetitionId, storeCompetitionId, competitions])

  // 種目選択の表示名を取得
  const selectedStyleName = useMemo(() => {
    if (styleId === null || styleId === undefined) return null
    const style = styleList.find((s) => s.id === styleId)
    return style ? `${style.name_jp}` : null
  }, [styleId, styleList])

  // ローディング状態
  if (loadingRecord || loadingStyles) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="データを読み込み中..." />
      </View>
    )
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.form}>
          {/* 大会選択 */}
          <View style={styles.field}>
            <Text style={styles.label}>
              大会 <Text style={styles.required}>*</Text>
            </Text>
            <Pressable
              ref={competitionButtonRef}
              style={[styles.pickerButton, errors.competitionId && styles.inputError]}
              onPress={openCompetitionPicker}
              disabled={!!routeCompetitionId || storeLoading}
            >
              <Text
                style={[
                  styles.pickerButtonText,
                  !selectedCompetitionName && styles.pickerButtonPlaceholder,
                ]}
              >
                {selectedCompetitionName || '大会を選択'}
              </Text>
              {!routeCompetitionId && (
                <Feather name="chevron-down" size={20} color="#6B7280" />
              )}
            </Pressable>
            {errors.competitionId && <Text style={styles.errorText}>{errors.competitionId}</Text>}
          </View>

          {/* 種目選択 */}
          <View style={styles.field}>
            <Text style={styles.label}>
              種目 <Text style={styles.required}>*</Text>
            </Text>
            <Pressable
              ref={styleButtonRef}
              style={[styles.pickerButton, errors.styleId && styles.inputError]}
              onPress={openStylePicker}
              disabled={storeLoading}
            >
              <Text
                style={[
                  styles.pickerButtonText,
                  !selectedStyleName && styles.pickerButtonPlaceholder,
                ]}
              >
                {selectedStyleName || '種目を選択'}
              </Text>
              <Feather name="chevron-down" size={20} color="#6B7280" />
            </Pressable>
            {errors.styleId && <Text style={styles.errorText}>{errors.styleId}</Text>}
          </View>

          {/* タイム入力 */}
          <View style={styles.field}>
            <Text style={styles.label}>
              タイム <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, errors.time && styles.inputError]}
              value={timeDisplayValue}
              onChangeText={setTimeDisplayValue}
              onBlur={handleTimeBlur}
              placeholder="例: 1:23.45 または 31-2"
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
              <View style={styles.splitTimeButtons}>
                <Pressable
                  style={[
                    styles.addButton,
                    styles.addButton25m,
                    (!selectedStyleDistance || storeLoading) && styles.addButtonDisabled,
                  ]}
                  onPress={handleAddSplitTimesEvery25m}
                  disabled={!selectedStyleDistance || storeLoading}
                >
                  <Text style={[
                    styles.addButtonText,
                    (!selectedStyleDistance || storeLoading) && styles.addButtonTextDisabled,
                  ]}>追加(25mごと)</Text>
                </Pressable>
                <Pressable
                  style={[styles.addButton, storeLoading && styles.addButtonDisabled]}
                  onPress={handleAddSplitTime}
                  disabled={storeLoading}
                >
                  <Text style={styles.addButtonText}>+ 追加</Text>
                </Pressable>
              </View>
            </View>
            {sortedSplitIndices.map(({ st, index: originalIndex }) => (
              <View key={originalIndex} style={styles.splitTimeRow}>
                <TextInput
                  style={[styles.input, styles.splitTimeDistance]}
                  value={st.distance > 0 ? st.distance.toString() : ''}
                  onChangeText={(text) => {
                    if (text === '') {
                      updateSplitTime(originalIndex, { distance: 0 })
                    } else {
                      const distance = parseInt(text, 10)
                      if (!isNaN(distance)) {
                        updateSplitTime(originalIndex, { distance })
                      }
                    }
                  }}
                  placeholder="距離 (m)"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  editable={!storeLoading}
                />
                <Text style={styles.splitTimeUnit}>m:</Text>
                <TextInput
                  style={[styles.input, styles.splitTimeTime]}
                  value={splitTimeDisplayValues[originalIndex] ?? (st.splitTime > 0 ? formatSecondsToDisplay(st.splitTime) : '')}
                  onChangeText={(text) => {
                    setSplitTimeDisplayValues((prev) => ({ ...prev, [originalIndex]: text }))
                  }}
                  onBlur={() => {
                    const text = (splitTimeDisplayValues[originalIndex] ?? '').trim()
                    if (text === '') {
                      updateSplitTime(originalIndex, { splitTime: 0 })
                      setSplitTimeDisplayValues((prev) => {
                        const next = { ...prev }
                        delete next[originalIndex]
                        return next
                      })
                      return
                    }
                    const { time: parsed } = parseSplitTime(text)
                    if (parsed > 0) {
                      updateSplitTime(originalIndex, { splitTime: parsed })
                      setSplitTimeDisplayValues((prev) => ({
                        ...prev,
                        [originalIndex]: formatSecondsToDisplay(parsed),
                      }))
                    }
                  }}
                  placeholder="例: 1:23.45 または 31-2"
                  placeholderTextColor="#9CA3AF"
                  editable={!storeLoading}
                />
                <Pressable
                  style={styles.removeButton}
                  onPress={() => {
                    removeSplitTime(originalIndex)
                    // スプリットタイム表示値のインデックスを再マッピング
                    setSplitTimeDisplayValues((prev) => {
                      const next: Record<number, string> = {}
                      Object.entries(prev).forEach(([k, v]) => {
                        const key = parseInt(k, 10)
                        if (key < originalIndex) next[key] = v
                        else if (key > originalIndex) next[key - 1] = v
                      })
                      return next
                    })
                  }}
                  disabled={storeLoading}
                >
                  <Feather name="trash-2" size={16} color="#FFFFFF" />
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

          {/* 画像 */}
          <View style={styles.field}>
            <ImageUploader
              existingImages={existingImages}
              onImagesChange={handleImagesChange}
              maxImages={3}
              disabled={storeLoading}
              label="画像"
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
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>保存</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* 大会選択ドロップダウン */}
      <Modal
        visible={showCompetitionPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompetitionPicker(false)}
      >
        <Pressable
          style={styles.dropdownOverlay}
          onPress={() => setShowCompetitionPicker(false)}
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
              {competitions.map((comp) => {
                const isSelected = (routeCompetitionId || storeCompetitionId) === comp.id
                return (
                  <Pressable
                    key={comp.id}
                    style={[
                      styles.dropdownOption,
                      isSelected && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setCompetitionId(comp.id)
                      if (errors.competitionId) clearErrors()
                      setShowCompetitionPicker(false)
                    }}
                  >
                    <View style={styles.dropdownOptionContent}>
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          isSelected && styles.dropdownOptionTextSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {comp.title || comp.id}
                      </Text>
                      {comp.date && (
                        <Text style={styles.dropdownOptionSubText}>{comp.date}</Text>
                      )}
                    </View>
                    {isSelected && (
                      <Feather name="check" size={16} color="#2563EB" />
                    )}
                  </Pressable>
                )
              })}
              {competitions.length === 0 && (
                <View style={styles.dropdownEmpty}>
                  <Text style={styles.dropdownEmptyText}>大会がありません</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* 種目選択ドロップダウン */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="fade"
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
              {styleList.map((style) => {
                const isSelected = styleId === style.id
                return (
                  <Pressable
                    key={style.id}
                    style={[
                      styles.dropdownOption,
                      isSelected && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setStyleId(style.id)
                      if (errors.styleId) clearErrors()
                      setShowStylePicker(false)
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
    </>
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
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
  dropdownOptionContent: {
    flex: 1,
    marginRight: 8,
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#111827',
  },
  dropdownOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
  dropdownOptionSubText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  dropdownEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  splitTimeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  splitTimeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  addButton25m: {
    backgroundColor: '#2563EB',
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addButtonTextDisabled: {
    color: '#FFFFFF',
  },
  splitTimeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  splitTimeDistance: {
    flex: 1,
  },
  splitTimeUnit: {
    fontSize: 14,
    color: '#6B7280',
  },
  splitTimeTime: {
    flex: 2,
  },
  removeButton: {
    padding: 8,
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
