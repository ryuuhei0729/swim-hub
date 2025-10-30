// =============================================================================
// チームAPI - records（チーム大会のCRUD）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { Competition, CompetitionInsert, CompetitionUpdate } from '../../types/database'

export class TeamRecordsAPI {
  constructor(private supabase: SupabaseClient) {}

  async list(teamId: string): Promise<Competition[]> {
    const { data, error } = await this.supabase
      .from('competitions')
      .select('*')
      .eq('team_id', teamId)
      .order('date', { ascending: false })
    if (error) throw error
    return data as Competition[]
  }

  async create(input: CompetitionInsert): Promise<Competition> {
    const { data, error } = await this.supabase
      .from('competitions')
      .insert(input as any)
      .select('*')
      .single()
    if (error) throw error
    return data as Competition
  }

  async update(id: string, updates: CompetitionUpdate): Promise<Competition> {
    const { data, error } = await this.supabase
      .from('competitions')
      .update(updates as any)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Competition
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('competitions')
      .delete()
      .eq('id', id)
    if (error) throw error
  }
}

export type { Competition, CompetitionInsert, CompetitionUpdate }


