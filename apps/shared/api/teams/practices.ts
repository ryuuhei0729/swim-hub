// =============================================================================
// チームAPI - practices（チーム練習のCRUD）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { Practice, PracticeInsert, PracticeUpdate } from '../../types'

export class TeamPracticesAPI {
  constructor(private supabase: SupabaseClient) {}

  async list(teamId: string): Promise<Practice[]> {
    const { data, error } = await this.supabase
      .from('practices')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: false })
    if (error) throw error
    return data as Practice[]
  }

  async create(input: PracticeInsert): Promise<Practice> {
    const { data, error } = await this.supabase
      .from('practices')
      .insert(input)
      .select('*')
      .single()
    if (error) throw error
    return data as Practice
  }

  async update(id: string, updates: PracticeUpdate): Promise<Practice> {
    const { data, error } = await this.supabase
      .from('practices')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Practice
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('practices')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export type { Practice, PracticeInsert, PracticeUpdate }


