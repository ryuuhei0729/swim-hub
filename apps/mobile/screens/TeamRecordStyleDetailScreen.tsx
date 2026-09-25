import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  usePreventRemove,
  RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { FormKeyboardAvoidingView } from "@/components/forms/FormKeyboardAvoidingView";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import {
  teamKeys,
  recordKeys,
  invalidateTeamRankings,
} from "@apps/shared/hooks/queries/keys";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { excludeNonSwimmers } from "@apps/shared/utils/swimmerFilter";
import { RecordAPI } from "@apps/shared/api/records";
import { checkIsPremium } from "@swim-hub/shared/utils/premium";
import { FREE_PLAN_LIMITS } from "@swim-hub/shared/constants/premium";
import { normalizeReactionTime } from "@apps/shared/utils/reactionTime";
import { hasUnsavedChanges } from "@/utils/tabFormUtils";
import { formatTimeBest } from "@/utils/formatters";
import { localizedStyleName } from "@/utils/styleName";
import { LapTimeDisplay } from "@/components/records/LapTimeDisplay";
import { getBestTimeForEntry } from "@/components/records/bestTimeForEntry";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { PremiumBadge } from "@/components/shared/PremiumBadge";
import { VideoUploader } from "@/components/shared/VideoUploader";
import { TimeInputHelp } from "@/components/shared/TimeInputHelp";
import { MemberSelectModal } from "@/components/teams/MemberSelectModal";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { ItemTabs } from "@/components/forms/ItemTabs";
import { useQuickTimeInput } from "@/hooks/useQuickTimeInput";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import type { MainStackParamList } from "@/navigation/types";
import type { BestTime } from "@apps/shared/types/ui";
import {
  buildRelayEvents,
  isRelayingForLeg,
  calcLegTimesFromCumulative,
  getRelayLegBoundaries,
  type RelayEventId,
  type LabelledRelayEventDef,
} from "@apps/shared/utils/relayEvents";
import type {
  MemberRecord,
  StyleEntry,
  SplitTimeEntry,
} from "./teamRecordBulk/buildStyleEntries";
import {
  groupMemberRecordsByUser,
  hasMemberRecordData,
} from "./teamRecordBulk/groupMemberRecordsByUser";
import {
  loadTeamRecordCompetitionData,
  type TeamRecordCompetitionData,
} from "./teamRecordBulk/loadTeamRecordData";
import {
  saveStyleRecords,
  scopeExistingRecordIdsForEntries,
  scopeRelayRecordIdsForLegRecords,
  SaveStyleRecordsValidationError,
  type StyleRecordVideoError,
} from "./teamRecordBulk/saveStyleRecords";

type RouteProps = RouteProp<MainStackParamList, "TeamRecordBulkFormDetail">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

const RELAY_FREE_PLAN_MAX_SPLITS = FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD * 4;

/** RN には crypto.randomUUID がないため簡易 ID 生成（クライアント内のみで使用） */
let idCounter = 0;
function genId(): string {
  idCounter += 1;
  return `sd-${Date.now().toString(36)}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function buildEmptyIndividualEntry(
  styleId: number,
  styleName: string,
): StyleEntry {
  return { id: genId(), styleId, styleName, memberRecords: [] };
}

function buildEmptyRelayEntry(
  relayEventId: RelayEventId,
  relayDef: LabelledRelayEventDef,
  isPremium: boolean,
): StyleEntry {
  // RELAY_EVENTS (relayEvents.ts) は全種目が常に4 legs で定義されているが、
  // TS は配列長を追跡できないため防御的にガードする
  const firstLeg = relayDef.legs[0];
  if (!firstLeg) {
    throw new Error("relay event definition must have at least one leg");
  }

  const legRecords: MemberRecord[] = relayDef.legs.map((leg) => ({
    id: genId(),
    memberUserId: "",
    memberName: "",
    time: 0,
    timeDisplayValue: "",
    reactionTime: "",
    isRelaying: isRelayingForLeg(leg.legIndex),
    note: "",
    splitTimes: [],
    relayLegStyleId: leg.styleId,
    relayLegLabel: leg.legLabel,
    cumulativeTimeSeconds: 0,
  }));

  const legBoundaries = getRelayLegBoundaries(relayEventId);
  const defaultSplitDistances = legBoundaries.slice(0, 3);
  const allowedCount = isPremium
    ? defaultSplitDistances.length
    : Math.max(
        0,
        Math.min(defaultSplitDistances.length, RELAY_FREE_PLAN_MAX_SPLITS),
      );
  const defaultSplits: SplitTimeEntry[] = defaultSplitDistances
    .slice(0, allowedCount)
    .map((distance) => ({
      id: genId(),
      distance,
      splitTime: 0,
      displayValue: "",
    }));

  return {
    id: genId(),
    styleId: firstLeg.styleId,
    styleName: relayDef.label,
    relayEventId,
    memberRecords: legRecords,
    relaySplitTimes: defaultSplits,
  };
}

/**
 * チーム大会記録の種目詳細画面（代理入力。管理者専用。2階層化後の詳細画面）。
 * 一覧画面のカードから styleId (個人種目) または relayEventId (リレー種目) を
 * 受け取り、この1種目ぶんだけを代理入力する。保存もこの種目のみを対象にする。
 */
export const TeamRecordStyleDetailScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { competitionId, teamId, styleId, relayEventId } = route.params;
  const { supabase, subscription, user, getAccessToken } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isPremium = checkIsPremium(subscription);
  const { parseInput } = useQuickTimeInput();
  // フッターは SafeAreaView edges={["bottom"]} が消費するが、RN Modal は
  // Android edge-to-edge 下でも自動回避しないため、泳者選択シートは
  // シート自身の paddingBottom で bottom inset を消費する必要がある。
  const insets = useSafeInsets();

  const parseTimeToSeconds = (value: string): number => {
    if (!value || value.trim() === "") return 0;
    return parseInput(value).time;
  };

  const { members, isLoading: membersLoading } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  // メンバー選択候補（非泳者を除外）。isCurrentUserAdmin 判定・氏名解決には
  // 生の members を使い続け、候補提示の直前だけこの配列を使う (一覧画面と同じ設計)。
  const memberSelectCandidates = useMemo(
    () => excludeNonSwimmers(members),
    [members],
  );

  const memberGenderByUserId = useMemo(() => {
    const map = new Map<string, number>();
    for (const member of members) {
      const gender = member.users?.gender;
      if (typeof gender !== "number") continue;
      map.set(member.user_id, gender);
    }
    return map;
  }, [members]);

  const relayEvents = useMemo(
    () =>
      buildRelayEvents({
        ba: t("practice.styles.Ba"),
        br: t("practice.styles.Br"),
        fly: t("practice.styles.Fly"),
        fr: t("practice.styles.Fr"),
        legLabel: (num, style) =>
          t("competition.records.relayLegLabel", { num, style }),
        freeRelaySuffix: t("competition.records.freeRelaySuffix"),
        medleyRelaySuffix: t("competition.records.medleyRelaySuffix"),
      }),
    [t],
  );

  const [data, setData] = useState<TeamRecordCompetitionData | null>(null);
  // この種目 (styleId or relayEventId) に属する「組」の一覧。個人種目は通常1本、
  // リレーは同一種目に複数チーム (組) が既存データとして存在しうる (事実4)。
  const [entries, setEntries] = useState<StyleEntry[]>([]);
  // 個人種目とリレー種目でこの2つの意味が分かれる:
  //  - リレー: activeGroupIndex = entries 配列上のアクティブな「組」(Aチーム/Bチーム等)
  //  - 個人種目: entries は常に1件 (事実: buildStyleEntriesFromExisting が同一 style_id を
  //    畳み込む)。activeGroupIndex は使わず、代わりに activePlayerIndex が
  //    memberGroups (選手単位のグルーピング) 上のアクティブな選手を指す
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const entry = entries[activeGroupIndex] ?? null;
  // 個人種目のみで使う: entry.memberRecords を選手 (memberUserId) 単位でグルーピングした
  // もの。DB に「組」は無いのでタブの単位を選手に読み替える。リレーでは常に空配列。
  const memberGroups = useMemo(
    () =>
      entry && !entry.relayEventId
        ? groupMemberRecordsByUser(entry.memberRecords)
        : [],
    [entry],
  );
  const clampedActivePlayerIndex =
    memberGroups.length === 0
      ? 0
      : Math.min(activePlayerIndex, memberGroups.length - 1);
  const activeMemberGroup = memberGroups[clampedActivePlayerIndex];
  const activeMemberRecords = activeMemberGroup?.records ?? [];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [bestTimesByUserId, setBestTimesByUserId] = useState<
    Map<string, BestTime[]>
  >(new Map());

  // この種目の全「組」に属する既存 records.id 集合 (画面オープン時点のスナップショット)。
  // 保存時の diff (computeRecordSaveDiff) の削除スコープに使う。
  // entries の編集で書き換わってはいけないため live state ではなく ref に固定する。
  const existingRecordIdsRef = useRef<Set<string>>(new Set());
  // 上記のうちリレーのレグに該当する records.id を relay_record_legs 経由で解決した
  // relay_records.id 集合 (画面オープン時点のスナップショット)。TeamRelayRecordsAPI.replace()
  // の削除スコープに使う (事実1: DB 列条件でなく画面が読み込んだ id だけを渡す)。
  // 個人種目では常に空集合。
  const existingRelayRecordIdsRef = useRef<Set<string>>(new Set());
  // usePreventRemove の dirty 判定用スナップショット (JSON 文字列)
  const snapshotRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );
  const isPremiumRef = useRef(isPremium);
  useEffect(() => {
    isPremiumRef.current = isPremium;
  }, [isPremium]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const result = await loadTeamRecordCompetitionData({
        supabase,
        competitionId,
        teamId,
        competitionFetchFailedMessage: t("recordMobile.competitionFetchFailed"),
        unknownUserLabel: t("teams.competitionRecordsModal.unknownUser"),
      });
      if (!isMountedRef.current) return;

      // 既存データに同一種目の StyleEntry が複数ある場合 (リレーで複数チーム/組が
      // 既に登録済み)、その全てを「組」として拾う。.find() は最初の1件しか拾えず、
      // 2組目以降が閲覧も編集も削除もできなくなる (事実4)。
      const resolvedList = relayEventId
        ? result.styleEntries.filter((e) => e.relayEventId === relayEventId)
        : styleId !== undefined
          ? result.styleEntries.filter(
              (e) => !e.relayEventId && e.styleId === styleId,
            )
          : [];

      const relayDef = relayEventId
        ? relayEvents.find((r) => r.id === relayEventId)
        : undefined;

      const initialEntries: StyleEntry[] =
        resolvedList.length > 0
          ? resolvedList
          : [
              relayEventId && relayDef
                ? buildEmptyRelayEntry(
                    relayEventId,
                    relayDef,
                    isPremiumRef.current,
                  )
                : styleId !== undefined
                  ? buildEmptyIndividualEntry(
                      styleId,
                      result.styles.find((s) => s.id === styleId)?.name_jp ||
                        "",
                    )
                  : {
                      id: genId(),
                      styleId: "",
                      styleName: "",
                      memberRecords: [],
                    },
            ];

      existingRecordIdsRef.current = scopeExistingRecordIdsForEntries(
        result.existingRecords,
        initialEntries,
      );

      // リレーのレグに該当する records.id から、この画面が読み込んだ relay_records.id
      // (画面が置き換えて良い範囲) を解決する。個人種目では常に空集合のまま。
      existingRelayRecordIdsRef.current = relayEventId
        ? await scopeRelayRecordIdsForLegRecords(
            supabase,
            Array.from(existingRecordIdsRef.current),
          )
        : new Set();

      snapshotRef.current = JSON.stringify(initialEntries);
      setData(result);
      setEntries(initialEntries);
      setActiveGroupIndex(0);
      setActivePlayerIndex(0);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("チーム記録詳細ロードエラー:", err);
      setLoadError(toUserFacingMessage(err, t("recordMobile.saveFailed")));
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
    // relayEvents は t にのみ依存するため、実質 supabase/competitionId/teamId/styleId/
    // relayEventId/t の変化でのみ再ロードされる (isPremium の変化では再ロードしない —
    // isPremiumRef 経由で読むのは新規リレー行の初期スプリット数だけなので、
    // 編集中に購読状態が変わってもフォームをリセットしない)
  }, [supabase, competitionId, teamId, styleId, relayEventId, t, relayEvents]);

  useEffect(() => {
    load();
  }, [load]);

  // ベストタイム参照バッジ用（N+1回避）。取得失敗時はバッジを諦めて画面は続行する。
  useEffect(() => {
    if (members.length === 0) return;
    let cancelled = false;

    const loadBestTimes = async () => {
      try {
        const map = await new RecordAPI(supabase).getBestTimesDetailedForUsers(
          members.map((m) => m.user_id),
        );
        if (!cancelled) setBestTimesByUserId(map);
      } catch (err) {
        console.error("ベストタイム参照の取得に失敗しました:", err);
      }
    };

    loadBestTimes();
    return () => {
      cancelled = true;
    };
  }, [supabase, members]);

  const changedFromSnapshot = useMemo(() => {
    if (entries.length === 0 || snapshotRef.current === null) return false;
    return hasUnsavedChanges(
      entries,
      JSON.parse(snapshotRef.current) as StyleEntry[],
    );
  }, [entries]);

  usePreventRemove(!isSaved && changedFromSnapshot, ({ data: navData }) => {
    Alert.alert(t("common.discardTitle"), t("common.discardMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.discard"),
        style: "destructive",
        onPress: () => navigation.dispatch(navData.action),
      },
    ]);
  });

  // 保存完了 → 前画面へ戻る（isSaved の再レンダー commit 後に goBack することで
  // usePreventRemove の preventRemove=false が確定した状態で REMOVE を発行する）
  useEffect(() => {
    if (isSaved) navigation.goBack();
  }, [isSaved, navigation]);

  const bestTimeBadgeFor = (
    memberUserId: string,
    forStyleId: number | "" | undefined,
    isRelaying: boolean,
  ): { time: number; label: string } | null => {
    if (!memberUserId || forStyleId === "" || forStyleId === undefined)
      return null;
    if (!data) return null;
    const styleName = data.styles.find((st) => st.id === forStyleId)?.name_jp;
    if (!styleName) return null;
    const result = getBestTimeForEntry(
      styleName,
      data.competition.pool_type,
      isRelaying,
      bestTimesByUserId.get(memberUserId) ?? [],
    );
    return result ? { time: result.time, label: t(result.labelKey) } : null;
  };

  // ---- モーダル state ----
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [legPicker, setLegPicker] = useState<{ legIndex: number } | null>(null);

  // ---- 組 (アクティブな entries[activeGroupIndex]) の更新用シム ----
  // 既存の各ハンドラーは `setEntry((prev) => ...)` の形で単一 StyleEntry を更新する
  // 前提で書かれている。entries 配列化後もハンドラー本体を変えずに済むよう、
  // アクティブな組だけを差し替える薄いラッパーとして残す。
  const setEntry = (
    updater: (prev: StyleEntry | null) => StyleEntry | null,
  ) => {
    setEntries((prevEntries) => {
      const current = prevEntries[activeGroupIndex];
      if (current === undefined) return prevEntries;
      const next = updater(current);
      if (next === null || next === current) return prevEntries;
      const copy = prevEntries.slice();
      copy[activeGroupIndex] = next;
      return copy;
    });
  };

  // ---- 組 (StyleEntry) の追加・削除 ----
  const addGroup = () => {
    const relayDef =
      relayEventId != null
        ? relayEvents.find((r) => r.id === relayEventId)
        : undefined;
    // relayEventId が渡されているのに relayDef が見つからない状態は本来起こらない
    // (buildRelayEvents は RELAY_EVENTS 全件を常に生成する) が、型上は undefined を
    // 排除できないため、その場合は組を追加せず何もしない (ガード節に倒す)。
    if (relayEventId != null && !relayDef) return;

    setEntries((prev) => {
      const template = prev[activeGroupIndex] ?? prev[0];
      let newEntry: StyleEntry;
      if (relayEventId != null && relayDef) {
        newEntry = buildEmptyRelayEntry(
          relayEventId,
          relayDef,
          isPremiumRef.current,
        );
      } else {
        // 個人種目: テンプレートの styleId が使えなければ route の styleId (この画面が
        // 個人種目で開かれた場合に確定している値) にフォールバックする。どちらも無ければ
        // (本来起こらないが型上排除できない) 組は追加しない。
        const individualStyleId =
          typeof template?.styleId === "number" ? template.styleId : styleId;
        if (individualStyleId === undefined) return prev;
        newEntry = buildEmptyIndividualEntry(
          individualStyleId,
          template?.styleName ?? "",
        );
      }
      const next = [...prev, newEntry];
      setActiveGroupIndex(next.length - 1);
      return next;
    });
  };

  const removeGroup = (index: number) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      setActiveGroupIndex((cur) => {
        if (cur >= next.length) return next.length - 1;
        if (cur > index) return cur - 1;
        return cur;
      });
      return next;
    });
  };

  // ---- entry 操作 ----
  // 1選手が複数本 (予選・決勝等) を持つ場合、その全てを保持したまま再構築する。
  // .find() (単数) だと2本目以降が失われる (一旦モーダルで外して再選択すると消える) ため
  // 必ず .filter() で全件拾う。
  const confirmMemberSelection = (selectedUserIds: string[]) => {
    if (!entry) {
      setMemberModalOpen(false);
      return;
    }
    const newMemberRecords: MemberRecord[] = [];
    for (const userId of selectedUserIds) {
      const existingRecords = entry.memberRecords.filter(
        (mr) => mr.memberUserId === userId,
      );
      if (existingRecords.length > 0) {
        newMemberRecords.push(...existingRecords);
      } else {
        const member = members.find((m) => m.user_id === userId);
        if (member) {
          newMemberRecords.push({
            id: genId(),
            memberUserId: userId,
            memberName: member.users?.name || "",
            time: 0,
            timeDisplayValue: "",
            reactionTime: "",
            isRelaying: false,
            note: "",
            splitTimes: [],
          });
        }
      }
    }
    setEntry((prev) =>
      prev ? { ...prev, memberRecords: newMemberRecords } : prev,
    );
    setActivePlayerIndex((cur) => {
      const newGroupCount = groupMemberRecordsByUser(newMemberRecords).length;
      return newGroupCount === 0 ? 0 : Math.min(cur, newGroupCount - 1);
    });
    setMemberModalOpen(false);
  };

  // ---- 個人種目: 選手単位タブの追加(本目)・削除(選手解除) ----
  // アクティブな選手に空の MemberRecord を1件追加する。他の選手・タブ数には影響しない。
  const addHeatForActivePlayer = () => {
    if (!entry || entry.relayEventId || !activeMemberGroup) return;
    const member = members.find(
      (m) => m.user_id === activeMemberGroup.memberUserId,
    );
    const newRecord: MemberRecord = {
      id: genId(),
      memberUserId: activeMemberGroup.memberUserId,
      memberName: member?.users?.name || activeMemberGroup.memberName,
      time: 0,
      timeDisplayValue: "",
      reactionTime: "",
      isRelaying: false,
      note: "",
      splitTimes: [],
    };
    setEntry((prev) =>
      prev
        ? { ...prev, memberRecords: [...prev.memberRecords, newRecord] }
        : prev,
    );
  };

  // タブの × = その選手が持つ全ての本目を memberRecords から取り除く。
  // 入力済みの値がある選手を外す場合は黙って消さず確認ダイアログを出す。
  const requestRemoveMemberGroup = (groupIndex: number) => {
    const group = memberGroups[groupIndex];
    if (!entry || !group) return;
    const hasData = group.records.some((mr) => hasMemberRecordData(mr));

    const performRemove = () => {
      setEntry((prev) => {
        if (!prev) return prev;
        const removeIds = new Set(group.records.map((mr) => mr.id));
        return {
          ...prev,
          memberRecords: prev.memberRecords.filter(
            (mr) => !removeIds.has(mr.id),
          ),
        };
      });
      setActivePlayerIndex((cur) => {
        const nextLength = memberGroups.length - 1;
        if (nextLength <= 0) return 0;
        if (cur >= nextLength) return nextLength - 1;
        if (cur > groupIndex) return cur - 1;
        return cur;
      });
    };

    if (hasData) {
      Alert.alert(
        t("teams.record.removeMemberConfirmTitle"),
        t("teams.record.removeMemberConfirmMessage", {
          name: group.memberName,
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: performRemove,
          },
        ],
      );
    } else {
      performRemove();
    }
  };

  // 「n本目」見出し行の × = その本目1件だけを memberRecords から取り除く。
  // 選手そのものを外すタブの × とは別物 (1本目には出さない = 呼び出し側で
  // heatPosition >= 1 のときのみ描画する)。行の特定は必ず record.id で行う
  // (updateMemberRecord と同じ方式。memberUserId だと同一選手の他の本目も
  // まとめて消えてしまう)。
  const requestRemoveHeat = (recordId: string, heatPosition: number) => {
    if (!entry) return;
    const record = entry.memberRecords.find((mr) => mr.id === recordId);
    if (!record) return;
    const hasData = hasMemberRecordData(record);

    const performRemove = () => {
      setEntry((prev) =>
        prev
          ? {
              ...prev,
              memberRecords: prev.memberRecords.filter(
                (mr) => mr.id !== recordId,
              ),
            }
          : prev,
      );
    };

    if (hasData) {
      Alert.alert(
        t("teams.record.removeHeatConfirmTitle"),
        t("teams.record.removeHeatConfirmMessage", {
          n: heatPosition + 1,
        }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: performRemove,
          },
        ],
      );
    } else {
      performRemove();
    }
  };

  const updateMemberRecordByIndex = (
    legIndex: number,
    updates: Partial<MemberRecord>,
  ) => {
    setEntry((prev) =>
      prev
        ? {
            ...prev,
            memberRecords: prev.memberRecords.map((mr, idx) =>
              idx === legIndex ? { ...mr, ...updates } : mr,
            ),
          }
        : prev,
    );
  };

  // 行の特定は必ず MemberRecord.id で行う (memberUserId ではない)。
  // 予選・決勝で同一人物が同じ種目を2本泳ぐ等、同じ memberUserId を持つ行が
  // 1つの組の中に複数存在しうるため、memberUserId で特定すると該当行が全て
  // まとめて更新されてしまう (事実4)。
  const updateMemberRecord = (
    recordId: string,
    updates: Partial<MemberRecord>,
  ) => {
    setEntry((prev) =>
      prev
        ? {
            ...prev,
            memberRecords: prev.memberRecords.map((mr) =>
              mr.id === recordId ? { ...mr, ...updates } : mr,
            ),
          }
        : prev,
    );
  };

  const handleReactionTimeBlurByIndex = (legIndex: number, value: string) => {
    updateMemberRecordByIndex(legIndex, {
      reactionTime: normalizeReactionTime(value),
    });
  };

  const handleReactionTimeBlur = (recordId: string, value: string) => {
    updateMemberRecord(recordId, {
      reactionTime: normalizeReactionTime(value),
    });
  };

  const handleTimeChange = (recordId: string, value: string) => {
    setEntry((prev) => {
      if (!prev) return prev;
      const style = data?.styles.find((s) => s.id === prev.styleId);
      const raceDistance = style?.distance;
      const newTime = parseTimeToSeconds(value);

      return {
        ...prev,
        memberRecords: prev.memberRecords.map((mr) => {
          if (mr.id !== recordId) return mr;
          let updatedSplitTimes = [...mr.splitTimes];
          if (raceDistance && newTime > 0) {
            const idx = updatedSplitTimes.findIndex(
              (st) =>
                typeof st.distance === "number" && st.distance === raceDistance,
            );
            if (idx >= 0) {
              updatedSplitTimes = updatedSplitTimes.map((st, i) =>
                i === idx
                  ? {
                      ...st,
                      splitTime: newTime,
                      displayValue: formatTimeBest(newTime),
                    }
                  : st,
              );
            } else {
              updatedSplitTimes = [
                ...updatedSplitTimes,
                {
                  id: genId(),
                  distance: raceDistance,
                  splitTime: newTime,
                  displayValue: formatTimeBest(newTime),
                },
              ];
            }
          }
          return {
            ...mr,
            timeDisplayValue: value,
            time: newTime,
            splitTimes: updatedSplitTimes,
          };
        }),
      };
    });
  };

  const countBillableSplitTimes = (splitTimes: SplitTimeEntry[]): number => {
    if (!entry) return splitTimes.length;
    const style = data?.styles.find((s) => s.id === entry.styleId);
    const raceDistance = style?.distance;
    if (!raceDistance) return splitTimes.length;
    return splitTimes.filter(
      (st) =>
        !(typeof st.distance === "number" && st.distance === raceDistance),
    ).length;
  };

  const handleRelayTotalTimeChange = (value: string) => {
    setEntry((prev) => {
      if (!prev || !prev.relayEventId) return prev;
      const totalSeconds = parseTimeToSeconds(value);
      const legBoundaries = getRelayLegBoundaries(prev.relayEventId);
      const totalDistance = legBoundaries[3];
      if (totalDistance === undefined) return prev; // legBoundaries は常に4要素だが防御的に扱う

      const currentSplits = prev.relaySplitTimes ?? [];
      const existingIdx = currentSplits.findIndex(
        (st) => st.distance === totalDistance,
      );
      let updatedSplits: SplitTimeEntry[];
      if (totalSeconds > 0) {
        const newSplit: SplitTimeEntry = {
          id:
            existingIdx >= 0
              ? (currentSplits[existingIdx]?.id ?? genId())
              : genId(),
          distance: totalDistance,
          splitTime: totalSeconds,
          displayValue: value,
        };
        updatedSplits =
          existingIdx >= 0
            ? currentSplits.map((st, i) => (i === existingIdx ? newSplit : st))
            : [...currentSplits, newSplit];
      } else {
        updatedSplits =
          existingIdx >= 0
            ? currentSplits.filter((_, i) => i !== existingIdx)
            : currentSplits;
      }

      const newCumulatives = legBoundaries.map((boundary) => {
        const found = updatedSplits.find((st) => st.distance === boundary);
        return found ? found.splitTime : 0;
      });
      const allBoundariesPresent = newCumulatives.every((c) => c > 0);
      const legTimes = allBoundariesPresent
        ? calcLegTimesFromCumulative(newCumulatives)
        : null;

      const updatedMemberRecords = prev.memberRecords.map((mr, idx) => {
        const newCum = newCumulatives[idx] ?? 0;
        const isLastLeg = idx === 3;
        const cumTime = isLastLeg
          ? totalSeconds
          : newCum > 0
            ? newCum
            : (mr.cumulativeTimeSeconds ?? 0);
        const legTime = legTimes ? (legTimes[idx] ?? mr.time) : mr.time;
        return {
          ...mr,
          cumulativeTimeSeconds: cumTime,
          time: legTime,
          timeDisplayValue: isLastLeg ? value : mr.timeDisplayValue,
        };
      });

      return {
        ...prev,
        relaySplitTimes: updatedSplits,
        memberRecords: updatedMemberRecords,
      };
    });
  };

  const handleRelaySplitTimeChange = (
    splitId: string,
    field: "distance" | "splitTime",
    value: string,
  ) => {
    setEntry((prev) => {
      if (!prev || !prev.relayEventId) return prev;
      const legBoundaries = getRelayLegBoundaries(prev.relayEventId);
      const totalDistance = legBoundaries[3];

      const updatedSplits = (prev.relaySplitTimes ?? []).map((st) => {
        if (st.id !== splitId) return st;
        if (field === "distance") {
          const parsed = parseFloat(value);
          return {
            ...st,
            distance: value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed),
          };
        }
        return {
          ...st,
          displayValue: value,
          splitTime: parseTimeToSeconds(value),
        };
      });

      const newCumulatives = legBoundaries.map((boundary) => {
        const found = updatedSplits.find((st) => st.distance === boundary);
        return found ? found.splitTime : 0;
      });
      const allBoundariesPresent = newCumulatives.every((c) => c > 0);
      const legTimes = allBoundariesPresent
        ? calcLegTimesFromCumulative(newCumulatives)
        : null;

      const changedSplit = updatedSplits.find((st) => st.id === splitId);
      const isTotalDistanceSplit =
        field === "splitTime" &&
        changedSplit &&
        changedSplit.distance === totalDistance;

      const updatedMemberRecords = prev.memberRecords.map((mr, idx) => {
        const newCum = allBoundariesPresent ? (newCumulatives[idx] ?? 0) : 0;
        const cumTime = newCum > 0 ? newCum : (mr.cumulativeTimeSeconds ?? 0);
        const legTime = legTimes ? (legTimes[idx] ?? mr.time) : mr.time;
        const updates: Partial<MemberRecord> = {
          cumulativeTimeSeconds: cumTime,
          time: legTimes ? legTime : mr.time,
        };
        if (isTotalDistanceSplit && idx === 3) {
          updates.timeDisplayValue = value;
        }
        return { ...mr, ...updates };
      });

      return {
        ...prev,
        relaySplitTimes: updatedSplits,
        memberRecords: updatedMemberRecords,
      };
    });
  };

  const addRelaySplitTimesAtInterval = (interval: number) => {
    setEntry((prev) => {
      if (!prev || !prev.relayEventId) return prev;
      const legBoundaries = getRelayLegBoundaries(prev.relayEventId);
      const totalDistance = legBoundaries[3];
      if (totalDistance === undefined) return prev; // legBoundaries は常に4要素だが防御的に扱う
      const currentSplits = prev.relaySplitTimes ?? [];
      const existingDistances = new Set(
        currentSplits.map((st) => st.distance).filter((d) => d > 0),
      );
      let newSplits: SplitTimeEntry[] = [];
      for (
        let distance = interval;
        distance <= totalDistance;
        distance += interval
      ) {
        if (!existingDistances.has(distance)) {
          newSplits.push({
            id: genId(),
            distance,
            splitTime: 0,
            displayValue: "",
          });
        }
      }
      if (newSplits.length === 0) return prev;
      if (!isPremium) {
        const max = RELAY_FREE_PLAN_MAX_SPLITS - currentSplits.length;
        if (max <= 0) return prev;
        newSplits = newSplits.slice(0, max);
      }
      return { ...prev, relaySplitTimes: [...currentSplits, ...newSplits] };
    });
  };

  const addRelaySplitTime = () => {
    setEntry((prev) => {
      if (!prev || !prev.relayEventId) return prev;
      const currentSplits = prev.relaySplitTimes ?? [];
      if (!isPremium && currentSplits.length >= RELAY_FREE_PLAN_MAX_SPLITS)
        return prev;
      return {
        ...prev,
        relaySplitTimes: [
          ...currentSplits,
          { id: genId(), distance: 0, splitTime: 0, displayValue: "" },
        ],
      };
    });
  };

  const removeRelaySplitTime = (splitId: string) => {
    setEntry((prev) =>
      !prev || !prev.relayEventId
        ? prev
        : {
            ...prev,
            relaySplitTimes: (prev.relaySplitTimes ?? []).filter(
              (st) => st.id !== splitId,
            ),
          },
    );
  };

  const addSplitTime = (recordId: string) => {
    setEntry((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        memberRecords: prev.memberRecords.map((mr) => {
          if (mr.id !== recordId) return mr;
          if (!isPremium) {
            const billable = countBillableSplitTimes(mr.splitTimes);
            if (billable >= FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD) return mr;
          }
          return {
            ...mr,
            splitTimes: [
              ...mr.splitTimes,
              { id: genId(), distance: 0, splitTime: 0, displayValue: "" },
            ],
          };
        }),
      };
    });
  };

  const addSplitTimesAtInterval = (recordId: string, interval: number) => {
    if (!recordId || !entry) return;
    const style = data?.styles.find((s) => s.id === entry.styleId);
    if (!style || !style.distance) return;
    const raceDistance = style.distance;

    setEntry((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        memberRecords: prev.memberRecords.map((mr) => {
          if (mr.id !== recordId) return mr;
          const existingDistances = new Set(
            mr.splitTimes
              .map((st) => (typeof st.distance === "number" ? st.distance : 0))
              .filter((d) => d > 0),
          );
          let newSplitTimes: SplitTimeEntry[] = [];
          for (
            let distance = interval;
            distance <= raceDistance;
            distance += interval
          ) {
            if (!existingDistances.has(distance)) {
              newSplitTimes.push({
                id: genId(),
                distance,
                splitTime: 0,
                displayValue: "",
              });
            }
          }
          if (newSplitTimes.length === 0) return mr;
          if (!isPremium) {
            const billable = countBillableSplitTimes(mr.splitTimes);
            const newBillable = newSplitTimes.filter(
              (st) =>
                !(
                  typeof st.distance === "number" &&
                  st.distance === raceDistance
                ),
            );
            const maxNewBillable =
              FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD - billable;
            if (maxNewBillable <= 0 && newBillable.length > 0) {
              newSplitTimes = newSplitTimes.filter(
                (st) =>
                  typeof st.distance === "number" &&
                  st.distance === raceDistance,
              );
              if (newSplitTimes.length === 0) return mr;
            } else if (newBillable.length > maxNewBillable) {
              let added = 0;
              newSplitTimes = newSplitTimes.filter((st) => {
                const isRaceDist =
                  typeof st.distance === "number" &&
                  st.distance === raceDistance;
                if (isRaceDist) return true;
                if (added < maxNewBillable) {
                  added++;
                  return true;
                }
                return false;
              });
            }
          }
          return { ...mr, splitTimes: [...mr.splitTimes, ...newSplitTimes] };
        }),
      };
    });
  };

  const removeSplitTime = (recordId: string, splitId: string) => {
    setEntry((prev) =>
      !prev
        ? prev
        : {
            ...prev,
            memberRecords: prev.memberRecords.map((mr) =>
              mr.id !== recordId
                ? mr
                : {
                    ...mr,
                    splitTimes: mr.splitTimes.filter((st) => st.id !== splitId),
                  },
            ),
          },
    );
  };

  const updateSplitTime = (
    recordId: string,
    splitId: string,
    field: "distance" | "splitTime",
    value: string,
  ) => {
    setEntry((prev) => {
      if (!prev) return prev;
      const style = data?.styles.find((s) => s.id === prev.styleId);
      const raceDistance = style?.distance;
      return {
        ...prev,
        memberRecords: prev.memberRecords.map((mr) => {
          if (mr.id !== recordId) return mr;
          const updatedSplitTimes = mr.splitTimes.map((st) => {
            if (st.id !== splitId) return st;
            if (field === "distance") {
              const parsed = parseInt(value, 10);
              return {
                ...st,
                distance:
                  value === "" || isNaN(parsed) ? 0 : Math.max(0, parsed),
              };
            }
            return {
              ...st,
              displayValue: value,
              splitTime: parseTimeToSeconds(value),
            };
          });
          const updatedSplit = updatedSplitTimes.find(
            (st) => st.id === splitId,
          );
          if (
            field === "splitTime" &&
            raceDistance &&
            updatedSplit &&
            typeof updatedSplit.distance === "number" &&
            updatedSplit.distance === raceDistance
          ) {
            return {
              ...mr,
              splitTimes: updatedSplitTimes,
              time: updatedSplit.splitTime,
              timeDisplayValue:
                updatedSplit.displayValue ||
                formatTimeBest(updatedSplit.splitTime),
            };
          }
          return { ...mr, splitTimes: updatedSplitTimes };
        }),
      };
    });
  };

  // ---- 保存 ----
  const handleSubmit = async () => {
    if (saving || entries.length === 0 || !data) return;
    setSaving(true);
    try {
      const result = await saveStyleRecords({
        supabase,
        competitionId,
        teamId,
        poolType: data.competition.pool_type,
        entries,
        existingRecordIds: existingRecordIdsRef.current,
        existingRelayRecordIds: existingRelayRecordIdsRef.current,
        memberGenderByUserId,
        styles: data.styles,
        isPremium,
        getAccessToken,
      });

      // saveStyleRecords は DB 書き込み (records/split_times/relay_records) と
      // 動画アップロードの両方を内部で完結させてから返る。段階を分けて2回
      // invalidate していた旧実装と異なり、ここは戻り値を受け取った後に
      // 1回だけ呼べば両方の書き込みを反映できる。
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({
        queryKey: teamKeys.competitions(teamId),
      });
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() });
      invalidateTeamRankings(queryClient);

      if (result.hasError) {
        Alert.alert(
          t("common.error"),
          t("competition.records.error.saveFailed"),
        );
        return;
      }

      if (result.videoErrors.length > 0) {
        const messages = result.videoErrors.map(
          (videoError: StyleRecordVideoError) => {
            if (videoError.kind === "noSession") {
              return t("practice.mobile.videoUploadFailedSession");
            }
            const key =
              videoError.kind === "noThumbnail"
                ? "teamsAdmin.practiceLog.errorVideoNoThumbnail"
                : "teamsAdmin.practiceLog.errorVideoGenericFailed";
            return t(key, { name: videoError.memberName });
          },
        );
        Alert.alert(
          t("common.notice"),
          t("teamsAdmin.practiceLog.videoPartialFailureSaved", {
            errors: messages.join("\n"),
          }),
        );
      }

      setIsSaved(true);
    } catch (err) {
      if (err instanceof SaveStyleRecordsValidationError) {
        Alert.alert(
          t("common.error"),
          t(`competition.records.validation.${err.code}`, err.params),
        );
        return;
      }
      console.error("チーム大会記録保存エラー:", err);
      Alert.alert(
        t("common.error"),
        toUserFacingMessage(err, t("competition.records.error.saveFailed")),
      );
    } finally {
      setSaving(false);
    }
  };

  // ---- 描画 ----
  if (loading || membersLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("recordMobile.stylesLoading")} />
      </View>
    );
  }

  if (loadError || !data || !entry) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={loadError ?? t("recordMobile.saveFailed")}
          fullScreen
          onRetry={() => navigation.goBack()}
        />
      </View>
    );
  }

  // 権限ゲート（RLS が二重防御）。非 admin はエラー表示して戻す。直リンク・戻る操作での
  // 素通りを防ぐため一覧画面と同じゲートを詳細画面にも置く。
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>
            {t("teams.mobile.webGuide")}
          </Text>
          <Pressable
            style={styles.permissionButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.permissionButtonText}>
              {t("teams.record.backButton")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const selectedStyle = data.styles.find((s) => s.id === entry.styleId);
  const hasDistance = !!selectedStyle?.distance;
  const relayDef = entry.relayEventId
    ? relayEvents.find((r) => r.id === entry.relayEventId)
    : undefined;
  const isRelayEntry = !!entry.relayEventId;

  // ItemTabs の props はリレー(組の切り替え)と個人種目(選手の切り替え)で意味が異なるため
  // ここで出し分ける。children は活性タブに関わらず常に同じもの (両ブロックとも) が
  // 描画され、出し分けは呼び出し元であるこのコンポーネントの責務 (ItemTabs 側の仕様)。
  const tabsCount = isRelayEntry ? entries.length : memberGroups.length;
  const tabsActiveIndex = isRelayEntry
    ? activeGroupIndex
    : clampedActivePlayerIndex;
  const tabsOnSelect = isRelayEntry
    ? setActiveGroupIndex
    : setActivePlayerIndex;
  const tabsOnAdd = isRelayEntry ? addGroup : () => setMemberModalOpen(true);
  const tabsOnRemove = isRelayEntry
    ? entries.length > 1
      ? removeGroup
      : undefined
    : memberGroups.length > 0
      ? requestRemoveMemberGroup
      : undefined;
  const tabsLabel = isRelayEntry
    ? (i: number) => t("teams.record.groupNumber", { n: i + 1 })
    : (i: number) => memberGroups[i]?.memberName ?? "";

  return (
    <FormKeyboardAvoidingView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* compHeader はリレー/個人で共通描画されるコンポーネントだが、中身は完全に分岐する。
            PM 裁定: リレーは無改修 (大会名・種目名・TimeInputHelp を維持し、
            「メンバーを選択」ボタンは出さない=レグ別ピッカーで選手を決めるため意味を持たない)。
            個人種目のみ「種目名(左)+メンバーを選択ボタン(右)」の1行に変え、
            大会名と TimeInputHelp を非表示にする。 */}
        {isRelayEntry ? (
          <View style={styles.compHeader}>
            <Text style={styles.compTitle}>
              {data.competition.title ||
                t("competition.records.competitionFallback")}
            </Text>
            <Text style={styles.compSubtitle}>
              {relayDef?.label ?? entry.styleName}
            </Text>
            <TimeInputHelp showCarryOver style={{ marginTop: 8 }} />
          </View>
        ) : (
          <View style={styles.compHeader}>
            <View style={styles.compHeaderRow}>
              <Text
                style={[styles.compSubtitle, styles.compHeaderTitle]}
                numberOfLines={1}
              >
                {selectedStyle
                  ? localizedStyleName(selectedStyle, t)
                  : entry.styleName}
              </Text>
              <Pressable
                style={styles.selectMemberButton}
                onPress={() => setMemberModalOpen(true)}
              >
                <Feather name="users" size={16} color="#2563EB" />
                <Text style={styles.selectMemberText}>
                  {t("teams.record.selectMemberButton")}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.countLabel}>
              {t("teams.record.selectedMemberCount", {
                n: memberGroups.length,
              })}
            </Text>
          </View>
        )}

        {/* 個人種目=選手/リレー=組の切り替えタブ。個人種目では DB に「組」概念が無いため、
            タブの単位を選手 (memberUserId) に読み替える。予選・決勝等、1選手が複数本
            持つ場合はパネル内の「n本目を追加」ボタンで本目を増やす (タブは増えない)。
            リレーは従来通り、同一種目の複数チーム分の入力を組タブとして許容する (事実4)。 */}
        <ItemTabs
          count={tabsCount}
          activeIndex={tabsActiveIndex}
          onSelect={tabsOnSelect}
          onAdd={tabsOnAdd}
          onRemove={tabsOnRemove}
          label={tabsLabel}
          accent="blue"
          disabled={saving}
          testID="record-group-tabs"
        >
          {/* 個人種目: アクティブな選手の入力欄 (0人なら空状態)。
              導線は compHeader の「メンバーを選択」ボタンで既に出しているため、
              ここに同じラベルのボタンを重複させない (getByText の一意性を壊すため)。 */}
          {!isRelayEntry &&
            (memberGroups.length === 0 ? (
              <View style={styles.emptyMembersContainer}>
                <Feather name="users" size={28} color="#9CA3AF" />
                <Text style={styles.emptyMembersText}>
                  {t("teams.record.noMembersSelected")}
                </Text>
              </View>
            ) : null)}

          {/* リレー種目*/}
          {entry.relayEventId && (
            <View style={styles.relaySection}>
              <Text style={styles.subHeader}>
                {t("teams.record.timesHeader")}
              </Text>

              {entry.memberRecords.map((mr, mrIndex) => (
                <View key={`leg-${mrIndex}`} style={styles.legCard}>
                  <Text style={styles.legLabel}>
                    {relayDef?.legs[mrIndex]?.legLabel ?? mr.relayLegLabel}
                  </Text>
                  <Pressable
                    style={styles.pickerButton}
                    onPress={() => setLegPicker({ legIndex: mrIndex })}
                  >
                    <Text
                      style={[
                        styles.pickerButtonText,
                        !mr.memberUserId && styles.placeholder,
                      ]}
                    >
                      {mr.memberName ||
                        t("teams.record.relaySwimmerPlaceholder")}
                    </Text>
                    <Feather name="chevron-down" size={18} color="#6B7280" />
                  </Pressable>
                  {(() => {
                    const best = bestTimeBadgeFor(
                      mr.memberUserId,
                      mr.relayLegStyleId,
                      mr.isRelaying,
                    );
                    if (!best) return null;
                    return (
                      <View
                        testID={`relay-leg-best-time-badge-${mrIndex}`}
                        style={styles.bestTimeBadge}
                      >
                        <Text style={styles.bestTimeBadgeText}>
                          {best.label}: {formatTimeBest(best.time)}
                        </Text>
                      </View>
                    );
                  })()}
                  <View style={styles.rtField}>
                    <Text style={styles.smallLabel}>
                      {t("recordMobile.form.reactionTimeLabel")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={mr.reactionTime || ""}
                      onChangeText={(text) =>
                        updateMemberRecordByIndex(mrIndex, {
                          reactionTime: text,
                        })
                      }
                      onBlur={() =>
                        handleReactionTimeBlurByIndex(
                          mrIndex,
                          mr.reactionTime || "",
                        )
                      }
                      placeholder="0.65"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}

              <View style={styles.field}>
                <Text style={styles.label}>{t("teams.record.totalTime")}</Text>
                <TextInput
                  style={styles.input}
                  value={entry.memberRecords[3]?.timeDisplayValue ?? ""}
                  onChangeText={(text) => handleRelayTotalTimeChange(text)}
                  placeholder={t("teams.record.totalTimePlaceholder")}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.field}>
                <View style={styles.splitTimeHeader}>
                  <Text style={styles.smallLabel}>
                    {t("teams.record.zoneLabel")}
                    {!isPremium &&
                      ` ${(entry.relaySplitTimes ?? []).length}/${RELAY_FREE_PLAN_MAX_SPLITS}`}
                  </Text>
                  <View style={styles.splitTimeButtons}>
                    <Pressable
                      style={[
                        styles.addSplitButton,
                        !isPremium &&
                          (entry.relaySplitTimes ?? []).length >=
                            RELAY_FREE_PLAN_MAX_SPLITS &&
                          styles.addButtonDisabled,
                      ]}
                      onPress={() => addRelaySplitTimesAtInterval(25)}
                      disabled={
                        !isPremium &&
                        (entry.relaySplitTimes ?? []).length >=
                          RELAY_FREE_PLAN_MAX_SPLITS
                      }
                    >
                      <Text style={styles.addSplitButtonText}>
                        {t("recordMobile.form.addEvery25m")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.addSplitButton,
                        !isPremium &&
                          (entry.relaySplitTimes ?? []).length >=
                            RELAY_FREE_PLAN_MAX_SPLITS &&
                          styles.addButtonDisabled,
                      ]}
                      onPress={() => addRelaySplitTimesAtInterval(50)}
                      disabled={
                        !isPremium &&
                        (entry.relaySplitTimes ?? []).length >=
                          RELAY_FREE_PLAN_MAX_SPLITS
                      }
                    >
                      <Text style={styles.addSplitButtonText}>
                        {t("recordMobile.form.addEvery50m")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.addSplitButton,
                        !isPremium &&
                          (entry.relaySplitTimes ?? []).length >=
                            RELAY_FREE_PLAN_MAX_SPLITS &&
                          styles.addButtonDisabled,
                      ]}
                      onPress={() => addRelaySplitTime()}
                      disabled={
                        !isPremium &&
                        (entry.relaySplitTimes ?? []).length >=
                          RELAY_FREE_PLAN_MAX_SPLITS
                      }
                    >
                      <Text style={styles.addSplitButtonText}>
                        {t("recordMobile.form.addButton")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
                {[...(entry.relaySplitTimes ?? [])]
                  .sort((a, b) => a.distance - b.distance)
                  .map((split) => (
                    <View key={split.id} style={styles.splitRow}>
                      <TextInput
                        style={[styles.input, styles.splitDistance]}
                        value={split.distance > 0 ? String(split.distance) : ""}
                        onChangeText={(text) => {
                          if (text === "" || /^\d+(\.\d*)?$/.test(text)) {
                            handleRelaySplitTimeChange(
                              split.id,
                              "distance",
                              text,
                            );
                          }
                        }}
                        placeholder={t("teams.record.splitDistancePlaceholder")}
                        keyboardType="decimal-pad"
                      />
                      <Text style={styles.splitSeparator}>m:</Text>
                      <TextInput
                        style={[styles.input, styles.splitTime]}
                        value={split.displayValue}
                        onChangeText={(text) =>
                          handleRelaySplitTimeChange(
                            split.id,
                            "splitTime",
                            text,
                          )
                        }
                        placeholder={t("teams.record.splitTimePlaceholder")}
                        keyboardType="decimal-pad"
                      />
                      <Pressable
                        style={styles.removeSplitBtn}
                        onPress={() => removeRelaySplitTime(split.id)}
                      >
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* 個人種目: アクティブな選手の本目ごとの入力。予選・決勝等で1選手が複数本
              持つ場合のみ「n本目」の見出しを出す (1本しか無いときは出さない)。 */}
          {!isRelayEntry &&
            activeMemberRecords.map((mr, heatPosition) => {
              return (
                <View key={mr.id} style={styles.memberCard}>
                  {activeMemberRecords.length > 1 && (
                    <View style={styles.heatNumberRow}>
                      <Text style={styles.heatNumberLabel}>
                        {t("teams.record.groupNumber", {
                          n: heatPosition + 1,
                        })}
                      </Text>
                      {heatPosition >= 1 && (
                        <Pressable
                          testID={`record-remove-heat-button-${mr.memberUserId}-${heatPosition}`}
                          style={[
                            styles.removeHeatBtn,
                            saving && styles.addButtonDisabled,
                          ]}
                          disabled={saving}
                          onPress={() => requestRemoveHeat(mr.id, heatPosition)}
                          accessibilityLabel={t(
                            "teams.record.removeHeatButtonLabel",
                            { n: heatPosition + 1 },
                          )}
                        >
                          <Feather name="x" size={14} color="#EF4444" />
                        </Pressable>
                      )}
                    </View>
                  )}
                  <Text style={styles.memberName}>{mr.memberName}</Text>

                  {mr.entryTimeReference != null &&
                    mr.entryTimeReference > 0 && (
                      <View style={styles.entryTimeBadge}>
                        <Text style={styles.entryTimeBadgeText}>
                          {t("forms.recordLog.entryTimeLabel")}{" "}
                          {formatTimeBest(mr.entryTimeReference)}
                        </Text>
                      </View>
                    )}

                  {(() => {
                    const best = bestTimeBadgeFor(
                      mr.memberUserId,
                      entry.styleId,
                      mr.isRelaying,
                    );
                    if (!best) return null;
                    return (
                      <View
                        testID={`record-best-time-badge-${mr.memberUserId}-${heatPosition}`}
                        style={styles.bestTimeBadge}
                      >
                        <Text style={styles.bestTimeBadgeText}>
                          {best.label}: {formatTimeBest(best.time)}
                        </Text>
                      </View>
                    );
                  })()}

                  {/* タイム / リアクション / リレー (参照元 CompetitionTabFormScreen.tsx の
                    timeReactionRow と同じ1行レイアウト)。リレー ON でもカラム幅は保ったまま
                    表示し続け、トグルでレイアウトが飛ばないようにする。 */}
                  <View style={styles.timeReactionRow}>
                    <View style={styles.timeField}>
                      <Text style={styles.smallLabel}>
                        {t("teams.record.timeLabel")}
                      </Text>
                      <TextInput
                        testID="record-bulk-member-time"
                        style={styles.input}
                        value={mr.timeDisplayValue}
                        onChangeText={(text) => handleTimeChange(mr.id, text)}
                        placeholder={t("teams.record.timePlaceholder")}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={styles.reactionTimeField}>
                      <Text style={styles.smallLabel}>
                        {t("recordMobile.form.reactionTimeLabel")}
                      </Text>
                      {/* isRelaying による editable 分岐を意図的に持たない。
                        REACTION_TIME_MIN (apps/shared/utils/reactionTime.ts) が
                        「-1 を下限とするのはリレー引き継ぎのマイナス反応を許容するため」
                        と明記している通り、RT はリレーの引き継ぎでこそ意味を持つ値であり、
                        isRelaying=true のときに入力させないのは仕様と矛盾する。保存側
                        (saveStyleRecords.ts / buildRecordWritePayload) も isRelaying による
                        reaction_time の分岐を持たず常に書き込む。過去にこの欄を
                        isRelaying で非表示にしていたのは検証の結果バグと判定され、
                        PM 裁定でこの形に戻した (代理入力でリレー引き継ぎタイムが
                        記録できない実害があった)。 */}
                      <TextInput
                        style={styles.input}
                        value={mr.reactionTime || ""}
                        onChangeText={(text) =>
                          updateMemberRecord(mr.id, { reactionTime: text })
                        }
                        onBlur={() =>
                          handleReactionTimeBlur(mr.id, mr.reactionTime || "")
                        }
                        placeholder="0.65"
                        keyboardType="decimal-pad"
                      />
                    </View>

                    <View style={styles.relayField}>
                      <Text style={styles.smallLabel}>
                        {t("teams.record.relay")}
                      </Text>
                      <View style={styles.relaySwitchRow}>
                        <Switch
                          value={mr.isRelaying}
                          onValueChange={(v) =>
                            updateMemberRecord(mr.id, { isRelaying: v })
                          }
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.field}>
                    <View style={styles.splitTimeHeader}>
                      <Text style={styles.smallLabel}>
                        {t("teams.record.splitTimeLabel")}
                      </Text>
                      <View style={styles.splitTimeButtons}>
                        <Pressable
                          style={[
                            styles.addSplitButton,
                            !hasDistance && styles.addButtonDisabled,
                          ]}
                          onPress={() => addSplitTimesAtInterval(mr.id, 25)}
                          disabled={!hasDistance}
                        >
                          <Text style={styles.addSplitButtonText}>
                            {t("recordMobile.form.addEvery25m")}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.addSplitButton,
                            !hasDistance && styles.addButtonDisabled,
                          ]}
                          onPress={() => addSplitTimesAtInterval(mr.id, 50)}
                          disabled={!hasDistance}
                        >
                          <Text style={styles.addSplitButtonText}>
                            {t("recordMobile.form.addEvery50m")}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={styles.addSplitButton}
                          onPress={() => addSplitTime(mr.id)}
                        >
                          <Text style={styles.addSplitButtonText}>
                            {t("recordMobile.form.addButton")}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    {[...mr.splitTimes]
                      .sort((a, b) => {
                        const da =
                          typeof a.distance === "number" ? a.distance : 0;
                        const db =
                          typeof b.distance === "number" ? b.distance : 0;
                        return da - db;
                      })
                      .map((split) => (
                        <View key={split.id} style={styles.splitRow}>
                          <TextInput
                            style={[styles.input, styles.splitDistance]}
                            value={
                              split.distance > 0 ? String(split.distance) : ""
                            }
                            onChangeText={(text) => {
                              if (text === "" || /^\d+(\.\d*)?$/.test(text)) {
                                updateSplitTime(
                                  mr.id,
                                  split.id,
                                  "distance",
                                  text,
                                );
                              }
                            }}
                            placeholder={t(
                              "teams.record.splitDistancePlaceholder",
                            )}
                            keyboardType="decimal-pad"
                          />
                          <Text style={styles.splitSeparator}>m:</Text>
                          <TextInput
                            style={[styles.input, styles.splitTime]}
                            value={split.displayValue}
                            onChangeText={(text) =>
                              updateSplitTime(
                                mr.id,
                                split.id,
                                "splitTime",
                                text,
                              )
                            }
                            placeholder={t("teams.record.splitTimePlaceholder")}
                            keyboardType="decimal-pad"
                          />
                          <Pressable
                            style={styles.removeSplitBtn}
                            onPress={() => removeSplitTime(mr.id, split.id)}
                          >
                            <Feather name="trash-2" size={16} color="#EF4444" />
                          </Pressable>
                        </View>
                      ))}
                    {!isPremium &&
                      countBillableSplitTimes(mr.splitTimes) >=
                        FREE_PLAN_LIMITS.SPLIT_TIMES_PER_RECORD && (
                        <View style={styles.premiumBadgeWrap}>
                          <PremiumBadge feature="split_time_limit" compact />
                        </View>
                      )}

                    <LapTimeDisplay
                      splitTimes={mr.splitTimes.map((st) => ({
                        distance:
                          typeof st.distance === "number" ? st.distance : "",
                        splitTime: st.splitTime,
                      }))}
                      raceDistance={selectedStyle?.distance}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.smallLabel}>
                      {t("teams.record.memoLabel")}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={mr.note}
                      onChangeText={(text) =>
                        updateMemberRecord(mr.id, { note: text })
                      }
                      placeholder={t("teams.record.memoPlaceholder")}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.smallLabel}>
                      {t("teams.record.videoSelect")}
                    </Text>
                    {isPremium ? (
                      <VideoUploader
                        type="record"
                        isPremium={isPremium}
                        existingVideoPath={
                          data.existingRecords.find((r) => r.id === mr.id)
                            ?.video_path ?? null
                        }
                        existingThumbnailPath={
                          data.existingRecords.find((r) => r.id === mr.id)
                            ?.video_thumbnail_path ?? null
                        }
                        onPendingVideoAsset={(asset) =>
                          updateMemberRecord(mr.id, { videoAsset: asset })
                        }
                      />
                    ) : (
                      <PremiumBadge feature="video_upload" compact />
                    )}
                  </View>
                </View>
              );
            })}

          {!isRelayEntry && memberGroups.length > 0 && (
            <Pressable
              testID="record-add-heat-button"
              style={[styles.addHeatButton, saving && styles.addButtonDisabled]}
              onPress={addHeatForActivePlayer}
              disabled={saving}
            >
              <Feather name="plus" size={16} color="#2563EB" />
              <Text style={styles.addHeatButtonText}>
                {t("teams.record.addHeatButton", {
                  n: activeMemberRecords.length + 1,
                })}
              </Text>
            </Pressable>
          )}
        </ItemTabs>
      </ScrollView>

      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          style={styles.cancelFooterBtn}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Text style={styles.cancelFooterText}>
            {t("teams.record.cancelButton")}
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
            <Text style={styles.saveButtonText}>
              {t("teams.record.saveButton")}
            </Text>
          )}
        </Pressable>
      </SafeAreaView>

      <MemberSelectModal
        visible={memberModalOpen}
        teamId={teamId}
        supabase={supabase}
        members={memberSelectCandidates}
        selectedUserIds={memberGroups.map((g) => g.memberUserId)}
        onConfirm={confirmMemberSelection}
        onCancel={() => setMemberModalOpen(false)}
      />

      <SlideUpModal
        visible={!!legPicker}
        backdropAccessibilityLabel={t("common.close")}
        onClose={() => setLegPicker(null)}
        overlayColor="rgba(0,0,0,0.4)"
        sheetStyle={[
          styles.pickerSheet,
          { paddingBottom: getSafeFooterPadding(16, insets.bottom) },
        ]}
      >
        <View style={styles.pickerSheetHeader}>
          <Text style={styles.pickerSheetTitle}>
            {t("teams.record.relaySwimmerPlaceholder")}
          </Text>
          <Pressable onPress={() => setLegPicker(null)} hitSlop={8}>
            <Feather name="x" size={22} color="#6B7280" />
          </Pressable>
        </View>
        <ScrollView>
          {memberSelectCandidates.map((m) => (
            <Pressable
              key={`leg-opt-${m.user_id}`}
              style={styles.pickerOption}
              onPress={() => {
                if (legPicker) {
                  updateMemberRecordByIndex(legPicker.legIndex, {
                    memberUserId: m.user_id,
                    memberName: m.users?.name || "",
                  });
                }
                setLegPicker(null);
              }}
            >
              <Text style={styles.pickerOptionText}>
                {m.users?.name || t("teams.mobile.unnamedMember")}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </SlideUpModal>
    </FormKeyboardAvoidingView>
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
    marginBottom: 16,
  },
  compHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  compTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  compSubtitle: { fontSize: 16, color: "#111827", fontWeight: "700" },
  compHeaderTitle: { flex: 1, flexShrink: 1 },
  emptyMembersContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 12,
  },
  emptyMembersText: { fontSize: 14, color: "#6B7280" },
  heatNumberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  heatNumberLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  removeHeatBtn: { padding: 4 },
  addHeatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 8,
    borderStyle: "dashed",
    paddingVertical: 10,
    marginTop: 8,
  },
  addHeatButtonText: { fontSize: 14, fontWeight: "600", color: "#2563EB" },
  field: { marginBottom: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6 },
  smallLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 4,
  },
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
  relaySection: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  subHeader: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 10,
  },
  legCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  legLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1D4ED8",
    marginBottom: 6,
  },
  rtField: { marginTop: 8 },
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
  memberCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 10,
  },
  entryTimeBadge: {
    backgroundColor: "#DBEAFE",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  entryTimeBadgeText: { fontSize: 12, color: "#1D4ED8" },
  bestTimeBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  bestTimeBadgeText: { fontSize: 12, color: "#15803D" },
  // タイム / リアクション / リレー の1行レイアウト (参照元 CompetitionTabFormScreen.tsx の
  // timeReactionRow 一式をそのまま移植)。命名も参照元に合わせる。
  timeReactionRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  timeField: {
    flex: 1,
  },
  reactionTimeField: {
    flex: 1,
    maxWidth: "25%",
  },
  relayField: {
    alignItems: "flex-start",
  },
  relaySwitchRow: {
    flex: 1,
    justifyContent: "center",
  },
  // スプリット追加ボタン (個人種目メンバーカード・リレー種目共通。3つとも同じ outline
  // スタイルに統一。参照元 CompetitionTabFormScreen.tsx の addSplitButton 一式をそのまま移植)
  splitTimeHeader: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 4,
    marginBottom: 8,
  },
  splitTimeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  addSplitButton: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
  },
  addSplitButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  splitDistance: { width: 80 },
  splitSeparator: { fontSize: 14, color: "#6B7280" },
  splitTime: { flex: 1 },
  removeSplitBtn: { padding: 4 },
  premiumBadgeWrap: { marginTop: 8 },
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
  // paddingBottom はここに置かない。Android edge-to-edge の bottom inset を
  // 取り込む必要があるため、呼び出し側で getSafeFooterPadding(16, insets.bottom)
  // を sheetStyle 配列に重ねて指定している (基準値 16 の定義元はそちら)。
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
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
});
