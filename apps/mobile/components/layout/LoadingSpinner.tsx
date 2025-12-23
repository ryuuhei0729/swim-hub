import React from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'

interface LoadingSpinnerProps {
  fullScreen?: boolean
  size?: 'small' | 'large'
  message?: string
  color?: string
}

/**
 * ローディングスピナーコンポーネント
 * データ読み込み中などのローディング状態を表示
 * フルスクリーン表示またはインライン表示をサポート
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  fullScreen = false,
  size = 'large',
  message,
  color = '#2563EB',
}) => {
  const content = (
    <View style={fullScreen ? styles.fullScreenContainer : styles.inlineContainer}>
      <ActivityIndicator size={size} color={color} />
      {message && (
        <Text style={[styles.message, fullScreen && styles.fullScreenMessage]}>
          {message}
        </Text>
      )}
    </View>
  )

  if (fullScreen) {
    return (
      <View style={styles.fullScreenWrapper}>
        {content}
      </View>
    )
  }

  return content
}

const styles = StyleSheet.create({
  fullScreenWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  fullScreenContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  inlineContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  fullScreenMessage: {
    fontSize: 16,
    color: '#374151',
  },
})
