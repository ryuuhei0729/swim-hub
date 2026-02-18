import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import Constants from 'expo-constants'
import { useAuth } from '@/contexts/AuthProvider'

const WEB_API_URL = Constants.expoConfig?.extra?.webApiUrl || 'https://swim-hub.app'

/**
 * アカウント削除設定コンポーネント
 * 設定画面でアカウントの完全削除を行う
 */
export const AccountDeleteSettings: React.FC = () => {
  const { session, signOut } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = useCallback(async () => {
    if (!session?.access_token) {
      Alert.alert('エラー', '認証情報が見つかりません。再ログインしてください。')
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`${WEB_API_URL}/api/account/delete`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'アカウントの削除に失敗しました')
      }

      // ローカルセッション・キャッシュ・ストアをクリア
      // signOut後、AppNavigatorがAuthStackに自動遷移する
      await signOut()
    } catch (err) {
      setIsDeleting(false)
      Alert.alert(
        'エラー',
        err instanceof Error ? err.message : 'アカウントの削除に失敗しました'
      )
    }
  }, [session, signOut])

  const handlePress = useCallback(() => {
    Alert.alert(
      'アカウントを削除しますか？',
      'この操作は取り消せません。すべての練習記録、大会記録、チーム情報、画像データが永久に削除されます。\n\n※チームの練習・大会データはチームに残ります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: handleDelete,
        },
      ]
    )
  }, [handleDelete])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>アカウント削除</Text>
      <Text style={styles.description}>
        アカウントを削除すると、すべての個人データが完全に削除され、復元できません。
      </Text>
      <Pressable
        style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
        onPress={handlePress}
        disabled={isDeleting}
        accessibilityRole="button"
        accessibilityLabel="アカウントを削除する"
        accessibilityHint="アカウントとすべてのデータを完全に削除します"
      >
        {isDeleting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={styles.deleteButtonText}>アカウントを削除する</Text>
        )}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#F87171',
    opacity: 0.6,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
