import React, { useState, useEffect } from 'react'
import { parse, format, isValid } from 'date-fns'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { AvatarUpload } from './AvatarUpload'
import type { UserProfile } from '@swim-hub/shared/types/database'

interface ProfileEditModalProps {
  visible: boolean
  onClose: () => void
  profile: Partial<UserProfile>
  onUpdate: (updatedProfile: Partial<UserProfile>) => Promise<void>
  onAvatarChange: (newAvatarUrl: string | null) => void
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
  const [formData, setFormData] = useState({
    name: '',
    birthday: '',
    bio: '',
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        birthday: profile.birthday ? format(new Date(profile.birthday), 'yyyy-MM-dd') : '',
        bio: profile.bio || '',
      })
    }
    setError(null)
  }, [profile, visible])

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

      // 誕生日を日付文字列として検証（不正値はnullとして扱う）
      let birthday: string | null = null
      if (formData.birthday) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (dateRegex.test(formData.birthday)) {
          const [year, month, day] = formData.birthday.split('-').map(Number)
          const utcDate = new Date(Date.UTC(year, month - 1, day))
          const isValidDate =
            !Number.isNaN(utcDate.getTime()) &&
            utcDate.getUTCFullYear() === year &&
            utcDate.getUTCMonth() === month - 1 &&
            utcDate.getUTCDate() === day
          birthday = isValidDate ? formData.birthday : null
        }
      }

      await onUpdate({
        name: formData.name.trim(),
        birthday,
        bio: formData.bio.trim() || null,
      })

      // 成功時は即時にモーダルを閉じる
      handleClose()
    } catch (err) {
      console.error('プロフィール更新エラー:', err)
      const errorMessage = err instanceof Error ? err.message : 'プロフィールの更新に失敗しました'
      setError(errorMessage)
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

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
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
              <TextInput
                style={styles.input}
                value={formData.birthday}
                onChangeText={(text) => {
                  setFormData((prev) => ({ ...prev, birthday: text }))
                  setError(null)
                }}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                editable={!isUpdating}
              />
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
    flex: 1,
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
