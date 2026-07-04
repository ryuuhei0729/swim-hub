// =============================================================================
// Zustandストア用型定義
// =============================================================================

import type { PracticeTag } from "@apps/shared/types";
import type { CalendarItem, EntryInfo, TimeEntry } from "@apps/shared/types/ui";

// =============================================================================
// 編集データ型定義（統一）
// =============================================================================

export type EditingData =
  | CalendarItem
  | {
      id?: string;
      type?: string;
      competitionId?: string | null;
      practiceId?: string;
      entryData?: EntryInfo;
      entryDataList?: EntryInfo[];
      metadata?: {
        practice?: { place?: string };
        competition?: { title?: string; place?: string };
        record?: { competitionId?: string | null };
      };
      date?: string;
      note?: string;
      style?: string;
      styleId?: number;
      time?: number;
      isRelaying?: boolean;
      videoPath?: string | null;
      reactionTime?: number | null;
      splitTimes?: Array<{ distance: number; splitTime: number }>;
      // 練習ログ編集用のプロパティ
      swim_category?: "Swim" | "Pull" | "Kick";
      distance?: number;
      rep_count?: number;
      set_count?: number;
      circle?: number | null;
      tags?: PracticeTag[];
      tag_ids?: string[];
      times?: Array<{ memberId: string; times: TimeEntry[] }>;
    }
  | null;

// =============================================================================
// 練習記録フォーム型定義
// =============================================================================

export interface PendingVideoData {
  file: File;
  thumbnail: Blob;
}

export interface PracticeMenuFormData {
  practiceDate?: string;
  title?: string;
  place?: string;
  note?: string;
  style?: string;
  swimCategory?: "Swim" | "Pull" | "Kick";
  reps?: number;
  sets?: number;
  distance?: number;
  circleTime?: number | null;
  tags?: PracticeTag[];
  times?: TimeEntry[];
  /** メニューID。新規ログは一時ID、編集中の既存ログは DB UUID が入る。`computePracticeLogDiff` の toUpdate 判定に使用。 */
  tempMenuId?: string;
  /** 新規作成時の保留動画データ（mutate 成功後に親が直接アップロードする） */
  pendingVideo?: PendingVideoData;
}

export interface EntryFormData {
  id: string;
  styleId: string;
  entryTime: number;
  note: string;
  isRelaying: boolean;
}

// 入力型（フォームで使用） - distanceはstring
export interface RecordFormDataInput {
  styleId: string;
  time: number;
  videoPath?: string | null;
  note?: string | null;
  isRelaying: boolean;
  reactionTime?: string; // 反応時間（秒単位、0.40~1.00程度）
  splitTimes: Array<{
    distance: string | number;
    splitTime: number;
  }>;
  /** 新規作成時の保留動画データ（record UUID 確定後に親が直接アップロードする） */
  pendingVideo?: PendingVideoData;
}

// 内部型（処理済み） - distanceはnumber
export interface RecordFormDataInternal {
  styleId: string;
  time: number;
  videoPath?: string | null;
  note?: string | null;
  isRelaying: boolean;
  reactionTime?: string; // 反応時間（秒単位、0.40~1.00程度）
  splitTimes: Array<{
    distance: number;
    splitTime: number;
  }>;
  /** 新規作成時の保留動画データ（record UUID 確定後に親が直接アップロードする） */
  pendingVideo?: PendingVideoData;
}

// 型変換関数
export const convertRecordFormData = (input: RecordFormDataInput): RecordFormDataInternal => {
  return {
    ...input,
    splitTimes: input.splitTimes
      .map((st) => {
        const distance =
          typeof st.distance === "number"
            ? st.distance
            : st.distance === ""
              ? NaN
              : Number(st.distance);

        // 有効な数値のみ含める
        if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
          return {
            distance,
            splitTime: st.splitTime,
          };
        }
        return null;
      })
      .filter((st): st is { distance: number; splitTime: number } => st !== null),
  };
};

export interface EntryWithStyle {
  id: string;
  competitionId: string;
  userId: string;
  styleId: number;
  entryTime: number | null;
  note: string | null;
  teamId?: string | null;
  styleName?: string;
}

// =============================================================================
// タブモーダル用ドラフト型定義
// =============================================================================

/** 練習タブモーダルのドラフト state */
export interface PracticeModalDraft {
  /** 練習基本情報 */
  basic: {
    date: string;
    title: string;
    place: string;
    note: string;
  };
  /** 練習ログ一覧（ドラフト中）*/
  logs: PracticeMenuFormData[];
  /** 画像データ */
  imageData?: {
    newFiles: Array<{ file: File; previewUrl: string; id: string }>;
    deletedIds: string[];
  };
}

/** 大会タブモーダルのドラフト state */
export interface CompetitionModalDraft {
  /** 大会基本情報 */
  basic: {
    date: string;
    endDate: string;
    title: string;
    place: string;
    poolType: number;
    note: string;
  };
  /** エントリー一覧（ドラフト中）*/
  entries: EntryFormData[];
  /** レコード一覧（ドラフト中）*/
  records: RecordFormDataInput[];
  /** 画像データ */
  imageData?: {
    newFiles: Array<{ file: File; previewUrl: string; id: string }>;
    deletedIds: string[];
  };
}

// =============================================================================
// タブモーダル用ストア型定義
// =============================================================================

/** 練習タブ識別子 */
export type PracticeTabId = "practice" | "practiceLog";

/** 大会タブ識別子 */
export type CompetitionTabId = "competition" | "entry" | "record";

/** 練習タブモーダルのフォーム状態 */
export interface PracticeTabModalState {
  isOpen: boolean;
  activeTab: PracticeTabId;
  /** 編集時の既存練習ID（新規作成完了後も内部的に保持） */
  editingPracticeId: string | null;
  selectedDate: Date | null;
  editingData: EditingData | null;
  isLoading: boolean;
}

/** 大会タブモーダルのフォーム状態 */
export interface CompetitionTabModalState {
  isOpen: boolean;
  activeTab: CompetitionTabId;
  /** 編集時の既存大会ID（新規作成完了後も内部的に保持） */
  editingCompetitionId: string | null;
  selectedDate: Date | null;
  editingData: EditingData | null;
  isLoading: boolean;
  /** 保存済みエントリー（レコードタブで参照）*/
  savedEntries: EntryWithStyle[];
}

