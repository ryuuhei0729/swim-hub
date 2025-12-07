import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * 練習画面
 * Phase 4以降で実装予定
 */
export const PracticesScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>練習</Text>
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
