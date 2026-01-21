// =============================================================================
// Supabase Database型定義（Web/Mobile共通）
// Supabaseクライアントの型安全性を保証するための型定義
// このファイルは主にSupabaseから自動生成されたスキーマを含む
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          name: string
          gender: number // 0: male, 1: female
          birthday: string | null
          profile_image_path: string | null
          bio: string | null
          google_calendar_enabled: boolean
          google_calendar_refresh_token: string | null // pgsodiumで暗号化済み（BYTEA型、nonce(24 bytes) + encrypted_token形式）
          google_calendar_sync_practices: boolean
          google_calendar_sync_competitions: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          gender?: number // デフォルト: 0 (male)
          birthday?: string | null
          profile_image_path?: string | null
          bio?: string | null
          google_calendar_enabled?: boolean
          google_calendar_refresh_token?: string | null // pgsodiumで暗号化済み（BYTEA型、nonce(24 bytes) + encrypted_token形式）
          google_calendar_sync_practices?: boolean
          google_calendar_sync_competitions?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          gender?: number
          birthday?: string | null
          profile_image_path?: string | null
          bio?: string | null
          google_calendar_enabled?: boolean
          google_calendar_refresh_token?: string | null // pgsodiumで暗号化済み（BYTEA型、nonce(24 bytes) + encrypted_token形式）
          google_calendar_sync_practices?: boolean
          google_calendar_sync_competitions?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      styles: {
        Row: {
          id: number
          name_jp: string
          name: string
          style: 'fr' | 'br' | 'ba' | 'fly' | 'im'
          distance: number
        }
        Insert: {
          id: number
          name_jp: string
          name: string
          style: 'fr' | 'br' | 'ba' | 'fly' | 'im'
          distance: number
        }
        Update: {
          id?: number
          name_jp?: string
          name?: string
          style?: 'fr' | 'br' | 'ba' | 'fly' | 'im'
          distance?: number
        }
      }
      competitions: {
        Row: {
          id: string
          title: string | null
          date: string
          end_date: string | null
          place: string | null
          pool_type: number // 0: short, 1: long
          note: string | null
          user_id: string | null
          team_id: string | null
          created_by: string | null
          entry_status: 'before' | 'open' | 'closed'
          attendance_status: 'open' | 'closed' | null
          google_event_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title?: string | null
          date: string
          end_date?: string | null
          place?: string | null
          pool_type?: number // デフォルト: 0 (short)
          note?: string | null
          user_id?: string | null
          team_id?: string | null
          created_by?: string | null
          entry_status?: 'before' | 'open' | 'closed'
          attendance_status?: 'open' | 'closed' | null
          google_event_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string | null
          date?: string
          end_date?: string | null
          place?: string | null
          pool_type?: number
          note?: string | null
          user_id?: string | null
          team_id?: string | null
          created_by?: string | null
          entry_status?: 'before' | 'open' | 'closed'
          attendance_status?: 'open' | 'closed' | null
          google_event_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      competition_images: {
        Row: {
          id: string
          competition_id: string
          user_id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          file_size: number
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          competition_id: string
          user_id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          file_size: number
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          competition_id?: string
          user_id?: string
          original_path?: string
          thumbnail_path?: string
          file_name?: string
          file_size?: number
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      practices: {
        Row: {
          id: string
          user_id: string
          date: string
          title: string | null
          place: string | null
          note: string | null
          team_id: string | null
          created_by: string | null
          attendance_status: 'open' | 'closed' | null
          google_event_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          title?: string | null
          place?: string | null
          note?: string | null
          team_id?: string | null
          created_by?: string | null
          attendance_status?: 'open' | 'closed' | null
          google_event_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          title?: string | null
          place?: string | null
          note?: string | null
          team_id?: string | null
          created_by?: string | null
          attendance_status?: 'open' | 'closed' | null
          google_event_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      records: {
        Row: {
          id: string
          user_id: string
          competition_id: string | null
          style_id: number
          time: number
          video_url: string | null
          note: string | null
        }
        Insert: {
          id?: string
          user_id: string
          competition_id?: string | null
          style_id: number
          time: number
          video_url?: string | null
          note?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          competition_id?: string | null
          style_id?: number
          time?: number
          video_url?: string | null
          note?: string | null
        }
      }
      split_times: {
        Row: {
          id: string
          record_id: string
          distance: number
          split_time: number
        }
        Insert: {
          id?: string
          record_id: string
          distance: number
          split_time: number
        }
        Update: {
          id?: string
          record_id?: string
          distance?: number
          split_time?: number
        }
      }
      practice_logs: {
        Row: {
          id: string
          user_id: string
          date: string
          practice_id: string
          style: string
          swim_category: 'Swim' | 'Pull' | 'Kick'
          rep_count: number
          set_count: number
          distance: number
          circle: number | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date?: string
          practice_id: string
          style: string
          swim_category?: 'Swim' | 'Pull' | 'Kick'
          rep_count: number
          set_count: number
          distance: number
          circle?: number | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          practice_id?: string
          style?: string
          swim_category?: 'Swim' | 'Pull' | 'Kick'
          rep_count?: number
          set_count?: number
          distance?: number
          circle?: number | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      practice_images: {
        Row: {
          id: string
          practice_id: string
          user_id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          file_size: number
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          user_id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          file_size: number
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          user_id?: string
          original_path?: string
          thumbnail_path?: string
          file_name?: string
          file_size?: number
          display_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      practice_times: {
        Row: {
          id: string
          practice_log_id: string
          rep_number: number
          set_number: number
          time: number
        }
        Insert: {
          id?: string
          practice_log_id: string
          rep_number: number
          set_number: number
          time: number
        }
        Update: {
          id?: string
          practice_log_id?: string
          rep_number?: number
          set_number?: number
          time?: number
        }
      }
      practice_tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
      }
      practice_log_tags: {
        Row: {
          id: string
          practice_log_id: string
          practice_tag_id: string
          created_at: string
        }
        Insert: {
          id?: string
          practice_log_id: string
          practice_tag_id: string
          created_at?: string
        }
        Update: {
          id?: string
          practice_log_id?: string
          practice_tag_id?: string
          created_at?: string
        }
      }
      team_memberships: {
        Row: {
          id: string
          team_id: string
          user_id: string
          role: 'admin' | 'user'
          is_active: boolean
          joined_at: string
          left_at: string | null
        }
        Insert: {
          id?: string
          team_id: string
          user_id: string
          role?: 'admin' | 'user'
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
        }
        Update: {
          id?: string
          team_id?: string
          user_id?: string
          role?: 'admin' | 'user'
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
        }
      }
      entries: {
        Row: {
          id: string
          team_id: string | null
          competition_id: string
          user_id: string
          style_id: number
          entry_time: number | null
          note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          team_id?: string | null
          competition_id: string
          user_id: string
          style_id: number
          entry_time?: number | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          team_id?: string | null
          competition_id?: string
          user_id?: string
          style_id?: number
          entry_time?: number | null
          note?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      set_google_refresh_token: {
        Args: {
          p_user_id: string
          p_token: string | null
        }
        Returns: null
      }
      get_google_refresh_token: {
        Args: {
          p_user_id: string
        }
        Returns: string | null
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Supabase Client型
export type SupabaseClientType = SupabaseClient<Database>
