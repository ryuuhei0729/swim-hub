import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Feather } from '@expo/vector-icons'

export interface ExistingImage {
  id: string
  url: string
}

export interface ImageFile {
  uri: string
  base64: string
  fileExtension: string
}

interface ImageUploaderProps {
  existingImages?: ExistingImage[]
  onImagesChange: (newFiles: ImageFile[], deletedIds: string[]) => void
  maxImages?: number
  disabled?: boolean
  label?: string
}

/**
 * MIMEタイプからファイル拡張子を導出
 * HEIC/HEIFはJPEGとして扱う（変換後の拡張子）
 */
function getExtensionFromMimeType(mimeType: string | null | undefined): string {
  if (!mimeType) return 'jpg'

  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'jpg', // HEICはJPEGに変換
    'image/heif': 'jpg', // HEIFはJPEGに変換
  }

  const normalizedMime = mimeType.toLowerCase().trim()
  return mimeToExt[normalizedMime] || 'jpg'
}

/**
 * アセットからファイル拡張子を導出
 */
function getFileExtensionFromAsset(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.type) {
    return getExtensionFromMimeType(asset.type)
  }

  if (asset.uri.startsWith('data:')) {
    const mimeMatch = asset.uri.match(/^data:([^;]+)/)
    if (mimeMatch && mimeMatch[1]) {
      return getExtensionFromMimeType(mimeMatch[1])
    }
  }

  return 'jpg'
}

/**
 * 汎用画像アップローダーコンポーネント
 * 複数画像の選択・プレビュー・削除に対応
 */
export const ImageUploader: React.FC<ImageUploaderProps> = ({
  existingImages = [],
  onImagesChange,
  maxImages = 3,
  disabled = false,
  label = '画像',
}) => {
  const [newFiles, setNewFiles] = useState<ImageFile[]>([])
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const previousBlobUrlsRef = useRef<string[]>([])

  // 現在の表示画像数
  const currentImageCount =
    existingImages.filter((img) => !deletedIds.includes(img.id)).length + newFiles.length

  // blob URLのクリーンアップ
  useEffect(() => {
    // 前回のblob URLを保持（クリーンアップ用）
    const urlsToRevoke = previousBlobUrlsRef.current

    // 現在の新規ファイルのURIを保持
    previousBlobUrlsRef.current = newFiles.map((f) => f.uri).filter((uri) => uri.startsWith('blob:'))

    // クリーンアップ時に前回のblob URLを解放
    return () => {
      urlsToRevoke.forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [newFiles])

  const handleImageSelect = async () => {
    if (disabled || currentImageCount >= maxImages) return
    setError(null)

    if (Platform.OS === 'web') {
      // Web版: input要素を使用
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp'
      input.multiple = true
      input.onchange = async (e) => {
        const files = (e.target as HTMLInputElement).files
        if (!files) return

        const remainingSlots = maxImages - currentImageCount
        const filesToProcess = Array.from(files).slice(0, remainingSlots)

        const newImages: ImageFile[] = []
        for (const file of filesToProcess) {
          // バリデーション
          if (!file.type.startsWith('image/')) {
            setError('画像ファイルを選択してください')
            continue
          }
          if (file.size > 10 * 1024 * 1024) {
            setError('画像サイズは10MB以下にしてください')
            continue
          }

          // base64に変換
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const result = reader.result as string
              const base64Data = result.split(',')[1] || ''
              resolve(base64Data)
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
          })

          const imageUrl = URL.createObjectURL(file)
          const fileExt = getExtensionFromMimeType(file.type)

          newImages.push({
            uri: imageUrl,
            base64,
            fileExtension: fileExt,
          })
        }

        if (newImages.length > 0) {
          setNewFiles((prev) => {
            const updated = [...prev, ...newImages]
            onImagesChange(updated, deletedIds)
            return updated
          })
        }
      }
      input.click()
    } else {
      // ネイティブ版: expo-image-pickerを使用
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
          Alert.alert(
            '権限が必要です',
            '画像を選択するには、フォトライブラリへのアクセス権限が必要です。',
            [{ text: 'OK' }]
          )
          return
        }

        // 1枚ずつ選択（allowsMultipleSelection + base64 の組み合わせはiOSでハングする）
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          allowsEditing: false,
          quality: 0.7,
          base64: true,
          // HEIC/HEIFをJPEGに変換（iOS）
          legacy: true,
        })

        if (result.canceled) return

        const asset = result.assets[0]
        if (!asset || !asset.base64) {
          setError('画像データの取得に失敗しました')
          return
        }

        // ファイルサイズチェック
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          setError('画像サイズは10MB以下にしてください')
          return
        }

        const fileExt = getFileExtensionFromAsset(asset)
        const newImage: ImageFile = {
          uri: asset.uri,
          base64: asset.base64!,
          fileExtension: fileExt,
        }
        setNewFiles((prev) => {
          const updated = [...prev, newImage]
          onImagesChange(updated, deletedIds)
          return updated
        })
      } catch (err) {
        console.error('画像選択エラー:', err)
        const errorMessage = err instanceof Error ? err.message : '画像の選択に失敗しました'
        setError(errorMessage)
        Alert.alert('エラー', errorMessage, [{ text: 'OK' }])
      }
    }
  }

  const handleRemoveExisting = (id: string) => {
    if (disabled) return

    const confirmRemove = () => {
      setDeletedIds((prev) => {
        const updated = [...prev, id]
        onImagesChange(newFiles, updated)
        return updated
      })
    }

    if (Platform.OS === 'web') {
      if (window.confirm('この画像を削除しますか？')) {
        confirmRemove()
      }
    } else {
      Alert.alert('削除確認', 'この画像を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: confirmRemove },
      ])
    }
  }

  const handleRemoveNew = (index: number) => {
    if (disabled) return
    setNewFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      onImagesChange(updated, deletedIds)
      return updated
    })
  }

  const canAddMore = currentImageCount < maxImages

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.count}>
          {currentImageCount} / {maxImages}枚
        </Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imagesContainer}
      >
        {/* 既存画像 */}
        {existingImages
          .filter((img) => !deletedIds.includes(img.id))
          .map((img) => (
            <View key={img.id} style={styles.imageWrapper}>
              <Image source={{ uri: img.url }} style={styles.image} resizeMode="cover" />
              {!disabled && (
                <Pressable
                  style={styles.removeButton}
                  onPress={() => handleRemoveExisting(img.id)}
                >
                  <Feather name="x" size={14} color="#FFFFFF" />
                </Pressable>
              )}
            </View>
          ))}

        {/* 新規画像 */}
        {newFiles.map((file, index) => (
          <View key={`new-${index}`} style={styles.imageWrapper}>
            <Image source={{ uri: file.uri }} style={styles.image} resizeMode="cover" />
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>新規</Text>
            </View>
            {!disabled && (
              <Pressable style={styles.removeButton} onPress={() => handleRemoveNew(index)}>
                <Feather name="x" size={14} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        ))}

        {/* 追加ボタン */}
        {canAddMore && !disabled && (
          <Pressable style={styles.addButton} onPress={handleImageSelect}>
            <Feather name="plus" size={24} color="#6B7280" />
            <Text style={styles.addButtonText}>追加</Text>
          </Pressable>
        )}
      </ScrollView>

      {currentImageCount >= maxImages && (
        <Text style={styles.maxReachedText}>最大枚数に達しました</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  count: {
    fontSize: 12,
    color: '#6B7280',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
  },
  imagesContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  newBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  addButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    gap: 4,
  },
  addButtonText: {
    fontSize: 12,
    color: '#6B7280',
  },
  maxReachedText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
})

export default ImageUploader
