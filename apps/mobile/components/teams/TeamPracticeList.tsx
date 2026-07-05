import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { format } from "date-fns";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamPracticesQuery,
  useDeleteTeamPracticeMutation,
} from "@apps/shared/hooks/queries/teams";
import type { Practice } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";
import { useDateLocale } from "@/hooks/useDateLocale";
import { formatDate } from "@apps/shared/utils/date";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface TeamPracticeListProps {
  teamId: string;
  isAdmin: boolean;
}

const PracticeItem = React.memo(function PracticeItem({
  practice,
  isAdmin,
  onEdit,
  onDelete,
  onAddLog,
}: {
  practice: Practice;
  isAdmin: boolean;
  onEdit: (practice: Practice) => void;
  onDelete: (practice: Practice) => void;
  onAddLog: (practice: Practice) => void;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();

  return (
    <View style={styles.item}>
      <Pressable
        onPress={() => isAdmin && onEdit(practice)}
        accessibilityRole={isAdmin ? "button" : undefined}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemDateRow}>
            <Feather name="calendar" size={14} color="#6B7280" />
            <Text style={styles.itemDate}>{formatDate(practice.date, "shortWithWeekday", dateLocale)}</Text>
          </View>
          {isAdmin && (
            <View style={styles.itemActions}>
              <Pressable
                style={styles.editButton}
                onPress={() => onEdit(practice)}
                accessibilityRole="button"
                accessibilityLabel={t("common.edit")}
              >
                <Feather name="edit-2" size={14} color="#2563EB" />
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDelete(practice)}
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
              >
                <Feather name="trash-2" size={14} color="#DC2626" />
              </Pressable>
            </View>
          )}
        </View>
        {practice.title && (
          <Text style={styles.itemTitle}>{practice.title}</Text>
        )}
        {practice.place && (
          <View style={styles.itemRow}>
            <Feather name="map-pin" size={12} color="#9CA3AF" />
            <Text style={styles.itemPlace}>{practice.place}</Text>
          </View>
        )}
        {practice.note && (
          <Text style={styles.itemNote} numberOfLines={2}>{practice.note}</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.logButton}
        onPress={() => onAddLog(practice)}
        accessibilityRole="button"
        accessibilityLabel={t("teams.mobile.teamPracticeList.addLog")}
      >
        <Feather name="edit-3" size={13} color="#2563EB" />
        <Text style={styles.logButtonText}>{t("teams.mobile.teamPracticeList.addLog")}</Text>
      </Pressable>
    </View>
  );
});

export function TeamPracticeList({ teamId, isAdmin }: TeamPracticeListProps) {
  const { supabase } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();

  const { data: practices, isLoading, isError, error, refetch } = useTeamPracticesQuery(supabase, teamId);
  const deleteMutation = useDeleteTeamPracticeMutation(supabase);

  const handleAdd = useCallback(() => {
    navigation.navigate("PracticeForm", {
      teamId,
      date: format(new Date(), "yyyy-MM-dd"),
    });
  }, [navigation, teamId]);

  const handleEdit = useCallback((practice: Practice) => {
    navigation.navigate("PracticeForm", {
      practiceId: practice.id,
      teamId,
    });
  }, [navigation, teamId]);

  const handleAddLog = useCallback((practice: Practice) => {
    // admin はチーム全体の一括代理入力画面へ、非 admin は従来の本人入力フローへ分岐
    if (isAdmin) {
      navigation.navigate("TeamPracticeLogBulkForm", {
        practiceId: practice.id,
        teamId,
      });
      return;
    }
    navigation.navigate("PracticeLogForm", {
      practiceId: practice.id,
      teamId,
    });
  }, [navigation, teamId, isAdmin]);

  const handleDelete = useCallback((practice: Practice) => {
    Alert.alert(
      t("teams.mobile.deleteConfirmTitle"),
      t("teams.mobile.teamPracticeList.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: practice.id, teamId });
            } catch {
              Alert.alert(t("common.error"), t("teams.mobile.teamPracticeList.deleteFailed"), [
                { text: "OK" },
              ]);
            }
          },
        },
      ],
    );
  }, [deleteMutation, teamId, t]);

  const renderItem = useCallback(({ item }: { item: Practice }) => (
    <PracticeItem
      practice={item}
      isAdmin={isAdmin}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onAddLog={handleAddLog}
    />
  ), [isAdmin, handleEdit, handleDelete, handleAddLog]);

  const keyExtractor = useCallback((item: Practice) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t("teams.mobile.loadingShort")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={styles.errorText}>
          {error?.message || t("teams.mobile.teamPracticeList.fetchFailed")}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  const items = practices ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {t("teams.mobile.teamPracticeList.title", { count: items.length })}
        </Text>
        {isAdmin && (
          <Pressable style={styles.addButton} onPress={handleAdd} accessibilityRole="button">
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.addButtonText}>
              {t("teams.mobile.teamPracticeList.addButton")}
            </Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="clock" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>{t("teams.mobile.teamPracticeList.empty")}</Text>
          {isAdmin && (
            <Pressable style={styles.emptyAddButton} onPress={handleAdd}>
              <Text style={styles.emptyAddButtonText}>
                {t("teams.mobile.teamPracticeList.addButton")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  item: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  itemDate: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  itemPlace: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemNote: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  logButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    alignSelf: "flex-start",
  },
  logButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptyAddButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
