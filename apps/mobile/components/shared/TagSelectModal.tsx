'use client'

import React, { useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { PracticeTag } from '@apps/shared/types'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

interface TagSelectModalProps {
  visible: boolean
  onClose: () => void
  selectedTags: PracticeTag[]
  availableTags: PracticeTag[]
  onTagsChange: (tags: PracticeTag[]) => void
  onCreateTag: () => void
  onEditTag: (tag: PracticeTag) => void
  onDeleteTag: (tag: PracticeTag) => void
}

/**
 * タグ選択モーダル
 * 利用可能なタグ一覧から選択/解除ができる
 */
export const TagSelectModal: React.FC<TagSelectModalProps> = ({
  visible,
  onClose,
  selectedTags,
  availableTags,
  onTagsChange,
  onCreateTag,
  onEditTag,
  onDeleteTag,
}) => {
  const selectedIds = useMemo(
    () => new Set(selectedTags.map((t) => t.id)),
    [selectedTags]
  )

  const handleTagToggle = (tag: PracticeTag) => {
    if (selectedIds.has(tag.id)) {
      onTagsChange(selectedTags.filter((t) => t.id !== tag.id))
    } else {
      onTagsChange([...selectedTags, tag])
    }
  }

  const handleMorePress = (tag: PracticeTag) => {
    Alert.alert(
      tag.name,
      'タグの操作を選択してください',
      [
        {
          text: '編集',
          onPress: () => onEditTag(tag),
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'タグを削除',
              `「${tag.name}」を削除しますか？\nこのタグが付けられた練習ログからも削除されます。`,
              [
                { text: 'キャンセル', style: 'cancel' },
                {
                  text: '削除',
                  style: 'destructive',
                  onPress: () => onDeleteTag(tag),
                },
              ]
            )
          },
        },
        {
          text: 'キャンセル',
          style: 'cancel',
        },
      ]
    )
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* 背景タップで閉じる */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* ボトムシート */}
        <View style={styles.sheet}>
          {/* ハンドル */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title}>タグを選択</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Feather name="x" size={24} color="#374151" />
            </Pressable>
          </View>

          {/* タグ一覧 */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.tagsContainer}
            showsVerticalScrollIndicator={false}
          >
            {availableTags.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>タグがありません</Text>
                <Text style={styles.emptySubText}>
                  下のボタンから新しいタグを作成してください
                </Text>
              </View>
            ) : (
              <View style={styles.tagsGrid}>
                {availableTags.map((tag) => {
                  const isSelected = selectedIds.has(tag.id)
                  return (
                    <View
                      key={tag.id}
                      style={[
                        styles.tagItem,
                        { backgroundColor: tag.color },
                        isSelected && styles.tagItemSelected,
                      ]}
                    >
                      {/* タグ選択部分 */}
                      <Pressable
                        style={styles.tagContent}
                        onPress={() => handleTagToggle(tag)}
                      >
                        {isSelected && (
                          <View style={styles.checkIcon}>
                            <Feather name="check" size={12} color="#FFFFFF" />
                          </View>
                        )}
                        <Text style={styles.tagText}>{tag.name}</Text>
                      </Pressable>

                      {/* 三点リーダー */}
                      <Pressable
                        style={styles.moreButton}
                        onPress={() => handleMorePress(tag)}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Feather name="more-vertical" size={16} color="#374151" />
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            )}

            {/* 新規タグ作成ボタン */}
            <Pressable style={styles.createButton} onPress={onCreateTag}>
              <Feather name="plus" size={18} color="#2563EB" />
              <Text style={styles.createButtonText}>新しいタグを作成</Text>
            </Pressable>
          </ScrollView>

          {/* フッター */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {selectedTags.length}件選択中
            </Text>
            <Pressable style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>完了</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.55,
    paddingBottom: 34, // Safe area bottom
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  scrollView: {
    flexGrow: 0,
  },
  tagsContainer: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    color: '#6B7280',
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagItemSelected: {
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  tagContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2563EB',
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
  footerText: {
    fontSize: 14,
    color: '#6B7280',
  },
  doneButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})

export default TagSelectModal
