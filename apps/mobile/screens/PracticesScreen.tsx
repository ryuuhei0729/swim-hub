import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, FlatList, TextInput, StyleSheet, Pressable, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthProvider'
import { practiceKeys } from '@apps/shared/hooks/queries/keys'
import { PracticeAPI } from '@apps/shared/api/practices'
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
  const [startDate, setStartDate] = useState<string | undefined>(undefined)
  const [endDate, setEndDate] = useState<string | undefined>(undefined)
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')
  const [startDateError, setStartDateError] = useState<string | null>(null)
  const [endDateError, setEndDateError] = useState<string | null>(null)

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

  const practiceApi = useMemo(() => new PracticeAPI(supabase), [supabase])

  const {
    data,
    error,
    isLoading,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: practiceKeys.list({ startDate: defaultStartDate, endDate: defaultEndDate, pageSize: 20 }),
    queryFn: async ({ pageParam = 1 }) => {
      const offset = (pageParam - 1) * 20
      return await practiceApi.getPractices(defaultStartDate, defaultEndDate, 20, offset)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.length === 20 ? pages.length + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  })

  const allPractices = useMemo(() => data?.pages.flat() ?? [], [data])

  const dateRegex = useMemo(() => /^\d{4}-\d{2}-\d{2}$/, [])

  // 日付フィルターのリセット
  const handleResetDateFilter = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setStartDateInput('')
    setEndDateInput('')
    setStartDateError(null)
    setEndDateError(null)
  }

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  // 次のページを読み込む
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isLoading])

  // 練習記録アイテムのレンダリング（メモ化）
  // ⚠️ 重要: すべてのフックは条件付きレンダリングの前に定義する必要がある
  const renderItem = useCallback(
    ({ item }: { item: PracticeWithLogs }) => (
      <PracticeItem
        practice={item}
        onPress={(practice) => {
          navigation.navigate('PracticeDetail', { practiceId: practice.id })
        }}
      />
    ),
    [navigation]
  )

  // 作成画面への遷移
  const handleCreate = useCallback(() => {
    navigation.navigate('PracticeForm', {})
  }, [navigation])

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

  return (
    <View style={styles.container}>
      {/* 日付フィルターUI */}
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>開始日</Text>
            <TextInput
              style={[styles.filterInput, startDateError && styles.filterInputError]}
              value={startDateInput}
              onChangeText={(text) => {
                setStartDateInput(text)
                if (!text) {
                  setStartDate(undefined)
                  setStartDateError(null)
                  return
                }
                if (!dateRegex.test(text)) {
                  setStartDateError('YYYY-MM-DD形式で入力してください')
                  return
                }
                setStartDateError(null)
                setStartDate(text)
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="開始日入力"
            />
            {startDateError && <Text style={styles.errorText}>{startDateError}</Text>}
          </View>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>終了日</Text>
            <TextInput
              style={[styles.filterInput, endDateError && styles.filterInputError]}
              value={endDateInput}
              onChangeText={(text) => {
                setEndDateInput(text)
                if (!text) {
                  setEndDate(undefined)
                  setEndDateError(null)
                  return
                }
                if (!dateRegex.test(text)) {
                  setEndDateError('YYYY-MM-DD形式で入力してください')
                  return
                }
                setEndDateError(null)
                setEndDate(text)
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              accessibilityLabel="終了日入力"
            />
            {endDateError && <Text style={styles.errorText}>{endDateError}</Text>}
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
        <Pressable
          style={styles.fab}
          onPress={handleCreate}
          accessibilityLabel="練習記録を作成"
          accessibilityRole="button"
        >
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
            refreshing={isRefetching && !isFetchingNextPage}
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
        ListFooterComponent={
          isFetchingNextPage ? (
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
  filterInputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: '#DC2626',
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
