import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import {
  usePracticeTagsQuery,
  useCreatePracticeTagMutation,
  useUpdatePracticeTagMutation,
  useDeletePracticeTagMutation,
} from "@apps/shared/hooks/queries/practices";
import { teamKeys, practiceKeys } from "@apps/shared/hooks/queries/keys";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { formatTime, SWIM_STYLES } from "@/utils/formatters";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { VideoUploader, TagChips, TagSelectModal, TagManageModal } from "@/components/shared";
import { MemberSelectModal } from "@/components/teams/MemberSelectModal";
import { uploadVideoForTeamMember, MissingThumbnailError } from "@/utils/videoUpload";
import { useQuickTimeInput } from "@/hooks/useQuickTimeInput";
import type { MainStackParamList } from "@/navigation/types";
import type { PracticeTag } from "@apps/shared/types";

type RouteProps = RouteProp<MainStackParamList, "TeamPracticeLogBulkForm">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

const SWIM_CATEGORIES = [
  { value: "Swim", label: "Swim" },
  { value: "Pull", label: "Pull" },
  { value: "Kick", label: "Kick" },
] as const;

type SwimCategory = "Swim" | "Pull" | "Kick";

/** RN には crypto.randomUUID がないため簡易 ID 生成（クライアント内のみで使用） */
let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `m-${Date.now().toString(36)}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** メンバー1名分のタイムエントリ（メニュー内） */
interface MemberTimeEntry {
  setNumber: number;
  repNumber: number;
  time: number;
  displayValue: string;
}

/** メニュー（セット）定義。Web PracticeMenu 相当 */
interface PracticeMenu {
  id: string;
  style: string;
  swimCategory: SwimCategory;
  distance: number | "";
  reps: number | "";
  sets: number | "";
  circleMin: number | "";
  circleSec: number | "";
  note: string;
  tags: PracticeTag[];
  /** 対象ユーザー（user_id）リスト */
  targetUserIds: string[];
  /** user_id → タイムエントリ配列 */
  times: Record<string, MemberTimeEntry[]>;
  /** user_id → 保留動画アセット */
  videoAssets: Record<string, { uri: string; mimeType?: string } | null>;
}

/** RPC へ渡す各ログ（user_id 代理指定） */
interface ReplaceLogData {
  user_id: string;
  style: string;
  swim_category: SwimCategory;
  rep_count: number;
  set_count: number;
  distance: number;
  circle: number | null;
  note: string;
  practice_times: Array<{ set_number: number; rep_number: number; time: number }>;
  tag_ids: string[];
}

interface PracticeInfo {
  id: string;
  date: string;
  place: string | null;
}

/** 既存ログ（編集モード用ロード結果） */
interface ExistingPracticeLog {
  id: string;
  user_id: string;
  style: string;
  swim_category: SwimCategory | null;
  distance: number;
  rep_count: number;
  set_count: number;
  circle: number | null;
  note: string | null;
  practice_log_tags: { practice_tags: PracticeTag | null }[] | null;
  practice_times: {
    id: string;
    set_number: number;
    rep_number: number;
    time: number;
  }[] | null;
}

/**
 * チーム練習記録の一括代理入力画面（管理者専用 / Web 完全パリティ）
 * - メニュー（セット）ごとに対象メンバーを複数選択し、メンバー×メニューでタイム入力
 * - replace_practice_logs RPC で全削除→再挿入（各ログに user_id を代理指定）
 * - 編集モード（既存ログをグループ化してロード → replace セマンティクス）
 * - 代理動画添付（team-assign 経由、Premium ゲート）
 *
 * RPC 本体は DB 側で admin/所有権/メンバー認可ガードを持つ（20260618000000_secure_replace_practice_logs）。
 * 画面側の admin 再判定は UX（早期エラー表示）+ 多層防御として保持する。
 */
export const TeamPracticeLogBulkFormScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { practiceId, teamId } = route.params;
  const { supabase, subscription, user, getAccessToken } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isPremium = checkIsPremium(subscription);
  const { parseInput } = useQuickTimeInput();

  // メンバー一覧（権限判定にも使用）
  const { members, isLoading: membersLoading } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });
  const { data: availableTags = [] } = usePracticeTagsQuery(supabase);

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  const [practice, setPractice] = useState<PracticeInfo | null>(null);
  const [menus, setMenus] = useState<PracticeMenu[]>([]);
  const [presentUserIds, setPresentUserIds] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // モーダル状態
  const [memberModalMenuId, setMemberModalMenuId] = useState<string | null>(null);
  const [tagModalMenuId, setTagModalMenuId] = useState<string | null>(null);
  const [showTagManageModal, setShowTagManageModal] = useState(false);
  const [editingTag, setEditingTag] = useState<PracticeTag | null>(null);

  // タグミューテーション（単体フォーム PracticeLogFormScreen と同パターン）
  const createTagMutation = useCreatePracticeTagMutation(supabase);
  const updateTagMutation = useUpdatePracticeTagMutation(supabase);
  const deleteTagMutation = useDeletePracticeTagMutation(supabase);

  const initializedRef = useRef(false);

  const getMemberName = (userId: string): string => {
    const member = members.find((m) => m.user_id === userId);
    return member?.users?.name || t("teams.mobile.unnamedMember");
  };

  /** 既存ログを Web buildMenusFromLogs と同ロジックでグループ化 */
  const buildMenusFromLogs = (
    logs: ExistingPracticeLog[],
    present: string[],
  ): PracticeMenu[] => {
    if (logs.length === 0) {
      return [
        {
          id: genId(),
          style: "Fr",
          swimCategory: "Swim",
          distance: 100,
          reps: 4,
          sets: 1,
          circleMin: 1,
          circleSec: 30,
          note: "",
          tags: [],
          targetUserIds: present.length > 0 ? present : members.map((m) => m.user_id),
          times: {},
          videoAssets: {},
        },
      ];
    }

    const menuGroups = new Map<string, PracticeMenu>();
    for (const log of logs) {
      const category: SwimCategory = log.swim_category || "Swim";
      const key = `${log.style}-${category}-${log.distance}-${log.rep_count}-${log.set_count}`;
      if (!menuGroups.has(key)) {
        const tags =
          log.practice_log_tags
            ?.map((plt) => plt.practice_tags)
            .filter((tag): tag is PracticeTag => tag != null) || [];
        menuGroups.set(key, {
          id: genId(),
          style: log.style,
          swimCategory: category,
          distance: log.distance,
          reps: log.rep_count,
          sets: log.set_count,
          circleMin: log.circle ? Math.floor(log.circle / 60) : 1,
          circleSec: log.circle ? log.circle % 60 : 30,
          note: log.note || "",
          tags,
          targetUserIds: [],
          times: {},
          videoAssets: {},
        });
      }
      const group = menuGroups.get(key)!;
      if (!group.targetUserIds.includes(log.user_id)) {
        group.targetUserIds.push(log.user_id);
      }
      if (log.practice_times && log.practice_times.length > 0) {
        const memberTimes: MemberTimeEntry[] = log.practice_times.map((pt) => ({
          setNumber: pt.set_number,
          repNumber: pt.rep_number,
          time: pt.time,
          displayValue: pt.time > 0 ? formatTime(pt.time) : "",
        }));
        group.times[log.user_id] = [...(group.times[log.user_id] ?? []), ...memberTimes];
      }
    }
    return Array.from(menuGroups.values());
  };

  // 練習情報・既存ログ・出席をロード
  useEffect(() => {
    if (initializedRef.current) return;
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);

        const [practiceRes, logsRes, attendanceRes] = await Promise.all([
          supabase
            .from("practices")
            .select("id, date, place")
            .eq("id", practiceId)
            .eq("team_id", teamId)
            .single(),
          supabase
            .from("practice_logs")
            .select(
              `id, user_id, style, swim_category, distance, rep_count, set_count, circle, note,
               practice_log_tags ( practice_tags ( id, name, color, user_id, created_at, updated_at ) ),
               practice_times ( id, set_number, rep_number, time )`,
            )
            .eq("practice_id", practiceId)
            .order("created_at", { ascending: true }),
          supabase
            .from("team_attendance")
            .select("user_id, status")
            .eq("practice_id", practiceId),
        ]);

        if (!isMounted) return;

        if (practiceRes.error || !practiceRes.data) {
          throw practiceRes.error || new Error(t("practice.mobile.fetchLogFailed"));
        }

        const practiceData = practiceRes.data as unknown as PracticeInfo;
        const logs = (logsRes.data || []) as unknown as ExistingPracticeLog[];
        const attendance = (attendanceRes.data || []) as { user_id: string; status: string | null }[];
        const present = attendance
          .filter((a) => a.status === "present")
          .map((a) => a.user_id);

        setPractice(practiceData);
        setPresentUserIds(present);
        setIsEditMode(logs.length > 0);
        setMenus(buildMenusFromLogs(logs, present));
        initializedRef.current = true;
      } catch (err) {
        if (!isMounted) return;
        console.error("チーム練習ログロードエラー:", err);
        setLoadError(err instanceof Error ? err.message : t("practice.mobile.fetchLogFailed"));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
    // members が確定してから初期メニューのデフォルト対象を決めたいので members も依存に含める
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, practiceId, teamId, members.length]);

  // ---- メニュー操作（Web PracticeLogClient と同ロジック）----

  const addMenu = () => {
    setMenus((prev) => [
      ...prev,
      {
        id: genId(),
        style: "Fr",
        swimCategory: "Swim",
        distance: 100,
        reps: 4,
        sets: 1,
        circleMin: 1,
        circleSec: 30,
        note: "",
        tags: [],
        targetUserIds:
          presentUserIds.length > 0 ? presentUserIds : members.map((m) => m.user_id),
        times: {},
        videoAssets: {},
      },
    ]);
  };

  const removeMenu = (menuId: string) => {
    setMenus((prev) => (prev.length > 1 ? prev.filter((m) => m.id !== menuId) : prev));
  };

  const updateMenu = <K extends keyof PracticeMenu>(
    menuId: string,
    field: K,
    value: PracticeMenu[K],
  ) => {
    setMenus((prev) => prev.map((m) => (m.id === menuId ? { ...m, [field]: value } : m)));
  };

  const confirmMemberSelection = (menuId: string, selectedUserIds: string[]) => {
    setMenus((prev) =>
      prev.map((menu) => {
        if (menu.id !== menuId) return menu;
        // 選択解除されたユーザーのタイム・動画も破棄する
        const nextTimes: Record<string, MemberTimeEntry[]> = {};
        const nextVideos: Record<string, { uri: string; mimeType?: string } | null> = {};
        for (const uid of selectedUserIds) {
          if (menu.times[uid]) nextTimes[uid] = menu.times[uid];
          if (menu.videoAssets[uid]) nextVideos[uid] = menu.videoAssets[uid];
        }
        return { ...menu, targetUserIds: selectedUserIds, times: nextTimes, videoAssets: nextVideos };
      }),
    );
    setMemberModalMenuId(null);
  };

  const setMemberTimeCell = (
    menuId: string,
    userId: string,
    setNumber: number,
    repNumber: number,
    rawValue: string,
  ) => {
    const { time, displayValue } = parseInput(rawValue);
    setMenus((prev) =>
      prev.map((menu) => {
        if (menu.id !== menuId) return menu;
        const existing = menu.times[userId] ?? [];
        const idx = existing.findIndex(
          (e) => e.setNumber === setNumber && e.repNumber === repNumber,
        );
        let nextEntries: MemberTimeEntry[];
        const entry: MemberTimeEntry = {
          setNumber,
          repNumber,
          time,
          displayValue: displayValue || rawValue,
        };
        if (idx >= 0) {
          nextEntries = existing.map((e, i) => (i === idx ? entry : e));
        } else {
          nextEntries = [...existing, entry];
        }
        return { ...menu, times: { ...menu.times, [userId]: nextEntries } };
      }),
    );
  };

  const getCellValue = (
    menu: PracticeMenu,
    userId: string,
    setNumber: number,
    repNumber: number,
  ): string => {
    const entry = (menu.times[userId] ?? []).find(
      (e) => e.setNumber === setNumber && e.repNumber === repNumber,
    );
    return entry?.displayValue ?? "";
  };

  // ---- タグ管理（PracticeLogFormScreen と同パターン）----
  const openTagCreateModal = () => {
    setTagModalMenuId(null);
    setTimeout(() => {
      setEditingTag(null);
      setShowTagManageModal(true);
    }, 100);
  };

  const openTagEditModal = (tag: PracticeTag) => {
    setTagModalMenuId(null);
    setTimeout(() => {
      setEditingTag(tag);
      setShowTagManageModal(true);
    }, 100);
  };

  const handleSaveTag = async (name: string, color: string) => {
    try {
      if (editingTag) {
        await updateTagMutation.mutateAsync({ id: editingTag.id, name, color });
      } else {
        const newTag = await createTagMutation.mutateAsync({ name, color });
        if (tagModalMenuId) {
          const menu = menus.find((m) => m.id === tagModalMenuId);
          if (menu) updateMenu(tagModalMenuId, "tags", [...menu.tags, newTag]);
        }
      }
    } catch (error) {
      console.error("タグ保存エラー:", error);
      Alert.alert(t("common.error"), t("practice.mobile.tagSaveFailed"));
    }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await deleteTagMutation.mutateAsync(id);
      // 削除したタグをすべてのメニューから除去
      setMenus((prev) =>
        prev.map((menu) => ({
          ...menu,
          tags: menu.tags.filter((tg) => tg.id !== id),
        })),
      );
    } catch (error) {
      console.error("タグ削除エラー:", error);
      Alert.alert(t("common.error"), t("practice.mobile.tagDeleteFailed"));
    }
  };

  // ---- 保存（Web handleSubmit と同フロー：replace_practice_logs RPC）----
  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);

    try {
      // RPC へ渡すログデータを準備（空欄/time<=0 はスキップ）
      const logsData: ReplaceLogData[] = [];
      for (const menu of menus) {
        const targetMembers = members.filter((m) => menu.targetUserIds.includes(m.user_id));
        for (const member of targetMembers) {
          const memberTimes = (menu.times[member.user_id] ?? []).filter((e) => e.time > 0);
          logsData.push({
            user_id: member.user_id,
            style: menu.style,
            swim_category: menu.swimCategory,
            rep_count: Number(menu.reps) || 1,
            set_count: Number(menu.sets) || 1,
            distance: Number(menu.distance) || 100,
            // サークルは分・秒を総秒数に換算（本人入力と統一）。0 秒は未設定として null。
            circle:
              (Number(menu.circleMin) || 0) * 60 + (Number(menu.circleSec) || 0) > 0
                ? (Number(menu.circleMin) || 0) * 60 + (Number(menu.circleSec) || 0)
                : null,
            note: menu.note || "",
            practice_times: memberTimes.map((e) => ({
              set_number: e.setNumber,
              rep_number: e.repNumber,
              time: e.time,
            })),
            tag_ids: menu.tags.map((tag) => tag.id),
          });
        }
      }

      if (logsData.length === 0) {
        Alert.alert(t("common.error"), t("teamsAdmin.practiceLog.errorAtLeastOne"));
        setSaving(false);
        return;
      }

      // replace_practice_logs: practice_id 配下の全ログを削除してから再挿入（各ログに user_id）
      const { data: result, error: rpcError } = await supabase.rpc("replace_practice_logs", {
        p_practice_id: practiceId,
        p_logs_data: logsData,
      });

      if (rpcError) {
        console.error("練習ログ保存エラー:", rpcError);
        Alert.alert(t("common.error"), t("teamsAdmin.practiceLog.errorSave"));
        setSaving(false);
        return;
      }

      // RPC 結果の正規化。success フラグ確認 + 成功時は挿入順の log_ids を取り出す。
      let logIds: string[] = [];
      if (result && typeof result === "object") {
        const r = result as { success?: boolean; error?: string; log_ids?: unknown };
        if ("success" in r && !r.success) {
          console.error("練習ログ保存エラー:", r.error);
          Alert.alert(
            t("common.error"),
            r.error
              ? t("teamsAdmin.practiceLog.errorSaveWithMessage", { message: r.error })
              : t("teamsAdmin.practiceLog.errorSave"),
          );
          setSaving(false);
          return;
        }
        if (Array.isArray(r.log_ids)) {
          logIds = r.log_ids.filter((v): v is string => typeof v === "string");
        }
      }

      // 代理動画アップロード（Premium のみ）。失敗はログ保存を妨げない（部分失敗は集約）。
      const videoErrors: string[] = [];
      const hasPendingVideos = menus.some((menu) =>
        Object.values(menu.videoAssets).some((a) => a),
      );
      if (isPremium && hasPendingVideos) {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          videoErrors.push(t("practice.mobile.videoUploadFailedSession"));
        } else {
          // RPC が返す log_ids は logsData と同じ挿入順。logsData 構築と完全同一の反復順
          // （for menu → for member of members.filter(targetUserIds)）で flatIndex を進め、
          // 各「メニュー×メンバー」に log_ids[flatIndex] を対応づける。動画添付要求の平坦化も
          // 同一順で行うことで、index ズレによる別人への誤添付を構造的に排除する（W-1）。
          let flatIndex = 0;
          for (const menu of menus) {
            const targetMembers = members.filter((m) =>
              menu.targetUserIds.includes(m.user_id),
            );
            for (const member of targetMembers) {
              const logId = logIds[flatIndex];
              flatIndex += 1;

              const asset = menu.videoAssets[member.user_id];
              // この「メニュー×メンバー」に保留動画が無ければ添付対象外（flatIndex は進める）。
              if (!asset) continue;

              // 理論上は起きない（フォーム順=insert順=log_ids順）が、log_ids 長不足で
              // この行の logId が無い場合はスキップして集約（握りつぶさない）。
              if (!logId) {
                videoErrors.push(
                  t("teamsAdmin.practiceLog.errorVideoLogResolveFailed", {
                    name: getMemberName(member.user_id),
                  }),
                );
                continue;
              }

              try {
                await uploadVideoForTeamMember({
                  type: "practice-log",
                  id: logId,
                  targetUserId: member.user_id,
                  teamId,
                  videoUri: asset.uri,
                  mimeType: asset.mimeType,
                  accessToken,
                });
              } catch (videoErr) {
                console.error("代理動画アップロードエラー:", videoErr);
                // サムネ未生成は team-assign が必須のため添付不可。専用メッセージで通知。
                const key =
                  videoErr instanceof MissingThumbnailError
                    ? "teamsAdmin.practiceLog.errorVideoNoThumbnail"
                    : "teamsAdmin.practiceLog.errorVideoGenericFailed";
                videoErrors.push(t(key, { name: getMemberName(member.user_id) }));
              }
            }
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });

      // ログ保存は成功済み。動画の部分失敗のみの場合は「保存成功 + 一部動画失敗」を通知して戻る。
      // （保存自体は完了しているため留まらない。留まると編集モードで二重挿入リスクがある。）
      if (videoErrors.length > 0) {
        Alert.alert(
          t("common.notice"),
          t("teamsAdmin.practiceLog.videoPartialFailureSaved", {
            errors: videoErrors.join("\n"),
          }),
          [{ text: "OK", onPress: () => navigation.goBack() }],
        );
        setSaving(false);
        return;
      }

      navigation.goBack();
    } catch (err) {
      console.error("チーム練習ログ作成エラー:", err);
      Alert.alert(
        t("common.error"),
        err instanceof Error ? err.message : t("teamsAdmin.practiceLog.errorSave"),
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- 描画 ----
  if (loading || membersLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loadingLogs")} />
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

  // 権限ゲート。RPC は DB 側で admin/所有権認可ガードを持つ（20260618000000）が、UX（早期エラー表示）+ 多層防御として非 admin はここでエラー表示して戻す。
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>{t("teams.mobile.webGuide")}</Text>
          <Pressable style={styles.permissionButton} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionButtonText}>{t("teamsAdmin.practiceLog.backButton")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const memberModalMenu = menus.find((m) => m.id === memberModalMenuId) ?? null;
  const tagModalMenu = menus.find((m) => m.id === tagModalMenuId) ?? null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 練習情報 */}
        <View style={styles.practiceHeader}>
          <Text style={styles.practiceTitle}>
            {isEditMode
              ? t("teamsAdmin.practiceLog.titleEdit")
              : t("teamsAdmin.practiceLog.titleAdd")}
          </Text>
          <Text style={styles.practiceSubtitle}>{t("teamsAdmin.practiceLog.subtitle")}</Text>
          {practice?.place ? (
            <View style={styles.placeRow}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.placeText}>{practice.place}</Text>
            </View>
          ) : null}
        </View>

        {menus.map((menu, index) => {
          const setCount = Number(menu.sets) || 0;
          const repCount = Number(menu.reps) || 0;
          return (
            <View key={menu.id} style={styles.menuCard}>
              {/* メニューヘッダー */}
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>
                  {t("teamsAdmin.practiceLog.menuTitle", { index: index + 1 })}
                </Text>
                {menus.length > 1 && (
                  <Pressable
                    onPress={() => removeMenu(menu.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("common.delete")}
                  >
                    <Feather name="trash-2" size={18} color="#DC2626" />
                  </Pressable>
                )}
              </View>

              {/* 種目 */}
              <View style={styles.field}>
                <Text style={styles.label}>{t("teamsAdmin.practiceLog.style1Label")}</Text>
                <View style={styles.pickerContainer}>
                  {SWIM_STYLES.map((style) => (
                    <Pressable
                      key={style.value}
                      style={[
                        styles.pickerOption,
                        menu.style === style.value && styles.pickerOptionSelected,
                      ]}
                      onPress={() => updateMenu(menu.id, "style", style.value)}
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          menu.style === style.value && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {t(`practice.styleAbbrev.${style.value}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 泳法カテゴリ */}
              <View style={styles.field}>
                <Text style={styles.label}>{t("teamsAdmin.practiceLog.style2Label")}</Text>
                <View style={styles.pickerContainer}>
                  {SWIM_CATEGORIES.map((category) => (
                    <Pressable
                      key={category.value}
                      style={[
                        styles.pickerOption,
                        menu.swimCategory === category.value && styles.pickerOptionSelected,
                      ]}
                      onPress={() =>
                        updateMenu(menu.id, "swimCategory", category.value as SwimCategory)
                      }
                    >
                      <Text
                        style={[
                          styles.pickerOptionText,
                          menu.swimCategory === category.value && styles.pickerOptionTextSelected,
                        ]}
                      >
                        {category.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* 距離・本数・セット数 */}
              <View style={styles.row}>
                <View style={styles.fieldThird}>
                  <Text style={styles.label}>{t("teamsAdmin.practiceLog.distanceLabel")}</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.distance === "" ? "" : String(menu.distance)}
                    onChangeText={(text) =>
                      updateMenu(menu.id, "distance", text === "" ? "" : Number(text))
                    }
                    placeholder="100"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldThird}>
                  <Text style={styles.label}>{t("teamsAdmin.practiceLog.repsLabel")}</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.reps === "" ? "" : String(menu.reps)}
                    onChangeText={(text) =>
                      updateMenu(menu.id, "reps", text === "" ? "" : Number(text))
                    }
                    placeholder="4"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldThird}>
                  <Text style={styles.label}>{t("teamsAdmin.practiceLog.setsLabel")}</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.sets === "" ? "" : String(menu.sets)}
                    onChangeText={(text) =>
                      updateMenu(menu.id, "sets", text === "" ? "" : Number(text))
                    }
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* サークル */}
              <View style={styles.row}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>{t("teamsAdmin.practiceLog.circleMinLabel")}</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.circleMin === "" ? "" : String(menu.circleMin)}
                    onChangeText={(text) =>
                      updateMenu(menu.id, "circleMin", text === "" ? "" : Number(text))
                    }
                    placeholder="1"
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>{t("teamsAdmin.practiceLog.circleSecLabel")}</Text>
                  <TextInput
                    style={styles.input}
                    value={menu.circleSec === "" ? "" : String(menu.circleSec)}
                    onChangeText={(text) =>
                      updateMenu(menu.id, "circleSec", text === "" ? "" : Number(text))
                    }
                    placeholder="30"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* 対象メンバー */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  {t("teamsAdmin.practiceLog.participantsSection")}
                </Text>
                <Pressable
                  style={styles.selectMemberButton}
                  onPress={() => setMemberModalMenuId(menu.id)}
                >
                  <Feather name="users" size={16} color="#2563EB" />
                  <Text style={styles.selectMemberText}>
                    {t("teamsAdmin.practiceLog.selectUsersButton")}
                  </Text>
                </Pressable>
                <Text style={styles.countLabel}>
                  {t("teamsAdmin.practiceLog.selectedCount", {
                    count: menu.targetUserIds.length,
                  })}
                </Text>
              </View>

              {/* タグ */}
              <View style={styles.field}>
                <Text style={styles.label}>{t("teamsAdmin.practiceLog.tagLabel")}</Text>
                <TagChips
                  tags={menu.tags}
                  onPress={() => setTagModalMenuId(menu.id)}
                  onRemove={(tagId) =>
                    updateMenu(
                      menu.id,
                      "tags",
                      menu.tags.filter((tg) => tg.id !== tagId),
                    )
                  }
                />
              </View>

              {/* メモ */}
              <View style={styles.field}>
                <Text style={styles.label}>{t("teamsAdmin.practiceLog.memoLabel")}</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={menu.note}
                  onChangeText={(text) => updateMenu(menu.id, "note", text)}
                  placeholder={t("teamsAdmin.practiceLog.memoPlaceholder")}
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* メンバー × タイム入力 */}
              {menu.targetUserIds.length === 0 ? (
                <View style={styles.emptyMembersBox}>
                  <Text style={styles.emptyMembersText}>
                    {t("teams.mobile.bulkPracticeEmpty", {
                      defaultValue: t("teamsAdmin.practiceLog.selectUsersButton"),
                    })}
                  </Text>
                </View>
              ) : (
                <View style={styles.membersSection}>
                  <Text style={styles.subHeader}>
                    {t("teamsAdmin.practiceLog.timeInputSummary", {
                      sets: setCount,
                      reps: repCount,
                      total: setCount * repCount,
                    })}
                  </Text>
                  {menu.targetUserIds.map((userId) => (
                    <View key={userId} style={styles.memberCard}>
                      <Text style={styles.memberName}>{getMemberName(userId)}</Text>

                      {/* タイムグリッド（セット×本数）。1:23.45 形式 */}
                      {setCount > 0 && repCount > 0 ? (
                        <View style={styles.timeGrid}>
                          {Array.from({ length: setCount }, (_, si) => {
                            const setNumber = si + 1;
                            return (
                              <View key={setNumber} style={styles.setBlock}>
                                <Text style={styles.setLabel}>
                                  {t("practice.modal.setLabel", { n: setNumber })}
                                </Text>
                                <View style={styles.repRow}>
                                  {Array.from({ length: repCount }, (_, ri) => {
                                    const repNumber = ri + 1;
                                    return (
                                      <View key={repNumber} style={styles.repCell}>
                                        <Text style={styles.repCellLabel}>
                                          {t("practice.modal.repLabel", { n: repNumber })}
                                        </Text>
                                        <TextInput
                                          style={styles.repInput}
                                          value={getCellValue(menu, userId, setNumber, repNumber)}
                                          onChangeText={(text) =>
                                            setMemberTimeCell(
                                              menu.id,
                                              userId,
                                              setNumber,
                                              repNumber,
                                              text,
                                            )
                                          }
                                          placeholder={t(
                                            "teams.record.timePlaceholder",
                                          )}
                                          placeholderTextColor="#9CA3AF"
                                        />
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.hintText}>
                          {t("teamsAdmin.practiceLog.timeInputOptional")}
                        </Text>
                      )}

                      {/* 代理動画（Premium ゲート） */}
                      <View style={styles.videoField}>
                        <Text style={styles.smallLabel}>
                          {t("teamsAdmin.practiceLog.videoLabel")}
                        </Text>
                        {isPremium ? (
                          <VideoUploader
                            type="practice-log"
                            isPremium={isPremium}
                            existingVideoPath={null}
                            existingThumbnailPath={null}
                            onPendingVideoAsset={(asset) =>
                              setMenus((prev) =>
                                prev.map((mm) =>
                                  mm.id === menu.id
                                    ? {
                                        ...mm,
                                        videoAssets: { ...mm.videoAssets, [userId]: asset },
                                      }
                                    : mm,
                                ),
                              )
                            }
                          />
                        ) : (
                          <PremiumBadge feature="video_upload" compact />
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* メニュー追加 */}
        <Pressable style={styles.addMenuButton} onPress={addMenu}>
          <Feather name="plus" size={16} color="#2563EB" />
          <Text style={styles.addMenuText}>{t("teamsAdmin.practiceLog.addMenuButton")}</Text>
        </Pressable>
      </ScrollView>

      {/* フッター */}
      <View style={styles.footer}>
        <Pressable
          style={styles.cancelFooterBtn}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.cancelFooterText}>
            {t("teamsAdmin.practiceLog.cancelButton")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.saveButton, saving && styles.disabledBtn]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{t("teamsAdmin.practiceLog.saveButton")}</Text>
          )}
        </Pressable>
      </View>

      {/* メンバー選択モーダル（共通基盤を再利用） */}
      <MemberSelectModal
        visible={!!memberModalMenuId}
        members={members}
        selectedUserIds={memberModalMenu?.targetUserIds ?? []}
        onConfirm={(ids) => memberModalMenuId && confirmMemberSelection(memberModalMenuId, ids)}
        onCancel={() => setMemberModalMenuId(null)}
        title={t("teamsAdmin.practiceLog.userSelectModalTitle")}
      />

      {/* タグ選択モーダル（共通基盤を再利用） */}
      <TagSelectModal
        visible={!!tagModalMenuId}
        onClose={() => setTagModalMenuId(null)}
        selectedTags={tagModalMenu?.tags ?? []}
        availableTags={availableTags}
        onTagsChange={(tags) => tagModalMenuId && updateMenu(tagModalMenuId, "tags", tags)}
        onCreateTag={openTagCreateModal}
        onEditTag={openTagEditModal}
        onDeleteTag={(tag) => handleDeleteTag(tag.id)}
      />

      {/* タグ管理モーダル（作成・編集） */}
      <TagManageModal
        visible={showTagManageModal}
        onClose={() => setShowTagManageModal(false)}
        tag={editingTag}
        onSave={handleSaveTag}
        onDelete={handleDeleteTag}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  practiceHeader: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  practiceTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  practiceSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  placeText: { fontSize: 13, color: "#6B7280" },
  menuCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  menuTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  field: { marginBottom: 14 },
  fieldHalf: { flex: 1 },
  fieldThird: { flex: 1 },
  row: { flexDirection: "row", gap: 12, marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  smallLabel: { fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 4 },
  hintText: { fontSize: 13, color: "#9CA3AF" },
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
  textArea: { minHeight: 80, paddingTop: 10 },
  pickerContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  pickerOptionSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  pickerOptionText: { fontSize: 14, color: "#374151" },
  pickerOptionTextSelected: { color: "#FFFFFF", fontWeight: "600" },
  selectMemberButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  selectMemberText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  countLabel: { fontSize: 13, color: "#6B7280", marginTop: 6 },
  emptyMembersBox: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  emptyMembersText: { fontSize: 13, color: "#9CA3AF", textAlign: "center" },
  membersSection: { borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 12 },
  subHeader: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 10 },
  memberCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  memberName: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 10 },
  timeGrid: { gap: 10 },
  setBlock: { gap: 6 },
  setLabel: { fontSize: 13, fontWeight: "600", color: "#1D4ED8" },
  repRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  repCell: { width: 90 },
  repCellLabel: { fontSize: 10, color: "#6B7280", marginBottom: 2 },
  repInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
  },
  videoField: { marginTop: 12 },
  addMenuButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  addMenuText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
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
});
