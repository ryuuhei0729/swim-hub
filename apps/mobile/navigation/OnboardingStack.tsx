import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { OnboardingStackParamList } from "./types";
import { OnboardingScreen } from "@/screens/OnboardingScreen";

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * オンボーディング専用のスタックナビゲーター
 * 新規登録ユーザーがオンボーディングを完了するまで表示される
 */
export const OnboardingStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#EFF6FF",
        },
      }}
    >
      <Stack.Screen name="OnboardingWizard" component={OnboardingScreen} />
    </Stack.Navigator>
  );
};
