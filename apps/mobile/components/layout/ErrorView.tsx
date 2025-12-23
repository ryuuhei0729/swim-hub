import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'

interface ErrorViewProps {
  message: string
  onRetry?: () => void
  showIcon?: boolean
  fullScreen?: boolean
}

/**
 * エラー表示コンポーネント
 * エラー状態を表示し、必要に応じてリトライ機能を提供
 */
export const ErrorView: React.FC<ErrorViewProps> = ({
  message,
  onRetry,
  showIcon = true,
  fullScreen = false,
}) => {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]}>
      {showIcon && (
        <Text style={styles.icon}>⚠️</Text>
      )}
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Pressable
          style={styles.retryButton}
          onPress={onRetry}
        >
          <Text style={styles.retryButtonText}>再試行</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#DC2626',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  retryButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
