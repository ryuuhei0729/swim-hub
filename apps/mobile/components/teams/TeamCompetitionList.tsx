import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { format } from "date-fns";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation,
} from "@apps/shared/hooks/queries/teams";
import { useUpdateCompetitionMutation } from "@apps/shared/hooks/queries/records";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import type { Competition, EntryWithDetails } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";
import { useDateLocale } from "@/hooks/useDateLocale";
import { formatDate, isCompetitionDateInPast } from "@apps/shared/utils/date";
import { resolveEntryStatus } from "@apps/shared/utils/entryStatus";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { isEntryTabVisible } from "@/utils/tabFormUtils";
import { TeamCompetitionEntryModal } from "./TeamCompetitionEntryModal";
import { TeamCompetitionRecordsModal } from "./TeamCompetitionRecordsModal";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

type EntryStatus = "before" | "open" | "closed";

const ENTRY_STATUS_BADGE: Record<EntryStatus, { container: object; text: { color: string } }> = {
  before: { container: { backgroundColor: "#F3F4F6" }, text: { color: "#374151" } },
  open: { container: { backgroundColor: "#DCFCE7" }, text: { color: "#166534" } },
  closed: { container: { backgroundColor: "#FEE2E2" }, text: { color: "#991B1B" } },
};

// admin のカード上プルダウンで表示する3択の順序 (受付前 → 受付中 → 受付終了)
const STATUS_ORDER: EntryStatus[] = ["before", "open", "closed"];

// 既存の teamCompetitionEntryModal.confirm{Before,Open,Closed} キーを再構築するための対応表
// (新規 i18n キーを増やさず、既存の確認ダイアログ文言を再利用する)
const CONFIRM_KEY_SUFFIX: Record<EntryStatus, string> = {
  before: "Before",
  open: "Open",
  closed: "Closed",
};

interface TeamCompetitionListProps {
  teamId: string;
  isAdmin: boolean;
}

const CompetitionItem = React.memo(function CompetitionItem({
  competition,
  teamId,
  isAdmin,
  onEdit,
  onDelete,
  onEntry,
  onRecord,
  onOpenRecords,
}: {
  competition: Competition;
  teamId: string;
  isAdmin: boolean;
  onEdit: (competition: Competition) => void;
  onDelete: (competition: Competition) => void;
  onEntry: (competition: Competition) => void;
  onRecord: (competition: Competition) => void;
  onOpenRecords: (competition: Competition) => void;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { supabase } = useAuth();
  const queryClient = useQueryClient();
  const updateStatusMutation = useUpdateCompetitionMutation(supabase);

  const poolLabel =
    competition.pool_type === 1
      ? t("teams.mobile.poolTypeLong")
      : t("teams.mobile.poolTypeShort");
  // D-1: place の有無に関わらず水路情報(半角括弧、i18nキー新設なし)を残す。
  // pool_type: 0 = 短水路(25m) / 1 = 長水路(50m) (逆転させないこと)
  const poolTypeParen = competition.pool_type === 1 ? "(50m)" : "(25m)";
  const resolvedEntryStatus = resolveEntryStatus(competition.date, competition.entry_status);
  // D-3: 保存確定までの楽観的表示上書き。resolvedEntryStatus が追いついたら自動でクリアする。
  const [statusOverride, setStatusOverride] = useState<EntryStatus | null>(null);
  const displayedEntryStatus = statusOverride ?? resolvedEntryStatus;
  const badge = ENTRY_STATUS_BADGE[displayedEntryStatus];
  const entryStatusLabel = t(`teams.competitions.entryStatus.${displayedEntryStatus}`);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const isSavingStatus = updateStatusMutation.isPending;
  // 過去大会 (昨日以前) はエントリー導線を無効化する (web とのパリティ)。
  // 今日・未来日は表示/タップ可能のまま維持する。
  const isPastCompetition = isCompetitionDateInPast(competition.date);

  useEffect(() => {
    if (statusOverride !== null && resolvedEntryStatus === statusOverride) {
      setStatusOverride(null);
    }
  }, [resolvedEntryStatus, statusOverride]);

  const performStatusChange = useCallback(
    async (next: EntryStatus) => {
      // 再入防止 (ロジックガード)。バッジ/メニュー項目の disabled は isSavingStatus
      // (= updateStatusMutation.isPending) の再レンダー反映を待つため、反映前の一瞬の隙を
      // 突いて再度呼ばれても、実際に mutation が進行中なら何もしない。
      if (updateStatusMutation.isPending) return;
      const previous = displayedEntryStatus;
      setStatusOverride(next);
      setIsStatusMenuOpen(false);
      try {
        await updateStatusMutation.mutateAsync({
          id: competition.id,
          updates: { entry_status: next },
        });
        // 既存 mutation の onSuccess は recordKeys のみ更新するため、
        // チーム大会一覧キーを明示的に無効化してバッジを再表示させる
        queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamId) });
      } catch (err) {
        // 失敗時はロールバック
        setStatusOverride(previous);
        console.error("TeamCompetitionList: failed to update entry_status", err);
        const msg = toUserFacingMessage(err, t("teams.mobile.teamCompetitionEntryModal.saveFailed"));
        Alert.alert(t("common.error"), msg, [{ text: t("common.ok") }]);
      }
    },
    [
      displayedEntryStatus,
      updateStatusMutation,
      competition.id,
      queryClient,
      teamId,
      t,
      setIsStatusMenuOpen,
    ],
  );

  const handleStatusOptionPress = useCallback(
    (next: EntryStatus) => {
      // 同一値の選択は no-op (確認ダイアログもmutationも発火しない)
      if (next === displayedEntryStatus) return;
      Alert.alert(
        t("teams.mobile.teamCompetitionEntryModal.confirmTitle"),
        t(`teams.mobile.teamCompetitionEntryModal.confirm${CONFIRM_KEY_SUFFIX[next]}`),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.ok"), onPress: () => performStatusChange(next) },
        ],
      );
    },
    [displayedEntryStatus, performStatusChange, t],
  );

  return (
    // Android 対策: statusMenuPanel/statusRow に zIndex+elevation を与えるだけでは
    // FlatList 内の「後からレンダーされる次のカード」を追い越せない (RN Android は
    // elevation を持つ View の描画順を zIndex の相対順序より優先することがある)。
    // ドロップダウンを開いている間だけカード全体 (item) を持ち上げ、カードごと
    // 後続カードより前面に出す。zIndex のみだと Android の elevation 優先描画で
    // 追い越せないため、elevation も併せて底上げする。iOS は elevation を無視し、
    // 影の見た目 (shadowColor/Offset/Opacity/Radius) はここで変更していないため
    // 副作用は出ない。
    <Pressable
      style={[styles.item, isStatusMenuOpen && styles.itemElevated]}
      onPress={() => onOpenRecords(competition)}
      // Critical 対応: accessible を明示しないと Pressable は既定で true になり、
      // 配下 (編集/削除/ステータス変更/代理入力等) がスクリーンリーダー上で1つの
      // 不透明なボタンに畳み込まれ、個別要素にフォーカスできなくなる。
      // カード全体は AT から見えなくし、タイトル行の Pressable だけを唯一の
      // エントリポイントにする (既存実例: BottomSheet.tsx の grabHandleRow)。
      // accessible={false} の要素は accessibility tree に現れないため
      // accessibilityRole は無効になる。誤解を招くので付けない。
      accessible={false}
    >
      {/* D-4: 各アクションは独立した Pressable としてネストしている。react-native
          モックが実機同様に最深要素でタッチを専有するため、カード全体を Pressable
          にしてもアクションボタンへの誤爆は発生しない。 */}
      <View style={styles.itemHeader}>
        <Pressable
          style={styles.itemTitleRow}
          onPress={() => onOpenRecords(competition)}
          accessibilityRole="button"
          accessibilityLabel={t("teams.mobile.teamCompetitionList.viewRecordsAria", {
            title: competition.title || t("teams.mobile.fallbackCompetitionTitle"),
          })}
        >
          <Feather name="award" size={14} color="#2563EB" />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {competition.title || t("teams.mobile.fallbackCompetitionTitle")}
          </Text>
        </Pressable>
        {isAdmin && (
          <View style={styles.itemActions}>
            <Pressable
              style={styles.editButton}
              onPress={() => onEdit(competition)}
              accessibilityRole="button"
              accessibilityLabel={t("common.edit")}
            >
              <Feather name="edit-2" size={14} color="#2563EB" />
            </Pressable>
            <Pressable
              style={styles.deleteButton}
              onPress={() => onDelete(competition)}
              accessibilityRole="button"
              accessibilityLabel={t("common.delete")}
            >
              <Feather name="trash-2" size={14} color="#DC2626" />
            </Pressable>
          </View>
        )}
      </View>

      {isAdmin ? (
        // レイアウト要望 (ユーザー承認済み): admin ビューも利用者ビューと同じ左右分割
        // (情報ブロック左 / ボタン群右、上:記録系・下:エントリー系) に揃える。
        <View style={styles.itemBodyRow}>
          <View style={styles.itemInfoColumn}>
            <View style={styles.itemRow}>
              <Feather name="calendar" size={12} color="#9CA3AF" />
              <Text style={styles.itemDate}>{formatDate(competition.date, "longWithWeekday", dateLocale)}</Text>
            </View>

            {competition.place ? (
              <View style={styles.itemRow}>
                <Feather name="map-pin" size={12} color="#9CA3AF" />
                <Text style={styles.itemPlace}>
                  {competition.place} {poolTypeParen}
                </Text>
              </View>
            ) : (
              <View style={styles.itemRow}>
                <Feather name="droplet" size={12} color="#9CA3AF" />
                <Text style={styles.itemMeta}>
                  {poolLabel} {poolTypeParen}
                </Text>
              </View>
            )}

            {competition.note && (
              <Text style={styles.itemNote} numberOfLines={2}>{competition.note}</Text>
            )}

            {/* D-2: 過去大会 (今日は含まない) は受付ステータス行そのものを描画しない */}
            {!isPastCompetition && (
              <View style={styles.statusRow}>
                <View style={styles.statusDropdownWrapper}>
                  <Pressable
                    style={[
                      styles.entryStatusBadge,
                      styles.entryStatusBadgeAdmin,
                      badge.container,
                      isSavingStatus && styles.statusMenuItemDisabled,
                    ]}
                    onPress={() => setIsStatusMenuOpen((prev) => !prev)}
                    disabled={isSavingStatus}
                    accessibilityRole="button"
                    accessibilityLabel={t("teams.mobile.teamCompetitionList.entryStatusChangeAria", {
                      status: entryStatusLabel,
                    })}
                    accessibilityState={{ expanded: isStatusMenuOpen, disabled: isSavingStatus }}
                    hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
                  >
                    <Text style={[styles.entryStatusBadgeText, badge.text]}>{entryStatusLabel}</Text>
                    <Feather name="chevron-down" size={12} color={badge.text.color} />
                  </Pressable>
                  {isStatusMenuOpen && (
                    // High 対応: 外殻カードが Pressable になったことで、パネル内の
                    // 選択肢間の余白 (ハンドラを持たない要素) をタップすると祖先の
                    // onOpenRecords まで浮上してしまう (statusMenuBackdrop はパネルを
                    // 覆っていないため拾えない)。パネル自体を no-op Pressable にして
                    // 委譲を遮断する。
                    <Pressable
                      style={styles.statusMenuPanel}
                      onPress={() => {}}
                      // accessible={false} で AT から隠すため accessibilityRole は付けない
                      // (付けても accessibility tree に現れず無効。誤解を招く記述を避ける)。
                      accessible={false}
                    >
                      {STATUS_ORDER.map((s) => {
                        const active = s === displayedEntryStatus;
                        const optionLabel = t(`teams.competitions.entryStatus.${s}`);
                        return (
                          <Pressable
                            key={s}
                            style={[styles.statusMenuItem, isSavingStatus && styles.statusMenuItemDisabled]}
                            onPress={() => handleStatusOptionPress(s)}
                            disabled={isSavingStatus}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active, disabled: isSavingStatus }}
                            accessibilityLabel={t(
                              "teams.mobile.teamCompetitionEntryModal.changeStatusAria",
                              { status: optionLabel },
                            )}
                          >
                            <Text
                              style={[
                                styles.statusMenuItemText,
                                active && styles.statusMenuItemTextActive,
                              ]}
                            >
                              {optionLabel}
                            </Text>
                            {active && <Feather name="check" size={14} color="#2563EB" />}
                          </Pressable>
                        );
                      })}
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
          {/* Reviewer 指摘対応: statusMenuPanel (zIndex 20) は左の itemInfoColumn から
              右へはみ出して開く。itemInfoColumn に itemButtonColumn より高い zIndex
              (下記 itemInfoColumn 定義) を与えて視覚的にボタン列より前面にし、
              加えて展開中は pointerEvents="none" でボタン列自体のタップを無効化する
              (パネルの実際の描画幅がボタンを覆いきらない場合でも誤タップを防ぐ)。 */}
          <View
            style={styles.itemButtonColumn}
            pointerEvents={isStatusMenuOpen ? "none" : "auto"}
          >
            {/* PM 裁定 R3: admin の未来日ボタンは非admin と同じ「エントリー」(このモーダルを
                開く) に統一する。代理入力への導線はモーダル内の「エントリーを代理入力」
                ボタンに移動した (カード上に代理入力ボタンは残さない)。
                それ以外(今日・過去・null・空文字・不正日付)は記録代理入力ボタンのみを排他表示する。
                isEntryTabVisible は「未来のみ true」を保証するため、フォールバック側
                (記録代理入力ボタン)に今日・過去・不正値がすべて自然に落ちる。 */}
            {isEntryTabVisible(competition.date) ? (
              <Pressable
                style={styles.entryButton}
                onPress={() => onEntry(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("teams.mobile.teamCompetitionList.entryButton")}
              >
                <Feather name="log-in" size={13} color="#2563EB" />
                <Text style={styles.entryButtonText}>
                  {t("teams.mobile.teamCompetitionList.entryButton")}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.recordButton}
                onPress={() => onRecord(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("teams.mobile.teamCompetitionList.recordBulkButton")}
              >
                <Feather name="clock" size={13} color="#059669" />
                <Text style={styles.recordButtonText}>
                  {t("teams.mobile.teamCompetitionList.recordBulkButton")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        // レイアウト要望: 利用者ビューのみ、情報ブロック (日付/場所/水路/受付ステータス) と
        // ボタン群 (上:記録/下:エントリー) を左右に並べる。管理者ビューは対象外。
        <View style={styles.itemBodyRow}>
          <View style={styles.itemInfoColumn}>
            <View style={styles.itemRow}>
              <Feather name="calendar" size={12} color="#9CA3AF" />
              <Text style={styles.itemDate}>{formatDate(competition.date, "longWithWeekday", dateLocale)}</Text>
            </View>

            {competition.place ? (
              <View style={styles.itemRow}>
                <Feather name="map-pin" size={12} color="#9CA3AF" />
                <Text style={styles.itemPlace}>
                  {competition.place} {poolTypeParen}
                </Text>
              </View>
            ) : (
              <View style={styles.itemRow}>
                <Feather name="droplet" size={12} color="#9CA3AF" />
                <Text style={styles.itemMeta}>
                  {poolLabel} {poolTypeParen}
                </Text>
              </View>
            )}

            {competition.note && (
              <Text style={styles.itemNote} numberOfLines={2}>{competition.note}</Text>
            )}

            {/* D-2: 過去大会 (今日は含まない) は受付ステータス行そのものを描画しない */}
            {!isPastCompetition && (
              <View style={styles.statusRow}>
                <View style={[styles.entryStatusBadge, badge.container]}>
                  <Text style={[styles.entryStatusBadgeText, badge.text]}>{entryStatusLabel}</Text>
                </View>
              </View>
            )}
          </View>
          <View style={styles.itemButtonColumn}>
            {/* 未来日 (isEntryTabVisible=true) はエントリーボタンのみ、
                それ以外(今日・過去・null・空文字・不正日付)は記録追加ボタンのみを排他表示する。
                isEntryTabVisible は「未来のみ true」を保証するため、フォールバック側
                (記録追加ボタン)に今日・過去・不正値がすべて自然に落ちる。
                entryButton 側の中身 (アイコン/色/文言キー/onPress) は一切変更していない。 */}
            {isEntryTabVisible(competition.date) ? (
              <Pressable
                style={styles.entryButton}
                onPress={() => onEntry(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("teams.mobile.teamCompetitionList.entryButton")}
              >
                <Feather name="log-in" size={13} color="#2563EB" />
                <Text style={styles.entryButtonText}>{t("teams.mobile.teamCompetitionList.entryButton")}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.recordButton}
                onPress={() => onRecord(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("teams.mobile.teamCompetitionList.recordButton")}
              >
                <Feather name="plus" size={13} color="#059669" />
                <Text style={styles.recordButtonText}>{t("teams.mobile.teamCompetitionList.recordButton")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
      {/* D-3: カード上プルダウンの背景タップで閉じるオーバーレイ (RN Modal は使わない)。
          このオーバーレイの真の兄弟は itemHeader / itemBodyRow / (このオーバーレイ自身)
          の3つ (zIndex は兄弟間比較にしか効かないため、比較対象は常に直接の兄弟)。
          itemBodyRow に zIndex:10 (backdrop の 5 より高い) を与えているため、
          itemBodyRow の子孫である statusMenuPanel を含め、itemBodyRow 全体が
          このオーバーレイより前面に来る。itemHeader は zIndex 指定なし (=0) であり、
          真の兄弟である backdrop (5) より下位になる。これは意図的な設計であり
          (zIndex による前後関係は視覚的な重なりの有無とは独立に決まるため、
          「重ならないから問題ない」が理由なのではない)、展開中にタイトル行や
          編集/削除アイコンをタップすると backdrop が正しく吸収してメニューを閉じ、
          本来のアクション (記録一覧を開く/編集/削除) は発火しない。
          開いている間、itemBodyRow 以外の領域 (=このオーバーレイの見えている部分) は
          タップがオーバーレイに吸収されてメニューを閉じる
          (itemButtonColumn は pointerEvents="none" でも二重に保護)。 */}
      {isStatusMenuOpen && (
        <Pressable style={styles.statusMenuBackdrop} onPress={() => setIsStatusMenuOpen(false)} />
      )}
    </Pressable>
  );
});

export function TeamCompetitionList({ teamId, isAdmin }: TeamCompetitionListProps) {
  const { supabase } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();

  const { data: competitions, isLoading, isError, error, refetch } = useTeamCompetitionsQuery(supabase, teamId);
  const deleteMutation = useDeleteTeamCompetitionMutation(supabase);

  // エントリー受付状況モーダルの対象大会
  const [entryModalCompetition, setEntryModalCompetition] = useState<Competition | null>(null);
  // D-4: 記録一覧モーダルの対象大会 (admin/非admin 問わずカード本体タップで開く)
  const [recordsModalCompetition, setRecordsModalCompetition] = useState<Competition | null>(null);

  const handleAdd = useCallback(() => {
    navigation.navigate("CompetitionForm", {
      teamId,
      date: format(new Date(), "yyyy-MM-dd"),
    });
  }, [navigation, teamId]);

  // 一括登録画面への導線（管理者ビュー専用。web admin タブの bulk-register 相当）。
  // 以前は TeamDetailScreen 側で「追加」ボタンと別行に描画していたが、実機フィードバックを
  // 受けてヘッダー行内で「追加」の左に並べる (isAdmin の表示条件は addButton と同一)
  const handleBulkRegister = useCallback(() => {
    navigation.navigate("TeamBulkRegister", { teamId });
  }, [navigation, teamId]);

  const handleEdit = useCallback((competition: Competition) => {
    navigation.navigate("CompetitionForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
    });
  }, [navigation, teamId]);

  // 「エントリー」ボタン: PM 裁定 R3 により admin/非admin 共通でエントリー一覧モーダルを開く
  // (admin も最初に見るのは代理入力ボタンではなく、このモーダル)。
  const handleEntry = useCallback((competition: Competition) => {
    setEntryModalCompetition(competition);
  }, []);

  // モーダル内の「エントリーを追加」(非admin): 既存の選手セルフエントリー画面へ遷移（機能維持）。
  // web (apps/web/components/team/TeamCompetitionEntryModal.tsx の canEditOrDeleteEntry) も
  // 受付中(open)の大会でのみ自分のエントリー導線を表示する方針であり、これに揃えて
  // 受付中以外では導線を出さない（モーダル側で非表示だが二重ガード）。
  const handleSelfEntry = useCallback((competition: Competition, currentStatus: EntryStatus) => {
    // モーダルが表示している status（resolveEntryStatus の結果をそのまま保持した値。R5 で
    // モーダル内の楽観的更新自体は削除済み）でガードする。
    // この関数の引数 competition はモーダルを開いた時点でクローズオーバーした値であり、
    // モーダルが開いている間に受付状況が変わった場合 competition.entry_status は
    // 再フェッチ前の stale な値になりうるため使わない（dead-click 防止）。
    if (currentStatus !== "open") return;
    setEntryModalCompetition(null);
    navigation.navigate("CompetitionTabForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
      initialTab: "entry",
    });
  }, [navigation, teamId]);

  // モーダル内の「エントリーを代理入力」(admin 専用、要件B後半): 管理者代理一括入力画面へ遷移する。
  // PM 裁定 R3 によりカード上の代理入力ボタンは撤去され、この導線はモーダル内に一本化された。
  const handleEntryBulk = useCallback((competition: Competition) => {
    if (isAdmin) {
      setEntryModalCompetition(null);
      navigation.navigate("TeamEntryBulkForm", {
        competitionId: competition.id,
        teamId,
      });
    }
  }, [navigation, teamId, isAdmin]);

  // モーダル内、自分のエントリー行の編集アイコン (要件A / R6・D9): 既存の CompetitionTabFormScreen
  // (entry タブ) へ遷移する。同画面はログイン中ユーザーの既存エントリーを user_id で
  // プリフィルする実装を既に持つため、行ごとの entryId 自体は渡さないが、D9 により
  // 「どの項目タブを開くか」の解決に entry.id (targetEntryId) を渡す。style_id では引かない
  // (リレーのレグ別行は同一 style が複数行に現れうるため)。
  const handleEditEntry = useCallback(
    (competition: Competition, entry: EntryWithDetails) => {
      setEntryModalCompetition(null);
      navigation.navigate("CompetitionTabForm", {
        competitionId: competition.id,
        date: competition.date,
        teamId,
        initialTab: "entry",
        targetEntryId: entry.id,
      });
    },
    [navigation, teamId],
  );

  const handleRecord = useCallback((competition: Competition) => {
    // admin は一括代理入力画面へ、非 admin は個人フロー(CompetitionTabForm)へ分岐。
    // team_id の有無に関わらず既存レコードを読み込む CompetitionTabForm に統一する
    // (useDayDetailHandlers.handleEditRecord と同じ方針。旧 RecordLogForm 画面は recordId
    // 未指定だと既存レコードを検索せず重複作成を招く経路だったため、この統一に伴い画面/ルート
    // ごと削除済み。ここから遷移する余地は無い)。
    if (isAdmin) {
      navigation.navigate("TeamRecordBulkForm", {
        competitionId: competition.id,
        teamId,
      });
      return;
    }
    navigation.navigate("CompetitionTabForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
      initialTab: "record",
    });
  }, [navigation, teamId, isAdmin]);

  // D-4: カード本体タップ (admin/非admin 問わず) で記録一覧モーダルを開く。
  // 従来この Pressable は onEdit を呼んでいたが、編集は編集アイコンに一本化されたため
  // 記録一覧モーダルを開く導線に置き換える。
  const handleOpenRecords = useCallback((competition: Competition) => {
    setRecordsModalCompetition(competition);
  }, []);

  const handleDelete = useCallback((competition: Competition) => {
    Alert.alert(
      t("teams.mobile.deleteConfirmTitle"),
      t("teams.mobile.teamCompetitionList.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: competition.id, teamId });
            } catch {
              Alert.alert(t("common.error"), t("teams.mobile.teamCompetitionList.deleteFailed"), [
                { text: "OK" },
              ]);
            }
          },
        },
      ],
    );
  }, [deleteMutation, teamId, t]);

  const renderItem = useCallback(({ item }: { item: Competition }) => (
    <CompetitionItem
      competition={item}
      teamId={teamId}
      isAdmin={isAdmin}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onEntry={handleEntry}
      onRecord={handleRecord}
      onOpenRecords={handleOpenRecords}
    />
  ), [
    teamId,
    isAdmin,
    handleEdit,
    handleDelete,
    handleEntry,
    handleRecord,
    handleOpenRecords,
  ]);

  const keyExtractor = useCallback((item: Competition) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t("teams.mobile.loadingShort")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={styles.errorText}>
          {error?.message || t("teams.mobile.teamCompetitionList.fetchFailed")}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  const items = competitions ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {t("teams.mobile.teamCompetitionList.title", { count: items.length })}
        </Text>
        {isAdmin && (
          <View style={styles.headerActions}>
            <Pressable
              style={styles.bulkRegisterButton}
              onPress={handleBulkRegister}
              accessibilityRole="button"
              accessibilityLabel={t("teamsAdmin.tabs.bulkRegister")}
            >
              <Feather name="upload" size={14} color="#2563EB" />
              <Text style={styles.bulkRegisterButtonText}>
                {t("teamsAdmin.tabs.bulkRegister")}
              </Text>
            </Pressable>
            <Pressable style={styles.addButton} onPress={handleAdd} accessibilityRole="button">
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addButtonText}>
                {t("teams.mobile.teamCompetitionList.addButton")}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="award" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>{t("teams.mobile.teamCompetitionList.empty")}</Text>
          {isAdmin && (
            <Pressable style={styles.emptyAddButton} onPress={handleAdd}>
              <Text style={styles.emptyAddButtonText}>
                {t("teams.mobile.teamCompetitionList.addButton")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {entryModalCompetition && (
        <TeamCompetitionEntryModal
          visible={entryModalCompetition !== null}
          onClose={() => setEntryModalCompetition(null)}
          competitionId={entryModalCompetition.id}
          competitionTitle={
            entryModalCompetition.title || t("teams.mobile.fallbackCompetitionTitle")
          }
          // PM 裁定 R1: 生の entry_status ではなく、大会日が過去かどうかを織り込んだ
          // 実効ステータス (resolveEntryStatus の戻り値) を渡す。モーダル内の行単位の
          // 編集/削除アイコン表示判定・セルフエントリー導線もこの値を基準にする。
          entryStatus={resolveEntryStatus(
            entryModalCompetition.date,
            entryModalCompetition.entry_status,
          )}
          isAdmin={isAdmin}
          onSelfEntry={(currentStatus) => handleSelfEntry(entryModalCompetition, currentStatus)}
          onEditEntry={(entry) => handleEditEntry(entryModalCompetition, entry)}
          onAdminBulkEntry={() => handleEntryBulk(entryModalCompetition)}
        />
      )}

      {recordsModalCompetition && (
        <TeamCompetitionRecordsModal
          visible={recordsModalCompetition !== null}
          onClose={() => setRecordsModalCompetition(null)}
          competitionId={recordsModalCompetition.id}
          competitionTitle={
            recordsModalCompetition.title || t("teams.mobile.fallbackCompetitionTitle")
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
    marginRight: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  bulkRegisterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
  },
  bulkRegisterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  item: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  // D-3: ステータスプルダウンを開いている間だけカード全体に適用する。
  // shadowColor/shadowOffset/shadowOpacity/shadowRadius (iOS の影の見た目) はここでは
  // 変更しない。zIndex/elevation のみで前後関係を制御する (iOS は elevation を無視する)。
  itemElevated: {
    zIndex: 30,
    elevation: 4,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  entryStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  entryStatusBadgeAdmin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  entryStatusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  itemDate: {
    fontSize: 13,
    color: "#374151",
  },
  itemPlace: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemNote: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    marginTop: 8,
    // D-3: プルダウン展開時、下の背景タップ用オーバーレイより前面に来るようにする
    zIndex: 10,
  },
  statusDropdownWrapper: {
    position: "relative",
  },
  statusMenuPanel: {
    position: "absolute",
    top: "100%",
    left: 0,
    marginTop: 4,
    minWidth: 150,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  statusMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statusMenuItemDisabled: {
    opacity: 0.5,
  },
  statusMenuItemText: {
    fontSize: 13,
    color: "#374151",
  },
  statusMenuItemTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  statusMenuBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
  },
  // レイアウト要望: 情報ブロックとボタン群を左右に並べる (admin/非admin 共通)
  itemBodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    // Critical 対応: zIndex は兄弟間の順序にしか効かず、祖先の順位を子に代行させる
    // ことはできない (子は親の兄弟を追い越せない)。statusMenuBackdrop (zIndex 5) の
    // 真の兄弟はこの itemBodyRow 自身であり、その子孫の itemInfoColumn/statusMenuPanel
    // ではないため、backdrop を上回るための zIndex はここに置く必要がある。
    zIndex: 10,
  },
  itemInfoColumn: {
    flex: 1,
    // これは itemBodyRow の zIndex (上記、backdrop 用) とは別目的。
    // itemButtonColumn (zIndex 指定なし=0) という「itemBodyRow の内側の兄弟」との
    // 比較にのみ効く値で、admin の statusMenuPanel が右のボタン列より前面に
    // 描画されるようにする (非admin はプルダウンが無いため実質無害)。
    zIndex: 10,
  },
  itemButtonColumn: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 8,
  },
  entryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  entryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#059669",
  },
  recordButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptyAddButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
