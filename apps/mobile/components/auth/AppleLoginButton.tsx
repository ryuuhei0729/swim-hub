/**
 * Appleログインボタンコンポーネント
 * Apple公式デザインガイドラインに準拠した黒いボタン
 * iOSでのみ表示
 */
import React from 'react'
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Platform,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'

interface AppleLoginButtonProps {
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  label?: string
}

const AppleLogo: React.FC = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24">
    <Path
      fill="#FFFFFF"
      d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
    />
  </Svg>
)

export const AppleLoginButton: React.FC<AppleLoginButtonProps> = ({
  onPress,
  loading = false,
  disabled = false,
  label = 'Appleでログイン',
}) => {
  // iOSのみ表示
  if (Platform.OS !== 'ios') {
    return null
  }

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
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <View style={styles.content}>
          <AppleLogo />
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
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    backgroundColor: '#333333',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
})
