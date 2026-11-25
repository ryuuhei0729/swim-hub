"use client";

// =============================================================================
// ダッシュボードの日付詳細モーダル (DayDetailModal) 内の取得を React Query にまとめたもの
// =============================================================================
//
// 方針 (モバイルで同じ移行をしたときの教訓を反映):
// - staleTime 0: 以前は開くたびに取得していたので、開くたびに取り直す鮮度は保つ。
//   同じ日を開き直したときは前回の内容をすぐ出し、裏で取り直す。
// - retry false: 以前は失敗するとすぐ空/エラー表示にしていたので、既定の3回リトライで
//   スピナーのまま待たせない。
// - 失敗は例外のまま投げる (空配列や null を成功としてキャッシュしない)。
//   `.single()` の「行なし」(PGRST116) だけは失敗ではなく「無い」として扱う。
// - 画像の署名付き URL は期限があるのでクエリデータには入れない (パスだけを持ち、
//   URL の解決は表示側で毎回行う。lib/image-url 側で期限付きのキャッシュがある)。
// - 保存・削除の後は CalendarProvider が dayDetailKeys.all を reset するので、
//   書き込み前の内容は表示されない (取り直しが終わるまで読み込み中の表示になる)。

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EntryAPI } from "@swim-hub/shared/api/entries";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type {
  Practice,
  PracticeTag,
  PracticeTime,
  SplitTime,
  TeamAttendanceWithDetails,
} from "@apps/shared/types";
import type { CalendarItem } from "@apps/shared/types/ui";
import type {
  CompetitionEntryDisplay,
  FormattedPracticeLog,
} from "@/app/[locale]/(authenticated)/dashboard/_components/DayDetailModal/types";

export const dayDetailKeys = {
  all: ["dashboardDayDetail"] as const,
  practice: (practiceId: string, isTeamPractice: boolean, userId: string | null) =>
    [...dayDetailKeys.all, "practice", practiceId, { isTeamPractice, userId }] as const,
  competitionRecords: (competitionId: string, isTeamCompetition: boolean, userId: string | null) =>
    [
      ...dayDetailKeys.all,
      "competitionRecords",
      competitionId,
      { isTeamCompetition, userId },
    ] as const,
  competitionEntry: (competitionId: string) =>
    [...dayDetailKeys.all, "competitionEntry", competitionId] as const,
  splitTimes: (recordId: string) => [...dayDetailKeys.all, "splitTimes", recordId] as const,
  attendance: (eventType: "practice" | "competition", eventId: string) =>
    [...dayDetailKeys.all, "attendance", eventType, eventId] as const,
} as const;

/** 詳細の取得がこの時間を超えたら失敗として扱う (以前の 15 秒タイムアウトと同じ) */
export const DAY_DETAIL_TIMEOUT_MS = 15000;

const DAY_DETAIL_QUERY_OPTIONS = {
  staleTime: 0,
  retry: false,
} as const;

/** 取得がタイムアウトしたことを表すエラー (表示側でタイムアウト専用の文言を出すため) */
export class DayDetailTimeoutError extends Error {
  constructor() {
    super("day detail fetch timed out");
    this.name = "DayDetailTimeoutError";
  }
}

/** 未ログイン (セッション切れ) を表すエラー */
export class DayDetailAuthRequiredError extends Error {
  constructor() {
    super("authentication required");
    this.name = "DayDetailAuthRequiredError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new DayDetailTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/** 取得の失敗をラベル付きでログに残してから、そのまま投げ直す */
async function logFailure<T>(label: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    return await fetcher();
  } catch (error) {
    console.error(label, error);
    throw error;
  }
}

/** PostgREST の `.single()` で行が無かったときのエラーか */
function isNoRowsError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST116";
}

// -----------------------------------------------------------------------------
// 練習詳細
// -----------------------------------------------------------------------------

export type PracticeWithFormattedLogs = Omit<Practice, "practiceLogs" | "practice_logs"> & {
  practiceLogs: FormattedPracticeLog[];
};

export interface PracticeDetailData {
  practice: PracticeWithFormattedLogs;
  /** 練習画像のバケット内パス (署名付き URL は表示側で解決する) */
  imagePaths: string[];
}

type PracticeLogFromDB = {
  id: string;
  user_id: string;
  practice_id: string;
  style: string;
  swim_category?: "Swim" | "Pull" | "Kick";
  rep_count: number;
  set_count: number;
  distance: number;
  circle: number | null;
  note: string | null;
  video_path?: string | null;
  video_thumbnail_path?: string | null;
  practice_log_tags?: Array<{ practice_tag: PracticeTag }>;
  practice_times?: PracticeTime[];
  created_at?: string;
  updated_at?: string;
};

type PracticeFromDB = Practice & {
  practice_logs?: PracticeLogFromDB[];
  image_paths?: string[];
};

export async function fetchPracticeDetail(
  supabase: SupabaseClient,
  params: { practiceId: string; isTeamPractice: boolean; userId: string | null },
): Promise<PracticeDetailData> {
  const { practiceId, isTeamPractice, userId } = params;
  const { data, error } = await supabase
    .from("practices")
    .select(
      `
      *,
      practice_logs (
        *,
        practice_times (*),
        practice_log_tags (
          practice_tag:practice_tags (*)
        )
      )
    `,
    )
    .eq("id", practiceId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Practice data not found");

  const practiceData = data as PracticeFromDB;
  // チーム練習の場合、ダッシュボードでは自分のログのみ表示
  const filteredLogs =
    isTeamPractice && userId
      ? (practiceData.practice_logs || []).filter((log: PracticeLogFromDB) => log.user_id === userId)
      : practiceData.practice_logs || [];

  const practice: PracticeWithFormattedLogs = {
    ...practiceData,
    practiceLogs: filteredLogs.map(
      (log: PracticeLogFromDB): FormattedPracticeLog => ({
        id: log.id,
        practiceId: log.practice_id,
        style: log.style,
        swim_category: log.swim_category,
        repCount: log.rep_count,
        setCount: log.set_count,
        distance: log.distance,
        circle: log.circle,
        note: log.note,
        video_path: log.video_path,
        video_thumbnail_path: log.video_thumbnail_path,
        tags:
          log.practice_log_tags
            ?.map((plt: { practice_tag: PracticeTag }) => plt.practice_tag)
            .filter((tag): tag is PracticeTag => tag != null) || [],
        times:
          log.practice_times?.map((time: PracticeTime) => ({
            id: time.id,
            time: time.time,
            repNumber: time.rep_number,
            setNumber: time.set_number,
          })) || [],
        created_at: log.created_at,
        updated_at: log.updated_at,
      }),
    ),
  };

  return { practice, imagePaths: practiceData.image_paths || [] };
}

export function usePracticeDetailQuery(
  supabase: SupabaseClient,
  params: { practiceId: string; isTeamPractice: boolean; userId: string | null },
) {
  const { practiceId, isTeamPractice, userId } = params;
  return useQuery({
    queryKey: dayDetailKeys.practice(practiceId, isTeamPractice, userId),
    queryFn: () =>
      logFailure("練習詳細の取得エラー:", () =>
        withTimeout(
          fetchPracticeDetail(supabase, { practiceId, isTeamPractice, userId }),
          DAY_DETAIL_TIMEOUT_MS,
        ),
      ),
    ...DAY_DETAIL_QUERY_OPTIONS,
  });
}

// -----------------------------------------------------------------------------
// 大会の記録一覧 (CompetitionDetails)
// -----------------------------------------------------------------------------

export interface CompetitionRecordsData {
  /** calendar_view 形式に変換した記録 */
  records: CalendarItem[];
  /** 大会画像のバケット内パス */
  imagePaths: string[];
}

type RecordFromDB = {
  id: string;
  competition_id: string | null;
  style_id: number;
  time: number;
  video_path: string | null;
  video_thumbnail_path: string | null;
  note: string | null;
  is_relaying: boolean;
  reaction_time?: number | null;
  competition?: {
    id: string;
    title: string;
    date: string;
    place: string | null;
    pool_type: number;
  } | null;
  style?: {
    id: number;
    name_jp: string;
    distance: number;
  } | null;
  split_times?: Array<{
    id: string;
    record_id: string;
    distance: number;
    split_time: number;
    created_at: string;
  }>;
};

export async function fetchCompetitionRecords(
  supabase: SupabaseClient,
  params: { competitionId: string; isTeamCompetition: boolean; userId: string | null },
): Promise<CompetitionRecordsData> {
  const { competitionId, isTeamCompetition, userId } = params;

  let recordQuery = supabase
    .from("records")
    .select(
      `
        *,
        style:styles(*),
        competition:competitions(*),
        split_times(*)
      `,
    )
    .eq("competition_id", competitionId);

  // チーム大会の場合は自分の記録だけを表示
  if (isTeamCompetition && userId) {
    recordQuery = recordQuery.eq("user_id", userId);
  }

  // 大会画像パスとレコードを並行取得
  const [competitionResult, recordsResult] = await Promise.all([
    supabase.from("competitions").select("image_paths").eq("id", competitionId).single(),
    recordQuery,
  ]);

  if (recordsResult.error) throw recordsResult.error;
  // 画像パスの取得失敗を「画像なし」としてキャッシュすると、その状態で編集を開いたときに
  // 画像が無いものとして扱われてしまうので失敗として扱う。大会が無い (行なし) だけは画像なし
  if (competitionResult.error && !isNoRowsError(competitionResult.error)) {
    throw competitionResult.error;
  }

  const competition = competitionResult.data as { image_paths?: string[] | null } | null;
  const imagePaths = competition?.image_paths || [];

  const records = ((recordsResult.data || []) as RecordFromDB[]).map(
    (record): CalendarItem => ({
      id: record.id,
      type: "record" as const,
      date: record.competition?.date || "",
      title: record.competition?.title || "",
      place: record.competition?.place || "",
      note: record.note || undefined,
      metadata: {
        record: {
          time: record.time,
          is_relaying: record.is_relaying,
          video_path: record.video_path || undefined,
          video_thumbnail_path: record.video_thumbnail_path || undefined,
          reaction_time: record.reaction_time ?? null,
          style: record.style
            ? {
                id: record.style.id.toString(),
                name_jp: record.style.name_jp,
                distance: record.style.distance,
              }
            : {
                id: record.style_id.toString(),
                name_jp: "",
                distance: 0,
              },
          competition_id: record.competition_id || undefined,
          split_times: record.split_times || [],
        },
        competition: record.competition || undefined,
        style: record.style || undefined,
        // PM報告(Warning2トリアージ): record.competition は RecordFromDB 上 optional。
        // このクエリは .eq("competition_id", competitionId) で現在表示中の大会に紐づく
        // record のみを取得するため通常は必ず join されるが、表示中に大会が削除される
        // 競合（レース）では null になり得る。この値は CompetitionDetails の onEditRecord 経路で
        // editData.pool_type として記録編集フォームに渡り、そのまま保存され得るため
        // 「0が業務的に正しいデフォルトか」を独断で決めず残す。
        pool_type: record.competition?.pool_type || 0,
      },
    }),
  );

  return { records, imagePaths };
}

export function useCompetitionRecordsQuery(
  supabase: SupabaseClient,
  params: { competitionId: string; isTeamCompetition: boolean; userId: string | null },
) {
  const { competitionId, isTeamCompetition, userId } = params;
  return useQuery({
    queryKey: dayDetailKeys.competitionRecords(competitionId, isTeamCompetition, userId),
    queryFn: () =>
      logFailure("記録の取得エラー:", () =>
        withTimeout(
          fetchCompetitionRecords(supabase, { competitionId, isTeamCompetition, userId }),
          DAY_DETAIL_TIMEOUT_MS,
        ),
      ),
    ...DAY_DETAIL_QUERY_OPTIONS,
  });
}

// -----------------------------------------------------------------------------
// 大会のエントリー (CompetitionWithEntry)
// -----------------------------------------------------------------------------

export type CompetitionEntryStatus = "before" | "open" | "closed";

export interface CompetitionEntryData {
  /** 大会のエントリー状況。大会が見つからなかったときは null */
  entryStatus: CompetitionEntryStatus | null;
  /** 大会画像のバケット内パス */
  imagePaths: string[];
  /** 自分のエントリー */
  entries: CompetitionEntryDisplay[];
}

export async function fetchCompetitionEntry(
  supabase: SupabaseClient,
  entryApi: EntryAPI,
  competitionId: string,
): Promise<CompetitionEntryData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new DayDetailAuthRequiredError();

  // competition の entry_status と image_paths を取得
  const { data: competitionData, error: competitionError } = await supabase
    .from("competitions")
    .select("entry_status, image_paths")
    .eq("id", competitionId)
    .single();

  // 行なし以外の失敗は「エントリー状況・画像なし」としてキャッシュせず失敗として扱う
  if (competitionError && !isNoRowsError(competitionError)) throw competitionError;

  const competition = competitionData as {
    entry_status?: CompetitionEntryStatus | null;
    image_paths?: string[] | null;
  } | null;

  // EntryAPI を使用してエントリーを取得し、現在のユーザーのエントリーのみに絞る
  const allEntries = await entryApi.getEntriesByCompetition(competitionId);
  const entries = allEntries
    .filter((entry) => entry.user_id === user.id)
    .map(
      (entry): CompetitionEntryDisplay => ({
        id: entry.id,
        styleId: entry.style_id,
        styleName: entry.style?.name_jp || "",
        entryTime: entry.entry_time,
        note: entry.note,
      }),
    );

  return {
    entryStatus: competition ? competition.entry_status || "before" : null,
    imagePaths: competition?.image_paths || [],
    entries,
  };
}

export function useCompetitionEntryQuery(supabase: SupabaseClient, competitionId: string) {
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase]);
  return useQuery({
    queryKey: dayDetailKeys.competitionEntry(competitionId),
    queryFn: () =>
      logFailure("エントリーデータの取得エラー:", () =>
        fetchCompetitionEntry(supabase, entryApi, competitionId),
      ),
    ...DAY_DETAIL_QUERY_OPTIONS,
  });
}

// -----------------------------------------------------------------------------
// スプリットタイム (RecordSplitTimes)
// -----------------------------------------------------------------------------

export async function fetchRecordSplitTimes(
  supabase: SupabaseClient,
  recordId: string,
): Promise<SplitTime[]> {
  const { data, error } = await supabase
    .from("split_times")
    .select("*")
    .eq("record_id", recordId)
    .order("distance", { ascending: true });
  if (error) throw error;
  return (data || []) as SplitTime[];
}

export function useRecordSplitTimesQuery(supabase: SupabaseClient, recordId: string) {
  return useQuery({
    queryKey: dayDetailKeys.splitTimes(recordId),
    queryFn: () =>
      logFailure("スプリットタイムの取得エラー:", () => fetchRecordSplitTimes(supabase, recordId)),
    ...DAY_DETAIL_QUERY_OPTIONS,
  });
}

// -----------------------------------------------------------------------------
// 出欠 (AttendanceModal)
// -----------------------------------------------------------------------------

export function useDayDetailAttendanceQuery(
  supabase: SupabaseClient,
  params: { eventType: "practice" | "competition"; eventId: string; enabled: boolean },
) {
  const { eventType, eventId, enabled } = params;
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);
  return useQuery<TeamAttendanceWithDetails[]>({
    queryKey: dayDetailKeys.attendance(eventType, eventId),
    queryFn: () =>
      logFailure("出欠情報の取得に失敗:", () =>
        eventType === "practice"
          ? attendanceAPI.getAttendanceByPractice(eventId)
          : attendanceAPI.getAttendanceByCompetition(eventId),
      ),
    enabled,
    ...DAY_DETAIL_QUERY_OPTIONS,
  });
}
