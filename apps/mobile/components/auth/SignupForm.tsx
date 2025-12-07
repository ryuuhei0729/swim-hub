import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'

interface SignupFormProps {
  onSuccess?: () => void
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSuccess }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { signUp } = useAuth()

  type AuthError = {
    status?: number
    message?: string
    error_description?: string
    error?: string
  }

  const formatAuthError = (err: unknown): string => {
    const errorObj: AuthError =
      err && typeof err === 'object' ? (err as AuthError) : {}
    const status = typeof errorObj.status === 'number' ? errorObj.status : undefined
    const statusText = status ? ` [status: ${status}]` : ''
    const errMsg =
      (typeof errorObj.message === 'string' ? errorObj.message : null) ||
      (typeof errorObj.error_description === 'string' ? errorObj.error_description : null) ||
      (typeof errorObj.error === 'string' ? errorObj.error : null) ||
      '不明なエラーが発生しました。'

    // エラーメッセージの日本語化と補足ヒント
    if (typeof errMsg === 'string') {
      const msg = errMsg.toLowerCase()
      
      // サインアップエラーの処理（OWASP準拠）
      if (msg.includes('user already registered')) {
        return 'アカウントの作成に失敗しました。入力内容を確認してから再度お試しください。'
      }
      // パスワード強度エラーの検出を拡張
      const weakPwdRegex = /\b(pass(word)?).*(weak|too short|at least|characters)\b/i
      if (
        msg.includes('password') && msg.includes('weak') ||
        msg.includes('too short') ||
        (msg.includes('at least') && msg.includes('characters')) ||
        (msg.includes('minimum') && msg.includes('characters')) ||
        weakPwdRegex.test(errMsg)
      ) {
        return 'パスワードが弱すぎます。より強力なパスワードを設定してください。'
      }
      
      // 共通エラーの処理
      if (msg.includes('captcha')) {
        return 'Captcha認証が必要です。Captchaを完了してから再度お試しください。'
      }
      if (msg.includes('rate limit') || status === 429) {
        return 'リクエスト制限に達しました。しばらく時間をおいてから再度お試しください。'
      }
      if (msg.includes('network') || msg.includes('connection')) {
        return 'ネットワークエラーが発生しました。インターネット接続を確認してから再度お試しください。'
      }
    }
    
    // デフォルトのエラーメッセージ
    return process.env.NODE_ENV === 'development'
      ? `エラーが発生しました: ${errMsg}${statusText}`
      : 'エラーが発生しました。時間をおいて再度お試しください。'
  }

  const validateForm = (): boolean => {
    if (!name.trim()) {
      setError('名前を入力してください。')
      return false
    }
    
    if (!email.trim()) {
      setError('メールアドレスを入力してください。')
      return false
    }
    
    // メールアドレス形式の簡易チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError('有効なメールアドレスを入力してください。')
      return false
    }
    
    if (!password) {
      setError('パスワードを入力してください。')
      return false
    }
    
    // パスワード強度チェック（最小6文字、推奨8文字以上）
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください。')
      return false
    }
    
    if (password.length < 8) {
      // 警告として表示（エラーにはしない）
      // より強力なパスワードを推奨
    }
    
    return true
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await signUp(email, password, name)
      if (error) {
        setError(formatAuthError(error))
      } else {
        setMessage('確認メールを送信しました。メールを確認してアカウントを有効化してください。')
        onSuccess?.()
      }
    } catch {
      setError('予期しないエラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.formContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>アカウント作成</Text>
          <Text style={styles.subtitle}>新しいアカウントを作成</Text>
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
            <Text style={styles.label}>名前</Text>
            <TextInput
              style={styles.input}
              placeholder="山田太郎"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              textContentType="name"
              editable={!loading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>メールアドレス</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
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
            <Text style={styles.label}>パスワード</Text>
            <TextInput
              style={styles.input}
              placeholder="パスワード（6文字以上）"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              editable={!loading}
            />
            {password.length > 0 && password.length < 8 && (
              <Text style={styles.passwordHint}>
                より強力なパスワードにするため、8文字以上を推奨します。
              </Text>
            )}
          </View>

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>アカウント作成</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#EFF6FF',
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
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
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
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
  messageContainer: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  messageText: {
    color: '#16A34A',
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
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  passwordHint: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
})
