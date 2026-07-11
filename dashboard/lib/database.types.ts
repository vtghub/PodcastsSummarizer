// Hand-maintained — reflects supabase/schema.sql + supabase/migrations/002_multi_user.sql + 005_engagement.sql

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      sources: {
        Row: {
          id: string;
          name: string;
          url: string;
          source_type: string;
          domain: string;
          enabled: boolean;
          deleted: boolean;
          user_id: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          url: string;
          source_type: string;
          domain: string;
          enabled?: boolean;
          deleted?: boolean;
          user_id?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          url?: string;
          source_type?: string;
          domain?: string;
          enabled?: boolean;
          deleted?: boolean;
          user_id?: string | null;
          is_public?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      episodes: {
        Row: {
          id: string;
          source_id: string;
          title: string;
          url: string;
          published_at: string;
          duration_seconds: number;
          description: string;
          fetched_at: string;
          status: string;
        };
        Insert: {
          id: string;
          source_id: string;
          title: string;
          url: string;
          published_at: string;
          duration_seconds?: number;
          description?: string;
          fetched_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          source_id?: string;
          title?: string;
          url?: string;
          published_at?: string;
          duration_seconds?: number;
          description?: string;
          fetched_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      transcripts: {
        Row: {
          episode_id: string;
          text: string;
          language: string;
          created_at: string;
        };
        Insert: {
          episode_id: string;
          text: string;
          language?: string;
          created_at?: string;
        };
        Update: {
          episode_id?: string;
          text?: string;
          language?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      insights: {
        Row: {
          id: string;
          episode_id: string;
          source_id: string;
          domain: string;
          date: string;
          summary: string;
          key_points: Json;
          key_quotes: Json;
          action_items: Json;
          tags: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          episode_id: string;
          source_id: string;
          domain: string;
          date: string;
          summary: string;
          key_points?: Json;
          key_quotes?: Json;
          action_items?: Json;
          tags?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          episode_id?: string;
          source_id?: string;
          domain?: string;
          date?: string;
          summary?: string;
          key_points?: Json;
          key_quotes?: Json;
          action_items?: Json;
          tags?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          is_admin: boolean;
          digest_enabled: boolean;
          digest_hour: number;
          digest_domains: string[] | null;
          digest_frequency: string;
          digest_day_of_week: number;
          digest_timezone: string;
          last_visited_at: string | null;
          created_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          is_admin?: boolean;
          digest_enabled?: boolean;
          digest_hour?: number;
          digest_domains?: string[] | null;
          digest_frequency?: string;
          digest_day_of_week?: number;
          digest_timezone?: string;
          last_visited_at?: string | null;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          is_admin?: boolean;
          digest_enabled?: boolean;
          digest_hour?: number;
          digest_domains?: string[] | null;
          digest_frequency?: string;
          digest_day_of_week?: number;
          digest_timezone?: string;
          last_visited_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_subscriptions: {
        Row: {
          user_id: string;
          source_id: string;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          source_id: string;
          enabled?: boolean;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          source_id?: string;
          enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      insight_views: {
        Row: {
          id: number;
          insight_id: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          insight_id: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          insight_id?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      insight_reactions: {
        Row: {
          id: number;
          insight_id: string;
          user_id: string;
          type: string;
          created_at: string;
        };
        Insert: {
          insight_id: string;
          user_id: string;
          type: string;
          created_at?: string;
        };
        Update: {
          insight_id?: string;
          user_id?: string;
          type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      insight_bookmarks: {
        Row: {
          id: number;
          insight_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          insight_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          insight_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      insight_comments: {
        Row: {
          id: number;
          insight_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: {
          insight_id: string;
          user_id: string;
          body: string;
          created_at?: string;
        };
        Update: {
          insight_id?: string;
          user_id?: string;
          body?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      comment_reactions: {
        Row: {
          id: number;
          comment_id: number;
          user_id: string;
          type: string;
          created_at: string;
        };
        Insert: {
          comment_id: number;
          user_id: string;
          type: string;
          created_at?: string;
        };
        Update: {
          comment_id?: number;
          user_id?: string;
          type?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      llm_provider_config: {
        Row: {
          scope: string;
          provider_key: string;
          enabled: boolean;
          priority: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          scope?: string;
          provider_key: string;
          enabled?: boolean;
          priority?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          scope?: string;
          provider_key?: string;
          enabled?: boolean;
          priority?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      backfill_jobs: {
        Row: {
          id: string;
          job_type: string;
          status: string;
          total_items: number;
          processed_items: number;
          succeeded_items: number;
          failed_items: number;
          batch_size: number;
          cursor_created_at: string | null;
          cursor_insight_id: string | null;
          started_at: string;
          updated_at: string;
          completed_at: string | null;
          last_error: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      backfill_failures: {
        Row: {
          id: number;
          job_id: string;
          insight_id: string;
          episode_id: string;
          error_msg: string | null;
          failed_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
