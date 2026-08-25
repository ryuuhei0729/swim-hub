/**
 * RecordLogForm関連の型定義
 */

import { EntryInfo } from "@apps/shared/types/ui";
import type { PendingVideoData } from "@/stores/types";

// SplitTimeRow型定義（editData用のcamelCase型）
export type SplitTimeRow = {
  distance: number;
  splitTime: number;
};

// フォーム内部状態用のスプリットタイム型
export interface SplitTimeDraft {
  distance: number | string;
  splitTime: number;
  splitTimeDisplayValue?: string;
  uiKey?: string;
}

// フォーム内部状態用
export interface RecordLogFormState {
  styleId: string;
  time: number;
  timeDisplayValue?: string;
  isRelaying: boolean;
  splitTimes: SplitTimeDraft[];
  note: string;
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
  reactionTime: string;
  /** 新規作成時の保留動画データ（record UUID 確定後に親が直接アップロードする） */
  pendingVideo?: PendingVideoData;
  /** 代理入力済み等、既存の records 行の ID (initialRecords 経由で復元)。
   * 送信側はこれの有無で UPDATE (既存行) / INSERT (新規行) を分岐する */
  existingRecordId?: string;
  /** 読み込み時点 (initialRecords 構築時) の既存記録の is_relaying。
   * ユーザーがフォーム上の isRelaying トグルを操作しても書き換わらない固定値。
   * split_times の書き込み判定はこの値を使う (フォーム上の isRelaying で判定すると
   * トグル操作でぶれる) */
  existingRecordWasRelaying?: boolean;
}

// 送信用
export interface RecordLogFormData {
  styleId: string;
  time: number;
  timeDisplayValue?: string;
  isRelaying: boolean;
  splitTimes: Array<{ distance: number; splitTime: number }>;
  note: string;
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
  reactionTime: string;
  /** 新規作成時の保留動画データ（record UUID 確定後に親が直接アップロードする） */
  pendingVideo?: PendingVideoData;
  /** 既存の records 行の ID。存在する場合、呼び出し側は UPDATE すべき (INSERT による重複防止) */
  existingRecordId?: string;
  /** 読み込み時点の既存記録の is_relaying (現在のフォームの isRelaying トグルとは独立)。
   * split_times の書き込み判定に使う */
  existingRecordWasRelaying?: boolean;
}

export interface RecordLogEditData {
  id?: string;
  styleId?: number;
  time?: number;
  isRelaying?: boolean;
  splitTimes?: SplitTimeRow[];
  note?: string;
  videoPath?: string | null;
  videoThumbnailPath?: string | null;
  reactionTime?: number | null;
}

export interface StyleOption {
  id: string | number;
  nameJp: string;
  distance: number;
}

export interface RecordLogFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dataList: RecordLogFormData[]) => Promise<void>;
  competitionId: string;
  competitionTitle?: string;
  competitionDate?: string;
  /** プールタイプ（0: 短水路, 1: 長水路） */
  poolType?: number;
  editData?: RecordLogEditData | null;
  /** 複数レコードを一括初期化する場合に使用 (editData より優先される)。
   * 代理入力済みの既存記録を復元する用途などで、entryDataList と同じ順序で渡す */
  initialRecords?: RecordLogEditData[];
  isLoading?: boolean;
  styles?: StyleOption[];
  entryDataList?: EntryInfo[];
}
