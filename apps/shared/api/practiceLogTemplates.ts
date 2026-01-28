// =============================================================================
// 練習ログテンプレート API クラス
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  PracticeLogTemplate,
  CreatePracticeLogTemplateInput,
} from '../types/practiceLogTemplate'

export class PracticeLogTemplateAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // テンプレート取得
  // =========================================================================

  /**
   * テンプレート一覧を取得
   * お気に入り順 → 使用回数順でソート
   */
  async getTemplates(): Promise<PracticeLogTemplate[]> {
    const { data, error } = await this.supabase
      .from('practice_log_templates')
      .select('*')
      .order('is_favorite', { ascending: false })
      .order('use_count', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  /**
   * テンプレートを1件取得
   */
  async getTemplate(templateId: string): Promise<PracticeLogTemplate | null> {
    const { data, error } = await this.supabase
      .from('practice_log_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data
  }

  /**
   * テンプレート数を取得
   */
  async countTemplates(): Promise<number> {
    const { count, error } = await this.supabase
      .from('practice_log_templates')
      .select('*', { count: 'exact', head: true })

    if (error) throw error
    return count || 0
  }

  // =========================================================================
  // テンプレート作成
  // =========================================================================

  /**
   * テンプレートを作成
   */
  async createTemplate(
    input: CreatePracticeLogTemplateInput
  ): Promise<PracticeLogTemplate> {
    // 認証ユーザーのIDを取得
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data, error } = await this.supabase
      .from('practice_log_templates')
      .insert({
        user_id: user.id,
        name: input.name,
        style: input.style,
        swim_category: input.swim_category,
        distance: input.distance,
        rep_count: input.rep_count,
        set_count: input.set_count,
        circle: input.circle ?? null,
        note: input.note ?? null,
        tag_ids: input.tag_ids || [],
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // =========================================================================
  // テンプレート更新
  // =========================================================================

  /**
   * テンプレートを更新
   */
  async updateTemplate(
    templateId: string,
    input: Partial<CreatePracticeLogTemplateInput>
  ): Promise<PracticeLogTemplate> {
    const { data, error } = await this.supabase
      .from('practice_log_templates')
      .update({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.style !== undefined && { style: input.style }),
        ...(input.swim_category !== undefined && { swim_category: input.swim_category }),
        ...(input.distance !== undefined && { distance: input.distance }),
        ...(input.rep_count !== undefined && { rep_count: input.rep_count }),
        ...(input.set_count !== undefined && { set_count: input.set_count }),
        ...(input.circle !== undefined && { circle: input.circle }),
        ...(input.note !== undefined && { note: input.note }),
        ...(input.tag_ids !== undefined && { tag_ids: input.tag_ids }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * テンプレートを使用（use_countをインクリメント）
   */
  async useTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase.rpc('increment_template_use_count', {
      template_id: templateId,
    })

    if (error) throw error
  }

  /**
   * お気に入りを切り替え
   */
  async toggleFavorite(templateId: string): Promise<PracticeLogTemplate> {
    // 現在の状態を取得
    const { data: current, error: fetchError } = await this.supabase
      .from('practice_log_templates')
      .select('is_favorite')
      .eq('id', templateId)
      .single()

    if (fetchError) throw fetchError

    // 反転して更新
    const { data, error } = await this.supabase
      .from('practice_log_templates')
      .update({ is_favorite: !current?.is_favorite })
      .eq('id', templateId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // =========================================================================
  // テンプレート削除
  // =========================================================================

  /**
   * テンプレートを削除
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await this.supabase
      .from('practice_log_templates')
      .delete()
      .eq('id', templateId)

    if (error) throw error
  }
}
