import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'

const DUMMY_EMAIL_DOMAIN = '@ryuhei.love'

export const EmailChangeSettings: React.FC = () => {
  const { supabase, user } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const currentEmail = user?.email || ''
  const isDummyEmail = currentEmail.endsWith(DUMMY_EMAIL_DOMAIN)

  const openModal = () => {
    setNewEmail('')
    setError(null)
    setSuccess(false)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const handleSubmit = async () => {
    const trimmed = newEmail.trim()
    if (!trimmed || loading) return

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('有効なメールアドレスを入力してください')
      return
    }

    if (trimmed === currentEmail) {
      setError('現在と同じメールアドレスです')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        email: trimmed,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
      setNewEmail('')
    } catch (err) {
      console.error('メールアドレス変更エラー:', err)
      setError('メールアドレスの変更に失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* セクション: ボタンのみ表示 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>メールアドレス</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.emailInfo}>
            {isDummyEmail ? (
              <Text style={styles.emailTextMuted}>メールアドレス未登録</Text>
            ) : (
              <Text style={styles.emailText}>{currentEmail}</Text>
            )}
          </View>
          <Pressable
            style={styles.changeButton}
            onPress={openModal}
            accessibilityRole="button"
            accessibilityLabel={isDummyEmail ? 'メールアドレスを登録' : 'メールアドレスを変更'}
          >
            <Text style={styles.changeButtonText}>
              {isDummyEmail ? '登録する' : '変更する'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* モーダル */}
      <Modal
        visible={isModalOpen}
        animationType="fade"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {isDummyEmail ? 'メールアドレス登録' : 'メールアドレス変更'}
            </Text>

            {!isDummyEmail && (
              <Text style={styles.currentEmailLabel}>
                現在のメールアドレス: <Text style={styles.currentEmailValue}>{currentEmail}</Text>
              </Text>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {success && (
              <View style={styles.successContainer}>
                <Text style={styles.successText}>
                  確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。
                </Text>
              </View>
            )}

            {!success ? (
              <>
                <Text style={styles.label}>
                  {isDummyEmail ? '登録するメールアドレス' : '新しいメールアドレス'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={newEmail}
                  onChangeText={(text) => {
                    setNewEmail(text)
                    setError(null)
                  }}
                  placeholder="example@gmail.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={closeModal}
                    accessibilityRole="button"
                    accessibilityLabel="キャンセル"
                  >
                    <Text style={styles.cancelButtonText}>キャンセル</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.submitButton,
                      (!newEmail.trim() || loading) && styles.submitButtonDisabled,
                    ]}
                    onPress={handleSubmit}
                    disabled={!newEmail.trim() || loading}
                    accessibilityRole="button"
                    accessibilityLabel={isDummyEmail ? '登録する' : '変更する'}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>
                        {isDummyEmail ? '登録する' : '変更する'}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.buttonRow}>
                <Pressable
                  style={styles.cancelButton}
                  onPress={closeModal}
                  accessibilityRole="button"
                  accessibilityLabel="閉じる"
                >
                  <Text style={styles.cancelButtonText}>閉じる</Text>
                </Pressable>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emailInfo: {
    flex: 1,
    marginRight: 12,
  },
  emailText: {
    fontSize: 14,
    color: '#374151',
  },
  emailTextMuted: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  changeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  changeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  // モーダル
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  currentEmailLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  currentEmailValue: {
    fontWeight: '500',
    color: '#374151',
  },
  errorContainer: {
    marginBottom: 16,
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
  successContainer: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
  },
  successText: {
    fontSize: 14,
    color: '#16A34A',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
})
