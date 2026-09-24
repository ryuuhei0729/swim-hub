import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import type { MainStackParamList } from "@/navigation/types";

type EntryFormScreenRouteProp = RouteProp<MainStackParamList, "EntryForm">;
type EntryFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 旧・エントリー登録画面 (リダイレクトシム)
 *
 * web が個人・チームとも CompetitionTabModal に統一されたことに合わせ、
 * mobile も大会エントリーの入力を CompetitionTabForm (統合タブ画面) に一本化した。
 * 既存の呼び出し元が "EntryForm" へ navigate しても
 * この画面が即座に CompetitionTabForm (エントリータブ) へ置き換わる。
 */
export const EntryLogFormScreen: React.FC = () => {
  const route = useRoute<EntryFormScreenRouteProp>();
  const navigation = useNavigation<EntryFormScreenNavigationProp>();
  const { competitionId, date, teamId } = route.params;

  useEffect(() => {
    navigation.replace("CompetitionTabForm", {
      competitionId,
      date,
      ...(teamId ? { teamId } : {}),
      initialTab: "entry",
    });
  }, [navigation, competitionId, date, teamId]);

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
