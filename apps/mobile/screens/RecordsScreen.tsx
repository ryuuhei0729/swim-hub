import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { View, Text, FlatList, TextInput, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '@/contexts/AuthProvider'
import { useRecordsQuery } from '@apps/shared/hooks/queries/records'
import { useRecordFilterStore } from '@/stores/recordFilterStore'
import { RecordItem } from '@/components/records'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { RecordWithDetails } from '@swim-hub/shared/types/database'

type RecordsScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 大会記録一覧画面
 * 大会記録の一覧を表示し、フィルター、ソート、プルリフレッシュ、無限スクロール機能を提供
 */
export const RecordsScreen: React.FC = () => {
  const navigation = useNavigation<RecordsScreenNavigationProp>()
  const { supabase } = useAuth()
  const [page, setPage] = useState(1)
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [allRecords, setAllRecords] = useState<RecordWithDetails[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // フィルターストア
  const {
    filterStyleId,
    filterFiscalYear,
    filterPoolType,
    sortBy,
    sortOrder,
  } = useRecordFilterStore()

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

  // 大会記録データ取得
  const {
    records = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecordsQuery(supabase, {
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    styleId: filterStyleId || undefined,
    page,
    pageSize: 20,
    enableRealtime: true,
  })

  // フィルター適用（プールタイプ、年度）
  const filteredRecords = useMemo(() => {
    let filtered = [...records]

    // プールタイプフィルター
    if (filterPoolType !== null) {
      filtered = filtered.filter((record) => {
        const poolType = record.competition?.pool_type
        return poolType === filterPoolType
      })
    }

    // 年度フィルター
    if (filterFiscalYear) {
      const fiscalYearStart = `${filterFiscalYear}-04-01`
      const fiscalYearEnd = `${parseInt(filterFiscalYear) + 1}-03-31`
      filtered = filtered.filter((record) => {
        const recordDate = record.competition?.date || record.created_at
        return recordDate >= fiscalYearStart && recordDate <= fiscalYearEnd
      })
    }

    // ソート
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.competition?.date || a.created_at).getTime()
        const dateB = new Date(b.competition?.date || b.created_at).getTime()
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
      } else {
        // タイムでソート
        return sortOrder === 'asc' ? a.time - b.time : b.time - a.time
      }
    })

    return filtered
  }, [records, filterPoolType, filterFiscalYear, sortBy, sortOrder])

  // ページが変更されたらデータを結合
  useEffect(() => {
    if (records.length > 0) {
      if (page === 1) {
        // 最初のページまたはリフレッシュ時は置き換え
        setAllRecords(filteredRecords)
        setHasMore(records.length === 20) // フィルタ前の件数で判定
      } else {
        // 2ページ目以降は追加
        setAllRecords((prev) => {
          // 重複を避ける
          const existingIds = new Set(prev.map((r) => r.id))
          const newRecords = filteredRecords.filter((r) => !existingIds.has(r.id))
          return [...prev, ...newRecords]
        })
        setHasMore(records.length === 20) // フィルタ前の件数で判定
      }
      setLoadingMore(false)
    } else if (page === 1 && !isLoading) {
      // データが空の場合
      setAllRecords([])
      setHasMore(false)
    }
  }, [filteredRecords, records.length, page, isLoading])

  // フィルターが変更されたらリセット
  useEffect(() => {
    setAllRecords([])
    setPage(1)
    setHasMore(true)
  }, [defaultStartDate, defaultEndDate, filterStyleId, filterPoolType, filterFiscalYear, sortBy, sortOrder])

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
    setAllRecords([])
    setHasMore(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

  // 無限スクロール処理
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !isLoading) {
      setLoadingMore(true)
      setPage((prev) => prev + 1)
    }
  }, [loadingMore, hasMore, isLoading])

  // 記録アイテムのタップ処理
  const handleRecordPress = useCallback(
    (record: RecordWithDetails) => {
      navigation.navigate('RecordDetail', { recordId: record.id })
    },
    [navigation]
  )

  // アイテムをレンダリング（メモ化）
  const renderItem = useCallback(
    ({ item }: { item: RecordWithDetails }) => {
      return <RecordItem record={item} onPress={handleRecordPress} />
    },
    [handleRecordPress]
  )

  // 作成画面への遷移
  const handleCreate = () => {
    navigation.navigate('RecordForm', {})
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || '大会記録の取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // ローディング状態（初回のみ）
  if (isLoading && allRecords.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="大会記録を読み込み中..." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* 日付フィルターUI */}
      <View style={styles.filterContainer}>
        <View style={styles.dateFilterRow}>
          <TextInput
            style={styles.dateInput}
            value={startDate || ''}
            onChangeText={setStartDate}
            placeholder="開始日 (YYYY-MM-DD)"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.dateSeparator}>〜</Text>
          <TextInput
            style={styles.dateInput}
            value={endDate || ''}
            onChangeText={setEndDate}
            placeholder="終了日 (YYYY-MM-DD)"
            placeholderTextColor="#9CA3AF"
          />
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
        data={allRecords}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        // パフォーマンス最適化
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={50}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>大会記録がありません</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <LoadingSpinner size="small" />
            </View>
          ) : null
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
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  dateSeparator: {
    fontSize: 14,
    color: '#6B7280',
  },
  resetButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    alignSelf: 'flex-start',
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
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
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
