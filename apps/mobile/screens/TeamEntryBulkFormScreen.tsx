import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRoute, useNavigation, usePreventRemove, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { StyleAPI } from "@apps/shared/api/styles";
import { EntryAPI } from "@apps/shared/api/entries";
import { RecordAPI } from "@apps/shared/api/records";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import {
  diffEntryRows,
  findDuplicateMemberStylePairs,
  isPrefillUntouched,
  partitionConflictingDeletes,
} from "@apps/shared/utils/entryDiff";
import type { ExistingEntryRow } from "@apps/shared/utils/entryDiff";
import { parseTimeFlexible, formatTimeBest } from "@apps/shared/utils/time";
import { localizedStyleName } from "@/utils/styleName";
import { hasUnsavedChanges } from "@/utils/tabFormUtils";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import { MemberSelectModal } from "@/components/teams/MemberSelectModal";
import type { MainStackParamList } from "@/navigation/types";
import type { Style, PoolType, BestTime } from "@apps/shared/types";
import type { EntryDraftRow } from "@apps/shared/types/team-entry";

type RouteProps = RouteProp<MainStackParamList, "TeamEntryBulkForm">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

/** RN には crypto.randomUUID がないため簡易 ID 生成（クライアント内のみで使用） */
let idCounter = 0;
function genLocalId(): string {
  idCounter += 1;
  return `eb-${Date.now().toString(36)}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function createEmptyRow(targetUserId: string, targetUserName: string): EntryDraftRow {
  return {
    localId: genLocalId(),
    existingEntryId: null,
    targetUserId,
    targetUserName,
    styleId: "",
    entryTimeInput: "",
    note: "",
    prefillSource: null,
    prefilledInput: null,
  };
}

interface CompetitionInfo {
  id: string;
  title: string | null;
  pool_type: PoolType;
  date: string;
  entry_status: "before" | "open" | "closed";
}

/**
 * チーム大会エントリーの一括代理入力画面（管理者専用）
 * - 個人種目のみ（リレー・split_times・動画添付はスコープ外の縮小版）
 * - 選手ごとに複数種目のエントリータイムを代理入力
 * - 種目選択時にベストタイムを自動プリフィル + 「流用」ボタン併設
 * - 保存前に新規/更新/削除/変更なしの差分確認モーダルを表示（apps/shared/utils/entryDiff を使用）
 */
export const TeamEntryBulkFormScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { competitionId, teamId } = route.params;
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // メンバー一覧（権限判定・選手選択に使用。is_active=true のみ）
  const { members, isLoading: membersLoading } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  const [swimStyles, setSwimStyles] = useState<Style[]>([]);
  const [competition, setCompetition] = useState<CompetitionInfo | null>(null);
  const [existingEntryRows, setExistingEntryRows] = useState<ExistingEntryRow[]>([]);
  const [retiredMemberNames, setRetiredMemberNames] = useState<Map<string, string>>(new Map());
  const [bestTimesByUserId, setBestTimesByUserId] = useState<Map<string, BestTime[]>>(new Map());
  const [draftRows, setDraftRows] = useState<EntryDraftRow[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [stylePickerRowId, setStylePickerRowId] = useState<string | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const snapshotRef = useRef<string | null>(null);
  const isSubmittingRef = useRef(false);

  // メンバー名（脱退済みメンバーを含む。既存エントリー行の表示用）
  const memberNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => map.set(m.user_id, m.users?.name || t("teams.mobile.unnamedMember")));
    retiredMemberNames.forEach((name, userId) => {
      if (!map.has(userId)) map.set(userId, name);
    });
    return map;
  }, [members, retiredMemberNames, t]);

  const styleById = useMemo(() => {
    const map = new Map<number, Style>();
    swimStyles.forEach((s) => map.set(s.id, s));
    return map;
  }, [swimStyles]);

  const styleNameById = (styleId: number): string => {
    const style = styleById.get(styleId);
    return style ? localizedStyleName(style, t) : "";
  };

  // 大会・種目・既存エントリー・ベストタイムをロード
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const styleApi = new StyleAPI(supabase);
        const [stylesData, competitionRes, entriesRes] = await Promise.all([
          styleApi.getStyles(),
          supabase
            .from("competitions")
            .select("id, title, pool_type, date, entry_status")
            .eq("id", competitionId)
            .eq("team_id", teamId)
            .single(),
          supabase
            .from("entries")
            .select(
              `id, user_id, style_id, entry_time, note,
               users:users!entries_user_id_fkey ( id, name )`,
            )
            .eq("competition_id", competitionId)
            .eq("team_id", teamId)
            .order("created_at", { ascending: true }),
        ]);

        if (!isMounted) return;

        if (competitionRes.error || !competitionRes.data) {
          throw competitionRes.error || new Error(t("recordMobile.competitionFetchFailed"));
        }
        if (entriesRes.error) {
          throw entriesRes.error;
        }

        const comp = competitionRes.data as unknown as CompetitionInfo;
        const rawEntries = (entriesRes.data || []) as unknown as Array<{
          id: string;
          user_id: string;
          style_id: number;
          entry_time: number | null;
          note: string | null;
          users?: { id: string; name: string | null } | null;
        }>;

        const existingRows: ExistingEntryRow[] = rawEntries.map((e) => ({
          id: e.id,
          user_id: e.user_id,
          style_id: e.style_id,
          entry_time: e.entry_time,
          note: e.note,
        }));

        const nameMap = new Map<string, string>();
        rawEntries.forEach((e) => {
          if (e.users?.name) nameMap.set(e.user_id, e.users.name);
        });

        const initialDraftRows: EntryDraftRow[] = rawEntries.map((e) => ({
          localId: genLocalId(),
          existingEntryId: e.id,
          targetUserId: e.user_id,
          targetUserName: e.users?.name || t("teams.mobile.unnamedMember"),
          styleId: e.style_id,
          entryTimeInput: e.entry_time != null ? formatTimeBest(e.entry_time) : "",
          note: e.note || "",
          prefillSource: null,
          prefilledInput: null,
        }));

        setSwimStyles(stylesData);
        setCompetition({
          id: comp.id,
          title: comp.title,
          pool_type: comp.pool_type,
          date: comp.date,
          entry_status: comp.entry_status ?? "before",
        });
        setExistingEntryRows(existingRows);
        setRetiredMemberNames(nameMap);
        setDraftRows(initialDraftRows);
        snapshotRef.current = JSON.stringify(initialDraftRows);
      } catch (err) {
        if (!isMounted) return;
        console.error("チームエントリーロードエラー:", err);
        setLoadError(err instanceof Error ? err.message : t("recordMobile.saveFailed"));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [supabase, competitionId, teamId, t]);

  // ベストタイムを全メンバー分まとめて1回だけ取得（N+1回避）
  useEffect(() => {
    if (!competition || members.length === 0) return;
    let isMounted = true;

    const loadBestTimes = async () => {
      try {
        const recordApi = new RecordAPI(supabase);
        const userIds = members.map((m) => m.user_id);
        const map = await recordApi.getBestTimesForUsers(userIds, competition.pool_type);
        if (isMounted) setBestTimesByUserId(map);
      } catch (err) {
        // ベストタイム取得失敗はプリフィル機能のみ無効化し、画面は続行する
        console.error("ベストタイム取得エラー:", err);
      }
    };

    loadBestTimes();
    return () => {
      isMounted = false;
    };
  }, [supabase, members, competition]);

  const isPastDate = useMemo(
    () => isCompetitionDateInPast(competition?.date),
    [competition?.date],
  );

  // 保存対象（種目未選択の行は除外）
  const validDraftRows = useMemo(
    () => draftRows.filter((r): r is EntryDraftRow & { styleId: number } => r.styleId !== ""),
    [draftRows],
  );

  const duplicatePairs = useMemo(
    () => findDuplicateMemberStylePairs(validDraftRows),
    [validDraftRows],
  );

  const diffResult = useMemo(
    () => diffEntryRows(existingEntryRows, validDraftRows, competitionId, teamId),
    [existingEntryRows, validDraftRows, competitionId, teamId],
  );

  // W-3: toDelete のうち toCreate/toUpdate の自然キー(user_id, style_id)と衝突する行。
  // 衝突削除を upsert/update より先に実行するとデータ損失リスクがあるため(web側でCritical判定済み)、
  // mobile は「削除より前に検出して保存自体を中止する」事前バリデーション方式を取る
  // (書き込み順序は create→update→delete のまま変更しない)。
  const conflictingDeleteRows = useMemo(() => {
    const { conflicting } = partitionConflictingDeletes(diffResult, existingEntryRows, validDraftRows);
    return conflicting
      .map((id) => existingEntryRows.find((e) => e.id === id))
      .filter((e): e is ExistingEntryRow => !!e);
  }, [diffResult, existingEntryRows, validDraftRows]);

  const showConflictingDeleteAlert = () => {
    const list = conflictingDeleteRows
      .map((e) => `・${memberNameByUserId.get(e.user_id) ?? ""} ${styleNameById(e.style_id)}`)
      .join("\n");
    Alert.alert(
      t("teams.mobile.entryBulk.conflictingDeleteTitle"),
      t("teams.mobile.entryBulk.conflictingDeleteMessage", { list }),
    );
  };

  // 選手ごとにグループ化（表示順は初出順を維持）
  const memberOrder = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    draftRows.forEach((r) => {
      if (!seen.has(r.targetUserId)) {
        seen.add(r.targetUserId);
        order.push(r.targetUserId);
      }
    });
    return order;
  }, [draftRows]);

  const rowsByMember = useMemo(() => {
    const map = new Map<string, EntryDraftRow[]>();
    draftRows.forEach((r) => {
      const list = map.get(r.targetUserId) ?? [];
      list.push(r);
      map.set(r.targetUserId, list);
    });
    return map;
  }, [draftRows]);

  const isMemberActive = (userId: string) => members.some((m) => m.user_id === userId);

  const changedFromSnapshot = useMemo(() => {
    if (snapshotRef.current === null) return false;
    return hasUnsavedChanges(draftRows, JSON.parse(snapshotRef.current) as EntryDraftRow[]);
  }, [draftRows]);

  usePreventRemove(!isSaved && changedFromSnapshot, ({ data }) => {
    Alert.alert(t("common.discardTitle"), t("common.discardMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.discard"),
        style: "destructive",
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // 保存完了 → 前画面へ戻る（isSaved の再レンダー commit 後に goBack することで
  // usePreventRemove の preventRemove=false が確定した状態で REMOVE を発行する）
  useEffect(() => {
    if (isSaved) {
      navigation.goBack();
    }
  }, [isSaved, navigation]);

  const getBestTimeForRow = (targetUserId: string, styleId: number | ""): BestTime | undefined => {
    if (styleId === "") return undefined;
    return bestTimesByUserId.get(targetUserId)?.find((bt) => bt.style_id === styleId);
  };

  // ---- メンバー選択 ----
  const confirmMemberSelection = (selectedUserIds: string[]) => {
    setDraftRows((prev) => {
      // 選択解除されたメンバーでも、既存エントリー行(existingEntryId あり)は残す
      // (削除は行単位の明示的な削除ボタンでのみ行う)
      const kept = prev.filter(
        (r) => selectedUserIds.includes(r.targetUserId) || r.existingEntryId !== null,
      );
      const usersWithRows = new Set(kept.map((r) => r.targetUserId));
      const newRows = selectedUserIds
        .filter((uid) => !usersWithRows.has(uid))
        .map((uid) => createEmptyRow(uid, memberNameByUserId.get(uid) ?? ""));
      return [...kept, ...newRows];
    });
    setIsMemberModalOpen(false);
  };

  // ---- 行操作 ----
  const addRowForMember = (targetUserId: string) => {
    setDraftRows((prev) => [
      ...prev,
      createEmptyRow(targetUserId, memberNameByUserId.get(targetUserId) ?? ""),
    ]);
  };

  const removeRow = (localId: string) => {
    setDraftRows((prev) => prev.filter((r) => r.localId !== localId));
    setErrors((prev) => {
      if (!(localId in prev)) return prev;
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  };

  const updateRowStyle = (localId: string, styleId: number) => {
    setDraftRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        // 未入力のときのみ、選択した種目のベストタイムを自動プリフィルする
        if (r.entryTimeInput.trim() === "") {
          const bestTime = getBestTimeForRow(r.targetUserId, styleId);
          if (bestTime) {
            const formatted = formatTimeBest(bestTime.time);
            return {
              ...r,
              styleId,
              entryTimeInput: formatted,
              prefillSource: "bestTime",
              prefilledInput: formatted,
            };
          }
        }
        return { ...r, styleId };
      }),
    );
  };

  // 種目の「選択を解除」（web の <option value=""> 相当）。
  // 既存行(existingEntryId あり)の場合、diffEntryRows は styleId==="" の行を
  // matchedExistingIds に加算しないため、この操作は削除意図として扱われる。
  const clearRowStyle = (localId: string) => {
    setDraftRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, styleId: "" } : r)));
  };

  const applyBestTimePrefill = (localId: string) => {
    setDraftRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const bestTime = getBestTimeForRow(r.targetUserId, r.styleId);
        if (!bestTime) return r;
        const formatted = formatTimeBest(bestTime.time);
        return { ...r, entryTimeInput: formatted, prefillSource: "bestTime", prefilledInput: formatted };
      }),
    );
  };

  const updateRowTimeInput = (localId: string, text: string) => {
    setDraftRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, entryTimeInput: text } : r)));
  };

  const handleTimeBlur = (localId: string) => {
    setDraftRows((prev) =>
      prev.map((r) => {
        if (r.localId !== localId) return r;
        const raw = r.entryTimeInput.trim();
        if (raw === "") {
          setErrors((prevErrors) => {
            if (!(localId in prevErrors)) return prevErrors;
            const next = { ...prevErrors };
            delete next[localId];
            return next;
          });
          return { ...r, entryTimeInput: "" };
        }
        const parsed = parseTimeFlexible(raw);
        if (parsed === null) {
          setErrors((prevErrors) => ({ ...prevErrors, [localId]: t("teams.mobile.entryBulk.timeFormatInvalid") }));
          return r;
        }
        setErrors((prevErrors) => {
          if (!(localId in prevErrors)) return prevErrors;
          const next = { ...prevErrors };
          delete next[localId];
          return next;
        });
        return { ...r, entryTimeInput: formatTimeBest(parsed) };
      }),
    );
  };

  const updateRowNote = (localId: string, text: string) => {
    setDraftRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, note: text } : r)));
  };

  // ---- 保存 ----
  // ブロック条件は「有効な行が0件」ではなく「差分が0件」。
  // 全行削除・全行の種目を未選択に戻して「エントリーを全部取り消して保存」する
  // 意図(toDelete のみが存在するケース)をブロックしないため、validDraftRows.length ではなく
  // diffResult (toCreate/toUpdate/toDelete の合計) で判定する。
  const handleOpenConfirm = () => {
    const hasAnyChange =
      diffResult.toCreate.length > 0 || diffResult.toUpdate.length > 0 || diffResult.toDelete.length > 0;
    if (!hasAnyChange) {
      Alert.alert(t("common.error"), t("teams.mobile.entryBulk.noValidRowsAlert"));
      return;
    }
    // W-3: 衝突削除は確認モーダルを開く前に検出して中止する（DBには一切書き込んでいない時点）。
    if (conflictingDeleteRows.length > 0) {
      showConflictingDeleteAlert();
      return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSave = async () => {
    if (isSubmittingRef.current) return;

    // 保存処理の冒頭（DBに1行も書く前）の再チェック。handleOpenConfirm で弾いているため
    // 通常はここに到達しないが、書き込み境界そのものでも保証する（defense in depth）。
    if (conflictingDeleteRows.length > 0) {
      showConflictingDeleteAlert();
      setIsConfirmModalOpen(false);
      return;
    }

    isSubmittingRef.current = true;
    setSaving(true);

    try {
      const entryApi = new EntryAPI(supabase);

      // 呼び出し順序: createBulkEntries (upsert) → updateEntry → deleteBulkEntries の順で実行する。
      // 上記の事前バリデーションにより、この時点で toDelete と toCreate/toUpdate の自然キーが
      // 衝突するケースは到達しないため、UNIQUE制約違反は起きない
      // (apps/shared/api/entries.ts の deleteBulkEntries doc コメントに準拠)。
      if (diffResult.toCreate.length > 0) {
        await entryApi.createBulkEntries(
          teamId,
          diffResult.toCreate.map((e) => ({
            userId: e.user_id,
            competitionId: e.competition_id,
            styleId: e.style_id,
            entryTime: e.entry_time,
            note: e.note,
            isRelaying: e.is_relaying,
          })),
        );
      }

      for (const { id, patch } of diffResult.toUpdate) {
        await entryApi.updateEntry(id, patch);
      }

      await entryApi.deleteBulkEntries(teamId, diffResult.toDelete);

      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamId) });

      setIsConfirmModalOpen(false);
      setIsSaved(true);
    } catch (err) {
      console.error("チームエントリー一括保存エラー:", err);
      // Postgres の UNIQUE 制約違反 (23505) は、事前バリデーション (partitionConflictingDeletes)
      // で弾けなかった稀な同時編集競合などで発生しうる。web (EntriesClient.tsx) と同型の分岐で、
      // 原因が推測できるメッセージを出す。生の err.message (Postgres の内部エラー文字列)は
      // どちらの分岐でもユーザーに見せない。
      const isUniqueViolation =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: unknown }).code === "23505";
      Alert.alert(
        t("common.error"),
        isUniqueViolation ? t("teams.mobile.entryBulk.saveFailedDuplicate") : t("recordMobile.saveFailed"),
      );
    } finally {
      isSubmittingRef.current = false;
      setSaving(false);
    }
  };

  // ---- 描画 ----
  if (loading || membersLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("competition.mobile.entryLoading")} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.container}>
        <ErrorView message={loadError} fullScreen onRetry={() => navigation.goBack()} />
      </View>
    );
  }

  // 権限ゲート（RLS が二重防御）。非 admin はエラー表示して戻す。
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>{t("teams.mobile.webGuide")}</Text>
          <Pressable style={styles.permissionButton} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionButtonText}>{t("teams.record.backButton")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // 過去日ガード（web の EntriesDataLoader によるサーバー側 redirect と同等の到達性ブロック）。
  // 保存ボタンの disable だけでは、管理者がフォームを最後まで入力してから初めて
  // 保存できないことに気づくUXになってしまうため、画面を描画せずに弾く。
  if (isPastDate) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="alert-triangle" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>{t("teams.mobile.entryBulk.pastDateWarning")}</Text>
          <Pressable style={styles.permissionButton} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionButtonText}>{t("teams.record.backButton")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const canSave = !saving && duplicatePairs.size === 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 大会情報 */}
        <View style={styles.compHeader}>
          <Text style={styles.compTitle}>
            {competition?.title || t("teams.record.competitionFallback")}
          </Text>
          <Text style={styles.compSubtitle}>{t("teams.mobile.entryBulk.description")}</Text>
          <TimeInputHelp style={{ marginTop: 8 }} />
        </View>

        {competition?.entry_status === "closed" && (
          <View style={styles.warningBannerSoft}>
            <Feather name="alert-circle" size={16} color="#92400E" />
            <Text style={styles.warningBannerText}>
              {t("teams.mobile.entryBulk.closedStatusWarning")}
            </Text>
          </View>
        )}

        {/* 選手追加 */}
        <Pressable style={styles.addMemberButton} onPress={() => setIsMemberModalOpen(true)}>
          <Feather name="users" size={16} color="#2563EB" />
          <Text style={styles.addMemberButtonText}>{t("teams.mobile.entryBulk.addMemberButton")}</Text>
        </Pressable>

        {memberOrder.length === 0 && (
          <View style={styles.emptyContainer}>
            <Feather name="user-plus" size={32} color="#D1D5DB" />
            <Text style={styles.emptyText}>{t("teams.mobile.entryBulk.emptyMembersHint")}</Text>
          </View>
        )}

        {memberOrder.map((userId) => {
          const rows = rowsByMember.get(userId) ?? [];
          const memberActive = isMemberActive(userId);
          return (
            <View key={userId} style={styles.memberCard}>
              <View style={styles.memberCardHeader}>
                <Text style={styles.memberName}>{memberNameByUserId.get(userId) ?? ""}</Text>
                {!memberActive && (
                  <View style={styles.retiredBadge}>
                    <Text style={styles.retiredBadgeText}>{t("teams.mobile.retiredMemberBadge")}</Text>
                  </View>
                )}
              </View>

              {rows.map((row, rowIndex) => {
                const selectedStyle = row.styleId !== "" ? styleById.get(row.styleId) : undefined;
                const bestTime = getBestTimeForRow(row.targetUserId, row.styleId);
                const isDuplicate =
                  row.styleId !== "" && duplicatePairs.has(`${row.targetUserId}:${row.styleId}`);
                const isPrefilledUntouched = isPrefillUntouched(row);
                const rowError = errors[row.localId];

                return (
                  <View key={row.localId} style={styles.rowCard}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowIndexLabel}>
                        {t("teams.record.eventNumber", { n: rowIndex + 1 })}
                      </Text>
                      <Pressable
                        onPress={() => removeRow(row.localId)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t("common.delete")}
                      >
                        <Feather name="trash-2" size={18} color="#DC2626" />
                      </Pressable>
                    </View>

                    {/* 種目選択 */}
                    <View style={styles.field}>
                      <Text style={styles.label}>{t("teams.mobile.entryBulk.eventLabel")}</Text>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() => setStylePickerRowId(row.localId)}
                      >
                        <Text
                          style={[styles.pickerButtonText, row.styleId === "" && styles.placeholder]}
                        >
                          {selectedStyle
                            ? localizedStyleName(selectedStyle, t)
                            : t("teams.mobile.entryBulk.eventPlaceholder")}
                        </Text>
                        <Feather name="chevron-down" size={18} color="#6B7280" />
                      </Pressable>
                      {isDuplicate && (
                        <Text style={styles.errorText}>{t("teams.mobile.entryBulk.duplicateError")}</Text>
                      )}
                    </View>

                    {/* エントリータイム */}
                    <View style={styles.field}>
                      <View style={styles.timeLabelRow}>
                        <Text style={styles.label}>{t("teams.mobile.entryBulk.timeLabel")}</Text>
                        <Pressable
                          style={[styles.prefillButton, !bestTime && styles.disabledBtn]}
                          onPress={() => applyBestTimePrefill(row.localId)}
                          disabled={!bestTime}
                        >
                          <Text style={styles.prefillButtonText}>
                            {t("teams.mobile.entryBulk.prefillButton")}
                          </Text>
                        </Pressable>
                      </View>
                      <TextInput
                        style={[styles.input, rowError && styles.inputError]}
                        value={row.entryTimeInput}
                        onChangeText={(text) => updateRowTimeInput(row.localId, text)}
                        onBlur={() => handleTimeBlur(row.localId)}
                        placeholder={t("teams.mobile.entryBulk.timePlaceholder")}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="decimal-pad"
                      />
                      {rowError && <Text style={styles.errorText}>{rowError}</Text>}
                      {isPrefilledUntouched && !rowError && (
                        <Text style={styles.prefillWarningText}>
                          {t("teams.mobile.entryBulk.prefillUntouchedWarning")}
                        </Text>
                      )}
                    </View>

                    {/* メモ */}
                    <View style={styles.field}>
                      <Text style={styles.label}>{t("teams.mobile.entryBulk.memoLabel")}</Text>
                      <TextInput
                        style={styles.input}
                        value={row.note}
                        onChangeText={(text) => updateRowNote(row.localId, text)}
                        placeholder={t("teams.mobile.entryBulk.memoPlaceholder")}
                        placeholderTextColor="#9CA3AF"
                      />
                    </View>
                  </View>
                );
              })}

              {memberActive && (
                <Pressable style={styles.addEventButton} onPress={() => addRowForMember(userId)}>
                  <Feather name="plus" size={14} color="#2563EB" />
                  <Text style={styles.addEventText}>{t("teams.mobile.entryBulk.addEventButton")}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* フッター */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable style={styles.cancelFooterBtn} onPress={() => navigation.goBack()} disabled={saving}>
          <Text style={styles.cancelFooterText}>{t("common.cancel")}</Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, !canSave && styles.disabledBtn]}
          onPress={handleOpenConfirm}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{t("teams.mobile.entryBulk.saveButton")}</Text>
          )}
        </Pressable>
      </SafeAreaView>

      {/* メンバー選択モーダル */}
      <MemberSelectModal
        visible={isMemberModalOpen}
        members={members}
        selectedUserIds={memberOrder}
        title={t("teams.mobile.entryBulk.memberSelectTitle")}
        onConfirm={confirmMemberSelection}
        onCancel={() => setIsMemberModalOpen(false)}
      />

      {/* 種目選択モーダル */}
      <Modal
        visible={!!stylePickerRowId}
        transparent
        animationType="slide"
        onRequestClose={() => setStylePickerRowId(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setStylePickerRowId(null)} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerSheetTitle}>{t("teams.mobile.entryBulk.eventLabel")}</Text>
              <Pressable onPress={() => setStylePickerRowId(null)} hitSlop={8}>
                <Feather name="x" size={22} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView>
              {/* 選択を解除（web の <option value=""> 相当。既存行ならこの操作が削除意図になる） */}
              <Pressable
                style={styles.pickerOption}
                onPress={() => {
                  if (stylePickerRowId) clearRowStyle(stylePickerRowId);
                  setStylePickerRowId(null);
                }}
              >
                <Text style={styles.pickerOptionTextMuted}>{t("teams.record.clearSelection")}</Text>
              </Pressable>
              {swimStyles.map((style) => (
                <Pressable
                  key={style.id}
                  style={styles.pickerOption}
                  onPress={() => {
                    if (stylePickerRowId) updateRowStyle(stylePickerRowId, style.id);
                    setStylePickerRowId(null);
                  }}
                >
                  <Text style={styles.pickerOptionText}>{localizedStyleName(style, t)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 確認モーダル: 新規/更新/削除/変更なしの4分類 */}
      <Modal
        visible={isConfirmModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsConfirmModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !saving && setIsConfirmModalOpen(false)}
          />
          <View style={styles.confirmSheet}>
            <View style={styles.pickerSheetHeader}>
              <Text style={styles.pickerSheetTitle}>{t("teams.mobile.entryBulk.confirmModalTitle")}</Text>
              <Pressable onPress={() => setIsConfirmModalOpen(false)} hitSlop={8} disabled={saving}>
                <Feather name="x" size={22} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.confirmScrollContent}>
              <Text style={styles.confirmDescription}>
                {t("teams.mobile.entryBulk.confirmModalDescription")}
              </Text>

              {diffResult.toCreate.length > 0 && (
                <View style={styles.confirmSection}>
                  <Text style={[styles.confirmSectionTitle, styles.confirmSectionTitleNew]}>
                    {t("teams.mobile.entryBulk.categoryNew")} ({diffResult.toCreate.length})
                  </Text>
                  {diffResult.toCreate.map((item, idx) => {
                    const sourceRow = validDraftRows.find(
                      (r) =>
                        !r.existingEntryId &&
                        r.targetUserId === item.user_id &&
                        r.styleId === item.style_id,
                    );
                    const isUntouchedPrefill = !!sourceRow && isPrefillUntouched(sourceRow);
                    return (
                      <View key={`create-${idx}`} style={styles.confirmRow}>
                        <Text style={styles.confirmRowText}>
                          {memberNameByUserId.get(item.user_id) ?? ""} ・ {styleNameById(item.style_id)}
                          {" → "}
                          {item.entry_time != null ? formatTimeBest(item.entry_time) : "-"}
                          {isUntouchedPrefill ? " ⚠️" : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {diffResult.toUpdate.length > 0 && (
                <View style={styles.confirmSection}>
                  <Text style={[styles.confirmSectionTitle, styles.confirmSectionTitleUpdate]}>
                    {t("teams.mobile.entryBulk.categoryUpdated")} ({diffResult.toUpdate.length})
                  </Text>
                  {diffResult.toUpdate.map(({ id, patch }) => {
                    const existing = existingEntryRows.find((e) => e.id === id);
                    if (!existing) return null;
                    const sourceRow = validDraftRows.find((r) => r.existingEntryId === id);
                    const isUntouchedPrefill = !!sourceRow && isPrefillUntouched(sourceRow);
                    const beforeTime = existing.entry_time != null ? formatTimeBest(existing.entry_time) : "-";
                    const afterTime =
                      patch.entry_time !== undefined
                        ? patch.entry_time != null
                          ? formatTimeBest(patch.entry_time)
                          : "-"
                        : beforeTime;
                    return (
                      <View key={`update-${id}`} style={styles.confirmRow}>
                        <Text style={styles.confirmRowText}>
                          {memberNameByUserId.get(existing.user_id) ?? ""} ・{" "}
                          {styleNameById(existing.style_id)}
                          {" : "}
                          {beforeTime} {"→"} {afterTime}
                          {isUntouchedPrefill ? " ⚠️" : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {diffResult.toDelete.length > 0 && (
                <View style={styles.confirmSection}>
                  <Text style={[styles.confirmSectionTitle, styles.confirmSectionTitleDelete]}>
                    {t("teams.mobile.entryBulk.categoryDeleted")} ({diffResult.toDelete.length})
                  </Text>
                  {diffResult.toDelete.map((id) => {
                    const existing = existingEntryRows.find((e) => e.id === id);
                    if (!existing) return null;
                    return (
                      <View key={`delete-${id}`} style={styles.confirmRow}>
                        <Text style={[styles.confirmRowText, styles.confirmRowTextDeleted]}>
                          {memberNameByUserId.get(existing.user_id) ?? ""} ・{" "}
                          {styleNameById(existing.style_id)}
                          {" : "}
                          {existing.entry_time != null ? formatTimeBest(existing.entry_time) : "-"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {diffResult.unchanged.length > 0 && (
                <View style={styles.confirmSection}>
                  <Text style={styles.confirmSectionTitle}>
                    {t("teams.mobile.entryBulk.categoryUnchanged")} ({diffResult.unchanged.length})
                  </Text>
                  {diffResult.unchanged.map((id) => {
                    const existing = existingEntryRows.find((e) => e.id === id);
                    if (!existing) return null;
                    const sourceRow = validDraftRows.find((r) => r.existingEntryId === id);
                    const isUntouchedPrefill = !!sourceRow && isPrefillUntouched(sourceRow);
                    return (
                      <View key={`unchanged-${id}`} style={styles.confirmRow}>
                        <Text style={styles.confirmRowTextMuted}>
                          {memberNameByUserId.get(existing.user_id) ?? ""} ・{" "}
                          {styleNameById(existing.style_id)}
                          {" : "}
                          {existing.entry_time != null ? formatTimeBest(existing.entry_time) : "-"}
                          {isUntouchedPrefill ? " ⚠️" : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {diffResult.toCreate.length === 0 &&
                diffResult.toUpdate.length === 0 &&
                diffResult.toDelete.length === 0 &&
                diffResult.unchanged.length === 0 && (
                  <Text style={styles.confirmDescription}>
                    {t("teams.mobile.entryBulk.emptyDiffMessage")}
                  </Text>
                )}
            </ScrollView>

            <SafeAreaView edges={["bottom"]} style={styles.confirmFooter}>
              <Pressable
                style={styles.cancelFooterBtn}
                onPress={() => setIsConfirmModalOpen(false)}
                disabled={saving}
              >
                <Text style={styles.cancelFooterText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, saving && styles.disabledBtn]}
                onPress={handleConfirmSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>{t("teams.mobile.entryBulk.confirmButton")}</Text>
                )}
              </Pressable>
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  compHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  compTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  compSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  warningBannerSoft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  warningBannerText: { flex: 1, fontSize: 13, color: "#92400E" },
  addMemberButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  addMemberButtonText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center" },
  memberCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  memberCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  memberName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  retiredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
  },
  retiredBadgeText: { fontSize: 11, fontWeight: "600", color: "#6B7280" },
  rowCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  rowIndexLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  field: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  timeLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  prefillButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  prefillButtonText: { fontSize: 11, fontWeight: "600", color: "#2563EB" },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  pickerButtonText: { fontSize: 15, color: "#111827" },
  placeholder: { color: "#9CA3AF" },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputError: { borderColor: "#DC2626" },
  errorText: { fontSize: 12, color: "#DC2626", marginTop: 4 },
  prefillWarningText: { fontSize: 12, color: "#B45309", marginTop: 4, fontWeight: "600" },
  addEventButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  addEventText: { fontSize: 13, fontWeight: "600", color: "#2563EB" },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  cancelFooterBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelFooterText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: { fontSize: 15, fontWeight: "600", color: "#FFFFFF" },
  disabledBtn: { opacity: 0.5 },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 16,
  },
  permissionText: { fontSize: 15, color: "#6B7280", textAlign: "center" },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 16,
  },
  pickerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pickerSheetTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  pickerOptionText: { fontSize: 15, color: "#111827" },
  pickerOptionTextMuted: { fontSize: 15, color: "#9CA3AF" },
  confirmSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
  },
  confirmScrollContent: { padding: 16 },
  confirmDescription: { fontSize: 13, color: "#6B7280", marginBottom: 12 },
  confirmSection: { marginBottom: 16 },
  confirmSectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
  },
  confirmSectionTitleNew: { color: "#059669" },
  confirmSectionTitleUpdate: { color: "#2563EB" },
  confirmSectionTitleDelete: { color: "#DC2626" },
  confirmRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  confirmRowText: { fontSize: 13, color: "#111827" },
  confirmRowTextDeleted: { color: "#DC2626", textDecorationLine: "line-through" },
  confirmRowTextMuted: { fontSize: 13, color: "#9CA3AF" },
  confirmFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
});
