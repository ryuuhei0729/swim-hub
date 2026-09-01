"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthProvider";
import { useTranslations } from "next-intl";
import {
  PlusIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  MapPinIcon,
  TrophyIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  ClipboardDocumentCheckIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format, isValid } from "date-fns";
import { ja } from "date-fns/locale";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import type { CompetitionImageData } from "@/components/forms/CompetitionBasicForm";
import TeamCompetitionEntryModal from "./TeamCompetitionEntryModal";
import TeamCompetitionRecordsModal from "./TeamCompetitionRecordsModal";
import Pagination from "@/components/ui/Pagination";
import DeleteConfirmModal from "@/components/ui/DeleteConfirmModal";
import { TeamRecordsAPI } from "@apps/shared/api/teams/records";
import { StyleAPI } from "@apps/shared/api/styles";
import { RecordAPI } from "@apps/shared/api/records";
import RecordLogForm from "@/components/forms/record-log/RecordLogForm";
import type {
  RecordLogEditData,
  RecordLogFormData,
  StyleOption,
} from "@/components/forms/record-log/types";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { RecordInsert, RecordUpdate, PoolType } from "@apps/shared/types";
import { isPoolType } from "@apps/shared/types";
import type { EditingData } from "@/stores/types";

const CompetitionBasicForm = dynamic(
  () => import("@/components/forms/CompetitionBasicForm"),
  {
    ssr: false,
  },
);

export interface TeamCompetition {
  id: string;
  user_id: string;
  team_id: string;
  title: string;
  date: string;
  end_date: string | null;
  place: string | null;
  pool_type: PoolType;
  entry_status?: "before" | "open" | "closed";
  note: string | null;
  created_at: string;
  created_by: string | null;
  users?: {
    name: string;
  };
  created_by_user?: {
    name: string;
  };
  records?: {
    id: string;
    time: number;
    users?: {
      name: string;
    };
  }[];
  entries?: {
    id: string;
    user_id: string;
    style_id: number;
    entry_time: number | null;
    users?: {
      name: string;
    };
  }[];
}

// Supabaseクエリ結果の型定義
// Note: Supabaseはリレーションを配列として返す場合がある
interface RawCompetitionUser {
  name: string;
}

interface RawCompetitionRecord {
  id: string;
  time: number;
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
}

interface RawCompetitionEntry {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
}

interface RawCompetitionData {
  id: string;
  user_id: string;
  team_id: string;
  title: string;
  date: string;
  end_date?: string | null;
  place: string | null;
  pool_type?: number | null;
  entry_status: string | null;
  note: string | null;
  created_at: string;
  created_by: string | null;
  users?: RawCompetitionUser | RawCompetitionUser[] | null;
  created_by_user?: RawCompetitionUser | RawCompetitionUser[] | null;
  records?: RawCompetitionRecord[] | null;
  entries?: RawCompetitionEntry[] | null;
}

// 「自分の記録を追加」フォームの初期値復元専用: 一覧クエリの軽量な records とは別に、
// 編集フォームに必要な全フィールドをオンデマンド取得するための型 (styles 取得と同じパターン)
interface RawSelfRecordSplitTime {
  distance: number;
  split_time: number;
}

interface RawSelfRecordEntry {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  is_relaying: boolean;
  note: string | null;
  reaction_time: number | null;
  video_path: string | null;
  video_thumbnail_path: string | null;
  split_times?: RawSelfRecordSplitTime[] | null;
}

/**
 * Supabaseが返すユーザー情報（配列または単一オブジェクト）を単一オブジェクトに正規化
 */
function normalizeUser(
  user: RawCompetitionUser | RawCompetitionUser[] | null | undefined,
): { name: string } | undefined {
  if (!user) return undefined;
  if (Array.isArray(user)) {
    return user.length > 0 ? { name: user[0]!.name } : undefined; // user.length > 0 を三項演算子内で確認済み
  }
  return { name: user.name };
}

/**
 * Supabaseのクエリ結果をTeamCompetition[]に変換するマッパー関数
 */
function mapToTeamCompetitions(
  data: RawCompetitionData[] | null,
): TeamCompetition[] {
  if (!data) return [];

  return data.map(
    (item): TeamCompetition => ({
      id: item.id,
      user_id: item.user_id,
      team_id: item.team_id,
      title: item.title,
      date: item.date,
      end_date: item.end_date ?? null,
      place: item.place,
      // DB 由来の生の数値を PoolType (0 | 1) の値域に narrowing する。範囲外/NULL は 0 (短水路) にフォールバック
      pool_type: isPoolType(item.pool_type) ? item.pool_type : 0,
      entry_status: isValidEntryStatus(item.entry_status)
        ? item.entry_status
        : undefined,
      note: item.note,
      created_at: item.created_at,
      created_by: item.created_by,
      users: normalizeUser(item.users),
      created_by_user: normalizeUser(item.created_by_user),
      records: item.records?.map((record) => ({
        id: record.id,
        time: record.time,
        users: normalizeUser(record.users),
      })),
      entries: item.entries?.map((entry) => ({
        id: entry.id,
        user_id: entry.user_id,
        style_id: entry.style_id,
        entry_time: entry.entry_time,
        users: normalizeUser(entry.users),
      })),
    }),
  );
}

function isValidEntryStatus(
  status: string | null,
): status is "before" | "open" | "closed" {
  return status === "before" || status === "open" || status === "closed";
}

export interface TeamCompetitionsProps {
  teamId: string;
  isAdmin?: boolean;
}

export default function TeamCompetitions({
  teamId,
  isAdmin = false,
}: TeamCompetitionsProps) {
  const { supabase, user } = useAuth();
  const router = useRouter();
  const t = useTranslations("teams");
  const [competitions, setCompetitions] = useState<TeamCompetition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] =
    useState<TeamCompetition | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [selectedCompetitionForRecords, setSelectedCompetitionForRecords] =
    useState<TeamCompetition | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selfRecordCompetition, setSelfRecordCompetition] =
    useState<TeamCompetition | null>(null);
  const [showSelfRecordForm, setShowSelfRecordForm] = useState(false);
  const [selfRecordStyles, setSelfRecordStyles] = useState<StyleOption[]>([]);
  const [selfRecordLoading, setSelfRecordLoading] = useState(false);
  // 代理入力済みの自分の既存記録（オンデマンド取得、styles 取得と同じ設計方針）
  const [selfRecordExistingRecords, setSelfRecordExistingRecords] = useState<
    RawSelfRecordEntry[]
  >([]);
  const pageSize = 20;

  const {
    isBasicFormOpen,
    selectedDate,
    editingData,
    isLoading: formLoading,
    openBasicForm,
    closeBasicForm,
    setLoading: setFormLoading,
  } = useCompetitionStore();

  // チームの大会一覧を取得（関数として抽出）
  const loadTeamCompetitions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (currentPage - 1) * pageSize;

      // 総件数とデータを並列取得（パフォーマンス最適化）
      const [countResult, competitionsResult] = await Promise.all([
        // 総件数を取得
        supabase
          .from("competitions")
          .select("*", { count: "exact", head: true })
          .eq("team_id", teamId),
        // チームIDが設定された大会を取得（エントリー情報も含む）
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
            created_by,
            users!competitions_user_id_fkey (
              name
            ),
            created_by_user:users!competitions_created_by_fkey (
              name
            ),
            records (
              id,
              time,
              users!records_user_id_fkey (
                name
              )
            ),
            entries (
              id,
              user_id,
              style_id,
              entry_time,
              users!entries_user_id_fkey (
                name
              )
            )
          `,
          )
          .eq("team_id", teamId)
          .order("date", { ascending: false })
          .range(offset, offset + pageSize - 1),
      ]);

      if (countResult.error) throw countResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      setTotalCount(countResult.count || 0);
      setCompetitions(
        mapToTeamCompetitions(
          competitionsResult.data as RawCompetitionData[] | null,
        ),
      );
    } catch (err) {
      console.error("チーム大会情報の取得に失敗:", err);
      setError(t("competitions.error"));
    } finally {
      setLoading(false);
    }
  }, [teamId, supabase, currentPage, pageSize, t]);

  // 初回読み込み
  useEffect(() => {
    loadTeamCompetitions();
  }, [loadTeamCompetitions]);

  const handleAddCompetition = () => {
    openBasicForm(new Date());
  };

  // 管理者向け: 既存の大会を編集(CompetitionBasicForm を editData 付きで開く)
  const handleEditCompetition = (
    e: React.MouseEvent,
    competition: TeamCompetition,
  ) => {
    e.stopPropagation();
    openBasicForm(new Date(competition.date), {
      id: competition.id,
      type: "competition",
      date: competition.date,
      end_date: competition.end_date || "",
      title: competition.title,
      place: competition.place || "",
      pool_type: competition.pool_type,
      note: competition.note || "",
    } as EditingData);
  };

  const handleCompetitionBasicSubmit = async (
    basicData: {
      date: string;
      endDate: string;
      title: string;
      place: string;
      poolType: number;
      note: string;
    },
    _imageData?: CompetitionImageData,
    _options?: { continueToNext?: boolean; skipEntry?: boolean },
  ) => {
    if (!user) {
      setError(t("competitionForm.authRequired"));
      closeBasicForm();
      return;
    }

    setFormLoading(true);
    try {
      const api = new TeamRecordsAPI(supabase);

      if (editingData?.id) {
        await api.update(editingData.id, {
          date: basicData.date,
          end_date: basicData.endDate || null,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null,
        });
      } else {
        await api.create({
          user_id: user.id,
          team_id: teamId,
          date: basicData.date,
          end_date: basicData.endDate || null,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null,
        });
      }

      closeBasicForm();
      if (currentPage !== 1) {
        setCurrentPage(1);
      } else {
        await loadTeamCompetitions();
      }
    } catch (err) {
      console.error(
        editingData?.id ? "大会の更新に失敗:" : "大会の作成に失敗:",
        err,
      );
      setError(
        editingData?.id
          ? t("competitionForm.updateFailed")
          : t("competitionForm.createFailed"),
      );
    } finally {
      setFormLoading(false);
    }
  };

  // 管理者向け: 削除確認モーダルを開く
  const handleRequestDelete = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation();
    setPendingDeleteId(competitionId);
  };

  const handleCancelDelete = () => {
    setPendingDeleteId(null);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId || deleting) return;
    setDeleting(true);
    try {
      const api = new TeamRecordsAPI(supabase);
      await api.remove(pendingDeleteId);
      setPendingDeleteId(null);
      await loadTeamCompetitions();
    } catch (err) {
      console.error("大会の削除に失敗:", err);
      setError(t("competitionForm.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // loadTeamCompetitionsはuseEffectで自動実行される
  };

  // 記録入力ページへ遷移
  const handleRecordClick = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation(); // 親要素のクリックイベントを停止
    router.push(`/teams/${teamId}/competitions/${competitionId}/records`);
  };

  // エントリー代理一括入力ページへ遷移
  const handleEntryBulkInputClick = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation(); // 親要素のクリックイベントを停止
    router.push(`/teams/${teamId}/competitions/${competitionId}/entries`);
  };

  // エントリー管理モーダルを開く
  const handleEntryClick = (
    e: React.MouseEvent,
    competition: TeamCompetition,
  ) => {
    e.stopPropagation();
    setSelectedCompetition(competition);
    setShowEntryModal(true);
  };

  // 記録一覧モーダルを開く
  const handleOpenRecords = (competition: TeamCompetition) => {
    setSelectedCompetitionForRecords(competition);
    setShowRecordsModal(true);
  };

  // 一般メンバー含む全員向け: 自分の記録を追加(RecordLogForm を competitionId 付きで開く)
  const handleOpenSelfRecord = (
    e: React.MouseEvent,
    competition: TeamCompetition,
  ) => {
    e.stopPropagation();
    setSelfRecordCompetition(competition);
    setShowSelfRecordForm(true);
    // 前回開いた大会の既存記録が一瞬表示されないよう、取得前にクリアする
    setSelfRecordExistingRecords([]);
    // 種目一覧を非同期取得(モーダルは即座に開く。失敗しても致命的ではない)
    (async () => {
      try {
        const styleAPI = new StyleAPI(supabase);
        const styles = await styleAPI.getStyles();
        setSelfRecordStyles(
          styles.map((style) => ({
            id: style.id.toString(),
            nameJp: style.name_jp,
            distance: style.distance,
          })),
        );
      } catch (err) {
        console.error("種目一覧の取得に失敗:", err);
      }
    })();
    // 代理入力済みの自分の既存記録を非同期取得(モーダルは即座に開く。失敗しても致命的ではない=
    // タイムが空欄のまま種目のみ復元される状態に degrade する。一覧クエリ (loadTeamCompetitions)
    // の records select は widen しない方針のため、ここで別クエリとして取得する)。
    //
    // この導線は isAdmin ガードが無く一般メンバーも操作できるため、records テーブルを
    // 直接クエリし、competition_id と user_id の2条件でサーバー側に絞り込みを要求する
    // (C3, PM実測・PM裁定2)。これにより他メンバーの note/video_path/split_times 等の
    // 私的データが一切ネットワークレスポンスに含まれない。
    // competition_id で対象大会1件に絞るため、「自分の記録がある直近N件」のような
    // order/range による件数上限は不要 (長期利用者が51件目以降の大会を開くと
    // 事前入力が静かに失敗する既知バグの回避)。
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("records")
          .select(
            `
            id,
            user_id,
            style_id,
            time,
            is_relaying,
            note,
            reaction_time,
            video_path,
            video_thumbnail_path,
            split_times ( distance, split_time )
          `,
          )
          .eq("competition_id", competition.id)
          .eq("user_id", user.id);

        if (error) throw error;

        // サーバー側で competition_id + user_id の2条件で既に絞り込まれているが、
        // クライアント側でも念のため多重防御として自分の記録のみに絞る
        const ownRecords = ((data as RawSelfRecordEntry[] | null) || []).filter(
          (record) => record.user_id === user.id,
        );
        setSelfRecordExistingRecords(ownRecords);
      } catch (err) {
        console.error("代理入力済み記録の取得に失敗:", err);
      }
    })();
  };

  const handleCloseSelfRecordForm = () => {
    setShowSelfRecordForm(false);
    setSelfRecordCompetition(null);
    setSelfRecordExistingRecords([]);
  };

  // 自分の記録が対象大会にエントリー済みの場合、エントリー内容をフォームの初期値として渡す
  const selfRecordEntryDataList = useMemo<EntryInfo[]>(() => {
    if (!selfRecordCompetition || !user) return [];
    const styleNameById = new Map(
      selfRecordStyles.map((style) => [String(style.id), style.nameJp]),
    );
    return (selfRecordCompetition.entries || [])
      .filter((entry) => entry.user_id === user.id)
      .map((entry) => ({
        styleId: entry.style_id,
        styleName: styleNameById.get(String(entry.style_id)) || "",
        entryTime: entry.entry_time,
      }));
  }, [selfRecordCompetition, selfRecordStyles, user]);

  // dedupe/突合キー: 水泳競技では「個人種目の 100m Fr」と「リレーの1泳者として
  // 泳いだ 100m Fr」は別レースであり、同じ大会・同じ種目で両方の記録が存在するのは
  // 正当なデータ (records/entries とも (user_id, competition_id, style_id) の
  // UNIQUE 制約は無い)。styleId 単独で dedupe すると片方が消えて入力漏れになるため、
  // 必ず (style_id, is_relaying) の複合キーで扱う
  const selfRecordDedupeKey = (styleId: number, isRelaying: boolean) =>
    `${styleId}:${isRelaying}`;

  const buildRecordLogEditData = (existing: RawSelfRecordEntry): RecordLogEditData => ({
    id: existing.id,
    styleId: existing.style_id,
    time: existing.time,
    isRelaying: existing.is_relaying,
    // リレー記録の split(経過タイム) 復元は別セッション進行中の WIP と衝突するため
    // 本スプリントのスコープ外とし、明示的に空にする (V-SR-02)
    splitTimes: existing.is_relaying
      ? []
      : (existing.split_times || []).map((st) => ({
          distance: st.distance,
          splitTime: st.split_time,
        })),
    note: existing.note ?? undefined,
    videoPath: existing.video_path ?? undefined,
    // C2: UPDATE payload はこの値をそのまま使って再送するため、ここで既存値を
    // 保持しておかないと動画本体は残るがサムネイルだけ null で消えてしまう
    videoThumbnailPath: existing.video_thumbnail_path ?? undefined,
    reactionTime: existing.reaction_time ?? undefined,
  });

  // 代理入力済みの既存記録をフォームの初期値として渡す (Issue1: タイム空欄バグの修正)。
  // entryDataList と同じ順序で構築し、useRecordLogForm の initialRecords 経路
  // (time 復元を含めて既に正しく動作する既存メカニズム) にそのまま渡せるようにする。
  // 既存記録が1件も無い場合は undefined を返し、entryDataList ベースの従来の
  // デフォルト初期化フロー (非回帰: V-SR-04) を維持する。
  const selfRecordInitialRecords = useMemo<RecordLogEditData[] | undefined>(() => {
    if (!selfRecordCompetition || !user) return undefined;
    if (selfRecordExistingRecords.length === 0) return undefined;

    const claimedKeys = new Set<string>();
    const cards: RecordLogEditData[] = [];

    // 1. entries (個人エントリー) の順序でカードを構築する。
    // entries は isRelaying 相当の情報を持たないため、まず「非リレーの完全一致」を
    // 優先して探し、無ければ「同じ種目で未使用の記録」(リレー含む) にフォールバックする。
    // これにより、実際の代理入力がリレー記録としてのみ存在するケース (V-SR-02) でも、
    // 1件しかない実データを正しく1枚のカードに復元できる。
    selfRecordEntryDataList.forEach((entry) => {
      let matched = selfRecordExistingRecords.find(
        (record) =>
          record.style_id === entry.styleId &&
          !record.is_relaying &&
          !claimedKeys.has(selfRecordDedupeKey(record.style_id, record.is_relaying)),
      );
      if (!matched) {
        matched = selfRecordExistingRecords.find(
          (record) =>
            record.style_id === entry.styleId &&
            !claimedKeys.has(selfRecordDedupeKey(record.style_id, record.is_relaying)),
        );
      }
      if (matched) {
        claimedKeys.add(selfRecordDedupeKey(matched.style_id, matched.is_relaying));
        cards.push(buildRecordLogEditData(matched));
      } else {
        cards.push({ styleId: entry.styleId });
      }
    });

    // 2. entries で拾われなかった残りの既存記録を、それぞれ独立したカードとして追加する。
    // 個人種目とリレーの両方に記録がある場合、1で個人側が既にクレーム済みのため、
    // ここでリレー側が別カードとして追加され、両方が保持される (入力漏れ防止)。
    selfRecordExistingRecords.forEach((record) => {
      const key = selfRecordDedupeKey(record.style_id, record.is_relaying);
      if (claimedKeys.has(key)) return;
      claimedKeys.add(key);
      cards.push(buildRecordLogEditData(record));
    });

    return cards;
  }, [
    selfRecordCompetition,
    user,
    selfRecordEntryDataList,
    selfRecordExistingRecords,
  ]);

  const handleSelfRecordSubmit = async (formDataList: RecordLogFormData[]) => {
    if (!user || !selfRecordCompetition) return;
    setSelfRecordLoading(true);
    try {
      const recordAPI = new RecordAPI(supabase);
      for (const formData of formDataList) {
        const reactionTime =
          formData.reactionTime && formData.reactionTime.trim() !== ""
            ? parseFloat(formData.reactionTime)
            : null;

        if (formData.existingRecordId) {
          // 代理入力済みの既存 records 行を UPDATE する (重複INSERT防止)。
          // 自然キーではなく id 指定で更新する (別行破壊の事故が過去にあるため)。
          // C2: INSERT 用の完全指定オブジェクトを UPDATE に転用すると、フォームに
          // 現れないフィールド (video_thumbnail_path 等) を意図せず null で潰す。
          // RecordUpdate は Partial なので、この画面で変更しうるフィールドのみを
          // 明示的に組み立てる (competition_id/team_id はこの画面では不変のため送らない。
          // pool_type は競技会側の破損データからの自己修復のため明示的に揃える。D-6)
          const updatePayload: RecordUpdate = {
            style_id: parseInt(formData.styleId, 10),
            time: formData.time,
            video_path: formData.videoPath || null,
            video_thumbnail_path: formData.videoThumbnailPath || null,
            note: formData.note || null,
            is_relaying: formData.isRelaying || false,
            // D-6: 保存対象の競技会の pool_type に揃える(自分の記録を保存する経路の中だけ)。
            // 競技会本体が短水路(0)に破壊された後に長水路(1)へ修正したケースで、記録側も追随させる。
            pool_type: selfRecordCompetition.pool_type,
            reaction_time: reactionTime,
          };
          const updatedRecord = await recordAPI.updateRecord(
            formData.existingRecordId,
            updatePayload,
          );

          // split_times の書き込み判定は「ロード時点の既存記録が is_relaying だったか」
          // (existingRecordWasRelaying) で行う。フォーム上の isRelaying トグルで判定すると
          // ユーザーがトグルを操作した場合に判定がぶれる。
          // リレー記録の split はこの画面では意図的に空のままロードしている (V-SR-02) ため、
          // 書き込むとユーザーに見えていない実データ (別セッション進行中のリレー split WIP を
          // 含む) を消してしまう (C1)。読まないし書かない、を一貫させる。
          if (!formData.existingRecordWasRelaying) {
            // 非リレー: 0件でも常に呼び、全件削除された場合も正しく永続化する
            // (CompetitionClient.tsx の既存パターンと同じ「空配列でも常に呼ぶ」方式)
            await recordAPI.replaceSplitTimes(
              updatedRecord.id,
              formData.splitTimes.map((splitTime) => ({
                distance: splitTime.distance,
                split_time: splitTime.splitTime,
              })),
            );
          }
        } else {
          const createPayload: Omit<RecordInsert, "user_id"> = {
            competition_id: selfRecordCompetition.id,
            team_id: teamId,
            style_id: parseInt(formData.styleId, 10),
            time: formData.time,
            video_path: formData.videoPath || null,
            video_thumbnail_path: null,
            note: formData.note || null,
            is_relaying: formData.isRelaying || false,
            reaction_time: reactionTime,
            pool_type: selfRecordCompetition.pool_type,
          };
          const newRecord = await recordAPI.createRecord(createPayload);
          if (formData.splitTimes.length > 0) {
            await recordAPI.createSplitTimes(
              formData.splitTimes.map((splitTime) => ({
                record_id: newRecord.id,
                distance: splitTime.distance,
                split_time: splitTime.splitTime,
              })),
            );
          }
        }
      }

      handleCloseSelfRecordForm();
      await loadTeamCompetitions();
    } catch (err) {
      console.error("記録の登録に失敗:", err);
      // ここで setError しない (Reviewer/PM 実測: このモーダルは RecordLogForm の
      // fixed inset-0 全画面オーバーレイの裏に隠れて表示先が見えず、かつ throw しないと
      // resetUnsavedChanges() が保存失敗時にも実行されて未保存ガードが外れる)。
      // rethrow して RecordLogForm 側の setFormError (モーダル内 role="alert") に委ねる。
      throw err;
    } finally {
      setSelfRecordLoading(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        {/* ヘッダー(データ読み込み中/エラー時も常に描画し、大会追加ボタンを即座に操作可能にする) */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("competitions.title", { count: competitions.length })}
          </h2>
          {isAdmin && (
            <button
              onClick={handleAddCompetition}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              {t("competitions.addButton")}
            </button>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse">
            <div className="space-y-3">
              {[...Array(3)].map((_, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-32 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => router.refresh()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              {t("competitions.retry")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {competitions.map((competition) => {
              const hasRecords =
                competition.records && competition.records.length > 0;
              const canViewRecords = isAdmin && hasRecords;
              return (
                <div
                  key={competition.id}
                  onClick={() =>
                    canViewRecords ? handleOpenRecords(competition) : undefined
                  }
                  onKeyDown={(e) => {
                    if (
                      canViewRecords &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      handleOpenRecords(competition);
                    }
                  }}
                  aria-label={
                    canViewRecords
                      ? `${competition.title || t("competitions.fallbackTitle")}の記録を閲覧`
                      : undefined
                  }
                  tabIndex={canViewRecords ? 0 : undefined}
                  role={canViewRecords ? "button" : undefined}
                  className={`w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 ${
                    canViewRecords
                      ? "cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      : "cursor-default"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <TrophyIcon className="h-5 w-5 text-blue-500" />
                        <span className="text-lg font-medium text-gray-900">
                          {competition.title || t("competitions.fallbackTitle")}
                        </span>
                        {/* エントリーステータスバッジ */}
                        {competition.entry_status && (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              competition.entry_status === "open"
                                ? "bg-green-100 text-green-800"
                                : competition.entry_status === "closed"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {competition.entry_status === "open"
                              ? t("competitions.entryStatus.open")
                              : competition.entry_status === "closed"
                                ? t("competitions.entryStatus.closed")
                                : t("competitions.entryStatus.before")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 mb-1">
                        <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {(() => {
                            const competitionDate = new Date(
                              competition.date + "T00:00:00",
                            );
                            return isValid(competitionDate)
                              ? format(competitionDate, "yyyy年M月d日(EEE)", {
                                  locale: ja,
                                })
                              : "-";
                          })()}
                        </span>
                      </div>

                      {competition.place && (
                        <div className="flex items-center space-x-2 mb-1">
                          <MapPinIcon className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            {competition.place}
                          </span>
                        </div>
                      )}

                      {competition.note && (
                        <p className="text-sm text-gray-600 mb-2 mt-2">
                          {competition.note}
                        </p>
                      )}

                      {/* 記録情報（管理者のみ表示） */}
                      {isAdmin &&
                        (competition.records &&
                        competition.records.length > 0 ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                              <ChartBarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                              登録記録: {competition.records.length}件
                            </span>
                            <span className="text-xs text-gray-500 flex items-center">
                              <EyeIcon className="h-3 w-3 mr-1" />
                              タップで詳細
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-gray-500 flex items-center gap-1">
                              <ChartBarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                              登録記録なし
                            </span>
                            <span className="text-xs text-blue-600 flex items-center">
                              <PlusIcon className="h-3 w-3 mr-1" />
                              追加可能
                            </span>
                          </div>
                        ))}

                      {/* エントリー情報 */}
                      {competition.entries &&
                        competition.entries.length > 0 && (
                          <div className="mt-1">
                            <span className="text-sm text-blue-600 flex items-center gap-1">
                              <PencilSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                              エントリー: {competition.entries.length}件
                            </span>
                          </div>
                        )}

                      <div className="mt-2">
                        <span className="text-xs text-gray-500">
                          作成者:{" "}
                          {competition.users?.name ||
                            competition.created_by_user?.name ||
                            "Unknown"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="text-xs text-gray-500">
                        {format(new Date(competition.created_at), "M/d HH:mm")}
                      </p>

                      {/* アクションボタン */}
                      <div className="flex gap-2 flex-wrap justify-end">
                        {/* エントリー管理ボタン（過去日は非表示。今日・未来は表示） */}
                        {!isCompetitionDateInPast(competition.date) && (
                          <button
                            onClick={(e) => handleEntryClick(e, competition)}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                          >
                            <ClipboardDocumentListIcon className="h-4 w-4 mr-1" />
                            {t("competitions.card.entryButton")}
                          </button>
                        )}

                        {/* 一般メンバー含む全員向け: 自分の記録を追加 */}
                        <button
                          onClick={(e) => handleOpenSelfRecord(e, competition)}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                        >
                          <PlusIcon className="h-4 w-4 mr-1" />
                          {t("competitions.selfRecordButton")}
                        </button>

                        {/* エントリー代理一括入力ボタン（adminのみ。記録入力ボタンと構造的に対等な
                            admin専用ページへの導線のため、同じプライマリ配色に揃える） */}
                        {isAdmin && (
                          <button
                            onClick={(e) =>
                              handleEntryBulkInputClick(e, competition.id)
                            }
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                          >
                            <ClipboardDocumentCheckIcon className="h-4 w-4 mr-1" />
                            {t("competitions.card.entryBulkInputButton")}
                          </button>
                        )}

                        {/* 記録入力ボタン（adminのみ） */}
                        {isAdmin && (
                          <button
                            onClick={(e) =>
                              handleRecordClick(e, competition.id)
                            }
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4 mr-1" />
                            {t("competitions.card.recordsButton")}
                          </button>
                        )}
                      </div>

                      {/* 編集・削除ボタン（adminのみ） */}
                      {isAdmin && (
                        <div className="flex gap-1">
                          <button
                            onClick={(e) =>
                              handleEditCompetition(e, competition)
                            }
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid="team-competition-edit-button"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            aria-label={t("competitions.card.editButton")}
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5 mr-1" />
                            {t("competitions.card.editButton")}
                          </button>
                          <button
                            onClick={(e) =>
                              handleRequestDelete(e, competition.id)
                            }
                            onKeyDown={(e) => e.stopPropagation()}
                            data-testid="team-competition-delete-button"
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                            aria-label={t("competitions.card.deleteButton")}
                          >
                            <TrashIcon className="h-3.5 w-3.5 mr-1" />
                            {t("competitions.card.deleteButton")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {competitions.length === 0 && (
              <div className="text-center py-8">
                <TrophyIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">{t("competitions.empty")}</p>
                {isAdmin && (
                  <button
                    onClick={handleAddCompetition}
                    className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                  >
                    {t("competitions.addButton")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ページング */}
        {!loading && !error && totalCount > 0 && (
          <div className="mt-4 pt-4 px-4 sm:px-6 pb-6 border-t border-gray-200">
            <Pagination
              currentPage={currentPage}
              totalPages={Math.ceil(totalCount / pageSize)}
              totalItems={totalCount}
              itemsPerPage={pageSize}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* チーム大会作成・編集モーダル */}
      <Suspense fallback={null}>
        <CompetitionBasicForm
          isOpen={isBasicFormOpen}
          onClose={closeBasicForm}
          onSubmit={handleCompetitionBasicSubmit}
          selectedDate={selectedDate || new Date()}
          editData={
            editingData
              ? {
                  date: (editingData as { date?: string }).date,
                  end_date:
                    (editingData as { end_date?: string | null }).end_date,
                  title:
                    (editingData as { title?: string | null }).title ??
                    undefined,
                  place: (editingData as { place?: string }).place,
                  pool_type: (editingData as { pool_type?: number }).pool_type,
                  note: (editingData as { note?: string }).note,
                }
              : undefined
          }
          isLoading={formLoading}
          teamMode={true}
        />
      </Suspense>

      {/* エントリー管理モーダル */}
      {showEntryModal && selectedCompetition && (
        <TeamCompetitionEntryModal
          isOpen={showEntryModal}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCompetition(null);
            // モーダルを閉じた後、リストを再読み込み（ステータス変更が反映されるように）
            loadTeamCompetitions();
          }}
          competitionId={selectedCompetition.id}
          competitionTitle={
            selectedCompetition.title || t("competitions.fallbackTitle")
          }
          teamId={teamId}
        />
      )}

      {/* 記録一覧モーダル（管理者のみ） */}
      {isAdmin && showRecordsModal && selectedCompetitionForRecords && (
        <TeamCompetitionRecordsModal
          isOpen={showRecordsModal}
          onClose={() => {
            setShowRecordsModal(false);
            setSelectedCompetitionForRecords(null);
          }}
          competitionId={selectedCompetitionForRecords.id}
          competitionTitle={
            selectedCompetitionForRecords.title ||
            t("competitions.fallbackTitle")
          }
        />
      )}

      {/* 自分の記録を追加(記録登録フォーム) */}
      {showSelfRecordForm && selfRecordCompetition && (
        <RecordLogForm
          isOpen={showSelfRecordForm}
          onClose={handleCloseSelfRecordForm}
          onSubmit={handleSelfRecordSubmit}
          competitionId={selfRecordCompetition.id}
          competitionTitle={
            selfRecordCompetition.title || t("competitions.fallbackTitle")
          }
          competitionDate={selfRecordCompetition.date}
          poolType={selfRecordCompetition.pool_type}
          isLoading={selfRecordLoading}
          styles={selfRecordStyles}
          entryDataList={selfRecordEntryDataList}
          initialRecords={selfRecordInitialRecords}
        />
      )}

      {/* 削除確認モーダル（管理者のみ） */}
      <DeleteConfirmModal
        isOpen={!!pendingDeleteId}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  );
}
