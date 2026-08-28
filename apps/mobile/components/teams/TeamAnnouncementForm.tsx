import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
} from "react-native";
import { format, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from "@apps/shared/hooks/queries/teams";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { CenterModal } from "@/components/ui/CenterModal";
import type { TeamAnnouncement } from "@swim-hub/shared/types";

interface TeamAnnouncementFormProps {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  editData?: TeamAnnouncement;
  onSuccess?: () => void;
}

// web AnnouncementForm.tsx と同一の上限（タイトル100 / 本文2000）
const TITLE_MAX_LENGTH = 100;
const CONTENT_MAX_LENGTH = 2000;

const TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

interface DateTimeErrors {
  startAt?: string;
  endAt?: string;
}

/** "yyyy-MM-dd" + "HH:mm" → ローカル Date（date が空なら null） */
function buildLocalDateTime(date: string, time: string): Date | null {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || "00:00"}:00`);
  return isValid(parsed) ? parsed : null;
}

/**
 * チームお知らせ作成・編集フォームコンポーネント
 * web AnnouncementForm.tsx 準拠:
 * - 表示期間 (start_at / end_at) の入力（デフォルト: 現在 → 1週間後）
 * - 下書き保存 / 公開 の2ボタンモデル
 */
export const TeamAnnouncementForm: React.FC<TeamAnnouncementFormProps> = ({
  visible,
  onClose,
  teamId,
  editData,
  onSuccess,
}) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const createMutation = useCreateAnnouncementMutation(supabase);
  const updateMutation = useUpdateAnnouncementMutation(supabase);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [dateErrors, setDateErrors] = useState<DateTimeErrors>({});
  const [error, setError] = useState<string | null>(null);

  const isLoading = createMutation.isPending || updateMutation.isPending;

  // 編集データがある場合はフォームに設定。新規時は web と同じデフォルト（現在 → 1週間後）
  useEffect(() => {
    if (editData) {
      setTitle(editData.title);
      setContent(editData.content);
      if (editData.start_at) {
        const start = new Date(editData.start_at);
        setStartDate(isValid(start) ? format(start, "yyyy-MM-dd") : "");
        setStartTime(isValid(start) ? format(start, "HH:mm") : "");
      } else {
        setStartDate("");
        setStartTime("");
      }
      if (editData.end_at) {
        const end = new Date(editData.end_at);
        setEndDate(isValid(end) ? format(end, "yyyy-MM-dd") : "");
        setEndTime(isValid(end) ? format(end, "HH:mm") : "");
      } else {
        setEndDate("");
        setEndTime("");
      }
    } else {
      setTitle("");
      setContent("");
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      setStartDate(format(now, "yyyy-MM-dd"));
      setStartTime(format(now, "HH:mm"));
      setEndDate(format(oneWeekLater, "yyyy-MM-dd"));
      setEndTime(format(oneWeekLater, "HH:mm"));
    }
    setDateErrors({});
    setError(null);
  }, [editData, visible]);

  const handleClose = () => {
    if (isLoading) return;
    setTitle("");
    setContent("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setDateErrors({});
    setError(null);
    onClose();
  };

  // web AnnouncementForm.validateDates と同一ロジック + 時刻形式チェック
  const validateDates = (): boolean => {
    const newErrors: DateTimeErrors = {};

    if (startDate && startTime && !TIME_REGEX.test(startTime)) {
      newErrors.startAt = t("teams.mobile.announcementTimeInvalid");
    }
    if (endDate && endTime && !TIME_REGEX.test(endTime)) {
      newErrors.endAt = t("teams.mobile.announcementTimeInvalid");
    }

    if (!newErrors.startAt && !newErrors.endAt) {
      const now = new Date();
      const startAt = buildLocalDateTime(startDate, startTime);
      const endAt = buildLocalDateTime(endDate, endTime);

      if (endAt && endAt < now) {
        newErrors.endAt = t("teamsAdmin.announcementForm.endAtPastError");
      }
      if (startAt && endAt && endAt < startAt) {
        newErrors.endAt = t(
          "teamsAdmin.announcementForm.endAtBeforeStartError",
        );
      }
    }

    setDateErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (publishStatus: boolean) => {
    if (!user) {
      setError(t("teams.mobile.loginRequired"));
      return;
    }

    if (!title.trim()) {
      setError(t("teams.mobile.announcementTitleRequired"));
      return;
    }

    if (!content.trim()) {
      setError(t("teams.mobile.announcementContentRequired"));
      return;
    }

    if (!validateDates()) {
      return;
    }

    setError(null);

    try {
      const startAtValue =
        buildLocalDateTime(startDate, startTime)?.toISOString() ?? null;
      const endAtValue =
        buildLocalDateTime(endDate, endTime)?.toISOString() ?? null;

      if (editData) {
        // 更新
        await updateMutation.mutateAsync({
          id: editData.id,
          input: {
            title: title.trim(),
            content: content.trim(),
            is_published: publishStatus,
            start_at: startAtValue,
            end_at: endAtValue,
          },
        });
      } else {
        // 新規作成
        await createMutation.mutateAsync({
          team_id: teamId,
          title: title.trim(),
          content: content.trim(),
          is_published: publishStatus,
          created_by: user.id,
          start_at: startAtValue,
          end_at: endAtValue,
        });
      }

      if (onSuccess) {
        onSuccess();
      }

      handleClose();
    } catch (err) {
      console.error("お知らせ保存エラー:", err);
      let errorMessage = t("teams.mobile.announcementSaveFailed");
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === "object" && "message" in err) {
        errorMessage = String(err.message);
      }
      setError(errorMessage);
    }
  };

  const submitDisabled = isLoading || !title.trim() || !content.trim();

  return (
    <CenterModal
      visible={visible}
      onClose={handleClose}
      closeAccessibilityLabel={t("common.close")}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View style={styles.header}>
        <Text style={styles.title}>
          {editData
            ? t("teams.mobile.announcementEditTitle")
            : t("teams.mobile.announcementCreateTitle")}
        </Text>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>×</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body}>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("teams.mobile.announcementTitleLabel")}
          </Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t("teams.mobile.announcementTitlePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={TITLE_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("teams.mobile.charCounter", {
              current: title.length,
              max: TITLE_MAX_LENGTH,
            })}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("teams.mobile.announcementContentLabel")}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={content}
            onChangeText={setContent}
            placeholder={t("teams.mobile.announcementContentPlaceholder")}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            maxLength={CONTENT_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("teams.mobile.charCounter", {
              current: content.length,
              max: CONTENT_MAX_LENGTH,
            })}
          </Text>
        </View>

        {/* 表示期間設定（web AnnouncementForm.tsx:220-265 準拠） */}
        <View style={styles.periodSection}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {t("teamsAdmin.announcementForm.startAtLabel")}
            </Text>
            <View style={styles.dateTimeRow}>
              <View style={styles.dateField}>
                <DatePickerField
                  value={startDate}
                  onChange={(date) => {
                    setStartDate(date);
                    setDateErrors((prev) => ({ ...prev, startAt: undefined }));
                  }}
                  disabled={isLoading}
                  allowClear
                />
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.timeInput,
                  dateErrors.startAt && styles.inputError,
                ]}
                value={startTime}
                onChangeText={(text) => {
                  setStartTime(text);
                  setDateErrors((prev) => ({ ...prev, startAt: undefined }));
                }}
                placeholder="HH:MM"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                editable={!isLoading}
              />
            </View>
            {dateErrors.startAt && (
              <Text style={styles.fieldErrorText}>{dateErrors.startAt}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {t("teamsAdmin.announcementForm.endAtLabel")}
            </Text>
            <View style={styles.dateTimeRow}>
              <View style={styles.dateField}>
                <DatePickerField
                  value={endDate}
                  onChange={(date) => {
                    setEndDate(date);
                    setDateErrors((prev) => ({ ...prev, endAt: undefined }));
                  }}
                  disabled={isLoading}
                  allowClear
                />
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.timeInput,
                  dateErrors.endAt && styles.inputError,
                ]}
                value={endTime}
                onChangeText={(text) => {
                  setEndTime(text);
                  setDateErrors((prev) => ({ ...prev, endAt: undefined }));
                }}
                placeholder="HH:MM"
                placeholderTextColor="#9CA3AF"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                editable={!isLoading}
              />
            </View>
            {dateErrors.endAt && (
              <Text style={styles.fieldErrorText}>{dateErrors.endAt}</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* フッター: 下書き保存 / キャンセル / 公開（web AnnouncementForm.tsx:270-298 準拠） */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.button,
            styles.draftButton,
            submitDisabled && styles.buttonDisabledOutline,
          ]}
          onPress={() => handleSubmit(false)}
          disabled={submitDisabled}
        >
          <Text style={styles.draftButtonText}>
            {isLoading
              ? t("teamsAdmin.announcementForm.saving")
              : t("teamsAdmin.announcementForm.saveDraftButton")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={handleClose}
          disabled={isLoading}
        >
          <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            styles.submitButton,
            submitDisabled && styles.submitButtonDisabled,
          ]}
          onPress={() => handleSubmit(true)}
          disabled={submitDisabled}
        >
          <Text style={styles.submitButtonText}>
            {isLoading
              ? t("teamsAdmin.announcementForm.saving")
              : editData
                ? t("teamsAdmin.announcementForm.publishUpdateButton")
                : t("teamsAdmin.announcementForm.publishCreateButton")}
          </Text>
        </Pressable>
      </View>
    </CenterModal>
  );
};

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 500,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#6B7280",
    lineHeight: 28,
  },
  body: {
    padding: 20,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: "#DC2626",
  },
  textArea: {
    minHeight: 150,
    paddingTop: 12,
  },
  counterText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "right",
  },
  periodSection: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 16,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  dateField: {
    flex: 1,
  },
  timeInput: {
    width: 88,
    textAlign: "center",
  },
  fieldErrorText: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  draftButton: {
    marginRight: "auto",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  draftButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  buttonDisabledOutline: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  submitButton: {
    backgroundColor: "#2563EB",
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
