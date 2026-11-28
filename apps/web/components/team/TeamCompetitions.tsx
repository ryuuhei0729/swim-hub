"use client";

// =============================================================================
// 予定タブの「大会」側: カードと、カードの操作 (編集・削除・エントリー・記録・
// 自分の記録追加・記録一覧) とそのモーダル群。一覧の取得と並べ方は TeamSchedule.tsx が
// 持つ (練習と大会を 1 本に混ぜるため。mobile の TeamCompetitionList の CompetitionItem /
// useTeamCompetitionActions と同じ分け方)。
// =============================================================================

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  Suspense,
} from "react";
import { useRouter } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthProvider";
import { useLocale, useTranslations } from "next-intl";
import {
  PlusIcon,
  CalendarDaysIcon,
  MapPinIcon,
  TrophyIcon,
  PencilSquareIcon,
  ClipboardDocumentListIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { isValid } from "date-fns";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { isEntryTabVisible } from "@/utils/tabModalUtils";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import type { CompetitionImageData } from "@/components/forms/CompetitionBasicForm";
import type { ExistingImage } from "@/components/forms/PracticeImageUploader";
import { resolveGalleryImages } from "@/lib/image-url";
import { hasParentImageChanges, saveParentImages } from "@/utils/parentImageSave";
import TeamCompetitionEntryModal from "./TeamCompetitionEntryModal";
import TeamCompetitionRecordsModal from "./TeamCompetitionRecordsModal";
import DeleteConfirmModal from "@/components/ui/DeleteConfirmModal";
import { TeamRecordsAPI } from "@apps/shared/api/teams/records";
import { useInvalidateTeamRankings } from "@apps/shared/hooks/queries/useInvalidateTeamRankings";
import { StyleAPI } from "@apps/shared/api/styles";
import { RecordAPI } from "@apps/shared/api/records";
import { EntryAPI } from "@apps/shared/api/entries";
import RecordLogForm from "@/components/forms/record-log/RecordLogForm";
import CompetitionTabModal from "@/components/forms/CompetitionTabModal";
import { useCompetitionTabSave } from "@/hooks/useCompetitionTabSave";
import type {
  RecordLogEditData,
  RecordLogFormData,
  StyleOption,
} from "@/components/forms/record-log/types";
import type { EntryInfo } from "@apps/shared/types/ui";
import type { RecordInsert, RecordUpdate, Style } from "@apps/shared/types";
import type { EditingData } from "@/stores/types";
import { useQueryClient } from "@tanstack/react-query";
import type { TeamCompetition } from "@/hooks/queries/teamCompetitionQueries";
import {
  invalidateTeamCompetitionQueries,
  invalidateTeamMemberBestTimes,
  teamDetailKeys,
} from "@/hooks/queries/teamDetailKeys";

const CompetitionBasicForm = dynamic(
  () => import("@/components/forms/CompetitionBasicForm"),
  {
    ssr: false,
  },
);

export type { TeamCompetition } from "@/hooks/queries/teamCompetitionQueries";

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

export interface TeamCompetitionActionsOptions {
  teamId: string;
  isAdmin?: boolean;
}

export interface TeamCompetitionActions {
  /** 大会 1 件分のカード */
  renderCard: (competition: TeamCompetition) => React.ReactNode;
  /** 作成・編集フォーム・エントリー・記録一覧・自分の記録・削除確認のモーダル (一覧の外に 1 回だけ置く) */
  modals: React.ReactNode;
  /** 管理者ビュー: 大会を追加 */
  openAddForm: () => void;
  /** 保存・削除の失敗 (一覧の代わりに表示する) */
  error: string | null;
  clearError: () => void;
}

export function useTeamCompetitionActions({
  teamId,
  isAdmin = false,
}: TeamCompetitionActionsOptions): TeamCompetitionActions {
  const { supabase, user } = useAuth();
  const invalidateRankings = useInvalidateTeamRankings();
  const router = useRouter();
  const t = useTranslations("teams");
  const locale = useLocale() as SupportedLocale;
  const queryClient = useQueryClient();
  // 保存・削除の失敗など、一覧の取得以外で出すエラー (以前と同じく一覧の代わりに表示する)
  const [error, setError] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] =
    useState<TeamCompetition | null>(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showRecordsModal, setShowRecordsModal] = useState(false);
  const [selectedCompetitionForRecords, setSelectedCompetitionForRecords] =
    useState<TeamCompetition | null>(null);
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
  // エントリー編集/追加 (D2/D6, R6) 用の種目一覧。selfRecordStyles と同じ設計方針
  // (モーダルを開くタイミングで遅延取得。TeamCompetitionEntryModal を開くたびではなく
  // CompetitionTabModal を開く直前にのみ取得する)
  const [entryEditorStyles, setEntryEditorStyles] = useState<Style[]>([]);
  // TeamCompetitionEntryModal 強制再マウント用 (CompetitionTabModal.tsx の modalNonce と同型)。
  // CompetitionTabModal はエントリー編集完了後に自身を閉じるだけで、下に残った
  // TeamCompetitionEntryModal の一覧は自動更新されない (isOpen は変わらないため isOpen effect が
  // 再発火しない)。key を変えて強制的に再マウントし、保存直後に最新のエントリー一覧を再取得させる。
  const [entryModalNonce, setEntryModalNonce] = useState(0);
  // 編集アイコンから開いたときに項目タブをアクティブにする対象 entry.id (D9)。
  // 「エントリーを追加」ボタンから開く場合は undefined のまま (先頭タブにフォールバック)。
  const [entryEditorTargetEntryId, setEntryEditorTargetEntryId] = useState<string | undefined>(
    undefined,
  );

  const {
    isBasicFormOpen,
    selectedDate,
    editingData,
    isLoading: formLoading,
    openBasicForm,
    closeBasicForm,
    setLoading: setFormLoading,
    setEditingData,
    // タブモーダル (エントリー編集/追加。D2/D6, R6): CompetitionBasicForm と
    // isOpen/isBasicFormOpen が排他制御されることを除き selectedDate/editingData/isLoading の
    // 状態スロットは共有する (store 自身の設計。openTabModal が isBasicFormOpen を false にする)
    isOpen: isEntryTabModalOpen,
    editingCompetitionId: entryTabEditingCompetitionId,
    openTabModal,
    closeTabModal,
    setEditingCompetitionId: setEntryTabEditingCompetitionId,
    setCreatedEntries: setEntryTabCreatedEntries,
  } = useCompetitionStore();

  // 大会一覧 (今日以降・過去)・出欠の月別サマリ・(指定時は) その大会のモーダルを最新化する。
  // 保存・削除の直後に呼び、保存前の内容が残らないよう再取得の完了まで待つ。
  // 表示していない一覧・閉じているモーダルのキャッシュは捨てるので、保存後に
  // 過去を開き直したりモーダルを開き直したりしても保存前の内容は出ない
  // (refreshQueriesAfterWrite の docstring 参照)
  const loadTeamCompetitions = useCallback(
    async (competitionId?: string) => {
      await invalidateTeamCompetitionQueries(queryClient, teamId, competitionId);
    },
    [queryClient, teamId],
  );

  const handleAddCompetition = () => {
    openBasicForm(new Date());
  };

  // 編集フォームに既存の画像を出すための取得。開き直したときに前の取得結果を反映しないよう番号で区別する
  const editImageRequestIdRef = useRef(0);

  // 管理者向け: 既存の大会を編集(CompetitionBasicForm を editData 付きで開く)
  const handleEditCompetition = (
    e: React.MouseEvent,
    competition: TeamCompetition,
  ) => {
    e.stopPropagation();
    const baseEditData = {
      id: competition.id,
      type: "competition",
      date: competition.date,
      end_date: competition.end_date || "",
      title: competition.title,
      place: competition.place || "",
      pool_type: competition.pool_type,
      note: competition.note || "",
    };
    openBasicForm(new Date(competition.date), baseEditData as EditingData);

    // 既存の画像は署名付き URL の解決を待たずにフォームを開き、解決後に editingData へ足す
    // (ダッシュボードの編集と同じ。swimhub-tasks#58)
    const requestId = ++editImageRequestIdRef.current;
    void (async () => {
      try {
        const { data, error: imagePathsError } = await supabase
          .from("competitions")
          .select("image_paths")
          .eq("id", competition.id)
          .single();
        if (imagePathsError) throw imagePathsError;
        const paths = (data as { image_paths: string[] | null } | null)?.image_paths ?? [];
        if (paths.length === 0) return;
        const images = await resolveGalleryImages("competition-images", paths);
        const state = useCompetitionStore.getState();
        if (
          editImageRequestIdRef.current !== requestId ||
          !state.isBasicFormOpen ||
          state.editingData?.id !== competition.id ||
          images.length === 0
        ) {
          return;
        }
        setEditingData({ ...baseEditData, images } as EditingData);
      } catch (err) {
        console.error("大会の画像の取得に失敗:", err);
      }
    })();
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
    imageData?: CompetitionImageData,
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

      let competitionId = editingData?.id;
      if (competitionId) {
        await api.update(competitionId, {
          date: basicData.date,
          end_date: basicData.endDate || null,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null,
        });
      } else {
        const created = await api.create({
          user_id: user.id,
          team_id: teamId,
          date: basicData.date,
          end_date: basicData.endDate || null,
          title: basicData.title || null,
          place: basicData.place || null,
          pool_type: basicData.poolType,
          note: basicData.note || null,
        });
        competitionId = created.id;
      }

      // 画像 (追加・削除)。大会本体は保存済みなので、失敗しても一覧は更新して理由を出す
      let imageSaveFailed = false;
      if (competitionId && imageData && hasParentImageChanges(imageData)) {
        try {
          await saveParentImages(supabase, "competition", competitionId, imageData);
        } catch (imageErr) {
          console.error("大会の画像の保存に失敗:", imageErr);
          imageSaveFailed = true;
        }
      }

      closeBasicForm();
      if (editingData?.id) {
        // 大会日の変更で紐づく記録が別年度のランキングへ移るため、更新は対象
        // (作成は記録が紐づいていないので対象外。判断軸は invalidateTeamRankings の docstring)
        invalidateRankings();
      }
      await loadTeamCompetitions(competitionId);
      if (imageSaveFailed) setError(t("competitionForm.imageSaveFailed"));
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
      // 大会を消すと records_competition_id_fkey (ON DELETE SET NULL) で
      // records.competition_id が NULL 化され、ランキングの内容が変わる
      // (teamCompetitions からはその大会の全行が消える)。この画面は React Query を
      // 使わず自前で再読み込みするため、ランキング側は明示的に落とす。
      // (Provider が無い環境では no-op。理由は useInvalidateTeamRankings の docstring)
      invalidateRankings();
      // 紐づく記録の大会名が消えるのでベストタイム表 (大会名を表示する) も落とす
      void invalidateTeamMemberBestTimes(queryClient, teamId);
      setPendingDeleteId(null);
      await loadTeamCompetitions(pendingDeleteId);
    } catch (err) {
      console.error("大会の削除に失敗:", err);
      setError(t("competitionForm.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  // 記録入力ページへ遷移
  const handleRecordClick = (e: React.MouseEvent, competitionId: string) => {
    e.stopPropagation(); // 親要素のクリックイベントを停止
    router.push(`/teams/${teamId}/competitions/${competitionId}/records`);
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

  // 利用者ビュー向け: 自分の記録を追加(RecordLogForm を competitionId 付きで開く)。
  // 管理者ビューには出さない (mobile と同じく代理入力ボタンだけ。swimhub-tasks #112)
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
    // この導線は一般メンバーが操作するため、records テーブルを
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

  // 自分のエントリーを追加/編集する画面 (CompetitionTabModal のエントリータブ) を開く
  // (要件A/B後半 / D2・D6, R6)。TeamCompetitionEntryModal の編集アイコン・
  // 「エントリーを追加」ボタン (D10改訂) の両方から呼ばれる。TeamCompetitionEntryModal は開いたまま
  // 残し、CompetitionTabModal をその上に重ねて表示する
  // (CompetitionClient.tsx の CompetitionDetailModal + CompetitionTabModal と同じ既存パターン)。
  // targetEntryId (D9): 編集アイコンから呼ばれた場合はその entry.id を渡し、
  // CompetitionTabModal のエントリー項目タブをその entry.id に対応するタブでアクティブにする。
  // 「エントリーを追加」ボタンからは引数なしで呼ばれ、先頭タブにフォールバックする。
  const handleOpenEntryEditor = useCallback((targetEntryId?: string) => {
    if (!selectedCompetition) return;
    setEntryEditorTargetEntryId(targetEntryId);
    const parsedDate = new Date(`${selectedCompetition.date}T00:00:00`);
    openTabModal(
      isValid(parsedDate) ? parsedDate : new Date(),
      {
        id: selectedCompetition.id,
        type: "competition",
        date: selectedCompetition.date,
        title: selectedCompetition.title,
        place: selectedCompetition.place || "",
        pool_type: selectedCompetition.pool_type,
      } as EditingData,
      "entry",
    );
    // 種目一覧を非同期取得(モーダルは即座に開く。selfRecordStyles と同じ degrade 方針)
    (async () => {
      try {
        const styleAPI = new StyleAPI(supabase);
        setEntryEditorStyles(await styleAPI.getStyles());
      } catch (err) {
        console.error("種目一覧の取得に失敗:", err);
      }
    })();
  }, [selectedCompetition, openTabModal, supabase]);

  // エントリータブ保存 (CompetitionTabModal 共通フック)。
  // allowParentUpdate: false — この画面から開くのは常に「自分のエントリーの追加/編集」のみで、
  // 大会本体 (basicData) の編集は行わせない (大会本体の編集は既存の handleEditCompetition /
  // CompetitionBasicForm 経路が別に存在する)。editingCompetitionId は常に既存のチーム大会の ID が
  // 入っているため、createCompetition / updateCompetition は実際には呼ばれない
  // (createCompetition は !competitionId の新規作成時のみ、updateCompetition は
  // allowParentUpdate === true のときのみ呼ばれる)。呼ばれない前提でも型を満たす必要があるため、
  // 他の画面 (handleCompetitionBasicSubmit / handleSelfRecordSubmit) と同じ API クラスで実装する。
  const handleEntryTabSave = useCompetitionTabSave({
    supabase,
    user,
    styles: entryEditorStyles,
    createCompetition: async (competition) => {
      if (!user) throw new Error(t("competitionForm.authRequired"));
      const api = new TeamRecordsAPI(supabase);
      return api.create({ ...competition, user_id: user.id, team_id: teamId });
    },
    updateCompetition: async (id, updates) => {
      const api = new TeamRecordsAPI(supabase);
      return api.update(id, updates);
    },
    createRecord: async (record) => {
      const recordAPI = new RecordAPI(supabase);
      return recordAPI.createRecord(record);
    },
    updateRecord: async (id, updates) => {
      const recordAPI = new RecordAPI(supabase);
      return recordAPI.updateRecord(id, updates);
    },
    deleteRecord: async (id) => {
      const recordAPI = new RecordAPI(supabase);
      await recordAPI.deleteRecord(id);
    },
    deleteEntry: async (id) => {
      const entryAPI = new EntryAPI(supabase);
      await entryAPI.deleteEntry(id);
    },
    createSplitTimes: async ({ recordId, splitTimes }) => {
      const recordAPI = new RecordAPI(supabase);
      // split_time は useCompetitionTabSave.ts 側で number 必須に締めてあり、
      // ここに undefined が来ることは無い (実測: 唯一の呼び出し元が
      // formData.splitTimes[].splitTime を常に設定する)。0 秒スプリットとして
      // 静かに書き込む `?? 0` フォールバックは業務的意味と衝突するため使わない
      return recordAPI.createSplitTimes(
        splitTimes.map((st) => ({
          record_id: recordId,
          distance: st.distance,
          split_time: st.split_time,
        })),
      );
    },
    replaceSplitTimes: async ({ recordId, splitTimes }) => {
      const recordAPI = new RecordAPI(supabase);
      return recordAPI.replaceSplitTimes(recordId, splitTimes);
    },
    setCompetitionLoading: setFormLoading,
    setEditingCompetitionId: setEntryTabEditingCompetitionId,
    setCreatedEntries: setEntryTabCreatedEntries,
    closeCompetitionTabModal: closeTabModal,
    onSaved: () => {
      // CompetitionTabModal は保存成功時に自身を閉じるだけで、下に残っている
      // TeamCompetitionEntryModal の一覧・カード一覧は自動更新されない。
      // entryModalNonce を bump して TeamCompetitionEntryModal を強制再マウントし、
      // カード一覧も合わせて再読み込みする (SC1)。
      // 再マウント時に保存前のエントリー一覧がキャッシュから一瞬表示されないよう、
      // そのモーダルのキャッシュは捨ててから再マウントする (以前と同じ 読み込み表示 → 最新)。
      if (selectedCompetition) {
        queryClient.removeQueries({
          queryKey: teamDetailKeys.competitionEntriesAll(teamId, selectedCompetition.id),
        });
      }
      setEntryModalNonce((n) => n + 1);
      void loadTeamCompetitions();
    },
    allowParentUpdate: false,
  });

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
      // 記録が増減・変化したので、ランキング・ベストタイム表・この大会の記録一覧も落とす
      invalidateRankings();
      void invalidateTeamMemberBestTimes(queryClient, teamId);
      await loadTeamCompetitions(selfRecordCompetition.id);
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

  const renderCard = (competition: TeamCompetition): React.ReactNode => {
    const competitionTitle =
      competition.title || t("competitions.fallbackTitle");
    // 水路 (mobile の TeamCompetitionList と同じ表記)。pool_type: 0 = 短水路(25m) / 1 = 長水路(50m)
    const poolTypeParen = competition.pool_type === 1 ? "(50m)" : "(25m)";
    const poolTypeLabel =
      competition.pool_type === 1
        ? t("competitionRecordsModal.poolTypeLong")
        : t("competitionRecordsModal.poolTypeShort");
    // 明日以降の大会は「エントリー」、今日・過去の大会は「記録」だけを出す
    // (mobile と同じ出し分け。管理者も同じ。swimhub-tasks #60)
    const isEntryPhase = isEntryTabVisible(competition.date);
    return (
      // 記録の有無に関わらず、カードを押したら記録一覧を開く (0件なら一覧側で空表示。
      // mobile と同じ。swimhub-tasks #103)
      <div
        key={competition.id}
        onClick={() => handleOpenRecords(competition)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenRecords(competition);
          }
        }}
        aria-label={t("competitions.card.viewRecordsAriaLabel", {
          title: competitionTitle,
        })}
        tabIndex={0}
        role="button"
        className="w-full text-left border border-gray-200 rounded-lg p-4 transition-colors duration-200 cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <TrophyIcon className="h-5 w-5 text-blue-500" />
              <span className="text-lg font-medium text-gray-900">
                {competitionTitle}
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
                    ? formatDate(competitionDate, "longWithWeekday", locale)
                    : "-";
                })()}
              </span>
            </div>

            {/* 場所と水路。場所が無いときは水路だけを出す (mobile と同じ。swimhub-tasks #104) */}
            <div className="flex items-center space-x-2 mb-1">
              <MapPinIcon className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                {competition.place || poolTypeLabel} {poolTypeParen}
              </span>
            </div>

            {competition.note && (
              <p className="text-sm text-gray-600 mb-2 mt-2">
                {competition.note}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {/* アクションボタン */}
            <div className="flex gap-2 flex-wrap justify-end">
              {isEntryPhase ? (
                // エントリー管理モーダルを開く (管理者の代理エントリーはモーダル内の
                // 「エントリーを代理入力」ボタンから。受付中のときだけ出る)
                <button
                  onClick={(e) => handleEntryClick(e, competition)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <ClipboardDocumentListIcon className="h-4 w-4 mr-1" />
                  {t("competitions.card.entryButton")}
                </button>
              ) : isAdmin ? (
                // 管理者ビュー: 記録の代理入力ページへ
                <button
                  onClick={(e) =>
                    handleRecordClick(e, competition.id)
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  <PencilSquareIcon className="h-4 w-4 mr-1" />
                  {t("competitions.card.recordsButton")}
                </button>
              ) : (
                // 利用者ビュー: 自分の記録を追加
                <button
                  onClick={(e) => handleOpenSelfRecord(e, competition)}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  <PlusIcon className="h-4 w-4 mr-1" />
                  {t("competitions.selfRecordButton")}
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
  };

  const modals = (
    <>
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
                  images: (editingData as { images?: ExistingImage[] }).images,
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
          key={`${selectedCompetition.id}-${entryModalNonce}`}
          isOpen={showEntryModal}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCompetition(null);
            // モーダルを閉じた後、リストを再読み込み（ステータス変更が反映されるように）
            void loadTeamCompetitions();
          }}
          competitionId={selectedCompetition.id}
          competitionTitle={
            selectedCompetition.title || t("competitions.fallbackTitle")
          }
          teamId={teamId}
          // 追加スプリント D11: 自身のルート固定 isAdmin prop をそのまま渡す。
          // モーダル内部の data.isAdmin (実ロール) とは別物 (往路の判定用)
          routeIsAdmin={isAdmin}
          onOpenSelfEntry={handleOpenEntryEditor}
        />
      )}

      {/* エントリー編集/追加タブモーダル (要件A/B後半 / D2・D6, R6)。
          TeamCompetitionEntryModal の上に重ねて開く (CompetitionClient.tsx と同じ既存パターン) */}
      <CompetitionTabModal
        isOpen={isEntryTabModalOpen}
        onClose={closeTabModal}
        onSave={handleEntryTabSave}
        selectedDate={selectedDate || new Date()}
        editingData={editingData}
        editingCompetitionId={entryTabEditingCompetitionId}
        styles={entryEditorStyles.map((s) => ({
          id: s.id.toString(),
          nameJp: s.name_jp,
          distance: s.distance,
        }))}
        isLoading={formLoading}
        initialTab="entry"
        initialEntryId={entryEditorTargetEntryId}
        allowParentUpdate={false}
      />

      {/* 記録一覧モーダル */}
      {showRecordsModal && selectedCompetitionForRecords && (
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
          isAdmin={isAdmin}
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

  return {
    renderCard,
    modals,
    openAddForm: handleAddCompetition,
    error,
    clearError: () => setError(null),
  };
}
