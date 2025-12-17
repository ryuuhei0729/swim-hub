import React, { useState } from 'react'
import { View, Text, Image, Pressable, StyleSheet, Alert, Platform} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'

interface AvatarUploadProps {
  currentAvatarUrl?: string | null
  userName: string
  onAvatarChange: (newAvatarUrl: string | null) => void
  onImageSelected?: (imageUri: string, base64Data: string, fileExtension: string) => void
  disabled?: boolean
}

/**
 * プロフィール画像アップロードコンポーネント
 */
export const AvatarUpload: React.FC<AvatarUploadProps> = ({
  currentAvatarUrl,
  userName,
  onAvatarChange,
  onImageSelected,
  disabled = false,
}) => {
  const { supabase, user } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null)

  const handleImageSelect = async () => {
    if (!user || disabled) return

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

        // 選択した画像をアバター表示エリアにプレビューとして表示
        const imageUrl = URL.createObjectURL(file)
        setSelectedImageUri(imageUrl)
        
        // 親コンポーネントに選択した画像を通知（Web版ではFileをbase64に変換）
        if (onImageSelected) {
          // Fileオブジェクトをbase64に変換
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64Data = reader.result as string
            // data:image/jpeg;base64, のプレフィックスを除去
            const base64 = base64Data.split(',')[1] || ''
            const fileExt = file.name.split('.').pop() || 'jpg'
            onImageSelected(imageUrl, base64, fileExt)
          }
          reader.onerror = () => {
            setError('画像の読み込みに失敗しました')
          }
          reader.readAsDataURL(file)
        }
      }
      input.click()
    } else {
      // ネイティブ版: expo-image-pickerを使用
      try {
        // 権限をリクエスト
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert(
            '権限が必要です',
            '画像を選択するには、フォトライブラリへのアクセス権限が必要です。',
            [{ text: 'OK' }]
          )
          return
        }

        // 画像を選択（base64データも取得）
        // WEBの実装と同様に画質を落とす（quality: 0.7 = 70%）
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7, // WEBと同様に70%に設定
          base64: true, // base64データを取得
        })

        if (result.canceled) {
          return
        }

        const asset = result.assets[0]
        if (!asset) {
          return
        }

        // ファイルサイズのチェック（5MB以下）
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert('エラー', '画像サイズは5MB以下にしてください', [{ text: 'OK' }])
          return
        }

        // base64データのチェック
        if (!asset.base64) {
          Alert.alert('エラー', '画像データの取得に失敗しました', [{ text: 'OK' }])
          return
        }

        // 選択した画像をアバター表示エリアにプレビューとして表示
        setSelectedImageUri(asset.uri)
        
        // 親コンポーネントに選択した画像を通知（base64データとURIを渡す）
        if (onImageSelected) {
          // base64データとURIを渡す（ArrayBufferへの変換は親コンポーネントで行う）
          onImageSelected(asset.uri, asset.base64, asset.uri.split('.').pop() || 'jpg')
        }
      } catch (err) {
        console.error('画像選択エラー:', err)
        const errorMessage = err instanceof Error ? err.message : '画像の選択に失敗しました'
        setError(errorMessage)
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    }
  }


  const handleRemoveAvatar = async () => {
    if (!user || disabled) return

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
      <View style={styles.avatarWrapper}>
        <Pressable
          style={[styles.avatarContainer, disabled && styles.avatarContainerDisabled]}
          onPress={handleImageSelect}
          disabled={disabled}
        >
          {selectedImageUri ? (
            // 選択した画像をプレビューとして表示
            <Image
              source={{ uri: selectedImageUri }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : currentAvatarUrl ? (
            // 既存のアバター画像
            <Image
              source={{ uri: currentAvatarUrl }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            // プレースホルダー
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName.charAt(0) || '?'}</Text>
            </View>
          )}
        </Pressable>

        {/* カメラアイコン（右下にはみ出す） */}
        {!disabled && (
          <Pressable
            style={styles.cameraIcon}
            onPress={handleImageSelect}
            disabled={disabled}
          >
            <Feather name="camera" size={16} color="#FFFFFF" />
          </Pressable>
        )}

        {/* 削除アイコン（右上にはみ出す） */}
        {currentAvatarUrl && !disabled && (
          <Pressable
            style={styles.deleteIcon}
            onPress={handleRemoveAvatar}
            disabled={disabled}
          >
            <Feather name="x" size={12} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

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
  avatarWrapper: {
    width: 120,
    height: 120,
    position: 'relative',
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
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
  cameraIcon: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    // 影を追加
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteIcon: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    zIndex: 10,
    // 影を追加
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
  },
})
