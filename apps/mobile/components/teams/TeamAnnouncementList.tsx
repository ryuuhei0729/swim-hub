import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { TeamAnnouncement } from '@swim-hub/shared/types'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'

interface TeamAnnouncementListProps {
  announcements: TeamAnnouncement[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  isAdmin: boolean
  onRetry?: () => void
  onCreateNew?: () => void
  onEdit?: (announcement: TeamAnnouncement) => void
  onDelete?: (announcementId: string) => void
}

/**
 * チームお知らせ一覧コンポーネント
 */
export const TeamAnnouncementList: React.FC<TeamAnnouncementListProps> = ({
  announcements,
  isLoading,
  isError,
  error,
  isAdmin,
  onRetry,
  onCreateNew,
  onEdit,
  onDelete,
}) => {
  // ローディング状態
  if (isLoading && announcements.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner message="お知らせを読み込み中..." />
      </View>
    )
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || 'お知らせ一覧の取得に失敗しました'}
          onRetry={onRetry}
        />
      </View>
    )
  }

  // 日付フォーマット
  const formatDate = (dateString: string): string => {
    return format(new Date(dateString), 'yyyy年M月d日 HH:mm', { locale: ja })
  }

  return (
    <View style={styles.container}>
      {/* 管理者向けの作成ボタン */}
      {isAdmin && onCreateNew && (
        <View style={styles.actionBar}>
          <Pressable style={styles.createButton} onPress={onCreateNew}>
            <Text style={styles.createButtonText}>+ お知らせを作成</Text>
          </Pressable>
        </View>
      )}

      {/* お知らせ一覧 */}
      {announcements.length > 0 ? (
        <FlashList
          data={announcements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isPublished = item.is_published
            const startAt = item.start_at ? formatDate(item.start_at) : null
            const endAt = item.end_at ? formatDate(item.end_at) : null

            return (
              <View style={styles.announcementItem}>
                <View style={styles.announcementHeader}>
                  <View style={styles.announcementInfo}>
                    <Text style={styles.announcementTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <View style={styles.announcementMeta}>
                      <Text style={styles.announcementDate}>
                        {formatDate(item.created_at)}
                      </Text>
                      {!isPublished && (
                        <View style={styles.draftBadge}>
                          <Text style={styles.draftBadgeText}>下書き</Text>
                        </View>
                      )}
                    </View>
                    {startAt && endAt && (
                      <Text style={styles.announcementPeriod}>
                        公開期間: {startAt} 〜 {endAt}
                      </Text>
                    )}
                  </View>
                  {isAdmin && (onEdit || onDelete) && (
                    <View style={styles.announcementActions}>
                      {onEdit && (
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => onEdit(item)}
                        >
                          <Text style={styles.actionButtonText}>編集</Text>
                        </Pressable>
                      )}
                      {onDelete && (
                        <Pressable
                          style={[styles.actionButton, styles.deleteButton]}
                          onPress={() => onDelete(item.id)}
                        >
                          <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                            削除
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {item.content && (
                  <Text style={styles.announcementContent} numberOfLines={3}>
                    {item.content}
                  </Text>
                )}
              </View>
            )
          }}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>お知らせがありません</Text>
          {isAdmin && onCreateNew && (
            <Pressable style={styles.emptyCreateButton} onPress={onCreateNew}>
              <Text style={styles.emptyCreateButtonText}>お知らせを作成</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  actionBar: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  createButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  announcementItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  announcementHeader: {
    marginBottom: 8,
  },
  announcementInfo: {
    gap: 4,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  announcementMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  announcementDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  draftBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  draftBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#92400E',
  },
  announcementPeriod: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  announcementActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    color: '#DC2626',
  },
  announcementContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
  },
  emptyCreateButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyCreateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
