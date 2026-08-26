import type { CalendarItem } from "@apps/shared/types/ui";
import type { PracticeTime, PracticeTag } from "@apps/shared/types";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import type { DayDetailScope } from "./domainFilter";

// DayDetailModalのProps
export interface DayDetailModalProps {
  visible: boolean;
  date: Date;
  entries: CalendarItem[];
  /**
   * 表示スコープ。未指定時は "day"（ダッシュボードの全種別混在挙動）。
   * "practice"/"competition" は該当する種別のみ表示し、汎用追加チューザーを非表示にする。
   */
  scope?: DayDetailScope;
  /** entries の取得がまだ完了していない（初回ロード中）かどうか。未指定時は false */
  isLoading?: boolean;
  /** entries の取得に失敗したかどうか。未指定時は false */
  isError?: boolean;
  /** isError 時に再試行ボタンを表示する場合のハンドラ */
  onRetry?: () => void;
  /** ダッシュボードの記録色カスタマイズ設定。未指定時はデフォルト色として解決される */
  colorSettings?: CalendarColorSettings;
  onClose: () => void;
  onEntryPress?: (item: CalendarItem) => void;
  onAddPractice?: (date: Date) => void;
  onAddRecord?: (dateOrCompetitionId: Date | string, dateParam?: string) => void;
  onEditPractice?: (item: CalendarItem) => void;
  onDeletePractice?: (itemId: string) => void;
  onAddPracticeLog?: (practiceId: string) => void;
  onEditPracticeLog?: (item: CalendarItem) => void;
  onDeletePracticeLog?: (logId: string) => void;
  onEditRecord?: (item: CalendarItem) => void;
  onDeleteRecord?: (recordId: string) => void;
  onEditEntry?: (item: CalendarItem) => void;
  onDeleteEntry?: (entryId: string) => void;
  onAddEntry?: (competitionId: string, date: string) => void;
  onEditCompetition?: (item: CalendarItem) => void;
  onDeleteCompetition?: (competitionId: string, isTeamCompetition: boolean) => void;
  isDeleting?: boolean;
  onDeletingChange?: (value: boolean) => void;
}

// PracticeLogDetailのProps
export interface PracticeLogDetailProps {
  item: CalendarItem;
  title: string;
  color: string;
  typeLabel: string;
  isPractice: boolean;
  isPracticeLog: boolean;
  practiceId: string;
  hasEntriesOrRecords?: boolean;
  onEntryPress?: (item: CalendarItem) => void;
  onClose: () => void;
  onEditPractice?: (item: CalendarItem) => void;
  onDeletePractice?: (itemId: string) => void;
  onAddPracticeLog?: (practiceId: string) => void;
  onEditPracticeLog?: (item: CalendarItem) => void;
  onDeletePracticeLog?: (logId: string) => void;
  onEditRecord?: (item: CalendarItem) => void;
  onDeleteRecord?: (recordId: string) => void;
  onEditEntry?: (item: CalendarItem) => void;
  onDeleteEntry?: (entryId: string) => void;
  onAddEntry?: (competitionId: string, date: string) => void;
  onEditCompetition?: (item: CalendarItem) => void;
  onDeleteCompetition?: (competitionId: string, isTeamCompetition: boolean) => void;
  onPracticeTimeLoaded?: (practiceLogId: string, hasTimes: boolean) => void;
  onMediaLoaded?: (entryId: string, hasMedia: boolean) => void;
}

// TimeTableのProps
export interface TimeTableProps {
  times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>;
  repCount: number;
  setCount: number;
}

// RecordDetailのProps
export interface RecordDetailProps {
  competitionId: string;
  competitionName: string;
  place?: string;
  poolType?: number;
  note?: string;
  records: CalendarItem[];
  isTeamCompetition?: boolean;
  /** チームID（isTeamCompetition時のみ）。出欠確認ボタンの表示・データ取得に使用 */
  teamId?: string | null;
  /** 識別色(記録色カスタマイズ)。未指定時は旧来のデフォルト青(#2563EB)を使う */
  color?: string;
  onEditCompetition?: () => void;
  onDeleteCompetition?: () => void;
  onAddRecord?: () => void;
  onEditRecord?: (item: CalendarItem) => void;
  onDeleteRecord?: (recordId: string) => void;
  onClose?: () => void;
  onMediaLoaded?: (entryId: string, hasMedia: boolean) => void;
}

// EntryDetailのProps
export interface EntryDetailProps {
  competitionId: string;
  competitionName: string;
  place?: string;
  poolType?: number;
  note?: string;
  entries: CalendarItem[];
  /** 識別色(記録色カスタマイズ)。未指定時は旧来のデフォルト青(#2563EB)を使う */
  color?: string;
  onEditCompetition?: (item: CalendarItem) => void;
  onDeleteCompetition?: () => void;
  onEditEntry?: (item: CalendarItem) => void;
  onDeleteEntry?: (entryId: string) => void;
  onAddRecord?: (competitionId: string, date: string) => void;
  onClose?: () => void;
  onDeletingChange?: (value: boolean) => void;
}

// 練習ログの型
export interface PracticeLogData {
  id: string;
  practiceId: string;
  style: string;
  /** 種目カテゴリ（Swim/Pull/Kick）。未設定の記録もあるため optional */
  swim_category?: "Swim" | "Pull" | "Kick" | null;
  repCount: number;
  setCount: number;
  distance: number;
  circle: number | null;
  note: string | null;
  times: Array<{
    id: string;
    time: number;
    repNumber: number;
    setNumber: number;
  }>;
  tags?: PracticeTag[];
}

// 練習ログ詳細の型
export interface PracticeLogDetailData {
  id: string;
  style: string;
  /** 種目カテゴリ（Swim/Pull/Kick）。未設定の記録もあるため optional */
  swim_category?: "Swim" | "Pull" | "Kick" | null;
  repCount: number;
  setCount: number;
  distance: number;
  circle: number | null;
  note: string | null;
  times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>;
  tags?: PracticeTag[];
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
}

// 記録データの型
export interface RecordData {
  id: string;
  styleName: string;
  time: number;
  reactionTime: number | null;
  isRelaying: boolean;
  note: string | null;
  styleId: number;
  styleDistance: number;
  videoPath: string | null;
  videoThumbnailPath: string | null;
}

// エントリーデータの型
export interface EntryData {
  id: string;
  styleId: number;
  styleName: string;
  entryTime: number | null;
  note: string | null;
}

// 練習ログDBからの型
export interface PracticeLogFromDB {
  id: string;
  practice_id: string;
  style: string;
  /** 種目カテゴリ（Swim/Pull/Kick）。未設定の記録もあるため optional */
  swim_category?: "Swim" | "Pull" | "Kick" | null;
  rep_count: number;
  set_count: number;
  distance: number;
  circle: number | null;
  note: string | null;
  practice_times?: PracticeTime[];
}
