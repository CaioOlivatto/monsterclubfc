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
          metadata: Json
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
          metadata?: Json
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
          metadata?: Json
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
          age: number
          attr_atacar: number
          attr_concentracao: number
          attr_defender: number
          attr_elasticidade: number
          attr_forca: number
          attr_maos: number
          attr_passar: number
          attr_pique: number
          attr_tecnica: number
          career_season: number
          created_at: string
          element: Database["public"]["Enums"]["element_type"]
          energy: number
          epithet: string
          half_stars_earned: number
          id: string
          injury_matches_remaining: number
          injury_severity: string | null
          is_goalkeeper: boolean
          market_value: number
          morale: number
          name: string
          overall: number
          owner_team_id: string | null
          owner_trainer_id: string | null
          pending_half_stars: number
          power_key: string
          retired: boolean
          species: string
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
          age?: number
          attr_atacar?: number
          attr_concentracao?: number
          attr_defender?: number
          attr_elasticidade?: number
          attr_forca?: number
          attr_maos?: number
          attr_passar?: number
          attr_pique?: number
          attr_tecnica?: number
          career_season?: number
          created_at?: string
          element: Database["public"]["Enums"]["element_type"]
          energy?: number
          epithet?: string
          half_stars_earned?: number
          id?: string
          injury_matches_remaining?: number
          injury_severity?: string | null
          is_goalkeeper?: boolean
          market_value?: number
          morale?: number
          name: string
          overall?: number
          owner_team_id?: string | null
          owner_trainer_id?: string | null
          pending_half_stars?: number
          power_key?: string
          retired?: boolean
          species?: string
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
          age?: number
          attr_atacar?: number
          attr_concentracao?: number
          attr_defender?: number
          attr_elasticidade?: number
          attr_forca?: number
          attr_maos?: number
          attr_passar?: number
          attr_pique?: number
          attr_tecnica?: number
          career_season?: number
          created_at?: string
          element?: Database["public"]["Enums"]["element_type"]
          energy?: number
          epithet?: string
          half_stars_earned?: number
          id?: string
          injury_matches_remaining?: number
          injury_severity?: string | null
          is_goalkeeper?: boolean
          market_value?: number
          morale?: number
          name?: string
          overall?: number
          owner_team_id?: string | null
          owner_trainer_id?: string | null
          pending_half_stars?: number
          power_key?: string
          retired?: boolean
          species?: string
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
      epithets: {
        Row: {
          created_at: string
          element: Database["public"]["Enums"]["element_type"]
          epithet: string
          id: string
          is_prepositional: boolean
        }
        Insert: {
          created_at?: string
          element: Database["public"]["Enums"]["element_type"]
          epithet: string
          id?: string
          is_prepositional?: boolean
        }
        Update: {
          created_at?: string
          element?: Database["public"]["Enums"]["element_type"]
          epithet?: string
          id?: string
          is_prepositional?: boolean
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          trainer_id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          trainer_id: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          category?: string | null
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
      job_offers: {
        Row: {
          created_at: string
          division: string
          id: string
          message: string | null
          reason: Database["public"]["Enums"]["job_offer_reason"]
          season_offered: number
          signing_bonus: number
          status: Database["public"]["Enums"]["job_offer_status"]
          team_id: string
          team_name: string
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          division: string
          id?: string
          message?: string | null
          reason: Database["public"]["Enums"]["job_offer_reason"]
          season_offered: number
          signing_bonus?: number
          status?: Database["public"]["Enums"]["job_offer_status"]
          team_id: string
          team_name: string
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          division?: string
          id?: string
          message?: string | null
          reason?: Database["public"]["Enums"]["job_offer_reason"]
          season_offered?: number
          signing_bonus?: number
          status?: Database["public"]["Enums"]["job_offer_status"]
          team_id?: string
          team_name?: string
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_offers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_offers_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      live_matches: {
        Row: {
          cpu_tactics: Json
          created_at: string
          current_minute: number
          ended: boolean
          events_buffered: Json
          match_id: string
          player_tactics: Json
          seed: number
          state: Json
          trainer_id: string
          updated_at: string
        }
        Insert: {
          cpu_tactics: Json
          created_at?: string
          current_minute?: number
          ended?: boolean
          events_buffered?: Json
          match_id: string
          player_tactics: Json
          seed: number
          state: Json
          trainer_id: string
          updated_at?: string
        }
        Update: {
          cpu_tactics?: Json
          created_at?: string
          current_minute?: number
          ended?: boolean
          events_buffered?: Json
          match_id?: string
          player_tactics?: Json
          seed?: number
          state?: Json
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_matches_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_matches_trainer_id_fkey"
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
      market_purchases: {
        Row: {
          bought_at: string
          division: string
          listing_id: string
          season_number: number
          trainer_id: string
        }
        Insert: {
          bought_at?: string
          division: string
          listing_id: string
          season_number: number
          trainer_id: string
        }
        Update: {
          bought_at?: string
          division?: string
          listing_id?: string
          season_number?: number
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_purchases_trainer_id_fkey"
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
          meta: Json | null
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
          meta?: Json | null
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
          meta?: Json | null
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
          division: Database["public"]["Enums"]["division_type"] | null
          finance_summary: Json | null
          home_score: number | null
          home_team_id: string
          id: string
          is_friendly: boolean
          is_live: boolean
          is_summary: boolean
          leg: number | null
          phase: string | null
          played_at: string | null
          round: number | null
          speed_paid: Json
          status: Database["public"]["Enums"]["match_status"]
          tactics_history: Json | null
          tie_group: string | null
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          clima?: string | null
          competition_id?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"] | null
          finance_summary?: Json | null
          home_score?: number | null
          home_team_id: string
          id?: string
          is_friendly?: boolean
          is_live?: boolean
          is_summary?: boolean
          leg?: number | null
          phase?: string | null
          played_at?: string | null
          round?: number | null
          speed_paid?: Json
          status?: Database["public"]["Enums"]["match_status"]
          tactics_history?: Json | null
          tie_group?: string | null
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          clima?: string | null
          competition_id?: string | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"] | null
          finance_summary?: Json | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          is_friendly?: boolean
          is_live?: boolean
          is_summary?: boolean
          leg?: number | null
          phase?: string | null
          played_at?: string | null
          round?: number | null
          speed_paid?: Json
          status?: Database["public"]["Enums"]["match_status"]
          tactics_history?: Json | null
          tie_group?: string | null
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
      qualifications: {
        Row: {
          created_at: string
          id: string
          qualifies_for: string
          season_number: number
          source_division: Database["public"]["Enums"]["division_type"]
          source_position: number
          trainer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          qualifies_for: string
          season_number: number
          source_division: Database["public"]["Enums"]["division_type"]
          source_position: number
          trainer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          qualifies_for?: string
          season_number?: number
          source_division?: Database["public"]["Enums"]["division_type"]
          source_position?: number
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualifications_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      species: {
        Row: {
          base_atacar: number
          base_concentracao: number
          base_defender: number
          base_elasticidade: number
          base_forca: number
          base_maos: number
          base_passar: number
          base_pique: number
          base_tecnica: number
          created_at: string
          element: Database["public"]["Enums"]["element_type"]
          id: string
          is_goalkeeper: boolean
          origin: string
          position_label: string
          position_role: string
          power_desc: string
          power_key: string
          power_name: string
          species: string
        }
        Insert: {
          base_atacar?: number
          base_concentracao?: number
          base_defender?: number
          base_elasticidade?: number
          base_forca?: number
          base_maos?: number
          base_passar?: number
          base_pique?: number
          base_tecnica?: number
          created_at?: string
          element: Database["public"]["Enums"]["element_type"]
          id?: string
          is_goalkeeper?: boolean
          origin: string
          position_label: string
          position_role: string
          power_desc: string
          power_key: string
          power_name: string
          species: string
        }
        Update: {
          base_atacar?: number
          base_concentracao?: number
          base_defender?: number
          base_elasticidade?: number
          base_forca?: number
          base_maos?: number
          base_passar?: number
          base_pique?: number
          base_tecnica?: number
          created_at?: string
          element?: Database["public"]["Enums"]["element_type"]
          id?: string
          is_goalkeeper?: boolean
          origin?: string
          position_label?: string
          position_role?: string
          power_desc?: string
          power_key?: string
          power_name?: string
          species?: string
        }
        Relationships: []
      }
      standings: {
        Row: {
          competition_id: string
          division: Database["public"]["Enums"]["division_type"] | null
          draws: number
          goals_against: number
          goals_for: number
          group_key: string | null
          id: string
          losses: number
          points: number
          team_id: string
          wins: number
        }
        Insert: {
          competition_id: string
          division?: Database["public"]["Enums"]["division_type"] | null
          draws?: number
          goals_against?: number
          goals_for?: number
          group_key?: string | null
          id?: string
          losses?: number
          points?: number
          team_id: string
          wins?: number
        }
        Update: {
          competition_id?: string
          division?: Database["public"]["Enums"]["division_type"] | null
          draws?: number
          goals_against?: number
          goals_for?: number
          group_key?: string | null
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
          default_tactics: Json
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
          default_tactics?: Json
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
          default_tactics?: Json
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
          color: string | null
          colors: Json
          competition_id: string | null
          cpu_strength: number | null
          created_at: string
          division: Database["public"]["Enums"]["division_type"] | null
          dominant_element: Database["public"]["Enums"]["element_type"] | null
          emblem: string | null
          id: string
          is_cpu: boolean
          is_player: boolean
          name: string
          starter_key: string | null
          style: string | null
          trainer_id: string | null
        }
        Insert: {
          color?: string | null
          colors?: Json
          competition_id?: string | null
          cpu_strength?: number | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"] | null
          dominant_element?: Database["public"]["Enums"]["element_type"] | null
          emblem?: string | null
          id?: string
          is_cpu?: boolean
          is_player?: boolean
          name: string
          starter_key?: string | null
          style?: string | null
          trainer_id?: string | null
        }
        Update: {
          color?: string | null
          colors?: Json
          competition_id?: string | null
          cpu_strength?: number | null
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"] | null
          dominant_element?: Database["public"]["Enums"]["element_type"] | null
          emblem?: string | null
          id?: string
          is_cpu?: boolean
          is_player?: boolean
          name?: string
          starter_key?: string | null
          style?: string | null
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
      trainer_career: {
        Row: {
          created_at: string
          division: Database["public"]["Enums"]["division_type"]
          event: string
          final_position: number | null
          id: string
          season_end: number | null
          season_start: number
          team_id: string | null
          team_name: string
          title: string | null
          trainer_id: string
        }
        Insert: {
          created_at?: string
          division: Database["public"]["Enums"]["division_type"]
          event: string
          final_position?: number | null
          id?: string
          season_end?: number | null
          season_start: number
          team_id?: string | null
          team_name: string
          title?: string | null
          trainer_id: string
        }
        Update: {
          created_at?: string
          division?: Database["public"]["Enums"]["division_type"]
          event?: string
          final_position?: number | null
          id?: string
          season_end?: number | null
          season_start?: number
          team_id?: string | null
          team_name?: string
          title?: string | null
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainer_career_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainer_career_trainer_id_fkey"
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
          consecutive_bad_seasons: number
          created_at: string
          current_team_id: string | null
          id: string
          last_final_position: number | null
          last_weekly_gems_at: string | null
          level: number
          pending_level_ups: number
          pending_transition: boolean
          season_xp_breakdown: Json
          seasons_at_current_club: number
          status: string
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
          consecutive_bad_seasons?: number
          created_at?: string
          current_team_id?: string | null
          id?: string
          last_final_position?: number | null
          last_weekly_gems_at?: string | null
          level?: number
          pending_level_ups?: number
          pending_transition?: boolean
          season_xp_breakdown?: Json
          seasons_at_current_club?: number
          status?: string
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
          consecutive_bad_seasons?: number
          created_at?: string
          current_team_id?: string | null
          id?: string
          last_final_position?: number | null
          last_weekly_gems_at?: string | null
          level?: number
          pending_level_ups?: number
          pending_transition?: boolean
          season_xp_breakdown?: Json
          seasons_at_current_club?: number
          status?: string
          trainer_name?: string
          updated_at?: string
          user_id?: string
          xp?: number
          xp_burst_matches_left?: number
          xp_burst_multiplier?: number
          xp_burst_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainers_current_team_id_fkey"
            columns: ["current_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
      world_academies: {
        Row: {
          academy_name: string
          created_at: string
          current_position: number | null
          division: string
          id: string
          is_player: boolean
          last_position: number | null
          level: number
          patrimony: number
          primary_color: string
          secondary_color: string
          team_id: string | null
          trainer_id: string | null
          trainer_name: string
          updated_at: string
          wins: number
          xp: number
        }
        Insert: {
          academy_name: string
          created_at?: string
          current_position?: number | null
          division: string
          id?: string
          is_player?: boolean
          last_position?: number | null
          level?: number
          patrimony?: number
          primary_color?: string
          secondary_color?: string
          team_id?: string | null
          trainer_id?: string | null
          trainer_name: string
          updated_at?: string
          wins?: number
          xp?: number
        }
        Update: {
          academy_name?: string
          created_at?: string
          current_position?: number | null
          division?: string
          id?: string
          is_player?: boolean
          last_position?: number | null
          level?: number
          patrimony?: number
          primary_color?: string
          secondary_color?: string
          team_id?: string | null
          trainer_id?: string | null
          trainer_name?: string
          updated_at?: string
          wins?: number
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "world_academies_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_academies_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: false
            referencedRelation: "trainers"
            referencedColumns: ["id"]
          },
        ]
      }
      world_state: {
        Row: {
          created_at: string
          current_round: number
          season_id: string
          seeded: boolean
          trainer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_round?: number
          season_id: string
          seeded?: boolean
          trainer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_round?: number
          season_id?: string
          seeded?: boolean
          trainer_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "world_state_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_state_trainer_id_fkey"
            columns: ["trainer_id"]
            isOneToOne: true
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
      apply_end_of_season_block: { Args: { payload: Json }; Returns: Json }
    }
    Enums: {
      building_type: "ct_treino" | "ct_elemental" | "estadio" | "centro_medico"
      division_type: "bronze" | "prata" | "ouro" | "diamante" | "lendaria"
      element_type: "fogo" | "agua" | "terra" | "ar" | "gelo"
      job_offer_reason: "top_finish" | "higher_division" | "after_dismissal"
      job_offer_status: "pending" | "accepted" | "declined" | "expired"
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
      job_offer_reason: ["top_finish", "higher_division", "after_dismissal"],
      job_offer_status: ["pending", "accepted", "declined", "expired"],
      match_status: ["scheduled", "in_progress", "finished"],
      strategy_type: ["ofensiva", "equilibrada", "defensiva"],
      transaction_type: ["income", "expense"],
      transfer_type: ["buy", "sell"],
    },
  },
} as const
