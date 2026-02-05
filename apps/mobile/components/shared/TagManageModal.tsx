'use client'

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { PracticeTag } from '@apps/shared/types'
import { PRESET_TAG_COLORS, getRandomTagColor } from '@/constants/tagColors'

interface TagManageModalProps {
  visible: boolean
  onClose: () => void
  tag: PracticeTag | null
  onSave: (name: string, color: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

/**
 * タグ作成/編集/削除モーダル
 */
export const TagManageModal: React.FC<TagManageModalProps> = ({
  visible,
  onClose,
  tag,
  onSave,
  onDelete,
}) => {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_TAG_COLORS[0])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isEditMode = tag !== null

  useEffect(() => {
    if (visible) {
      if (tag) {
        setName(tag.name)
        setColor(tag.color)
      } else {
        setName('')
        setColor(getRandomTagColor())
      }
    }
  }, [visible, tag])

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      Alert.alert('エラー', 'タグ名を入力してください')
      return
    }

    setIsSaving(true)
    try {
      await onSave(trimmedName, color)
      onClose()
    } catch (error) {
      console.error('タグ保存エラー:', error)
      Alert.alert(
        'エラー',
        error instanceof Error ? error.message : 'タグの保存に失敗しました'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = () => {
    if (!tag || !onDelete) return

    Alert.alert(
      'タグを削除',
      `「${tag.name}」を削除しますか？\nこのタグが付けられた練習ログからも削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true)
            try {
              await onDelete(tag.id)
              onClose()
            } catch (error) {
              console.error('タグ削除エラー:', error)
              Alert.alert(
                'エラー',
                error instanceof Error ? error.message : 'タグの削除に失敗しました'
              )
            } finally {
              setIsDeleting(false)
            }
          },
        },
      ]
    )
  }

  const isLoading = isSaving || isDeleting

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {isEditMode ? 'タグを編集' : '新しいタグ'}
          </Text>
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            disabled={isLoading}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Feather name="x" size={24} color="#374151" />
          </Pressable>
        </View>

        <View style={styles.content}>
          {/* タグ名入力 */}
          <View style={styles.field}>
            <Text style={styles.label}>タグ名</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例: インターバル"
              placeholderTextColor="#9CA3AF"
              maxLength={20}
              editable={!isLoading}
              autoFocus
            />
          </View>

          {/* カラー選択 */}
          <View style={styles.field}>
            <Text style={styles.label}>カラー</Text>
            <View style={styles.colorGrid}>
              {PRESET_TAG_COLORS.map((presetColor) => (
                <Pressable
                  key={presetColor}
                  style={[
                    styles.colorOption,
                    { backgroundColor: presetColor },
                    color === presetColor && styles.colorOptionSelected,
                  ]}
                  onPress={() => setColor(presetColor)}
                  disabled={isLoading}
                >
                  {color === presetColor && (
                    <Feather name="check" size={18} color="#374151" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>

          {/* プレビュー */}
          <View style={styles.field}>
            <Text style={styles.label}>プレビュー</Text>
            <View style={styles.previewContainer}>
              <View style={[styles.previewTag, { backgroundColor: color }]}>
                <Text style={styles.previewTagText}>
                  {name.trim() || 'タグ名'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          {isEditMode && onDelete && (
            <Pressable
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={isLoading}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Feather name="trash-2" size={18} color="#DC2626" />
                  <Text style={styles.deleteButtonText}>削除</Text>
                </>
              )}
            </Pressable>
          )}
          <View style={styles.footerRight}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[
                styles.saveButton,
                (!name.trim() || isLoading) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!name.trim() || isLoading}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>保存</Text>
              )}
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 24,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
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
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#374151',
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewTag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  previewTagText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#DC2626',
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 'auto',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})

export default TagManageModal
