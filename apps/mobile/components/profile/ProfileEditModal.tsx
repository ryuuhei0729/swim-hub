import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { AvatarUpload } from './AvatarUpload'
import { useAuth } from '@/contexts/AuthProvider'
import type { UserProfile } from '@swim-hub/shared/types'
import { base64ToArrayBuffer } from '@/utils/base64'

interface ProfileEditModalProps {
  visible: boolean
  onClose: () => void
  profile: Partial<UserProfile>
  onUpdate: (updatedProfile: Partial<UserProfile>) => Promise<void>
  onAvatarChange: (newAvatarUrl: string | null) => Promise<void>
}

/**
 * プロフィール編集モーダルコンポーネント
 */
export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  visible,
  onClose,
  profile,
  onUpdate,
  onAvatarChange,
}) => {
  const { supabase, user } = useAuth()
  const [formData, setFormData] = useState({
    name: '',
    birthday: '',
    bio: '',
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImageData, setSelectedImageData] = useState<{
    base64: string
    fileExtension: string
  } | null>(null)

  // 年・月・日の状態管理
  const currentDateRef = useRef(new Date())
  const currentDate = currentDateRef.current
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<number>(currentDate.getDate())

  // 日付変換ユーティリティ関数
  const parseBirthday = useCallback((birthdayStr: string): { year: number; month: number; day: number } => {
    if (!birthdayStr) {
      const now = new Date()
      return {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      }
    }
    const [year, month, day] = birthdayStr.split('-').map(Number)
    return {
      year: year || currentDate.getFullYear(),
      month: month || currentDate.getMonth() + 1,
      day: day || currentDate.getDate(),
    }
  }, [currentDate])

  const formatBirthday = (year: number, month: number, day: number): string => {
    const monthStr = month.toString().padStart(2, '0')
    const dayStr = day.toString().padStart(2, '0')
    return `${year}-${monthStr}-${dayStr}`
  }

  const getDaysInMonth = (year: number, month: number): number => {
    return new Date(year, month, 0).getDate()
  }

  // 年の選択肢（1900年〜現在の年）
  const years = useMemo(() => {
    const currentYear = currentDate.getFullYear()
    return Array.from({ length: currentYear - 1899 }, (_, i) => currentYear - i)
  }, [currentDate])

  // 月の選択肢（1-12月）
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1)
  }, [])

  // 日の選択肢（選択された年月に応じて動的に生成）
  const days = useMemo(() => {
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth)
    return Array.from({ length: daysInMonth }, (_, i) => i + 1)
  }, [selectedYear, selectedMonth])

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      // タイムゾーン問題を回避: birthdayを日付のみの値として扱い、ISO文字列の最初の10文字（YYYY-MM-DD）を抽出
      const birthdayStr = profile.birthday && profile.birthday.length >= 10
        ? profile.birthday.substring(0, 10)
        : ''
      setFormData({
        name: profile.name || '',
        birthday: birthdayStr,
        bio: profile.bio || '',
      })

      // 誕生日から年・月・日を抽出
      if (birthdayStr) {
        const { year, month, day } = parseBirthday(birthdayStr)
        setSelectedYear(year)
        setSelectedMonth(month)
        setSelectedDay(day)
      } else {
        // 誕生日がない場合は現在の日付を設定
        setSelectedYear(currentDate.getFullYear())
        setSelectedMonth(currentDate.getMonth() + 1)
        setSelectedDay(currentDate.getDate())
      }
    }
    setError(null)
  }, [profile, visible, currentDate, parseBirthday])

  // 年・月・日の変更時にformData.birthdayを更新
  useEffect(() => {
    const birthdayStr = formatBirthday(selectedYear, selectedMonth, selectedDay)
    setFormData((prev) => ({ ...prev, birthday: birthdayStr }))
    setError(null)
  }, [selectedYear, selectedMonth, selectedDay])

  // 月や年が変更されたときに、日が無効な値にならないように調整
  useEffect(() => {
    const daysInMonth = getDaysInMonth(selectedYear, selectedMonth)
    if (selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth)
    }
  }, [selectedYear, selectedMonth, selectedDay])

  const handleClose = () => {
    if (isUpdating) return
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError('名前は必須です')
      return
    }

    try {
      setIsUpdating(true)
      setError(null)

      // 選択した画像がある場合はアップロード
      if (selectedImageData && user) {
        try {
          const userFolderPath = `avatars/${user.id}`

          // 既存画像の削除（WEBの実装と同様）
          try {
            const { data: files, error: listError } = await supabase.storage
              .from('profile-images')
              .list(userFolderPath)

            // 404エラーは「ディレクトリが存在しない（削除するものがない）」として扱う
            const errorStatusCode = (listError as { statusCode?: string | number } | null)?.statusCode
            if (listError && errorStatusCode !== '404' && errorStatusCode !== 404) {
              console.warn('ファイル一覧取得エラー:', listError)
            } else if (files && files.length > 0) {
              // すべてのファイルを削除
              const filePathsToDelete = files.map((f) => `${userFolderPath}/${f.name}`)
              console.log('既存のプロフィール画像を削除中:', filePathsToDelete)

              const { error: deleteError } = await supabase.storage
                .from('profile-images')
                .remove(filePathsToDelete)

              if (deleteError) {
                console.warn('既存画像の削除に失敗:', deleteError)
              } else {
                console.log('既存のプロフィール画像を削除しました:', filePathsToDelete.length, 'ファイル')
              }
            }
          } catch (deleteErr) {
            console.warn('既存画像の削除処理でエラー:', deleteErr)
            // エラーが発生しても続行（新規ユーザーなど、フォルダが存在しない場合もある）
          }

          // base64をArrayBufferに変換（React Native対応）
          const base64Data = selectedImageData.base64
          const arrayBuffer = base64ToArrayBuffer(base64Data)

          // ファイル名を生成
          const fileExt = selectedImageData.fileExtension || 'jpg'
          const fileName = `${Date.now()}.${fileExt}`
          const filePath = `${userFolderPath}/${fileName}`

          // コンテンツタイプを決定
          const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg'

          // Supabase Storageにアップロード（React NativeではArrayBufferを使用）
          console.log('新しい画像をアップロード中:', filePath, 'サイズ:', arrayBuffer.byteLength, 'bytes')
          const { error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(filePath, arrayBuffer, {
              cacheControl: '3600',
              upsert: false,
              contentType,
            })

          if (uploadError) {
            console.error('アップロードエラー:', uploadError)
            throw uploadError
          }

          // 公開URLを取得（WEBの実装と同様）
          const { data } = supabase.storage.from('profile-images').getPublicUrl(filePath)
          const publicUrl = data?.publicUrl

          if (!publicUrl) {
            throw new Error('公開URLの取得に失敗しました')
          }

          console.log('新しい画像のアップロード完了:', publicUrl)

          // データベースのusersテーブルを更新（WEBの実装と同様）
          await onAvatarChange(publicUrl)
        } catch (err) {
          console.error('画像アップロードエラー:', err)
          const errorMessage = err instanceof Error ? err.message : '画像のアップロードに失敗しました'
          throw new Error(errorMessage)
        }
      }

      // 誕生日をISO形式に変換（タイムゾーン問題を回避: YYYY-MM-DD形式をUTC 00:00:00として扱う）
      const birthday = formData.birthday && formData.birthday.length >= 10
        ? `${formData.birthday}T00:00:00.000Z`
        : null

      await onUpdate({
        name: formData.name.trim(),
        birthday,
        bio: formData.bio.trim() || null,
      })

      // 成功時は即時にモーダルを閉じる
      setSelectedImageData(null)
      handleClose()
    } catch (err) {
      console.error('プロフィール更新エラー:', err)
      setError('プロフィールの更新に失敗しました')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>プロフィール編集</Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* アバター */}
            <View style={styles.avatarSection}>
              <AvatarUpload
                currentAvatarUrl={profile.profile_image_path ?? null}
                userName={formData.name || profile.name || ''}
                onAvatarChange={onAvatarChange}
                onImageSelected={(imageUri, base64Data, fileExtension) => {
                  setSelectedImageData({ base64: base64Data, fileExtension })
                }}
                disabled={isUpdating}
              />
            </View>

            {/* 名前 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                名前 <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => {
                  setFormData((prev) => ({ ...prev, name: text }))
                  setError(null)
                }}
                placeholder="名前を入力"
                placeholderTextColor="#9CA3AF"
                editable={!isUpdating}
              />
            </View>

            {/* 生年月日 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>生年月日</Text>
              <View style={styles.pickerContainer}>
                <View style={[styles.pickerWrapper, styles.pickerWrapperYear, styles.pickerWrapperWithBorder]}>
                  <Picker
                    selectedValue={selectedYear}
                    onValueChange={(value) => setSelectedYear(value)}
                    enabled={!isUpdating}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {years.map((year) => (
                      <Picker.Item key={year} label={`${year}年`} value={year} />
                    ))}
                  </Picker>
                </View>
                <View style={[styles.pickerWrapper, styles.pickerWrapperWithBorder]}>
                  <Picker
                    selectedValue={selectedMonth}
                    onValueChange={(value) => setSelectedMonth(value)}
                    enabled={!isUpdating}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {months.map((month) => (
                      <Picker.Item key={month} label={`${month}月`} value={month} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={selectedDay}
                    onValueChange={(value) => setSelectedDay(value)}
                    enabled={!isUpdating}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {days.map((day) => (
                      <Picker.Item key={day} label={`${day}日`} value={day} />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>

            {/* 自己紹介 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>自己紹介</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.bio}
                onChangeText={(text) => {
                  setFormData((prev) => ({ ...prev, bio: text }))
                  setError(null)
                }}
                placeholder="自己紹介を入力してください"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                maxLength={500}
                textAlignVertical="top"
                editable={!isUpdating}
              />
              <Text style={styles.charCount}>{formData.bio.length}/500文字</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={isUpdating}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.submitButton, isUpdating && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isUpdating || !formData.name.trim()}
            >
              <Text style={styles.submitButtonText}>
                {isUpdating ? '更新中...' : '更新'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 28,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    padding: 20,
    gap: 20,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
  avatarSection: {
    alignItems: 'center',
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  required: {
    color: '#DC2626',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  pickerContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: 200,
  },
  pickerWrapper: {
    flex: 1,
  },
  pickerWrapperYear: {
    flex: 1.4,
  },
  pickerWrapperWithBorder: {
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  picker: {
    width: '100%',
    height: 200,
  },
  pickerItem: {
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#2563EB',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
})
