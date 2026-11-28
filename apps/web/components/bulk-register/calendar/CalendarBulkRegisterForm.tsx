"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addMonths, format, isValid, parseISO, startOfMonth, subMonths } from "date-fns";
import { CheckCircleIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts";
import { useOptionalQueryClient } from "@/hooks/queries/useOptionalQueryClient";
import { TeamBulkRegisterAPI } from "@apps/shared/api/teams/bulkRegister";
import {
  useTeamCompetitionsQuery,
  useTeamPracticesQuery,
} from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
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
} from "@apps/shared/utils/bulkRegisterCalendar";
import BulkRegisterCalendar from "./BulkRegisterCalendar";
import CompetitionDraftModal from "./CompetitionDraftModal";
import PracticePerDayModal from "./PracticePerDayModal";
import BulkRegisterConfirmModal from "./BulkRegisterConfirmModal";

interface CalendarBulkRegisterFormProps {
  teamId: string;
}

type Mode = "practice" | "competition";

let draftSeq = 0;
const newDraftId = () => `draft-${Date.now()}-${++draftSeq}`;

const inputClass =
  "w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

/**
 * チーム練習・大会のカレンダー型一括登録 (web)。mobile components/teams/TeamBulkRegisterForm.tsx と
 * 同じ操作にする:
 * - 練習: カレンダーで日付を複数選び、タイトル・場所・メモは共通で1回入力 (日ごとに上書き可)。
 *   曜日の見出しをクリックするとその月の同じ曜日をまとめて選べる。
 * - 大会: カレンダーで初日をクリック → モーダルで日数・大会名などを入力。複数日は帯で表示。
 * - 登録済みの練習・大会は点で示し、大会と同じ日・期間が重なる大会には注意を出す。
 * 練習と大会の入力はタブを切り替えても残り、登録ボタンで両方まとめて登録する。
 */
export default function CalendarBulkRegisterForm({ teamId }: CalendarBulkRegisterFormProps) {
  const t = useTranslations("teams.mobile.bulkRegister");
  const tMobile = useTranslations("teams.mobile");
  const tCompetitionForm = useTranslations("competition.form");
  const tAdmin = useTranslations("teamsAdmin.bulkRegister");
  const locale = useLocale() as SupportedLocale;
  const { supabase } = useAuth();
  const queryClient = useOptionalQueryClient();
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
  const [compModal, setCompModal] = useState<{ draft: CompetitionDraft; isEditing: boolean } | null>(
    null,
  );

  // 登録
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    setCompModal(
      covering
        ? { draft: covering, isEditing: true }
        : {
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

  // ---- 大会モーダル ----
  const handleSaveDraft = (draft: CompetitionDraft) => {
    setDrafts((prev) =>
      prev.some((d) => d.id === draft.id)
        ? prev.map((d) => (d.id === draft.id ? draft : d))
        : [...prev, draft],
    );
    // 日程を別の月に変えた場合も、カレンダーで帯が見えるようその月へ移る
    const start = parseISO(draft.date);
    if (isValid(start)) setMonth(startOfMonth(start));
    setCompModal(null);
  };

  const handleDeleteDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setCompModal(null);
  };

  const openDraft = (draft: CompetitionDraft) => {
    const start = parseISO(draft.date);
    if (isValid(start)) setMonth(startOfMonth(start));
    setCompModal({ draft, isEditing: true });
  };

  const hasOverlap = useCallback(
    (date: string, days: number, excludeId: string | null) =>
      rangeOverlapsCompetition(date, days, existing, drafts, excludeId),
    [existing, drafts],
  );

  // ---- 登録 ----
  const openConfirm = () => {
    setSubmitError(null);
    setSuccessMessage(null);
    setIsConfirmOpen(true);
  };

  const handleSubmit = async () => {
    if (submitting || total === 0) return;
    setSubmitting(true);
    setSubmitError(null);
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
        setSuccessMessage(t("registeredToast", { count: created }));
        // カレンダーの登録済みの印を新しい予定で描き直す (予定タブの一覧も同じキー配下)
        if (queryClient) {
          void queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });
          void queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamId) });
        }
      }
      if (result.errors.length > 0) {
        setSubmitError(t("resultErrorPrefix", { detail: result.errors.join("\n") }));
      } else {
        setIsConfirmOpen(false);
      }
    } catch (err) {
      setSubmitError(toUserFacingMessage(err, tMobile("bulkRegisterFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 表示 ----
  const monthChipLabel = (yyyyMM: string, count: number) => {
    const first = parseISO(`${yyyyMM}-01`);
    const monthLabel = isValid(first) ? format(first, "MMM", { locale: getDateFnsLocale(locale) }) : yyyyMM;
    return `${monthLabel} ${toCircledNumber(count)}`;
  };

  const calendarProps = {
    month,
    onPrevMonth: () => setMonth((m) => subMonths(m, 1)),
    onNextMonth: () => setMonth((m) => addMonths(m, 1)),
    existing,
    selectedDates,
    drafts,
    onPressDate: handlePressDate,
  };

  const renderPractice = () => {
    const clashCount = selectedDates.filter(isCompetitionDay).length;
    const overrideCount = selectedDates.filter((d) => hasOverride(overrides[d])).length;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-4">
          <BulkRegisterCalendar mode="practice" {...calendarProps} onPressWeekday={handlePressWeekday} />
          <p className="mt-2 text-xs text-gray-500">{t("calendarHintPractice")}</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">
                {t("selectedDays", { count: selectedDates.length })}
              </span>
              {selectedDates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedDates([])}
                  className="text-sm font-bold text-green-700 hover:underline"
                >
                  {t("clearSelection")}
                </button>
              )}
            </div>
            {selectedDates.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {countByMonth(selectedDates).map(({ month: m, count }) => (
                  <span key={m} className="rounded-md bg-green-50 px-2 py-0.5 text-sm font-bold text-green-700">
                    {monthChipLabel(m, count)}
                  </span>
                ))}
                {clashCount > 0 && (
                  <span
                    className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                    data-testid="bulk-calendar-clash-count"
                  >
                    {t("sameDayAsCompetitionCount", { count: clashCount })}
                  </span>
                )}
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-gray-400">{t("selectPracticeDaysEmpty")}</p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500">
                {selectedDates.length > 0
                  ? t("applyToAll", { count: selectedDates.length })
                  : t("commonContent")}
              </span>
              {selectedDates.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsPerDayOpen(true)}
                  className="text-sm font-bold text-green-700 hover:underline"
                >
                  {t("perDayEdit")}
                </button>
              )}
            </div>
            <label htmlFor="bulk-calendar-common-title" className="mb-1 block text-xs font-bold text-gray-700">
              {t("labelTitle")}
            </label>
            <input
              id="bulk-calendar-common-title"
              type="text"
              value={common.title}
              onChange={(e) => setCommon((c) => ({ ...c, title: e.target.value }))}
              placeholder={tMobile("bulkPracticeTitlePlaceholder")}
              className={`${inputClass} mb-3`}
            />
            <label htmlFor="bulk-calendar-common-place" className="mb-1 block text-xs font-bold text-gray-700">
              {t("labelPlace")}
            </label>
            <input
              id="bulk-calendar-common-place"
              type="text"
              value={common.place}
              onChange={(e) => setCommon((c) => ({ ...c, place: e.target.value }))}
              placeholder={tMobile("bulkPlacePlaceholder")}
              className={`${inputClass} mb-3`}
            />
            {common.noteOpen ? (
              <>
                <label htmlFor="bulk-calendar-common-note" className="mb-1 block text-xs font-bold text-gray-700">
                  {t("labelMemo")}
                </label>
                <textarea
                  id="bulk-calendar-common-note"
                  value={common.note}
                  onChange={(e) => setCommon((c) => ({ ...c, note: e.target.value }))}
                  placeholder={tMobile("bulkMemoPlaceholder")}
                  rows={3}
                  className={inputClass}
                  autoFocus
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setCommon((c) => ({ ...c, noteOpen: true }))}
                className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-500 hover:bg-gray-50"
              >
                {t("addMemo")}
              </button>
            )}
            {overrideCount > 0 && (
              <p className="mt-2 text-xs text-gray-500">{t("overrideNotice", { count: overrideCount })}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCompetition = () => {
    const sorted = [...drafts].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 p-4">
          <BulkRegisterCalendar mode="competition" {...calendarProps} />
          <p className="mt-2 text-xs text-gray-500">{t("calendarHintCompetition")}</p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4">
          <p className="mb-2 text-xs font-bold text-gray-500">
            {t("competitionsToAdd", { count: drafts.length })}
          </p>
          {sorted.length === 0 ? (
            <p className="py-2 text-center text-sm text-gray-400">{t("competitionsEmpty")}</p>
          ) : (
            <ul className="space-y-1.5">
              {sorted.map((c) => {
                const end = competitionEndDate(c.date, c.days);
                const start = parseISO(c.date);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => openDraft(c)}
                      aria-label={c.title || tMobile("fallbackCompetitionTitle")}
                      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="w-16 shrink-0 text-center">
                        <span className="block text-sm font-bold text-blue-800">
                          {formatDate(c.date, "short", locale)}
                        </span>
                        <span className="block text-xs text-gray-500">
                          {c.days > 1
                            ? `〜${formatDate(end, "short", locale)}`
                            : isValid(start)
                              ? format(start, "EEE", { locale: getDateFnsLocale(locale) })
                              : ""}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-bold ${c.title ? "text-gray-900" : "text-gray-400"}`}
                        >
                          {c.title || t("competitionNameUnset")}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {[
                            c.place || t("placeUnset"),
                            c.poolType === 1
                              ? tCompetitionForm("poolTypeLong")
                              : tCompetitionForm("poolTypeShort"),
                          ].join(" · ")}
                        </span>
                        {!!c.note && <span className="block truncate text-xs text-gray-500">{c.note}</span>}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const submitLabel =
    total === 0
      ? t("submitEmpty")
      : t("submitButton", {
          summary: [
            input.practices.length > 0 ? t("submitPractice", { count: input.practices.length }) : "",
            input.competitions.length > 0
              ? t("submitCompetition", { count: input.competitions.length })
              : "",
          ]
            .filter(Boolean)
            .join("・"),
        });

  return (
    <div className="mt-4">
      {/* 練習 / 大会 (件数バッジ付き。練習は緑、大会は青) */}
      <div
        role="tablist"
        aria-label={tAdmin("modeTabCalendar")}
        className="mb-4 flex rounded-lg bg-gray-200 p-1"
      >
        {(["practice", "competition"] as const).map((m) => {
          const active = mode === m;
          const count = m === "practice" ? selectedDates.length : drafts.length;
          return (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-bold ${
                active
                  ? `bg-white shadow-sm ${m === "practice" ? "text-green-700" : "text-blue-800"}`
                  : "text-gray-500"
              }`}
            >
              {m === "practice" ? t("modeTabPractice") : t("modeTabCompetition")}
              {count > 0 && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-xs text-white ${
                    m === "practice" ? "bg-green-600" : "bg-blue-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {successMessage && (
        <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <CheckCircleIcon className="h-5 w-5 shrink-0 text-green-500" />
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {mode === "practice" ? renderPractice() : renderCompetition()}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={openConfirm}
          disabled={total === 0}
          className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {submitLabel}
        </button>
      </div>

      {compModal && (
        <CompetitionDraftModal
          key={compModal.draft.id}
          draft={compModal.draft}
          isEditing={compModal.isEditing}
          hasOverlap={hasOverlap}
          onSave={handleSaveDraft}
          onDelete={handleDeleteDraft}
          onClose={() => setCompModal(null)}
        />
      )}
      <PracticePerDayModal
        isOpen={isPerDayOpen}
        dates={selectedDates}
        common={common}
        overrides={overrides}
        existing={existing}
        onChangeOverride={(date, next) => setOverrides((prev) => ({ ...prev, [date]: next }))}
        onRemoveDate={removeSelectedDate}
        onClose={() => setIsPerDayOpen(false)}
      />
      <BulkRegisterConfirmModal
        isOpen={isConfirmOpen}
        input={input}
        submitting={submitting}
        error={submitError}
        onSubmit={handleSubmit}
        onClose={() => setIsConfirmOpen(false)}
      />
    </div>
  );
}
