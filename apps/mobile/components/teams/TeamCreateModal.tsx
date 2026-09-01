import React, { useState } from "react";
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
import { useCreateTeamMutation } from "@apps/shared/hooks/queries/teams";
import type { TeamInsert } from "@swim-hub/shared/types";

interface TeamCreateModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (teamId: string) => void;
}

// web TeamCreateForm.tsx と同一の上限（チーム名50 / 説明200）
const NAME_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * チーム作成モーダルコンポーネント
 * web TeamCreateForm.tsx 準拠: 文字数上限 + カウンター + 未保存クローズ確認
 */
export const TeamCreateModal: React.FC<TeamCreateModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const { supabase, user } = useAuth();
  const createTeamMutation = useCreateTeamMutation(supabase);
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isLoading = createTeamMutation.isPending;
  const hasUnsavedChanges =
    name.trim().length > 0 || description.trim().length > 0;

  const cleanupAndClose = () => {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  };

  const handleClose = () => {
    if (isLoading) return;

    // 入力途中の場合は破棄確認（web TeamCreateForm の未保存確認と同挙動）
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

  const handleSubmit = async () => {
    if (!user) {
      setError(t("teams.mobile.loginRequired"));
      return;
    }

    if (!name.trim()) {
      setError(t("teams.mobile.nameRequired"));
      return;
    }

    if (name.length > NAME_MAX_LENGTH) {
      setError(t("forms.teamCreate.nameTooLong"));
      return;
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
      setError(t("forms.teamCreate.descTooLong"));
      return;
    }

    setError(null);

    try {
      const teamData: TeamInsert = {
        name: name.trim(),
        description: description.trim() || null,
      };

      const newTeam = await createTeamMutation.mutateAsync(teamData);

      if (onSuccess) {
        onSuccess(newTeam.id);
      }

      cleanupAndClose();
    } catch (err) {
      console.error("チーム作成エラー:", err);
      let errorMessage = t("teams.mobile.createFailed");
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (err && typeof err === "object" && "message" in err) {
        errorMessage = String(err.message);
      }
      setError(errorMessage);
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
        <Text style={styles.title}>{t("teams.mobile.createTitle")}</Text>
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
          <Text style={styles.label}>{t("teams.mobile.nameLabel")}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("teams.mobile.namePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={NAME_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("forms.teamCreate.nameCounter", { current: name.length })}
          </Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>{t("teams.mobile.descriptionLabel")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder={t("teams.mobile.descriptionPlaceholder")}
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            maxLength={DESCRIPTION_MAX_LENGTH}
            editable={!isLoading}
          />
          <Text style={styles.counterText}>
            {t("forms.teamCreate.descCounter", { current: description.length })}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
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
            isLoading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isLoading || !name.trim()}
        >
          <Text style={styles.submitButtonText}>
            {isLoading
              ? t("teams.mobile.creating")
              : t("teams.mobile.createButton")}
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
