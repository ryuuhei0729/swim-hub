import React, { useState, useEffect } from "react";
import { View, Text, Modal, Pressable, TextInput, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { AvatarUpload } from "./AvatarUpload";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import { GenderToggle } from "@/components/ui/GenderToggle";
import { useAuth } from "@/contexts/AuthProvider";
import type { UserProfile } from "@swim-hub/shared/types";
import { uploadProfileImageViaApi } from "@/utils/imageUpload";

interface ProfileEditModalProps {
  visible: boolean;
  onClose: () => void;
  profile: Partial<UserProfile>;
  onUpdate: (updatedProfile: Partial<UserProfile>) => Promise<void>;
  onAvatarChange: (newAvatarUrl: string | null) => Promise<void>;
}

/**
 * プロフィール編集モーダルコンポーネント
 */
export const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  visible,
  onClose,
  profile,
  onUpdate,
  onAvatarChange,
}) => {
  const { t } = useTranslation();
  const { user, getAccessToken } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    birthday: "",
    bio: "",
    gender: 0,
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageData, setSelectedImageData] = useState<{
    base64: string;
    fileExtension: string;
  } | null>(null);

  // プロフィールが変更されたときにフォームデータを更新
  useEffect(() => {
    if (profile) {
      const birthdayStr =
        profile.birthday && profile.birthday.length >= 10 ? profile.birthday.substring(0, 10) : "";
      setFormData({
        name: profile.name || "",
        birthday: birthdayStr,
        bio: profile.bio || "",
        gender: profile.gender !== undefined ? profile.gender : 0,
      });
    }
    setError(null);
  }, [profile, visible]);

  const handleClose = () => {
    if (isUpdating) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError(t("mypage.profileEdit.nameRequired"));
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      // 選択した画像がある場合はアップロード
      if (selectedImageData && user) {
        try {
          const accessToken = await getAccessToken();
          if (!accessToken) {
            throw new Error(t("common.upload.sessionInvalid"));
          }

          const { path } = await uploadProfileImageViaApi(
            {
              base64: selectedImageData.base64,
              fileExtension: selectedImageData.fileExtension || "jpg",
            },
            accessToken,
          );

          // profile-images は private バケットのため、公開URLではなく
          // バケット内相対パスをDBに保存する（表示時は署名付きURLを解決する。Issue #36）
          await onAvatarChange(path);
        } catch (err) {
          console.error("画像アップロードエラー:", err);
          const errorMessage =
            err instanceof Error ? err.message : t("mypage.profileEdit.imageUploadFailed");
          throw new Error(errorMessage);
        }
      }

      // DB の birthday は date 型。YYYY-MM-DD のまま送る
      const birthday = formData.birthday || null;

      await onUpdate({
        name: formData.name.trim(),
        birthday,
        bio: formData.bio.trim() || null,
        gender: formData.gender,
      });

      // 成功時は即時にモーダルを閉じる
      setSelectedImageData(null);
      handleClose();
    } catch (err) {
      console.error("プロフィール更新エラー:", err);
      setError(t("mypage.profileEdit.updateFailed"));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("mypage.profileEdit.title")}</Text>
            <Pressable style={styles.closeButton} onPress={handleClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* アバター */}
            <View style={styles.avatarSection}>
              <AvatarUpload
                currentAvatarUrl={profile.profile_image_path ?? null}
                userName={formData.name || profile.name || ""}
                onAvatarChange={onAvatarChange}
                onImageSelected={(imageUri, base64Data, fileExtension) => {
                  setSelectedImageData({ base64: base64Data, fileExtension });
                }}
                disabled={isUpdating}
              />
            </View>

            {/* 名前 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t("mypage.profileEdit.nameLabel")}{" "}
                <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => {
                  setFormData((prev) => ({ ...prev, name: text }));
                  setError(null);
                }}
                placeholder={t("mypage.profileEdit.namePlaceholder")}
                placeholderTextColor="#9CA3AF"
                editable={!isUpdating}
              />
            </View>

            {/* 性別 */}
            <GenderToggle
              value={formData.gender}
              onChange={(gender) => {
                setFormData((prev) => ({ ...prev, gender }));
                setError(null);
              }}
              disabled={isUpdating}
            />

            {/* 生年月日 */}
            <BirthdayInput
              label={t("mypage.profileEdit.birthdayLabel")}
              value={formData.birthday}
              onChange={(date) => {
                setFormData((prev) => ({ ...prev, birthday: date }));
                setError(null);
              }}
              disabled={isUpdating}
            />

            {/* 自己紹介 */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>{t("mypage.profileEdit.bioLabel")}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.bio}
                onChangeText={(text) => {
                  setFormData((prev) => ({ ...prev, bio: text }));
                  setError(null);
                }}
                placeholder={t("mypage.profileEdit.bioPlaceholder")}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                maxLength={500}
                textAlignVertical="top"
                editable={!isUpdating}
              />
              <Text style={styles.charCount}>
                {t("mypage.profileEdit.bioCount", { count: formData.bio.length })}
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={isUpdating}
            >
              <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                styles.submitButton,
                isUpdating && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isUpdating || !formData.name.trim()}
            >
              <Text style={styles.submitButtonText}>
                {isUpdating
                  ? t("mypage.profileEdit.submitUpdating")
                  : t("mypage.profileEdit.submit")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    width: "100%",
    maxWidth: 600,
    maxHeight: "90%",
    flexDirection: "column",
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
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  bodyContent: {
    padding: 20,
    gap: 20,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
  avatarSection: {
    alignItems: "center",
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
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
    minHeight: 120,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: "#6B7280",
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
