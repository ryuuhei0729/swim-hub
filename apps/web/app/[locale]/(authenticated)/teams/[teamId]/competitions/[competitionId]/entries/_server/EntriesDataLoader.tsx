import { redirect, notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createAuthenticatedServerClient } from "@/lib/supabase-server-auth";
import { getServerUser } from "@/lib/supabase-server";
import { RecordAPI } from "@apps/shared/api/records";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import { isPoolType, type Competition, type Style } from "@apps/shared/types";
import EntriesClient, { type ExistingEntryDisplay } from "../_client/EntriesClient";

interface EntriesDataLoaderProps {
  teamId: string;
  competitionId: string;
}

interface ActiveTeamMember {
  id: string;
  user_id: string;
  role: string;
  users: {
    id: string;
    name: string;
  };
}

interface CompetitionWithDetails extends Competition {
  team: {
    id: string;
    name: string;
  } | null;
}

interface EntryWithUser {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
  users: {
    id: string;
    name: string;
  } | null;
}

/**
 * チーム大会エントリー代理一括入力ページの server loader。
 * `records/_server/RecordDataLoader.tsx` と同型のガード・並行データ取得を踏襲する。
 */
export default async function EntriesDataLoader({ teamId, competitionId }: EntriesDataLoaderProps) {
  const [user, supabase, locale] = await Promise.all([
    getServerUser(),
    createAuthenticatedServerClient(),
    getLocale(),
  ]);
  const t = await getTranslations({ locale, namespace: "competition.entries" });

  if (!user) {
    redirect("/login");
  }

  // 並行でデータ取得
  const [membershipResult, competitionResult, membersResult, entriesResult, stylesResult] =
    await Promise.all([
      // 現在ユーザーのメンバーシップを取得（admin権限チェック）
      supabase
        .from("team_memberships")
        .select("id, role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .single(),

      // 大会情報を取得
      supabase
        .from("competitions")
        .select(
          `
        id,
        user_id,
        team_id,
        title,
        date,
        end_date,
        place,
        pool_type,
        entry_status,
        note,
        created_at,
        team:teams!competitions_team_id_fkey (
          id,
          name
        )
      `,
        )
        .eq("id", competitionId)
        .eq("team_id", teamId)
        .single(),

      // チームメンバー一覧を取得（is_active=true のみ。新規追加の選択候補になる）
      supabase
        .from("team_memberships")
        .select(
          `
        id,
        user_id,
        role,
        users!team_memberships_user_id_fkey (
          id,
          name
        )
      `,
        )
        .eq("team_id", teamId)
        .eq("is_active", true)
        .order("role", { ascending: false }),

      // 既存のエントリーを取得（退会済みメンバーの表示名フォールバック用に users を join）
      supabase
        .from("entries")
        .select(
          `
        id,
        user_id,
        style_id,
        entry_time,
        note,
        users!entries_user_id_fkey (
          id,
          name
        )
      `,
        )
        .eq("competition_id", competitionId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: true }),

      // 種目マスタを取得
      supabase.from("styles").select("id, name_jp, name, style, distance").order("id"),
    ]);

  // エラーチェック
  const membershipData = membershipResult.data as { id: string; role: string } | null;
  if (membershipResult.error || !membershipData) {
    return notFound();
  }

  // admin権限チェック（仕様#2: role !== "admin" は redirect）
  if (membershipData.role !== "admin") {
    return redirect(`/teams/${teamId}?tab=competitions`);
  }

  const competitionData = competitionResult.data;
  if (competitionResult.error || !competitionData) {
    return notFound();
  }

  const competition = competitionData as unknown as CompetitionWithDetails;

  // 大会日が過去なら代理入力不可（仕様#10: server は redirect）
  if (isCompetitionDateInPast(competition.date)) {
    return redirect(`/teams/${teamId}?tab=competitions`);
  }

  if (membersResult.error) {
    throw new Error(t("noMembersToSelect"));
  }
  if (entriesResult.error) {
    throw entriesResult.error;
  }

  const members = (membersResult.data || []) as unknown as ActiveTeamMember[];
  const entriesData = (entriesResult.data || []) as unknown as EntryWithUser[];
  const styles = (stylesResult.data || []) as Style[];

  // 退会済みメンバーの表示名フォールバック: active メンバー名 → users テーブル結合名 → 固定文言
  const activeMemberNameById = new Map(members.map((m) => [m.user_id, m.users.name]));
  const existingEntries: ExistingEntryDisplay[] = entriesData.map((entry) => ({
    id: entry.id,
    user_id: entry.user_id,
    style_id: entry.style_id,
    entry_time: entry.entry_time,
    note: entry.note,
    targetUserName:
      activeMemberNameById.get(entry.user_id) ?? entry.users?.name ?? t("retiredMemberFallback"),
  }));

  // プリフィル用ベストタイムを1クエリで取得（N+1回避: メンバー選択のたびに発火させない）
  const poolType = isPoolType(competition.pool_type) ? competition.pool_type : 0;
  const activeMemberUserIds = members.map((m) => m.user_id);
  const bestTimesMap =
    activeMemberUserIds.length > 0
      ? await new RecordAPI(supabase).getBestTimesForUsers(activeMemberUserIds, poolType)
      : new Map();
  const bestTimesByUser = Object.fromEntries(bestTimesMap);

  return (
    <EntriesClient
      teamId={teamId}
      competitionId={competitionId}
      competition={{
        id: competition.id,
        title: competition.title || t("competitionFallback"),
        date: competition.date,
        place: competition.place,
        pool_type: poolType,
        entry_status: competition.entry_status,
        teamName: competition.team?.name || t("pageTitle"),
      }}
      activeMembers={members.map((m) => ({ user_id: m.user_id, role: m.role, name: m.users.name }))}
      existingEntries={existingEntries}
      styles={styles}
      bestTimesByUser={bestTimesByUser}
    />
  );
}
