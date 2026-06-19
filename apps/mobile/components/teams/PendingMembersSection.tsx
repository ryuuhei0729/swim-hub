import React, { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { format, parseISO, isValid } from "date-fns";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useListPendingMembersQuery,
  useApproveMemberMutation,
  useRejectMemberMutation,
} from "@apps/shared/hooks/queries/teams";
import { ErrorView } from "@/components/layout/ErrorView";

interface PendingMembersSectionProps {
  teamId: string;
}

/**
 * 承認待ちメンバー一覧セクション
 * 承認/却下ボタン付き（管理者のみ表示）
 */
export const PendingMembersSection: React.FC<PendingMembersSectionProps> = ({ teamId }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();

  const { data: pendingMembers, isLoading, isError, error, refetch } = useListPendingMembersQuery(supabase, teamId);
  const approveMutation = useApproveMemberMutation(supabase);
  const rejectMutation = useRejectMemberMutation(supabase);

  const handleApprove = useCallback(
    (membershipId: string, memberName: string) => {
      Alert.alert(
        t("teams.mobile.pendingApproveConfirmTitle"),
        t("teams.mobile.pendingApproveConfirmMessage", { name: memberName }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("teams.pendingMembers.approveButton"),
            style: "default",
            onPress: async () => {
              try {
                await approveMutation.mutateAsync({ membershipId, teamId });
              } catch {
                Alert.alert(t("common.error"), t("teams.mobile.pendingApproveFailed"), [
                  { text: "OK" },
                ]);
              }
            },
          },
        ],
      );
    },
    [approveMutation, teamId, t],
  );

  const handleReject = useCallback(
    (membershipId: string, memberName: string) => {
      Alert.alert(
        t("teams.mobile.pendingRejectConfirmTitle"),
        t("teams.mobile.pendingRejectConfirmMessage", { name: memberName }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("teams.pendingMembers.rejectButton"),
            style: "destructive",
            onPress: async () => {
              try {
                await rejectMutation.mutateAsync({ membershipId, teamId });
              } catch {
                Alert.alert(t("common.error"), t("teams.mobile.pendingRejectFailed"), [
                  { text: "OK" },
                ]);
              }
            },
          },
        ],
      );
    },
    [rejectMutation, teamId, t],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
        <Text style={styles.loadingText}>{t("teams.mobile.pendingLoading")}</Text>
      </View>
    );
  }

  if (isError && error) {
    return (
      <View style={styles.errorContainer}>
        <ErrorView
          message={error.message || t("teams.mobile.pendingFetchFailed")}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const members = pendingMembers ?? [];

  if (members.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="check-circle" size={24} color="#10B981" />
        <Text style={styles.emptyText}>{t("teams.pendingMembers.empty")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>
        {t("teams.pendingMembers.sectionTitle", { count: members.length })}
      </Text>
      {members.map((item) => {
        const memberName = item.users?.name ?? t("teams.mobile.unnamedMember");
        const isProcessing =
          (approveMutation.isPending || rejectMutation.isPending) &&
          (approveMutation.variables?.membershipId === item.id ||
            rejectMutation.variables?.membershipId === item.id);

        return (
          <View key={item.id} style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{memberName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.memberTextBlock}>
                <Text style={styles.memberName}>{memberName}</Text>
                {item.created_at && isValid(parseISO(item.created_at)) && (
                  <Text style={styles.memberAppliedAt}>
                    {t("teams.pending.appliedAtLabel")}{" "}
                    {format(parseISO(item.created_at), "yyyy/MM/dd")}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.actions}>
              {isProcessing ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <>
                  <Pressable
                    style={styles.approveButton}
                    onPress={() => handleApprove(item.id, memberName)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <Feather name="check" size={14} color="#FFFFFF" />
                    <Text style={styles.approveButtonText}>
                      {t("teams.pendingMembers.approveButton")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.rejectButton}
                    onPress={() => handleReject(item.id, memberName)}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    <Feather name="x" size={14} color="#FFFFFF" />
                    <Text style={styles.rejectButtonText}>
                      {t("teams.pendingMembers.rejectButton")}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400E",
    marginBottom: 12,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#FDE68A",
  },
  memberInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#D1D5DB",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  memberTextBlock: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  memberAppliedAt: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    flexShrink: 0,
  },
  approveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  approveButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  rejectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rejectButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  emptyContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#065F46",
  },
});
