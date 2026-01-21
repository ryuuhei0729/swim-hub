import React, { useMemo, useCallback } from 'react'
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthProvider'
import { practiceKeys } from '@apps/shared/hooks/queries/keys'
import { PracticeAPI } from '@apps/shared/api/practices'
import { PracticeItem } from '@/components/practices'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import { usePracticeFilterStore } from '@/stores/practiceFilterStore'
import type { MainStackParamList } from '@/navigation/types'
import type { PracticeWithLogs, PracticeTag } from '@swim-hub/shared/types'

type PracticesScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 練習記録一覧画面
 * 練習記録の一覧を表示し、日付フィルター、プルリフレッシュ、無限スクロール機能を提供
 */
export const PracticesScreen: React.FC = () => {
  const navigation = useNavigation<PracticesScreenNavigationProp>()
  const { supabase } = useAuth()
  
  // タグフィルターストア
  const {
    selectedTagIds,
    showTagFilter,
    setSelectedTags,
    toggleTagFilter,
  } = usePracticeFilterStore()

  // デフォルトの日付範囲（過去1年間）
  const defaultStartDate = useMemo(() => {
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    return date.toISOString().split('T')[0]
  }, [])

  const defaultEndDate = useMemo(() => {
    return new Date().toISOString().split('T')[0]
  }, [])

  const practiceApi = useMemo(() => new PracticeAPI(supabase), [supabase])
  
  // タグ一覧を取得
  const { data: tags = [] } = useQuery({
    queryKey: ['practice-tags'],
    queryFn: async () => {
      return await practiceApi.getPracticeTags()
    },
    staleTime: 5 * 60 * 1000,
  })

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

  // タグフィルタリング
  const filteredPractices = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return allPractices
    }
    
    return allPractices.filter((practice) => {
      // 練習ログのタグを取得
      const logTags = practice.practice_logs?.flatMap((log) =>
        log.practice_log_tags?.map((plt) => plt.practice_tags?.id).filter(Boolean) || []
      ) || []
      
      // 選択されたタグIDのいずれかがログのタグに含まれているかチェック
      return selectedTagIds.some((tagId) => logTags.includes(tagId))
    })
  }, [allPractices, selectedTagIds])
  
  // タグの選択/解除をトグル
  const handleTagToggle = useCallback((tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTags(selectedTagIds.filter((id) => id !== tagId))
    } else {
      setSelectedTags([...selectedTagIds, tagId])
    }
  }, [selectedTagIds, setSelectedTags])
  
  // タグフィルターをクリア
  const handleClearTags = useCallback(() => {
    setSelectedTags([])
  }, [setSelectedTags])

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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ErrorView
          message={error.message || '練習記録の取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    )
  }

  // ローディング状態（初回読み込み時）
  if (isLoading && allPractices.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="練習記録を読み込み中..." />
      </SafeAreaView>
    )
  }

  // データが空の場合
  if (allPractices.length === 0 && !isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>練習記録がありません</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* タグフィルターUI */}
      <View style={styles.filterContainer}>
        <Pressable
          style={styles.filterToggleButton}
          onPress={toggleTagFilter}
        >
          <Text style={styles.filterToggleButtonText}>タグでフィルター</Text>
        </Pressable>
        
        {/* タグフィルタリングUI */}
        {showTagFilter && (
          <View style={styles.tagsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tagsScrollContent}
            >
              {tags.map((tag: PracticeTag) => (
                <Pressable
                  key={tag.id}
                  onPress={() => handleTagToggle(tag.id)}
                  style={[
                    styles.tagButton,
                    selectedTagIds.includes(tag.id) && {
                      backgroundColor: tag.color,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagButtonText,
                      selectedTagIds.includes(tag.id) && styles.tagButtonTextSelected,
                    ]}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              ))}
              {selectedTagIds.length > 0 && (
                <Pressable
                  style={styles.clearButton}
                  onPress={handleClearTags}
                >
                  <Text style={styles.clearButtonText}>クリア</Text>
                </Pressable>
              )}
            </ScrollView>
            {selectedTagIds.length > 0 && (
              <Text style={styles.filterInfoText}>
                {selectedTagIds.length}個のタグでフィルタリング中
              </Text>
            )}
          </View>
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
        data={filteredPractices}
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
        // パフォーマンス最適化（1画面に8個表示するため、初期レンダリング数を調整）
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={8}
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
  filterToggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  filterToggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  tagsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  tagsScrollContent: {
    gap: 8,
    paddingRight: 16,
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  tagButtonTextSelected: {
    color: '#FFFFFF',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterInfoText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
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
    bottom: 20,
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
