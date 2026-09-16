export interface MemberDetail {
  id: string;
  user_id: string;
  role: "admin" | "user";
  is_active: boolean;
  joined_at: string;
  // optional: 呼び出し元の select 漏れ・古いキャッシュでは無い場合がある。
  // undefined は「泳者」として扱う (apps/shared/utils/swimmerFilter.ts と同じ判定)。
  is_swimmer?: boolean;
  users: {
    id: string;
    name: string;
    birthday?: string;
    bio?: string;
    profile_image_path?: string | null;
    gender?: number; // 0: 男性, 1: 女性, undefined: 不明 (WAポイントは常に「—」)
  };
}

export interface BestTime {
  id: string;
  time: number;
  created_at: string;
  pool_type: number; // 0: 短水路, 1: 長水路
  is_relaying: boolean;
  note?: string; // 備考（一括登録時に使用）
  style: {
    name_jp: string;
    distance: number;
  };
  competition?: {
    title: string;
    date: string;
  };
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string;
    time: number;
    created_at: string;
    note?: string;
    competition?: {
      title: string;
      date: string;
    };
  };
}

export interface RelayingTimeRecord {
  id: string;
  time: number;
  created_at: string;
  note?: string;
  competition?: {
    title: string;
    date: string;
  };
}

export type TabType = "all" | "short" | "long";
