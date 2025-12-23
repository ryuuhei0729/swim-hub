import React from 'react'
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm'

export const UpdatePasswordScreen: React.FC = () => {
  const { isAuthenticated, loading } = useAuth()

  // 認証情報を確認中
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    )
  }

  // 認証済みでない場合はエラーメッセージを表示
  if (!isAuthenticated) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          パスワードを更新するにはログインが必要です。
        </Text>
      </View>
    )
  }

  return (
    <UpdatePasswordForm
      onSuccess={() => {
        // Phase 3でナビゲーションを実装予定
        // 現時点ではパスワード更新成功時の処理は後で実装
        console.log('パスワード更新成功')
      }}
    />
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#EFF6FF',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
  },
})
