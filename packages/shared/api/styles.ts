// =============================================================================
// 種目API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { Style } from '../types/database'

export class StyleAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 全種目取得（固定マスタデータ）
   */
  async getStyles(): Promise<Style[]> {
    const { data, error } = await this.supabase
      .from('styles')
      .select('*')
      .order('id', { ascending: true })

    if (error) throw error
    return data
  }

  /**
   * 特定の種目取得
   */
  async getStyle(id: number): Promise<Style> {
    const { data, error } = await this.supabase
      .from('styles')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  /**
   * 泳法別の種目取得
   */
  async getStylesByStroke(stroke: string): Promise<Style[]> {
    const { data, error } = await this.supabase
      .from('styles')
      .select('*')
      .eq('style', stroke)
      .order('distance', { ascending: true })

    if (error) throw error
    return data
  }
}

