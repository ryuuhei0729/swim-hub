"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { parseISO, isValid } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { formatDateTime } from "@apps/shared/utils/date";
import {
  useDeleteRecordFeedbackMutation,
  useMarkRecordFeedbacksReadMutation,
  useRecordFeedbacksQuery,
} from "@apps/shared/hooks/queries/recordFeedbacks";
import type { RecordFeedback } from "@swim-hub/shared/types";
import { RecordFeedbackFormModal } from "./RecordFeedbackFormModal";

interface RecordFeedbackSectionProps {
  recordId: string;
  /** 記録の team_id。null (個人の記録) なら FB は付かないので何も描画しない */
  teamId: string | null | undefined;
  /** 記録の持ち主。自分の記録には書けない */
  recordOwnerId?: string | null;
  /** 管理者として書き込み導線を出すか (チーム記録一覧の管理者ビュー) */
  canWrite?: boolean;
  testID?: string;
}

/** updated_at が created_at より後なら「編集済み」 */
export function isRecordFeedbackEdited(feedback: Pick<RecordFeedback, "created_at" | "updated_at">): boolean {
  const created = parseISO(feedback.created_at);
  const updated = parseISO(feedback.updated_at);
  if (!isValid(created) || !isValid(updated)) return false;
  return updated.getTime() > created.getTime();
}

/**
 * 記録1件の FB 一覧。
 * - 選手本人が表示したら、その記録の自分宛て未読 FB を既読にする (表示した時点で既読)
 * - 書いた本人 (管理者) には編集・削除を出す
 * - canWrite のときは、まだ書いていなければ「FBを書く」を出す
 */
export const RecordFeedbackSection: React.FC<RecordFeedbackSectionProps> = ({
  recordId,
  teamId,
  recordOwnerId,
  canWrite = false,
  testID = "record-feedback-section",
}) => {
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const toast = useToast();
  const locale = useDateLocale();
  const userId = user?.id;
  const isTeamRecord = !!teamId;

  const feedbacksQuery = useRecordFeedbacksQuery(supabase, recordId, { enabled: isTeamRecord });
  const feedbacks = useMemo(() => feedbacksQuery.data ?? [], [feedbacksQuery.data]);
  const markReadMutation = useMarkRecordFeedbacksReadMutation(supabase);
  const deleteMutation = useDeleteRecordFeedbackMutation(supabase);

  const [formVisible, setFormVisible] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<RecordFeedback | null>(null);
  // 表示した時点で未読だった FB (既読化後も「NEW」を出し続けるため最初の表示で固定する)
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const markedRef = useRef(false);

  const unreadForMe = useMemo(
    () => feedbacks.filter((f) => f.read_at === null && !!userId && f.recipient_id === userId),
    [feedbacks, userId],
  );

  useEffect(() => {
    if (markedRef.current || unreadForMe.length === 0) return;
    markedRef.current = true;
    setNewIds(new Set(unreadForMe.map((f) => f.id)));
    markReadMutation.mutate(
      { recordId },
      {
        onError: (error) => {
          // 失敗したら次に開いたとき再試行する
          markedRef.current = false;
          console.error("Failed to mark record feedbacks as read:", error);
        },
      },
    );
    // markReadMutation はレンダーごとに別オブジェクトになるため依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadForMe, recordId]);

  if (!isTeamRecord) return null;

  const hasMine = !!userId && feedbacks.some((f) => f.author_id === userId);
  const isOwnRecord = !!userId && recordOwnerId === userId;
  const showWriteButton = canWrite && !isOwnRecord && !hasMine && !feedbacksQuery.isLoading;

  // 何も無く書けもしないなら、セクションごと出さない
  if (!feedbacksQuery.isLoading && feedbacks.length === 0 && !showWriteButton) return null;

  const openCreate = () => {
    setEditingFeedback(null);
    setFormVisible(true);
  };

  const openEdit = (feedback: RecordFeedback) => {
    setEditingFeedback(feedback);
    setFormVisible(true);
  };

  const confirmDelete = (feedback: RecordFeedback) => {
    Alert.alert(
      t("recordFeedbackMobile.deleteConfirmTitle"),
      t("recordFeedbackMobile.deleteConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("recordFeedbackMobile.delete"),
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(
              { feedbackId: feedback.id, recordId },
              {
                onSuccess: () => toast.success(t("recordFeedbackMobile.deletedToast")),
                onError: (error) => {
                  console.error("Failed to delete record feedback:", error);
                  Alert.alert(t("common.error"), t("recordFeedbackMobile.errors.deleteFailed"));
                },
              },
            );
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.headerRow}>
        <Feather name="message-circle" size={14} color="#7C3AED" />
        <Text style={styles.headerText}>
          {t("recordFeedbackMobile.sectionTitle", { count: feedbacks.length })}
        </Text>
      </View>

      {feedbacksQuery.isLoading && <ActivityIndicator size="small" color="#7C3AED" />}

      {feedbacksQuery.isError && !feedbacksQuery.isLoading && (
        <Text style={styles.errorText}>{t("recordFeedbackMobile.loadFailed")}</Text>
      )}

      {feedbacks.map((feedback) => {
        const authorName = feedback.author_name ?? t("recordFeedbackMobile.deletedUser");
        const isMine = !!userId && feedback.author_id === userId;
        const isNew = newIds.has(feedback.id);
        return (
          <View key={feedback.id} style={styles.item} testID={`record-feedback-item-${feedback.id}`}>
            <View style={styles.itemHeader}>
              <Text style={styles.author} numberOfLines={1}>
                {authorName}
              </Text>
              {isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>{t("recordFeedbackMobile.newLabel")}</Text>
                </View>
              )}
              <View style={styles.spacer} />
              {isMine && (
                <>
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => openEdit(feedback)}
                    accessibilityRole="button"
                    accessibilityLabel={t("recordFeedbackMobile.edit")}
                    hitSlop={6}
                  >
                    <Feather name="edit-2" size={15} color="#2563EB" />
                  </Pressable>
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => confirmDelete(feedback)}
                    accessibilityRole="button"
                    accessibilityLabel={t("recordFeedbackMobile.delete")}
                    hitSlop={6}
                    disabled={deleteMutation.isPending}
                  >
                    <Feather name="trash-2" size={15} color="#EF4444" />
                  </Pressable>
                </>
              )}
            </View>
            <Text style={styles.content}>{feedback.content}</Text>
            <Text style={styles.meta}>
              {formatDateTime(feedback.updated_at, "short", locale)}
              {isRecordFeedbackEdited(feedback) ? ` · ${t("recordFeedbackMobile.edited")}` : ""}
            </Text>
          </View>
        );
      })}

      {showWriteButton && (
        <Pressable
          testID="record-feedback-write-button"
          style={styles.writeButton}
          onPress={openCreate}
          accessibilityRole="button"
          accessibilityLabel={t("recordFeedbackMobile.write")}
        >
          <Feather name="edit-3" size={14} color="#7C3AED" />
          <Text style={styles.writeButtonText}>{t("recordFeedbackMobile.write")}</Text>
        </Pressable>
      )}

      {formVisible && (
        <RecordFeedbackFormModal
          visible={formVisible}
          recordId={recordId}
          feedback={editingFeedback}
          onClose={() => {
            setFormVisible(false);
            setEditingFeedback(null);
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#FAF5FF",
    borderWidth: 1,
    borderColor: "#E9D5FF",
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B21A8",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
  },
  item: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  author: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    flexShrink: 1,
  },
  newBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: "#7C3AED",
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  spacer: {
    flex: 1,
  },
  iconButton: {
    padding: 4,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1F2937",
  },
  meta: {
    fontSize: 11,
    color: "#6B7280",
  },
  writeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C4B5FD",
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  writeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7C3AED",
  },
});
