import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  usePracticeLogTemplatesQuery,
  usePracticeLogTemplateCountQuery,
  useCreatePracticeLogTemplateMutation,
  useUpdatePracticeLogTemplateMutation,
  useDeletePracticeLogTemplateMutation,
  useTogglePracticeLogTemplateFavoriteMutation,
} from "@apps/shared/hooks/queries/practiceLogTemplates";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { DistanceChips } from "@/components/practices/DistanceChips";
import { formatTemplateCircle } from "@/components/practices/PracticeLogTemplateSelectModal";
import { SWIM_STYLES } from "@/utils/formatters";
import type {
  PracticeLogTemplate,
  CreatePracticeLogTemplateInput,
} from "@apps/shared/types/practiceLogTemplate";

/** 無料ユーザーのテンプレート上限 (web PracticeLogTemplateList.MAX_TEMPLATES と同一) */
const MAX_TEMPLATES = 10;

const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
] as const;

// ---- テンプレート編集フォーム state 型 ----
interface TemplateFormState {
  name: string;
  style: string;
  swimCategory: "Swim" | "Pull" | "Kick";
  distance: number | "";
  reps: number | "";
  sets: number | "";
  circleMin: number | "";
  circleSec: number | "";
  note: string;
}

function createDefaultFormState(): TemplateFormState {
  return {
    name: "",
    style: "Fr",
    swimCategory: "Swim",
    distance: 100,
    reps: 4,
    sets: 1,
    circleMin: 1,
    circleSec: 30,
    note: "",
  };
}

function formStateFromTemplate(template: PracticeLogTemplate): TemplateFormState {
  const circleTime = template.circle || 0;
  return {
    name: template.name,
    style: template.style,
    swimCategory: template.swim_category,
    distance: template.distance,
    reps: template.rep_count,
    sets: template.set_count,
    circleMin: circleTime ? Math.floor(circleTime / 60) : "",
    circleSec: circleTime ? circleTime % 60 : "",
    note: template.note || "",
  };
}

/**
 * 練習ログテンプレート管理画面
 * (web settings/practice-log-templates の RN 移植: 一覧・作成・編集・お気に入り・削除)
 */
export const PracticeLogTemplatesScreen: React.FC = () => {
  const { t } = useTranslation();
  const { supabase } = useAuth();

  const { data: templates, isLoading, error } = usePracticeLogTemplatesQuery(supabase);
  const { data: count } = usePracticeLogTemplateCountQuery(supabase);
  const createMutation = useCreatePracticeLogTemplateMutation(supabase);
  const updateMutation = useUpdatePracticeLogTemplateMutation(supabase);
  const deleteMutation = useDeletePracticeLogTemplateMutation(supabase);
  const toggleFavoriteMutation = useTogglePracticeLogTemplateFavoriteMutation(supabase);

  // ---- 作成/編集モーダル state ----
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PracticeLogTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormState>(createDefaultFormState());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAtLimit = (count || 0) >= MAX_TEMPLATES;

  const openCreateModal = useCallback(() => {
    setEditingTemplate(null);
    setForm(createDefaultFormState());
    setModalVisible(true);
  }, []);

  const openEditModal = useCallback((template: PracticeLogTemplate) => {
    setEditingTemplate(template);
    setForm(formStateFromTemplate(template));
    setModalVisible(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const circleTime = (Number(form.circleMin) || 0) * 60 + (Number(form.circleSec) || 0);
      const input: CreatePracticeLogTemplateInput = {
        name: form.name.trim(),
        style: form.style,
        swim_category: form.swimCategory,
        distance: Number(form.distance) || 100,
        rep_count: Number(form.reps) || 1,
        set_count: Number(form.sets) || 1,
        circle: circleTime > 0 ? circleTime : null,
        note: form.note.trim() || null,
      };
      if (editingTemplate) {
        await updateMutation.mutateAsync({ templateId: editingTemplate.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      setModalVisible(false);
    } catch (err) {
      console.error("テンプレート保存エラー:", err);
      Alert.alert(
        t("common.error"),
        toUserFacingMessage(err, t("practice.mobile.saveFailed")),
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [form, isSubmitting, editingTemplate, updateMutation, createMutation, t]);

  const handleDelete = useCallback(
    (template: PracticeLogTemplate) => {
      Alert.alert(
        t("practiceLogTemplates.card.deleteConfirm.title"),
        t("practiceLogTemplates.card.deleteConfirm.message", { name: template.name }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("practiceLogTemplates.card.deleteConfirm.confirmLabel"),
            style: "destructive",
            onPress: () => deleteMutation.mutate(template.id),
          },
        ],
      );
    },
    [t, deleteMutation],
  );

  const renderCard = (template: PracticeLogTemplate) => (
    <View key={template.id} style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName} numberOfLines={1}>
          {template.name}
        </Text>
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => toggleFavoriteMutation.mutate(template.id)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={
              template.is_favorite
                ? t("practiceLogTemplates.card.menuRemoveFavorite")
                : t("practiceLogTemplates.card.menuAddFavorite")
            }
          >
            <Feather
              name="star"
              size={18}
              color={template.is_favorite ? "#EAB308" : "#D1D5DB"}
            />
          </Pressable>
          <Pressable
            onPress={() => openEditModal(template)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("practiceLogTemplates.card.menuEdit")}
          >
            <Feather name="edit-2" size={17} color="#6B7280" />
          </Pressable>
          <Pressable
            onPress={() => handleDelete(template)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("practiceLogTemplates.card.menuDelete")}
          >
            <Feather name="trash-2" size={17} color="#DC2626" />
          </Pressable>
        </View>
      </View>
      <Text style={styles.cardDetail}>
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
      {template.use_count > 0 && (
        <Text style={styles.cardUseCount}>
          {t("practiceLogTemplates.card.useCount", { count: template.use_count })}
        </Text>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loading")} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t("practiceLogTemplates.list.loadError")}</Text>
      </View>
    );
  }

  const favoriteTemplates = templates?.filter((tpl) => tpl.is_favorite) || [];
  const otherTemplates = templates?.filter((tpl) => !tpl.is_favorite) || [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* 保存数 */}
        <Text style={styles.savedCount}>
          {t("practiceLogTemplates.list.savedCount", { count: count || 0, max: MAX_TEMPLATES })}
        </Text>

        {/* 空状態 */}
        {templates?.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t("practiceLogTemplates.list.emptyText")}</Text>
            <Pressable style={styles.createButton} onPress={openCreateModal}>
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.createButtonText}>
                {t("practiceLogTemplates.list.emptyCreateButton")}
              </Text>
            </Pressable>
          </View>
        )}

        {/* お気に入り */}
        {favoriteTemplates.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Feather name="star" size={14} color="#EAB308" />
              <Text style={styles.sectionTitle}>
                {t("practiceLogTemplates.list.favoritesTitle")}
              </Text>
            </View>
            {favoriteTemplates.map(renderCard)}
          </View>
        )}

        {/* その他 */}
        {otherTemplates.length > 0 && (
          <View style={styles.section}>
            {favoriteTemplates.length > 0 && (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {t("practiceLogTemplates.list.allTemplatesTitle")}
                </Text>
              </View>
            )}
            {otherTemplates.map(renderCard)}
          </View>
        )}

        {/* 新規作成 (テンプレートがある場合) */}
        {templates && templates.length > 0 && (
          <Pressable
            style={[styles.dashedCreateButton, isAtLimit && styles.dashedCreateButtonDisabled]}
            onPress={openCreateModal}
            disabled={isAtLimit}
          >
            <Feather name="plus" size={16} color={isAtLimit ? "#9CA3AF" : "#4B5563"} />
            <Text
              style={[
                styles.dashedCreateButtonText,
                isAtLimit && styles.dashedCreateButtonTextDisabled,
              ]}
            >
              {isAtLimit
                ? t("practiceLogTemplates.list.atLimitButton")
                : t("practiceLogTemplates.list.createNewButton")}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* 作成/編集モーダル */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingTemplate
                  ? t("practiceLogTemplates.createModal.editTitle")
                  : t("practiceLogTemplates.createModal.createTitle")}
              </Text>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("practiceLogTemplates.createModal.closeAriaLabel")}
              >
                <Feather name="x" size={22} color="#9CA3AF" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* テンプレート名 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("practiceLogTemplates.createModal.nameLabel")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, name: v }))}
                  placeholder={t("practiceLogTemplates.createModal.namePlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  editable={!isSubmitting}
                />
              </View>

              {/* 種目 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("practiceLogTemplates.createModal.styleLabel")}
                </Text>
                <View style={styles.chipsRow}>
                  {SWIM_STYLES.map((style) => (
                    <Pressable
                      key={style.value}
                      style={[styles.chip, form.style === style.value && styles.chipSelected]}
                      onPress={() => setForm((prev) => ({ ...prev, style: style.value }))}
                      disabled={isSubmitting}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          form.style === style.value && styles.chipTextSelected,
                        ]}
                      >
                        {t(`practice.styleAbbrev.${style.value}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* カテゴリ */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("practiceLogTemplates.createModal.categoryLabel")}
                </Text>
                <View style={styles.chipsRow}>
                  {SWIM_CATEGORIES.map((category) => (
                    <Pressable
                      key={category.value}
                      style={[
                        styles.chip,
                        form.swimCategory === category.value && styles.chipSelected,
                      ]}
                      onPress={() =>
                        setForm((prev) => ({ ...prev, swimCategory: category.value }))
                      }
                      disabled={isSubmitting}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          form.swimCategory === category.value && styles.chipTextSelected,
                        ]}
                      >
                        {category.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 距離 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("practiceLogTemplates.createModal.distanceLabel")}
                </Text>
                <DistanceChips
                  value={form.distance}
                  onChange={(v) => setForm((prev) => ({ ...prev, distance: v }))}
                  disabled={isSubmitting}
                />
              </View>

              {/* 本数・セット */}
              <View style={styles.rowFields}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    {t("practiceLogTemplates.createModal.repLabel")}
                  </Text>
                  <NumberStepper
                    value={form.reps}
                    onChange={(v) => setForm((prev) => ({ ...prev, reps: v }))}
                    min={1}
                    step={1}
                    placeholder="4"
                    disabled={isSubmitting}
                    accessibilityLabel={t("practiceLogTemplates.createModal.repLabel")}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    {t("practiceLogTemplates.createModal.setLabel")}
                  </Text>
                  <NumberStepper
                    value={form.sets}
                    onChange={(v) => setForm((prev) => ({ ...prev, sets: v }))}
                    min={1}
                    step={1}
                    placeholder="1"
                    disabled={isSubmitting}
                    accessibilityLabel={t("practiceLogTemplates.createModal.setLabel")}
                  />
                </View>
              </View>

              {/* サークル (分/秒) */}
              <View style={styles.rowFields}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    {t("practiceLogTemplates.createModal.circleLabel")} (
                    {t("practiceLogTemplates.createModal.circleMinUnit")})
                  </Text>
                  <NumberStepper
                    value={form.circleMin}
                    onChange={(v) => setForm((prev) => ({ ...prev, circleMin: v }))}
                    min={0}
                    step={1}
                    placeholder="1"
                    disabled={isSubmitting}
                    accessibilityLabel={t("practiceLogTemplates.createModal.circleMinUnit")}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>
                    {t("practiceLogTemplates.createModal.circleLabel")} (
                    {t("practiceLogTemplates.createModal.circleSecUnit")})
                  </Text>
                  <NumberStepper
                    value={form.circleSec}
                    onChange={(v) => setForm((prev) => ({ ...prev, circleSec: v }))}
                    min={0}
                    max={59}
                    step={10}
                    placeholder="30"
                    disabled={isSubmitting}
                    accessibilityLabel={t("practiceLogTemplates.createModal.circleSecUnit")}
                  />
                </View>
              </View>

              {/* メモ */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("practiceLogTemplates.createModal.noteLabel")}
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.note}
                  onChangeText={(v) => setForm((prev) => ({ ...prev, note: v }))}
                  placeholder={t("practiceLogTemplates.createModal.notePlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!isSubmitting}
                />
              </View>
            </ScrollView>

            {/* モーダルフッター */}
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelButtonText}>
                  {t("practiceLogTemplates.createModal.cancelButton")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.submitButton,
                  (!form.name.trim() || isSubmitting) && styles.buttonDisabled,
                ]}
                onPress={() => void handleSubmit()}
                disabled={!form.name.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {editingTemplate
                      ? t("practiceLogTemplates.createModal.editButton")
                      : t("practiceLogTemplates.createModal.createButton")}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  savedCount: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 40,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    gap: 16,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  cardDetail: {
    fontSize: 13,
    color: "#4B5563",
  },
  cardUseCount: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  dashedCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 10,
  },
  dashedCreateButtonDisabled: {
    borderColor: "#E5E7EB",
  },
  dashedCreateButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#4B5563",
  },
  dashedCreateButtonTextDisabled: {
    color: "#9CA3AF",
  },

  // モーダル
  modalOverlay: {
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
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#111827",
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalContent: {
    padding: 16,
    gap: 16,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  field: {
    gap: 8,
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  chipText: {
    fontSize: 14,
    color: "#374151",
  },
  chipTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  submitButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
