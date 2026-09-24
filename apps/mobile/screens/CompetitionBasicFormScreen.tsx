import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { MainStackParamList } from "@/navigation/types";

type CompetitionFormScreenRouteProp = RouteProp<MainStackParamList, "CompetitionForm">;
type CompetitionFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 旧・大会基本情報作成/編集画面 (リダイレクトシム)
 *
 * チーム大会の作成/編集 UI を個人フローに揃えるため、mobile の大会作成/編集を
 * CompetitionTabForm (統合タブ画面) に一本化した。既存の呼び出し元
 * (TeamCompetitionList 等) が "CompetitionForm" へ navigate しても
 * この画面が即座に CompetitionTabForm へ置き換わる。
 * PracticeFormScreen (練習側の同型シム) と同じ構造。
 */
export const CompetitionBasicFormScreen: React.FC = () => {
  const route = useRoute<CompetitionFormScreenRouteProp>();
  const navigation = useNavigation<CompetitionFormScreenNavigationProp>();
  const { competitionId, date, teamId, origin } = route.params || {};

  useEffect(() => {
    navigation.replace("CompetitionTabForm", {
      ...(competitionId ? { competitionId } : {}),
      date,
      ...(teamId ? { teamId } : {}),
      ...(origin ? { origin } : {}),
    });
  }, [navigation, competitionId, date, teamId, origin]);

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
