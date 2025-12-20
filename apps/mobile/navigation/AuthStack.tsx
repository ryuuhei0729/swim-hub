import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { AuthStackParamList } from './types'
import { LoginScreen } from '@/screens/LoginScreen'
import { SignupScreen } from '@/screens/SignupScreen'
import { ResetPasswordScreen } from '@/screens/ResetPasswordScreen'

const Stack = createNativeStackNavigator<AuthStackParamList>()

/**
 * 認証関連のスタックナビゲーター
 * 未認証ユーザー向けの画面遷移を管理
 */
export const AuthStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: '#EFF6FF',
        },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignupScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  )
}
