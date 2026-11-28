"use client";

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { ALWAYS_REVALIDATE, getCachedQueryStatus } from "@/hooks/cachedQuery";
import { teamDetailKeys } from "@/hooks/teamDetailQueries";
import {
  formatTime,
  formatTimeAverage,
  formatCircleTime,
  getStyleLabel,
  getTextColorForBackground,
} from "@/utils/formatters";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import {
  buildPracticeMenuGroups,
  type MemberTimesRow,
  type PracticeMenuGroup,
  type PracticeTimesDetail,
} from "@apps/shared/utils/teamPracticeTimes";
import { MemberAvatar } from "./MemberAvatar";

interface TeamPracticeTimesModalProps {
  visible: boolean;
  onClose: () => void;
  practiceId: string;
  /** シート上部に出す見出し (日付 + 練習名)。末尾に「のタイム」を付けて表示する */
  heading: string;
}

const AVATAR_SIZE = 28;

/** 1 行に並べるタイムの数。横幅いっぱいを 4 等分する */
const TIMES_PER_ROW = 4;

/**
 * 1 本ずつのタイムを 4 列のグリッドで並べる。5 本目からは次の行に折り返す。
 * その人の最速タイムは青い太字にする (入力が 2 本以上あるときだけ。1 本だけだと比べる相手がいない)。
 */
function TimesGrid({
  times,
  fastest,
  highlight,
}: {
  times: (number | null)[];
  fastest: number | null;
  highlight: boolean;
}) {
  return (
    <View style={styles.timesGrid}>
      {times.map((time, index) => {
        const isFastest = highlight && time !== null && time === fastest;
        return (
          // 本数とセットの中の位置は固定なので index をキーにしてよい
          <View key={index} style={styles.timeCellWrap}>
            <View style={styles.timeCell}>
              <Text
                style={[styles.timeCellText, isFastest && styles.timeCellTextFastest]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {time === null ? "-" : formatTime(time)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MemberRow({
  member,
  setCount,
  isSelf,
}: {
  member: MemberTimesRow;
  setCount: number;
  isSelf: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const hasTimes = member.average !== null;
  const highlightFastest = member.recordedCount >= 2;

  const subParts: string[] = [];
  if (!hasTimes) {
    subParts.push(t("teams.practiceTimes.noTime"));
  } else {
    if (member.fastest !== null) {
      subParts.push(
        t("teams.practiceTimes.fastest", { time: formatTime(member.fastest) }),
      );
    }
    if (member.recordedCount < member.totalCount) {
      subParts.push(
        t("teams.practiceTimes.recordedCount", {
          recorded: member.recordedCount,
          total: member.totalCount,
        }),
      );
    }
  }

  const averageText = member.average === null ? "-" : formatTimeAverage(member.average);

  const mainContent = (
    <>
      <MemberAvatar path={member.avatarPath} name={member.name} size={AVATAR_SIZE} />
      <View style={styles.memberNameBlock}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name}
        </Text>
        {subParts.length > 0 && (
          <Text style={styles.memberSubText} numberOfLines={1}>
            {subParts.join(" · ")}
          </Text>
        )}
      </View>
      <View style={styles.memberAverageBlock}>
        {hasTimes && (
          <Text style={styles.memberAverageLabel}>
            {t("teams.practiceTimes.averageLabel")}
          </Text>
        )}
        <Text style={[styles.memberAverage, !hasTimes && styles.memberAverageEmpty]}>
          {averageText}
        </Text>
      </View>
    </>
  );

  return (
    <View style={[styles.memberRowWrap, isSelf && styles.memberRowSelf]}>
      {hasTimes ? (
        <Pressable
          style={styles.memberRow}
          onPress={() => setOpen((prev) => !prev)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={t("teams.practiceTimes.rowAria", {
            name: member.name,
            time: averageText,
          })}
          testID={`practice-times-row-${member.logId}`}
        >
          {mainContent}
          <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color="#2563EB" />
        </Pressable>
      ) : (
        <View style={styles.memberRow} testID={`practice-times-row-${member.logId}`}>
          {mainContent}
          {/* 開ける行と時間の列を揃えるため、矢印と同じ幅だけ空ける */}
          <View style={styles.chevronSpacer} />
        </View>
      )}

      {open && hasTimes && (
        <View style={styles.memberDetail}>
          {member.sets.map((set) => (
            <View key={set.setNumber} style={styles.setBlock}>
              {setCount > 1 && (
                <View style={styles.setHeader}>
                  <Text style={styles.setLabel}>
                    {t("teams.practiceTimes.setLabel", { set: set.setNumber })}
                  </Text>
                  {set.average !== null && (
                    <Text style={styles.setAverage}>
                      {t("teams.practiceTimes.setAverage", {
                        time: formatTimeAverage(set.average),
                      })}
                    </Text>
                  )}
                </View>
              )}
              <TimesGrid
                times={set.times}
                fastest={member.fastest}
                highlight={highlightFastest}
              />
            </View>
          ))}
          {member.note && (
            <View style={styles.memberNote}>
              <Feather name="edit-2" size={12} color="#6B7280" />
              <Text style={styles.memberNoteText}>{member.note}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function MenuGroupCard({
  group,
  currentUserId,
}: {
  group: PracticeMenuGroup;
  currentUserId: string | undefined;
}) {
  const { t } = useTranslation();

  const menuParts = [
    `${group.distance}m × ${group.repCount}${t("common.units.reps")}` +
      (group.setCount > 1 ? ` × ${group.setCount}${t("common.units.sets")}` : ""),
    group.circle ? formatCircleTime(group.circle) : null,
    getStyleLabel(group.style, t),
    group.swimCategory && group.swimCategory !== "Swim" ? group.swimCategory : null,
  ].filter((part): part is string => !!part);

  return (
    <View style={styles.menuGroup}>
      <View style={styles.menuHeader}>
        <View style={styles.menuBar} />
        <Text style={styles.menuTitle}>{menuParts.join("  ")}</Text>
        <Text style={styles.menuCount}>
          {t("teams.practiceTimes.memberCount", { count: group.members.length })}
        </Text>
      </View>

      {group.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {group.tags.map((tag) => {
            const background = tag.color || "#E5E7EB";
            return (
              <View key={tag.id} style={[styles.tag, { backgroundColor: background }]}>
                <Text style={[styles.tagText, { color: getTextColorForBackground(background) }]}>
                  {tag.name}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.membersTable}>
        {group.members.map((member) => (
          <MemberRow
            key={member.logId}
            member={member}
            setCount={group.setCount}
            isSelf={!!currentUserId && member.userId === currentUserId}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * チーム練習のタイム一覧シート (チームメンバーなら admin/非admin 問わず閲覧できる)。
 * 大会の記録一覧 (TeamCompetitionRecordsModal) と同じ下から出るシートで、
 * メニューごとにメンバーを平均タイムの速い順に並べ、行を押すと 1 本ずつのタイムが開く。
 */
export function TeamPracticeTimesModal({
  visible,
  onClose,
  practiceId,
  heading,
}: TeamPracticeTimesModalProps) {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  // シートにフッターが無いので、最後の行が Android のナビゲーションバーに隠れないよう下に余白を足す
  const insets = useSafeInsets();

  // 開くたびに取り直すが、同じ練習を開き直したときは前回の内容をすぐ表示する
  const practiceQuery = useQuery({
    queryKey: teamDetailKeys.practiceTimes(practiceId),
    queryFn: async (): Promise<PracticeTimesDetail> => {
      const { data, error } = await supabase
        .from("practices")
        .select(
          `
          id,
          date,
          title,
          place,
          note,
          practice_logs (
            id,
            user_id,
            style,
            swim_category,
            rep_count,
            set_count,
            distance,
            circle,
            note,
            created_at,
            practice_times (
              id,
              time,
              rep_number,
              set_number,
              user_id
            ),
            practice_log_tags (
              practice_tag_id,
              practice_tags (
                id,
                name,
                color
              )
            ),
            users!practice_logs_user_id_fkey (
              name,
              profile_image_path
            )
          )
        `,
        )
        .eq("id", practiceId)
        // メニューの並びを入力順で安定させる
        .order("created_at", { referencedTable: "practice_logs", ascending: true })
        .single();
      if (error) {
        console.error("TeamPracticeTimesModal: failed to load practice times", error);
        throw error;
      }
      return data as unknown as PracticeTimesDetail;
    },
    enabled: visible,
    staleTime: ALWAYS_REVALIDATE,
  });

  const practice = practiceQuery.data ?? null;
  const { isLoading: loading, isFailed } = getCachedQueryStatus(practiceQuery);
  const unknownUser = t("teams.practiceTimes.unknownUser");

  const menuGroups = useMemo(
    () => buildPracticeMenuGroups(practice?.practice_logs ?? [], unknownUser),
    [practice, unknownUser],
  );

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheet}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {heading}
          {t("teams.practiceTimes.titleSuffix")}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={styles.closeIcon}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: getSafeFooterPadding(16, insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.infoText}>{t("teams.practiceTimes.loading")}</Text>
          </View>
        )}

        {!loading && isFailed && (
          <View style={styles.centerBlock}>
            <Feather name="alert-circle" size={32} color="#DC2626" />
            <Text style={styles.errorText}>{t("teams.practiceTimes.loadError")}</Text>
          </View>
        )}

        {!loading && !isFailed && practice && (
          <>
            {(practice.place || practice.note) && (
              <View style={styles.metaRow}>
                {practice.place && (
                  <View style={styles.metaItem}>
                    <Feather name="map-pin" size={14} color="#6B7280" />
                    <Text style={styles.metaText}>{practice.place}</Text>
                  </View>
                )}
                {practice.note && (
                  <View style={styles.metaItem}>
                    <Feather name="edit-2" size={14} color="#2563EB" />
                    <Text style={styles.metaText} numberOfLines={2}>
                      {practice.note}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {menuGroups.length === 0 && (
              <View style={styles.centerBlock}>
                <Feather name="inbox" size={36} color="#D1D5DB" />
                <Text style={styles.infoText}>{t("teams.practiceTimes.empty")}</Text>
              </View>
            )}

            {menuGroups.map((group) => (
              <MenuGroupCard key={group.key} group={group} currentUserId={user?.id} />
            ))}
          </>
        )}
      </ScrollView>
    </SlideUpModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  closeIcon: {
    padding: 4,
  },
  scrollView: {
    flexGrow: 0,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  centerBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 1,
  },
  // 練習カードの「記録」ボタンと同じ緑系でまとめ、大会 (青系) と見分けやすくする
  menuGroup: {
    backgroundColor: "#ECFDF5",
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  menuBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#059669",
  },
  menuTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#065F46",
  },
  menuCount: {
    fontSize: 12,
    color: "#059669",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "500",
  },
  membersTable: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    overflow: "hidden",
  },
  memberRowWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ECFDF5",
  },
  memberRowSelf: {
    backgroundColor: "#EFF6FF",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memberNameBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  memberName: {
    fontSize: 14,
    color: "#111827",
  },
  memberSubText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  memberAverageBlock: {
    alignItems: "flex-end",
  },
  memberAverageLabel: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  memberAverage: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  memberAverageEmpty: {
    color: "#9CA3AF",
    fontWeight: "400",
  },
  chevronSpacer: {
    width: 16,
  },
  memberDetail: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
  },
  setBlock: {
    gap: 4,
  },
  setHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  setLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#065F46",
  },
  setAverage: {
    fontSize: 12,
    color: "#065F46",
    fontVariant: ["tabular-nums"],
  },
  // 横幅いっぱいを 4 等分する。セルの外側の余白は wrap 側の padding で取り、
  // 4 個ちょうどで 1 行に収まるようにしている (gap だと幅の計算が % とずれる)
  timesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -2,
  },
  timeCellWrap: {
    width: `${100 / TIMES_PER_ROW}%`,
    padding: 2,
  },
  timeCell: {
    backgroundColor: "#F3F4F6",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  timeCellText: {
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  timeCellTextFastest: {
    color: "#2563EB",
    fontWeight: "700",
  },
  memberNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 2,
  },
  memberNoteText: {
    flex: 1,
    fontSize: 12,
    color: "#4B5563",
  },
});
