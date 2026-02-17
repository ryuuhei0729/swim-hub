import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Feather } from '@expo/vector-icons'
import { useGoogleAuth } from '@/hooks/useGoogleAuth'
import { useAppleAuth } from '@/hooks/useAppleAuth'
import { AppleLoginButton } from '@/components/auth/AppleLoginButton'
import { GoogleLoginButton } from '@/components/auth/GoogleLoginButton'
import type { AuthStackParamList } from '@/navigation/types'

export const GetStartedScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>()
  const { signInWithGoogle, loading: googleLoading, error: googleError, clearError: clearGoogleError } = useGoogleAuth()
  const { signInWithApple, loading: appleLoading, error: appleError, clearError: clearAppleError, isAvailable: isAppleAvailable } = useAppleAuth()
  const [error, setError] = useState<string | null>(null)

  const isLoading = googleLoading || appleLoading

  const handleAppleSignup = async () => {
    if (appleLoading) return
    setError(null)
    clearAppleError()
    await signInWithApple()
  }

  const handleGoogleSignup = async () => {
    if (googleLoading) return
    setError(null)
    clearGoogleError()
    await signInWithGoogle()
  }

  const displayError = error || googleError || appleError

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
        >
          <Feather name="arrow-left" size={24} color="#111827" />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>アカウント作成</Text>
          <Text style={styles.subtitle}>SwimHubを始めましょう</Text>
        </View>

        {displayError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{displayError}</Text>
          </View>
        )}

        <View style={styles.buttonGroup}>
          {/* Appleで作成（iOSのみ） */}
          {isAppleAvailable && (
            <AppleLoginButton
              onPress={handleAppleSignup}
              loading={appleLoading}
              disabled={isLoading}
              label="Appleで作成"
            />
          )}

          {/* Googleで作成 */}
          <GoogleLoginButton
            onPress={handleGoogleSignup}
            loading={googleLoading}
            disabled={isLoading}
            label="Googleで作成"
          />

          {/* Emailで作成 */}
          <Pressable
            style={({ pressed }) => [
              styles.emailButton,
              isLoading && styles.buttonDisabled,
              pressed && !isLoading && styles.emailButtonPressed,
            ]}
            onPress={() => navigation.navigate('EmailSignup')}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Emailで作成"
          >
            {isLoading ? (
              <ActivityIndicator color="#374151" size="small" />
            ) : (
              <View style={styles.emailButtonContent}>
                <Feather name="mail" size={20} color="#374151" />
                <Text style={styles.emailButtonText}>Emailで作成</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* 利用規約・プライバシーポリシー */}
      <View style={styles.legalContainer}>
        <Text style={styles.legalText}>
          続行することで、
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://swim-hub.app/terms')}
          >
            利用規約
          </Text>
          と
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://swim-hub.app/privacy')}
          >
            プライバシーポリシー
          </Text>
          に同意したものとみなされます。
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
  },
  buttonGroup: {
    gap: 12,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    minHeight: 48,
  },
  emailButtonPressed: {
    backgroundColor: '#F3F4F6',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  emailButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  legalContainer: {
    paddingHorizontal: 32,
    paddingBottom: 16,
    alignItems: 'center',
  },
  legalText: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  legalLink: {
    color: '#2563EB',
    fontWeight: '500',
  },
})
