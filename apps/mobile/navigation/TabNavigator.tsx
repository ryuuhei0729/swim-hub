import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import type { TabParamList } from './types'
import { DashboardScreen } from '@/screens/DashboardScreen'
import { PracticesScreen } from '@/screens/PracticesScreen'
import { CompetitionsScreen } from '@/screens/CompetitionsScreen'
import { TeamsScreen } from '@/screens/TeamsScreen'
import { MyPageScreen } from '@/screens/MyPageScreen'

const Tab = createBottomTabNavigator<TabParamList>()

/**
 * タブナビゲーター
 * 認証済みユーザー向けのメイン画面遷移を管理
 * ダッシュボード、練習、大会、チーム、マイページの5つのタブ
 */
export const TabNavigator: React.FC = () => {
  const insets = useSafeAreaInsets()

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 4),
          height: 56 + Math.max(insets.bottom, 4),
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'ダッシュボード',
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Practices"
        component={PracticesScreen}
        options={{
          tabBarLabel: '練習',
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Competitions"
        component={CompetitionsScreen}
        options={{
          tabBarLabel: '大会',
          tabBarIcon: ({ color }) => <Feather name="award" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{
          tabBarLabel: 'チーム',
          tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="MyPage"
        component={MyPageScreen}
        options={{
          tabBarLabel: 'マイページ',
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  )
}
