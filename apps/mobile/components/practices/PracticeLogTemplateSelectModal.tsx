import React, { useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { ErrorView } from "@/components/layout/ErrorView";
import {
  usePracticeLogTemplatesQuery,
  useUsePracticeLogTemplateMutation,
} from "@apps/shared/hooks/queries/practiceLogTemplates";
import type { PracticeLogTemplate } from "@apps/shared/types/practiceLogTemplate";

interface PracticeLogTemplateSelectModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (template: PracticeLogTemplate) => void;
  /** 「テンプレートを管理」押下時 (管理画面へ遷移)。未指定なら管理ボタン非表示 */
  onManage?: () => void;
}

/** サークル秒数を 1'30" 形式にフォーマット (web selectModal と同一) */
export function formatTemplateCircle(seconds: number | null): string {
  if (!seconds) return "";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}'${sec.toString().padStart(2, "0")}"`;
}

/**
 * 練習ログテンプレート選択モーダル (web PracticeLogTemplateSelectModal の RN 移植)。
 * お気に入り → その他の順にテンプレートを一覧表示し、タップで選択する。
 */
export const PracticeLogTemplateSelectModal: React.FC<PracticeLogTemplateSelectModalProps> = ({
  visible,
  onClose,
  onSelect,
  onManage,
}) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();

  const {
    data: templates,
    isLoading,
    isError,
    refetch,
  } = usePracticeLogTemplatesQuery(supabase);
  const useTemplateMutation = useUsePracticeLogTemplateMutation(supabase);

  const handleSelect = useCallback(
    (template: PracticeLogTemplate) => {
      // use_count を更新
      useTemplateMutation.mutate(template.id);
      onSelect(template);
      onClose();
    },
    [useTemplateMutation, onSelect, onClose],
  );

  const favoriteTemplates = templates?.filter((tpl) => tpl.is_favorite) || [];
  const otherTemplates = templates?.filter((tpl) => !tpl.is_favorite) || [];

  const renderItem = (template: PracticeLogTemplate) => (
    <Pressable
      key={template.id}
      style={styles.templateItem}
      onPress={() => handleSelect(template)}
      accessibilityRole="button"
      accessibilityLabel={t("practiceLogTemplates.selectModal.templateAriaLabel", {
        name: template.name,
      })}
    >
      <View style={styles.templateHeader}>
        <Text style={styles.templateName} numberOfLines={1}>
          {template.name}
        </Text>
        <Feather name="chevron-right" size={16} color="#9CA3AF" />
      </View>
      <Text style={styles.templateDetail}>
        {t("practiceLogTemplates.distanceFormat", {
          distance: template.distance,
          reps: template.rep_count,
          sets: template.set_count,
        })}{" "}
        {template.style} {template.swim_category}
        {template.circle
          ? `  ${t("practiceLogTemplates.circleFormat", {
              circle: formatTemplateCircle(template.circle),
            })}`
          : ""}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modal}>
          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title}>{t("practiceLogTemplates.selectModal.title")}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("practiceLogTemplates.selectModal.closeAriaLabel")}
              hitSlop={8}
            >
              <Feather name="x" size={22} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* コンテンツ */}
          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {isLoading ? (
              <ActivityIndicator size="small" color="#2563EB" style={styles.loading} />
            ) : isError ? (
              <ErrorView
                message={t("practiceLogTemplates.list.loadError")}
                onRetry={() => refetch()}
              />
            ) : templates?.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {t("practiceLogTemplates.selectModal.emptyText")}
                </Text>
                {onManage && (
                  <Pressable onPress={onManage} accessibilityRole="button">
                    <Text style={styles.emptyLink}>
                      {t("practiceLogTemplates.selectModal.emptyCreateLink")}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View style={styles.sections}>
                {favoriteTemplates.length > 0 && (
                  <View>
                    <View style={styles.sectionHeader}>
                      <Feather name="star" size={14} color="#EAB308" />
                      <Text style={styles.sectionTitle}>
                        {t("practiceLogTemplates.selectModal.favoritesTitle")}
                      </Text>
                    </View>
                    <View style={styles.list}>{favoriteTemplates.map(renderItem)}</View>
                  </View>
                )}
                {otherTemplates.length > 0 && (
                  <View>
                    {favoriteTemplates.length > 0 && (
                      <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>
                          {t("practiceLogTemplates.selectModal.allTemplatesTitle")}
                        </Text>
                      </View>
                    )}
                    <View style={styles.list}>{otherTemplates.map(renderItem)}</View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* フッター: テンプレート管理 */}
          {onManage && (
            <Pressable
              style={styles.manageButton}
              onPress={onManage}
              accessibilityRole="button"
            >
              <Feather name="settings" size={16} color="#4B5563" />
              <Text style={styles.manageButtonText}>
                {t("practiceLogTemplates.selectModal.manageButton")}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  content: {
    flexGrow: 0,
  },
  contentContainer: {
    padding: 16,
  },
  loading: {
    paddingVertical: 24,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyLink: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "500",
  },
  sections: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  list: {
    gap: 8,
  },
  templateItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  templateName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  templateDetail: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 4,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  manageButtonText: {
    fontSize: 14,
    color: "#4B5563",
    fontWeight: "500",
  },
});
