import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { addMonths, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { useTranslation } from "react-i18next";
import { useToast } from "@/providers/ToastProvider";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { useDateLocale } from "@/hooks/useDateLocale";
import { TeamBulkRegisterAPI } from "@apps/shared/api/teams/bulkRegister";
import {
  useTeamPracticesQuery,
  useTeamCompetitionsQuery,
} from "@apps/shared/hooks/queries/teams";
import { useAuth } from "@/contexts/AuthProvider";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { formatDate } from "@apps/shared/utils/date";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { BulkRegisterCalendar } from "./bulkRegister/BulkRegisterCalendar";
import { CompetitionDraftSheet } from "./bulkRegister/CompetitionDraftSheet";
import { PracticePerDaySheet } from "./bulkRegister/PracticePerDaySheet";
import { BulkRegisterConfirmSheet } from "./bulkRegister/BulkRegisterConfirmSheet";
import { BULK_COLORS } from "./bulkRegister/bulkRegisterColors";
import {
  EMPTY_PRACTICE_FIELDS,
  buildBulkRegisterInput,
  buildExistingScheduleMap,
  competitionEndDate,
  countByMonth,
  findDraftCovering,
  getDateFnsLocale,
  hasOverride,
  rangeOverlapsCompetition,
  toCircledNumber,
  toggleDate,
  toggleWeekdayInMonth,
  type CompetitionDraft,
  type PracticeFields,
} from "./bulkRegister/bulkRegisterUtils";

interface TeamBulkRegisterFormProps {
  teamId: string;
  onSuccess?: () => void;
}

type Mode = "practice" | "competition";

let draftSeq = 0;
const newDraftId = () => `draft-${Date.now()}-${++draftSeq}`;

/**
 * チーム練習・大会の一括登録フォーム (カレンダー型)。
 * - 練習: カレンダーで日付を複数選び、タイトル・場所・メモは共通で1回入力 (日ごとに上書き可)。
 *   曜日の見出しをタップするとその月の同じ曜日をまとめて選べる。
 * - 大会: カレンダーで初日をタップ → シートで日数・大会名などを入力。複数日は帯で表示。
 * 練習と大会の入力はタブを切り替えても残り、登録ボタンで両方まとめて登録する。
 */
export const TeamBulkRegisterForm: React.FC<TeamBulkRegisterFormProps> = ({ teamId, onSuccess }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const insets = useSafeInsets();
  const locale = useDateLocale();
  const api = useMemo(() => new TeamBulkRegisterAPI(supabase), [supabase]);

  // 登録済みの予定 (カレンダーの印と、大会との重複の注意に使う)
  const { data: existingPractices } = useTeamPracticesQuery(supabase, teamId);
  const { data: existingCompetitions } = useTeamCompetitionsQuery(supabase, teamId);
  const existing = useMemo(
    () => buildExistingScheduleMap(existingPractices ?? [], existingCompetitions ?? []),
    [existingPractices, existingCompetitions],
  );

  const [mode, setMode] = useState<Mode>("practice");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  // 練習
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [common, setCommon] = useState<PracticeFields>(EMPTY_PRACTICE_FIELDS);
  const [overrides, setOverrides] = useState<Record<string, PracticeFields>>({});
  const [isPerDayOpen, setIsPerDayOpen] = useState(false);

  // 大会
  const [drafts, setDrafts] = useState<CompetitionDraft[]>([]);
  const [compSheet, setCompSheet] = useState<{
    visible: boolean;
    draft: CompetitionDraft | null;
    isEditing: boolean;
  }>({ visible: false, draft: null, isEditing: false });

  // 登録
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const input = useMemo(
    () => buildBulkRegisterInput(selectedDates, common, overrides, drafts),
    [selectedDates, common, overrides, drafts],
  );
  const total = input.practices.length + input.competitions.length;

  const isCompetitionDay = useCallback(
    (date: string) => !!existing[date]?.competition || !!findDraftCovering(drafts, date),
    [existing, drafts],
  );

  // ---- カレンダー操作 ----
  const handlePressDate = (date: string) => {
    if (mode === "practice") {
      setSelectedDates((prev) => toggleDate(prev, date));
      return;
    }
    const covering = findDraftCovering(drafts, date);
    setCompSheet(
      covering
        ? { visible: true, draft: covering, isEditing: true }
        : {
            visible: true,
            isEditing: false,
            draft: {
              id: newDraftId(),
              date,
              days: 1,
              title: "",
              place: "",
              poolType: 0,
              note: "",
              noteOpen: false,
            },
          },
    );
  };

  const handlePressWeekday = (weekday: number) => {
    setSelectedDates((prev) => toggleWeekdayInMonth(prev, month, weekday));
  };

  const removeSelectedDate = (date: string) => {
    setSelectedDates((prev) => {
      const next = prev.filter((d) => d !== date);
      if (next.length === 0) setIsPerDayOpen(false);
      return next;
    });
  };

  // ---- 大会シート ----
  const closeCompSheet = () => setCompSheet((prev) => ({ ...prev, visible: false }));

  const handleSaveDraft = (draft: CompetitionDraft) => {
    setDrafts((prev) =>
      prev.some((d) => d.id === draft.id)
        ? prev.map((d) => (d.id === draft.id ? draft : d))
        : [...prev, draft],
    );
    // 日程を別の月に変えた場合も、カレンダーで帯が見えるようその月へ移る
    const start = parseISO(draft.date);
    if (isValid(start)) setMonth(startOfMonth(start));
    closeCompSheet();
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    closeCompSheet();
  };

  const openDraft = (draft: CompetitionDraft) => {
    setMonth(startOfMonth(parseISO(draft.date)));
    setCompSheet({ visible: true, draft, isEditing: true });
  };

  const hasOverlap = useCallback(
    (date: string, days: number, excludeId: string | null) =>
      rangeOverlapsCompetition(date, days, existing, drafts, excludeId),
    [existing, drafts],
  );

  // ---- 登録 ----
  const handleSubmit = async () => {
    if (submitting || total === 0) return;
    setSubmitting(true);
    try {
      const result = await api.bulkRegister(teamId, input);
      const created = result.practicesCreated + result.competitionsCreated;
      // 全件登録できた側だけ入力をリセットする (失敗した側は入力を残して直せるようにする)
      if (input.practices.length > 0 && result.practicesCreated === input.practices.length) {
        setSelectedDates([]);
        setCommon(EMPTY_PRACTICE_FIELDS);
        setOverrides({});
      }
      if (input.competitions.length > 0 && result.competitionsCreated === input.competitions.length) {
        setDrafts([]);
      }
      if (created > 0) {
        toast.success(t("teams.mobile.bulkRegister.registeredToast", { count: created }));
        onSuccess?.();
      }
      if (result.errors.length > 0) {
        Alert.alert(
          t("common.error"),
          t("teams.mobile.bulkRegister.resultErrorPrefix", { detail: result.errors.join("\n") }),
        );
      } else {
        setIsConfirmOpen(false);
      }
    } catch (err) {
      Alert.alert(t("common.error"), toUserFacingMessage(err, t("teams.mobile.bulkRegisterFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 表示 ----
  const monthChipLabel = (yyyyMM: string, count: number) =>
    `${format(parseISO(`${yyyyMM}-01`), "MMM", { locale: getDateFnsLocale(locale) })} ${toCircledNumber(count)}`;

  const renderPractice = () => {
    const clashCount = selectedDates.filter(isCompetitionDay).length;
    const overrideCount = selectedDates.filter((d) => hasOverride(overrides[d])).length;
    return (
      <>
        <View style={styles.card}>
          <BulkRegisterCalendar
            mode="practice"
            month={month}
            onPrevMonth={() => setMonth((m) => subMonths(m, 1))}
            onNextMonth={() => setMonth((m) => addMonths(m, 1))}
            existing={existing}
            selectedDates={selectedDates}
            drafts={drafts}
            onPressDate={handlePressDate}
            onPressWeekday={handlePressWeekday}
          />
          <Text style={styles.hint}>{t("teams.mobile.bulkRegister.calendarHintPractice")}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>
              {t("teams.mobile.bulkRegister.selectedDays", { count: selectedDates.length })}
            </Text>
            {selectedDates.length > 0 && (
              <Pressable onPress={() => setSelectedDates([])} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.link, { color: BULK_COLORS.practice.text }]}>
                  {t("teams.mobile.bulkRegister.clearSelection")}
                </Text>
              </Pressable>
            )}
          </View>
          {selectedDates.length > 0 ? (
            <View style={styles.chips}>
              {countByMonth(selectedDates).map(({ month: m, count }) => (
                <Text key={m} style={styles.monthChip}>{monthChipLabel(m, count)}</Text>
              ))}
              {clashCount > 0 && (
                <Text style={styles.warnChip}>
                  {t("teams.mobile.bulkRegister.sameDayAsCompetitionCount", { count: clashCount })}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.empty}>{t("teams.mobile.bulkRegister.selectPracticeDaysEmpty")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>
              {selectedDates.length > 0
                ? t("teams.mobile.bulkRegister.applyToAll", { count: selectedDates.length })
                : t("teams.mobile.bulkRegister.commonContent")}
            </Text>
            {selectedDates.length > 0 && (
              <Pressable onPress={() => setIsPerDayOpen(true)} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.link, { color: BULK_COLORS.practice.text }]}>
                  {t("teams.mobile.bulkRegister.perDayEdit")}
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.fieldLabel}>{t("teams.mobile.bulkRegister.labelTitle")}</Text>
          <TextInput
            style={styles.input}
            value={common.title}
            onChangeText={(v) => setCommon((c) => ({ ...c, title: v }))}
            placeholder={t("teams.mobile.bulkPracticeTitlePlaceholder")}
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.fieldLabel}>{t("teams.mobile.bulkRegister.labelPlace")}</Text>
          <TextInput
            style={styles.input}
            value={common.place}
            onChangeText={(v) => setCommon((c) => ({ ...c, place: v }))}
            placeholder={t("teams.mobile.bulkPlacePlaceholder")}
            placeholderTextColor="#9CA3AF"
          />
          {common.noteOpen ? (
            <>
              <Text style={styles.fieldLabel}>{t("teams.mobile.bulkRegister.labelMemo")}</Text>
              <TextInput
                style={[styles.input, styles.memoInput]}
                value={common.note}
                onChangeText={(v) => setCommon((c) => ({ ...c, note: v }))}
                placeholder={t("teams.mobile.bulkMemoPlaceholder")}
                placeholderTextColor="#9CA3AF"
                multiline
                autoFocus
              />
            </>
          ) : (
            <Pressable
              style={styles.memoButton}
              onPress={() => setCommon((c) => ({ ...c, noteOpen: true }))}
              accessibilityRole="button"
            >
              <Text style={styles.memoButtonText}>{t("teams.mobile.bulkRegister.addMemo")}</Text>
            </Pressable>
          )}
          {overrideCount > 0 && (
            <Text style={styles.hint}>
              {t("teams.mobile.bulkRegister.overrideNotice", { count: overrideCount })}
            </Text>
          )}
        </View>
      </>
    );
  };

  const renderCompetition = () => {
    const sorted = [...drafts].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <>
        <View style={styles.card}>
          <BulkRegisterCalendar
            mode="competition"
            month={month}
            onPrevMonth={() => setMonth((m) => subMonths(m, 1))}
            onNextMonth={() => setMonth((m) => addMonths(m, 1))}
            existing={existing}
            selectedDates={selectedDates}
            drafts={drafts}
            onPressDate={handlePressDate}
          />
          <Text style={styles.hint}>{t("teams.mobile.bulkRegister.calendarHintCompetition")}</Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardLabel, styles.cardLabelSpacing]}>
            {t("teams.mobile.bulkRegister.competitionsToAdd", { count: drafts.length })}
          </Text>
          {sorted.length === 0 ? (
            <Text style={styles.empty}>{t("teams.mobile.bulkRegister.competitionsEmpty")}</Text>
          ) : (
            sorted.map((c) => {
              const end = competitionEndDate(c.date, c.days);
              return (
                <Pressable
                  key={c.id}
                  style={styles.compItem}
                  onPress={() => openDraft(c)}
                  accessibilityRole="button"
                  accessibilityLabel={c.title || t("teams.mobile.fallbackCompetitionTitle")}
                >
                  <View style={styles.compDate}>
                    <Text style={styles.compDateMain}>{formatDate(c.date, "short", locale)}</Text>
                    <Text style={styles.compDateSub}>
                      {c.days > 1
                        ? `〜${formatDate(end, "short", locale)}`
                        : format(parseISO(c.date), "EEE", { locale: getDateFnsLocale(locale) })}
                    </Text>
                  </View>
                  <View style={styles.compBody}>
                    <Text style={[styles.compTitle, !c.title && styles.compPlaceholder]} numberOfLines={1}>
                      {c.title || t("teams.mobile.bulkRegister.competitionNameUnset")}
                    </Text>
                    <Text style={styles.compSub} numberOfLines={1}>
                      {[
                        c.place || t("teams.mobile.bulkRegister.placeUnset"),
                        c.poolType === 1 ? t("competition.form.poolTypeLong") : t("competition.form.poolTypeShort"),
                      ].join(" · ")}
                    </Text>
                    {!!c.note && (
                      <Text style={styles.compSub} numberOfLines={1}>{c.note}</Text>
                    )}
                  </View>
                  <Feather name="chevron-right" size={16} color="#9CA3AF" />
                </Pressable>
              );
            })
          )}
        </View>
      </>
    );
  };

  const submitLabel =
    total === 0
      ? t("teams.mobile.bulkRegister.submitEmpty")
      : t("teams.mobile.bulkRegister.submitButton", {
          summary: [
            input.practices.length > 0
              ? t("teams.mobile.bulkRegister.submitPractice", { count: input.practices.length })
              : "",
            input.competitions.length > 0
              ? t("teams.mobile.bulkRegister.submitCompetition", { count: input.competitions.length })
              : "",
          ]
            .filter(Boolean)
            .join("・"),
        });

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      {/* タブ (件数バッジ付き。練習は緑、大会は青) */}
      <View style={styles.tabs}>
        {(["practice", "competition"] as const).map((m) => {
          const active = mode === m;
          const count = m === "practice" ? selectedDates.length : drafts.length;
          const color = m === "practice" ? BULK_COLORS.practice : BULK_COLORS.competition;
          return (
            <Pressable
              key={m}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && { color: color.text }]}>
                {m === "practice"
                  ? t("teams.mobile.bulkRegister.modeTabPractice")
                  : t("teams.mobile.bulkRegister.modeTabCompetition")}
              </Text>
              {count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: color.main }]}>
                  <Text style={styles.tabBadgeText}>{count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {mode === "practice" ? renderPractice() : renderCompetition()}
      </ScrollView>

      {/* 登録ボタンは画面下に固定し、件数を常に表示する */}
      <View style={[styles.footer, { paddingBottom: getSafeFooterPadding(12, insets.bottom) }]}>
        <Pressable
          style={[styles.submitButton, total === 0 && styles.submitButtonDisabled]}
          onPress={() => setIsConfirmOpen(true)}
          disabled={total === 0}
          accessibilityRole="button"
          accessibilityState={{ disabled: total === 0 }}
        >
          <Text style={styles.submitButtonText}>{submitLabel}</Text>
        </Pressable>
      </View>

      <CompetitionDraftSheet
        visible={compSheet.visible}
        draft={compSheet.draft}
        isEditing={compSheet.isEditing}
        hasOverlap={hasOverlap}
        onSave={handleSaveDraft}
        onDelete={handleDeleteDraft}
        onClose={closeCompSheet}
      />
      <PracticePerDaySheet
        visible={isPerDayOpen}
        dates={selectedDates}
        common={common}
        overrides={overrides}
        existing={existing}
        onChangeOverride={(date, next) => setOverrides((prev) => ({ ...prev, [date]: next }))}
        onRemoveDate={removeSelectedDate}
        onClose={() => setIsPerDayOpen(false)}
      />
      <BulkRegisterConfirmSheet
        visible={isConfirmOpen}
        input={input}
        submitting={submitting}
        onSubmit={handleSubmit}
        onClose={() => setIsConfirmOpen(false)}
      />
    </FormKeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 10,
    padding: 3,
    marginHorizontal: 12,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  tabBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  cardLabelSpacing: {
    marginBottom: 8,
  },
  link: {
    fontSize: 13,
    fontWeight: "700",
  },
  hint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 8,
    lineHeight: 16,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  monthChip: {
    fontSize: 13,
    fontWeight: "700",
    color: BULK_COLORS.practice.text,
    backgroundColor: BULK_COLORS.practice.light,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  warnChip: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400E",
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  empty: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  memoInput: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  memoButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
  },
  memoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  compItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
  },
  compDate: {
    width: 64,
    alignItems: "center",
  },
  compDateMain: {
    fontSize: 14,
    fontWeight: "700",
    color: BULK_COLORS.competition.text,
  },
  compDateSub: {
    fontSize: 11,
    color: "#6B7280",
  },
  compBody: {
    flex: 1,
    minWidth: 0,
  },
  compTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  compPlaceholder: {
    color: "#9CA3AF",
  },
  compSub: {
    fontSize: 12,
    color: "#6B7280",
  },
  footer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  submitButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  submitButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
