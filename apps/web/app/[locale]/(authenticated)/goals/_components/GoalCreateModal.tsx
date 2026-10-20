"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import type { Style, Competition } from "@apps/shared/types";
import { format } from "date-fns";
import GoalForm, { type NewCompetitionInput } from "./forms/GoalForm";

interface GoalCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  styles: Style[];
}

/**
 * 大会目標作成モーダル
 */
export default function GoalCreateModal({
  isOpen,
  onClose,
  onSuccess,
  styles,
}: GoalCreateModalProps) {
  const t = useTranslations("goals");
  const tCompetition = useTranslations("forms.competition");
  const { supabase, user } = useAuth();
  const [competitionMode, setCompetitionMode] = useState<"existing" | "new">("existing");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("");
  const [newCompetition, setNewCompetition] = useState<NewCompetitionInput>({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    place: "",
    poolType: 0,
  });
  const [styleId, setStyleId] = useState<string>("");
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  // チーム大会の optgroup 表示名解決用 (U2)
  const { teams } = useTeamsQuery(supabase);
  const teamNames = useMemo(
    () => Object.fromEntries(teams.map((m) => [m.team_id, m.teams.name])),
    [teams],
  );

  // 大会一覧を取得（未来の日付のみ、個人大会+所属チームの大会）
  useEffect(() => {
    if (isOpen && competitionMode === "existing") {
      const today = format(new Date(), "yyyy-MM-dd");
      goalAPI
        .getSelectableCompetitions(today)
        .then(setCompetitions)
        .catch((error) => {
          console.error("大会一覧取得エラー:", error);
          setCompetitions([]);
        });
    }
  }, [isOpen, competitionMode, supabase, goalAPI]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    try {
      // 目標タイムのバリデーション（TimeSecondsInput が既に秒数へ変換済み）
      const targetTimeSeconds = targetTime;
      if (targetTimeSeconds === null || targetTimeSeconds <= 0 || targetTimeSeconds > 3600) {
        alert(t("create.targetTimeInvalid"));
        setIsLoading(false);
        return;
      }

      // competitionIdのバリデーション（既存大会選択時）
      let competitionId: string | undefined;
      if (competitionMode === "existing") {
        if (!selectedCompetitionId || selectedCompetitionId.trim() === "") {
          alert(t("create.competitionRequired"));
          setIsLoading(false);
          return;
        }
        competitionId = selectedCompetitionId;
      }

      if (competitionMode === "new" && newCompetition.date < format(new Date(), "yyyy-MM-dd")) {
        alert(t("form.competitionDatePast"));
        setIsLoading(false);
        return;
      }
      if (competitionMode === "new" && newCompetition.endDate && newCompetition.endDate < newCompetition.date) {
        alert(tCompetition("end_date_error"));
        setIsLoading(false);
        return;
      }

      await goalAPI.createGoal({
        userId: user.id,
        competitionId: competitionId,
        competitionData:
          competitionMode === "new"
            ? {
                title: newCompetition.title,
                date: newCompetition.date,
                endDate: newCompetition.endDate || null,
                place: newCompetition.place || null,
                poolType: newCompetition.poolType,
              }
            : undefined,
        styleId: parseInt(styleId, 10),
        targetTime: targetTimeSeconds,
      });

      await onSuccess();
      handleClose();
    } catch (error) {
      console.error("目標作成エラー:", error);
      alert(t("create.createFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCompetitionMode("existing");
    setSelectedCompetitionId("");
    setNewCompetition({
      title: "",
      date: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      place: "",
      poolType: 0,
    });
    setStyleId("");
    setTargetTime(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{t("create.title")}</h3>
              <button
                onClick={handleClose}
                aria-label={t("create.closeAriaLabel")}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <GoalForm
                competitionMode={competitionMode}
                onCompetitionModeChange={setCompetitionMode}
                competitions={competitions}
                teamNames={teamNames}
                selectedCompetitionId={selectedCompetitionId}
                onSelectedCompetitionIdChange={setSelectedCompetitionId}
                newCompetition={newCompetition}
                onNewCompetitionChange={setNewCompetition}
                styles={styles}
                styleId={styleId}
                onStyleIdChange={setStyleId}
                targetTime={targetTime}
                onTargetTimeChange={setTargetTime}
              />

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                  {t("create.cancelButton")}
                </Button>
                <Button type="submit" loading={isLoading}>
                  {t("create.submitButton")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
