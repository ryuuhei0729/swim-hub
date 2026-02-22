import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Pressable, RefreshControl, Modal, FlatList, Dimensions } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { format } from 'date-fns'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import { useRecordsQuery } from '@apps/shared/hooks/queries/records'
import { useRecordFilterStore } from '@/stores/recordStore'
import { useShallow } from 'zustand/react/shallow'
import { StyleAPI } from '@apps/shared/api/styles'
import { RecordItem } from '@/components/records'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { RecordWithDetails } from '@swim-hub/shared/types'
import type { Style } from '@swim-hub/shared/types'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

type RecordsScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/** 日付から年度を取得（4月〜翌3月） */
const getFiscalYear = (date: Date): number => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return month >= 4 ? year : year - 1
}

/**
 * 大会記録一覧画面
 * 大会記録の一覧を表示し、フィルター、ソート、プルリフレッシュ、無限スクロール機能を提供
 */
export const RecordsScreen: React.FC = () => {
  const navigation = useNavigation<RecordsScreenNavigationProp>()
  const { supabase } = useAuth()
  const [page, setPage] = useState(1)
  const [refreshing, setRefreshing] = useState(false)
  const [allRecords, setAllRecords] = useState<RecordWithDetails[]>([])
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [styleList, setStyleList] = useState<Style[]>([])
  const [pickerModal, setPickerModal] = useState<'year' | 'style' | null>(null)
  const yearButtonRef = useRef<View>(null)
  const styleButtonRef = useRef<View>(null)
  const [dropdownLayout, setDropdownLayout] = useState({ top: 0, left: 0, width: 0 })

  // フィルターストア
  const {
    filterStyleId,
    filterFiscalYear,
    filterPoolType,
    includeRelay,
    sortBy,
    sortOrder,
    setFilterStyleId,
    setFilterFiscalYear,
    setFilterPoolType,
    setIncludeRelay,
    resetFilter,
  } = useRecordFilterStore(
    useShallow((state) => ({
      filterStyleId: state.filterStyleId,
      filterFiscalYear: state.filterFiscalYear,
      filterPoolType: state.filterPoolType,
      includeRelay: state.includeRelay,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      setFilterStyleId: state.setFilterStyleId,
      setFilterFiscalYear: state.setFilterFiscalYear,
      setFilterPoolType: state.setFilterPoolType,
      setIncludeRelay: state.setIncludeRelay,
      resetFilter: state.resetFilter,
    }))
  )

  // 種目一覧を取得
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase)
        const stylesData = await styleApi.getStyles()
        setStyleList(stylesData)
      } catch (error) {
        console.error('種目取得エラー:', error)
      }
    }
    fetchStyles()
  }, [supabase])

  // 大会記録データ取得（全期間、種目はサーバーサイドフィルター）
  const {
    records = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecordsQuery(supabase, {
    startDate: '2000-01-01',
    endDate: format(new Date(), 'yyyy-MM-dd'),
    styleId: filterStyleId || undefined,
    page,
    pageSize: 20,
    enableRealtime: true,
  })

  // クエリ結果をページごとに蓄積（フィルターとは独立）
  useEffect(() => {
    if (records.length > 0) {
      if (page === 1) {
        setAllRecords(records)
        setHasMore(records.length === 20)
      } else {
        setAllRecords((prev) => {
          const existingIds = new Set(prev.map((r) => r.id))
          const newRecords = records.filter((r) => !existingIds.has(r.id))
          return [...prev, ...newRecords]
        })
        setHasMore(records.length === 20)
      }
      setLoadingMore(false)
    } else if (!isLoading) {
      if (page === 1) {
        setAllRecords([])
      }
      setHasMore(false)
      setLoadingMore(false)
    }
  }, [records, page, isLoading])

  // サーバーサイドフィルター（種目）変更時のみページリセット
  useEffect(() => {
    setPage(1)
    setHasMore(true)
  }, [filterStyleId])

  // 蓄積データから参加済み年度リストを生成
  const participatedFiscalYears = useMemo(() => {
    const years = new Set<number>()
    allRecords.forEach((record) => {
      const dateStr = record.competition?.date
      if (dateStr) {
        years.add(getFiscalYear(new Date(dateStr)))
      }
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [allRecords])

  // 蓄積データから参加済み種目リストを生成
  const participatedStyles = useMemo(() => {
    const styleIds = new Set<number>()
    allRecords.forEach((record) => {
      if (record.style_id) {
        styleIds.add(record.style_id)
      }
    })
    return styleList.filter((style) => styleIds.has(style.id))
  }, [allRecords, styleList])

  // クライアントサイドフィルター適用（useMemoで即座に反映）
  const displayRecords = useMemo(() => {
    let filtered = [...allRecords]

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
      const fiscalYearStart = new Date(`${fy}-04-01T00:00:00.000Z`).getTime()
      const fiscalYearEnd = new Date(`${fyNext}-03-31T23:59:59.999Z`).getTime()
      filtered = filtered.filter((record) => {
        const recordDateStr = record.competition?.date || record.created_at
        if (!recordDateStr) return false
        const recordDate = new Date(recordDateStr)
        if (isNaN(recordDate.getTime())) return false
        const recordTimestamp = recordDate.getTime()
        return recordTimestamp >= fiscalYearStart && recordTimestamp <= fiscalYearEnd
      })
    }

    // 引き継ぎ記録フィルター
    if (!includeRelay) {
      filtered = filtered.filter((record) => !record.is_relaying)
    }

    // ソート
    filtered.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.competition?.date || a.created_at).getTime()
        const dateB = new Date(b.competition?.date || b.created_at).getTime()
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
      } else {
        return sortOrder === 'asc' ? a.time - b.time : b.time - a.time
      }
    })

    return filtered
  }, [allRecords, filterPoolType, filterFiscalYear, includeRelay, sortBy, sortOrder])

  // フィルターが適用中かチェック
  const hasActiveFilter = filterStyleId !== null || filterFiscalYear !== '' || filterPoolType !== null || !includeRelay

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refetch)

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setPage(1)
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
    const today = format(new Date(), 'yyyy-MM-dd')
    navigation.navigate('CompetitionForm', { date: today })
  }

  // ドロップダウンを開く
  const screenHeight = Dimensions.get('window').height
  const DROPDOWN_MAX_HEIGHT = 260

  const openYearPicker = useCallback(() => {
    yearButtonRef.current?.measureInWindow((x, y, width, height) => {
      const top = y + height + 4
      const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40
      setDropdownLayout({
        top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
        left: x,
        width,
      })
      setPickerModal('year')
    })
  }, [screenHeight])

  const openStylePicker = useCallback(() => {
    styleButtonRef.current?.measureInWindow((x, y, width, height) => {
      const top = y + height + 4
      const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40
      setDropdownLayout({
        top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
        left: x,
        width,
      })
      setPickerModal('style')
    })
  }, [screenHeight])

  // 選択済み種目名を取得
  const selectedStyleName = useMemo(() => {
    if (!filterStyleId) return '全種目'
    const style = styleList.find((s) => s.id === filterStyleId)
    return style?.name_jp || '全種目'
  }, [filterStyleId, styleList])

  // 選択済み年度名を取得
  const selectedYearName = useMemo(() => {
    if (!filterFiscalYear) return '全期間'
    return `${filterFiscalYear}年度`
  }, [filterFiscalYear])

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
  if (isLoading && displayRecords.length === 0 && allRecords.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="大会記録を読み込み中..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* フィルターUI */}
      <View style={styles.filterContainer}>
        {/* 1行目: 年度 + 種目 */}
        <View style={styles.filterRow}>
          <Pressable
            ref={yearButtonRef}
            style={styles.selectButton}
            onPress={openYearPicker}
          >
            <Text style={styles.selectButtonText} numberOfLines={1}>
              {selectedYearName}
            </Text>
            <Feather name="chevron-down" size={14} color="#6B7280" />
          </Pressable>
          <Pressable
            ref={styleButtonRef}
            style={styles.selectButton}
            onPress={openStylePicker}
          >
            <Text style={styles.selectButtonText} numberOfLines={1}>
              {selectedStyleName}
            </Text>
            <Feather name="chevron-down" size={14} color="#6B7280" />
          </Pressable>
        </View>

        {/* 2行目: プール種別タブ + 引き継ぎ + リセット */}
        <View style={styles.filterRow}>
          <View style={styles.poolTabs}>
            {([
              { value: null, label: '全て' },
              { value: 0, label: '短水路' },
              { value: 1, label: '長水路' },
            ] as const).map((tab) => (
              <Pressable
                key={String(tab.value)}
                style={[styles.poolTab, filterPoolType === tab.value && styles.poolTabActive]}
                onPress={() => setFilterPoolType(tab.value)}
              >
                <Text style={[styles.poolTabText, filterPoolType === tab.value && styles.poolTabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.checkboxContainer}
            onPress={() => setIncludeRelay(!includeRelay)}
          >
            <View style={[styles.checkbox, includeRelay && styles.checkboxChecked]}>
              {includeRelay && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>引き継ぎ含</Text>
          </Pressable>
          {hasActiveFilter && (
            <Pressable style={styles.resetButton} onPress={resetFilter}>
              <Text style={styles.resetButtonText}>リセット</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 作成ボタン */}
      <View style={styles.fabContainer}>
        <Pressable style={styles.fab} onPress={handleCreate}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      <FlashList
        data={displayRecords}
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

      {/* ドロップダウンピッカー */}
      <Modal
        visible={pickerModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerModal(null)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setPickerModal(null)}>
          <View
            style={[
              styles.dropdownContainer,
              { top: dropdownLayout.top, left: dropdownLayout.left, width: dropdownLayout.width },
            ]}
          >
            <FlatList
              data={
                pickerModal === 'year'
                  ? [{ id: '', label: '全期間' }, ...participatedFiscalYears.map((y) => ({ id: y.toString(), label: `${y}年度` }))]
                  : [{ id: '', label: '全種目' }, ...participatedStyles.map((s) => ({ id: s.id.toString(), label: s.name_jp }))]
              }
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => {
                const isSelected = pickerModal === 'year'
                  ? filterFiscalYear === item.id
                  : filterStyleId === (item.id ? Number(item.id) : null)

                return (
                  <Pressable
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      if (pickerModal === 'year') {
                        setFilterFiscalYear(item.id)
                      } else {
                        setFilterStyleId(item.id ? Number(item.id) : null)
                      }
                      setPickerModal(null)
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#2563EB" />}
                  </Pressable>
                )
              }}
              style={styles.dropdownScroll}
            />
          </View>
        </Pressable>
      </Modal>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectButtonText: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  poolTabs: {
    flexDirection: 'row',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  poolTab: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  poolTabActive: {
    backgroundColor: '#2563EB',
  },
  poolTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
  },
  poolTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 3,
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
    fontSize: 10,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    color: '#374151',
  },
  resetButton: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
  },
  resetButtonText: {
    fontSize: 11,
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
  // ドロップダウン
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContainer: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    maxHeight: 260,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  dropdownOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: '#111827',
  },
  dropdownOptionTextSelected: {
    color: '#2563EB',
    fontWeight: '600',
  },
})
