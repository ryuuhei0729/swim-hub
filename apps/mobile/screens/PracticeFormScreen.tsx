import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  usePracticesQuery,
} from '@apps/shared/hooks/queries/practices'
import { usePracticeFormStore } from '@/stores/practiceFormStore'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import type { MainStackParamList } from '@/navigation/types'

type PracticeFormScreenRouteProp = RouteProp<MainStackParamList, 'PracticeForm'>
type PracticeFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 練習記録作成・編集画面
 * 練習記録の基本情報（日付、タイトル、場所、メモ）を入力・編集
 */
export const PracticeFormScreen: React.FC = () => {
  const route = useRoute<PracticeFormScreenRouteProp>()
  const navigation = useNavigation<PracticeFormScreenNavigationProp>()
  const { practiceId } = route.params || {}
  const { supabase } = useAuth()
  const isEditMode = !!practiceId

  // Zustandストア
  const {
    date,
    title,
    place,
    note,
    isLoading: storeLoading,
    errors,
    setDate,
    setTitle,
    setPlace,
    setNote,
    setLoading,
    setError,
    clearErrors,
    initialize,
    reset,
  } = usePracticeFormStore()

  // 既存データの取得（編集モード時）
  const [loadingPractice, setLoadingPractice] = useState(isEditMode)

  // 編集モード時は、usePracticesQueryでデータを取得してから該当のものを検索
  const {
    data: practices = [],
    isLoading: loadingPractices,
  } = usePracticesQuery(supabase, {
    page: 1,
    pageSize: 1000, // 十分な件数を取得
    enableRealtime: false, // 編集画面ではリアルタイム更新は不要
  })

  useEffect(() => {
    if (isEditMode && practiceId) {
      // 編集モード: 既存データを取得
      setLoadingPractice(true)
      const practice = practices.find((p) => p.id === practiceId)
      if (practice) {
        initialize(practice)
        setLoadingPractice(false)
      } else if (!loadingPractices) {
        // データが見つからない場合
        setLoadingPractice(false)
      }
    } else {
      // 作成モード: 空のフォームで初期化
      initialize()
      setLoadingPractice(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, practiceId, practices.length, loadingPractices])

  // ミューテーション
  const createMutation = useCreatePracticeMutation(supabase)
  const updateMutation = useUpdatePracticeMutation(supabase)

  // バリデーション
  const validate = (): boolean => {
    clearErrors()
    let isValid = true

    // 日付のバリデーション
    if (!date || date.trim() === '') {
      setError('date', '日付を入力してください')
      isValid = false
    } else {
      // YYYY-MM-DD形式のチェック
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(date)) {
        setError('date', '日付はYYYY-MM-DD形式で入力してください')
        isValid = false
      } else {
        // 有効な日付かチェック
        const dateObj = new Date(date)
        if (isNaN(dateObj.getTime())) {
          setError('date', '有効な日付を入力してください')
          isValid = false
        }
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
      const formData = {
        date,
        title: title && title.trim() !== '' ? title.trim() : null,
        place: place && place.trim() !== '' ? place.trim() : null,
        note: note && note.trim() !== '' ? note.trim() : null,
      }

      if (isEditMode && practiceId) {
        // 更新
        await updateMutation.mutateAsync({
          id: practiceId,
          updates: formData,
        })
      } else {
        // 作成
        await createMutation.mutateAsync(formData)
      }

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

  // ローディング状態
  if (loadingPractice) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="練習記録を読み込み中..." />
      </View>
    )
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.form}>
        {/* 日付 */}
        <View style={styles.field}>
          <Text style={styles.label}>
            日付 <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.date && styles.inputError]}
            value={date}
            onChangeText={(text) => {
              setDate(text)
              if (errors.date) {
                clearErrors()
              }
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9CA3AF"
            editable={!storeLoading}
          />
          {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        </View>

        {/* タイトル */}
        <View style={styles.field}>
          <Text style={styles.label}>タイトル</Text>
          <TextInput
            style={styles.input}
            value={title || ''}
            onChangeText={(text) => setTitle(text.trim() !== '' ? text : null)}
            placeholder="練習タイトル（任意）"
            placeholderTextColor="#9CA3AF"
            editable={!storeLoading}
          />
        </View>

        {/* 場所 */}
        <View style={styles.field}>
          <Text style={styles.label}>場所</Text>
          <TextInput
            style={styles.input}
            value={place || ''}
            onChangeText={(text) => setPlace(text.trim() !== '' ? text : null)}
            placeholder="練習場所（任意）"
            placeholderTextColor="#9CA3AF"
            editable={!storeLoading}
          />
        </View>

        {/* メモ */}
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
