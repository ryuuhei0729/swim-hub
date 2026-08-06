import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import Svg, { Path } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { claimOAuthCode } from "@ryuuhei0729/swimhub-oauth/mobile";
import { useAuth } from "@/contexts/AuthProvider";
import {
  getRedirectUri,
  extractTokensFromUrl,
  oauthSessionGuard,
  localizeOAuthErrorCode,
} from "@/lib/google-auth";
import { localizeSupabaseAuthError } from "@/utils/authErrorLocalizer";
import type { UserIdentity } from "@supabase/supabase-js";

WebBrowser.maybeCompleteAuthSession();

const GoogleIcon: React.FC = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <Path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <Path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <Path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </Svg>
);

const AppleIcon: React.FC = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path
      fill="#000000"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </Svg>
);

interface ProviderConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
}

const PROVIDERS: ProviderConfig[] = [
  { id: "google", name: "Google", icon: <GoogleIcon /> },
  ...(Platform.OS === "ios" ? [{ id: "apple", name: "Apple", icon: <AppleIcon /> }] : []),
];

export const IdentityLinkSettings: React.FC = () => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchIdentities = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error: fetchError } = await supabase.auth.getUserIdentities();
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setIdentities(data?.identities ?? []);
    } catch {
      setError(t("settings.identity.errors.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [supabase, t]);

  useEffect(() => {
    fetchIdentities();
  }, [fetchIdentities]);

  const getProviderIdentity = (provider: string): UserIdentity | null => {
    return identities.find((i) => i.provider === provider) ?? null;
  };

  const getProviderEmail = (identity: UserIdentity | null): string | null => {
    if (!identity) return null;
    return (identity.identity_data?.email as string) ?? null;
  };

  const canUnlink = identities.length > 1;

  const handleLinkGoogle = async () => {
    if (!supabase) return;
    setActionLoading("google");
    setError(null);
    try {
      const redirectUri = getRedirectUri();
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (linkError) {
        setError(localizeSupabaseAuthError(linkError));
        return;
      }

      if (!data.url) {
        setError(t("auth.mobile.oauthUrlGenerationFailed"));
        return;
      }

      oauthSessionGuard.active = true;
      let result: Awaited<ReturnType<typeof WebBrowser.openAuthSessionAsync>>;
      try {
        result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      } catch (browserErr) {
        // ブラウザ起動失敗時もガードを解除する
        oauthSessionGuard.active = false;
        throw browserErr;
      }

      if (result.type === "success" && result.url) {
        const tokens = extractTokensFromUrl(result.url);
        if (tokens.error) {
          oauthSessionGuard.active = false;
          setError(localizeOAuthErrorCode(tokens.error));
          return;
        }
        if (tokens.code) {
          // 同一 code を AuthProvider のグローバル Linking ハンドラ安全網と二重に
          // 交換しないよう claimOAuthCode (共有パッケージ) で調停する。
          const claim = claimOAuthCode(tokens.code);

          if (!claim.claimed) {
            // 他所 (AuthProvider) が既にこの code を claim 済み。無条件で成功扱い
            // にはせず、実際の交換結果を待って同期する。
            oauthSessionGuard.active = false;
            const otherResult = await claim.result;
            if (!otherResult.success) {
              setError(localizeOAuthErrorCode("code_exchange_failed"));
              return;
            }
            await fetchIdentities();
            return;
          }

          // PKCE: 認可コードを exchangeCodeForSession で交換する。
          // code_verifier が読めない/既に消費済みの場合も例外ではなく
          // AuthError として返るため、ここで通常のエラー表示に倒す。
          let exchangeError: import("@supabase/supabase-js").AuthError | null = null;
          try {
            const { error } = await supabase.auth.exchangeCodeForSession(tokens.code);
            exchangeError = error;
            claim.resolve({ success: !error });
          } catch (exchangeException) {
            claim.resolve({ success: false });
            throw exchangeException;
          } finally {
            oauthSessionGuard.active = false;
          }
          if (exchangeError) {
            setError(localizeSupabaseAuthError(exchangeError));
            return;
          }
          await fetchIdentities();
        } else if (tokens.accessToken && tokens.refreshToken) {
          // implicit フォールバック (flowType が pkce でない/フラグメント形式で返ってきた場合)
          // setSession 完了後にガードを解除する
          let sessionError: import("@supabase/supabase-js").AuthError | null = null;
          try {
            const { error } = await supabase.auth.setSession({
              access_token: tokens.accessToken,
              refresh_token: tokens.refreshToken,
            });
            sessionError = error;
          } finally {
            oauthSessionGuard.active = false;
          }
          if (sessionError) {
            setError(localizeSupabaseAuthError(sessionError));
            return;
          }
          await fetchIdentities();
        } else {
          oauthSessionGuard.active = false;
          setError(t("auth.mobile.tokensNotReceived"));
        }
      } else {
        // cancel / dismiss / その他
        oauthSessionGuard.active = false;
      }
    } catch (err) {
      // 例外時もガードが残らないよう解除する
      oauthSessionGuard.active = false;
      const rawMessage = err instanceof Error ? err.message : t("auth.mobile.unknownError");
      setError(localizeSupabaseAuthError({ message: rawMessage }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleLinkApple = async () => {
    if (!supabase || Platform.OS !== "ios") return;
    setActionLoading("apple");
    setError(null);
    try {
      const isAppleAuthAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAppleAuthAvailable) {
        setError(t("auth.mobile.appleAuthDeviceUnavailable"));
        return;
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setError(t("auth.mobile.appleTokenNotReceived"));
        return;
      }

      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "apple",
        token: credential.identityToken,
      });

      if (linkError) {
        setError(localizeSupabaseAuthError(linkError));
        return;
      }

      await fetchIdentities();
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "ERR_REQUEST_CANCELED") {
        // ユーザーがキャンセル：エラー表示不要
        return;
      }
      const rawMessage = err.message || t("auth.mobile.unknownError");
      setError(localizeSupabaseAuthError({ message: rawMessage }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleLink = (provider: string) => {
    if (provider === "google") {
      handleLinkGoogle();
    } else if (provider === "apple") {
      handleLinkApple();
    }
  };

  const handleUnlink = (provider: string) => {
    if (!canUnlink) return;
    const identity = getProviderIdentity(provider);
    if (!identity) return;

    const providerName = PROVIDERS.find((p) => p.id === provider)?.name ?? provider;

    Alert.alert(
      t("settings.identity.unlinkConfirmTitle"),
      t("settings.identity.unlinkConfirmMessage", { providerName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.identity.unlinkButton"),
          style: "destructive",
          onPress: async () => {
            setActionLoading(provider);
            setError(null);
            try {
              const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
              if (unlinkError) {
                setError(unlinkError.message);
                return;
              }
              await fetchIdentities();
            } catch {
              setError(t("settings.identity.errors.unlinkFailed"));
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t("settings.identity.title")}</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#9CA3AF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("settings.identity.title")}</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {PROVIDERS.map((provider) => {
        const identity = getProviderIdentity(provider.id);
        const isLinked = !!identity;
        const email = getProviderEmail(identity);
        const isLoading = actionLoading === provider.id;

        return (
          <View key={provider.id} style={styles.providerRow}>
            <View style={styles.providerInfo}>
              <View style={styles.providerIcon}>{provider.icon}</View>
              <View>
                <Text style={styles.providerName}>{provider.name}</Text>
                {isLinked ? (
                  <Text style={styles.statusLinked}>
                    {email
                      ? t("settings.identity.linkedWithEmail", { email })
                      : t("settings.identity.linked")}
                  </Text>
                ) : (
                  <Text style={styles.statusUnlinked}>{t("settings.identity.notLinked")}</Text>
                )}
              </View>
            </View>

            {isLinked ? (
              <Pressable
                style={[
                  styles.actionButton,
                  (!canUnlink || isLoading) && styles.actionButtonDisabled,
                ]}
                onPress={() => handleUnlink(provider.id)}
                disabled={!canUnlink || isLoading}
                accessibilityRole="button"
                accessibilityLabel={t("settings.identity.unlinkProviderAria", { providerName: provider.name })}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={styles.actionButtonText}>{t("settings.identity.unlinkButton")}</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
                onPress={() => handleLink(provider.id)}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel={t("settings.identity.linkProviderAria", { providerName: provider.name })}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={styles.actionButtonText}>{t("settings.identity.linkButton")}</Text>
                )}
              </Pressable>
            )}
          </View>
        );
      })}

      {!canUnlink && identities.length > 0 && (
        <Text style={styles.noteText}>{t("settings.identity.minOneRequired")}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 16,
  },
  errorContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
  providerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  providerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  providerIcon: {
    width: 24,
    alignItems: "center",
  },
  providerName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  statusLinked: {
    fontSize: 12,
    color: "#16A34A",
    marginTop: 2,
  },
  statusUnlinked: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    minWidth: 72,
    alignItems: "center",
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  noteText: {
    marginTop: 12,
    fontSize: 12,
    color: "#9CA3AF",
  },
});
