import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { validatePassword, type PasswordChecks } from "@/utils/validatePassword";

interface SignupFormProps {
  onSuccess?: () => void;
}

type AuthError = {
  status?: number;
  code?: string;
  message?: string;
  error_description?: string;
  error?: string;
};

function formatSignupError(t: TFunction, err: unknown): string {
  const errorObj: AuthError = err && typeof err === "object" ? (err as AuthError) : {};
  const status = typeof errorObj.status === "number" ? errorObj.status : undefined;
  const statusText = status ? ` [status: ${status}]` : "";
  const rawMsg =
    (typeof errorObj.message === "string" ? errorObj.message : null) ||
    (typeof errorObj.error_description === "string" ? errorObj.error_description : null) ||
    (typeof errorObj.error === "string" ? errorObj.error : null) ||
    "";
  const msg = rawMsg.toLowerCase();

  // 登録済みメールアドレス: AuthProvider 側で identities=[] を検出して error 化している
  if (
    errorObj.code === "user_already_exists" ||
    msg.includes("user already registered") ||
    msg.includes("すでに登録されています")
  ) {
    return t("auth.errorMap.emailAlreadyExists");
  }
  // パスワード強度エラーの検出を拡張
  const weakPwdRegex = /\b(pass(word)?).*(weak|too short|at least|characters)\b/i;
  if (
    (msg.includes("password") && msg.includes("weak")) ||
    msg.includes("too short") ||
    (msg.includes("at least") && msg.includes("characters")) ||
    (msg.includes("minimum") && msg.includes("characters")) ||
    weakPwdRegex.test(rawMsg)
  ) {
    return t("auth.errors.weakPassword");
  }

  if (msg.includes("captcha")) {
    return t("auth.errors.captchaRequired");
  }
  if (msg.includes("rate limit") || status === 429) {
    return t("auth.errors.rateLimitExceeded");
  }
  if (msg.includes("network") || msg.includes("connection")) {
    return t("auth.errors.networkError");
  }

  return __DEV__ && rawMsg
    ? `${t("auth.errorMap.defaultError")} (${rawMsg}${statusText})`
    : t("auth.errorMap.defaultError");
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const passwordValidation = useMemo(() => validatePassword(password), [password]);

  const { signUp } = useAuth();
  const { t } = useTranslation();

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError(t("auth.validation.nameRequired"));
      return false;
    }

    if (!email.trim()) {
      setError(t("auth.validation.emailRequired"));
      return false;
    }

    // メールアドレス形式の簡易チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t("auth.errorMap.invalidEmail"));
      return false;
    }

    if (!password) {
      setError(t("auth.validation.passwordRequired"));
      return false;
    }

    const checks = passwordValidation.checks;
    if (!checks.minLength) {
      setError(t("auth.validation.passwordMinLength"));
      return false;
    }
    if (!checks.lowercase) {
      setError(t("auth.validation.passwordLowercase"));
      return false;
    }
    if (!checks.uppercase) {
      setError(t("auth.validation.passwordUppercase"));
      return false;
    }
    if (!checks.digit) {
      setError(t("auth.validation.passwordDigit"));
      return false;
    }
    if (!checks.symbol) {
      setError(t("auth.validation.passwordSymbol"));
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await signUp(email, password, name);
      if (error) {
        setError(formatSignupError(t, error));
      } else {
        setMessage(t("auth.success.emailConfirmation"));
        onSuccess?.();
      }
    } catch {
      setError(t("auth.errors.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("auth.signup.emailMethodTitle")}</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {message && (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        )}

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.fields.name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.fields.namePlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.fields.email")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.fields.emailPlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t("auth.fields.password")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("auth.fields.passwordPlaceholder")}
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!loading}
            />
            <PasswordRequirementsList checks={passwordValidation.checks} />
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t("auth.signup.submitButton")}
            accessibilityState={{ disabled: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.signup.submitButton")}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
};

function PasswordRequirementsList({ checks }: { checks: PasswordChecks }) {
  const { t } = useTranslation();
  const items: { key: keyof PasswordChecks; labelKey: string }[] = [
    { key: "minLength", labelKey: "auth.passwordRequirements.minLength" },
    { key: "lowercase", labelKey: "auth.passwordRequirements.lowercase" },
    { key: "uppercase", labelKey: "auth.passwordRequirements.uppercase" },
    { key: "digit", labelKey: "auth.passwordRequirements.digit" },
    { key: "symbol", labelKey: "auth.passwordRequirements.symbol" },
  ];
  return (
    <View style={styles.requirements}>
      <Text style={styles.requirementsTitle}>{t("auth.passwordRequirements.title")}</Text>
      {items.map(({ key, labelKey }) => {
        const met = checks[key];
        return (
          <View key={key} style={styles.requirementRow}>
            <Ionicons
              name={met ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={met ? "#10B981" : "#9CA3AF"}
            />
            <Text style={[styles.requirementText, met && styles.requirementTextMet]}>
              {t(labelKey)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#EFF6FF",
  },
  formContainer: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  header: {
    marginBottom: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    lineHeight: 20,
  },
  messageContainer: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  messageText: {
    color: "#16A34A",
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
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
  passwordHint: {
    fontSize: 12,
    color: "#F59E0B",
    marginTop: 4,
  },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  requirements: {
    marginTop: 8,
    gap: 4,
  },
  requirementsTitle: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
    marginBottom: 2,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  requirementText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  requirementTextMet: {
    color: "#10B981",
  },
});
