import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { MainStackParamList } from "@/navigation/types";

type PracticeFormScreenRouteProp = RouteProp<MainStackParamList, "PracticeForm">;
type PracticeFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 旧・練習記録作成/編集画面 (リダイレクトシム)
 *
 * web が個人・チームとも PracticeTabModal に統一されたことに合わせ、
 * mobile も練習の作成/編集を PracticeTabForm (統合タブ画面) に一本化した。
 * 既存の呼び出し元 (TeamPracticeList 等) が "PracticeForm" へ navigate しても
 * この画面が即座に PracticeTabForm へ置き換わる。
 */
export const PracticeFormScreen: React.FC = () => {
  const route = useRoute<PracticeFormScreenRouteProp>();
  const navigation = useNavigation<PracticeFormScreenNavigationProp>();
  const { practiceId, date, teamId } = route.params || {};

  useEffect(() => {
    navigation.replace("PracticeTabForm", {
      ...(practiceId ? { practiceId } : {}),
      ...(date ? { date } : {}),
      ...(teamId ? { teamId } : {}),
    });
  }, [navigation, practiceId, date, teamId]);

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
