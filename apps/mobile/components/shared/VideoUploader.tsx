import React, { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import { uploadVideo, deleteVideo, type VideoType } from "@/utils/videoUpload";
import { PREMIUM_MESSAGES } from "@swim-hub/shared/constants/premium";
import { PremiumBadge } from "./PremiumBadge";
import { VideoPlayer } from "./VideoPlayer";

interface VideoUploaderProps {
  type: VideoType;
  /** レコードID（新規作成時は undefined → 保存後にセットして自動アップロード） */
  id?: string;
  existingVideoPath?: string | null;
  existingThumbnailPath?: string | null;
  isPremium: boolean;
  onUploadComplete?: (videoPath: string, thumbnailPath: string) => void;
  onDelete?: () => void;
}

type UploadState = "idle" | "selected" | "uploading" | "done" | "error";

const MAX_FILE_SIZE_MB = 200;

/**
 * 動画アップロードコンポーネント
 * - id あり: 選択 → 即アップロード
 * - id なし: 選択 → 保留（id が後からセットされたら自動アップロード）
 */
export const VideoUploader: React.FC<VideoUploaderProps> = ({
  type,
  id,
  existingVideoPath,
  existingThumbnailPath,
  isPremium,
  onUploadComplete,
  onDelete,
}) => {
  const { session } = useAuth();
  const [uploadState, setUploadState] = useState<UploadState>(
    existingVideoPath ? "done" : "idle",
  );
  const [videoPath, setVideoPath] = useState<string | null>(existingVideoPath ?? null);
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(
    existingThumbnailPath ?? null,
  );
  const [pendingVideoUri, setPendingVideoUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  // id が後からセットされた場合、保留中の動画を自動アップロード
  useEffect(() => {
    if (id && pendingVideoUri && uploadState === "selected" && session?.access_token) {
      const doUpload = async () => {
        setUploadState("uploading");
        setError(null);
        setProgress(0);
        try {
          const result = await uploadVideo({
            type,
            id,
            videoUri: pendingVideoUri,
            accessToken: session.access_token,
            onProgress: setProgress,
          });
          setPendingVideoUri(null);
          setVideoPath(result.videoPath);
          setThumbnailPath(result.thumbnailPath);
          setUploadState("done");
          onUploadComplete?.(result.videoPath, result.thumbnailPath);
        } catch (err) {
          console.error("動画アップロードエラー:", err);
          setError(err instanceof Error ? err.message : "アップロードに失敗しました");
          setUploadState("error");
        }
      };
      doUpload();
    }
  }, [id, pendingVideoUri, uploadState, session?.access_token, type, onUploadComplete]);

  const pickVideo = useCallback(
    async (source: "library" | "camera") => {
      if (!session?.access_token) {
        Alert.alert("エラー", "認証情報が見つかりません。再ログインしてください。");
        return;
      }

      try {
        const pickerFn =
          source === "camera"
            ? ImagePicker.launchCameraAsync
            : ImagePicker.launchImageLibraryAsync;

        const result = await pickerFn({
          mediaTypes: ["videos"],
          allowsEditing: true,
          videoMaxDuration: 600,
          quality: 1,
        });

        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];

        if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE_MB * 1024 * 1024) {
          Alert.alert("エラー", `動画のサイズが${MAX_FILE_SIZE_MB}MBを超えています`);
          return;
        }

        if (id) {
          // ID あり → 即アップロード
          setUploadState("uploading");
          setError(null);
          setProgress(0);

          const result2 = await uploadVideo({
            type,
            id,
            videoUri: asset.uri,
            accessToken: session.access_token,
            onProgress: setProgress,
          });

          setVideoPath(result2.videoPath);
          setThumbnailPath(result2.thumbnailPath);
          setUploadState("done");
          onUploadComplete?.(result2.videoPath, result2.thumbnailPath);
        } else {
          // ID なし → 保留（保存後に自動アップロード）
          setPendingVideoUri(asset.uri);
          setUploadState("selected");
          setError(null);
        }
      } catch (err) {
        console.error("動画アップロードエラー:", err);
        setError(err instanceof Error ? err.message : "アップロードに失敗しました");
        setUploadState("error");
      }
    },
    [session, type, id, onUploadComplete],
  );

  const handleSelectSource = useCallback(() => {
    Alert.alert("動画を追加", "動画の取得元を選択してください", [
      { text: "キャンセル", style: "cancel" },
      { text: "カメラで撮影", onPress: () => pickVideo("camera") },
      { text: "ライブラリから選択", onPress: () => pickVideo("library") },
    ]);
  }, [pickVideo]);

  const handleDelete = useCallback(async () => {
    // 保留中の動画を削除
    if (pendingVideoUri) {
      setPendingVideoUri(null);
      setUploadState("idle");
      return;
    }

    if (!session?.access_token || !id) return;

    Alert.alert("動画を削除", "この動画を削除しますか？", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteVideo(type, id, session.access_token);
            setVideoPath(null);
            setThumbnailPath(null);
            setUploadState("idle");
            setShowPlayer(false);
            onDelete?.();
          } catch (err) {
            Alert.alert("エラー", err instanceof Error ? err.message : "削除に失敗しました");
          }
        },
      },
    ]);
  }, [session, type, id, onDelete, pendingVideoUri]);

  // Premium 制限
  if (!isPremium && uploadState === "idle") {
    return <PremiumBadge message={PREMIUM_MESSAGES.video_upload} compact />;
  }

  // 動画選択済み（ID待ち — 保存後に自動アップロード）
  if (uploadState === "selected" && pendingVideoUri) {
    return (
      <View style={styles.selectedContainer}>
        <View style={styles.selectedBadge}>
          <Feather name="check-circle" size={16} color="#059669" />
          <Text style={styles.selectedText}>動画を選択済み（保存時にアップロードされます）</Text>
        </View>
        <Pressable style={styles.removeButton} onPress={handleDelete}>
          <Feather name="x" size={14} color="#DC2626" />
          <Text style={styles.removeText}>取り消し</Text>
        </Pressable>
      </View>
    );
  }

  // アップロード中
  if (uploadState === "uploading") {
    return (
      <View style={styles.progressContainer}>
        <ActivityIndicator size="small" color="#6366F1" />
        <Text style={styles.progressText}>アップロード中... {Math.round(progress)}%</Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>
    );
  }

  // 完了（動画あり）
  if (uploadState === "done" && videoPath) {
    if (showPlayer) {
      return (
        <View style={styles.doneContainer}>
          <VideoPlayer videoPath={videoPath} thumbnailPath={thumbnailPath} />
          <View style={styles.actionRow}>
            <Pressable style={styles.closeButton} onPress={() => setShowPlayer(false)}>
              <Feather name="x" size={16} color="#6B7280" />
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
            <Pressable style={styles.deleteButton} onPress={handleDelete}>
              <Feather name="trash-2" size={16} color="#DC2626" />
              <Text style={styles.deleteText}>削除</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.doneContainer}>
        <Pressable style={styles.thumbnailContainer} onPress={() => setShowPlayer(true)}>
          <View style={styles.thumbnailPlaceholder}>
            <Feather name="play-circle" size={32} color="#FFFFFF" />
            <Text style={styles.thumbnailText}>タップして再生</Text>
          </View>
        </Pressable>
        <View style={styles.actionRow}>
          <Pressable style={styles.replaceButton} onPress={handleSelectSource}>
            <Feather name="refresh-cw" size={14} color="#6366F1" />
            <Text style={styles.replaceText}>差し替え</Text>
          </Pressable>
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Feather name="trash-2" size={14} color="#DC2626" />
            <Text style={styles.deleteText}>削除</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // idle / error
  return (
    <View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      <Pressable style={styles.addButton} onPress={handleSelectSource}>
        <Feather name="video" size={20} color="#6B7280" />
        <Text style={styles.addButtonText}>動画を追加</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  selectedContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  selectedText: {
    fontSize: 13,
    color: "#065F46",
    flex: 1,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingLeft: 8,
  },
  removeText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "500",
  },
  progressContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 16,
    gap: 8,
    alignItems: "center",
  },
  progressText: {
    fontSize: 13,
    color: "#6B7280",
  },
  progressBarBg: {
    width: "100%",
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#6366F1",
    borderRadius: 2,
  },
  doneContainer: {
    gap: 8,
  },
  thumbnailContainer: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#1F2937",
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  thumbnailText: {
    fontSize: 13,
    color: "#D1D5DB",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
  },
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  closeText: {
    fontSize: 13,
    color: "#6B7280",
  },
  replaceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  replaceText: {
    fontSize: 13,
    color: "#6366F1",
    fontWeight: "500",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  deleteText: {
    fontSize: 13,
    color: "#DC2626",
    fontWeight: "500",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    marginBottom: 8,
  },
});
