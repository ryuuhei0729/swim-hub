'use client'

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import type { PracticeTag } from '@apps/shared/types'

interface TagChipsProps {
  tags: PracticeTag[]
  onPress: () => void
  onRemove: (tagId: string) => void
  disabled?: boolean
}

/**
 * 選択済みタグを折り返し表示するコンポーネント
 * タップでタグ選択モーダルを開く
 */
export const TagChips: React.FC<TagChipsProps> = ({
  tags,
  onPress,
  onRemove,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      {tags.length === 0 ? (
        <Pressable
          style={styles.addButton}
          onPress={onPress}
          disabled={disabled}
        >
          <Feather name="plus" size={16} color="#6B7280" />
          <Text style={styles.addButtonText}>タグを追加</Text>
        </Pressable>
      ) : (
        <View style={styles.tagsWrap}>
          {tags.map((tag) => (
            <View
              key={tag.id}
              style={[styles.chip, { backgroundColor: tag.color }]}
            >
              <Pressable
                style={styles.chipContent}
                onPress={onPress}
                disabled={disabled}
              >
                <Text style={styles.chipText}>{tag.name}</Text>
              </Pressable>
              {!disabled && (
                <Pressable
                  style={styles.removeButton}
                  onPress={() => onRemove(tag.id)}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                >
                  <Feather name="x" size={12} color="#374151" />
                </Pressable>
              )}
            </View>
          ))}
          <Pressable
            style={styles.addMoreButton}
            onPress={onPress}
            disabled={disabled}
          >
            <Feather name="plus" size={16} color="#6B7280" />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: 36,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    backgroundColor: '#F9FAFB',
  },
  addButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  removeButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addMoreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
})

export default TagChips
