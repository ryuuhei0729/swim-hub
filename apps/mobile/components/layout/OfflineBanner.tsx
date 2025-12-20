// =============================================================================
// OfflineBanner - オフライン状態を表示するバナーコンポーネント
// =============================================================================

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface OfflineBannerProps {
  visible: boolean
}

/**
 * オフライン状態を表示するバナー
 * ノッチ部分を避けるため、上部の安全領域を考慮
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({ visible }) => {
  const insets = useSafeAreaInsets()

  if (!visible) return null

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
      <Text style={styles.text}>
        📡 オフラインです。一部の機能が制限されます。
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
  },
})
