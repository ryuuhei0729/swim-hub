import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { BirthdayInput } from "@/components/ui/BirthdayInput";
import type { UserProfile } from "@swim-hub/shared/types";

interface OnboardingProfileProps {
  initialProfile: Partial<UserProfile> | null;
  onNext: (updates: Partial<UserProfile>) => Promise<void>;
  onBack: () => void;
}

/**
 * メールアドレス形式かどうかを判定
 * name フィールドが email 由来の場合はスキップ不可
 */
function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * オンボーディング Step 2: プロフィール補完フォーム
 * name が email 形式の場合のみスキップ不可 (ProfileEditModal のロジックを参照)
 */
export const OnboardingProfile: React.FC<OnboardingProfileProps> = ({
  initialProfile,
  onNext,
  onBack,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    birthday: "",
    bio: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const nameIsEmail = isEmailFormat(formData.name.trim());
  const canSkip = !nameIsEmail;

  // initialProfile からフォーム初期値をセット
  useEffect(() => {
    if (initialProfile) {
      const birthdayStr =
        initialProfile.birthday && initialProfile.birthday.length >= 10
          ? initialProfile.birthday.substring(0, 10)
          : "";
      setFormData({
        name: initialProfile.name || "",
        birthday: birthdayStr,
        bio: initialProfile.bio || "",
      });
    }
  }, [initialProfile]);

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("名前は必須です");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // DB の birthday は date 型なので YYYY-MM-DD を直接送る
      const birthday = formData.birthday || null;
      await onNext({
        name: formData.name.trim(),
        birthday,
        bio: formData.bio.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!canSkip) return;
    setIsSaving(true);
    setError(null);
    try {
      // スキップ時は更新なしで次のステップへ
      await onNext({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "スキップに失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
      <View style={styles.header}>
        <Text style={styles.title}>プロフィールを設定しよう</Text>
        <Text style={styles.subtitle}>他のメンバーに表示される情報です</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 名前 */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>
          名前 <Text style={styles.required}>*</Text>
        </Text>
        {nameIsEmail && (
          <Text style={styles.hint}>
            メールアドレス形式のため、表示名の変更が必要です
          </Text>
        )}
        <TextInput
          style={[styles.input, nameIsEmail && styles.inputHighlight]}
          value={formData.name}
          onChangeText={(text) => {
            setFormData((prev) => ({ ...prev, name: text }));
            setError(null);
          }}
          placeholder="例: 山田 太郎"
          placeholderTextColor="#9CA3AF"
          editable={!isSaving}
          autoCapitalize="words"
        />
      </View>

      {/* 生年月日 */}
      <BirthdayInput
        label="生年月日（任意）"
        value={formData.birthday}
        onChange={(date) => setFormData((prev) => ({ ...prev, birthday: date }))}
        disabled={isSaving}
      />

      {/* 自己紹介 */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>自己紹介（任意）</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={formData.bio}
          onChangeText={(text) => setFormData((prev) => ({ ...prev, bio: text }))}
          placeholder="得意な種目や目標などを書いてみよう"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          maxLength={500}
          textAlignVertical="top"
          editable={!isSaving}
        />
        <Text style={styles.charCount}>{formData.bio.length}/500文字</Text>
      </View>

      {/* ボタン */}
      <View style={styles.buttonRow}>
        <Pressable
          style={styles.backButton}
          onPress={onBack}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel="戻る"
        >
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>

        <View style={styles.rightButtons}>
          {canSkip && (
            <Pressable
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="スキップ"
            >
              <Text style={styles.skipButtonText}>スキップ</Text>
            </Pressable>
          )}
          <Pressable
            style={[
              styles.nextButton,
              (isSaving || !formData.name.trim()) && styles.nextButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSaving || !formData.name.trim()}
            accessibilityRole="button"
            accessibilityLabel="次へ"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.nextButtonText}>次へ</Text>
            )}
          </Pressable>
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    gap: 20,
    paddingBottom: 16,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
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
  formGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  required: {
    color: "#DC2626",
  },
  hint: {
    fontSize: 12,
    color: "#D97706",
    backgroundColor: "#FFFBEB",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  inputHighlight: {
    borderColor: "#F59E0B",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  charCount: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "right",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  rightButtons: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#374151",
  },
  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  nextButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    minWidth: 80,
    alignItems: "center",
  },
  nextButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
