"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts";
import { GoalAPI } from "@apps/shared/api/goals";
import { RecordAPI } from "@apps/shared/api/records";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import type { Style, GoalWithMilestones, Competition } from "@apps/shared/types";
import { format } from "date-fns";
import GoalForm from "./forms/GoalForm";

interface GoalEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  // 大会情報が無い目標 (goal.competition === null) は編集不可。
  // 呼び出し元 (GoalList) が編集導線自体を出さないため、ここでは
  // competition が必ず存在するもののみを受け取る (呼び出し元でガード済み)
  goal: GoalWithMilestones & { competition: Competition };
  styles: Style[];
}

/**
 * 大会目標編集モーダル
 */
export default function GoalEditModal({
  isOpen,
  onClose,
  onSuccess,
  goal,
  styles,
}: GoalEditModalProps) {
  const t = useTranslations("goals");
  const { supabase, user } = useAuth();
  const createdCompetitionRef = useRef<{
    id: string;
    input: { title: string; date: string; place: string | null; pool_type: number; note: null };
  } | null>(null);
  const [competitionMode, setCompetitionMode] = useState<"existing" | "new">("existing");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>("");
  const [newCompetition, setNewCompetition] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    place: "",
    poolType: 0,
  });
  const [styleId, setStyleId] = useState<string>("");
  const [targetTime, setTargetTime] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [useBestTime, setUseBestTime] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase]);
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase]);
  // チーム大会の optgroup 表示名解決用 (U2)
  const { teams } = useTeamsQuery(supabase);
  const teamNames = useMemo(
    () => Object.fromEntries(teams.map((m) => [m.team_id, m.teams.name])),
    [teams],
  );

  // 大会一覧を取得（未来の大会 + 編集中目標の大会。個人大会+所属チームの大会）。
  // goal.competition は必ず存在する (呼び出し元でガード済み) ため、
  // goal.competition.id をそのまま既存大会IDとして使う。
  useEffect(() => {
    if (isOpen && competitionMode === "existing") {
      const today = format(new Date(), "yyyy-MM-dd");
      const existingCompetitionId = goal.competition.id;

      goalAPI
        .getSelectableCompetitions(today)
        .then(async (futureCompetitions) => {
          // 既存の大会が未来の大会リストに含まれているか確認
          const existingIncluded = futureCompetitions.some((c) => c.id === existingCompetitionId);

          if (!existingIncluded) {
            // 既存の大会が含まれていない場合、個別に取得してマージ
            const { data: existingCompetition } = await supabase
              .from("competitions")
              .select("*")
              .eq("id", existingCompetitionId)
              .single();

            if (existingCompetition) {
              setCompetitions([existingCompetition, ...futureCompetitions]);
            } else {
              setCompetitions(futureCompetitions);
            }
          } else {
            setCompetitions(futureCompetitions);
          }
        })
        .catch((error) => {
          console.error("大会一覧取得エラー:", error);
          setCompetitions([]);
        });
    }
  }, [isOpen, competitionMode, supabase, goalAPI, goal.competition.id]);

  // 既存の目標データでフォームを初期化
  useEffect(() => {
    if (isOpen && goal) {
      setSelectedCompetitionId(goal.competition.id);
      setCompetitionMode("existing");
      setStyleId(goal.style_id.toString());
      setTargetTime(goal.target_time);
      setStartTime(goal.start_time ?? null);
      setUseBestTime(false);
      setValidationError(null);
    }
  }, [isOpen, goal]);

  // 対象大会の水路（0: 短水路, 1: 長水路）。新規大会作成時は入力値、既存大会選択時は選択した大会の値
  const selectedPoolType =
    competitionMode === "new"
      ? newCompetition.poolType
      : competitions.find((c) => c.id === selectedCompetitionId)?.pool_type;

  // ベストタイムを取得（対象大会と同じ水路の自己ベストのみを対象にする: U3）
  const handleGetBestTime = async () => {
    if (!styleId || !user) return;

    try {
      const parsedStyleId = parseInt(styleId, 10);
      if (selectedPoolType === undefined) {
        // 大会未選択（水路不明）のため取得できない。GoalForm 側でボタンは
        // 種目未選択時のみ無効化されるため、ここでは静かに抜ける
        return;
      }

      const bestTimes = await recordAPI.getBestTimes();
      const bestTime = bestTimes.find(
        (bt) => bt.style_id === parsedStyleId && bt.pool_type === selectedPoolType,
      );

      if (bestTime) {
        setStartTime(bestTime.time);
        setUseBestTime(true);
      } else {
        alert(t("edit.bestTimeNotFound"));
        setUseBestTime(false);
      }
    } catch (error) {
      console.error("ベストタイム取得エラー:", error);
      alert(t("edit.bestTimeFetchFailed"));
      setUseBestTime(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setValidationError(null);

    try {
      // タイムは TimeSecondsInput が既に秒数へ変換済み
      const targetTimeSeconds = targetTime;
      const startTimeSeconds = startTime;
      const parsedStyleId = parseInt(styleId, 10);

      // バリデーション: targetTimeSeconds（必須）
      if (targetTimeSeconds === null || targetTimeSeconds <= 0 || targetTimeSeconds > 3600) {
        setValidationError(t("edit.validation.targetTimeInvalid"));
        setIsLoading(false);
        return;
      }

      // バリデーション: startTimeSeconds（startTimeが提供されている場合のみ）
      if (startTimeSeconds !== null && (startTimeSeconds <= 0 || startTimeSeconds > 3600)) {
        setValidationError(t("edit.validation.startTimeInvalid"));
        setIsLoading(false);
        return;
      }

      // バリデーション: styleId（必須）
      if (!Number.isFinite(parsedStyleId) || Number.isNaN(parsedStyleId) || parsedStyleId <= 0) {
        setValidationError(t("edit.validation.styleNotSelected"));
        setIsLoading(false);
        return;
      }

      // バリデーションが通ったので、大会作成と目標更新を実行
      let competitionId = selectedCompetitionId;

      // 新規大会を作成する場合
      if (competitionMode === "new") {
        if (newCompetition.date < format(new Date(), "yyyy-MM-dd")) {
          alert(t("form.competitionDatePast"));
          setIsLoading(false);
          return;
        }
        const competitionInput = {
          title: newCompetition.title,
          date: newCompetition.date,
          place: newCompetition.place || null,
          pool_type: newCompetition.poolType,
          note: null,
        };
        // updateGoal が失敗して再送信されても大会を二重作成しない。
        // 再送信時に入力が変わっていれば、作成済みの大会を更新して反映する
        const created = createdCompetitionRef.current;
        if (!created) {
          const newComp = await recordAPI.createCompetition(competitionInput);
          createdCompetitionRef.current = { id: newComp.id, input: competitionInput };
          competitionId = newComp.id;
        } else {
          if (JSON.stringify(created.input) !== JSON.stringify(competitionInput)) {
            await recordAPI.updateCompetition(created.id, competitionInput);
            createdCompetitionRef.current = { id: created.id, input: competitionInput };
          }
          competitionId = created.id;
        }
      }

      // バリデーション済みの値のみを使用して目標を更新
      await goalAPI.updateGoal(goal.id, {
        competitionId: competitionId,
        styleId: parsedStyleId,
        targetTime: targetTimeSeconds,
        startTime: startTimeSeconds,
      });

      createdCompetitionRef.current = null;
      await onSuccess();
      handleClose();
    } catch (error) {
      // RLS (P2 WITH CHECK) がチーム退会後の競技会参照を拒否した場合もここに来るが、
      // 生の Supabase エラー文言は出さずユーザー向け固定文言のみを表示する
      console.error("目標更新エラー:", error);
      alert(t("edit.updateFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    createdCompetitionRef.current = null;
    setCompetitionMode("existing");
    setSelectedCompetitionId("");
    setNewCompetition({
      title: "",
      date: format(new Date(), "yyyy-MM-dd"),
      place: "",
      poolType: 0,
    });
    setStyleId("");
    setTargetTime(null);
    setStartTime(null);
    setUseBestTime(false);
    setValidationError(null);
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
              <h3 className="text-lg font-semibold text-gray-900">{t("edit.title")}</h3>
              <button
                onClick={handleClose}
                aria-label={t("edit.closeAriaLabel")}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {validationError && (
                <div
                  className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md"
                  role="alert"
                >
                  {validationError}
                </div>
              )}
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
                startTime={startTime}
                onStartTimeChange={setStartTime}
                useBestTime={useBestTime}
                onGetBestTime={handleGetBestTime}
              />

              {/* ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                  {t("edit.cancelButton")}
                </Button>
                <Button type="submit" loading={isLoading}>
                  {t("edit.submitButton")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
