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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      payment_attempts: {
        Row: { id: string; session_id: string; bill_id: string | null; idempotency_key: string; provider: string; method: string | null; share_mode: string | null; amount_pesewas: number; tip_pesewas: number; total_pesewas: number; status: string; provider_ref: string | null; failure_reason: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; session_id: string; bill_id?: string | null; idempotency_key: string; provider: string; method?: string | null; share_mode?: string | null; amount_pesewas: number; tip_pesewas?: number; total_pesewas: number; status?: string; provider_ref?: string | null; failure_reason?: string | null; created_at?: string; updated_at?: string }
        Update: { id?: string; session_id?: string; bill_id?: string | null; idempotency_key?: string; provider?: string; method?: string | null; share_mode?: string | null; amount_pesewas?: number; tip_pesewas?: number; total_pesewas?: number; status?: string; provider_ref?: string | null; failure_reason?: string | null; created_at?: string; updated_at?: string }
        Relationships: []
      }
      receipts: {
        Row: { id: string; session_id: string; bill_id: string | null; receipt_number: string; total_paid_pesewas: number; issued_at: string; created_at: string }
        Insert: { id?: string; session_id: string; bill_id?: string | null; receipt_number: string; total_paid_pesewas?: number; issued_at?: string; created_at?: string }
        Update: { id?: string; session_id?: string; bill_id?: string | null; receipt_number?: string; total_paid_pesewas?: number; issued_at?: string; created_at?: string }
        Relationships: []
      }
      rewards_consent: {
        Row: { id: string; session_id: string; restaurant_id: string | null; phone: string; first_name: string | null; receipt_consent: boolean; rewards_consent: boolean; marketing_consent: boolean; consent_version: string; created_at: string }
        Insert: { id?: string; session_id: string; restaurant_id?: string | null; phone: string; first_name?: string | null; receipt_consent?: boolean; rewards_consent?: boolean; marketing_consent?: boolean; consent_version?: string; created_at?: string }
        Update: { id?: string; session_id?: string; restaurant_id?: string | null; phone?: string; first_name?: string | null; receipt_consent?: boolean; rewards_consent?: boolean; marketing_consent?: boolean; consent_version?: string; created_at?: string }
        Relationships: []
      }
      rewards_activity: {
        Row: { id: string; consent_id: string | null; phone: string; points: number; reason: string | null; created_at: string }
        Insert: { id?: string; consent_id?: string | null; phone: string; points?: number; reason?: string | null; created_at?: string }
        Update: { id?: string; consent_id?: string | null; phone?: string; points?: number; reason?: string | null; created_at?: string }
        Relationships: []
      }
      feedback: {
        Row: { id: string; session_id: string; rating: number | null; comment: string | null; sentiment: string | null; created_at: string }
        Insert: { id?: string; session_id: string; rating?: number | null; comment?: string | null; sentiment?: string | null; created_at?: string }
        Update: { id?: string; session_id?: string; rating?: number | null; comment?: string | null; sentiment?: string | null; created_at?: string }
        Relationships: []
      }
      audit_events: {
        Row: {
          created_at: string
          data: Json
          id: string
          session_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          session_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          session_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_disputes: {
        Row: {
          bill_id: string | null
          created_at: string
          id: string
          note: string | null
          session_id: string
          status: string
        }
        Insert: {
          bill_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          session_id: string
          status?: string
        }
        Update: {
          bill_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_disputes_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_disputes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          id: string
          line_total_pesewas: number
          name: string
          qty: number
          sort: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          id?: string
          line_total_pesewas: number
          name: string
          qty?: number
          sort?: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          id?: string
          line_total_pesewas?: number
          name?: string
          qty?: number
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          created_at: string
          id: string
          opened_at: string
          service_charge_pesewas: number
          status: string
          subtotal_pesewas: number
          table_id: string
          total_pesewas: number
        }
        Insert: {
          created_at?: string
          id?: string
          opened_at?: string
          service_charge_pesewas?: number
          status?: string
          subtotal_pesewas?: number
          table_id: string
          total_pesewas?: number
        }
        Update: {
          created_at?: string
          id?: string
          opened_at?: string
          service_charge_pesewas?: number
          status?: string
          subtotal_pesewas?: number
          table_id?: string
          total_pesewas?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_sessions: {
        Row: {
          active_bill_id: string | null
          bill_status: string
          created_at: string
          expires_at: string
          id: string
          session_token: string
          started_at: string
          status: string
          table_id: string
        }
        Insert: {
          active_bill_id?: string | null
          bill_status?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_token: string
          started_at?: string
          status?: string
          table_id: string
        }
        Update: {
          active_bill_id?: string | null
          bill_status?: string
          created_at?: string
          expires_at?: string
          id?: string
          session_token?: string
          started_at?: string
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dining_sessions_active_bill_id_fkey"
            columns: ["active_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dining_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          available: boolean
          category_id: string
          created_at: string
          id: string
          image_key: string | null
          name: string
          price_pesewas: number
          sort: number
          tags: Json
        }
        Insert: {
          available?: boolean
          category_id: string
          created_at?: string
          id?: string
          image_key?: string | null
          name: string
          price_pesewas: number
          sort?: number
          tags?: Json
        }
        Update: {
          available?: boolean
          category_id?: string
          created_at?: string
          id?: string
          image_key?: string | null
          name?: string
          price_pesewas?: number
          sort?: number
          tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          status: string
          table_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          status?: string
          table_id: string
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          status?: string
          table_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_tokens_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          item_id: string | null
          kind: string
          sort: number
          subtitle: string | null
          title: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: string
          sort?: number
          subtitle?: string | null
          title: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: string
          sort?: number
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          label: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          label: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          city: string
          created_at: string
          google_place_id: string | null
          id: string
          name: string
        }
        Insert: {
          city: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      waiter_requests: {
        Row: {
          created_at: string
          id: string
          kind: string
          session_id: string
          status: string
          table_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          session_id: string
          status?: string
          table_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          session_id?: string
          status?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
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
