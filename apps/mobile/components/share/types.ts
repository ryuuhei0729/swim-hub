// =============================================================================
// シェアカード用型定義 (mobile) - Swim Hub
// web apps/web/components/share/types.ts の RN 向け移植。
// CompetitionShareData は元々 CompetitionShareCard.tsx 内で定義されていたが、
// PracticeShareData 追加に合わせてここへ集約する（CompetitionShareCard.tsx は
// 後方互換のため re-export する）。
// =============================================================================

/** 大会記録シェアカード用データ（web CompetitionShareData のモバイル版） */
export interface CompetitionShareData {
  competitionName: string;
  /** 表示用に整形済みの日付文字列 */
  date: string;
  place: string;
  poolType: "short" | "long";
  eventName: string;
  raceDistance: number;
  time: number;
  reactionTime?: number;
  splitTimes?: Array<{ distance: number; split_time: number }>;
  /** その種目の初記録（過去記録なし）→「初」バッジ */
  isFirstRecord?: boolean;
  previousBest?: number;
}

/** 練習メニューシェアカード用データ（web PracticeShareData のモバイル版） */
export interface PracticeShareData {
  /** 表示用に整形済みの日付文字列 */
  date: string;
  title: string;
  place?: string;
  note?: string;
  menuItems: PracticeMenuItem[];
  /** 合計距離（m） = Σ(distance*repCount*setCount) */
  totalDistance: number;
  /** 合計セット数 = Σ(setCount) */
  totalSets: number;
}

/** 練習メニュー項目（練習ログ1件に対応） */
export interface PracticeMenuItem {
  /** 種目コード（Fr/Ba/Br/Fly/IM 等） */
  style: string;
  category: "Swim" | "Pull" | "Kick";
  /** 1本あたりの距離 */
  distance: number;
  repCount: number;
  setCount: number;
  /** サークル（秒） */
  circle?: number;
  times?: PracticeTimeItem[];
  note?: string;
  tags?: Array<{ name: string; color: string }>;
}

/** 練習タイム項目 */
export interface PracticeTimeItem {
  setNumber: number;
  repNumber: number;
  /** 秒単位 */
  time: number;
}
