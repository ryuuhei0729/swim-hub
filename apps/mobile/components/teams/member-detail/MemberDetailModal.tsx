import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
// SafeAreaView は必ず react-native-safe-area-context のものを使う。
// react-native の同名コンポーネントは iOS 専用で Android では何もしないため、
// Edge-to-Edge 強制下の Android では上下端のコンテンツがステータスバー/
// システムナビゲーションバーに埋まる。
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useUpdateSwimmerStatusMutation,
} from "@apps/shared/hooks/queries/teams";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { ProfileSection } from "./ProfileSection";
import { AdminControls } from "./AdminControls";
import { BestTimesTable } from "./BestTimesTable";

interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: TeamMembershipWithUser | null;
  currentUserId: string;
  isCurrentUserAdmin: boolean;
  onMembershipChange?: () => void;
}

export const MemberDetailModal: React.FC<MemberDetailModalProps> = ({
  isOpen,
  onClose,
  member,
  currentUserId,
  isCurrentUserAdmin,
  onMembershipChange,
}) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  // Android edge-to-edge: 最下部の「閉じる」ボタンがシステムナビゲーションバーに
  // 埋没する。下端はスクロール内容なので SafeAreaView(上端のみ)ではなく、
  // 既存のデザイン値 40 と inset の大きい方をスクロール余白に使う (パターンB)。
  // SafeAreaView に bottom を含めると 40 + inset の二重加算になり余白が過大になる。
  const insets = useSafeInsets();
  const updateRoleMutation = useUpdateMemberRoleMutation(supabase);
  const removeMemberMutation = useRemoveMemberMutation(supabase);
  const updateSwimmerStatusMutation = useUpdateSwimmerStatusMutation(supabase);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ベストタイム取得
  const {
    data: bestTimes = [],
    isLoading: loadingBestTimes,
    error: bestTimesError,
  } = useBestTimesQuery(supabase, {
    userId: member?.user_id,
  });

  const isCurrentUser = member?.user_id === currentUserId;
  const canManage = isCurrentUserAdmin && !isCurrentUser;
  // 区分記録基準の初期選択に使う年齢区分 (生年月日そのものは BestTimesTable に渡さない)
  const ageCategory = useMemo(
    () => resolveAgeCategory(member?.users.birthday),
    [member?.users.birthday],
  );

  // ロール変更
  const handleRoleChangeClick = useCallback(
    (newRole: "admin" | "user") => {
      if (!member || member.role === newRole) return;

      const memberName = member.users?.name || t("teams.mobile.fallbackMemberName");
      const roleName = newRole === "admin" ? t("teams.mobile.roleAdmin") : t("teams.mobile.roleUser");
      const message = t("teams.mobile.memberRoleChangeMessage", {
        name: memberName,
        role: roleName,
      });

      const execute = async () => {
        try {
          setError(null);
          await updateRoleMutation.mutateAsync({
            teamId: member.team_id,
            userId: member.user_id,
            role: newRole,
          });
          onMembershipChange?.();
        } catch (err) {
          console.error("権限変更エラー:", err);
          const errorMsg = toUserFacingMessage(err, t("teams.mobile.roleChangeFailed"));
          setError(errorMsg);
        }
      };

      if (Platform.OS === "web") {
        if (window.confirm(message)) {
          execute();
        }
      } else {
        Alert.alert(t("teams.mobile.roleChangeTitle"), message, [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("teams.mobile.roleChangeButton"), onPress: execute },
        ]);
      }
    },
    [member, updateRoleMutation, onMembershipChange, t],
  );

  // メンバー削除
  const handleRemoveMember = useCallback(() => {
    if (!member) return;

    const memberName = member.users?.name || t("teams.mobile.fallbackMemberName");
    const message = t("teams.mobile.memberRemoveMessage", { name: memberName });

    const execute = async () => {
      setIsRemoving(true);
      try {
        setError(null);
        await removeMemberMutation.mutateAsync({
          teamId: member.team_id,
          userId: member.user_id,
        });
        onMembershipChange?.();
        onClose();
      } catch (err) {
        console.error("メンバー削除エラー:", err);
        const errorMsg = toUserFacingMessage(err, t("teams.mobile.memberDeleteFailed"));
        setError(errorMsg);
      } finally {
        setIsRemoving(false);
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(message)) {
        execute();
      }
    } else {
      Alert.alert(t("teams.mobile.deleteConfirmTitle"), message, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("teams.mobile.deleteConfirmText"),
          style: "destructive",
          onPress: execute,
        },
      ]);
    }
  }, [member, removeMemberMutation, onMembershipChange, onClose, t]);

  // 非泳者フラグ変更
  // handleRoleChangeClick と同じ扱い: Platform.OS==="web" は window.confirm、
  // それ以外は Alert.alert で確認してから実行する (ユーザー要望: 誤タップでの
  // 即時更新を防ぐ)。キャンセル時は何もしない — セグメント (泳者/非泳者) の表示値は
  // member.is_swimmer から直接導出しているため (AdminControls.tsx)、見た目だけが
  // 変わったまま実値と食い違う状態は起こらない。
  //
  // メッセージには対象メンバー名を補間する (handleRoleChangeClick の memberName と同じ
  // 組み立て方)。補間値を渡し忘れると shared messages 側の "{name}さんを..." がそのまま
  // 画面に出る (past incident: Issue #49 フォローアップで発覚し修正済み)。
  const handleSwimmerStatusChange = useCallback(
    (isSwimmer: boolean) => {
      if (!member || member.is_swimmer === isSwimmer) return;

      const memberName = member.users?.name || t("teams.mobile.fallbackMemberName");
      const message = isSwimmer
        ? t("teams.nonSwimmer.confirmMessageToSwimmer", { name: memberName })
        : t("teams.nonSwimmer.confirmMessageToNonSwimmer", { name: memberName });

      const execute = async () => {
        try {
          setError(null);
          await updateSwimmerStatusMutation.mutateAsync({
            teamId: member.team_id,
            userId: member.user_id,
            isSwimmer,
          });
          onMembershipChange?.();
        } catch (err) {
          console.error("非泳者設定変更エラー:", err);
          const errorMsg = toUserFacingMessage(err, t("teams.nonSwimmer.updateFailed"));
          setError(errorMsg);
        }
      };

      if (Platform.OS === "web") {
        if (window.confirm(message)) {
          execute();
        }
      } else {
        Alert.alert(t("teams.nonSwimmer.confirmTitle"), message, [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("teams.mobile.roleChangeButton"), onPress: execute },
        ]);
      }
    },
    [member, updateSwimmerStatusMutation, onMembershipChange, t],
  );

  if (!member) return null;

  const displayError = error || (bestTimesError ? bestTimesError.message : null);

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("teams.mobile.memberDetailTitle")}</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Feather name="x" size={22} color="#374151" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: getSafeFooterPadding(40, insets.bottom) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* エラー表示 */}
          {displayError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{displayError}</Text>
            </View>
          )}

          {/* プロフィール */}
          <View style={styles.horizontalPadding}>
            <ProfileSection member={member} currentUserId={currentUserId} />
          </View>

          {/* 区切り線 */}
          <View style={styles.divider} />

          {/* 管理者機能 */}
          {canManage && (
            <>
              <View style={styles.horizontalPadding}>
                <AdminControls
                  member={member}
                  isRemoving={isRemoving}
                  onRoleChangeClick={handleRoleChangeClick}
                  onRemoveMember={handleRemoveMember}
                  onSwimmerStatusChange={handleSwimmerStatusChange}
                />
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* ベストタイム (見出しは padding を保持、表は左右いっぱいに表示) */}
          <View style={styles.bestTimesSection}>
            <View style={styles.bestTimesHeader}>
              <Feather name="award" size={18} color="#EAB308" />
              <Text style={styles.bestTimesTitle}>{t("teams.mobile.bestTimeSection")}</Text>
            </View>

            {loadingBestTimes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>{t("teams.mobile.bestTimeLoading")}</Text>
              </View>
            ) : (
              <BestTimesTable
                bestTimes={bestTimes}
                gender={member.users.gender}
                ageCategory={ageCategory}
              />
            )}
          </View>

          {/* 閉じるボタン */}
          <View style={styles.horizontalPadding}>
            <Pressable style={styles.closeFooterButton} onPress={onClose}>
              <Text style={styles.closeFooterButtonText}>{t("common.close")}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 40,
  },
  horizontalPadding: {
    paddingHorizontal: 20,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: "#991B1B",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  bestTimesSection: {
    gap: 12,
  },
  bestTimesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  bestTimesTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  closeFooterButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignSelf: "flex-end",
    marginTop: 20,
  },
  closeFooterButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
