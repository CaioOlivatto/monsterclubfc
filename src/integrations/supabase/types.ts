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
      academies: {
        Row: {
          builders: number
          created_at: string
          gems: number
          id: string
          money: number
          paid_4x: boolean
          paid_instant: boolean
          roster_slots: number
          trainer_id: string
          updated_at: string
        }
        Insert: {
          builders?: number
          created_at?: string
          gems?: number
          id?: string
          money?: number
          paid_4x?: boolean
          paid_instant?: boolean
          roster_slots?: number
          trainer_id: string
          updated_at?: string
        }
        Update: {
          builders?: number
          created_at?: string
          gems?: number
          id?: string
          money?: number
          paid_4x?: boolean
          paid_instant?: boolean
          roster_slots?: number
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academies_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          building_type: Database["public"]["Enums"]["building_type"]
          created_at: string
          id: string
          level: number
          trainer_id: string
          updated_at: string
          upgrade_completes_at: string | null
        }
        Insert: {
          building_type: Database["public"]["Enums"]["building_type"]
          created_at?: string
          id?: string
          level?: number
          trainer_id: string
          updated_at?: string
          upgrade_completes_at?: string | null
        }
        Update: {
          building_type?: Database["public"]["Enums"]["building_type"]
          created_at?: string
          id?: string
          level?: number
          trainer_id?: string
          updated_at?: string
          upgrade_completes_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          champion_team_id: string | null
          created_at: string
          division: Database["public"]["Enums"]["division_type"]
          id: string
          season_id: string
          status: string
          trainer_id: string
          type: string
        }
        Insert: {
          champion_team_id?: string | null
          created_at?: string
          division: Database["public"]["Enums"]["division_type"]
          id?: string
          season_id: string
          status?: string
          trainer_id: string
          type?: string
        }
        Update: {
          champion_team_id?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"]
          id?: string
          season_id?: string
          status?: string
          trainer_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      creatures: {
        Row: {
          aff_agua: number
          aff_ar: number
          aff_fogo: number
          aff_gelo: number
          aff_terra: number
          attack: number
          created_at: string
          defense: number
          element: Database["public"]["Enums"]["element_type"]
          energy: number
          goalkeeper: number
          half_stars_earned: number
          id: string
          market_value: number
          name: string
          overall: number
          owner_team_id: string | null
          owner_trainer_id: string | null
          pending_half_stars: number
          physical: number
          strength: number
          suggested_position: string | null
          updated_at: string
          xp: number
        }
        Insert: {
          aff_agua?: number
          aff_ar?: number
          aff_fogo?: number
          aff_gelo?: number
          aff_terra?: number
          attack?: number
          created_at?: string
          defense?: number
          element: Database["public"]["Enums"]["element_type"]
          energy?: number
          goalkeeper?: number
          half_stars_earned?: number
          id?: string
          market_value?: number
          name: string
          overall?: number
          owner_team_id?: string | null
          owner_trainer_id?: string | null
          pending_half_stars?: number
          physical?: number
          strength?: number
          suggested_position?: string | null
          updated_at?: string
          xp?: number
        }
        Update: {
          aff_agua?: number
          aff_ar?: number
          aff_fogo?: number
          aff_gelo?: number
          aff_terra?: number
          attack?: number
          created_at?: string
          defense?: number
          element?: Database["public"]["Enums"]["element_type"]
          energy?: number
          goalkeeper?: number
          half_stars_earned?: number
          id?: string
          market_value?: number
          name?: string
          overall?: number
          owner_team_id?: string | null
          owner_trainer_id?: string | null
          pending_half_stars?: number
          physical?: number
          strength?: number
          suggested_position?: string | null
          updated_at?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "creatures_owner_team_fk"
            columns: ["owner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creatures_owner_trainer_id_fkey"
            columns: ["owner_trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          trainer_id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          id?: string
          trainer_id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          trainer_id?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      game_seasons: {
        Row: {
          ended_at: string | null
          id: string
          is_current: boolean
          season_number: number
          started_at: string
          trainer_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          is_current?: boolean
          season_number: number
          started_at?: string
          trainer_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          is_current?: boolean
          season_number?: number
          started_at?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_seasons_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          id: string
          item_key: string
          quantity: number
          trainer_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          item_key: string
          quantity?: number
          trainer_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          item_key?: string
          quantity?: number
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listings: {
        Row: {
          created_at: string
          creature_snapshot: Json
          id: string
          price: number
          season_id: string
          sold: boolean
          trainer_id: string
        }
        Insert: {
          created_at?: string
          creature_snapshot: Json
          id?: string
          price: number
          season_id: string
          sold?: boolean
          trainer_id: string
        }
        Update: {
          created_at?: string
          creature_snapshot?: Json
          id?: string
          price?: number
          season_id?: string
          sold?: boolean
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      match_events: {
        Row: {
          actor_creature_id: string | null
          actor_team_id: string | null
          created_at: string
          description: string | null
          event_type: string
          id: string
          match_id: string
          minute: number
        }
        Insert: {
          actor_creature_id?: string | null
          actor_team_id?: string | null
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          match_id: string
          minute: number
        }
        Update: {
          actor_creature_id?: string | null
          actor_team_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          match_id?: string
          minute?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_events_actor_creature_id_fkey"
            columns: ["actor_creature_id"]
            isOneToOne: false
            referencedRelation: "creatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_actor_team_id_fkey"
            columns: ["actor_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number | null
          away_team_id: string
          clima: string | null
          competition_id: string | null
          created_at: string
          home_score: number | null
          home_team_id: string
          id: string
          is_friendly: boolean
          played_at: string | null
          round: number | null
          speed_paid: Json
          status: Database["public"]["Enums"]["match_status"]
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          clima?: string | null
          competition_id?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id: string
          id?: string
          is_friendly?: boolean
          played_at?: string | null
          round?: number | null
          speed_paid?: Json
          status?: Database["public"]["Enums"]["match_status"]
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          clima?: string | null
          competition_id?: string | null
          created_at?: string
          home_score?: number | null
          home_team_id?: string
          id?: string
          is_friendly?: boolean
          played_at?: string | null
          round?: number | null
          speed_paid?: Json
          status?: Database["public"]["Enums"]["match_status"]
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read: boolean
          title: string
          trainer_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          read?: boolean
          title: string
          trainer_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read?: boolean
          title?: string
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
          competition_id: string
          draws: number
          goals_against: number
          goals_for: number
          id: string
          losses: number
          points: number
          team_id: string
          wins: number
        }
        Insert: {
          competition_id: string
          draws?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          points?: number
          team_id: string
          wins?: number
        }
        Update: {
          competition_id?: string
          draws?: number
          goals_against?: number
          goals_for?: number
          id?: string
          losses?: number
          points?: number
          team_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_lineups: {
        Row: {
          bench: Json
          created_at: string
          formation: string
          id: string
          starters: Json
          strategy: Database["public"]["Enums"]["strategy_type"]
          trainer_id: string
          updated_at: string
        }
        Insert: {
          bench?: Json
          created_at?: string
          formation?: string
          id?: string
          starters?: Json
          strategy?: Database["public"]["Enums"]["strategy_type"]
          trainer_id: string
          updated_at?: string
        }
        Update: {
          bench?: Json
          created_at?: string
          formation?: string
          id?: string
          starters?: Json
          strategy?: Database["public"]["Enums"]["strategy_type"]
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_lineups_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          competition_id: string
          cpu_strength: number | null
          created_at: string
          id: string
          is_player: boolean
          name: string
          trainer_id: string | null
        }
        Insert: {
          competition_id: string
          cpu_strength?: number | null
          created_at?: string
          id?: string
          is_player?: boolean
          name: string
          trainer_id?: string | null
        }
        Update: {
          competition_id?: string
          cpu_strength?: number | null
          created_at?: string
          id?: string
          is_player?: boolean
          name?: string
          trainer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      trainers: {
        Row: {
          academy_name: string
          created_at: string
          id: string
          level: number
          trainer_name: string
          updated_at: string
          user_id: string
          xp: number
          xp_burst_matches_left: number
          xp_burst_multiplier: number
          xp_burst_until: string | null
        }
        Insert: {
          academy_name: string
          created_at?: string
          id?: string
          level?: number
          trainer_name: string
          updated_at?: string
          user_id: string
          xp?: number
          xp_burst_matches_left?: number
          xp_burst_multiplier?: number
          xp_burst_until?: string | null
        }
        Update: {
          academy_name?: string
          created_at?: string
          id?: string
          level?: number
          trainer_name?: string
          updated_at?: string
          user_id?: string
          xp?: number
          xp_burst_matches_left?: number
          xp_burst_multiplier?: number
          xp_burst_until?: string | null
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          creature_id: string | null
          id: string
          trainer_id: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          creature_id?: string | null
          id?: string
          trainer_id: string
          transfer_type: Database["public"]["Enums"]["transfer_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          creature_id?: string | null
          id?: string
          trainer_id?: string
          transfer_type?: Database["public"]["Enums"]["transfer_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transfers_creature_id_fkey"
            columns: ["creature_id"]
            isOneToOne: false
            referencedRelation: "creatures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      building_type: "ct_treino" | "ct_elemental" | "estadio" | "centro_medico"
      division_type: "bronze" | "prata" | "ouro" | "diamante" | "lendaria"
      element_type: "fogo" | "agua" | "terra" | "ar" | "gelo"
      match_status: "scheduled" | "in_progress" | "finished"
      strategy_type: "ofensiva" | "equilibrada" | "defensiva"
      transaction_type: "income" | "expense"
      transfer_type: "buy" | "sell"
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
    Enums: {
      building_type: ["ct_treino", "ct_elemental", "estadio", "centro_medico"],
      division_type: ["bronze", "prata", "ouro", "diamante", "lendaria"],
      element_type: ["fogo", "agua", "terra", "ar", "gelo"],
      match_status: ["scheduled", "in_progress", "finished"],
      strategy_type: ["ofensiva", "equilibrada", "defensiva"],
      transaction_type: ["income", "expense"],
      transfer_type: ["buy", "sell"],
    },
  },
} as const
