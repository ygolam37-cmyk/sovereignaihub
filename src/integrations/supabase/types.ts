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
      model_registry: {
        Row: {
          created_at: string
          display_name: string
          hf_model_id: string
          id: string
          lane: Database["public"]["Enums"]["model_lane"]
          last_verified_at: string | null
          manifest_sha: string | null
          notes: string | null
          status: Database["public"]["Enums"]["model_status"]
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          hf_model_id: string
          id?: string
          lane: Database["public"]["Enums"]["model_lane"]
          last_verified_at?: string | null
          manifest_sha?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["model_status"]
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          hf_model_id?: string
          id?: string
          lane?: Database["public"]["Enums"]["model_lane"]
          last_verified_at?: string | null
          manifest_sha?: string | null
          notes?: string | null
          status?: Database["public"]["Enums"]["model_status"]
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      model_shards: {
        Row: {
          created_at: string
          id: string
          idx: number
          model_id: string
          sha256: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          idx: number
          model_id: string
          sha256: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          idx?: number
          model_id?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_shards_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "native_models"
            referencedColumns: ["id"]
          },
        ]
      }
      model_verifications: {
        Row: {
          action: string
          checked_at: string
          current_sha: string | null
          drift: boolean
          hf_model_id: string
          id: string
          notes: string | null
          previous_sha: string | null
        }
        Insert: {
          action: string
          checked_at?: string
          current_sha?: string | null
          drift?: boolean
          hf_model_id: string
          id?: string
          notes?: string | null
          previous_sha?: string | null
        }
        Update: {
          action?: string
          checked_at?: string
          current_sha?: string | null
          drift?: boolean
          hf_model_id?: string
          id?: string
          notes?: string | null
          previous_sha?: string | null
        }
        Relationships: []
      }
      native_models: {
        Row: {
          created_at: string
          id: string
          kind: string
          merkle_root: string | null
          name: string
          notes: string | null
          owner_key: string | null
          shard_count: number
          shard_size: number
          size_bytes: number
          status: string
          submitted_by: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          merkle_root?: string | null
          name: string
          notes?: string | null
          owner_key?: string | null
          shard_count?: number
          shard_size?: number
          size_bytes?: number
          status?: string
          submitted_by?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          merkle_root?: string | null
          name?: string
          notes?: string | null
          owner_key?: string | null
          shard_count?: number
          shard_size?: number
          size_bytes?: number
          status?: string
          submitted_by?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      peer_nodes: {
        Row: {
          capabilities: Json
          created_at: string
          id: string
          last_heartbeat: string
          node_key: string
          score: number
          tier: string
        }
        Insert: {
          capabilities?: Json
          created_at?: string
          id?: string
          last_heartbeat?: string
          node_key: string
          score?: number
          tier?: string
        }
        Update: {
          capabilities?: Json
          created_at?: string
          id?: string
          last_heartbeat?: string
          node_key?: string
          score?: number
          tier?: string
        }
        Relationships: []
      }
      shard_replicas: {
        Row: {
          id: string
          node_key: string
          shard_id: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          id?: string
          node_key: string
          shard_id: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          id?: string
          node_key?: string
          shard_id?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shard_replicas_shard_id_fkey"
            columns: ["shard_id"]
            isOneToOne: false
            referencedRelation: "model_shards"
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
      model_lane: "fast" | "reasoning" | "code" | "creative"
      model_status: "pending" | "approved" | "quarantined" | "rejected"
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
      model_lane: ["fast", "reasoning", "code", "creative"],
      model_status: ["pending", "approved", "quarantined", "rejected"],
    },
  },
} as const
