import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  usePreventRemove,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { StyleChipSelector } from "@/components/forms/StyleChipSelector";
import { ErrorView } from "@/components/layout/ErrorView";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { CompetitionPickerSheet } from "@/components/goals/CompetitionPickerSheet";
import { TimeSecondsInput } from "@/components/goals/TimeSecondsInput";
import { CompetitionBasicFields } from "@/components/competitions/CompetitionBasicFields";
import { useDateLocale } from "@/hooks/useDateLocale";
import type { MainStackParamList } from "@/navigation/types";
import { GoalAPI } from "@apps/shared/api/goals";
import { RecordAPI } from "@apps/shared/api/records";
import { StyleAPI } from "@apps/shared/api/styles";
import { goalKeys, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import { recordKeys, styleKeys } from "@apps/shared/hooks/queries/keys";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { formatDate } from "@apps/shared/utils/date";

type NavProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, "GoalForm">;

/** タイム入力欄の上限 (60分)。web の目標フォームと同じ */
const MAX_TIME_SECONDS = 3600;

interface GoalFormState {
  competitionMode: "existing" | "new";
  selectedCompetitionId: string;
  newCompetition: {
    title: string;
    date: string;
    /** 終了日 (複数日開催のみ。単日は空文字) */
    endDate: string;
    place: string;
    poolType: number;
  };
  styleId: string;
  targetTime: number | null;
  startTime: number | null;
}

function createInitialForm(today: string): GoalFormState {
  return {
    competitionMode: "existing",
    selectedCompetitionId: "",
    newCompetition: { title: "", date: today, endDate: "", place: "", poolType: 0 },
    styleId: "",
    targetTime: null,
    startTime: null,
  };
}

/**
 * 目標フォーム (作成・編集兼用)。goalId があれば編集。
 * 対象大会は既存大会 (個人 + チーム) の選択か新規大会の入力のどちらかで必須。
 */
export const GoalFormScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const goalId = useRoute<RouteProps>().params?.goalId;
  const isEdit = goalId !== undefined;
  const { supabase, user } = useAuth();
  const queryClient = useQueryClient();
  const locale = useDateLocale();

  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase]);
  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const [form, setForm] = useState<GoalFormState>(() => createInitialForm(today));
  const [isInitialized, setIsInitialized] = useState(!isEdit);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [startTimeInvalid, setStartTimeInvalid] = useState(false);
  const savingRef = useRef(false);
  // 編集時に新規大会を作成した後 updateGoal だけ失敗しても、再保存で大会を重複作成しない
  // 作成時の入力も保持し、再保存で入力が変わっていれば作成済みの大会を更新する
  const createdCompetitionRef = useRef<{
    id: string;
    input: {
      title: string;
      date: string;
      end_date: string | null;
      place: string | null;
      pool_type: number;
    };
  } | null>(null);
  // 種目 × 水路の自動入力を最後に反映したキー。編集で開いた直後は保存済みの初期タイムを守るため基準にだけ使う
  const autofillKeyRef = useRef<string | null>(null);
  // ユーザーが初期タイムを手入力した種目 × 水路のキー。そのキーでは自動入力で上書きしない
  const startTimeTouchedKeyRef = useRef<string | null>(null);
  // 自動入力で初期タイム欄の表示 (不正入力の残骸を含む) を作り直すためのキー
  const [startTimeResetKey, setStartTimeResetKey] = useState(0);
  const snapshotRef = useRef<string | null>(null);

  const patchForm = useCallback((patch: Partial<GoalFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: () => new StyleAPI(supabase).getStyles(),
    staleTime: 24 * 60 * 60 * 1000,
  });

  // 目標の対象にできる大会 (個人 + 所属チーム) のうち、大会日が今日以降のもの
  const competitionsQuery = useQuery({
    queryKey: [...goalKeys.all, "selectableCompetitions", today],
    queryFn: () => goalAPI.getSelectableCompetitions(today),
  });

  const { teams } = useTeamsQuery(supabase, { enableRealtime: false });
  const teamNames = useMemo(
    () => Object.fromEntries(teams.map((m) => [m.team_id, m.teams.name])),
    [teams],
  );

  const goalQuery = useGoalDetailQuery(supabase, goalId ?? null);
  const goal = goalQuery.data;

  // 編集中の目標の大会は過去日でも選択肢に含める
  const competitions = useMemo(() => {
    const list = competitionsQuery.data ?? [];
    const current = isEdit ? goal?.competition : null;
    if (current && !list.some((c) => c.id === current.id)) return [current, ...list];
    return list;
  }, [competitionsQuery.data, goal, isEdit]);

  // 作成: マウント時の入力値、編集: 目標の取得後に既存値を流し込んだ値を「未編集」の基準にする
  useEffect(() => {
    if (snapshotRef.current !== null) return;
    if (!isEdit) {
      snapshotRef.current = JSON.stringify(form);
      return;
    }
    if (!goal?.competition) return;
    const next: GoalFormState = {
      ...createInitialForm(today),
      selectedCompetitionId: goal.competition.id,
      styleId: String(goal.style_id),
      targetTime: goal.target_time,
      startTime: goal.start_time,
    };
    snapshotRef.current = JSON.stringify(next);
    setForm(next);
    setIsInitialized(true);
  }, [isEdit, goal, form, today]);

  const changedFromSnapshot = useMemo(
    () => snapshotRef.current !== null && JSON.stringify(form) !== snapshotRef.current,
    [form],
  );

  usePreventRemove(!isSaved && changedFromSnapshot, ({ data }) => {
    Alert.alert(t("common.discardTitle"), t("common.discardMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.discard"),
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // isSaved の再レンダー commit 後に goBack することで preventRemove=false が確定した状態で戻る
  useEffect(() => {
    if (isSaved) navigation.goBack();
  }, [isSaved, navigation]);

  // 対象大会の水路 (0: 短水路, 1: 長水路)。大会が未選択なら undefined (短水路に倒さない)
  const selectedCompetition = competitions.find((c) => c.id === form.selectedCompetitionId);
  const selectedPoolType =
    form.competitionMode === "new" ? form.newCompetition.poolType : selectedCompetition?.pool_type;

  // 初期タイムは「種目 × 対象大会の水路」の自己ベストを自動入力する。全種目のベストを1回取得して
  // 手元で引くので、種目を素早く切り替えても古い応答に上書きされない。リレー引き継ぎは除く。
  // 記録画面で更新した直後のベストを使うため、キャッシュを持たず (gcTime 0)、この画面を開いた後に
  // 取得したデータ (isFetchedAfterMount) でだけ自動入力する
  const bestTimesQuery = useQuery({
    queryKey: [...goalKeys.all, "bestTimesForForm"],
    queryFn: () => recordAPI.getBestTimes(),
    gcTime: 0,
  });
  const bestTimes = bestTimesQuery.isFetchedAfterMount ? bestTimesQuery.data : undefined;
  const autofillKey =
    form.styleId && selectedPoolType !== undefined ? `${form.styleId}:${selectedPoolType}` : null;
  useEffect(() => {
    if (!isInitialized || autofillKey === null) return;
    if (autofillKey === autofillKeyRef.current) return;
    // 別のキーへ移ったら手入力の記録は破棄する (戻ってきたときは通常どおり自動入力する)
    if (startTimeTouchedKeyRef.current !== autofillKey) startTimeTouchedKeyRef.current = null;
    if (isEdit && autofillKeyRef.current === null) {
      autofillKeyRef.current = autofillKey;
      return;
    }
    // 取得中・取得失敗のあいだは初期タイムを変えない
    if (!bestTimes) return;
    autofillKeyRef.current = autofillKey;
    // このキーで既に手入力されていれば上書きしない
    if (startTimeTouchedKeyRef.current === autofillKey) return;
    const styleId = parseInt(form.styleId, 10);
    const best = bestTimes.find(
      (bt) => bt.style_id === styleId && bt.pool_type === selectedPoolType && !bt.is_relaying,
    );
    setForm((prev) => ({ ...prev, startTime: best?.time ?? null }));
    setStartTimeInvalid(false);
    setStartTimeResetKey((k) => k + 1);
  }, [isInitialized, isEdit, autofillKey, form.styleId, selectedPoolType, bestTimes]);

  // 新規大会の入力エラー (保存時の検証と同じ条件をその場で表示する)
  const newCompetitionErrors =
    form.competitionMode === "new"
      ? {
          date: form.newCompetition.date < today ? t("goals.form.competitionDatePast") : undefined,
          endDate:
            form.newCompetition.endDate !== "" &&
            form.newCompetition.endDate < form.newCompetition.date
              ? t("competition.form.endBeforeStart")
              : undefined,
        }
      : undefined;

  const validate = (): string | null => {
    const hasCompetition =
      form.competitionMode === "existing"
        ? form.selectedCompetitionId !== ""
        : form.newCompetition.title.trim() !== "" && form.newCompetition.date !== "";
    if (!hasCompetition) return t("goals.create.competitionRequired");
    // 新規大会の日付は今日以降のみ (既存大会の選択肢と同じ。今日は可)
    if (form.competitionMode === "new" && newCompetitionErrors?.date) {
      return newCompetitionErrors.date;
    }
    if (form.competitionMode === "new" && newCompetitionErrors?.endDate) {
      return newCompetitionErrors.endDate;
    }
    if (!form.styleId) return t("goals.edit.validation.styleNotSelected");
    if (form.targetTime === null || form.targetTime <= 0 || form.targetTime > MAX_TIME_SECONDS) {
      return isEdit
        ? t("goals.edit.validation.targetTimeInvalid")
        : t("goals.create.targetTimeInvalid");
    }
    if (startTimeInvalid) {
      return isEdit
        ? t("goals.edit.validation.startTimeInvalid")
        : t("goals.create.startTimeInvalid");
    }
    if (form.startTime !== null && (form.startTime <= 0 || form.startTime > MAX_TIME_SECONDS)) {
      return isEdit
        ? t("goals.edit.validation.startTimeInvalid")
        : t("goals.create.startTimeInvalid");
    }
    return null;
  };

  const handleSave = async () => {
    if (savingRef.current || !user) return;
    const validationError = validate();
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    // validate() が targetTime / styleId の存在を保証している
    const targetTime = form.targetTime;
    if (targetTime === null) return;
    const styleId = parseInt(form.styleId, 10);
    const newCompetition = {
      title: form.newCompetition.title.trim(),
      date: form.newCompetition.date,
      endDate: form.newCompetition.endDate || null,
      place: form.newCompetition.place.trim() || null,
      poolType: form.newCompetition.poolType,
    };

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      if (isEdit) {
        let competitionId = form.selectedCompetitionId;
        if (form.competitionMode === "new") {
          const input = {
            title: newCompetition.title,
            date: newCompetition.date,
            end_date: newCompetition.endDate,
            place: newCompetition.place,
            pool_type: newCompetition.poolType,
          };
          const created = createdCompetitionRef.current;
          if (created === null) {
            const competition = await recordAPI.createCompetition({ ...input, note: null });
            createdCompetitionRef.current = { id: competition.id, input };
            competitionId = competition.id;
          } else {
            // 失敗後に入力を直して再保存された場合は、作成済みの大会を更新する (孤児を増やさない)
            if (JSON.stringify(created.input) !== JSON.stringify(input)) {
              await recordAPI.updateCompetition(created.id, input);
              createdCompetitionRef.current = { id: created.id, input };
            }
            competitionId = created.id;
          }
        }
        await goalAPI.updateGoal(goalId, {
          competitionId,
          styleId,
          targetTime,
          startTime: form.startTime,
        });
      } else {
        await goalAPI.createGoal({
          userId: user.id,
          competitionId:
            form.competitionMode === "existing" ? form.selectedCompetitionId : undefined,
          competitionData: form.competitionMode === "new" ? newCompetition : undefined,
          styleId,
          targetTime,
          startTime: form.startTime,
          poolType: selectedPoolType,
        });
      }
      void queryClient.invalidateQueries({ queryKey: goalKeys.all });
      setIsSaved(true);
    } catch (error) {
      // RLS 拒否などの生エラー文言は出さず、固定文言のみ表示する
      console.error("Failed to save goal:", error);
      setSaveError(isEdit ? t("goals.edit.updateFailed") : t("goals.create.createFailed"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (stylesQuery.isError && !stylesQuery.data) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={t("goals.list.loadError")}
          onRetry={() => void stylesQuery.refetch()}
          fullScreen
        />
      </View>
    );
  }

  if (isEdit) {
    if (goalQuery.isError && goal === undefined) {
      return (
        <View style={styles.container}>
          <ErrorView
            message={t("goals.detail.loadError")}
            onRetry={() => void goalQuery.refetch()}
            fullScreen
          />
        </View>
      );
    }
    if (goal === null) {
      return (
        <View style={styles.container}>
          <Text style={styles.centerMessage}>{t("goals.mobile.notFound")}</Text>
        </View>
      );
    }
    // 大会情報が無い目標は編集できない (一覧・詳細は編集導線を出さないが、goalId 直指定でも拒否する)
    if (goal !== undefined && goal.competition === null) {
      return (
        <View style={styles.container}>
          <Text style={styles.centerMessage}>{t("goals.list.editUnavailableReason")}</Text>
        </View>
      );
    }
  }

  if (!isInitialized || !stylesQuery.data) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  const selectedCompetitionLabel = selectedCompetition
    ? `${selectedCompetition.title || t("goals.form.competitionFallback")} - ${formatDate(selectedCompetition.date, "numeric", locale)}`
    : null;

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 大会 */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("goals.form.competitionLabel")}</Text>
          <View style={styles.segment}>
            {(["existing", "new"] as const).map((mode) => {
              const active = form.competitionMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  onPress={() => patchForm({ competitionMode: mode })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {mode === "existing"
                      ? t("goals.form.existingCompetitionRadio")
                      : t("goals.form.newCompetitionRadio")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {form.competitionMode === "existing" ? (
            <Pressable
              style={styles.selectField}
              onPress={() => setIsPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("goals.form.competitionLabel")}
            >
              <Text
                style={[styles.selectText, !selectedCompetitionLabel && styles.selectPlaceholder]}
                numberOfLines={1}
              >
                {selectedCompetitionLabel ?? t("goals.form.selectCompetitionPlaceholder")}
              </Text>
              <Feather name="chevron-down" size={18} color="#6B7280" />
            </Pressable>
          ) : (
            <View style={styles.newCompetition}>
              <CompetitionBasicFields
                date={form.newCompetition.date}
                endDate={form.newCompetition.endDate}
                title={form.newCompetition.title}
                place={form.newCompetition.place}
                poolType={form.newCompetition.poolType}
                onDateChange={(date) => patchForm({ newCompetition: { ...form.newCompetition, date } })}
                onEndDateChange={(endDate) =>
                  patchForm({ newCompetition: { ...form.newCompetition, endDate } })
                }
                onTitleChange={(title) =>
                  patchForm({ newCompetition: { ...form.newCompetition, title } })
                }
                onPlaceChange={(place) =>
                  patchForm({ newCompetition: { ...form.newCompetition, place } })
                }
                onPoolTypeChange={(poolType) =>
                  patchForm({ newCompetition: { ...form.newCompetition, poolType } })
                }
                errors={newCompetitionErrors}
                minDate={parseISO(today)}
                disabled={isSaving}
              />
            </View>
          )}
        </View>

        {/* 種目 */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("goals.form.styleLabel")}</Text>
          {stylesQuery.data.length > 0 ? (
            <StyleChipSelector
              styles={stylesQuery.data}
              value={form.styleId}
              onChange={(styleId) => patchForm({ styleId })}
              testID="goal-style"
            />
          ) : (
            <Text style={styles.hint}>{t("goals.form.selectStylePlaceholder")}</Text>
          )}
        </View>

        {/* 目標タイム・初期タイム (初期タイムは種目 × 水路の自己ベストが自動で入る) */}
        <View style={styles.timeRow}>
          <View style={styles.timeColumn}>
            <Text
              style={styles.timeLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t("goals.form.targetTimeLabel")}
            </Text>
            <TimeSecondsInput
              value={form.targetTime}
              onChange={(targetTime) => patchForm({ targetTime })}
              placeholder={t("goals.form.targetTimePlaceholder")}
              required
              requiredErrorMessage={t("goals.paramsForm.timeRequired")}
              invalidErrorMessage={t("goals.paramsForm.timeInvalid")}
              accessibilityLabel={t("goals.form.targetTimeLabel")}
              testID="goal-target-time"
            />
          </View>
          <View style={styles.timeColumn}>
            <Text
              style={styles.timeLabel}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {t("goals.form.startTimeLabel")}
            </Text>
            <TimeSecondsInput
              key={startTimeResetKey}
              value={form.startTime}
              onChange={(startTime) => {
                startTimeTouchedKeyRef.current = autofillKey;
                patchForm({ startTime });
              }}
              onInvalidChange={setStartTimeInvalid}
              forceInvalid={startTimeInvalid && !!saveError}
              placeholder={
                autofillKey !== null && !bestTimes && bestTimesQuery.isFetching
                  ? t("common.loading")
                  : t("goals.form.startTimePlaceholder")
              }
              invalidErrorMessage={t("goals.paramsForm.timeInvalid")}
              accessibilityLabel={t("goals.form.startTimeLabel")}
              testID="goal-start-time"
            />
          </View>
        </View>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        {saveError && (
          <Text style={styles.errorText} accessibilityRole="alert">
            {saveError}
          </Text>
        )}
        <Pressable
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          accessibilityRole="button"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isEdit ? t("goals.edit.submitButton") : t("goals.create.submitButton")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>

      <CompetitionPickerSheet
        visible={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        competitions={competitions}
        teamNames={teamNames}
        selectedId={form.selectedCompetitionId}
        onSelect={(competitionId) => {
          patchForm({ selectedCompetitionId: competitionId });
          setIsPickerOpen(false);
        }}
      />
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
  hint: {
    fontSize: 13,
    color: "#6B7280",
  },
  segment: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    overflow: "hidden",
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  segmentButtonActive: {
    backgroundColor: "#2563EB",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  selectField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  selectText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  selectPlaceholder: {
    color: "#9CA3AF",
  },
  newCompetition: {
    gap: 14,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  timeColumn: {
    flex: 1,
    gap: 8,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
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
    borderTopColor: "#E5E7EB",
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
