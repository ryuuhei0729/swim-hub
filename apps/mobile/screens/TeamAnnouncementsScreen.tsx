"use client";

import React, { useMemo, useState } from "react";
import { View, StyleSheet, Alert } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useDeleteAnnouncementMutation } from "@apps/shared/hooks/queries/teams";
import type { TeamAnnouncement } from "@swim-hub/shared/types";
import { TeamAnnouncementList } from "@/components/teams/TeamAnnouncementList";
import { TeamAnnouncementForm } from "@/components/teams/TeamAnnouncementForm";
import { useTeamAdminView } from "@/hooks/useTeamAdminView";
import { usePendingAction } from "@/hooks/usePendingAction";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { colors } from "@/constants/theme";
import { filterVisibleAnnouncements } from "@/utils/teamAnnouncements";
import type { MainStackParamList } from "@/navigation/types";

type RouteProps = RouteProp<MainStackParamList, "TeamAnnouncements">;

/**
 * チームのお知らせ一覧。チームタブのヘッダー 🔔 から開く。
 * 管理者ビューでは下書きも含めて全件を出し、作成・編集・削除ができる。
 * 利用者ビューでは公開中のものだけを読み取り専用で出す。
 */
export const TeamAnnouncementsScreen: React.FC = () => {
  const { teamId } = useRoute<RouteProps>().params;
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const { announcements, isLoading, isError, error, refetch, effectiveIsAdminView } =
    useTeamAdminView(teamId);

  const [formVisible, setFormVisible] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<TeamAnnouncement | undefined>(
    undefined,
  );

  const visibleAnnouncements = useMemo(
    () => (effectiveIsAdminView ? announcements : filterVisibleAnnouncements(announcements)),
    [announcements, effectiveIsAdminView],
  );

  const deleteAnnouncementMutation = useDeleteAnnouncementMutation(supabase);
  const {
    pendingKey: deletingAnnouncementId,
    run: runAnnouncementDelete,
    isBusy: isAnnouncementDeleteBusy,
  } = usePendingAction();

  const handleDelete = (announcementId: string) => {
    if (isAnnouncementDeleteBusy()) return;
    Alert.alert(t("teams.mobile.deleteConfirmTitle"), t("teams.mobile.deleteConfirmText"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void runAnnouncementDelete(announcementId, async () => {
            try {
              await deleteAnnouncementMutation.mutateAsync(announcementId);
            } catch (deleteError) {
              Alert.alert(
                t("common.error"),
                toUserFacingMessage(deleteError, t("teams.mobile.announcementDeleteFailed")),
                [{ text: "OK" }],
              );
            }
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <TeamAnnouncementList
        announcements={visibleAnnouncements}
        isLoading={isLoading}
        isError={isError}
        error={error || null}
        isAdmin={effectiveIsAdminView}
        onRetry={() => void refetch()}
        onCreateNew={() => {
          setEditingAnnouncement(undefined);
          setFormVisible(true);
        }}
        onEdit={(announcement) => {
          setEditingAnnouncement(announcement);
          setFormVisible(true);
        }}
        onDelete={handleDelete}
        deletingId={deletingAnnouncementId}
      />
      {effectiveIsAdminView && (
        <TeamAnnouncementForm
          visible={formVisible}
          onClose={() => {
            setFormVisible(false);
            setEditingAnnouncement(undefined);
          }}
          teamId={teamId}
          editData={editingAnnouncement}
          onSuccess={() => void refetch()}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
