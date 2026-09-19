/**
 * チーム詳細「設定」タブ。
 *
 * セクション構成:
 *   チーム情報 (招待コードを内包) / このチームの記録色 /
 *   チーム操作 (見出しなしの2ボタン) / 脱退・削除 (見出しなしの2ボタン)
 *
 * 出し分けは `isAdminView` (= ヘッダーの「管理者ビュー/利用者ビュー」トグルの状態) で行う。
 * 以前は永続的な権限 `isAdmin` を基準にし「effectiveIsAdminView では切り替えないこと」と
 * していたが、**ユーザー指示によりビュー連動に変更した** — 管理者でも利用者ビューの間は
 * 「チーム情報を編集」「チームを削除」を出さない、という見え方を優先する。
 * 権限基準に戻さないこと。
 *
 * 画面遷移はこのコンポーネントでは行わず、親 (TeamDetailScreen) のコールバックに
 * 委ねる。ナビゲーションの起点を親に集約しておくと、タブ側は描画と API 呼び出しだけを
 * 持つ。
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useDeleteTeamMutation,
  useLeaveTeamMutation,
} from "@apps/shared/hooks/queries/teams";
import { getDeleteTeamErrorMessageKey } from "@apps/shared/api/teams/core";
import { getLeaveBlockReason, type LeaveGuardMember } from "@apps/shared/utils/teamLeaveGuard";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { TeamSettingsModal } from "./TeamSettingsModal";
import { TeamCalendarColorSection } from "./settings/TeamCalendarColorSection";
import { copyTextToClipboard } from "@/utils/copyToClipboard";

/** コピー完了表示を出しておく時間(ms)。チーム情報カードの招待コードと揃える */
const COPIED_FEEDBACK_DURATION = 2000;

export interface TeamSettingsTabProps {
  teamId: string;
  teamName: string;
  teamDescription?: string | null;
  inviteCode?: string | null;
  /**
   * ヘッダーの「管理者ビュー/利用者ビュー」トグルの状態。永続的な権限ではない
   * (ユーザー指示で権限基準からビュー連動に変更。docstring 参照)
   */
  isAdminView: boolean;
  /**
   * 脱退ガードの判定に使う。TeamDetailScreen が既に持っている配列をそのまま渡すこと
   * (詰め替えると user_id / role が落ちてガードが素通りする)
   */
  members: TeamMembershipWithUser[];
  /** 脱退・削除に成功してこのチームを離れたとき */
  onLeftTeam?: () => void;
  /** チーム情報を更新したとき */
  onTeamUpdated?: () => void;
}

export const TeamSettingsTab: React.FC<TeamSettingsTabProps> = ({
  teamId,
  teamName,
  teamDescription,
  inviteCode,
  isAdminView,
  members,
  onLeftTeam,
  onTeamUpdated,
}) => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const leaveTeamMutation = useLeaveTeamMutation(supabase);
  const deleteTeamMutation = useDeleteTeamMutation(supabase);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  /** 危険な操作の結果表示 (脱退ブロック理由・API 失敗) */
  const [actionError, setActionError] = useState<string | null>(null);

  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    },
    [],
  );

  const isBusy = leaveTeamMutation.isPending || deleteTeamMutation.isPending;

  const handleCopyInviteCode = async () => {
    if (!inviteCode) return;
    const copied = await copyTextToClipboard(inviteCode);
    setCopyFailed(!copied);
    setIsCopied(copied);
    if (!copied) return;

    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_DURATION);
  };

  const handleLeavePress = () => {
    setActionError(null);

    // ⚠️ ガードは確認ダイアログより **前**。DB 側にこの制約は無いため、確認まで
    // 進めると「はい」を押した瞬間に最後の管理者の脱退が成立してしまう。
    // user が未取得のときは空文字を渡す = 名簿に自分が見つからず判定不能として通す
    // (getLeaveBlockReason の docstring どおり。ここで塞ぐと押しても何も起きない)。
    //
    // shared の TeamMembership.role は string 型なので、ガードが要求する
    // "admin" | "user" に絞ってから渡す (admin 以外は一般メンバー扱い)
    const guardMembers = members.map<LeaveGuardMember>((member) => ({
      user_id: member.user_id,
      role: member.role === "admin" ? "admin" : "user",
    }));
    if (getLeaveBlockReason(guardMembers, user?.id ?? "") !== null) {
      setActionError(t("teams.settingsTab.lastAdminCannotLeave"));
      return;
    }

    Alert.alert(
      t("teams.settingsTab.leaveConfirmTitle"),
      t("teams.settingsTab.leaveConfirmMessage", { name: teamName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("teams.settingsTab.leaveTeam"),
          style: "destructive",
          onPress: async () => {
            try {
              await leaveTeamMutation.mutateAsync(teamId);
              onLeftTeam?.();
            } catch (error) {
              setActionError(toUserFacingMessage(error, t("teams.settingsTab.leaveFailed")));
            }
          },
        },
      ],
    );
  };

  const handleDeletePress = () => {
    setActionError(null);
    Alert.alert(
      t("teams.settingsTab.deleteConfirmTitle"),
      t("teams.settingsTab.deleteConfirmMessage", { name: teamName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTeamMutation.mutateAsync(teamId);
              onLeftTeam?.();
            } catch (error) {
              // RPC は機械可読なコードを返すので、i18n キーへの変換は shared の
              // getDeleteTeamErrorMessageKey が唯一の定義元 (対応表をここに写さない)。
              // 未知のコードは同関数が deleteFailed へフォールバックさせる
              setActionError(t(getDeleteTeamErrorMessageKey(error)));
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* チーム情報（招待コードもこのカードに内包する） */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("teams.settingsTab.teamInfoTitle")}</Text>
        <Text style={styles.teamName}>{teamName}</Text>
        {teamDescription ? (
          <Text style={styles.teamDescription}>{teamDescription}</Text>
        ) : null}

        {/* 招待コード行 */}
        <View style={styles.inviteCodeRow}>
          <Text style={styles.inviteCodeLabel}>{t("teams.settingsTab.inviteCodeTitle")}</Text>
          {inviteCode ? (
            <>
              <View style={styles.inviteCodeBox}>
                <Text style={styles.inviteCodeText}>{inviteCode}</Text>
              </View>
              <Pressable
                style={styles.inviteCopyButton}
                onPress={handleCopyInviteCode}
                accessibilityRole="button"
                accessibilityLabel={t("teams.settingsTab.copyInviteCode")}
              >
                <Feather
                  name={isCopied ? "check" : "clipboard"}
                  size={14}
                  color={isCopied ? "#10B981" : "#2563EB"}
                />
              </Pressable>
              {/* コピー結果はアイコンの「右」に出す(下に積むと行が増えてカードが伸びるため)。
                  長い訳語でも行が押し出されないよう flexShrink で縮める */}
              {isCopied && (
                <Text style={styles.copyResultSuccess} numberOfLines={1}>
                  {t("teams.settingsTab.copied")}
                </Text>
              )}
              {copyFailed && (
                <Text style={styles.copyResultError} numberOfLines={1}>
                  {t("teams.mobile.copyFailed")}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>{t("common.none")}</Text>
          )}
        </View>

        {isAdminView && (
          <Pressable
            style={styles.secondaryButton}
            onPress={() => setEditModalVisible(true)}
            accessibilityRole="button"
          >
            <Feather name="edit-2" size={14} color="#2563EB" />
            <Text style={styles.secondaryButtonText}>
              {t("teams.settingsTab.editTeamInfo")}
            </Text>
          </Pressable>
        )}
      </View>

      {/* このチームの記録色 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("teams.settingsTab.calendarColorTitle")}</Text>
        <TeamCalendarColorSection teamId={teamId} />
      </View>

      {/* 脱退 / 削除（各1枚の説明付きカードを縦積み）。
          ⚠️ 直前の版は「左右に2ボタン」だったが、ユーザー指示で
          settings/AccountDeleteSettings.tsx と同じカード UI に変更した。
          見た目・余白・ボタン配色はあちらに合わせること（独自スタイルを作らない）。
          「チームを作成 / 招待コードで参加」もユーザー指示で設定タブから撤去済み
          （チーム一覧画面には引き続きあるので機能は失われない）。 */}
      <View style={styles.dangerCardBox}>
        <Text style={styles.dangerCardTitle}>{t("teams.settingsTab.leaveTeam")}</Text>
        <Text style={styles.dangerCardDescription}>
          {t("teams.settingsTab.leaveDescription")}
        </Text>
        <Pressable
          style={[styles.leaveActionButton, isBusy && styles.leaveActionButtonDisabled]}
          onPress={handleLeavePress}
          disabled={isBusy}
          accessibilityRole="button"
        >
          {leaveTeamMutation.isPending ? (
            <ActivityIndicator color="#DC2626" size="small" />
          ) : (
            <Text style={styles.leaveActionButtonText}>
              {t("teams.settingsTab.leaveButton")}
            </Text>
          )}
        </Pressable>
      </View>

      {isAdminView && (
        <View style={styles.dangerCardBox}>
          <Text style={styles.dangerCardTitle}>{t("teams.settingsTab.deleteTeam")}</Text>
          <Text style={styles.dangerCardDescription}>
            {t("teams.settingsTab.deleteDescription")}
          </Text>
          <Pressable
            style={[styles.dangerActionButton, isBusy && styles.dangerActionButtonDisabled]}
            onPress={handleDeletePress}
            disabled={isBusy}
            accessibilityRole="button"
          >
            {deleteTeamMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.dangerActionButtonText}>
                {t("teams.settingsTab.deleteButton")}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {actionError !== null && <Text style={styles.actionErrorText}>{actionError}</Text>}

      <TeamSettingsModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        teamId={teamId}
        teamName={teamName}
        teamDescription={teamDescription}
        onSuccess={onTeamUpdated}
      />

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 12,
    gap: 8,
    // 最下段の「危険な操作」が Android の3ボタンナビ直上に張り付かないようにする
    paddingBottom: 24,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  teamName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  teamDescription: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 19,
  },
  emptyText: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  inviteCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inviteCodeLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  inviteCodeBox: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  // 旧・独立セクション時より小さく (16 -> 13)
  inviteCodeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  inviteCopyButton: {
    padding: 4,
  },
  copyResultSuccess: {
    fontSize: 12,
    color: "#10B981",
    flexShrink: 1,
  },
  copyResultError: {
    fontSize: 12,
    color: "#DC2626",
    flexShrink: 1,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  // チーム操作 / 脱退・削除の横並び行。TeamsScreen のアクションバーと同じ見た目に揃える
  // settings/AccountDeleteSettings.tsx と同じカード構成（余白・角丸・配色を揃える）
  dangerCardBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dangerCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  dangerCardDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    lineHeight: 20,
  },
  dangerActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#DC2626",
    alignItems: "center",
  },
  // 脱退は「招待コードで復帰できる」ため、復元不能な削除より一段弱い見た目にする。
  // web (TeamSettingsTab) の 脱退=枠線 / 削除=塗り の差をそのまま踏襲する
  // (border-red-300 = #FCA5A5 / text-red-600 = #DC2626)。
  leaveActionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    alignItems: "center",
  },
  leaveActionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#DC2626",
  },
  // 枠線ボタンなので、塗り用の dangerActionButtonDisabled (背景を #F87171 にする) は使えない。
  // 背景を塗りつぶさず透過だけ落とす
  leaveActionButtonDisabled: {
    opacity: 0.6,
  },
  dangerActionButtonDisabled: {
    backgroundColor: "#F87171",
    opacity: 0.6,
  },
  dangerActionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  actionErrorText: {
    fontSize: 12,
    color: "#DC2626",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
