import React, { useState } from 'react'
import { View, Text, Image, Pressable, StyleSheet, Alert, Platform } from 'react-native'
import { useAuth } from '@/contexts/AuthProvider'

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName: string
  onAvatarChange: (newAvatarUrl: string | null) => void
  disabled?: boolean
}

/**
 * プロフィール画像アップロードコンポーネント
 */
export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatarUrl,
  userName,
  onAvatarChange,
  disabled = false,
}) => {
  const { supabase, user } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleImageSelect = async () => {
    if (!user || disabled || isUploading) return

    if (Platform.OS === 'web') {
      // Web版: input要素を使用
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        // ファイルバリデーション
        if (!file.type.startsWith('image/')) {
          setError('画像ファイルを選択してください')
          return
        }
        if (file.size > 5 * 1024 * 1024) {
          setError('画像サイズは5MB以下にしてください')
          return
        }

        await uploadImage(file)
      }
      input.click()
    } else {
      // ネイティブ版: expo-image-pickerを使用（後で実装）
      Alert.alert('画像選択', '画像選択機能は実装予定です')
    }
  }

  const uploadImage = async (file: File | Blob) => {
    if (!user) return

    setIsUploading(true)
    setError(null)

    try {
      // ユーザーフォルダのパス: avatars/{userId}/
      const userFolderPath = `avatars/${user.id}`

      // 既存画像の削除
      try {
        const { data: files } = await supabase.storage
          .from('profile-images')
          .list(userFolderPath)

        if (files && files.length > 0) {
          const filePathsToDelete = files.map((f) => `${userFolderPath}/${f.name}`)
          await supabase.storage.from('profile-images').remove(filePathsToDelete)
        }
      } catch (deleteErr) {
        console.warn('既存画像の削除に失敗:', deleteErr)
        // エラーが発生しても続行
      }

      // ファイル名を生成
      const resolveExtension = (blob: File | Blob): string => {
        if (blob instanceof File && blob.name) {
          const extFromName = blob.name.split('.').pop()
          if (extFromName) return extFromName
        }
        if (blob.type) {
          const mimeParts = blob.type.split('/')
          if (mimeParts.length === 2 && mimeParts[1]) {
            return mimeParts[1]
          }
        }
        return 'jpg'
      }

      const fileExt = resolveExtension(file)
      const fileName = `${Date.now()}.${fileExt}`
      const filePath = `${userFolderPath}/${fileName}`

      // Supabase Storageにアップロード
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // 公開URLを取得
      const { data } = supabase.storage.from('profile-images').getPublicUrl(filePath)
      const publicUrl = data?.publicUrl
      if (publicUrl) {
        onAvatarChange(publicUrl)
      } else {
        console.warn('公開URLの取得に失敗しました')
      }
    } catch (err) {
      console.error('アップロードエラー:', err)
      const errorMessage = err instanceof Error ? err.message : '画像のアップロードに失敗しました'
      setError(errorMessage)
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!user || disabled || isUploading) return

    const confirmed =
      Platform.OS === 'web'
        ? window.confirm('プロフィール画像を削除しますか？')
        : await new Promise<boolean>((resolve) => {
            Alert.alert('削除確認', 'プロフィール画像を削除しますか？', [
              { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
              { text: '削除', style: 'destructive', onPress: () => resolve(true) },
            ])
          })

    if (!confirmed) return

    try {
      const userFolderPath = `avatars/${user.id}`

      const { data: files } = await supabase.storage
        .from('profile-images')
        .list(userFolderPath)

      if (files && files.length > 0) {
        const filePathsToDelete = files.map((f) => `${userFolderPath}/${f.name}`)
        await supabase.storage.from('profile-images').remove(filePathsToDelete)
      }

      onAvatarChange(null)
    } catch (err) {
      console.error('画像削除エラー:', err)
      const errorMessage = err instanceof Error ? err.message : '画像の削除に失敗しました'
      setError(errorMessage)
      if (Platform.OS === 'web') {
        window.alert(errorMessage)
      } else {
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.avatarContainer, (disabled || isUploading) && styles.avatarContainerDisabled]}
        onPress={handleImageSelect}
        disabled={disabled || isUploading}
      >
        {currentAvatarUrl ? (
          <Image
            source={{ uri: currentAvatarUrl }}
            style={styles.avatarImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{userName.charAt(0) || '?'}</Text>
          </View>
        )}

        {/* アップロード中インジケーター */}
        {isUploading && (
          <View style={styles.uploadingOverlay}>
            <Text style={styles.uploadingText}>アップロード中...</Text>
          </View>
        )}

        {/* カメラアイコン */}
        {!isUploading && !disabled && (
          <View style={styles.cameraIcon}>
            <Text style={styles.cameraIconText}>📷</Text>
          </View>
        )}
      </Pressable>

      {/* 削除ボタン */}
      {currentAvatarUrl && !isUploading && !disabled && (
        <Pressable style={styles.deleteButton} onPress={handleRemoveAvatar}>
          <Text style={styles.deleteButtonText}>削除</Text>
        </Pressable>
      )}

      {/* エラー表示 */}
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarContainerDisabled: {
    opacity: 0.5,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  cameraIconText: {
    fontSize: 16,
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
  },
})
