"use client";

/**
 * 予定タブの練習カード / 大会カード (useTeamPracticeActions / useTeamCompetitionActions) を、
 * 一覧の取得・並べ方 (TeamSchedule.tsx) と切り離して検証するためのテスト用の描画コンポーネント
 * (ファイル名を *Harness にしないのは、screenHarnesses.test.ts の「担当モジュールを vi.mock する
 *  画面ハーネス」とは別物のため。ここでは何も vi.mock しない)。
 *
 * 以前は練習タブ (TeamPractices) と大会タブ (TeamCompetitions) が別々のコンポーネントで、
 * カードの操作 (編集・削除・記録・エントリー・自分の記録/ログ追加) のテストは
 * それぞれを丸ごと描画していた。予定タブに統合したあと (swimhub-tasks #72) も
 * カードと操作・モーダルは同じものなので、それらのテストはこのファイルで描画する:
 *   - 一覧は `.eq("team_id").order("date", desc).range(...)` の素朴な形で取得する
 *     (既存テストの supabase モックがこの形に対応している)。今日以降 / 過去 の振り分けや
 *     段階読み込みは TeamSchedule 側のテスト (TeamSchedule.test.tsx) で検証する
 *   - 見出しの「追加」「自分のログを追加」ボタンと、保存・削除失敗のエラー表示は
 *     TeamSchedule と同じ文言・同じ挙動で描画する
 * キャッシュのキーは本番と同じ前方一致 (teamDetailKeys.practicePages / competitionPages) の
 * 配下に置くので、保存・削除後の invalidate で再取得される。
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamPracticeActions } from "@/components/team/TeamPractices";
import { useTeamCompetitionActions } from "@/components/team/TeamCompetitions";
import { teamDetailKeys } from "@/hooks/queries/teamDetailKeys";
import {
  mapPracticeRecordToTeamPractice,
  type TeamPractice,
} from "@/hooks/queries/teamPracticeQueries";
import {
  mapToTeamCompetitions,
  type TeamCompetition,
} from "@/hooks/queries/teamCompetitionQueries";

interface HarnessProps {
  teamId: string;
  isAdmin?: boolean;
}

const LIST_LIMIT = 1000;

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tCommon = useTranslations("common");
  return (
    <div>
      <p className="text-red-600">{message}</p>
      <button type="button" onClick={onRetry}>
        {tCommon("retry")}
      </button>
    </div>
  );
}

/** 練習カード (旧 TeamPractices 相当) */
export function TeamPractices({ teamId, isAdmin = false }: HarnessProps) {
  const t = useTranslations("teams");
  const { supabase } = useAuth();
  const actions = useTeamPracticeActions({ teamId, isAdmin });
  const query = useQuery({
    queryKey: [...teamDetailKeys.practicePages(teamId), "test-harness"],
    queryFn: async (): Promise<TeamPractice[]> => {
      const { data, error } = await supabase
        .from("practices")
        .select("*")
        .eq("team_id", teamId)
        .order("date", { ascending: false })
        .range(0, LIST_LIMIT - 1);
      if (error) throw error;
      return ((data as Parameters<typeof mapPracticeRecordToTeamPractice>[0][]) || []).map(
        mapPracticeRecordToTeamPractice,
      );
    },
    staleTime: 0,
    retry: false,
  });

  return (
    <>
      {isAdmin && (
        <button type="button" onClick={actions.openAddForm}>
          {t("practices.addButton")}
        </button>
      )}
      {actions.error ? (
        <ErrorBlock message={actions.error} onRetry={actions.clearError} />
      ) : query.isPending ? (
        <div data-testid="team-schedule-loading" />
      ) : (
        (query.data ?? []).map((practice) => (
          <React.Fragment key={practice.id}>{actions.renderCard(practice)}</React.Fragment>
        ))
      )}
      {actions.modals}
    </>
  );
}

/** 大会カード (旧 TeamCompetitions 相当) */
export function TeamCompetitions({ teamId, isAdmin = false }: HarnessProps) {
  const t = useTranslations("teams");
  const { supabase } = useAuth();
  const actions = useTeamCompetitionActions({ teamId, isAdmin });
  const query = useQuery({
    queryKey: [...teamDetailKeys.competitionPages(teamId), "test-harness"],
    queryFn: async (): Promise<TeamCompetition[]> => {
      const { data, error } = await supabase
        .from("competitions")
        .select("*")
        .eq("team_id", teamId)
        .order("date", { ascending: false })
        .range(0, LIST_LIMIT - 1);
      if (error) throw error;
      return mapToTeamCompetitions(data as Parameters<typeof mapToTeamCompetitions>[0]);
    },
    staleTime: 0,
    retry: false,
  });

  return (
    <>
      {isAdmin && (
        <button type="button" onClick={actions.openAddForm}>
          {t("competitions.addButton")}
        </button>
      )}
      {actions.error ? (
        <ErrorBlock message={actions.error} onRetry={actions.clearError} />
      ) : query.isPending ? (
        <div data-testid="team-schedule-loading" />
      ) : (
        (query.data ?? []).map((competition) => (
          <React.Fragment key={competition.id}>{actions.renderCard(competition)}</React.Fragment>
        ))
      )}
      {actions.modals}
    </>
  );
}

export default TeamCompetitions;
