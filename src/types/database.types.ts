export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          created_at: string
          id: string
          show_id: string | null
          target_user_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          show_id?: string | null
          target_user_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          show_id?: string | null
          target_user_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendances: {
        Row: {
          added_at: string
          id: string
          memory: string | null
          memory_public: boolean
          rating: number | null
          show_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          memory?: string | null
          memory_public?: boolean
          rating?: number | null
          show_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          memory?: string | null
          memory_public?: boolean
          rating?: number | null
          show_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_log: {
        Row: {
          added_to_upcoming: boolean
          decided_at: string
          decision: string
          id: string
          tour_event_id: string
          user_id: string
        }
        Insert: {
          added_to_upcoming?: boolean
          decided_at?: string
          decision: string
          id?: string
          tour_event_id: string
          user_id: string
        }
        Update: {
          added_to_upcoming?: boolean
          decided_at?: string
          decision?: string
          id?: string
          tour_event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "interest_log_tour_event_id_fkey"
            columns: ["tour_event_id"]
            isOneToOne: false
            referencedRelation: "tour_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interest_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          home_city: string | null
          id: string
          is_public: boolean
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          home_city?: string | null
          id: string
          is_public?: boolean
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          home_city?: string | null
          id?: string
          is_public?: boolean
          username?: string
        }
        Relationships: []
      }
      shows: {
        Row: {
          artist: string
          city: string
          created_at: string
          created_by: string | null
          date: string
          event: string | null
          id: string
          legacy_id: string | null
          source: string
          special_notes: string | null
          state: string
          venue: string
        }
        Insert: {
          artist: string
          city?: string
          created_at?: string
          created_by?: string | null
          date: string
          event?: string | null
          id?: string
          legacy_id?: string | null
          source?: string
          special_notes?: string | null
          state?: string
          venue?: string
        }
        Update: {
          artist?: string
          city?: string
          created_at?: string
          created_by?: string | null
          date?: string
          event?: string | null
          id?: string
          legacy_id?: string | null
          source?: string
          special_notes?: string | null
          state?: string
          venue?: string
        }
        Relationships: [
          {
            foreignKeyName: "shows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_events: {
        Row: {
          artist_name: string
          date: string
          drive_hours: number | null
          external_id: string
          fetched_at: string
          id: string
          is_festival: boolean
          is_home_market: boolean
          raw: Json | null
          source: string
          ticket_url: string | null
          venue_city: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
          venue_state: string | null
        }
        Insert: {
          artist_name: string
          date: string
          drive_hours?: number | null
          external_id: string
          fetched_at?: string
          id?: string
          is_festival?: boolean
          is_home_market?: boolean
          raw?: Json | null
          source: string
          ticket_url?: string | null
          venue_city?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          venue_state?: string | null
        }
        Update: {
          artist_name?: string
          date?: string
          drive_hours?: number | null
          external_id?: string
          fetched_at?: string
          id?: string
          is_festival?: boolean
          is_home_market?: boolean
          raw?: Json | null
          source?: string
          ticket_url?: string | null
          venue_city?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
          venue_state?: string | null
        }
        Relationships: []
      }
      upcoming_shows: {
        Row: {
          artist: string
          city: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          show_id: string | null
          state: string | null
          ticket_url: string | null
          user_id: string
          venue: string | null
        }
        Insert: {
          artist: string
          city?: string | null
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          show_id?: string | null
          state?: string | null
          ticket_url?: string | null
          user_id: string
          venue?: string | null
        }
        Update: {
          artist?: string
          city?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          show_id?: string | null
          state?: string | null
          ticket_url?: string | null
          user_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upcoming_shows_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upcoming_shows_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "shows_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upcoming_shows_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watched_artists: {
        Row: {
          artist_name: string
          auto_watched: boolean
          created_at: string
          id: string
          last_notified: string | null
          muted: boolean
          relisten_slug: string | null
          show_count: number
          user_id: string
        }
        Insert: {
          artist_name: string
          auto_watched?: boolean
          created_at?: string
          id?: string
          last_notified?: string | null
          muted?: boolean
          relisten_slug?: string | null
          show_count?: number
          user_id: string
        }
        Update: {
          artist_name?: string
          auto_watched?: boolean
          created_at?: string
          id?: string
          last_notified?: string | null
          muted?: boolean
          relisten_slug?: string | null
          show_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watched_artists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist: {
        Row: {
          artist: string
          created_at: string
          id: string
          notes: string | null
          priority: string
          user_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          user_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          id?: string
          notes?: string | null
          priority?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      shows_with_counts: {
        Row: {
          artist: string | null
          attendance_count: number | null
          avg_rating: number | null
          city: string | null
          created_at: string | null
          created_by: string | null
          date: string | null
          event: string | null
          id: string | null
          legacy_id: string | null
          source: string | null
          special_notes: string | null
          state: string | null
          venue: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_archive: {
        Args: { p_user_id: string }
        Returns: {
          added_at: string
          artist: string
          attendance_count: number
          city: string
          date: string
          event: string
          memory: string
          memory_public: boolean
          rating: number
          show_id: string
          special_notes: string
          state: string
          venue: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
