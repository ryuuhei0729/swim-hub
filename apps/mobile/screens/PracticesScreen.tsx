import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { View, Text, FlatList, TextInput, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '@/contexts/AuthProvider'
import { usePracticesQuery } from '@apps/shared/hooks/queries/practices'
import { PracticeItem } from '@/components/practices'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { PracticeWithLogs } from '@swim-hub/shared/types/database'

type PracticesScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 練習記録一覧画面
 * 練習記録の一覧を表示し、日付フィルター、プルリフレッシュ、無限スクロール機能を提供
 */
export const PracticesScreen: React.FC = () => {
  const navigation = useNavigation<PracticesScreenNavigationProp>()
  const { supabase } = useAuth()
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [allPractices, setAllPractices] = useState<PracticeWithLogs[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // デフォルトの日付範囲（過去1年間）
  const defaultStartDate = useMemo(() => {
    if (startDate) return startDate
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    return date.toISOString().split('T')[0]
  }, [startDate])

  const defaultEndDate = useMemo(() => {
    if (endDate) return endDate
    return new Date().toISOString().split('T')[0]
  }, [endDate])

  // 練習記録データ取得
  const {
    data: practices = [],
    isLoading,
    error,
    refetch,
  } = usePracticesQuery(supabase, {
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    page,
    pageSize: 20,
    enableRealtime: true,
  })

  // ページが変更されたらデータを結合
  useEffect(() => {
    if (practices.length > 0) {
      if (page === 1) {
        // 最初のページまたはリフレッシュ時は置き換え
        setAllPractices(practices)
        setHasMore(practices.length === 20) // 20件未満なら最後のページ
      } else {
        // 2ページ目以降は追加
        setAllPractices((prev) => {
          // 重複を避ける
          const existingIds = new Set(prev.map((p) => p.id))
          const newPractices = practices.filter((p) => !existingIds.has(p.id))
          return [...prev, ...newPractices]
        })
        setHasMore(practices.length === 20) // 20件未満なら最後のページ
      }
      setLoadingMore(false)
    } else if (page === 1 && !isLoading) {
      // データが空の場合
      setAllPractices([])
      setHasMore(false)
    }
  }, [practices, page, isLoading])

  // 日付フィルターが変更されたらリセット
  useEffect(() => {
    setAllPractices([])
    setPage(1)
    setHasMore(true)
  }, [defaultStartDate, defaultEndDate])

  // 日付フィルターのリセット
  const handleResetDateFilter = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setPage(1)
  }

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setPage(1)
    setAllPractices([])
    setHasMore(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // 次のページを読み込む
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !isLoading) {
      setLoadingMore(true)
      setPage((prev) => prev + 1)
    }
  }, [loadingMore, hasMore, isLoading])

  // エラー状態
  if (error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || '練習記録の取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // ローディング状態（初回読み込み時）
  if (isLoading && allPractices.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="練習記録を読み込み中..." />
      </View>
    )
  }

  // データが空の場合
  if (allPractices.length === 0 && !isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>練習記録がありません</Text>
          <Text style={styles.emptySubtext}>
            {defaultStartDate} 〜 {defaultEndDate} の期間に記録がありません
          </Text>
        </View>
      </View>
    )
  }

  // 練習記録アイテムのレンダリング
  const renderItem = ({ item }: { item: PracticeWithLogs }) => (
    <PracticeItem
      practice={item}
      onPress={(practice) => {
        navigation.navigate('PracticeDetail', { practiceId: practice.id })
      }}
    />
  )

  // 作成画面への遷移
  const handleCreate = () => {
    navigation.navigate('PracticeForm', {})
  }

  return (
    <View style={styles.container}>
      {/* 日付フィルターUI */}
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>開始日</Text>
            <TextInput
              style={styles.filterInput}
              value={startDate || ''}
              onChangeText={(text) => {
                setStartDate(text || undefined)
                setPage(1)
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>終了日</Text>
            <TextInput
              style={styles.filterInput}
              value={endDate || ''}
              onChangeText={(text) => {
                setEndDate(text || undefined)
                setPage(1)
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>
        {(startDate || endDate) && (
          <Pressable style={styles.resetButton} onPress={handleResetDateFilter}>
            <Text style={styles.resetButtonText}>フィルターをリセット</Text>
          </Pressable>
        )}
      </View>

      {/* 作成ボタン */}
      <View style={styles.fabContainer}>
        <Pressable style={styles.fab} onPress={handleCreate}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      <FlatList
        data={allPractices}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <LoadingSpinner size="small" message="読み込み中..." />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>練習記録がありません</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  filterItem: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  filterInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  resetButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  resetButtonText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fabContainer: {
    position: 'absolute',
    bottom: 80,
    right: 16,
    zIndex: 1000,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 32,
  },
})
