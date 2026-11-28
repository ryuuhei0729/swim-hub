// 大会記録の代理入力画面 (RecordClient / 種目一覧 / 種目の入力) が受け取るデータの型
import type { Competition } from "@apps/shared/types";

export interface RecordTeamMember {
  id: string;
  user_id: string;
  role: string;
  // optional: 呼び出し元の select 漏れ・古いキャッシュでは無い場合がある。
  // undefined は「泳者」として扱う (packages/shared/utils/swimmerFilter.ts と同じ判定)。
  is_swimmer?: boolean;
  users: {
    id: string;
    name: string;
    /**
     * `users.gender` (0=男性 / 1=女性)。DB は integer NOT NULL DEFAULT 0 + CHECK(0,1)。
     * `relay_records.gender_category` の prefill に使う。
     *
     * **optional にしてはいけない。** 唯一の呼び出し元 `_server/RecordDataLoader.tsx`
     * は select に `gender` を入れて必ず渡している。optional にすると、将来 select から
     * `gender` が落ちたときに `memberGenderByUserId` が空の Map になり、
     * **全リレーが静かに `mixed` で保存されて男子/女子フィルタから消える**
     * (例外もログも出ない)。必須にしておけばその変更は型で落ちる。
     * ⚠️ `?? 0` で埋めてはいけない (「不明」が「男性」として静かに確定する)。
     */
    gender: number;
  };
}

export interface RecordCompetition extends Competition {
  team: {
    id: string;
    name: string;
  } | null;
}

export interface RecordWithDetails {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  video_path: string | null;
  note: string | null;
  is_relaying: boolean;
  pool_type: number | null;
  team_id: string | null;
  reaction_time?: number | null;
  split_times: {
    id: string;
    distance: number;
    split_time: number;
  }[];
  users: {
    id: string;
    name: string;
  } | null;
  styles: {
    id: number;
    name_jp: string;
    distance: number;
  } | null;
}

export interface EntryWithUser {
  id: string;
  user_id: string;
  style_id: number;
  entry_time: number | null;
  note: string | null;
  users: {
    id: string;
    name: string;
  } | null;
}
