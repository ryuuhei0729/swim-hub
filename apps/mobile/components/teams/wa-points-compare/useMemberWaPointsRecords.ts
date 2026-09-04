// =============================================================================
// useMemberWaPointsRecords - 「WAポイントで比較」モーダル用データ取得フック
// =============================================================================
//
// web の useMemberBestTimes.ts (apps/web/components/team/shared/hooks) は
// メンバーごとに個別クエリを並列発行する N+1 実装だが、モバイル回線では
// レイテンシ・失敗率が悪化するためこのフックでは採用しない。
// `.in("user_id", userIds)` の単一バッチクエリで全メンバー分を一括取得する。
//
// ただし PostgREST の select は GET ベースのため、userIds (UUID 36文字) を無制限に
// 連結すると大規模チーム (100〜200人超) で URL 長制限に接近する。そのため
// USER_ID_CHUNK_SIZE 件ごとにチャンク分割し、チャンク数本 (人数の個別クエリではない)
// を Promise.all で並列発行してマージする。N+1 (メンバー1人1クエリ) には戻さない。
//
// records テーブルには gender が無い (メンバーごとに異なる属性のため) ので、
// WaPointRecordInput の gender は呼び出し側 (WaPointsCompareModal) が
// member.users.gender と合成して組み立てる。このフックはその手前の
// gender を含まない記録配列 (WaPointsSourceRecord[]) を user_id ごとに返す。

import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STYLES,
  STYLE_KEY_MAP,
  getStyleOrderIndex,
  type StyleTranslationKey,
} from "@apps/shared/utils/swimStyles";
import type { PoolType } from "@apps/shared/utils/waPoints";

/** WA ポイント計算用の1記録分の入力 (gender を除く)。 */
export interface WaPointsSourceRecord {
  time: number;
  poolType: PoolType;
  styleKey: StyleTranslationKey;
  distance: number;
}

interface RawStyleJoin {
  name_jp: string;
  distance: number;
}

interface RawRecordRow {
  user_id: string;
  time: number;
  pool_type: number;
  is_relaying: boolean;
  styles: RawStyleJoin | RawStyleJoin[] | null;
}

/**
 * records.styles.name_jp (距離接頭辞つき、例: "100m自由形") から
 * StyleTranslationKey (例: "Fr") を導出する。対応する種目が無ければ null。
 * (apps/web の WaPointsCompareModal.tsx toStyleKey と同じロジック)
 */
function toStyleKey(nameJp: string): StyleTranslationKey | null {
  const index = getStyleOrderIndex(nameJp);
  if (index === -1) return null;
  const styleName = STYLES[index];
  if (!styleName) return null; // 理論上ここには来ないが、STYLES と STYLE_KEY_MAP の
                                // 対応が将来ズレた場合に silent undefined を防ぐ
  return STYLE_KEY_MAP[styleName];
}

/**
 * 1回の `.in("user_id", ...)` クエリに含める userIds の上限。
 * PostgREST の select は GET ベースのため、UUID (36文字) を無制限に連結すると
 * プロキシ/サーバーの URL 長制限 (8KB 前後) に接近する。100件なら安全マージンが大きい。
 */
const USER_ID_CHUNK_SIZE = 100;

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

interface UseMemberWaPointsRecordsResult {
  recordsByUserId: Map<string, WaPointsSourceRecord[]>;
  loading: boolean;
  error: string | null;
  loadRecords: (userIds: string[]) => Promise<void>;
}

/**
 * チームメンバーの WA ポイント比較用記録をバッチ取得するフック。
 *
 * - is_relaying=true の記録はクエリ (.eq) とクライアント側フィルタの両方で除外する
 *   (要件5: リレー記録は WA ポイント計算対象外)
 * - base time が存在しない種目 (getWaBaseTime が null を返す組合せ) の判定は
 *   呼び出し側の rankMembersByWaPoints に委ねるため、ここでは種目キーが
 *   解決できる記録のみを styleKey 付きで返す
 */
export function useMemberWaPointsRecords(
  supabase: SupabaseClient,
): UseMemberWaPointsRecordsResult {
  const { t } = useTranslation();
  const [recordsByUserId, setRecordsByUserId] = useState<Map<string, WaPointsSourceRecord[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WaPointsCompareModal は loadRecords を visible の変化と memberUserIds の変化の
  // 2経路から呼び出す。モーダルの開閉やメンバー更新で古い呼び出しの Promise.all が
  // 未解決のまま残ることがあり、それが後から解決すると新しい結果を上書きしてしまう。
  // そのため呼び出しごとに連番を発行し、state 更新の直前に「自分が最新の呼び出しか」を
  // 都度判定して古ければ何も更新せずに抜ける。
  const requestIdRef = useRef(0);

  const loadRecords = useCallback(
    async (userIds: string[]) => {
      const requestId = ++requestIdRef.current;
      const isLatest = () => requestIdRef.current === requestId;

      if (userIds.length === 0) {
        if (!isLatest()) return;
        setRecordsByUserId(new Map());
        setError(null);
        setLoading(false);
        return;
      }

      if (!isLatest()) return;
      setLoading(true);
      setError(null);
      try {
        // メンバー1人1クエリ (N+1) には戻さず、USER_ID_CHUNK_SIZE 件ごとの
        // チャンク数本 (大規模チームでも高々数本) を並列発行してマージする。
        const chunks = chunkArray(userIds, USER_ID_CHUNK_SIZE);
        const results = await Promise.all(
          chunks.map((chunkIds) =>
            supabase
              .from("records")
              .select(
                `
                user_id,
                time,
                pool_type,
                is_relaying,
                styles!records_style_id_fkey (
                  name_jp,
                  distance
                )
              `,
              )
              .in("user_id", chunkIds)
              .eq("is_relaying", false),
          ),
        );

        const rows: RawRecordRow[] = [];
        for (const { data, error: fetchError } of results) {
          if (fetchError) throw fetchError;
          rows.push(...((data ?? []) as unknown as RawRecordRow[]));
        }

        const map = new Map<string, WaPointsSourceRecord[]>();
        rows.forEach((record) => {
          // クエリ側で is_relaying=false に絞っているが、要件5 (リレー記録の除外)
          // を構造的に守るためクライアント側でも明示的にフィルタする
          if (record.is_relaying) return;

          const style = Array.isArray(record.styles) ? record.styles[0] : record.styles;
          if (!style) return;

          const styleKey = toStyleKey(style.name_jp);
          if (!styleKey) return;

          // pool_type は 0=短水路/1=長水路。1 以外は 0 として扱う (DB の値は再解釈しない、
          // 想定外値のみ安全な既定値に落とす防御的処理)
          const poolType: PoolType = record.pool_type === 1 ? 1 : 0;

          const list = map.get(record.user_id) ?? [];
          list.push({
            time: record.time,
            poolType,
            styleKey,
            distance: style.distance,
          });
          map.set(record.user_id, list);
        });

        if (!isLatest()) return;
        setRecordsByUserId(map);
      } catch (err) {
        console.error("WAポイント比較用記録の取得エラー:", err);
        if (!isLatest()) return;
        setError(t("teams.memberBestTimesHook.loadError"));
        setRecordsByUserId(new Map());
      } finally {
        if (isLatest()) {
          setLoading(false);
        }
      }
    },
    [supabase, t],
  );

  return { recordsByUserId, loading, error, loadRecords };
}
