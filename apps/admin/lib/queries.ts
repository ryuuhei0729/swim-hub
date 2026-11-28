import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { formatTime } from "@swim-hub/shared/utils/time";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { formatStyle } from "./format";
import { getReadOnlyClient } from "./supabase";

const PAGE_SIZE = 1000;
const LIST_LIMIT = 200;
const ACTIVITY_LIMIT = 12;

type QueryResult<T> = { data: T[] | null; error: { message: string } | null };

function unwrap<T>(label: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label} の取得に失敗しました: ${result.error.message}`);
  return result.data;
}

function unwrapList<T>(label: string, result: QueryResult<T>): T[] {
  return unwrap(label, result) ?? [];
}

function unwrapCount(
  label: string,
  result: { count: number | null; error: { message: string } | null },
): number {
  if (result.error) throw new Error(`${label} の件数の取得に失敗しました: ${result.error.message}`);
  return result.count ?? 0;
}

async function fetchAllPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<QueryResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = unwrapList(label, await fetchPage(from, from + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

type SubscriptionRow = { plan: string; status: string | null; premium_expires_at: string | null };

export function isPremium(row: SubscriptionRow | null | undefined): boolean {
  if (!row) return false;
  return checkIsPremium({
    plan: row.plan === "premium" ? "premium" : "free",
    status: row.status === "active" || row.status === "trialing" ? row.status : null,
    cancelAtPeriodEnd: false,
    premiumExpiresAt: row.premium_expires_at,
    trialEnd: null,
  });
}

// ---------------------------------------------------------------------------
// ユーザー一覧
// ---------------------------------------------------------------------------

export type UserSummary = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  premium: boolean;
};

async function fetchAuthUsers() {
  const supabase = getReadOnlyClient();
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`auth.users の取得に失敗しました: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) return users;
  }
}

export async function listUsers(): Promise<UserSummary[]> {
  const supabase = getReadOnlyClient();
  const [profiles, authUsers, subscriptions] = await Promise.all([
    fetchAllPages("users", (from, to) =>
      supabase.from("users").select("id, name, created_at").order("id").range(from, to),
    ),
    fetchAuthUsers(),
    fetchAllPages("user_subscriptions", (from, to) =>
      supabase
        .from("user_subscriptions")
        .select("id, plan, status, premium_expires_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const subscriptionById = new Map(subscriptions.map((row) => [row.id, row]));

  return profiles
    .map((profile) => {
      const auth = authById.get(profile.id);
      return {
        id: profile.id,
        name: profile.name,
        email: auth?.email ?? null,
        createdAt: profile.created_at,
        lastSignInAt: auth?.last_sign_in_at ?? null,
        premium: isPremium(subscriptionById.get(profile.id)),
      };
    })
    .sort((a, b) => (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? ""));
}

// ---------------------------------------------------------------------------
// ユーザー詳細 (ヘッダー)
// ---------------------------------------------------------------------------

export async function getUserHeader(userId: string) {
  const supabase = getReadOnlyClient();
  // 今日を含む 30 日分
  const since = startOfDay(subDays(new Date(), 29)).toISOString();

  const [
    profile,
    auth,
    subscription,
    memberships,
    ownPractices,
    joinedPractices,
    records,
    goals,
    recentPractices,
    recentLogs,
    recentRecords,
  ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, gender, birthday, bio, created_at, onboarding_completed, google_calendar_enabled, ios_calendar_enabled",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("user_subscriptions")
      .select(
        "plan, status, provider, provider_environment, provider_subscription_id, stripe_customer_id, premium_expires_at, current_period_start, cancel_at_period_end, trial_start, trial_end, created_at, updated_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("team_memberships")
      .select("id, role, status, is_active, joined_at, left_at, teams(id, name)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false }),
    supabase.from("practices").select("id", { count: "exact", head: true }).eq("user_id", userId),
    joinedPracticesQuery(userId, "id, practice_logs!inner(user_id)", { count: "exact", head: true }),
    supabase.from("records").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("goals").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("practices")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(PAGE_SIZE),
    supabase
      .from("practice_logs")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(PAGE_SIZE),
    supabase
      .from("records")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(PAGE_SIZE),
  ]);

  const user = unwrap("users", profile);
  if (!user) return null;

  // 直近30日のうち、練習か記録を登録した日数 (この Mac のタイムゾーンで日付を切る)
  const activeDays = new Set<string>();
  for (const row of [
    ...unwrapList("practices", recentPractices),
    ...unwrapList("practice_logs", recentLogs),
    ...unwrapList("records", recentRecords),
  ]) {
    if (row.created_at) activeDays.add(format(parseISO(row.created_at), "yyyy-MM-dd"));
  }

  const subscriptionRow = unwrap("user_subscriptions", subscription);
  // auth 側だけ取れなくても、プロフィールは表示する
  const authUser = auth.error ? null : auth.data.user;

  return {
    user,
    email: authUser?.email ?? null,
    providers: authUser?.identities?.map((identity) => identity.provider) ?? [],
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    subscription: subscriptionRow,
    premium: isPremium(subscriptionRow),
    memberships: unwrapList("team_memberships", memberships),
    counts: {
      practices:
        unwrapCount("practices", ownPractices) + unwrapCount("practices", joinedPractices),
      records: unwrapCount("records", records),
      goals: unwrapCount("goals", goals),
      activeDays: activeDays.size,
    },
  };
}

export type UserHeader = NonNullable<Awaited<ReturnType<typeof getUserHeader>>>;

// ---------------------------------------------------------------------------
// タブごとのデータ
// ---------------------------------------------------------------------------

const PRACTICE_COLUMNS =
  "id, date, title, place, note, team_id, user_id, created_at, practice_logs(distance, rep_count, set_count)";
const JOINED_PRACTICE_COLUMNS =
  "id, date, title, place, note, team_id, user_id, created_at, practice_logs!inner(distance, rep_count, set_count)";

// 他人 (コーチなど) が作ったチーム練習のうち、このユーザーのメニューが入っているもの
function joinedPracticesQuery<Columns extends string>(
  userId: string,
  columns: Columns,
  options?: { count: "exact"; head: true },
) {
  return getReadOnlyClient()
    .from("practices")
    .select(columns, options)
    .eq("practice_logs.user_id", userId)
    .or(`user_id.is.null,user_id.neq.${userId}`);
}

type PracticeOrder = "date" | "created_at";

export async function listPractices(
  userId: string,
  { limit = LIST_LIMIT, orderBy = "date" }: { limit?: number; orderBy?: PracticeOrder } = {},
) {
  const supabase = getReadOnlyClient();
  // service role は RLS を通らないので、チーム練習に他のメンバーが入れたメニューまで見える。
  // 距離とメニュー数はこのユーザーの分だけを数える
  const [own, joined] = await Promise.all([
    supabase
      .from("practices")
      .select(PRACTICE_COLUMNS)
      .eq("user_id", userId)
      .eq("practice_logs.user_id", userId)
      .order(orderBy, { ascending: false })
      .limit(limit),
    joinedPracticesQuery(userId, JOINED_PRACTICE_COLUMNS)
      .order(orderBy, { ascending: false })
      .limit(limit),
  ]);

  return [...unwrapList("practices", own), ...unwrapList("practices", joined)]
    .map(({ practice_logs, ...practice }) => ({
      ...practice,
      ownedByUser: practice.user_id === userId,
      logCount: practice_logs.length,
      totalDistance: practice_logs.reduce(
        (sum, log) => sum + log.distance * log.rep_count * log.set_count,
        0,
      ),
    }))
    .sort((a, b) => (b[orderBy] ?? "").localeCompare(a[orderBy] ?? ""))
    .slice(0, limit);
}

export async function listRecords(userId: string, limit = LIST_LIMIT) {
  const supabase = getReadOnlyClient();
  return unwrapList(
    "records",
    await supabase
      .from("records")
      .select(
        "id, time, pool_type, is_relaying, reaction_time, note, created_at, styles(distance, style), competitions(title, date, place)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export async function listGoals(userId: string) {
  const supabase = getReadOnlyClient();
  return unwrapList(
    "goals",
    await supabase
      .from("goals")
      .select(
        "id, target_time, status, achieved_at, created_at, styles(distance, style), competitions(title, date), milestones(id, status)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
  );
}

export type ActivityItem = { at: string; text: string };

export async function getOverview(userId: string, header: UserHeader) {
  const [practices, records, goals] = await Promise.all([
    listPractices(userId, { limit: ACTIVITY_LIMIT, orderBy: "created_at" }),
    listRecords(userId, ACTIVITY_LIMIT),
    listGoals(userId),
  ]);

  const activity: ActivityItem[] = [];
  for (const practice of practices) {
    if (!practice.created_at) continue;
    const distance = practice.totalDistance > 0 ? ` ${practice.totalDistance.toLocaleString()}m` : "";
    activity.push({
      at: practice.created_at,
      text: `${practice.ownedByUser ? "練習を登録" : "チーム練習が作成された"} (${practice.date})${distance}${practice.title ? ` ・ ${practice.title}` : ""}`,
    });
  }
  for (const goal of goals) {
    if (goal.created_at) activity.push({ at: goal.created_at, text: "目標を設定" });
    if (goal.achieved_at) activity.push({ at: goal.achieved_at, text: "目標を達成" });
  }
  for (const membership of header.memberships) {
    if (membership.joined_at) {
      activity.push({
        at: membership.joined_at,
        text: `チーム「${membership.teams?.name ?? "不明"}」に参加`,
      });
    }
  }

  for (const record of records) {
    if (!record.created_at) continue;
    activity.push({
      at: record.created_at,
      text: `記録を登録 ${formatStyle(record.styles)} ${formatTime(record.time)}${
        record.competitions?.title ? ` (${record.competitions.title})` : ""
      }`,
    });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return { records: records.slice(0, 5), activity: activity.slice(0, ACTIVITY_LIMIT) };
}

// ---------------------------------------------------------------------------
// チーム
// ---------------------------------------------------------------------------

export type TeamSummary = {
  id: string;
  name: string;
  createdAt: string | null;
  memberCount: number;
};

export async function listTeams(): Promise<TeamSummary[]> {
  const supabase = getReadOnlyClient();
  const [teams, memberships] = await Promise.all([
    fetchAllPages("teams", (from, to) =>
      supabase.from("teams").select("id, name, created_at").order("id").range(from, to),
    ),
    fetchAllPages("team_memberships", (from, to) =>
      supabase
        .from("team_memberships")
        .select("team_id")
        .eq("status", "approved")
        .eq("is_active", true)
        .order("id")
        .range(from, to),
    ),
  ]);

  const memberCounts = new Map<string, number>();
  for (const membership of memberships) {
    memberCounts.set(membership.team_id, (memberCounts.get(membership.team_id) ?? 0) + 1);
  }

  return teams
    .map((team) => ({
      id: team.id,
      name: team.name,
      createdAt: team.created_at,
      memberCount: memberCounts.get(team.id) ?? 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount || a.name.localeCompare(b.name, "ja"));
}

export async function getTeamHeader(teamId: string) {
  const supabase = getReadOnlyClient();
  const [team, memberships, practices, competitions] = await Promise.all([
    // invite_code は参加に使える値なので読まない
    supabase
      .from("teams")
      .select("id, name, description, created_at, creator:users!teams_created_by_fkey(id, name)")
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .from("team_memberships")
      .select("id, role, status, is_active, joined_at, left_at, users(id, name)")
      .eq("team_id", teamId)
      .order("joined_at", { ascending: true })
      .limit(PAGE_SIZE),
    supabase.from("practices").select("id", { count: "exact", head: true }).eq("team_id", teamId),
    supabase
      .from("competitions")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId),
  ]);

  const teamRow = unwrap("teams", team);
  if (!teamRow) return null;

  return {
    team: teamRow,
    memberships: unwrapList("team_memberships", memberships),
    counts: {
      practices: unwrapCount("practices", practices),
      competitions: unwrapCount("competitions", competitions),
    },
  };
}

export type TeamHeader = NonNullable<Awaited<ReturnType<typeof getTeamHeader>>>;

function countAttendance(rows: { status: string | null }[]) {
  return {
    present: rows.filter((row) => row.status === "present").length,
    answered: rows.filter((row) => row.status !== null).length,
  };
}

export async function listTeamPractices(teamId: string) {
  const supabase = getReadOnlyClient();
  const rows = unwrapList(
    "practices",
    await supabase
      .from("practices")
      .select(
        "id, date, title, place, created_at, creator:users!practices_created_by_fkey(id, name), practice_logs(user_id, distance, rep_count, set_count), team_attendance(status)",
      )
      .eq("team_id", teamId)
      .order("date", { ascending: false })
      .limit(LIST_LIMIT),
  );
  return rows.map(({ practice_logs, team_attendance, ...practice }) => ({
    ...practice,
    logCount: practice_logs.length,
    swimmerCount: new Set(practice_logs.map((log) => log.user_id)).size,
    attendance: countAttendance(team_attendance),
  }));
}

export async function listTeamCompetitions(teamId: string) {
  const supabase = getReadOnlyClient();
  const rows = unwrapList(
    "competitions",
    await supabase
      .from("competitions")
      .select(
        "id, date, end_date, title, place, pool_type, entry_status, created_at, creator:users!competitions_created_by_fkey(id, name), records(user_id), entries(user_id), team_attendance(status)",
      )
      .eq("team_id", teamId)
      .order("date", { ascending: false })
      .limit(LIST_LIMIT),
  );
  return rows.map(({ records, entries, team_attendance, ...competition }) => ({
    ...competition,
    recordCount: records.length,
    recordSwimmerCount: new Set(records.map((record) => record.user_id)).size,
    entryCount: entries.length,
    attendance: countAttendance(team_attendance),
  }));
}

// ---------------------------------------------------------------------------
// 課金
// ---------------------------------------------------------------------------

// Premium の行と、決済元が付いたことのある行 (解約済みも含む)
export async function listBillingRows() {
  const supabase = getReadOnlyClient();
  const [subscriptions, users] = await Promise.all([
    fetchAllPages("user_subscriptions", (from, to) =>
      supabase
        .from("user_subscriptions")
        .select(
          "id, plan, status, provider, provider_environment, stripe_customer_id, premium_expires_at, cancel_at_period_end, created_at, updated_at",
        )
        .or("plan.eq.premium,provider.not.is.null")
        .order("id")
        .range(from, to),
    ),
    fetchAllPages("users", (from, to) =>
      supabase.from("users").select("id, name").order("id").range(from, to),
    ),
  ]);

  const userNames = new Map(users.map((user) => [user.id, user.name]));
  return {
    userNames,
    rows: subscriptions.map((row) => ({ ...row, premium: isPremium(row) })),
  };
}

export type BillingRow = Awaited<ReturnType<typeof listBillingRows>>["rows"][number];
