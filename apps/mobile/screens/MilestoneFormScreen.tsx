import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  usePreventRemove,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { format, isValid, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { ErrorView } from "@/components/layout/ErrorView";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { GoalSetCalculatorModal } from "@/components/goals/GoalSetCalculatorModal";
import {
  RepsTimeParamsFields,
  SetParamsFields,
  TimeParamsFields,
} from "@/components/goals/MilestoneParamsFields";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { useMilestoneSummary } from "@/hooks/useMilestoneSummary";
import type { MainStackParamList } from "@/navigation/types";
import { GoalAPI } from "@apps/shared/api/goals";
import {
  DEFAULT_REPS_TIME_PARAMS,
  DEFAULT_SET_PARAMS,
  DEFAULT_TIME_PARAMS,
  MILESTONE_TEMPLATES,
} from "@apps/shared/constants/goals";
import { goalKeys, useGoalDetailQuery } from "@apps/shared/hooks/queries/goals";
import { useCreatePracticeLogTemplateMutation } from "@apps/shared/hooks/queries/practiceLogTemplates";
import type {
  MilestoneGoalSetParams,
  MilestoneParams,
  MilestoneTimeParams,
} from "@apps/shared/types";
import {
  isMilestoneRepsTimeParams,
  isMilestoneSetParams,
  isMilestoneTimeParams,
  isMilestoneGoalSetParams,
  isMilestoneParamsSavable,
  isMilestoneTimeValueValid,
} from "@apps/shared/types/goals";
import { toStyleCode } from "@apps/shared/utils/swimStyles";

type NavProp = NativeStackNavigationProp<MainStackParamList>;
type RouteProps = RouteProp<MainStackParamList, "MilestoneForm">;
type MilestoneType = "time" | "reps_time" | "set";

const GOAL_SET_TEMPLATE_ID = "goalset_50m_6x3";
const TIME_TRIAL_TEMPLATE_ID = "time_trial";
/** タイムトライアルテンプレートの目標タイムは目標タイムの 101% */
const TIME_TRIAL_RATIO = 1.01;

interface MilestoneFormState {
  type: MilestoneType;
  title: string;
  /** yyyy-MM-dd。未設定は空文字 */
  deadline: string;
  selectedTemplate: string;
  params: MilestoneParams;
  addToTemplate: boolean;
}

function defaultParamsFor(type: MilestoneType): MilestoneParams {
  // shared の定数は共有オブジェクトなので、state に入れる前に必ず複製する
  if (type === "time") return { ...DEFAULT_TIME_PARAMS };
  if (type === "reps_time") return { ...DEFAULT_REPS_TIME_PARAMS };
  return { ...DEFAULT_SET_PARAMS };
}

const INITIAL_FORM: MilestoneFormState = {
  type: "time",
  title: "",
  deadline: "",
  selectedTemplate: "",
  params: defaultParamsFor("time"),
  addToTemplate: false,
};

/** yyyy-MM-dd はそのまま使い (タイムゾーンでずらさない)、それ以外は parseISO で整形する */
function toDateInputValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "yyyy-MM-dd") : "";
}

/**
 * マイルストーンフォーム (作成・編集兼用)。milestoneId があれば編集。
 * タイプ (time / reps_time / set) ごとに入力欄が切り替わり、作成時はテンプレートも選べる。
 */
export const MilestoneFormScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { goalId, milestoneId } = useRoute<RouteProps>().params;
  const isEdit = milestoneId !== undefined;
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const summarize = useMilestoneSummary();
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const createTemplateMutation = useCreatePracticeLogTemplateMutation(supabase);

  const goalQuery = useGoalDetailQuery(supabase, goalId);
  const goal = goalQuery.data;
  const milestone = isEdit ? goal?.milestones.find((m) => m.id === milestoneId) : undefined;

  const [form, setForm] = useState<MilestoneFormState>(INITIAL_FORM);
  const [isInitialized, setIsInitialized] = useState(!isEdit);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeFieldInvalid, setTimeFieldInvalid] = useState(false);
  const [isGoalSetOpen, setIsGoalSetOpen] = useState(false);
  const savingRef = useRef(false);
  // マイルストーン作成後にテンプレート作成だけ失敗して再保存されたとき、二重作成せず
  // 作成済みの行を現在の入力値で更新する (編集内容を捨てない)
  const createdMilestoneIdRef = useRef<string | null>(null);
  const snapshotRef = useRef<string | null>(null);

  const patchForm = useCallback((patch: Partial<MilestoneFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleParamsChange = useCallback((params: MilestoneParams) => {
    setForm((prev) => ({ ...prev, params }));
    setTimeFieldInvalid(false);
  }, []);

  useEffect(() => {
    if (snapshotRef.current !== null) return;
    if (!isEdit) {
      snapshotRef.current = JSON.stringify(form);
      return;
    }
    if (!milestone) return;
    const next: MilestoneFormState = {
      type: milestone.type,
      title: milestone.title,
      deadline: milestone.deadline ? toDateInputValue(milestone.deadline) : "",
      selectedTemplate: "",
      params: milestone.params,
      addToTemplate: false,
    };
    snapshotRef.current = JSON.stringify(next);
    setForm(next);
    setIsInitialized(true);
  }, [isEdit, milestone, form]);

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

  useEffect(() => {
    if (isSaved) navigation.goBack();
  }, [isSaved, navigation]);

  const goalCompetitionDate = goal?.competition?.date ?? "";

  // ゴールセットは 100m 種目の目標のときだけ提示する
  const availableTemplates = useMemo(
    () =>
      goal?.style.distance === 100
        ? MILESTONE_TEMPLATES
        : MILESTONE_TEMPLATES.filter((tpl) => tpl.id !== GOAL_SET_TEMPLATE_ID),
    [goal?.style.distance],
  );

  const handleTemplateSelect = (templateId: string) => {
    if (!goal) return;
    const template = availableTemplates.find((tpl) => tpl.id === templateId);
    // 選択中のテンプレートをもう一度押したら選択を外す (入力済みの値は残す)
    if (!template || form.selectedTemplate === templateId) {
      patchForm({ selectedTemplate: "" });
      return;
    }
    if (templateId === GOAL_SET_TEMPLATE_ID) {
      setIsGoalSetOpen(true);
      return;
    }
    setTimeFieldInvalid(false);
    if (templateId === TIME_TRIAL_TEMPLATE_ID) {
      // 正規化できない種目コードを DB に書かない
      const styleCode = toStyleCode(goal.style.style);
      if (!styleCode) {
        setSaveError(t("goals.milestoneCreate.createFailed"));
        return;
      }
      const timeTrialParams: MilestoneTimeParams = {
        distance: goal.style.distance,
        target_time: Math.round(goal.target_time * TIME_TRIAL_RATIO * 100) / 100,
        style: styleCode,
        swim_category: "Swim",
      };
      setForm((prev) => ({
        ...prev,
        type: "time",
        selectedTemplate: templateId,
        params: timeTrialParams,
        title: t(`goals.template.${template.nameKey}`),
      }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      type: template.type,
      selectedTemplate: templateId,
      params: { ...template.defaultParams },
      title: t(`goals.template.${template.nameKey}`),
    }));
  };

  const handleGoalSetConfirm = (targetAverageTime: number, practicePoolType: number) => {
    if (!goal) return;
    const styleCode = toStyleCode(goal.style.style);
    const goalSetTemplate = MILESTONE_TEMPLATES.find((tpl) => tpl.id === GOAL_SET_TEMPLATE_ID);
    if (!styleCode || !goalSetTemplate || !isMilestoneGoalSetParams(goalSetTemplate.defaultParams)) {
      setSaveError(t("goals.milestoneCreate.createFailed"));
      return;
    }
    // 50m×6本×3セット・サークル90秒は MILESTONE_TEMPLATES が唯一の定義元
    const goalSetParams: MilestoneGoalSetParams = {
      ...goalSetTemplate.defaultParams,
      target_average_time: targetAverageTime,
      style: styleCode,
      practice_pool_type: practicePoolType,
    };
    setTimeFieldInvalid(false);
    setForm((prev) => ({
      ...prev,
      type: "reps_time",
      selectedTemplate: GOAL_SET_TEMPLATE_ID,
      params: goalSetParams,
      title: t("goals.milestoneCreate.goalSetDefaultTitle"),
    }));
  };

  const handleTypeChange = (type: MilestoneType) => {
    if (form.selectedTemplate) return;
    setTimeFieldInvalid(false);
    setForm((prev) => ({ ...prev, type, params: defaultParamsFor(type) }));
  };

  const handleAlignDeadline = () => {
    if (goalCompetitionDate) patchForm({ deadline: toDateInputValue(goalCompetitionDate) });
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    // 0 や空欄 (距離・本数・セット数・サークル・タイム) のまま保存すると達成判定が成立しない
    if (!isMilestoneParamsSavable(form.type, form.params)) {
      if (!isMilestoneTimeValueValid(form.params)) {
        setTimeFieldInvalid(true);
        setSaveError(t("goals.paramsForm.timeInvalid"));
      } else {
        setSaveError(t("goals.paramsForm.paramsInvalid"));
      }
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      const title = form.title.trim() === "" ? summarize({ params: form.params, title: "" }) : form.title;
      if (isEdit) {
        await goalAPI.updateMilestone(milestoneId, {
          type: form.type,
          title,
          params: form.params,
          deadline: form.deadline || null,
        });
      } else {
        const values = {
          title,
          type: form.type,
          params: form.params,
          deadline: form.deadline || null,
        };
        if (createdMilestoneIdRef.current === null) {
          const created = await goalAPI.createMilestone({ goalId, ...values });
          createdMilestoneIdRef.current = created.id;
        } else {
          await goalAPI.updateMilestone(createdMilestoneIdRef.current, values);
        }
        // テンプレートにも追加する場合 (reps_time / set のみ)
        const p = form.params;
        if (form.addToTemplate && (isMilestoneRepsTimeParams(p) || isMilestoneSetParams(p))) {
          await createTemplateMutation.mutateAsync({
            name: title,
            style: p.style || "Fr",
            swim_category: p.swim_category || "Swim",
            distance: p.distance,
            rep_count: p.reps,
            set_count: p.sets,
            circle: p.circle || null,
          });
        }
      }
      void queryClient.invalidateQueries({ queryKey: goalKeys.all });
      setIsSaved(true);
    } catch (error) {
      console.error("Failed to save milestone:", error);
      setSaveError(isEdit ? t("goals.milestoneEdit.updateFailed") : t("goals.milestoneCreate.createFailed"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

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

  if (goal === undefined || !isInitialized) {
    // 編集対象のマイルストーンが目標に存在しない (別端末で削除済み)
    if (goal && isEdit && !milestone) {
      return (
        <View style={styles.container}>
          <Text style={styles.centerMessage}>{t("goals.mobile.milestoneNotFound")}</Text>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  const typeOptions: Array<{ value: MilestoneType; label: string; description: string }> = [
    {
      value: "time",
      label: t("goals.milestoneForm.type.time.label"),
      description: t("goals.milestoneForm.type.time.description"),
    },
    {
      value: "reps_time",
      label: t("goals.milestoneForm.type.repsTime.label"),
      description: t("goals.milestoneForm.type.repsTime.description"),
    },
    {
      value: "set",
      label: t("goals.milestoneForm.type.set.label"),
      description: t("goals.milestoneForm.type.set.description"),
    },
  ];
  const activeTypeDescription = typeOptions.find((o) => o.value === form.type)?.description;
  const params = form.params;
  const paramsKey = `${form.type}-${form.selectedTemplate}`;

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* テンプレート (作成時のみ) */}
        {!isEdit && (
          <View style={styles.section}>
            <Text style={styles.label}>{t("goals.milestoneForm.templateLabel")}</Text>
            {availableTemplates.map((template) => {
              const active = form.selectedTemplate === template.id;
              return (
                <Pressable
                  key={template.id}
                  style={[styles.templateCard, active && styles.templateCardActive]}
                  onPress={() => handleTemplateSelect(template.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.templateName, active && styles.templateNameActive]}>
                    {t(`goals.template.${template.nameKey}`)}
                  </Text>
                  <Text style={styles.templateDescription}>
                    {t(`goals.template.${template.descriptionKey}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* タイプ */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("goals.milestoneForm.typeLabel")}</Text>
          <View style={styles.segment} accessibilityLabel={t("goals.milestoneForm.typeAriaLabel")}>
            {typeOptions.map((option) => {
              const active = form.type === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.segmentButton,
                    active && styles.segmentButtonActive,
                    !!form.selectedTemplate && styles.segmentButtonLocked,
                  ]}
                  onPress={() => handleTypeChange(option.value)}
                  disabled={!!form.selectedTemplate}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !!form.selectedTemplate }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {activeTypeDescription && <Text style={styles.hint}>{activeTypeDescription}</Text>}
          {form.selectedTemplate !== "" && (
            <Text style={styles.hint}>{t("goals.milestoneForm.templateAppliedNote")}</Text>
          )}
        </View>

        {/* タイトル */}
        <View style={styles.section}>
          <Text style={styles.label}>{t("goals.milestoneForm.titleLabel")}</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(title) => patchForm({ title })}
            accessibilityLabel={t("goals.milestoneForm.titleLabel")}
          />
        </View>

        {/* パラメータ */}
        {form.type === "time" && isMilestoneTimeParams(params) && (
          <TimeParamsFields
            key={paramsKey}
            params={params}
            onChange={handleParamsChange}
            targetTimeInvalid={timeFieldInvalid}
          />
        )}
        {form.type === "reps_time" && isMilestoneRepsTimeParams(params) && (
          <RepsTimeParamsFields
            key={paramsKey}
            params={params}
            onChange={handleParamsChange}
            targetAverageTimeInvalid={timeFieldInvalid}
          />
        )}
        {form.type === "set" && isMilestoneSetParams(params) && (
          <SetParamsFields key={paramsKey} params={params} onChange={handleParamsChange} />
        )}

        {/* 期限 */}
        <View style={styles.section}>
          <DatePickerField
            label={t("goals.deadlineInput.defaultLabel")}
            value={form.deadline}
            onChange={(deadline) => patchForm({ deadline })}
            allowClear
          />
          <Pressable
            style={[styles.outlineButton, !goalCompetitionDate && styles.outlineButtonDisabled]}
            onPress={handleAlignDeadline}
            disabled={!goalCompetitionDate}
            accessibilityRole="button"
            accessibilityState={{ disabled: !goalCompetitionDate }}
          >
            <Text style={styles.outlineButtonText}>{t("goals.deadlineInput.alignButton")}</Text>
          </Pressable>
        </View>

        {/* テンプレートにも追加 (作成時の reps_time / set のみ) */}
        {!isEdit && (form.type === "reps_time" || form.type === "set") && (
          <View style={styles.switchRow}>
            <View style={styles.switchLabelBlock}>
              <Text style={styles.switchLabel}>{t("goals.milestoneCreate.addToTemplateLabel")}</Text>
              <Text style={styles.hint}>{t("goals.milestoneCreate.addToTemplateSubtext")}</Text>
            </View>
            <Switch
              value={form.addToTemplate}
              onValueChange={(addToTemplate) => patchForm({ addToTemplate })}
              accessibilityLabel={t("goals.milestoneCreate.addToTemplateLabel")}
            />
          </View>
        )}
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
              {isEdit ? t("goals.milestoneEdit.submitButton") : t("goals.milestoneCreate.submitButton")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>

      <GoalSetCalculatorModal
        visible={isGoalSetOpen}
        onClose={() => setIsGoalSetOpen(false)}
        onConfirm={handleGoalSetConfirm}
        goal={goal}
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
    fontSize: 12,
    color: "#6B7280",
  },
  templateCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    gap: 2,
  },
  templateCardActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  templateName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  templateNameActive: {
    color: "#2563EB",
  },
  templateDescription: {
    fontSize: 12,
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
    paddingHorizontal: 4,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  segmentButtonActive: {
    backgroundColor: "#2563EB",
  },
  segmentButtonLocked: {
    opacity: 0.5,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
    textAlign: "center",
  },
  segmentTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  input: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: "#111827",
  },
  outlineButton: {
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  outlineButtonDisabled: {
    borderColor: "#D1D5DB",
    opacity: 0.6,
  },
  outlineButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2563EB",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  switchLabelBlock: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "500",
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
