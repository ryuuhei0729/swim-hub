import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CenterModal } from "@/components/ui/CenterModal";
import { useAuth } from "@/contexts/AuthProvider";
import { useUpdateTeamMutation } from "@apps/shared/hooks/queries/teams";

interface TeamSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  teamDescription?: string | null;
  onSuccess?: () => void;
}

// web TeamCreateForm / TeamSettings と揃えた上限（チーム名50 / 説明200）
const NAME_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * チーム設定モーダル（管理者専用）
 * web TeamSettings.tsx 準拠: チーム名・説明の編集
 */
export const TeamSettingsModal: React.FC<TeamSettingsModalProps> = ({
  visible,
  onClose,
  teamId,
  teamName,
  teamDescription,
  onSuccess,
}) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const updateTeamMutation = useUpdateTeamMutation(supabase);
  const [name, setName] = useState(teamName);
  const [description, setDescription] = useState(teamDescription || "");
  const [error, setError] = useState<string | null>(null);

  const isLoading = updateTeamMutation.isPending;
  // 現在値から変更があるか（web/TeamCreateModal と同じく未保存確認に使用）
  const hasUnsavedChanges =
    name !== teamName || description !== (teamDescription || "");

  // モーダルが開かれるたびに現在値へリセット
  useEffect(() => {
    if (visible) {
      setName(teamName);
      setDescription(teamDescription || "");
      setError(null);
    }
  }, [visible, teamName, teamDescription]);

  const cleanupAndClose = () => {
    setError(null);
    onClose();
  };

  const handleClose = () => {
    if (isLoading) return;

    // 編集中の場合は破棄確認（TeamCreateModal と同挙動）
    if (hasUnsavedChanges) {
      if (Platform.OS === "web") {
        if (window.confirm(t("forms.unsavedChanges.messageClose"))) {
          cleanupAndClose();
        }
      } else {
        Alert.alert(
          t("forms.unsavedChanges.title"),
          t("forms.unsavedChanges.messageClose"),
          [
            { text: t("forms.unsavedChanges.cancel"), style: "cancel" },
            {
              text: t("forms.unsavedChanges.confirmClose"),
              style: "destructive",
              onPress: cleanupAndClose,
            },
          ],
        );
      }
      return;
    }

    cleanupAndClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t("teamsAdmin.settings.nameRequired"));
      return;
    }

    setError(null);

    try {
      await updateTeamMutation.mutateAsync({
        id: teamId,
        updates: {
          name: name.trim(),
          description: description.trim() || null,
        },
      });

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err) {
      console.error("チーム更新エラー:", err);
      setError(t("teamsAdmin.settings.updateFailed"));
    }
  };

  return (
    <CenterModal
      visible={visible}
      onClose={handleClose}
      closeAccessibilityLabel={t("common.close")}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{t("teamsAdmin.settings.title")}</Text>
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
            {t("teamsAdmin.settings.nameLabel")}
            <Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholderTextColor="#9CA3AF"
            maxLength={NAME_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("teams.mobile.charCounter", {
              current: name.length,
              max: NAME_MAX_LENGTH,
            })}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>
            {t("teamsAdmin.settings.descriptionLabel")}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={DESCRIPTION_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("teams.mobile.charCounter", {
              current: description.length,
              max: DESCRIPTION_MAX_LENGTH,
            })}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.button, styles.cancelButton]}
          onPress={handleClose}
          disabled={isLoading}
        >
          <Text style={styles.cancelButtonText}>
            {t("teamsAdmin.settings.cancelButton")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.button,
            styles.submitButton,
            (isLoading || !name.trim()) && styles.submitButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={isLoading || !name.trim()}
        >
          <Text style={styles.submitButtonText}>
            {isLoading
              ? t("teamsAdmin.settings.saving")
              : t("teamsAdmin.settings.saveButton")}
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
    maxHeight: "80%",
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
  required: {
    color: "#DC2626",
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
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  counterText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    textAlign: "right",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});
