import React, { useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useVideoPresignedUrl } from "@/hooks/useVideoPresignedUrl";

interface VideoPlayerProps {
  videoPath: string;
  thumbnailPath?: string | null;
}

/**
 * 動画再生コンポーネント
 * サムネイル表示 → タップで再生開始 → フルスクリーン対応
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoPath, thumbnailPath }) => {
  const { videoUrl, thumbnailUrl, isLoading, error, refetch } = useVideoPresignedUrl(
    videoPath,
    thumbnailPath,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const videoViewRef = useRef<VideoView>(null);

  const player = useVideoPlayer(videoUrl ?? "", (p) => {
    p.loop = false;
  });

  const handleExitFullscreen = useCallback(() => {
    // フルスクリーン終了 → 停止してサムネイル状態に戻す
    player.pause();
    player.currentTime = 0;
    setIsPlaying(false);
  }, [player]);

  const handlePlay = useCallback(() => {
    if (!player) return;
    setIsPlaying(true);
    player.replay();
    // フルスクリーンで再生開始
    setTimeout(() => {
      videoViewRef.current?.enterFullscreen();
    }, 200);
  }, [player]);

  const handleRetry = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color="#6366F1" />
          <Text style={styles.loadingText}>動画を読み込み中...</Text>
        </View>
      </View>
    );
  }

  if (error || !videoUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.placeholder}>
          <Feather name="alert-circle" size={24} color="#9CA3AF" />
          <Text style={styles.errorText}>{error ?? "動画を読み込めませんでした"}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryText}>再試行</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* VideoView は常にレンダリング（フルスクリーン遷移に必要） */}
      <VideoView
        ref={videoViewRef}
        style={isPlaying ? styles.video : styles.hiddenVideo}
        player={player}
        allowsFullscreen
        allowsPictureInPicture={false}
        contentFit="contain"
        onFullscreenExit={handleExitFullscreen}
      />

      {/* サムネイル + 再生ボタンオーバーレイ */}
      {!isPlaying && (
        <Pressable style={styles.overlay} onPress={handlePlay}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />
          ) : (
            <View style={styles.thumbnailPlaceholder} />
          )}
          <View style={styles.playButtonContainer}>
            <View style={styles.playButton}>
              <Feather name="play" size={28} color="#FFFFFF" style={styles.playIcon} />
            </View>
          </View>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  hiddenVideo: {
    width: 0,
    height: 0,
    position: "absolute",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbnailPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#1F2937",
  },
  playButtonContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: {
    marginLeft: 3, // 再生アイコンの視覚的な中央補正
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F3F4F6",
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 16,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#6366F1",
    borderRadius: 6,
    marginTop: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
