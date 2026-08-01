import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
  Keyboard,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { EntryAPI } from "@apps/shared/api/entries";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { StyleAPI } from "@apps/shared/api/styles";
import { useCompetitionFormStore, type EntryInfo } from "@/stores/competitionFormStore";
import { localizedStyleName } from "@/utils/styleName";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import { resolveEntryMutations } from "@/utils/entryMutations";
import type { ResolveExistingEntry, ResolveFormEntry } from "@/utils/entryMutations";
import type { MainStackParamList } from "@/navigation/types";
import type { Style } from "@apps/shared/types";

type EntryFormScreenRouteProp = RouteProp<MainStackParamList, "EntryForm">;
type EntryFormScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

interface EntryData {
  id: string;
  styleId: string;
  entryTime: number; // 秒単位
  entryTimeDisplayValue: string; // 入力中の表示用
  note: string;
}

/**
 * エントリー登録画面
 * 大会にエントリーする種目とエントリータイムを入力
 */
export const EntryLogFormScreen: React.FC = () => {
  const route = useRoute<EntryFormScreenRouteProp>();
  const navigation = useNavigation<EntryFormScreenNavigationProp>();
  const { competitionId, entryId, date, teamId } = route.params;
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);

  // フォーム状態
  const [entries, setEntries] = useState<EntryData[]>([
    {
      id: "1",
      styleId: "",
      entryTime: 0,
      entryTimeDisplayValue: "",
      note: "",
    },
  ]);
  const [swimStyles, setSwimStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [pickingEntryIndex, setPickingEntryIndex] = useState<number | null>(null);
  const styleButtonRefs = useRef<Map<number, View>>(new Map());
  const [dropdownLayout, setDropdownLayout] = useState({ top: 0, left: 0, width: 0 });

  // Zustandストア
  const setCreatedEntries = useCompetitionFormStore((state) => state.setCreatedEntries);
  const setStoreLoading = useCompetitionFormStore((state) => state.setLoading);

  // 二重送信防止用のref
  const isSubmittingRef = useRef(false);

  // 種目一覧を取得
  useEffect(() => {
    const fetchStyles = async () => {
      try {
        const styleApi = new StyleAPI(supabase);
        const stylesData = await styleApi.getStyles();
        setSwimStyles(stylesData);
      } catch (error) {
        console.error("種目取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.entry.stylesFetchFailed"));
      } finally {
        setLoadingStyles(false);
      }
    };
    fetchStyles();
  }, [supabase, t]);

  // エントリーデータを取得（編集モードの場合）
  useEffect(() => {
    if (!entryId || loadingStyles || swimStyles.length === 0) return;

    let isMounted = true;

    const fetchEntry = async () => {
      try {
        setLoadingEntry(true);

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

        // まず、指定されたエントリーを取得してcompetitionIdを取得
        let competitionIdFromEntry: string;
        try {
          const firstEntry = await entryApi.getEntry(entryId);
          if (!firstEntry || !firstEntry.competition_id) {
            Alert.alert(t("common.error"), t("competition.entry.entryDataNotFound"));
            navigation.goBack();
            return;
          }
          competitionIdFromEntry = firstEntry.competition_id;
        } catch (error: unknown) {
          if (!isMounted) return;
          console.error("エントリー取得エラー詳細:", error);
          console.error("エントリー取得エラー - entryId:", entryId);
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorCode =
            error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
          if (errorMessage === t("auth.errorMap.accessDenied") || errorCode === "PGRST116") {
            // エントリーが見つからない場合
            Alert.alert(t("common.error"), t("competition.entry.entryNotFound"));
            navigation.goBack();
            return;
          }
          throw error;
        }

        if (!isMounted) return;

        // この大会のすべてのエントリーを取得（EntryAPIを使用）
        const allEntries = await entryApi.getEntriesByCompetition(competitionIdFromEntry);

        // 現在のユーザーのエントリーのみをフィルタリング
        const userEntries = allEntries.filter((entry) => entry.user_id === user.id);

        if (!isMounted) return;

        if (!userEntries || userEntries.length === 0) {
          Alert.alert(t("common.error"), t("competition.entry.entryDataNotFound"));
          navigation.goBack();
          return;
        }

        // すべてのエントリーをフォームに設定
        const entriesData = userEntries.map((entry) => ({
          id: entry.id,
          styleId: String(entry.style_id),
          entryTime: entry.entry_time || 0,
          entryTimeDisplayValue: entry.entry_time ? formatTimeBest(entry.entry_time) : "",
          note: entry.note || "",
        }));
        setEntries(entriesData);
      } catch (error) {
        if (!isMounted) return;
        console.error("エントリー取得エラー:", error);
        Alert.alert(t("common.error"), t("competition.entry.entryFetchFailed"));
        navigation.goBack();
      } finally {
        if (isMounted) {
          setLoadingEntry(false);
        }
      }
    };

    fetchEntry();

    return () => {
      isMounted = false;
    };
  }, [entryId, swimStyles.length, loadingStyles, supabase, navigation, entryApi, t]);

  // 新規作成モードの場合、最初のエントリーにデフォルトの種目を設定
  useEffect(() => {
    if (entryId || loadingStyles || swimStyles.length === 0) return;
    if (entries.length > 0 && !entries[0].styleId && swimStyles.length > 0) {
      setEntries((prev) =>
        prev.map((entry, index) =>
          index === 0 ? { ...entry, styleId: String(swimStyles[0].id) } : entry,
        ),
      );
    }
  }, [entryId, swimStyles, loadingStyles, entries]);

  // タイム文字列を秒数に変換 (blur / 保存時の確定値と同じ parseTimeFlexible 解釈)
  const parseTimeString = (timeString: string): number => {
    if (!timeString || timeString.trim() === "") return 0;
    return parseTimeFlexible(timeString) ?? 0;
  };

  // タイム文字列が有効かどうかを検証
  const isValidTimeString = (timeString: string): boolean => {
    if (!timeString || timeString.trim() === "") return true; // 空は有効（任意入力）
    return parseTimeFlexible(timeString) !== null;
  };

  // バリデーション
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 少なくとも1つのエントリーが必要
    if (entries.length === 0) {
      Alert.alert(t("common.error"), t("competition.entry.addAtLeastOne"));
      return false;
    }

    // 種目が選択されているか
    entries.forEach((entry, index) => {
      if (!entry.styleId) {
        newErrors[`style-${index}`] = t("competition.entry.selectStyleRequired");
      }
      // blur を経ずに保存された場合の解釈不能な形式を確定拒否する
      const rawTime = entry.entryTimeDisplayValue.trim();
      if (rawTime !== "" && parseTimeFlexible(rawTime) === null) {
        newErrors[`entryTime-${index}`] = t("competition.entry.timeFormatInvalid");
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // エントリー追加
  const addEntry = () => {
    const firstStyle = swimStyles.length > 0 ? swimStyles[0] : null;
    const newEntry: EntryData = {
      id: `entry-${Date.now()}`,
      styleId: firstStyle?.id ? String(firstStyle.id) : "",
      entryTime: 0,
      entryTimeDisplayValue: "",
      note: "",
    };
    setEntries((prev) => [...prev, newEntry]);
  };

  // エントリー削除
  const removeEntry = (entryId: string) => {
    if (entries.length > 1) {
      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    }
  };

  // エントリー更新
  const updateEntry = (entryId: string, updates: Partial<EntryData>) => {
    setEntries((prev) =>
      prev.map((entry, index) => {
        if (entry.id !== entryId) return entry;

        const updated = { ...entry, ...updates };

        // エントリータイムが更新された場合、表示値も更新
        if ("entryTimeDisplayValue" in updates) {
          const timeDisplayValue = updates.entryTimeDisplayValue || "";

          // 入力が空でない場合、形式を検証
          if (timeDisplayValue.trim() !== "") {
            if (!isValidTimeString(timeDisplayValue)) {
              // 不正な形式の場合、エラーメッセージを設定
              setErrors((prev) => ({
                ...prev,
                [`entryTime-${index}`]: t("competition.entry.timeFormatInvalid"),
              }));
            } else {
              // 正常な形式の場合、エラーをクリア
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[`entryTime-${index}`];
                return newErrors;
              });
            }
          } else {
            // 入力が空の場合、エラーをクリア
            setErrors((prev) => {
              const newErrors = { ...prev };
              delete newErrors[`entryTime-${index}`];
              return newErrors;
            });
          }

          const timeValue = parseTimeString(timeDisplayValue);
          updated.entryTime = timeValue;
        }

        return updated;
      }),
    );
  };

  // エントリータイム blur 時の確定・再フォーマット。
  // parseTimeFlexible で構造ガードし、"1.23.45" のような入力もクイック解釈
  // (1:23.45) で確定する。解釈不能な入力のみ確定拒否 + エラー表示
  const handleEntryTimeBlur = (entryId: string) => {
    setEntries((prev) =>
      prev.map((entry, index) => {
        if (entry.id !== entryId) return entry;
        const raw = entry.entryTimeDisplayValue.trim();
        if (raw === "") {
          setErrors((prevErrors) => {
            const next = { ...prevErrors };
            delete next[`entryTime-${index}`];
            return next;
          });
          return { ...entry, entryTime: 0 };
        }
        const parsed = parseTimeFlexible(raw);
        if (parsed === null) {
          setErrors((prevErrors) => ({
            ...prevErrors,
            [`entryTime-${index}`]: t("competition.entry.timeFormatInvalid"),
          }));
          return { ...entry, entryTime: 0 };
        }
        setErrors((prevErrors) => {
          const next = { ...prevErrors };
          delete next[`entryTime-${index}`];
          return next;
        });
        return {
          ...entry,
          entryTime: parsed,
          entryTimeDisplayValue: formatTimeBest(parsed),
        };
      }),
    );
  };

  // ドロップダウンを開く
  const screenHeight = Dimensions.get("window").height;
  const DROPDOWN_MAX_HEIGHT = 260;

  const openStylePicker = useCallback(
    (index: number) => {
      Keyboard.dismiss();
      const buttonRef = styleButtonRefs.current.get(index);
      buttonRef?.measureInWindow((x, y, width, height) => {
        const top = y + height + 4;
        const fitsBelow = top + DROPDOWN_MAX_HEIGHT < screenHeight - 40;
        setDropdownLayout({
          top: fitsBelow ? top : y - DROPDOWN_MAX_HEIGHT - 4,
          left: x,
          width,
        });
        setPickingEntryIndex(index);
        setShowStylePicker(true);
      });
    },
    [screenHeight],
  );

  // エントリー保存/更新の共通ヘルパー関数
  const saveOrUpdateEntries = async (
    entriesToSave: EntryData[],
    supabaseClient: typeof supabase,
    competitionIdParam: string,
    styles: Style[],
    entryAPIInstance: EntryAPI,
    teamIdParam?: string,
  ): Promise<EntryInfo[]> => {
    // 認証チェック
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

    // この大会・このユーザーの既存エントリーを取得（編集/新規どちらも、style 衝突解決のため取得）。
    // 新規作成モードでも、同一 style の既存エントリーがあれば update する必要がある
    // （UNIQUE(competition_id, user_id, style_id) 制約・web useTeamEntry.ts:230-242 準拠）。
    const allExistingEntries = await entryAPIInstance.getEntriesByCompetition(competitionIdParam);
    const existingEntries: ResolveExistingEntry[] = allExistingEntries
      .filter((entry) => entry.user_id === user.id)
      .map((entry) => ({ id: entry.id, styleId: entry.style_id }));

    // フォーム行を正規化（表示文字列ではなく確定値に変換）してから衝突解決。
    const formEntries: ResolveFormEntry[] = entriesToSave.map((entryData) => ({
      formId: entryData.id,
      styleId: parseInt(entryData.styleId, 10),
      entryTime: entryData.entryTime > 0 ? entryData.entryTime : null,
      note: entryData.note && entryData.note.trim() !== "" ? entryData.note.trim() : null,
    }));

    // 「各 style に対する最終意図」を保存前に 1 回で解決（同一 DB id を二度 update しない／
    // 残すべき編集値が旧値で上書きされない／消すべき行のみ削除される）。
    const { creates, updates, deletes } = resolveEntryMutations(
      formEntries,
      existingEntries,
      Boolean(entryId),
    );

    const createdEntriesList: EntryInfo[] = [];

    // 種目情報を createdEntriesList に積むためのヘルパー。
    const pushCreatedEntry = (styleId: number, entryTime: number | null) => {
      const style = styles.find((s) => s.id === styleId);
      if (style) {
        createdEntriesList.push({
          styleId,
          styleName: localizedStyleName(style, t),
          entryTime: entryTime ?? undefined,
        });
      }
    };

    // (a) 更新（既存 DB エントリーへ）。
    for (const update of updates) {
      const entry = await entryAPIInstance.updateEntry(update.id, {
        style_id: update.styleId,
        entry_time: update.entryTime,
        note: update.note,
      });
      pushCreatedEntry(entry.style_id, entry.entry_time);
    }

    // (b) 新規作成（チーム/個人）。
    for (const create of creates) {
      let entry;
      if (teamIdParam) {
        entry = await entryAPIInstance.createTeamEntry(teamIdParam, user.id, {
          competition_id: competitionIdParam,
          style_id: create.styleId,
          entry_time: create.entryTime,
          note: create.note,
          is_relaying: false,
        });
      } else {
        entry = await entryAPIInstance.createPersonalEntry({
          competition_id: competitionIdParam,
          style_id: create.styleId,
          entry_time: create.entryTime,
          note: create.note,
          is_relaying: false,
        });
      }
      pushCreatedEntry(entry.style_id, entry.entry_time);
    }

    // (c) フォームから消えた既存エントリーのみ削除（update 済み id とは互いに素）。
    for (const deleteId of deletes) {
      await entryAPIInstance.deleteEntry(deleteId);
    }

    // ストアに保存
    setCreatedEntries(createdEntriesList);

    // カレンダーのクエリを無効化してリフレッシュ
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    if (teamIdParam) {
      queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamIdParam) });
    }

    return createdEntriesList;
  };

  // 保存処理（保存してダッシュボードに戻る）
  const handleSave = async () => {
    // 二重送信防止
    if (isSubmittingRef.current) return;

    if (!validate()) {
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setStoreLoading(true);

    try {
      await saveOrUpdateEntries(entries, supabase, competitionId, swimStyles, entryApi, teamId);

      // 成功: ダッシュボードに戻る
      navigation.popToTop();
    } catch (error) {
      console.error("エントリー登録エラー:", error);
      Alert.alert(
        t("common.error"),
        error instanceof Error ? error.message : t("competition.entry.registrationFailed"),
        [{ text: "OK" }],
      );
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setStoreLoading(false);
    }
  };

  // 続けて大会記録を作成（RecordLogFormへ遷移）
  const handleContinueToRecord = async () => {
    // 二重送信防止
    if (isSubmittingRef.current) return;

    if (!validate()) {
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    setStoreLoading(true);

    try {
      const createdEntriesList = await saveOrUpdateEntries(
        entries,
        supabase,
        competitionId,
        swimStyles,
        entryApi,
        teamId,
      );

      // 記録入力フォームに遷移
      navigation.navigate("RecordLogForm", {
        competitionId,
        entryDataList: createdEntriesList,
        date,
        teamId,
      });
    } catch (error) {
      console.error("エントリー登録エラー:", error);
      Alert.alert(
        t("common.error"),
        error instanceof Error ? error.message : t("competition.entry.registrationFailed"),
        [{ text: "OK" }],
      );
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
      setStoreLoading(false);
    }
  };

  // スキップ処理
  const handleSkip = () => {
    // エントリーなしで記録入力フォームに遷移
    navigation.navigate("RecordLogForm", {
      competitionId,
      entryDataList: [],
      date,
      teamId,
    });
  };

  if (loadingStyles || loadingEntry) {
    return (
      <View style={styles.container}>
        <LoadingSpinner
          fullScreen
          message={
            loadingEntry ? t("competition.mobile.entryLoading") : t("competition.mobile.stylesLoading")
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* エントリー種目セクション */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>{t("competition.entry.title")}</Text>
            <Pressable style={styles.addButton} onPress={addEntry} disabled={loading}>
              <Feather name="plus" size={16} color="#2563EB" />
              <Text style={styles.addButtonText}>{t("competition.entry.addStyle")}</Text>
            </Pressable>
          </View>
          <TimeInputHelp />
        </View>

        {/* エントリー一覧 */}
        {entries.map((entry, index) => (
          <React.Fragment key={entry.id}>
            {/* エントリーヘッダー */}
            <View style={styles.entryHeaderSection}>
              <Text style={styles.entryNumber}>
                {t("competition.entry.styleNumber", { index: index + 1 })}
              </Text>
              {entries.length > 1 && (
                <Pressable
                  style={styles.removeButton}
                  onPress={() => removeEntry(entry.id)}
                  disabled={loading}
                >
                  <Feather name="trash-2" size={18} color="#EF4444" />
                </Pressable>
              )}
            </View>

            {/* 種目選択 */}
            <View style={styles.section}>
              <Text style={styles.label}>
                {t("competition.entry.styleLabel")} <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                ref={(ref) => {
                  if (ref) {
                    styleButtonRefs.current.set(index, ref);
                  } else {
                    styleButtonRefs.current.delete(index);
                  }
                }}
                style={[styles.pickerButton, errors[`style-${index}`] && styles.pickerButtonError]}
                onPress={() => openStylePicker(index)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerButtonText,
                    !entry.styleId && styles.pickerButtonPlaceholder,
                  ]}
                >
                  {entry.styleId
                    ? localizedStyleName(
                        swimStyles.find((s) => s.id.toString() === entry.styleId),
                        t,
                      ) || t("competition.entry.selectStyle")
                    : t("competition.entry.selectStyle")}
                </Text>
                <Feather name="chevron-down" size={20} color="#6B7280" />
              </Pressable>
              {errors[`style-${index}`] && (
                <Text style={styles.errorText}>{errors[`style-${index}`]}</Text>
              )}
            </View>

            {/* エントリータイム */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.entry.entryTimeLabel")}</Text>
              <TextInput
                style={[styles.input, errors[`entryTime-${index}`] && styles.inputError]}
                value={entry.entryTimeDisplayValue}
                onChangeText={(text) => updateEntry(entry.id, { entryTimeDisplayValue: text })}
                onBlur={() => handleEntryTimeBlur(entry.id)}
                placeholder={t("competition.entry.entryTimePlaceholder")}
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                editable={!loading}
              />
              {errors[`entryTime-${index}`] && (
                <Text style={styles.errorText}>{errors[`entryTime-${index}`]}</Text>
              )}
              {entry.entryTime > 0 && !errors[`entryTime-${index}`] && (
                <Text style={styles.timeHint}>
                  {t("competition.entry.inputValueHint", { time: formatTimeBest(entry.entryTime) })}
                </Text>
              )}
            </View>

            {/* メモ */}
            <View style={styles.section}>
              <Text style={styles.label}>{t("competition.entry.memoLabel")}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={entry.note}
                onChangeText={(text) => updateEntry(entry.id, { note: text })}
                placeholder={t("competition.entry.memoPlaceholder")}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                editable={!loading}
              />
            </View>
          </React.Fragment>
        ))}
      </ScrollView>

      {/* 種目選択ドロップダウン */}
      <Modal
        visible={showStylePicker}
        transparent
        animationType="none"
        onRequestClose={() => setShowStylePicker(false)}
      >
        <Pressable style={styles.dropdownOverlay} onPress={() => setShowStylePicker(false)}>
          <View
            style={[
              styles.dropdownContainer,
              { top: dropdownLayout.top, left: dropdownLayout.left, width: dropdownLayout.width },
            ]}
          >
            <ScrollView
              style={styles.dropdownScroll}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {swimStyles.map((style) => {
                const entry = entries[pickingEntryIndex ?? 0];
                const isSelected = entry?.styleId === String(style.id);
                return (
                  <Pressable
                    key={style.id}
                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                    onPress={() => {
                      if (pickingEntryIndex !== null) {
                        updateEntry(entries[pickingEntryIndex].id, {
                          styleId: String(style.id),
                        });
                      }
                      setShowStylePicker(false);
                      setPickingEntryIndex(null);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {localizedStyleName(style, t)}
                    </Text>
                    {isSelected && <Feather name="check" size={16} color="#2563EB" />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* フッター */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={styles.buttonContainer}>
          <Pressable
            style={[styles.button, styles.cancelButton, loading && styles.buttonDisabled]}
            onPress={handleSkip}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>{t("competition.entry.skipButton")}</Text>
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

        {/* 続けて大会記録を作成ボタン */}
        <Pressable
          style={[styles.continueButton, loading && styles.buttonDisabled]}
          onPress={handleContinueToRecord}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Text style={styles.continueButtonText}>
              {t("competition.entry.continueToRecord")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 0,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
  entryHeaderSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  entryNumber: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  removeButton: {
    padding: 4,
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
  inputError: {
    borderColor: "#EF4444",
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  pickerButtonError: {
    borderColor: "#EF4444",
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  pickerButtonPlaceholder: {
    color: "#9CA3AF",
  },
  dropdownOverlay: {
    flex: 1,
  },
  dropdownContainer: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    maxHeight: 260,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownScroll: {
    maxHeight: 260,
  },
  dropdownOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  dropdownOptionSelected: {
    backgroundColor: "#EFF6FF",
  },
  dropdownOptionText: {
    fontSize: 15,
    color: "#111827",
  },
  dropdownOptionTextSelected: {
    color: "#2563EB",
    fontWeight: "600",
  },
  timeHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 4,
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
