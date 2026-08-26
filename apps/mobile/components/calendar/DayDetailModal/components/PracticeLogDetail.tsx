import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTime, formatCircleTime, getStyleLabel } from "@/utils/formatters";
import type { PracticeTime, PracticeTag } from "@apps/shared/types";
import { VideoPlayer } from "@/components/shared/VideoPlayer";
import { ImageViewerModal } from "@/components/shared";
import { ShareCardModal } from "@/components/share";
import type { PracticeShareData, PracticeMenuItem } from "@/components/share";
import { resolveGalleryImages } from "@/utils/imageUpload";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { hexToRgba, mixWithWhite, CALENDAR_COLOR_ALPHA } from "@apps/shared/utils/colorAlpha";
import { darkenHex } from "@/utils/colorTone";
import { AttendanceGroupModal } from "@/components/teams/AttendanceGroupModal";
import type { MainStackParamList } from "@/navigation/types";
import { styles } from "../styles";
import { MemoizedTimeTable } from "./TimeTable";
import type {
  PracticeLogDetailProps,
  PracticeLogData,
  PracticeLogDetailData,
  PracticeLogFromDB,
} from "../types";

// DayDetailModal から渡ってくる未カスタマイズ時のフォールバック色。
// (このコンポーネントは練習/大会/エントリー/記録いずれのアイテムでも使われるため、
// 練習系・大会系どちらのレガシー値とも一致判定する)
const LEGACY_PRACTICE_ACCENT = "#10B981";
const LEGACY_COMPETITION_ACCENT = "#2563EB";

/**
 * Practice_Logの詳細表示コンポーネント
 */
export const PracticeLogDetail: React.FC<PracticeLogDetailProps> = ({
  item,
  title,
  color,
  typeLabel,
  isPractice,
  isPracticeLog,
  practiceId,
  hasEntriesOrRecords = false,
  onEntryPress,
  onClose,
  onEditPractice,
  onDeletePractice,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onEditRecord,
  onDeleteRecord,
  onEditEntry,
  onDeleteEntry,
  onAddEntry,
  onEditCompetition,
  onDeleteCompetition,
  onPracticeTimeLoaded,
  onMediaLoaded,
}) => {
  // 未カスタマイズ(渡された色が旧デフォルト値と一致)なら内側の識別色要素を旧来の
  // 見た目に固定する。カスタム色時のみ、枠線/バッジ/アクセントを淡いアルファ合成にする
  // (「濃すぎる」フィードバックを受けた RecordDetail/EntryDetail と同じ方針)。
  const isDefaultAccent = color === LEGACY_PRACTICE_ACCENT || color === LEGACY_COMPETITION_ACCENT;
  const badgeBackgroundColor = isDefaultAccent
    ? color
    : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BADGE_BACKGROUND);
  const badgeTextColor = isDefaultAccent ? "#FFFFFF" : darkenHex(color, 0.65);
  const borderLeftAccentColor = isDefaultAccent ? color : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER);
  // 練習内容ボックス・タイム表の枠線は練習系のみ(このコンポーネント内で練習内容を
  // 表示するのは isPractice/isPracticeLog の場合のみだが、判定用の色は共通で使い回す)
  const practiceBoxBorderColor = isDefaultAccent ? LEGACY_PRACTICE_ACCENT : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER);
  const practiceAccentBarColor = isDefaultAccent ? LEGACY_PRACTICE_ACCENT : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_ACCENT_BAR);
  const practiceAccentTextColor = isDefaultAccent ? "#059669" : color;
  // 展開済み練習メニュー1件分の背景ウォッシュ(入れ子で重なりうる背景面のため mixWithWhite を使う)
  const practiceLogBoxBackgroundColor = isDefaultAccent
    ? "#F0FDF4"
    : mixWithWhite(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND);
  const { t } = useTranslation();
  const { supabase, getAccessToken } = useAuth();
  const locale = useDateLocale();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  // チームの練習/大会のみ出欠確認ボタンを表示する（web PracticeDetails/CompetitionDetails の
  // `isTeamPractice && teamId` 条件と同一。個人の練習には出さない）
  const teamId = item.metadata?.team_id ?? null;
  const isTeamEvent =
    (item.type === "team_practice" || item.type === "team_competition") && !!teamId;
  const [attendanceModalVisible, setAttendanceModalVisible] = useState(false);
  const [recordDetail, setRecordDetail] = useState<{
    time: number;
    note: string;
    reactionTime: number | null;
  } | null>(null);
  const [loadingRecordDetail, setLoadingRecordDetail] = useState(false);
  const [practiceLogs, setPracticeLogs] = useState<PracticeLogData[]>([]);
  const [loading, setLoading] = useState(false);
  const [practiceImages, setPracticeImages] = useState<Array<{ id: string; url: string }>>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [shareVisible, setShareVisible] = useState(false);
  const [sharePracticeData, setSharePracticeData] = useState<PracticeShareData | null>(null);

  const [practiceLogImages, setPracticeLogImages] = useState<Array<{ id: string; url: string }>>(
    [],
  );
  const [logViewerVisible, setLogViewerVisible] = useState(false);
  const [logViewerIndex, setLogViewerIndex] = useState(0);

  // 共有ボタン押下: その日の practiceLogs 全件を menuItems に集約する
  // （web PracticeDetails.tsx の share-practice-log-button と同一方針。押されたログに
  // 関わらず常に全件集約する）
  const handleSharePractice = useCallback(() => {
    const menuItems: PracticeMenuItem[] = practiceLogs.map((log) => ({
      style: log.style,
      category: log.swim_category || "Swim",
      distance: log.distance,
      repCount: log.repCount,
      setCount: log.setCount,
      circle: log.circle ?? undefined,
      times: log.times?.map((time) => ({
        setNumber: time.setNumber,
        repNumber: time.repNumber,
        time: time.time,
      })),
      note: log.note ?? undefined,
      tags: (log.tags || []).map((tag) => ({ name: tag.name, color: tag.color })),
    }));

    const totalDistance = practiceLogs.reduce(
      (sum, log) => sum + log.distance * log.repCount * log.setCount,
      0,
    );
    const totalSets = practiceLogs.reduce((sum, log) => sum + (log.setCount || 0), 0);

    setSharePracticeData({
      date: item.date ? formatDate(item.date, "longWithWeekday", locale) : "",
      title,
      place: item.place ?? undefined,
      note: item.note ?? undefined,
      menuItems,
      totalDistance,
      totalSets,
    });
    setShareVisible(true);
  }, [practiceLogs, item.date, item.place, item.note, title, locale]);

  // isCancelled: 呼び出し元 effect のクリーンアップで true になるガード。
  // practiceId 切替時に 2 段 await (fetch → getAccessToken → resolveGalleryImages) の
  // 古いレスポンスが新しい state を上書きするのを防ぐ。
  const loadPracticeLogs = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!isPractice || !practiceId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("practices")
        .select(
          `
          *,
          practice_logs (
            *,
            practice_times (*),
            practice_log_tags (
              practice_tag_id,
              practice_tags (
                id,
                name,
                color
              )
            )
          )
        `,
        )
        .eq("id", practiceId)
        .single();

      if (isCancelled()) return;
      if (error) throw error;
      if (!data) return;

      const imagePaths = (data as { image_paths?: string[] | null } | null)?.image_paths ?? [];
      // practice-images は private バケットのため署名付きURLを解決する（Issue #36）
      const accessToken = await getAccessToken();
      if (isCancelled()) return;
      let hasImages = false;
      if (accessToken) {
        try {
          const images = await resolveGalleryImages("practice-images", imagePaths, accessToken);
          if (!isCancelled()) setPracticeImages(images);
          hasImages = images.length > 0;
        } catch (err) {
          console.warn("練習画像の取得に失敗:", err);
          // 取得失敗時に古い練習の画像を表示し続けない（RecordDetail と同一の挙動）
          if (!isCancelled()) setPracticeImages([]);
        }
      } else {
        // トークンが取得できない場合、古い private 画像を表示し続けないよう空にする
        setPracticeImages([]);
      }

      const formattedLogs = (data.practice_logs || []).map(
        (
          log: PracticeLogFromDB & { practice_log_tags?: Array<{ practice_tags: PracticeTag }> },
        ) => ({
          id: log.id,
          practiceId: log.practice_id,
          style: log.style,
          swim_category: log.swim_category,
          repCount: log.rep_count,
          setCount: log.set_count,
          distance: log.distance,
          circle: log.circle,
          note: log.note,
          times: (log.practice_times || []).map((time: PracticeTime) => ({
            id: time.id,
            time: time.time,
            repNumber: time.rep_number,
            setNumber: time.set_number,
          })),
          tags: (log.practice_log_tags || [])
            .map((plt) => plt.practice_tags)
            .filter(Boolean) as PracticeTag[],
        }),
      );

      if (!isCancelled()) {
        setPracticeLogs(formattedLogs);
        onMediaLoaded?.(item.id, hasImages);
      }
    } catch (error) {
      console.error("練習ログの取得エラー:", error);
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [isPractice, practiceId, supabase, getAccessToken, item.id, onMediaLoaded]);

  useEffect(() => {
    if (!isPractice || !practiceId) return;
    let cancelled = false;
    loadPracticeLogs(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isPractice, practiceId, loadPracticeLogs]);

  const [practiceLogDetail, setPracticeLogDetail] = useState<PracticeLogDetailData | null>(null);
  const [loadingLogDetail, setLoadingLogDetail] = useState(false);

  // isCancelled: loadPracticeLogs と同じく、古いレスポンスによる state 上書きを防ぐガード
  const loadPracticeLogDetail = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!isPracticeLog || !item.id) return;

    try {
      setLoadingLogDetail(true);
      const { data, error } = await supabase
        .from("practice_logs")
        .select(
          `
          *,
          practice_times (*),
          practice_log_tags (
            practice_tag_id,
            practice_tags (
              id,
              name,
              color
            )
          )
        `,
        )
        .eq("id", item.id)
        .single();

      if (isCancelled()) return;
      if (error) throw error;
      if (!data) return;

      const log = data as {
        id: string;
        practice_id: string | null;
        style: string;
        swim_category?: "Swim" | "Pull" | "Kick" | null;
        rep_count: number;
        set_count: number;
        distance: number;
        circle: number | null;
        note: string | null;
        video_path?: string | null;
        video_thumbnail_path?: string | null;
        practice_times?: PracticeTime[];
        practice_log_tags?: Array<{ practice_tags: PracticeTag }>;
      };

      const times = (log.practice_times || []).map((time: PracticeTime) => ({
        id: time.id,
        time: time.time,
        repNumber: time.rep_number,
        setNumber: time.set_number,
      }));

      const tags = (log.practice_log_tags || [])
        .map((plt) => plt.practice_tags)
        .filter(Boolean) as PracticeTag[];

      if (isCancelled()) return;
      setPracticeLogDetail({
        id: log.id,
        style: log.style,
        swim_category: log.swim_category,
        repCount: log.rep_count,
        setCount: log.set_count,
        distance: log.distance,
        circle: log.circle,
        note: log.note,
        times,
        tags,
        videoPath: log.video_path ?? null,
        videoThumbnailPath: log.video_thumbnail_path ?? null,
      });

      const logPracticeId = log.practice_id;
      let hasImages = false;
      if (logPracticeId) {
        try {
          const { data: practiceData, error: practiceError } = await supabase
            .from("practices")
            .select("image_paths")
            .eq("id", logPracticeId)
            .single();

          if (isCancelled()) return;
          if (!practiceError && practiceData) {
            const imagePaths =
              (practiceData as { image_paths?: string[] | null } | null)?.image_paths ?? [];
            // practice-images は private バケットのため署名付きURLを解決する（Issue #36）
            const accessToken = await getAccessToken();
            if (isCancelled()) return;
            if (accessToken) {
              const images = await resolveGalleryImages("practice-images", imagePaths, accessToken);
              if (!isCancelled()) setPracticeLogImages(images);
              hasImages = images.length > 0;
            } else {
              // トークンが取得できない場合、古い private 画像を表示し続けないよう空にする
              setPracticeLogImages([]);
            }
          }
        } catch (err) {
          console.warn("practice_log 画像取得に失敗:", err);
          // 取得失敗時に古い練習の画像を表示し続けない（RecordDetail と同一の挙動）
          if (!isCancelled()) setPracticeLogImages([]);
        }
      } else {
        // 紐づく practice が無い場合も前の画像を残さない
        setPracticeLogImages([]);
      }

      if (isCancelled()) return;
      if (onPracticeTimeLoaded) {
        onPracticeTimeLoaded(item.id, times.length > 0);
      }
      onMediaLoaded?.(item.id, Boolean(log.video_path) || hasImages);
    } catch (error) {
      console.error("練習ログ詳細の取得エラー:", error);
    } finally {
      if (!isCancelled()) setLoadingLogDetail(false);
    }
  }, [isPracticeLog, item.id, supabase, getAccessToken, onPracticeTimeLoaded, onMediaLoaded]);

  useEffect(() => {
    if (!isPracticeLog || !item.id) return;
    let cancelled = false;
    loadPracticeLogDetail(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [isPracticeLog, item.id, loadPracticeLogDetail]);

  // 記録詳細を取得（record表示用）
  useEffect(() => {
    if (item.type !== "record") return;

    let isMounted = true;
    const loadRecordDetail = async () => {
      try {
        setLoadingRecordDetail(true);
        const competitionId =
          item.metadata?.competition?.id || item.metadata?.record?.competition_id || item.id;
        if (!competitionId) return;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from("records")
          .select("id, time, note, reaction_time")
          .eq("competition_id", competitionId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!isMounted) return;
        if (error) {
          console.error("記録詳細取得エラー:", error);
          return;
        }
        if (!data) return;

        setRecordDetail({
          time: data.time,
          note: data.note || "",
          reactionTime: data.reaction_time ?? null,
        });
      } catch (error) {
        if (!isMounted) return;
        console.error("記録詳細取得エラー:", error);
      } finally {
        if (isMounted) {
          setLoadingRecordDetail(false);
        }
      }
    };

    loadRecordDetail();

    return () => {
      isMounted = false;
    };
  }, [item, supabase]);

  if (isPracticeLog) {
    return (
      <>
      <View style={[styles.entryItem, { borderLeftColor: borderLeftAccentColor }]}>
        <View style={styles.entryContent}>
          <View style={styles.entryHeader}>
            <View style={[styles.entryTypeBadge, { backgroundColor: badgeBackgroundColor }]}>
              <Text style={[styles.entryTypeText, { color: badgeTextColor }]}>{typeLabel}</Text>
            </View>
            <View style={styles.actionButtons}>
              {onEditPracticeLog && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditPracticeLog(item);
                    onClose();
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {onDeletePracticeLog && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDeletePracticeLog(item.id);
                  }}
                >
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              )}
            </View>
          </View>

          {loadingLogDetail ? (
            <Text style={styles.loadingText}>{t("common.loading")}</Text>
          ) : practiceLogDetail ? (
            <>
              {/* タグ表示 */}
              {practiceLogDetail.tags && practiceLogDetail.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {practiceLogDetail.tags.map((tag) => (
                    <View key={tag.id} style={[styles.tagChip, { backgroundColor: tag.color }]}>
                      <Text style={styles.tagChipText}>{tag.name}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* 練習内容 */}
              <View style={[styles.practiceContentContainer, { borderColor: practiceBoxBorderColor }]}>
                <Text style={styles.practiceContentLabel}>{t("practice.modal.content")}</Text>
                <Text style={styles.practiceContentText}>
                  <Text style={styles.practiceContentValue}>{practiceLogDetail.distance}</Text>m ×{" "}
                  <Text style={styles.practiceContentValue}>{practiceLogDetail.repCount}</Text>
                  {practiceLogDetail.setCount > 1 && (
                    <>
                      {" × "}
                      <Text style={styles.practiceContentValue}>{practiceLogDetail.setCount}</Text>
                    </>
                  )}
                  {"　　"}
                  <Text style={styles.practiceContentValue}>
                    {formatCircleTime(practiceLogDetail.circle)}
                  </Text>
                  {"　"}
                  <Text style={styles.practiceContentValue}>
                    {getStyleLabel(practiceLogDetail.style, t)}
                  </Text>
                </Text>
              </View>

              {/* タイム表示 */}
              {practiceLogDetail.times.length > 0 && (
                <View style={styles.timeContainer}>
                  <View style={styles.timeHeader}>
                    <View style={[styles.timeHeaderBar, { backgroundColor: practiceAccentBarColor }]} />
                    <Text style={[styles.timeHeaderText, { color: practiceAccentTextColor }]}>
                      {t("practice.modal.time")}
                    </Text>
                  </View>
                  <View style={[styles.timeTableContainer, { borderColor: practiceBoxBorderColor }]}>
                    <MemoizedTimeTable
                      times={practiceLogDetail.times}
                      repCount={practiceLogDetail.repCount}
                      setCount={practiceLogDetail.setCount}
                    />
                  </View>
                </View>
              )}

              {practiceLogDetail.note && (
                <View style={styles.noteContainer}>
                  <Text style={styles.noteLabel}>{t("practice.modal.memo")}</Text>
                  <Text style={styles.noteText}>{practiceLogDetail.note}</Text>
                </View>
              )}

              {practiceLogDetail.videoPath && (
                <VideoPlayer
                  videoPath={practiceLogDetail.videoPath}
                  thumbnailPath={practiceLogDetail.videoThumbnailPath}
                />
              )}

              {practiceLogImages.length > 0 && (
                <View style={imageGalleryStyles.gallery}>
                  <Text style={imageGalleryStyles.galleryTitle}>{t("common.imageGallery.attachedImages")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {practiceLogImages.map((img, index) => (
                      <Pressable
                        key={img.id}
                        onPress={() => {
                          setLogViewerIndex(index);
                          setLogViewerVisible(true);
                        }}
                      >
                        <Image
                          source={{ uri: img.url }}
                          style={imageGalleryStyles.image}
                          contentFit="cover"
                          transition={200}
                        />
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          ) : null}

          {item.place && (
            <View style={styles.entryPlaceContainer}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.entryPlace} numberOfLines={1}>
                {item.place}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ImageViewerModal
        images={practiceLogImages.map((img) => ({ uri: img.url }))}
        visible={logViewerVisible}
        initialIndex={logViewerIndex}
        onClose={() => setLogViewerVisible(false)}
      />
      </>
    );
  }

  // Practiceの場合は展開可能
  return (
    <View style={[styles.entryItem, { borderLeftColor: borderLeftAccentColor }]}>
      <Pressable
        style={styles.entryContentWrapper}
        onPress={() => {
          if (isPractice) return;
          onEntryPress?.(item);
          onClose();
        }}
      >
        <View style={styles.entryContent}>
          <View style={styles.entryHeader}>
            <View style={[styles.entryTypeBadge, { backgroundColor: badgeBackgroundColor }]}>
              <Text style={[styles.entryTypeText, { color: badgeTextColor }]}>{typeLabel}</Text>
            </View>
            <View style={styles.actionButtons}>
              {isPractice && onEditPractice && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditPractice(item);
                    onClose();
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {isPractice && onDeletePractice && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDeletePractice(item.id);
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {item.type === "record" && onEditRecord && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditRecord(item);
                    onClose();
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {item.type === "record" && onDeleteRecord && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDeleteRecord(item.id);
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {item.type === "entry" && onEditEntry && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onEditEntry(item);
                    onClose();
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {item.type === "entry" && onDeleteEntry && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    onDeleteEntry(item.id);
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {(item.type === "competition" || item.type === "team_competition") &&
                onEditCompetition && (
                  <Pressable
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEditCompetition(item);
                      onClose();
                    }}
                  >
                    <Feather name="edit" size={18} color="#2563EB" />
                  </Pressable>
                )}
              {(item.type === "competition" || item.type === "team_competition") &&
                onDeleteCompetition && (
                  <Pressable
                    style={styles.actionButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onDeleteCompetition(item.id, item.type === "team_competition");
                    }}
                  >
                    <Feather name="trash-2" size={20} color="#EF4444" />
                  </Pressable>
                )}
              {isTeamEvent && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    setAttendanceModalVisible(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("dashboard.attendance.checkTitle")}
                >
                  <Feather name="clipboard" size={18} color="#2563EB" />
                </Pressable>
              )}
            </View>
          </View>
          <Text style={styles.entryTitle} numberOfLines={2}>
            {title}
          </Text>
          {item.type === "record" && (
            <View style={styles.recordDetailContainer}>
              {loadingRecordDetail ? (
                <Text style={styles.loadingText}>{t("recordMobile.recordLoading")}</Text>
              ) : recordDetail ? (
                <>
                  <View style={styles.recordRow}>
                    <Text style={styles.recordLabel}>{t("practice.modal.time")}</Text>
                    <Text style={styles.recordValue}>{formatTime(recordDetail.time)}</Text>
                  </View>
                  {recordDetail.reactionTime !== null && (
                    <View style={styles.recordRow}>
                      <Text style={styles.recordLabel}>{t("practice.modal.reaction")}</Text>
                      <Text style={styles.recordValue}>{recordDetail.reactionTime}</Text>
                    </View>
                  )}
                  {recordDetail.note ? (
                    <Text style={styles.recordNote} numberOfLines={2}>
                      {recordDetail.note}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.recordEmptyText}>{t("practice.modal.recordNotFound")}</Text>
              )}
            </View>
          )}
          {item.place && (
            <View style={styles.entryPlaceContainer}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.entryPlace} numberOfLines={1}>
                {item.place}
              </Text>
            </View>
          )}
          {item.note && (
            <Text style={styles.entryNote} numberOfLines={2}>
              {item.note}
            </Text>
          )}
          {/* 練習ログ追加ボタン */}
          {isPractice && onAddPracticeLog && (
            <Pressable
              style={styles.addLogButton}
              onPress={(e) => {
                e.stopPropagation();
                onAddPracticeLog(practiceId);
                onClose();
              }}
            >
              <Feather name="plus" size={14} color="#374151" style={styles.addLogButtonIcon} />
              <Text style={styles.addLogButtonText}>{t("practice.modal.addPracticeMenu")}</Text>
            </Pressable>
          )}
          {/* 大会記録追加ボタン */}
          {(item.type === "competition" || item.type === "team_competition") &&
            !hasEntriesOrRecords &&
            onAddEntry && (
              <Pressable
                style={styles.addLogButton}
                onPress={(e) => {
                  e.stopPropagation();
                  const competitionId = item.id;
                  const dateParam = item.date;
                  if (competitionId && dateParam && onAddEntry) {
                    onAddEntry(competitionId, dateParam);
                    onClose();
                  }
                }}
              >
                <Feather name="plus" size={14} color="#374151" style={styles.addLogButtonIcon} />
                <Text style={styles.addLogButtonText}>{t("dashboard.dayDetail.addRecord")}</Text>
              </Pressable>
            )}
        </View>
      </Pressable>

      {isPractice && (
        <View style={styles.expandedContent}>
          {loading ? (
            <Text style={styles.loadingText}>{t("common.loading")}</Text>
          ) : practiceLogs.length === 0 ? (
            <Text style={styles.emptyText}>{t("practice.modal.noPracticeMenus")}</Text>
          ) : (
            practiceLogs.map((log) => (
              <View
                key={log.id}
                style={[styles.practiceLogDetail, { backgroundColor: practiceLogBoxBackgroundColor }]}
              >
                {/* タグ表示 */}
                {log.tags && log.tags.length > 0 && (
                  <View style={styles.tagsContainer}>
                    {log.tags.map((tag) => (
                      <View key={tag.id} style={[styles.tagChip, { backgroundColor: tag.color }]}>
                        <Text style={styles.tagChipText}>{tag.name}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* 練習内容（右上にシェアボタン） */}
                <View
                  style={[
                    styles.practiceContentContainer,
                    { borderColor: practiceBoxBorderColor },
                    localStyles.practiceContentRelative,
                    localStyles.practiceContentWithShareButton,
                  ]}
                >
                  {/* シェアボタン（右上、web の share-practice-log-button と同じ配置） */}
                  <Pressable
                    style={localStyles.shareButton}
                    onPress={handleSharePractice}
                    accessibilityRole="button"
                    accessibilityLabel={t("dashboard.practice.shareTitle")}
                  >
                    <Feather name="share-2" size={16} color="#0891B2" />
                  </Pressable>

                  <Text style={styles.practiceContentLabel}>{t("practice.modal.content")}</Text>
                  <Text style={styles.practiceContentText}>
                    <Text style={styles.practiceContentValue}>{log.distance}</Text>m ×{" "}
                    <Text style={styles.practiceContentValue}>{log.repCount}</Text>
                    {log.setCount > 1 && (
                      <>
                        {" × "}
                        <Text style={styles.practiceContentValue}>{log.setCount}</Text>
                      </>
                    )}
                    {"　　"}
                    <Text style={styles.practiceContentValue}>{formatCircleTime(log.circle)}</Text>
                    {"　"}
                    <Text style={styles.practiceContentValue}>{getStyleLabel(log.style, t)}</Text>
                  </Text>
                </View>

                {/* タイム表示 */}
                {log.times.length > 0 && (
                  <View style={styles.timeContainer}>
                    <View style={styles.timeHeader}>
                      <View style={[styles.timeHeaderBar, { backgroundColor: practiceAccentBarColor }]} />
                      <Text style={[styles.timeHeaderText, { color: practiceAccentTextColor }]}>
                        {t("practice.modal.time")}
                      </Text>
                    </View>
                    <View style={[styles.timeTableContainer, { borderColor: practiceBoxBorderColor }]}>
                      <MemoizedTimeTable
                        times={log.times}
                        repCount={log.repCount}
                        setCount={log.setCount}
                      />
                    </View>
                  </View>
                )}

                {log.note && (
                  <View style={styles.noteContainer}>
                    <Text style={styles.noteLabel}>{t("practice.modal.memo")}</Text>
                    <Text style={styles.noteText}>{log.note}</Text>
                  </View>
                )}
              </View>
            ))
          )}

          {practiceImages.length > 0 && (
            <View style={imageGalleryStyles.gallery}>
              <Text style={imageGalleryStyles.galleryTitle}>{t("common.imageGallery.attachedImages")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {practiceImages.map((img, index) => (
                  <Pressable
                    key={img.id}
                    onPress={() => {
                      setViewerIndex(index);
                      setViewerVisible(true);
                    }}
                  >
                    <Image
                      source={{ uri: img.url }}
                      style={imageGalleryStyles.image}
                      contentFit="cover"
                      transition={200}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <ImageViewerModal
        images={practiceImages.map((img) => ({ uri: img.url }))}
        visible={viewerVisible}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      <ShareCardModal
        visible={shareVisible}
        onClose={() => setShareVisible(false)}
        type="practice"
        data={sharePracticeData}
      />

      {isTeamEvent && teamId && (
        <AttendanceGroupModal
          visible={attendanceModalVisible}
          onClose={() => setAttendanceModalVisible(false)}
          supabase={supabase}
          teamId={teamId}
          eventId={item.id}
          eventType={item.type === "team_practice" ? "practice" : "competition"}
          eventDate={item.date}
          locale={locale}
          showChangeLink
          onChangeLinkPress={() => {
            setAttendanceModalVisible(false);
            onClose();
            navigation.navigate("TeamDetail", { teamId, initialTab: "attendance" });
          }}
        />
      )}
    </View>
  );
};

// PracticeLogDetailをメモ化して不要な再レンダリングを防ぐ
export const MemoizedPracticeLogDetail = React.memo(PracticeLogDetail);

const localStyles = StyleSheet.create({
  practiceContentRelative: {
    position: "relative",
  },
  practiceContentWithShareButton: {
    paddingRight: 32,
  },
  shareButton: {
    position: "absolute",
    top: 6,
    right: 6,
    padding: 4,
    zIndex: 1,
  },
});

const imageGalleryStyles = StyleSheet.create({
  gallery: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#DBEAFE",
  },
  galleryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#F3F4F6",
  },
});
