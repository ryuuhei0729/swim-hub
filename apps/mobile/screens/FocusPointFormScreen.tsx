import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Keyboard,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";
import { isFocusPointLimitError } from "@apps/shared/api/focusPoints";
import {
  FOCUS_POINT_MAX_ACTIVE,
  FOCUS_POINT_NOTE_MAX_LENGTH,
  FOCUS_POINT_TITLE_MAX_LENGTH,
} from "@apps/shared/constants/focusPoints";
import {
  useCreateFocusPointMutation,
  useDeleteFocusPointMutation,
  useFocusPointsQuery,
  useSetFocusPointStatusMutation,
  useUpdateFocusPointMutation,
} from "@apps/shared/hooks/queries/focusPoints";

type NavProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, "FocusPointForm">;

/**
 * フォーカスポイントの追加・編集。
 * 編集のときは「身についた / もう一度取り組む」と削除もここから行う。
 * ホームのカードと目標タブのカードの両方から開く
 */
export const FocusPointFormScreen: React.FC = () => {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteProps>();
  const { t } = useTranslation();
  const { supabase, user } = useAuth();
  const focusPointId = route.params?.focusPointId;
  const isEdit = !!focusPointId;

  const focusPointsQuery = useFocusPointsQuery(supabase, user?.id);
  const focusPoint = isEdit
    ? focusPointsQuery.data?.find((point) => point.id === focusPointId)
    : undefined;

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 削除・状態変更のあとは一覧の再取得で対象が消える (または移る) ので、
  // 画面を閉じるまでの間に「見つかりませんでした」を出さないための印
  const [isClosing, setIsClosing] = useState(false);

  // 編集のときは、一覧から対象が見つかった時点で1回だけ入力に流し込む
  // (保存後の再取得で入力中の値が上書きされないように)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current || !focusPoint) return;
    initializedRef.current = true;
    setTitle(focusPoint.title);
    setNote(focusPoint.note ?? "");
  }, [focusPoint]);

  const createMutation = useCreateFocusPointMutation(supabase);
  const updateMutation = useUpdateFocusPointMutation(supabase);
  const statusMutation = useSetFocusPointStatusMutation(supabase);
  const deleteMutation = useDeleteFocusPointMutation(supabase);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isBusy = isSaving || statusMutation.isPending || deleteMutation.isPending;

  const limitMessage = t("focusPoints.limitError", { max: FOCUS_POINT_MAX_ACTIVE });

  // 画面を閉じるときはキーボードも閉じる (Android は閉じないまま前の画面に残ることがある)
  const close = () => {
    Keyboard.dismiss();
    navigation.goBack();
  };

  // 入力し直したら、空欄のエラーは消す
  const handleTitleChange = (text: string) => {
    setTitle(text);
    if (error && text.trim() !== "") setError(null);
  };

  const handleSave = async () => {
    if (isBusy) return;
    if (title.trim() === "") {
      setError(t("focusPoints.form.titleRequired"));
      return;
    }
    setError(null);
    try {
      if (focusPointId) {
        await updateMutation.mutateAsync({ id: focusPointId, input: { title, note } });
      } else {
        await createMutation.mutateAsync({ title, note });
      }
      close();
    } catch (err) {
      console.error("Failed to save focus point:", err);
      setError(isFocusPointLimitError(err) ? limitMessage : t("focusPoints.form.saveFailed"));
    }
  };

  const handleToggleStatus = async () => {
    if (!focusPoint || isBusy) return;
    setError(null);
    setIsClosing(true);
    try {
      await statusMutation.mutateAsync({
        id: focusPoint.id,
        status: focusPoint.status === "active" ? "mastered" : "active",
      });
      close();
    } catch (err) {
      setIsClosing(false);
      console.error("Failed to change focus point status:", err);
      setError(isFocusPointLimitError(err) ? limitMessage : t("focusPoints.form.statusFailed"));
    }
  };

  const handleDelete = () => {
    if (!focusPoint || isBusy) return;
    Alert.alert(
      t("focusPoints.form.deleteConfirmTitle"),
      t("focusPoints.form.deleteConfirmMessage", { title: focusPoint.title }),
      [
        { text: t("focusPoints.form.cancel"), style: "cancel" },
        {
          text: t("focusPoints.form.delete"),
          style: "destructive",
          onPress: async () => {
            setError(null);
            setIsClosing(true);
            try {
              await deleteMutation.mutateAsync(focusPoint.id);
              close();
            } catch (err) {
              setIsClosing(false);
              console.error("Failed to delete focus point:", err);
              setError(t("focusPoints.form.deleteFailed"));
            }
          },
        },
      ],
    );
  };

  if (isEdit && !focusPoint && !isClosing) {
    return (
      <View style={styles.container}>
        {focusPointsQuery.isPending && !focusPointsQuery.isError ? (
          <LoadingSpinner />
        ) : (
          <Text style={styles.centerMessage}>{t("focusPoints.form.notFound")}</Text>
        )}
      </View>
    );
  }

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.label}>
            {t("focusPoints.form.titleLabel")}
          </Text>
          {/* 長いタイトルも全文が見えるよう折り返す。改行は入れさせず、リターンで閉じる */}
          <TextInput
            style={[styles.input, styles.titleInput]}
            value={title}
            onChangeText={handleTitleChange}
            placeholder={t("focusPoints.form.titlePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={FOCUS_POINT_TITLE_MAX_LENGTH}
            autoFocus={!isEdit}
            multiline
            submitBehavior="blurAndSubmit"
            returnKeyType="done"
            accessibilityLabel={t("focusPoints.form.titleLabel")}
            testID="focus-point-title-input"
          />
          <Text style={styles.counter}>
            {title.length} / {FOCUS_POINT_TITLE_MAX_LENGTH}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t("focusPoints.form.noteLabel")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder={t("focusPoints.form.notePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={FOCUS_POINT_NOTE_MAX_LENGTH}
            multiline
            textAlignVertical="top"
            accessibilityLabel={t("focusPoints.form.noteLabel")}
            testID="focus-point-note-input"
          />
        </View>

        {focusPoint && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.outlineButton, isBusy && styles.disabled]}
              onPress={() => void handleToggleStatus()}
              disabled={isBusy}
              accessibilityRole="button"
              testID="focus-point-toggle-status"
            >
              <Text style={styles.outlineButtonText}>
                {focusPoint.status === "active"
                  ? t("focusPoints.form.markMastered")
                  : t("focusPoints.form.reactivate")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.deleteButton, isBusy && styles.disabled]}
              onPress={handleDelete}
              disabled={isBusy}
              accessibilityRole="button"
              testID="focus-point-delete"
            >
              <Text style={styles.deleteButtonText}>{t("focusPoints.form.delete")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        {error && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {error}
          </Text>
        )}
        <Pressable
          style={[styles.primaryButton, isBusy && styles.disabled]}
          onPress={() => void handleSave()}
          disabled={isBusy}
          accessibilityRole="button"
          testID="focus-point-save"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isEdit ? t("focusPoints.form.save") : t("focusPoints.form.create")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>
    </FormKeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  input: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 16,
    color: colors.textPrimary,
  },
  titleInput: {
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: "top",
  },
  counter: {
    alignSelf: "flex-end",
    fontSize: 12,
    color: colors.textSecondary,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  outlineButton: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#FFFFFF",
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  deleteButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FFFFFF",
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
  },
  disabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
  },
  centerMessage: {
    padding: 24,
    fontSize: 15,
    color: "#374151",
    textAlign: "center",
  },
  footer: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
