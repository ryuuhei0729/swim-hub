import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import {
  useRecordsQuery,
  useDeleteRecordMutation,
} from '@apps/shared/hooks/queries/records'
import { SplitTimeItem } from '@/components/records'
import { formatTime } from '@/utils/formatters'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'

type RecordDetailScreenRouteProp = RouteProp<MainStackParamList, 'RecordDetail'>
type RecordDetailScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 大会記録詳細画面
 * 大会記録の詳細を表示（基本情報、スプリットタイム、反応時間）
 */
export const RecordDetailScreen: React.FC = () => {
  const route = useRoute<RecordDetailScreenRouteProp>()
  const navigation = useNavigation<RecordDetailScreenNavigationProp>()
  const { recordId } = route.params
  const { supabase } = useAuth()

  // 削除ミューテーション
  const deleteMutation = useDeleteRecordMutation(supabase)
  const [isDeleting, setIsDeleting] = useState(false)

  // 編集画面への遷移
  const handleEdit = () => {
    navigation.navigate('RecordForm', { recordId })
  }

  // 削除処理
  const handleDelete = () => {
    if (Platform.OS === 'web') {
      // Web版ではwindow.confirmを使用
      const confirmed = window.confirm(
        'この大会記録を削除しますか？\nこの操作は取り消せません。'
      )
      if (!confirmed) {
        return
      }
      // 削除実行
      executeDelete()
    } else {
      // ネイティブ版ではAlert.alertを使用
      Alert.alert(
        '削除確認',
        'この大会記録を削除しますか？\nこの操作は取り消せません。',
        [
          {
            text: 'キャンセル',
            style: 'cancel',
          },
          {
            text: '削除',
            style: 'destructive',
            onPress: executeDelete,
          },
        ],
        { cancelable: true }
      )
    }
  }

  // 削除実行処理
  const executeDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteMutation.mutateAsync(recordId)
      // 削除成功: 一覧画面に戻る
      navigation.goBack()
    } catch (error) {
      console.error('削除エラー:', error)
      if (Platform.OS === 'web') {
        window.alert(error instanceof Error ? error.message : '削除に失敗しました')
      } else {
        Alert.alert(
          'エラー',
          error instanceof Error ? error.message : '削除に失敗しました',
          [{ text: 'OK' }]
        )
      }
    } finally {
      setIsDeleting(false)
    }
  }

  // 大会記録データ取得（広い日付範囲で取得してから該当のものを検索）
  const {
    records = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecordsQuery(supabase, {
    page: 1,
    pageSize: 1000, // 十分な件数を取得
    enableRealtime: true,
  })

  // recordIdで該当の大会記録を検索
  const record = useMemo(() => {
    return records.find((r) => r.id === recordId)
  }, [records, recordId])

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

  // ローディング状態
  if (isLoading && !record) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="大会記録を読み込み中..." />
      </View>
    )
  }

  // 大会記録が見つからない場合
  if (!record) {
    return (
      <View style={styles.container}>
        <ErrorView
          message="大会記録が見つかりませんでした"
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // 大会名（nullの場合は「大会」）
  const competitionName = record.competition?.title || '大会'
  
  // 日付をフォーマット（大会の日付を使用）
  const recordDate = record.competition?.date || record.created_at
  const formattedDate = format(new Date(recordDate), 'yyyy年M月d日(E)', { locale: ja })
  
  // 種目名
  const styleName = record.style?.name_jp || '不明'
  const styleDistance = record.style?.distance || 0
  const styleDisplay = `${styleName} ${styleDistance}m`
  
  // タイムをフォーマット
  const formattedTime = formatTime(record.time)
  
  // プールタイプ（recordの値を優先）
  const poolTypeValue = record.pool_type
  const poolType =
    poolTypeValue === undefined || poolTypeValue === null
      ? '—'
      : poolTypeValue === 0
        ? '短水路'
        : '長水路'

  // スプリットタイムを距離順にソート
  const sortedSplitTimes = [...(record.split_times || [])].sort(
    (a, b) => a.distance - b.distance
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 基本情報 */}
      <View style={styles.section}>
        <Text style={styles.date}>{formattedDate}</Text>
        <Text style={styles.competitionName}>{competitionName}</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>種目:</Text>
          <Text style={styles.infoValue}>{styleDisplay}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>タイム:</Text>
          <Text style={styles.timeValue}>{formattedTime}</Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>プールタイプ:</Text>
          <Text style={styles.infoValue}>{poolType}</Text>
        </View>
        
        {record.competition?.place && (
          <View style={styles.infoRow}>
            <Feather name="map-pin" size={14} color="#6B7280" />
            <Text style={styles.infoLabel}>場所:</Text>
            <Text style={styles.infoValue}>{record.competition.place}</Text>
          </View>
        )}
        
        {record.reaction_time && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>反応時間:</Text>
            <Text style={styles.infoValue}>{record.reaction_time.toFixed(2)}秒</Text>
          </View>
        )}
        
        {record.note && (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>メモ</Text>
            <Text style={styles.note}>{record.note}</Text>
          </View>
        )}
      </View>

      {/* スプリットタイム一覧 */}
      {sortedSplitTimes.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>スプリットタイム</Text>
          {sortedSplitTimes.map((splitTime, index) => (
            <SplitTimeItem key={splitTime.id || index} splitTime={splitTime} index={index} />
          ))}
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>スプリットタイムがありません</Text>
        </View>
      )}

      {/* アクションボタン */}
      <View style={styles.actionContainer}>
        <Pressable
          style={[styles.actionButton, styles.editButton]}
          onPress={handleEdit}
          disabled={isDeleting}
        >
          <Text style={styles.editButtonText}>編集</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.deleteButton]}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          <Text style={styles.deleteButtonText}>
            {isDeleting ? '削除中...' : '削除'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  content: {
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  date: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  competitionName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 16,
    gap: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 4,
    minWidth: 100,
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    flex: 1,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
    flex: 1,
  },
  noteContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 16,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  note: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  emptySection: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  actionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: '#2563EB',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButton: {
    backgroundColor: '#DC2626',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
