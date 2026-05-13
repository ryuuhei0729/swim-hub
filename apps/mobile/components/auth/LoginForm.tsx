import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@/contexts/AuthProvider";
import type { AuthStackParamList } from "@/navigation/types";

type AuthError = {
  status?: number;
  message?: string;
  error_description?: string;
  error?: string;
};

/**
 * Supabase 等から返る AuthError を i18n キー経由でユーザー向け文言にマップする。
 * pure function に保ち、UI から t を渡すことでテスト・shared 化を阻害しない。
 */
function formatAuthError(t: TFunction, err: unknown): string {
  const errorObj: AuthError = err && typeof err === "object" ? (err as AuthError) : {};
  const status = typeof errorObj.status === "number" ? errorObj.status : undefined;
  const statusText = status ? ` [status: ${status}]` : "";
  const rawMsg =
    (typeof errorObj.message === "string" ? errorObj.message : null) ||
    (typeof errorObj.error_description === "string" ? errorObj.error_description : null) ||
    (typeof errorObj.error === "string" ? errorObj.error : null) ||
    "";
  const msg = rawMsg.toLowerCase();

  if (msg.includes("invalid") && (msg.includes("credentials") || msg.includes("email"))) {
    return t("auth.errors.invalidCredentials");
  }
  if (msg.includes("email not confirmed")) {
    return t("auth.errors.invalidCredentials");
  }
  if (msg.includes("too many requests")) {
    return t("auth.errors.tooManyRequests");
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
    ? `${t("auth.errorMap.loginFailed")} (${rawMsg}${statusText})`
    : t("auth.errorMap.loginFailed");
}

interface LoginFormProps {
  onSuccess?: () => void;
  /** ナビゲーション外で使用する場合に指定。指定時はuseNavigationを呼ばない */
  onResetPassword?: () => void;
}

/**
 * ナビゲーションコンテキスト内で使用するLoginForm（useNavigationを使用）
 */
const LoginFormWithNavigation: React.FC<Pick<LoginFormProps, "onSuccess">> = ({ onSuccess }) => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  return (
    <LoginFormContent
      onSuccess={onSuccess}
      onResetPassword={() => navigation.navigate("ResetPassword")}
    />
  );
};

interface LoginFormContentProps {
  onSuccess?: () => void;
  onResetPassword: (() => void) | null;
}

const LoginFormContent: React.FC<LoginFormContentProps> = ({ onSuccess, onResetPassword }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuth();
  const { t } = useTranslation();

  const validateForm = (): boolean => {
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

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setError(formatAuthError(t, error));
      } else {
        onSuccess?.();
      }
    } catch {
      setError(t("auth.errors.unexpected"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
      <View style={styles.formContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("auth.signin.emailMethodTitle")}</Text>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
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
              placeholder={t("auth.fields.password")}
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              editable={!loading}
            />
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={t("auth.signin.title")}
            accessibilityState={{ disabled: loading }}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.signin.title")}</Text>
            )}
          </Pressable>

          {onResetPassword && (
            <Pressable
              style={styles.linkContainer}
              onPress={onResetPassword}
              accessibilityRole="button"
              accessibilityLabel={t("auth.forgotPassword")}
            >
              <Text style={styles.linkText}>{t("auth.forgotPassword")}</Text>
            </Pressable>
          )}
        </View>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
};

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
  linkContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "500",
  },
});

/**
 * ログインフォーム
 * - onResetPassword未指定: ナビゲーション内で使用（useNavigationでResetPasswordに遷移）
 * - onResetPassword指定: ナビゲーション外で使用（AuthGuardなど）
 */
export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onResetPassword }) => {
  if (onResetPassword !== undefined) {
    return <LoginFormContent onSuccess={onSuccess} onResetPassword={onResetPassword} />;
  }
  return <LoginFormWithNavigation onSuccess={onSuccess} />;
};
