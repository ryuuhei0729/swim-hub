import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { format, isValid } from 'date-fns'
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

  // 年・月・日の状態管理（テキスト入力）
  const [yearText, setYearText] = useState('')
  const [monthText, setMonthText] = useState('')
  const [dayText, setDayText] = useState('')
  const monthRef = useRef<TextInput>(null)
  const dayRef = useRef<TextInput>(null)

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      const birthdayStr = profile.birthday && profile.birthday.length >= 10
        ? profile.birthday.substring(0, 10)
        : ''
      setFormData({
        name: profile.name || '',
        birthday: birthdayStr,
        bio: profile.bio || '',
      })

      if (birthdayStr) {
        const [y, m, d] = birthdayStr.split('-')
        setYearText(y || '')
        setMonthText(m ? String(Number(m)) : '')
        setDayText(d ? String(Number(d)) : '')
      } else {
        setYearText('')
        setMonthText('')
        setDayText('')
      }
    }
    setError(null)
  }, [profile, visible])

  // 年・月・日テキストからformData.birthdayを更新
  useEffect(() => {
    const y = Number(yearText)
    const m = Number(monthText)
    const d = Number(dayText)
    if (y && m && d) {
      const date = new Date(y, m - 1, d)
      if (isValid(date) && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d) {
        setFormData((prev) => ({ ...prev, birthday: format(date, 'yyyy-MM-dd') }))
      } else {
        setFormData((prev) => ({ ...prev, birthday: '' }))
      }
    } else {
      setFormData((prev) => ({ ...prev, birthday: '' }))
    }
  }, [yearText, monthText, dayText])

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
            if (!listError || errorStatusCode === '404' || errorStatusCode === 404) {
              if (files && files.length > 0) {
                // すべてのファイルを削除
                const filePathsToDelete = files.map((f) => `${userFolderPath}/${f.name}`)

                await supabase.storage
                  .from('profile-images')
                  .remove(filePathsToDelete)
              }
            }
          } catch {
            // エラーが発生しても続行（新規ユーザーなど、フォルダが存在しない場合もある）
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
              <View style={styles.birthdayRow}>
                <View style={styles.birthdayField}>
                  <TextInput
                    style={styles.birthdayInput}
                    value={yearText}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '').slice(0, 4)
                      setYearText(num)
                      if (num.length === 4) monthRef.current?.focus()
                    }}
                    placeholder="1996"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={4}
                    editable={!isUpdating}
                    accessibilityLabel="生年"
                  />
                  <Text style={styles.birthdaySuffix}>年</Text>
                </View>
                <View style={styles.birthdayField}>
                  <TextInput
                    ref={monthRef}
                    style={styles.birthdayInput}
                    value={monthText}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '').slice(0, 2)
                      setMonthText(num)
                      if (num.length === 2 || (num.length === 1 && Number(num) > 1)) dayRef.current?.focus()
                    }}
                    placeholder="2"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!isUpdating}
                    accessibilityLabel="生月"
                  />
                  <Text style={styles.birthdaySuffix}>月</Text>
                </View>
                <View style={styles.birthdayField}>
                  <TextInput
                    ref={dayRef}
                    style={styles.birthdayInput}
                    value={dayText}
                    onChangeText={(text) => {
                      const num = text.replace(/[^0-9]/g, '').slice(0, 2)
                      setDayText(num)
                    }}
                    placeholder="22"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!isUpdating}
                    accessibilityLabel="生日"
                  />
                  <Text style={styles.birthdaySuffix}>日</Text>
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
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  birthdayField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  birthdayInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
  },
  birthdaySuffix: {
    fontSize: 14,
    color: '#374151',
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
