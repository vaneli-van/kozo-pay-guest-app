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
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number | null
          sentiment: string | null
          session_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          sentiment?: string | null
          session_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number | null
          sentiment?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
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
      payment_attempts: {
        Row: {
          amount_pesewas: number
          bill_id: string | null
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          method: string | null
          provider: string
          provider_ref: string | null
          session_id: string
          share_mode: string | null
          status: string
          tip_pesewas: number
          total_pesewas: number
          updated_at: string
        }
        Insert: {
          amount_pesewas: number
          bill_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          method?: string | null
          provider: string
          provider_ref?: string | null
          session_id: string
          share_mode?: string | null
          status?: string
          tip_pesewas?: number
          total_pesewas: number
          updated_at?: string
        }
        Update: {
          amount_pesewas?: number
          bill_id?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          method?: string | null
          provider?: string
          provider_ref?: string | null
          session_id?: string
          share_mode?: string | null
          status?: string
          tip_pesewas?: number
          total_pesewas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
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
      receipts: {
        Row: {
          bill_id: string | null
          created_at: string
          id: string
          issued_at: string
          receipt_number: string
          session_id: string
          total_paid_pesewas: number
        }
        Insert: {
          bill_id?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          receipt_number: string
          session_id: string
          total_paid_pesewas?: number
        }
        Update: {
          bill_id?: string | null
          created_at?: string
          id?: string
          issued_at?: string
          receipt_number?: string
          session_id?: string
          total_paid_pesewas?: number
        }
        Relationships: [
          {
            foreignKeyName: "receipts_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
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
      rewards_activity: {
        Row: {
          consent_id: string | null
          created_at: string
          id: string
          phone: string
          points: number
          reason: string | null
        }
        Insert: {
          consent_id?: string | null
          created_at?: string
          id?: string
          phone: string
          points?: number
          reason?: string | null
        }
        Update: {
          consent_id?: string | null
          created_at?: string
          id?: string
          phone?: string
          points?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rewards_activity_consent_id_fkey"
            columns: ["consent_id"]
            isOneToOne: false
            referencedRelation: "rewards_consent"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards_consent: {
        Row: {
          consent_version: string
          created_at: string
          first_name: string | null
          id: string
          marketing_consent: boolean
          phone: string
          receipt_consent: boolean
          restaurant_id: string | null
          rewards_consent: boolean
          session_id: string
        }
        Insert: {
          consent_version?: string
          created_at?: string
          first_name?: string | null
          id?: string
          marketing_consent?: boolean
          phone: string
          receipt_consent?: boolean
          restaurant_id?: string | null
          rewards_consent?: boolean
          session_id: string
        }
        Update: {
          consent_version?: string
          created_at?: string
          first_name?: string | null
          id?: string
          marketing_consent?: boolean
          phone?: string
          receipt_consent?: boolean
          restaurant_id?: string | null
          rewards_consent?: boolean
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_consent_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
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
