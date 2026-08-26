import type { CalendarItem } from "@apps/shared/types/ui";
import type { CalendarItemType } from "@apps/shared/types/common";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import type {
  Record,
  PracticeLogWithTimes,
  PracticeTag,
  PracticeLogTemplate,
} from "@apps/shared/types";

// 削除確認の型
export interface DeleteConfirmState {
  id: string;
  type: CalendarItemType;
  competitionId?: string;
  /** 個人大会削除時に紐づく records の件数警告に使う。取得中/チーム大会/取得失敗時は undefined */
  recordCount?: number;
}

// 出欠モーダルの状態型
export interface AttendanceModalState {
  eventId: string;
  eventType: "practice" | "competition";
  teamId: string;
}

// PracticeDetailsのProps
export interface PracticeDetailsProps {
  practiceId: string;
  place?: string;
  practiceLogUpdateKey?: string;
  onEdit?: (images?: GalleryImage[]) => void;
  onDelete?: () => void;
  onAddPracticeLog?: (practiceId: string) => void;
  onAddPracticeLogFromTemplate?: (practiceId: string, template: PracticeLogTemplate) => void;
  onEditPracticeLog?: (log: PracticeLogWithTimes & { tags?: PracticeTag[] }) => void;
  onDeletePracticeLog?: (logId: string) => void;
  isTeamPractice?: boolean;
  teamId?: string | null;
  teamName?: string | undefined;
  onShowAttendance?: () => void;
  /** カレンダー記録色設定から解決された練習の表示色(hex)。未指定時はデフォルト緑 */
  color?: string;
}

// CompetitionDetailsのProps
export interface CompetitionDetailsProps {
  competitionId: string;
  competitionName?: string;
  place?: string;
  poolType?: number;
  note?: string;
  records?: CalendarItem[];
  onEdit?: (images?: GalleryImage[]) => void;
  onDelete?: () => void;
  onAddRecord?: (params: {
    competitionId?: string;
    entryData?: { styleId: number; styleName: string };
  }) => void;
  onEditRecord?: (record: Record) => void;
  onDeleteRecord?: (recordId: string) => void;
  onClose?: () => void;
  isTeamCompetition?: boolean;
  teamId?: string | null;
  teamName?: string | undefined;
  onShowAttendance?: () => void;
  /** カレンダー記録色設定から解決された大会の表示色(hex)。未指定時はデフォルト青 */
  color?: string;
}

// RecordSplitTimesのProps
export interface RecordSplitTimesProps {
  recordId: string;
  raceDistance?: number;
  recordTime?: number;
}

// CompetitionWithEntryのProps
export interface CompetitionWithEntryProps {
  entryId: string;
  competitionId: string;
  competitionName: string;
  place?: string;
  note?: string;
  styleId?: number;
  styleName: string;
  entryTime?: number | null;
  isTeamCompetition?: boolean;
  deletedEntryIds?: string[];
  onAddRecord?: (params: {
    competitionId?: string;
    entryData?: { styleId: number; styleName: string };
    entryDataList?: Array<{ styleId: number; styleName: string; entryTime?: number }>;
  }) => void;
  onEditCompetition?: (images?: GalleryImage[]) => void;
  onDeleteCompetition?: () => void;
  onEditEntry?: () => void;
  onDeleteEntry?: (entryId: string) => void;
  onClose?: () => void;
  /** カレンダー記録色設定から解決された大会の表示色(hex)。未指定時はデフォルト青 */
  color?: string;
}

// AttendanceModalのProps
export interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventType: "practice" | "competition";
  teamId: string;
}

// AttendanceButtonのProps
export interface AttendanceButtonProps {
  onClick: () => void;
}

// NOTE: DeleteConfirmModalProps は @/components/ui/DeleteConfirmModal に移設済み。

// エントリー表示用の型
export interface CompetitionEntryDisplay {
  id: string;
  styleId: number;
  styleName: string;
  entryTime?: number | null;
  note?: string | null;
}

// フォーマット済み練習ログ型
export interface FormattedPracticeLog {
  id: string;
  practiceId: string;
  style: string;
  swim_category?: "Swim" | "Pull" | "Kick";
  repCount: number;
  setCount: number;
  distance: number;
  circle: number | null;
  note: string | null;
  video_path?: string | null;
  video_thumbnail_path?: string | null;
  tags: PracticeTag[];
  times: Array<{
    id: string;
    time: number;
    repNumber: number;
    setNumber: number;
  }>;
  created_at?: string;
  updated_at?: string;
}
