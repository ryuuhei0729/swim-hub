/**
 * Googleログインボタンコンポーネント
 */
import React from 'react'
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

interface GoogleLoginButtonProps {
  /** ボタン押下時のコールバック */
  onPress: () => void
  /** ローディング状態 */
  loading?: boolean
  /** 無効状態 */
  disabled?: boolean
  /** ボタンラベル */
  label?: string
}

/**
 * Googleロゴ
 */
const GoogleLogo: React.FC = () => (
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

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
  label = 'Googleでログイン',
}) => {
  const isDisabled = disabled || loading

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color="#374151" size="small" />
      ) : (
        <View style={styles.content}>
          <GoogleLogo />
          <Text style={styles.buttonText}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
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
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    backgroundColor: '#F3F4F6',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
})
