import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useSignedImageUrl } from "@/hooks/useSignedImageUrl";

interface AvatarUploadProps {
  /** プロフィール画像のバケット内相対パス（"{userId}/{fileName}"）。旧データはフルURLの場合もある */
  currentAvatarUrl?: string | null;
  userName: string;
  onAvatarChange: (newAvatarUrl: string | null) => void;
  onImageSelected?: (imageUri: string, base64Data: string, fileExtension: string) => void;
  disabled?: boolean;
}

/**
 * MIMEタイプからファイル拡張子を導出
 * @param mimeType MIMEタイプ（例: 'image/jpeg', 'image/png'）
 * @returns ファイル拡張子（例: 'jpg', 'png'）
 */
function getExtensionFromMimeType(mimeType: string | null | undefined): string {
  if (!mimeType) {
    return "jpg"; // デフォルト
  }

  // MIMEタイプから拡張子へのマッピング
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "image/svg+xml": "svg",
  };

  // 小文字に変換して検索
  const normalizedMime = mimeType.toLowerCase().trim();
  return mimeToExt[normalizedMime] || "jpg"; // 見つからない場合はデフォルト
}

/**
 * アセットからファイル拡張子を導出
 * @param asset expo-image-pickerのアセット
 * @returns ファイル拡張子
 */
function getFileExtensionFromAsset(asset: ImagePicker.ImagePickerAsset): string {
  // 1. asset.type（MIMEタイプ）が存在する場合はそれを使用
  if (asset.type) {
    return getExtensionFromMimeType(asset.type);
  }

  // 2. asset.uriがdata URIの場合は、MIMEタイプを抽出
  if (asset.uri.startsWith("data:")) {
    // data:image/png;base64, の形式から MIMEタイプを抽出
    const mimeMatch = asset.uri.match(/^data:([^;]+)/);
    if (mimeMatch && mimeMatch[1]) {
      return getExtensionFromMimeType(mimeMatch[1]);
    }
  }

  // 3. どちらもない場合は安全なデフォルト
  return "jpg";
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
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const previousBlobUrlRef = useRef<string | null>(null);
  // profile-images は private バケットのため、パスから署名付きURLを解決して表示する
  const { url: resolvedAvatarUrl } = useSignedImageUrl("profile-images", currentAvatarUrl);

  // blob URLのクリーンアップ
  useEffect(() => {
    // 既存のblob URLを解放
    if (previousBlobUrlRef.current) {
      URL.revokeObjectURL(previousBlobUrlRef.current);
      previousBlobUrlRef.current = null;
    }

    // 現在のselectedImageUriがblob URLの場合は、参照を保持
    if (selectedImageUri && selectedImageUri.startsWith("blob:")) {
      previousBlobUrlRef.current = selectedImageUri;
    }

    // クリーンアップ関数: コンポーネントのアンマウント時、またはselectedImageUriが変更された時に実行
    return () => {
      if (previousBlobUrlRef.current) {
        URL.revokeObjectURL(previousBlobUrlRef.current);
        previousBlobUrlRef.current = null;
      }
    };
  }, [selectedImageUri]);

  const handleImageSelect = async () => {
    if (!user || disabled) return;

    if (Platform.OS === "web") {
      // Web版: input要素を使用
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        // ファイルバリデーション
        if (!file.type.startsWith("image/")) {
          setError(t("common.upload.imageOnlyError"));
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          setError(t("common.upload.imageSizeError", { maxMb: 5 }));
          return;
        }

        // 既存のblob URLを解放（新しいURLを作成する前に）
        if (selectedImageUri && selectedImageUri.startsWith("blob:")) {
          URL.revokeObjectURL(selectedImageUri);
        }

        // 選択した画像をアバター表示エリアにプレビューとして表示
        const imageUrl = URL.createObjectURL(file);
        setSelectedImageUri(imageUrl);

        // 親コンポーネントに選択した画像を通知（Web版ではFileをbase64に変換）
        if (onImageSelected) {
          // Fileオブジェクトをbase64に変換
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = reader.result as string;
            // data:image/jpeg;base64, のプレフィックスを除去
            const base64 = base64Data.split(",")[1] || "";
            // MIMEタイプから拡張子を導出（file.typeを使用）
            const fileExt =
              getExtensionFromMimeType(file.type) || file.name.split(".").pop() || "jpg";
            onImageSelected(imageUrl, base64, fileExt);
          };
          reader.onerror = () => {
            setError(t("common.upload.imageLoadFailed"));
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
    } else {
      // ネイティブ版: expo-image-pickerを使用
      try {
        // 権限をリクエスト
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            t("common.upload.permissionRequiredTitle"),
            t("common.upload.photoLibraryPermissionRequired"),
            [{ text: "OK" }],
          );
          return;
        }

        // 画像を選択（base64データも取得）
        // WEBの実装と同様に画質を落とす（quality: 0.7 = 70%）
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.7, // WEBと同様に70%に設定
          base64: true, // base64データを取得
        });

        if (result.canceled) {
          return;
        }

        const asset = result.assets[0];
        if (!asset) {
          return;
        }

        // ファイルサイズのチェック（5MB以下）
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert(t("common.alertErrorTitle"), t("common.upload.imageSizeError", { maxMb: 5 }), [{ text: "OK" }]);
          return;
        }

        // base64データのチェック
        if (!asset.base64) {
          Alert.alert(t("common.alertErrorTitle"), t("common.upload.imageDataFetchFailed"), [{ text: "OK" }]);
          return;
        }

        // 選択した画像をアバター表示エリアにプレビューとして表示
        setSelectedImageUri(asset.uri);

        // 親コンポーネントに選択した画像を通知（base64データとURIを渡す）
        if (onImageSelected) {
          // MIMEタイプから拡張子を導出（content://、data:、React Native FS URIに対応）
          const fileExtension = getFileExtensionFromAsset(asset);
          // base64データとURIを渡す（ArrayBufferへの変換は親コンポーネントで行う）
          onImageSelected(asset.uri, asset.base64, fileExtension);
        }
      } catch (err) {
        console.error("画像選択エラー:", err);
        const errorMessage = err instanceof Error ? err.message : t("common.upload.imageSelectFailed");
        setError(errorMessage);
        Alert.alert(t("common.alertErrorTitle"), errorMessage, [{ text: "OK" }]);
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || disabled) return;

    const confirmed =
      Platform.OS === "web"
        ? window.confirm(t("common.upload.avatarRemoveConfirm"))
        : await new Promise<boolean>((resolve) => {
            Alert.alert(t("common.upload.removeConfirmTitle"), t("common.upload.avatarRemoveConfirm"), [
              { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
              { text: t("common.upload.removeChoice"), style: "destructive", onPress: () => resolve(true) },
            ]);
          });

    if (!confirmed) return;

    try {
      // パス規約: "{userId}/{fileName}"（旧 "avatars/{userId}/..." は移行済み。Issue #36）
      const userFolderPath = user.id;

      const { data: files } = await supabase.storage.from("profile-images").list(userFolderPath);

      if (files && files.length > 0) {
        const filePathsToDelete = files.map((f) => `${userFolderPath}/${f.name}`);
        await supabase.storage.from("profile-images").remove(filePathsToDelete);
      }

      onAvatarChange(null);
    } catch (err) {
      console.error("画像削除エラー:", err);
      const errorMessage = err instanceof Error ? err.message : t("common.upload.imageDeleteFailed");
      setError(errorMessage);
      if (Platform.OS === "web") {
        window.alert(errorMessage);
      } else {
        Alert.alert(t("common.alertErrorTitle"), errorMessage, [{ text: "OK" }]);
      }
    }
  };

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
              contentFit="cover"
            />
          ) : resolvedAvatarUrl ? (
            // 既存のアバター画像（署名付きURL解決済み）
            <Image
              source={{ uri: resolvedAvatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            // プレースホルダー
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName.charAt(0) || "?"}</Text>
            </View>
          )}
        </Pressable>

        {/* カメラアイコン（右下にはみ出す） */}
        {!disabled && (
          <Pressable style={styles.cameraIcon} onPress={handleImageSelect} disabled={disabled}>
            <Feather name="camera" size={16} color="#FFFFFF" />
          </Pressable>
        )}

        {/* 削除アイコン（右上にはみ出す） */}
        {currentAvatarUrl && !disabled && (
          <Pressable style={styles.deleteIcon} onPress={handleRemoveAvatar} disabled={disabled}>
            <Feather name="x" size={12} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      {/* エラー表示 */}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 8,
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    position: "relative",
  },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarContainerDisabled: {
    opacity: 0.5,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  cameraIcon: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    // 影を追加
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  deleteIcon: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#DC2626",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    zIndex: 10,
    // 影を追加
    shadowColor: "#000",
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
    color: "#DC2626",
    textAlign: "center",
  },
});
