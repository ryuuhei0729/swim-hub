import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  usePracticeByIdQuery,
  useDeletePracticeMutation,
} from "@apps/shared/hooks/queries/practices";
import { PracticeLogItem } from "@/components/practices";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { ImageViewerModal } from "@/components/shared";
import { getExistingImagesFromPaths } from "@/utils/imageUpload";
import type { MainStackParamList } from "@/navigation/types";

type PracticeDetailScreenRouteProp = RouteProp<MainStackParamList, "PracticeDetail">;
type PracticeDetailScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 練習記録詳細画面
 * Web版と統一されたデザイン
 */
export const PracticeDetailScreen: React.FC = () => {
  const route = useRoute<PracticeDetailScreenRouteProp>();
  const navigation = useNavigation<PracticeDetailScreenNavigationProp>();
  const { practiceId } = route.params;
  const { supabase } = useAuth();
  const { t } = useTranslation();

  const deleteMutation = useDeletePracticeMutation(supabase);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const handleEdit = () => {
    navigation.navigate("PracticeForm", { practiceId });
  };

  const handleDelete = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(t("practice.mobile.deleteConfirmMessage"));
      if (!confirmed) {
        return;
      }
      executeDelete();
    } else {
      Alert.alert(
        t("practice.mobile.deleteConfirmTitle"),
        t("practice.mobile.deleteConfirmMessage"),
        [
          {
            text: t("common.cancel"),
            style: "cancel",
          },
          {
            text: t("practice.mobile.deleteConfirmButton"),
            style: "destructive",
            onPress: executeDelete,
          },
        ],
        { cancelable: true },
      );
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(practiceId);
      navigation.goBack();
    } catch (error) {
      console.error("削除エラー:", error);
      const msg = error instanceof Error ? error.message : t("practice.mobile.deleteFailed");
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert(t("common.error"), msg, [{ text: "OK" }]);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const {
    data: practice,
    isLoading,
    error,
    refetch,
  } = usePracticeByIdQuery(supabase, practiceId, {
    enableRealtime: true,
  });

  if (error) {
    const errorMessage = error instanceof Error ? error.message : t("practice.mobile.fetchFailed");
    return (
      <View style={styles.container}>
        <ErrorView message={errorMessage} onRetry={() => refetch()} fullScreen />
      </View>
    );
  }

  if (isLoading && !practice) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loading")} />
      </View>
    );
  }

  if (!practice) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={t("practice.mobile.notFound")}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    );
  }

  const formattedDate = format(new Date(practice.date), "yyyy年M月d日(E)", { locale: ja });
  const title = practice.title || t("practice.client.practiceTitle");

  const practiceImages = getExistingImagesFromPaths(supabase, practice.image_paths, "practice-images");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ヘッダーカード */}
      <View style={styles.headerCard}>
        <Text style={styles.date}>{formattedDate}</Text>
        <Text style={styles.title}>{title}</Text>

        {/* メタ情報 */}
        <View style={styles.metaContainer}>
          {practice.place && (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.metaText}>{practice.place}</Text>
            </View>
          )}
        </View>

        {/* メモ */}
        {practice.note && (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>{t("practice.modal.memo")}</Text>
            <Text style={styles.noteText}>{practice.note}</Text>
          </View>
        )}
      </View>

      {/* 画像ギャラリー */}
      {practiceImages.length > 0 && (
        <View style={galleryStyles.gallerySection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {practiceImages.map((img, index) => (
              <Pressable
                key={img.id}
                onPress={() => {
                  setViewerIndex(index);
                  setViewerVisible(true);
                }}
              >
                <Image
                  source={{ uri: img.url }}
                  style={galleryStyles.image}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 練習ログ一覧 */}
      {practice.practice_logs && practice.practice_logs.length > 0 ? (
        <View style={styles.logsSection}>
          <Text style={styles.sectionTitle}>{t("practice.mobile.practiceLogsSection")}</Text>
          {practice.practice_logs.map((log) => (
            <PracticeLogItem key={log.id} log={log} />
          ))}
        </View>
      ) : (
        <View style={styles.emptySection}>
          <Text style={styles.emptyText}>{t("practice.mobile.noPracticeLogs")}</Text>
        </View>
      )}

      {/* アクションボタン */}
      <View style={styles.actionContainer}>
        <Pressable
          style={[styles.actionButton, styles.editButton]}
          onPress={handleEdit}
          disabled={isDeleting}
        >
          <Feather name="edit-2" size={16} color="#FFFFFF" />
          <Text style={styles.editButtonText}>{t("practice.page.edit")}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.deleteButton]}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          <Feather name="trash-2" size={16} color="#DC2626" />
          <Text style={styles.deleteButtonText}>
            {isDeleting ? t("practice.page.deleting") : t("practice.page.delete")}
          </Text>
        </Pressable>
      </View>

      <ImageViewerModal
        images={practiceImages.map((img) => ({ uri: img.url }))}
        visible={viewerVisible}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </ScrollView>
  );
};

const galleryStyles = StyleSheet.create({
  gallerySection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  content: {
    paddingBottom: 32,
  },

  // ヘッダーカード
  headerCard: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  date: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },

  // メタ情報
  metaContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: "#374151",
  },

  // メモ
  noteCard: {
    marginTop: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 4,
  },
  noteText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
  },

  // ログセクション
  logsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    paddingHorizontal: 20,
  },

  // 空状態
  emptySection: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
  },

  // アクションボタン
  actionContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 10,
  },
  actionButton: {
    flexDirection: "row",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  editButton: {
    backgroundColor: "#2563EB",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deleteButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#DC2626",
  },
});
