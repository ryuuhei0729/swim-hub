import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * マイページ画面
 * Phase 8以降で実装予定
 */
export const MyPageScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>マイページ</Text>
      <Text style={styles.subtitle}>実装予定</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
})
