// =============================================================================
// 種目API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { Style } from "../types";

export class StyleAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 全種目取得（固定マスタデータ）
   */
  async getStyles(): Promise<Style[]> {
    const { data, error } = await this.supabase
      .from("styles")
      .select("*")
      .order("id", { ascending: true });

    if (error) throw error;
    return data;
  }

  /**
   * 特定の種目取得
   */
  async getStyle(id: number): Promise<Style> {
    const { data, error } = await this.supabase.from("styles").select("*").eq("id", id).single();

    if (error) throw error;
    return data;
  }

  /**
   * 泳法別の種目取得
   *
   * style 列の照合はケース非依存にする (移行期の暫定措置。恒久固定ではない)。
   * styles.style の CHECK 制約はタイトルケースへ移行済み (Issue #13) だが、
   * デプロイ順序次第で「コードは新ケーシング ("Fr" 等) で問い合わせるが DB は
   * まだ旧ケーシング ("fr" 等)」の窓が生じうる。ilike が救えるのはこの
   * 「コード先行」方向のみで、逆の「migration 先行」方向 (DB を先にタイトル
   * ケースへ移行し、旧コード (`.eq(..., toLowerCase())`) がまだ稼働している状態)
   * は救えない。正しい手順は「コードを100%ロールアウトしてから migration を
   * 適用する」こと。.eq だと上記の窓で 0 件を返しエラーも出ないため気付けない。
   * ilike はワイルドカードを含まない値に対しては大文字小文字を無視した完全一致
   * として働く。旧コードが本番から完全に消えたら .eq に戻す選択肢がある。
   */
  async getStylesByStroke(stroke: string): Promise<Style[]> {
    const { data, error } = await this.supabase
      .from("styles")
      .select("*")
      .ilike("style", stroke)
      .order("distance", { ascending: true });

    if (error) throw error;
    return data;
  }
}
