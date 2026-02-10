import React, { useEffect, useRef, useState, useCallback } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform, ActivityIndicator } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  usePracticesQuery,
} from '@apps/shared/hooks/queries/practices'
import { useUserQuery } from '@apps/shared/hooks/queries/user'
import { practiceKeys } from '@apps/shared/hooks/queries/keys'
import { usePracticeFormStore } from '@/stores/practiceFormStore'
import { useIOSCalendarSync } from '@/hooks/useIOSCalendarSync'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ImageUploader, ImageFile, ExistingImage } from '@/components/shared/ImageUploader'
import {
  uploadImages,
  deleteImages,
  getExistingImagesFromPaths,
} from '@/utils/imageUpload'
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
  const { practiceId, date: initialDateParam } = route.params || {}
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()
  const isEditMode = !!practiceId

  // ユーザープロフィール取得（iOSカレンダー設定確認用）
  const { profile } = useUserQuery(supabase, { enableRealtime: false })

  // iOSカレンダー同期フック
  const { syncPractice } = useIOSCalendarSync()

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
  const initializedRef = useRef(false)

  // 二重送信防止用のref
  const isSubmittingRef = useRef(false)

  // 画像の状態管理
  const [newImageFiles, setNewImageFiles] = useState<ImageFile[]>([])
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([])
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([])

  // 画像変更のハンドラー
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles)
    setDeletedImageIds(deletedIds)
  }, [])

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
    if (initializedRef.current) return

    if (isEditMode && practiceId) {
      // 編集モード: 既存データを取得
      setLoadingPractice(true)
      const practice = practices.find((p) => p.id === practiceId)
      if (practice) {
        initialize(practice)
        // 既存画像を読み込み
        const images = getExistingImagesFromPaths(
          supabase,
          practice.image_paths,
          'practice-images'
        )
        setExistingImages(images)
        initializedRef.current = true
        setLoadingPractice(false)
      } else if (!loadingPractices) {
        // データが見つからない場合
        setLoadingPractice(false)
      }
    } else {
      // 作成モード: 空のフォームで初期化
      initialize()
      initializedRef.current = true
      if (initialDateParam) {
        setDate(initialDateParam)
      }
      setLoadingPractice(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, practiceId, loadingPractices, initialDateParam, practices, supabase])

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
        const [year, month, day] = date.split('-').map(Number)
        if (
          isNaN(dateObj.getTime()) ||
          dateObj.getFullYear() !== year ||
          dateObj.getMonth() + 1 !== month ||
          dateObj.getDate() !== day
        ) {
          setError('date', '有効な日付を入力してください')
          isValid = false
        }
      }
    }

    return isValid
  }

  // 保存処理（ダッシュボードに戻る）
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

    try {
      if (isEditMode && practiceId) {
        // 新規画像をアップロード
        let newImagePaths: string[] = []
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImages(
            supabase,
            user.id,
            practiceId,
            newImageFiles.map((f) => ({
              base64: f.base64,
              fileExtension: f.fileExtension,
            })),
            'practice-images'
          )
          newImagePaths = uploadResults.map((r) => r.path)
        }

        // 既存画像パスから削除されたものを除外し、新規画像パスを追加
        const currentPaths = existingImages
          .filter((img) => !deletedImageIds.includes(img.id))
          .map((img) => img.id) // idがパス
        const updatedImagePaths = [...currentPaths, ...newImagePaths]

        const formData = {
          date,
          title: title && title.trim() !== '' ? title.trim() : null,
          place: place && place.trim() !== '' ? place.trim() : null,
          note: note && note.trim() !== '' ? note.trim() : null,
          image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
        }

        // 更新
        await updateMutation.mutateAsync({
          id: practiceId,
          updates: formData,
        })

        // DB更新成功後に削除対象画像をストレージから削除
        if (deletedImageIds.length > 0) {
          await deleteImages(supabase, deletedImageIds, 'practice-images')
        }

        // iOSカレンダー同期（iOS端末かつ連携が有効な場合）
        // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
        if (Platform.OS === 'ios' && profile?.ios_calendar_enabled && profile?.ios_calendar_sync_practices) {
          const practiceForSync = practices.find((p) => p.id === practiceId)
          if (practiceForSync) {
            try {
              await syncPractice({ ...practiceForSync, ...formData }, 'update')
            } catch (syncError) {
              console.warn('カレンダー同期エラー:', syncError)
              Alert.alert(
                'カレンダー同期に失敗',
                '練習記録は保存されましたが、カレンダーへの同期に失敗しました。',
                [{ text: 'OK' }]
              )
            }
          }
        }

        // カレンダーと練習一覧のクエリを無効化してリフレッシュ
        queryClient.invalidateQueries({ queryKey: ['calendar'] })
        queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
        // 成功: 前の画面に戻る
        reset()
        navigation.goBack()
      } else {
        // 作成
        const formData = {
          date,
          title: title && title.trim() !== '' ? title.trim() : null,
          place: place && place.trim() !== '' ? place.trim() : null,
          note: note && note.trim() !== '' ? note.trim() : null,
        }

        const createdPractice = await createMutation.mutateAsync(formData)

        // 新規画像をアップロード
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImages(
            supabase,
            user.id,
            createdPractice.id,
            newImageFiles.map((f) => ({
              base64: f.base64,
              fileExtension: f.fileExtension,
            })),
            'practice-images'
          )
          const imagePaths = uploadResults.map((r) => r.path)

          // 練習記録を画像パスで更新
          await updateMutation.mutateAsync({
            id: createdPractice.id,
            updates: { image_paths: imagePaths },
          })
        }

        // iOSカレンダー同期（iOS端末かつ連携が有効な場合）
        // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
        if (Platform.OS === 'ios' && profile?.ios_calendar_enabled && profile?.ios_calendar_sync_practices) {
          try {
            await syncPractice(createdPractice, 'create')
          } catch (syncError) {
            console.warn('カレンダー同期エラー:', syncError)
            Alert.alert(
              'カレンダー同期に失敗',
              '練習記録は保存されましたが、カレンダーへの同期に失敗しました。',
              [{ text: 'OK' }]
            )
          }
        }

        // カレンダーと練習一覧のクエリを無効化してリフレッシュ
        queryClient.invalidateQueries({ queryKey: ['calendar'] })
        queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
        // 成功: 前の画面に戻る（練習タブから来た場合は練習タブに戻る）
        reset()
        navigation.goBack()
      }
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

  // 続けて練習ログを作成（PracticeLogFormScreenへ遷移）
  const handleContinueToLog = async () => {
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

    try {
      if (isEditMode && practiceId) {
        // 新規画像をアップロード
        let newImagePaths: string[] = []
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImages(
            supabase,
            user.id,
            practiceId,
            newImageFiles.map((f) => ({
              base64: f.base64,
              fileExtension: f.fileExtension,
            })),
            'practice-images'
          )
          newImagePaths = uploadResults.map((r) => r.path)
        }

        // 既存画像パスから削除されたものを除外し、新規画像パスを追加
        const currentPaths = existingImages
          .filter((img) => !deletedImageIds.includes(img.id))
          .map((img) => img.id)
        const updatedImagePaths = [...currentPaths, ...newImagePaths]

        const formData = {
          date,
          title: title && title.trim() !== '' ? title.trim() : null,
          place: place && place.trim() !== '' ? place.trim() : null,
          note: note && note.trim() !== '' ? note.trim() : null,
          image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
        }

        // 編集モード: 練習を更新
        await updateMutation.mutateAsync({
          id: practiceId,
          updates: formData,
        })

        // DB更新成功後に削除対象画像をストレージから削除
        if (deletedImageIds.length > 0) {
          await deleteImages(supabase, deletedImageIds, 'practice-images')
        }

        // iOSカレンダー同期（iOS端末かつ連携が有効な場合）
        // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
        if (Platform.OS === 'ios' && profile?.ios_calendar_enabled && profile?.ios_calendar_sync_practices) {
          const practiceForSync = practices.find((p) => p.id === practiceId)
          if (practiceForSync) {
            try {
              await syncPractice({ ...practiceForSync, ...formData }, 'update')
            } catch (syncError) {
              console.warn('カレンダー同期エラー:', syncError)
              Alert.alert(
                'カレンダー同期に失敗',
                '練習記録は保存されましたが、カレンダーへの同期に失敗しました。',
                [{ text: 'OK' }]
              )
            }
          }
        }

        queryClient.invalidateQueries({ queryKey: ['calendar'] })
        queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
        reset()
        navigation.navigate('PracticeLogForm', {
          practiceId: practiceId,
          returnTo: 'dashboard',
        })
      } else {
        // 作成
        const formData = {
          date,
          title: title && title.trim() !== '' ? title.trim() : null,
          place: place && place.trim() !== '' ? place.trim() : null,
          note: note && note.trim() !== '' ? note.trim() : null,
        }

        const createdPractice = await createMutation.mutateAsync(formData)

        // 新規画像をアップロード
        if (newImageFiles.length > 0) {
          const uploadResults = await uploadImages(
            supabase,
            user.id,
            createdPractice.id,
            newImageFiles.map((f) => ({
              base64: f.base64,
              fileExtension: f.fileExtension,
            })),
            'practice-images'
          )
          const imagePaths = uploadResults.map((r) => r.path)

          // 練習記録を画像パスで更新
          await updateMutation.mutateAsync({
            id: createdPractice.id,
            updates: { image_paths: imagePaths },
          })
        }

        // iOSカレンダー同期（iOS端末かつ連携が有効な場合）
        // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
        if (Platform.OS === 'ios' && profile?.ios_calendar_enabled && profile?.ios_calendar_sync_practices) {
          try {
            await syncPractice(createdPractice, 'create')
          } catch (syncError) {
            console.warn('カレンダー同期エラー:', syncError)
            Alert.alert(
              'カレンダー同期に失敗',
              '練習記録は保存されましたが、カレンダーへの同期に失敗しました。',
              [{ text: 'OK' }]
            )
          }
        }

        // カレンダーと練習一覧のクエリを無効化してリフレッシュ
        queryClient.invalidateQueries({ queryKey: ['calendar'] })
        queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
        // 成功: PracticeLogFormScreenへ遷移
        reset()
        navigation.navigate('PracticeLogForm', {
          practiceId: createdPractice.id,
          returnTo: 'dashboard',
        })
      }
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
            onChangeText={setTitle}
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
            onChangeText={setPlace}
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
            onChangeText={setNote}
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

        {/* 続けて練習ログを作成ボタン */}
        <Pressable
          style={[styles.continueButton, storeLoading && styles.buttonDisabled]}
          onPress={handleContinueToLog}
          disabled={storeLoading}
        >
          {storeLoading ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Text style={styles.continueButtonText}>続けて練習ログを作成</Text>
          )}
        </Pressable>
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
