import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { MainStackParamList } from './types'
import { TabNavigator } from './TabNavigator'
import { PracticeDetailScreen } from '@/screens/PracticeDetailScreen'
import { PracticeFormScreen } from '@/screens/PracticeFormScreen'
import { PracticeLogFormScreen } from '@/screens/PracticeLogFormScreen'
import { PracticeTimeFormScreen } from '@/screens/PracticeTimeFormScreen'
import { RecordDetailScreen } from '@/screens/RecordDetailScreen'
import { RecordFormScreen } from '@/screens/RecordFormScreen'
import { CompetitionBasicFormScreen } from '@/screens/CompetitionBasicFormScreen'
import { EntryLogFormScreen } from '@/screens/EntryLogFormScreen'
import { RecordLogFormScreen } from '@/screens/RecordLogFormScreen'
import { TeamDetailScreen } from '@/screens/TeamDetailScreen'

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
      <Stack.Screen
        name="PracticeLogForm"
        component={PracticeLogFormScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.practiceLogId !== undefined ? '練習ログ編集' : '練習ログ作成',
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
      <Stack.Screen
        name="PracticeTimeForm"
        component={PracticeTimeFormScreen}
        options={{
          headerShown: true,
          title: 'タイム入力',
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
        name="RecordDetail"
        component={RecordDetailScreen}
        options={{
          headerShown: true,
          title: '大会記録詳細',
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
        name="RecordForm"
        component={RecordFormScreen}
        options={({ route }) => ({
          headerShown: true,
          title: route.params?.recordId ? '大会記録編集' : '大会記録作成',
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
      <Stack.Screen
        name="CompetitionForm"
        component={CompetitionBasicFormScreen}
        options={{
          headerShown: true,
          title: '大会情報',
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
        name="EntryForm"
        component={EntryLogFormScreen}
        options={{
          headerShown: true,
          title: 'エントリー登録',
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
        name="RecordLogForm"
        component={RecordLogFormScreen}
        options={{
          headerShown: true,
          title: '記録入力',
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
        name="TeamDetail"
        component={TeamDetailScreen}
        options={{
          headerShown: true,
          title: 'チーム詳細',
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
    </Stack.Navigator>
  )
}
