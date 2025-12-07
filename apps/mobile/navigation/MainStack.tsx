import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { MainStackParamList } from './types'
import { TabNavigator } from './TabNavigator'

const Stack = createNativeStackNavigator<MainStackParamList>()

/**
 * メインのスタックナビゲーター
 * 認証済みユーザー向けの画面遷移を管理
 * タブナビゲーターを含む
 */
export const MainStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#EFF6FF',
        },
      }}
    >
      <Stack.Screen name="MainTabs" component={TabNavigator} />
    </Stack.Navigator>
  )
}
