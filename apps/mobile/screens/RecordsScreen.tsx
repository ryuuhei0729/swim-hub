import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { View, Text, FlatList, TextInput, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { format, subYears } from 'date-fns'
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
    const date = subYears(new Date(), 1)
    return format(date, 'yyyy-MM-dd')
  }, [startDate])

  const defaultEndDate = useMemo(() => {
    if (endDate) return endDate
    return format(new Date(), 'yyyy-MM-dd')
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
      const fy = parseInt(filterFiscalYear)
      const fyNext = fy + 1
      // 年度の開始日（4月1日 00:00:00 UTC）
      const fiscalYearStart = new Date(`${fy}-04-01T00:00:00.000Z`).getTime()
      // 年度の終了日（翌年3月31日 23:59:59.999 UTC）
      const fiscalYearEnd = new Date(`${fyNext}-03-31T23:59:59.999Z`).getTime()
      filtered = filtered.filter((record) => {
        const recordDateStr = record.competition?.date || record.created_at
        if (!recordDateStr) return false
        const recordDate = new Date(recordDateStr)
        // 無効な日付を除外
        if (isNaN(recordDate.getTime())) return false
        const recordTimestamp = recordDate.getTime()
        return recordTimestamp >= fiscalYearStart && recordTimestamp <= fiscalYearEnd
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
      setLoadingMore(false)
    }
  }, [filteredRecords, records, page, isLoading])

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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ErrorView
          message={error.message || '大会記録の取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    )
  }

  // ローディング状態（初回のみ）
  if (isLoading && allRecords.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="大会記録を読み込み中..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
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
    </SafeAreaView>
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
