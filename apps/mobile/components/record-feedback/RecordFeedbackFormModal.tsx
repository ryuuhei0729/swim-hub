"use client";

import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { CenterModal } from "@/components/ui/CenterModal";
import { useCenterModalMaxHeight } from "@/components/goals/useCenterModalMaxHeight";
import { toRecordFeedbackErrorCode } from "@apps/shared/api/recordFeedbacks";
import {
  useCreateRecordFeedbackMutation,
  useUpdateRecordFeedbackMutation,
} from "@apps/shared/hooks/queries/recordFeedbacks";
import { RECORD_FEEDBACK_MAX_LENGTH } from "@apps/shared/types/recordFeedback";
import type { RecordFeedback } from "@swim-hub/shared/types";

interface RecordFeedbackFormModalProps {
  visible: boolean;
  recordId: string;
  /** 編集時は対象の FB。未指定なら新規作成 */
  feedback?: RecordFeedback | null;
  onClose: () => void;
}

/** FB の作成・編集フォーム (管理者) */
export const RecordFeedbackFormModal: React.FC<RecordFeedbackFormModalProps> = ({
  visible,
  recordId,
  feedback,
  onClose,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const toast = useToast();
  const maxHeight = useCenterModalMaxHeight();
  const isEdit = !!feedback;
  const [content, setContent] = useState(feedback?.content ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const createMutation = useCreateRecordFeedbackMutation(supabase);
  const updateMutation = useUpdateRecordFeedbackMutation(supabase);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // 開き直すたびに初期値へ戻す
  useEffect(() => {
    if (visible) {
      setContent(feedback?.content ?? "");
      setErrorMessage(null);
    }
  }, [visible, feedback?.content]);

  const trimmedLength = content.trim().length;
  const isOverLimit = trimmedLength > RECORD_FEEDBACK_MAX_LENGTH;
  const canSave = trimmedLength > 0 && !isOverLimit && !isSaving;

  const handleSave = async () => {
    if (!canSave || submittingRef.current) return;
    submittingRef.current = true;
    setErrorMessage(null);
    try {
      if (feedback) {
        await updateMutation.mutateAsync({ feedbackId: feedback.id, recordId, content });
      } else {
        await createMutation.mutateAsync({ recordId, content });
      }
      toast.success(t("recordFeedbackMobile.savedToast"));
      onClose();
    } catch (error) {
      console.error("Failed to save record feedback:", error);
      const code = toRecordFeedbackErrorCode(error);
      setErrorMessage(t(`recordFeedbackMobile.errors.${code}`));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <CenterModal
      visible={visible}
      onClose={isSaving ? () => undefined : onClose}
      closeAccessibilityLabel={t("common.close")}
      contentStyle={{ maxHeight }}
    >
      <Text style={styles.title}>
        {isEdit ? t("recordFeedbackMobile.form.editTitle") : t("recordFeedbackMobile.form.createTitle")}
      </Text>
      <TextInput
        testID="record-feedback-input"
        style={styles.input}
        value={content}
        onChangeText={setContent}
        multiline
        textAlignVertical="top"
        placeholder={t("recordFeedbackMobile.form.placeholder")}
        placeholderTextColor="#9CA3AF"
        editable={!isSaving}
        accessibilityLabel={t("recordFeedbackMobile.form.inputLabel")}
      />
      <Text style={[styles.counter, isOverLimit && styles.counterOver]}>
        {t("recordFeedbackMobile.form.counter", {
          count: trimmedLength,
          max: RECORD_FEEDBACK_MAX_LENGTH,
        })}
      </Text>
      {errorMessage && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      )}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.cancelButton, isSaving && styles.disabled]}
          onPress={onClose}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={t("common.cancel")}
        >
          <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          testID="record-feedback-save"
          style={[styles.saveButton, !canSave && styles.disabled]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={t("recordFeedbackMobile.form.save")}
          accessibilityState={{ disabled: !canSave }}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{t("recordFeedbackMobile.form.save")}</Text>
          )}
        </Pressable>
      </View>
    </CenterModal>
  );
};

const styles = StyleSheet.create({
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
    paddingRight: 28,
  },
  input: {
    minHeight: 140,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  counter: {
    alignSelf: "flex-end",
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280",
  },
  counterOver: {
    color: "#DC2626",
    fontWeight: "600",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#DC2626",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  saveButton: {
    minWidth: 88,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#7C3AED",
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  disabled: {
    opacity: 0.5,
  },
});
