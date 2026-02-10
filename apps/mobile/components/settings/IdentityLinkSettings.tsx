import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as AppleAuthentication from 'expo-apple-authentication'
import Svg, { Path } from 'react-native-svg'
import { useAuth } from '@/contexts/AuthProvider'
import { getRedirectUri, extractTokensFromUrl } from '@/lib/google-auth'
import { localizeSupabaseAuthError } from '@/utils/authErrorLocalizer'
import type { UserIdentity } from '@supabase/supabase-js'

WebBrowser.maybeCompleteAuthSession()

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
)

const AppleIcon: React.FC = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path
      fill="#000000"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </Svg>
)

interface ProviderConfig {
  id: string
  name: string
  icon: React.ReactNode
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'google', name: 'Google', icon: <GoogleIcon /> },
  ...(Platform.OS === 'ios'
    ? [{ id: 'apple', name: 'Apple', icon: <AppleIcon /> }]
    : []),
]

export const IdentityLinkSettings: React.FC = () => {
  const { supabase } = useAuth()
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchIdentities = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error: fetchError } = await supabase.auth.getUserIdentities()
      if (fetchError) {
        setError(fetchError.message)
        return
      }
      setIdentities(data?.identities ?? [])
    } catch {
      setError('連携情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchIdentities()
  }, [fetchIdentities])

  const getProviderIdentity = (provider: string): UserIdentity | null => {
    return identities.find((i) => i.provider === provider) ?? null
  }

  const getProviderEmail = (identity: UserIdentity | null): string | null => {
    if (!identity) return null
    return (identity.identity_data?.email as string) ?? null
  }

  const canUnlink = identities.length > 1

  const handleLinkGoogle = async () => {
    if (!supabase) return
    setActionLoading('google')
    setError(null)
    try {
      const redirectUri = getRedirectUri()
      const { data, error: linkError } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      })

      if (linkError) {
        setError(localizeSupabaseAuthError(linkError))
        return
      }

      if (!data.url) {
        setError('OAuth URLの生成に失敗しました')
        return
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri)

      if (result.type === 'success' && result.url) {
        const tokens = extractTokensFromUrl(result.url)
        if (tokens.error) {
          setError(tokens.error)
          return
        }
        if (tokens.accessToken && tokens.refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
          })
          if (sessionError) {
            setError(localizeSupabaseAuthError(sessionError))
            return
          }
          await fetchIdentities()
        } else {
          setError('認証トークンが取得できませんでした')
        }
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // ユーザーがキャンセル：エラー表示不要
      }
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : '不明なエラーが発生しました'
      setError(localizeSupabaseAuthError({ message: rawMessage }))
    } finally {
      setActionLoading(null)
    }
  }

  const handleLinkApple = async () => {
    if (!supabase || Platform.OS !== 'ios') return
    setActionLoading('apple')
    setError(null)
    try {
      const isAppleAuthAvailable = await AppleAuthentication.isAvailableAsync()
      if (!isAppleAuthAvailable) {
        setError('このデバイスではApple認証を利用できません')
        return
      }

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      })

      if (!credential.identityToken) {
        setError('Apple認証トークンが取得できませんでした')
        return
      }

      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: 'apple',
        token: credential.identityToken,
      })

      if (linkError) {
        setError(localizeSupabaseAuthError(linkError))
        return
      }

      await fetchIdentities()
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === 'ERR_REQUEST_CANCELED') {
        // ユーザーがキャンセル：エラー表示不要
        return
      }
      const rawMessage = err.message || '不明なエラーが発生しました'
      setError(localizeSupabaseAuthError({ message: rawMessage }))
    } finally {
      setActionLoading(null)
    }
  }

  const handleLink = (provider: string) => {
    if (provider === 'google') {
      handleLinkGoogle()
    } else if (provider === 'apple') {
      handleLinkApple()
    }
  }

  const handleUnlink = (provider: string) => {
    if (!canUnlink) return
    const identity = getProviderIdentity(provider)
    if (!identity) return

    const providerName = PROVIDERS.find((p) => p.id === provider)?.name ?? provider

    Alert.alert(
      '連携解除',
      `${providerName}の連携を解除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(provider)
            setError(null)
            try {
              const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity)
              if (unlinkError) {
                setError(unlinkError.message)
                return
              }
              await fetchIdentities()
            } catch {
              setError('連携解除に失敗しました。再度お試しください。')
            } finally {
              setActionLoading(null)
            }
          },
        },
      ]
    )
  }

  if (loading) {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ログイン連携</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#9CA3AF" />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>ログイン連携</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {PROVIDERS.map((provider) => {
        const identity = getProviderIdentity(provider.id)
        const isLinked = !!identity
        const email = getProviderEmail(identity)
        const isLoading = actionLoading === provider.id

        return (
          <View key={provider.id} style={styles.providerRow}>
            <View style={styles.providerInfo}>
              <View style={styles.providerIcon}>{provider.icon}</View>
              <View>
                <Text style={styles.providerName}>{provider.name}</Text>
                {isLinked ? (
                  <Text style={styles.statusLinked}>
                    連携済み{email ? `（${email}）` : ''}
                  </Text>
                ) : (
                  <Text style={styles.statusUnlinked}>未連携</Text>
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
                accessibilityLabel={`${provider.name}の連携を解除`}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={styles.actionButtonText}>解除する</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionButton, isLoading && styles.actionButtonDisabled]}
                onPress={() => handleLink(provider.id)}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel={`${provider.name}と連携`}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <Text style={styles.actionButtonText}>連携する</Text>
                )}
              </Pressable>
            )}
          </View>
        )
      })}

      {!canUnlink && identities.length > 0 && (
        <Text style={styles.noteText}>
          ※ 最低1つのログイン方法が必要なため、すべての連携を解除することはできません
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  errorContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#DC2626',
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  providerIcon: {
    width: 24,
    alignItems: 'center',
  },
  providerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  statusLinked: {
    fontSize: 12,
    color: '#16A34A',
    marginTop: 2,
  },
  statusUnlinked: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    minWidth: 72,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  noteText: {
    marginTop: 12,
    fontSize: 12,
    color: '#9CA3AF',
  },
})
