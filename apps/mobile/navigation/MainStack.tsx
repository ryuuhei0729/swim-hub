import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { MainStackParamList } from './types'
import { TabNavigator } from './TabNavigator'
import { PracticeDetailScreen } from '@/screens/PracticeDetailScreen'
import { PracticeFormScreen } from '@/screens/PracticeFormScreen'

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
      <Stack.Screen
        name="PracticeDetail"
        component={PracticeDetailScreen}
        options={{
          headerShown: true,
          title: '練習記録詳細',
          headerBackTitle: '戻る',
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTintColor: '#111827',
          headerTitleStyle: {
            fontWeight: '600',
          },
        }}
      />
      <Stack.Screen
        name="PracticeForm"
        component={PracticeFormScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.practiceId ? '練習記録編集' : '練習記録作成',
          headerBackTitle: '戻る',
          headerStyle: {
            backgroundColor: '#FFFFFF',
          },
          headerTintColor: '#111827',
          headerTitleStyle: {
            fontWeight: '600',
          },
        })}
      />
    </Stack.Navigator>
  )
}
