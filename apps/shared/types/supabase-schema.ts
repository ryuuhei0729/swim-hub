export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string;
          created_at: string | null;
          created_by: string | null;
          end_at: string | null;
          id: string;
          is_published: boolean | null;
          start_at: string | null;
          team_id: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          content: string;
          created_at?: string | null;
          created_by?: string | null;
          end_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          start_at?: string | null;
          team_id: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          content?: string;
          created_at?: string | null;
          created_by?: string | null;
          end_at?: string | null;
          id?: string;
          is_published?: boolean | null;
          start_at?: string | null;
          team_id?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      app_daily_usage: {
        Row: {
          app: Database["public"]["Enums"]["app_id"];
          daily_tokens_used: number | null;
          id: string;
          last_used_at: string | null;
          usage_count: number;
          usage_date: string;
          user_id: string;
        };
        Insert: {
          app: Database["public"]["Enums"]["app_id"];
          daily_tokens_used?: number | null;
          id?: string;
          last_used_at?: string | null;
          usage_count?: number;
          usage_date?: string;
          user_id: string;
        };
        Update: {
          app?: Database["public"]["Enums"]["app_id"];
          daily_tokens_used?: number | null;
          id?: string;
          last_used_at?: string | null;
          usage_count?: number;
          usage_date?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          attendance_status: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at: string | null;
          created_by: string | null;
          date: string;
          end_date: string | null;
          entry_status: Database["public"]["Enums"]["entry_status_type"];
          google_event_id: string | null;
          id: string;
          image_paths: Json | null;
          ios_calendar_event_id: string | null;
          note: string | null;
          place: string | null;
          pool_type: number;
          team_id: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at?: string | null;
          created_by?: string | null;
          date: string;
          end_date?: string | null;
          entry_status?: Database["public"]["Enums"]["entry_status_type"];
          google_event_id?: string | null;
          id?: string;
          image_paths?: Json | null;
          ios_calendar_event_id?: string | null;
          note?: string | null;
          place?: string | null;
          pool_type?: number;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at?: string | null;
          created_by?: string | null;
          date?: string;
          end_date?: string | null;
          entry_status?: Database["public"]["Enums"]["entry_status_type"];
          google_event_id?: string | null;
          id?: string;
          image_paths?: Json | null;
          ios_calendar_event_id?: string | null;
          note?: string | null;
          place?: string | null;
          pool_type?: number;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competitions_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competitions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      entries: {
        Row: {
          competition_id: string;
          created_at: string | null;
          entry_time: number | null;
          id: string;
          note: string | null;
          style_id: number;
          team_id: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          competition_id: string;
          created_at?: string | null;
          entry_time?: number | null;
          id?: string;
          note?: string | null;
          style_id: number;
          team_id?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          competition_id?: string;
          created_at?: string | null;
          entry_time?: number | null;
          id?: string;
          note?: string | null;
          style_id?: number;
          team_id?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entries_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          achieved_at: string | null;
          competition_id: string;
          created_at: string | null;
          id: string;
          start_time: number | null;
          status: string;
          style_id: number;
          target_time: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          achieved_at?: string | null;
          competition_id: string;
          created_at?: string | null;
          id?: string;
          start_time?: number | null;
          status?: string;
          style_id: number;
          target_time: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          achieved_at?: string | null;
          competition_id?: string;
          created_at?: string | null;
          id?: string;
          start_time?: number | null;
          status?: string;
          style_id?: number;
          target_time?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      milestone_achievements: {
        Row: {
          achieved_at: string | null;
          achieved_value: Json;
          id: string;
          milestone_id: string;
          practice_log_id: string | null;
          record_id: string | null;
        };
        Insert: {
          achieved_at?: string | null;
          achieved_value: Json;
          id?: string;
          milestone_id: string;
          practice_log_id?: string | null;
          record_id?: string | null;
        };
        Update: {
          achieved_at?: string | null;
          achieved_value?: Json;
          id?: string;
          milestone_id?: string;
          practice_log_id?: string | null;
          record_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "milestone_achievements_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["id"];
          },
        ];
      };
      milestones: {
        Row: {
          achieved_at: string | null;
          created_at: string | null;
          deadline: string | null;
          goal_id: string;
          id: string;
          params: Json;
          reflection_done: boolean;
          reflection_note: string | null;
          status: string;
          title: string;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          achieved_at?: string | null;
          created_at?: string | null;
          deadline?: string | null;
          goal_id: string;
          id?: string;
          params: Json;
          reflection_done?: boolean;
          reflection_note?: string | null;
          status?: string;
          title: string;
          type: string;
          updated_at?: string | null;
        };
        Update: {
          achieved_at?: string | null;
          created_at?: string | null;
          deadline?: string | null;
          goal_id?: string;
          id?: string;
          params?: Json;
          reflection_done?: boolean;
          reflection_note?: string | null;
          status?: string;
          title?: string;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_log_tags: {
        Row: {
          created_at: string | null;
          id: string;
          practice_log_id: string;
          practice_tag_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          practice_log_id: string;
          practice_tag_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          practice_log_id?: string;
          practice_tag_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "practice_log_tags_practice_log_id_fkey";
            columns: ["practice_log_id"];
            isOneToOne: false;
            referencedRelation: "practice_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_log_tags_practice_tag_id_fkey";
            columns: ["practice_tag_id"];
            isOneToOne: false;
            referencedRelation: "practice_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_log_templates: {
        Row: {
          circle: number | null;
          created_at: string | null;
          distance: number;
          id: string;
          is_favorite: boolean | null;
          last_used_at: string | null;
          name: string;
          note: string | null;
          rep_count: number;
          set_count: number;
          style: string;
          swim_category: string;
          tag_ids: string[] | null;
          updated_at: string | null;
          use_count: number | null;
          user_id: string;
        };
        Insert: {
          circle?: number | null;
          created_at?: string | null;
          distance?: number;
          id?: string;
          is_favorite?: boolean | null;
          last_used_at?: string | null;
          name: string;
          note?: string | null;
          rep_count?: number;
          set_count?: number;
          style: string;
          swim_category?: string;
          tag_ids?: string[] | null;
          updated_at?: string | null;
          use_count?: number | null;
          user_id: string;
        };
        Update: {
          circle?: number | null;
          created_at?: string | null;
          distance?: number;
          id?: string;
          is_favorite?: boolean | null;
          last_used_at?: string | null;
          name?: string;
          note?: string | null;
          rep_count?: number;
          set_count?: number;
          style?: string;
          swim_category?: string;
          tag_ids?: string[] | null;
          updated_at?: string | null;
          use_count?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      practice_logs: {
        Row: {
          circle: number | null;
          created_at: string | null;
          distance: number;
          id: string;
          note: string | null;
          practice_id: string;
          rep_count: number;
          set_count: number;
          style: string;
          swim_category: Database["public"]["Enums"]["swim_category_enum"];
          updated_at: string | null;
          user_id: string;
          video_path: string | null;
          video_thumbnail_path: string | null;
        };
        Insert: {
          circle?: number | null;
          created_at?: string | null;
          distance: number;
          id?: string;
          note?: string | null;
          practice_id: string;
          rep_count: number;
          set_count: number;
          style: string;
          swim_category?: Database["public"]["Enums"]["swim_category_enum"];
          updated_at?: string | null;
          user_id: string;
          video_path?: string | null;
          video_thumbnail_path?: string | null;
        };
        Update: {
          circle?: number | null;
          created_at?: string | null;
          distance?: number;
          id?: string;
          note?: string | null;
          practice_id?: string;
          rep_count?: number;
          set_count?: number;
          style?: string;
          swim_category?: Database["public"]["Enums"]["swim_category_enum"];
          updated_at?: string | null;
          user_id?: string;
          video_path?: string | null;
          video_thumbnail_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "practice_logs_practice_id_fkey";
            columns: ["practice_id"];
            isOneToOne: false;
            referencedRelation: "practices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_tags: {
        Row: {
          color: string | null;
          created_at: string | null;
          id: string;
          name: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_tags_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      practice_times: {
        Row: {
          created_at: string | null;
          id: string;
          practice_log_id: string;
          rep_number: number;
          set_number: number;
          time: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          practice_log_id: string;
          rep_number: number;
          set_number: number;
          time: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          practice_log_id?: string;
          rep_number?: number;
          set_number?: number;
          time?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "practice_times_practice_log_id_fkey";
            columns: ["practice_log_id"];
            isOneToOne: false;
            referencedRelation: "practice_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practice_times_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      practices: {
        Row: {
          attendance_status: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at: string | null;
          created_by: string | null;
          date: string;
          google_event_id: string | null;
          id: string;
          image_paths: Json | null;
          ios_calendar_event_id: string | null;
          note: string | null;
          place: string | null;
          team_id: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string | null;
        };
        Insert: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at?: string | null;
          created_by?: string | null;
          date: string;
          google_event_id?: string | null;
          id?: string;
          image_paths?: Json | null;
          ios_calendar_event_id?: string | null;
          note?: string | null;
          place?: string | null;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Update: {
          attendance_status?: Database["public"]["Enums"]["attendance_status_type"] | null;
          created_at?: string | null;
          created_by?: string | null;
          date?: string;
          google_event_id?: string | null;
          id?: string;
          image_paths?: Json | null;
          ios_calendar_event_id?: string | null;
          note?: string | null;
          place?: string | null;
          team_id?: string | null;
          title?: string | null;
          updated_at?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "practices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practices_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "practices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      records: {
        Row: {
          competition_id: string | null;
          created_at: string | null;
          id: string;
          is_relaying: boolean;
          note: string | null;
          pool_type: number;
          reaction_time: number | null;
          style_id: number;
          team_id: string | null;
          time: number;
          updated_at: string | null;
          user_id: string;
          video_path: string | null;
          video_thumbnail_path: string | null;
        };
        Insert: {
          competition_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_relaying?: boolean;
          note?: string | null;
          pool_type: number;
          reaction_time?: number | null;
          style_id: number;
          team_id?: string | null;
          time: number;
          updated_at?: string | null;
          user_id: string;
          video_path?: string | null;
          video_thumbnail_path?: string | null;
        };
        Update: {
          competition_id?: string | null;
          created_at?: string | null;
          id?: string;
          is_relaying?: boolean;
          note?: string | null;
          pool_type?: number;
          reaction_time?: number | null;
          style_id?: number;
          team_id?: string | null;
          time?: number;
          updated_at?: string | null;
          user_id?: string;
          video_path?: string | null;
          video_thumbnail_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "records_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "records_style_id_fkey";
            columns: ["style_id"];
            isOneToOne: false;
            referencedRelation: "styles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "records_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "records_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      split_times: {
        Row: {
          created_at: string | null;
          distance: number;
          id: string;
          record_id: string;
          split_time: number;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          distance: number;
          id?: string;
          record_id: string;
          split_time: number;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          distance?: number;
          id?: string;
          record_id?: string;
          split_time?: number;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "split_times_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "records";
            referencedColumns: ["id"];
          },
        ];
      };
      styles: {
        Row: {
          distance: number;
          id: number;
          name: string;
          name_jp: string;
          style: string;
        };
        Insert: {
          distance: number;
          id: number;
          name: string;
          name_jp: string;
          style: string;
        };
        Update: {
          distance?: number;
          id?: number;
          name?: string;
          name_jp?: string;
          style?: string;
        };
        Relationships: [];
      };
      team_attendance: {
        Row: {
          competition_id: string | null;
          created_at: string | null;
          id: string;
          note: string | null;
          practice_id: string | null;
          status: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          competition_id?: string | null;
          created_at?: string | null;
          id?: string;
          note?: string | null;
          practice_id?: string | null;
          status?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          competition_id?: string | null;
          created_at?: string | null;
          id?: string;
          note?: string | null;
          practice_id?: string | null;
          status?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_attendance_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_attendance_practice_id_fkey";
            columns: ["practice_id"];
            isOneToOne: false;
            referencedRelation: "practices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_attendance_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      team_group_memberships: {
        Row: {
          assigned_at: string | null;
          assigned_by: string | null;
          created_at: string | null;
          id: string;
          team_group_id: string;
          user_id: string;
        };
        Insert: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          created_at?: string | null;
          id?: string;
          team_group_id: string;
          user_id: string;
        };
        Update: {
          assigned_at?: string | null;
          assigned_by?: string | null;
          created_at?: string | null;
          id?: string;
          team_group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_group_memberships_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_group_memberships_team_group_id_fkey";
            columns: ["team_group_id"];
            isOneToOne: false;
            referencedRelation: "team_groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_group_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      team_groups: {
        Row: {
          category: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string;
          name: string;
          team_id: string;
          updated_at: string | null;
        };
        Insert: {
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name: string;
          team_id: string;
          updated_at?: string | null;
        };
        Update: {
          category?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          id?: string;
          name?: string;
          team_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "team_groups_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_groups_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      team_memberships: {
        Row: {
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          joined_at: string | null;
          left_at: string | null;
          role: string;
          status: Database["public"]["Enums"]["membership_status_type"];
          team_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          joined_at?: string | null;
          left_at?: string | null;
          role?: string;
          status?: Database["public"]["Enums"]["membership_status_type"];
          team_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          joined_at?: string | null;
          left_at?: string | null;
          role?: string;
          status?: Database["public"]["Enums"]["membership_status_type"];
          team_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          id: string;
          invite_code: string | null;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          invite_code?: string | null;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          invite_code?: string | null;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      token_consumption_log: {
        Row: {
          action_type: string;
          app: Database["public"]["Enums"]["app_id"];
          consumed_at: string;
          created_at: string;
          id: string;
          reference_id: string | null;
          token_source: string;
          user_id: string;
        };
        Insert: {
          action_type: string;
          app: Database["public"]["Enums"]["app_id"];
          consumed_at?: string;
          created_at?: string;
          id?: string;
          reference_id?: string | null;
          token_source: string;
          user_id: string;
        };
        Update: {
          action_type?: string;
          app?: Database["public"]["Enums"]["app_id"];
          consumed_at?: string;
          created_at?: string;
          id?: string;
          reference_id?: string | null;
          token_source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_sessions: {
        Row: {
          created_at: string | null;
          created_at_ts: string | null;
          expires_at: string;
          id: string;
          ip_address: unknown;
          is_active: boolean | null;
          last_activity: string | null;
          session_id: string;
          updated_at: string | null;
          updated_at_ts: string | null;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          created_at_ts?: string | null;
          expires_at: string;
          id?: string;
          ip_address?: unknown;
          is_active?: boolean | null;
          last_activity?: string | null;
          session_id: string;
          updated_at?: string | null;
          updated_at_ts?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          created_at_ts?: string | null;
          expires_at?: string;
          id?: string;
          ip_address?: unknown;
          is_active?: boolean | null;
          last_activity?: string | null;
          session_id?: string;
          updated_at?: string | null;
          updated_at_ts?: string | null;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          created_at: string;
          current_period_start: string | null;
          id: string;
          plan: string;
          premium_expires_at: string | null;
          provider: string | null;
          provider_subscription_id: string | null;
          status: string | null;
          stripe_customer_id: string | null;
          trial_end: string | null;
          trial_start: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_start?: string | null;
          id: string;
          plan?: string;
          premium_expires_at?: string | null;
          provider?: string | null;
          provider_subscription_id?: string | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_start?: string | null;
          id?: string;
          plan?: string;
          premium_expires_at?: string | null;
          provider?: string | null;
          provider_subscription_id?: string | null;
          status?: string | null;
          stripe_customer_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      users: {
        Row: {
          bio: string | null;
          birthday: string | null;
          created_at: string | null;
          gender: number;
          google_calendar_enabled: boolean;
          google_calendar_refresh_token: string | null;
          google_calendar_sync_competitions: boolean;
          google_calendar_sync_practices: boolean;
          id: string;
          ios_calendar_enabled: boolean;
          ios_calendar_sync_competitions: boolean;
          ios_calendar_sync_practices: boolean;
          name: string;
          profile_image_path: string | null;
          updated_at: string | null;
        };
        Insert: {
          bio?: string | null;
          birthday?: string | null;
          created_at?: string | null;
          gender?: number;
          google_calendar_enabled?: boolean;
          google_calendar_refresh_token?: string | null;
          google_calendar_sync_competitions?: boolean;
          google_calendar_sync_practices?: boolean;
          id: string;
          ios_calendar_enabled?: boolean;
          ios_calendar_sync_competitions?: boolean;
          ios_calendar_sync_practices?: boolean;
          name: string;
          profile_image_path?: string | null;
          updated_at?: string | null;
        };
        Update: {
          bio?: string | null;
          birthday?: string | null;
          created_at?: string | null;
          gender?: number;
          google_calendar_enabled?: boolean;
          google_calendar_refresh_token?: string | null;
          google_calendar_sync_competitions?: boolean;
          google_calendar_sync_practices?: boolean;
          id?: string;
          ios_calendar_enabled?: boolean;
          ios_calendar_sync_competitions?: boolean;
          ios_calendar_sync_practices?: boolean;
          name?: string;
          profile_image_path?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      calendar_view: {
        Row: {
          id: string | null;
          item_date: string | null;
          item_type: string | null;
          metadata: Json | null;
          note: string | null;
          place: string | null;
          title: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      find_team_by_invite_code: {
        Args: { p_invite_code: string };
        Returns: {
          id: string;
          invite_code: string;
        }[];
      };
      generate_invite_code: { Args: never; Returns: string };
      get_google_refresh_token: { Args: { p_user_id: string }; Returns: string };
      get_invite_code_by_team_id: {
        Args: { p_team_id: string };
        Returns: string;
      };
      increment_template_use_count: {
        Args: { template_id: string };
        Returns: undefined;
      };
      is_pending_team_member: {
        Args: { target_team_id: string; target_user_id: string };
        Returns: boolean;
      };
      is_team_admin: {
        Args: { target_team_id: string; target_user_id: string };
        Returns: boolean;
      };
      is_team_member: {
        Args: { target_team_id: string; target_user_id: string };
        Returns: boolean;
      };
      replace_practice_log_tags: {
        Args: { p_practice_log_id: string; p_tag_ids: string[] };
        Returns: undefined;
      };
      replace_practice_logs: {
        Args: { p_logs_data: Json; p_practice_id: string };
        Returns: Json;
      };
      set_google_refresh_token: {
        Args: { p_token: string; p_user_id: string };
        Returns: undefined;
      };
      shares_active_team: {
        Args: { target_user_id: string; viewer_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      app_id: "swimhub" | "swimhub_timer" | "swimhub_scanner";
      attendance_status_type: "open" | "closed";
      entry_status_type: "before" | "open" | "closed";
      membership_status_type: "pending" | "approved" | "rejected";
      swim_category_enum: "Swim" | "Pull" | "Kick";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_id: ["swimhub", "swimhub_timer", "swimhub_scanner"],
      attendance_status_type: ["open", "closed"],
      entry_status_type: ["before", "open", "closed"],
      membership_status_type: ["pending", "approved", "rejected"],
      swim_category_enum: ["Swim", "Pull", "Kick"],
    },
  },
} as const;
