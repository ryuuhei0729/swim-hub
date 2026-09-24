import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { MainStackParamList } from "@/navigation/types";

type PracticeLogFormScreenRouteProp = RouteProp<MainStackParamList, "PracticeLogForm">;
type PracticeLogFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 旧・練習ログ入力画面 (リダイレクトシム)
 *
 * web が個人・チームとも PracticeTabModal に統一されたことに合わせ、
 * mobile も練習ログの入力を PracticeTabForm (統合タブ画面) に一本化した。
 * 既存の呼び出し元が "PracticeLogForm" へ navigate しても
 * この画面が即座に PracticeTabForm (ログタブ) へ置き換わる。
 */
export const PracticeLogFormScreen: React.FC = () => {
  const route = useRoute<PracticeLogFormScreenRouteProp>();
  const navigation = useNavigation<PracticeLogFormScreenNavigationProp>();
  const { practiceId, teamId } = route.params;

  useEffect(() => {
    navigation.replace("PracticeTabForm", {
      practiceId,
      ...(teamId ? { teamId } : {}),
      initialTab: "log",
    });
  }, [navigation, practiceId, teamId]);

  return (
    <View style={styles.container}>
      <LoadingSpinner fullScreen />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
});
