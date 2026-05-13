import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format, parseISO, isValid, isBefore } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
} from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { useCompetitionFormStore } from "@/stores/competitionFormStore";
import { useIOSCalendarSync } from "@/hooks/useIOSCalendarSync";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ImageUploader, ImageFile, ExistingImage } from "@/components/shared/ImageUploader";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { uploadImagesViaApi, deleteImages, getExistingImagesFromPaths } from "@/utils/imageUpload";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { PREMIUM_MESSAGES } from "@swim-hub/shared/constants/premium";
import type { MainStackParamList } from "@/navigation/types";

type CompetitionFormScreenRouteProp = RouteProp<MainStackParamList, "CompetitionForm">;
type CompetitionFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

type PoolTypeOption = { value: number; labelKey: string };
const POOL_TYPES: PoolTypeOption[] = [
  { value: 0, labelKey: "competition.form.poolTypeShort" },
  { value: 1, labelKey: "competition.form.poolTypeLong" },
];

/**
 * 大会基本情報作成・編集画面
 * 大会の基本情報（日付、大会名、場所、プール種別、メモ）を入力・編集
 */
export const CompetitionBasicFormScreen: React.FC = () => {
  const route = useRoute<CompetitionFormScreenRouteProp>();
  const navigation = useNavigation<CompetitionFormScreenNavigationProp>();
  const { competitionId, date: initialDateParam } = route.params;
  const { supabase, subscription, getAccessToken } = useAuth();
  const isPremium = checkIsPremium(subscription);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // ユーザープロフィール取得（iOSカレンダー設定確認用）
  const { profile } = useUserQuery(supabase, { enableRealtime: false });

  // iOSカレンダー同期フック
  const { syncCompetition } = useIOSCalendarSync();

  // フォーム状態
  const [date, setDate] = useState(initialDateParam || format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState("");
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [poolType, setPoolType] = useState<number>(0);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCompetition, setLoadingCompetition] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 二重送信防止用のref
  const isSubmittingRef = useRef(false);

  // 画像の状態管理
  const [newImageFiles, setNewImageFiles] = useState<ImageFile[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);

  // 画像変更のハンドラー
  const handleImagesChange = useCallback((newFiles: ImageFile[], deletedIds: string[]) => {
    setNewImageFiles(newFiles);
    setDeletedImageIds(deletedIds);
  }, []);

  // Zustandストア
  const setCreatedCompetitionId = useCompetitionFormStore((state) => state.setCreatedCompetitionId);
  const setStoreLoading = useCompetitionFormStore((state) => state.setLoading);

  // ミューテーション
  const createMutation = useCreateCompetitionMutation(supabase);
  const updateMutation = useUpdateCompetitionMutation(supabase);

  // 大会データを取得（編集モードの場合）
  useEffect(() => {
    if (!competitionId) return;

    let isMounted = true;

    const fetchCompetition = async () => {
      try {
        setLoadingCompetition(true);

        // 特定のIDで直接取得
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

        const { data: competition, error } = await supabase
          .from("competitions")
          .select("*")
          .eq("id", competitionId)
          .single();

        if (!isMounted) return;

        if (error) {
          if (error.code === "PGRST116") {
            // 大会が見つからない場合
            Alert.alert(t("common.error"), t("competition.mobile.notFound"));
            navigation.goBack();
            return;
          }
          throw error;
        }

        if (competition) {
          setDate(competition.date);
          setEndDate(competition.end_date || "");
          setTitle(competition.title || "");
          setPlace(competition.place || "");
          setPoolType(competition.pool_type ?? 0);
          setNote(competition.note || "");
          // 既存画像を読み込み
          const images = getExistingImagesFromPaths(
            supabase,
            competition.image_paths,
            "competition-images",
          );
          setExistingImages(images);
        }
      } catch (error) {
        if (!isMounted) return;
        console.error("大会取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.mobile.fetchFailed"));
        navigation.goBack();
      } finally {
        if (isMounted) {
          setLoadingCompetition(false);
        }
      }
    };

    fetchCompetition();

    return () => {
      isMounted = false;
    };
  }, [competitionId, supabase, navigation]);

  // バリデーション
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 日付のバリデーション
    if (!date || date.trim() === "") {
      newErrors.date = t("competition.form.dateRequired");
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        newErrors.date = t("competition.form.dateFormatInvalid");
      }
    }

    // 終了日のバリデーション
    if (endDate && endDate.trim() !== "") {
      // フォーマット検証（YYYY-MM-DD）
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(endDate)) {
        newErrors.endDate = t("competition.form.dateFormatInvalid");
      } else {
        // 日付として有効か確認
        const parsedEndDate = parseISO(endDate);
        if (!isValid(parsedEndDate)) {
          newErrors.endDate = t("competition.form.dateInvalid");
        } else {
          // 開始日が有効な場合のみ比較
          if (date && date.trim() !== "") {
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (dateRegex.test(date)) {
              const parsedStartDate = parseISO(date);
              if (isValid(parsedStartDate)) {
                // 終了日が開始日より前でないか確認
                if (isBefore(parsedEndDate, parsedStartDate)) {
                  newErrors.endDate = t("competition.form.endBeforeStart");
                }
              }
            }
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 大会データの保存共通処理（編集・新規作成の両方に対応）
  // 成功時は保存された大会IDを返す
  const saveCompetitionData = async (): Promise<string> => {
    // 最新の access_token を取得（長時間バックグラウンド後のリフレッシュ対応）
    // stale な user state より先に呼び、リフレッシュのチャンスを与える
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error(t("practice.mobile.sessionInvalid"));
    }

    if (competitionId) {
      // 編集モード
      // 1. 新規画像をアップロード
      let newImagePaths: string[] = [];
      if (newImageFiles.length > 0) {
        const uploadResults = await uploadImagesViaApi(
          newImageFiles.map((f) => ({
            base64: f.base64,
            fileExtension: f.fileExtension,
          })),
          competitionId,
          "competition-images",
          accessToken,
        );
        newImagePaths = uploadResults.map((r) => r.path);
      }

      // 2. 既存画像パスから削除されたものを除外し、新規画像パスを追加
      const currentPaths = existingImages
        .filter((img) => !deletedImageIds.includes(img.id))
        .map((img) => img.id);
      const updatedImagePaths = [...currentPaths, ...newImagePaths];

      const formData = {
        date,
        end_date: endDate && endDate.trim() !== "" ? endDate : null,
        title: title && title.trim() !== "" ? title.trim() : null,
        place: place && place.trim() !== "" ? place.trim() : null,
        pool_type: poolType,
        note: note && note.trim() !== "" ? note.trim() : null,
        image_paths: updatedImagePaths.length > 0 ? updatedImagePaths : [],
      };

      // 3. DB更新
      const updatedCompetition = await updateMutation.mutateAsync({
        id: competitionId,
        updates: formData,
      });

      // 4. DB更新成功後に削除対象画像をストレージから削除
      if (deletedImageIds.length > 0) {
        await deleteImages(supabase, deletedImageIds, "competition-images");
      }

      // 5. iOSカレンダー同期（iOS端末かつ連携が有効な場合）
      // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
      if (
        Platform.OS === "ios" &&
        profile?.ios_calendar_enabled &&
        profile?.ios_calendar_sync_competitions
      ) {
        try {
          await syncCompetition(updatedCompetition, "update");
        } catch (syncError) {
          console.warn("カレンダー同期エラー:", syncError);
          Alert.alert(
            t("competition.mobile.calendarSyncFailedTitle"),
            t("competition.mobile.calendarSyncFailedMessage"),
            [{ text: "OK" }],
          );
        }
      }

      return competitionId;
    } else {
      // 新規作成モード
      const formData = {
        date,
        end_date: endDate && endDate.trim() !== "" ? endDate : null,
        title: title && title.trim() !== "" ? title.trim() : null,
        place: place && place.trim() !== "" ? place.trim() : null,
        pool_type: poolType,
        note: note && note.trim() !== "" ? note.trim() : null,
      };

      const newCompetition = await createMutation.mutateAsync(formData);

      // 新規画像をアップロード
      if (newImageFiles.length > 0) {
        const uploadResults = await uploadImagesViaApi(
          newImageFiles.map((f) => ({
            base64: f.base64,
            fileExtension: f.fileExtension,
          })),
          newCompetition.id,
          "competition-images",
          accessToken,
        );
        const imagePaths = uploadResults.map((r) => r.path);

        // 大会を画像パスで更新（失敗時はアップロード済みファイルを削除）
        try {
          await updateMutation.mutateAsync({
            id: newCompetition.id,
            updates: { image_paths: imagePaths },
          });
        } catch (updateError) {
          // 更新失敗時はアップロード済みファイルをクリーンアップ
          await deleteImages(supabase, imagePaths, "competition-images");
          throw updateError;
        }
      }

      // iOSカレンダー同期（iOS端末かつ連携が有効な場合）
      // カレンダー同期エラーはDB保存成功後なので、別途通知してエラーを握りつぶす
      if (
        Platform.OS === "ios" &&
        profile?.ios_calendar_enabled &&
        profile?.ios_calendar_sync_competitions
      ) {
        try {
          await syncCompetition(newCompetition, "create");
        } catch (syncError) {
          console.warn("カレンダー同期エラー:", syncError);
          Alert.alert(
            t("competition.mobile.calendarSyncFailedTitle"),
            t("competition.mobile.calendarSyncFailedMessage"),
            [{ text: "OK" }],
          );
        }
      }

      return newCompetition.id;
    }
  };

  // 保存処理（保存してダッシュボードに戻る）
  const handleSave = async () => {
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setStoreLoading(true);
    setErrors({});

    try {
      await saveCompetitionData();
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      navigation.popToTop();
    } catch (error) {
      console.error("保存エラー:", error);
      Alert.alert(t("common.error"), error instanceof Error ? error.message : t("competition.mobile.saveFailed"), [
        { text: "OK" },
      ]);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setStoreLoading(false);
    }
  };

  // 続けてエントリーを作成（EntryFormへ遷移）
  const handleContinueToEntry = async () => {
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setStoreLoading(true);
    setErrors({});

    try {
      const resultId = await saveCompetitionData();
      if (!competitionId) {
        setCreatedCompetitionId(resultId);
      }
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      navigation.navigate("EntryForm", {
        competitionId: resultId,
        date,
      });
    } catch (error) {
      console.error("保存エラー:", error);
      Alert.alert(t("common.error"), error instanceof Error ? error.message : t("competition.mobile.saveFailed"), [
        { text: "OK" },
      ]);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setStoreLoading(false);
    }
  };

  // 続けて記録を入力（過去の大会：EntryFormをスキップしてRecordLogFormへ遷移）
  const handleContinueToRecord = async () => {
    if (isSubmittingRef.current) return;
    if (!validate()) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setStoreLoading(true);
    setErrors({});

    try {
      const resultId = await saveCompetitionData();
      if (!competitionId) {
        setCreatedCompetitionId(resultId);
      }
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      navigation.navigate("RecordLogForm", {
        competitionId: resultId,
        entryDataList: [],
        date,
      });
    } catch (error) {
      console.error("保存エラー:", error);
      Alert.alert(t("common.error"), error instanceof Error ? error.message : t("competition.mobile.saveFailed"), [
        { text: "OK" },
      ]);
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setStoreLoading(false);
    }
  };

  // 日付が今日以前かどうかを判定
  const isDateTodayOrPast = () => {
    const parsed = parseISO(date);
    if (!isValid(parsed)) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    parsed.setHours(0, 0, 0, 0);
    return parsed <= today;
  };

  // キャンセル処理
  const handleCancel = () => {
    navigation.goBack();
  };

  if (loadingCompetition) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("competition.mobile.loadingInfo")} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* 日付（開始日・終了日） */}
        <View style={styles.section}>
          <View style={styles.dateRow}>
            <View style={styles.dateColumn}>
              <Text style={styles.label}>
                {t("competition.form.startDateLabel")} <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.dateInput, errors.date && styles.inputError]}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                editable={!loading}
              />
              {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
            </View>

            <View style={styles.dateColumn}>
              <Text style={styles.label}>
                {t("competition.form.endDateLabel")}{" "}
                <Text style={styles.optional}>{t("competition.form.multiDayHint")}</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.dateInput, errors.endDate && styles.inputError]}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                editable={!loading}
              />
              {errors.endDate && <Text style={styles.errorText}>{errors.endDate}</Text>}
            </View>
          </View>
        </View>

        {/* 大会名 */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("competition.form.nameLabel")}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t("competition.form.namePlaceholder")}
            editable={!loading}
          />
        </View>

        {/* 場所 */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("competition.form.placeLabel")}</Text>
          <TextInput
            style={styles.input}
            value={place}
            onChangeText={setPlace}
            placeholder={t("competition.form.placePlaceholder")}
            editable={!loading}
          />
        </View>

        {/* プール種別 */}
        <View style={styles.section}>
          <Text style={styles.label}>
            {t("competition.form.poolTypeLabel")} <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.pickerContainer}>
            {POOL_TYPES.map((type) => (
              <Pressable
                key={type.value}
                style={[
                  styles.pickerOption,
                  poolType === type.value && styles.pickerOptionSelected,
                ]}
                onPress={() => setPoolType(type.value)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    poolType === type.value && styles.pickerOptionTextSelected,
                  ]}
                >
                  {t(type.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* メモ */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("competition.form.memoLabel")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder={t("competition.form.memoPlaceholder")}
            multiline
            numberOfLines={3}
            editable={!loading}
          />
        </View>

        {/* 画像 */}
        <View style={styles.section}>
          {isPremium ? (
            <ImageUploader
              existingImages={existingImages}
              onImagesChange={handleImagesChange}
              maxImages={3}
              disabled={loading}
              label={t("competition.form.imagesLabel")}
            />
          ) : (
            <PremiumBadge message={PREMIUM_MESSAGES.image_upload} />
          )}
        </View>
      </ScrollView>

      {/* フッター */}
      <View style={styles.footer}>
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.cancelButton, loading && styles.buttonDisabled]}
            onPress={handleCancel}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>{t("common.cancel")}</Text>
          </Pressable>
          <Pressable
            style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>{t("common.save")}</Text>
            )}
          </Pressable>
        </View>

        {/* 新規作成時: 日付が今日以前なら記録入力へ直接遷移、未来ならエントリーを作成 */}
        {!competitionId && isDateTodayOrPast() ? (
          <Pressable
            style={[styles.continueButton, loading && styles.buttonDisabled]}
            onPress={handleContinueToRecord}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={styles.continueButtonText}>{t("competition.mobile.continueToRecord")}</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.continueButton, loading && styles.buttonDisabled]}
            onPress={handleContinueToEntry}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={styles.continueButtonText}>{t("competition.mobile.continueToEntry")}</Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateColumn: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  optional: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  dateInput: {
    width: "100%",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
  },
  pickerContainer: {
    flexDirection: "row",
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  pickerOptionSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  pickerOptionText: {
    fontSize: 14,
    color: "#374151",
  },
  pickerOptionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  saveButton: {
    backgroundColor: "#2563EB",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  continueButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
