import React, { useState, useEffect } from 'react'
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from '@apps/shared/hooks/queries/teams'
import type { TeamAnnouncement } from '@swim-hub/shared/types'

interface TeamAnnouncementFormProps {
  visible: boolean
  onClose: () => void
  teamId: string
  editData?: TeamAnnouncement
  onSuccess?: () => void
}

/**
 * チームお知らせ作成・編集フォームコンポーネント
 */
export const TeamAnnouncementForm: React.FC<TeamAnnouncementFormProps> = ({
  visible,
  onClose,
  teamId,
  editData,
  onSuccess,
}) => {
  const { supabase, user } = useAuth()
  const createMutation = useCreateAnnouncementMutation(supabase)
  const updateMutation = useUpdateAnnouncementMutation(supabase)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPublished, setIsPublished] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isLoading = createMutation.isPending || updateMutation.isPending

  // 編集データがある場合はフォームに設定
  useEffect(() => {
    if (editData) {
      setTitle(editData.title)
      setContent(editData.content)
      setIsPublished(editData.is_published)
    } else {
      setTitle('')
      setContent('')
      setIsPublished(true)
    }
    setError(null)
  }, [editData, visible])

  const handleClose = () => {
    if (isLoading) return
    setTitle('')
    setContent('')
    setIsPublished(true)
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (!user) {
      setError('ログインが必要です')
      return
    }

    if (!title.trim()) {
      setError('タイトルを入力してください')
      return
    }

    if (!content.trim()) {
      setError('内容を入力してください')
      return
    }

    setError(null)

    try {
      if (editData) {
        // 更新
        await updateMutation.mutateAsync({
          id: editData.id,
          input: {
            title: title.trim(),
            content: content.trim(),
            is_published: isPublished,
          },
        })
      } else {
        // 新規作成
        await createMutation.mutateAsync({
          team_id: teamId,
          title: title.trim(),
          content: content.trim(),
          is_published: isPublished,
          created_by: user.id,
          start_at: null,
          end_at: null,
        })
      }

      if (onSuccess) {
        onSuccess()
      }

      handleClose()
    } catch (err) {
      console.error('お知らせ保存エラー:', err)
      let errorMessage = 'お知らせの保存に失敗しました'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message)
      }
      setError(errorMessage)
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
            <Text style={styles.title}>
              {editData ? 'お知らせを編集' : 'お知らせを作成'}
            </Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body}>
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>タイトル *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="お知らせのタイトルを入力"
                placeholderTextColor="#9CA3AF"
                editable={!isLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>内容 *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={content}
                onChangeText={setContent}
                placeholder="お知らせの内容を入力"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                editable={!isLoading}
              />
            </View>

            <View style={styles.formGroup}>
              <Pressable
                style={styles.checkboxContainer}
                onPress={() => setIsPublished(!isPublished)}
                disabled={isLoading}
              >
                <View style={[styles.checkbox, isPublished && styles.checkboxChecked]}>
                  {isPublished && <Text style={styles.checkboxMark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>公開する</Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading || !title.trim() || !content.trim()}
            >
              <Text style={styles.submitButtonText}>
                {isLoading ? '保存中...' : '保存'}
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
    maxWidth: 500,
    maxHeight: '80%',
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
    padding: 20,
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
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
    minHeight: 150,
    paddingTop: 12,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
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
