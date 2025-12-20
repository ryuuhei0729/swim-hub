import React, { useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import {
  usePracticeByIdQuery,
  useDeletePracticeMutation,
} from '@apps/shared/hooks/queries/practices'
import { PracticeLogItem } from '@/components/practices'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'

type PracticeDetailScreenRouteProp = RouteProp<MainStackParamList, 'PracticeDetail'>
type PracticeDetailScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * 練習記録詳細画面
 * 特定日の練習記録を詳細表示（基本情報、練習ログ、タイム、タグ）
 */
export const PracticeDetailScreen: React.FC = () => {
  const route = useRoute<PracticeDetailScreenRouteProp>()
  const navigation = useNavigation<PracticeDetailScreenNavigationProp>()
  const { practiceId } = route.params
  const { supabase } = useAuth()

  // 削除ミューテーション
  const deleteMutation = useDeletePracticeMutation(supabase)
  const [isDeleting, setIsDeleting] = useState(false)

  // 編集画面への遷移
  const handleEdit = () => {
    navigation.navigate('PracticeForm', { practiceId })
  }

  // 削除処理
  const handleDelete = () => {
    if (Platform.OS === 'web') {
      // Web版ではwindow.confirmを使用
      const confirmed = window.confirm(
        'この練習記録を削除しますか？\nこの操作は取り消せません。'
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
        'この練習記録を削除しますか？\nこの操作は取り消せません。',
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
      await deleteMutation.mutateAsync(practiceId)
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

  // 練習記録データ取得（IDで直接取得）
  const {
    data: practice,
    isLoading,
    error,
    refetch,
  } = usePracticeByIdQuery(supabase, practiceId, {
    enableRealtime: true,
  })

  // エラー状態
  if (error) {
    const errorMessage = error instanceof Error ? error.message : '練習記録の取得に失敗しました'
    return (
      <View style={styles.container}>
        <ErrorView
          message={errorMessage}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // ローディング状態
  if (isLoading && !practice) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="練習記録を読み込み中..." />
      </View>
    )
  }

  // 練習記録が見つからない場合
  if (!practice) {
    return (
      <View style={styles.container}>
        <ErrorView
          message="練習記録が見つかりませんでした"
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // 日付をフォーマット
  const formattedDate = format(new Date(practice.date), 'yyyy年M月d日(E)', { locale: ja })
  
  // タイトル（nullの場合は「練習」）
  const title = practice.title || '練習'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 基本情報 */}
      <View style={styles.section}>
        <Text style={styles.date}>{formattedDate}</Text>
        <Text style={styles.title}>{title}</Text>
        
        {practice.place && (
          <View style={styles.infoRow}>
            <Feather name="map-pin" size={14} color="#6B7280" />
            <Text style={styles.infoLabel}>場所:</Text>
            <Text style={styles.infoValue}>{practice.place}</Text>
          </View>
        )}
        
        {practice.note && (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>メモ</Text>
            <Text style={styles.note}>{practice.note}</Text>
          </View>
        )}
      </View>

      {/* 練習ログ一覧 */}
      {practice.practice_logs && practice.practice_logs.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>練習ログ</Text>
          {practice.practice_logs.map((log) => (
            <PracticeLogItem key={log.id} log={log} />
          ))}
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>練習ログがありません</Text>
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
  title: {
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
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
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
