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
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          id: string
          metadata: Json
          record_label: string | null
          record_type: string
          restaurant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          created_at?: string
          id?: string
          metadata?: Json
          record_label?: string | null
          record_type: string
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          metadata?: Json
          record_label?: string | null
          record_type?: string
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "activity_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
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
      bill_split_item_assignments: {
        Row: {
          bill_item_id: string
          created_at: string
          id: string
          share_id: string | null
          split_id: string
          weight: number
        }
        Insert: {
          bill_item_id: string
          created_at?: string
          id?: string
          share_id?: string | null
          split_id: string
          weight?: number
        }
        Update: {
          bill_item_id?: string
          created_at?: string
          id?: string
          share_id?: string | null
          split_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_split_item_assignments_bill_item_id_fkey"
            columns: ["bill_item_id"]
            isOneToOne: false
            referencedRelation: "bill_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_split_item_assignments_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "bill_split_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_split_item_assignments_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "bill_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_split_shares: {
        Row: {
          amount_pesewas: number
          claimed_by_name: string | null
          claimed_by_session: string | null
          created_at: string
          id: string
          label: string | null
          payment_attempt_id: string | null
          position: number
          share_token: string
          split_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_pesewas: number
          claimed_by_name?: string | null
          claimed_by_session?: string | null
          created_at?: string
          id?: string
          label?: string | null
          payment_attempt_id?: string | null
          position: number
          share_token: string
          split_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_pesewas?: number
          claimed_by_name?: string | null
          claimed_by_session?: string | null
          created_at?: string
          id?: string
          label?: string | null
          payment_attempt_id?: string | null
          position?: number
          share_token?: string
          split_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_split_shares_claimed_by_session_fkey"
            columns: ["claimed_by_session"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_split_shares_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_split_shares_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_split_shares_split_id_fkey"
            columns: ["split_id"]
            isOneToOne: false
            referencedRelation: "bill_splits"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_splits: {
        Row: {
          bill_id: string
          created_at: string
          created_by_session: string | null
          id: string
          mode: string
          status: string
          total_pesewas: number
          updated_at: string
        }
        Insert: {
          bill_id: string
          created_at?: string
          created_by_session?: string | null
          id?: string
          mode: string
          status?: string
          total_pesewas: number
          updated_at?: string
        }
        Update: {
          bill_id?: string
          created_at?: string
          created_by_session?: string | null
          id?: string
          mode?: string
          status?: string
          total_pesewas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_splits_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_splits_created_by_session_fkey"
            columns: ["created_by_session"]
            isOneToOne: false
            referencedRelation: "dining_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          created_at: string
          id: string
          opened_at: string
          server_name: string | null
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
          server_name?: string | null
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
          server_name?: string | null
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
            referencedRelation: "admin_table_devices"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "bills_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["table_id"]
          },
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
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
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
            referencedRelation: "admin_table_devices"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "dining_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["table_id"]
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
      marketing_leads: {
        Row: {
          created_at: string
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          kind: string
          message: string | null
          name: string | null
          phone: string | null
          restaurant_name: string | null
          source: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind: string
          message?: string | null
          name?: string | null
          phone?: string | null
          restaurant_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          kind?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          restaurant_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      member_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          phone: string
          restaurant_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          phone: string
          restaurant_id?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          phone?: string
          restaurant_id?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "member_profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["branch_id"]
          },
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
      menus: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          name: string
          pos_source: string | null
          status: string
          sync_health: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name: string
          pos_source?: string | null
          status?: string
          sync_health?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          pos_source?: string | null
          status?: string
          sync_health?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "admin_table_devices"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "admin_table_qr"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "menus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
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
          split_share_id: string | null
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
          split_share_id?: string | null
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
          split_share_id?: string | null
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
          {
            foreignKeyName: "payment_attempts_split_share_id_fkey"
            columns: ["split_share_id"]
            isOneToOne: false
            referencedRelation: "bill_split_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          account_name: string | null
          account_number: string | null
          branch: string | null
          created_at: string
          destination_type: string
          id: string
          is_default: boolean
          masked: string | null
          provider: string | null
          restaurant_id: string
          updated_at: string
          verification_status: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          branch?: string | null
          created_at?: string
          destination_type: string
          id?: string
          is_default?: boolean
          masked?: string | null
          provider?: string | null
          restaurant_id: string
          updated_at?: string
          verification_status?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          branch?: string | null
          created_at?: string
          destination_type?: string
          id?: string
          is_default?: boolean
          masked?: string | null
          provider?: string | null
          restaurant_id?: string
          updated_at?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_settings: {
        Row: {
          available_pesewas: number
          min_payout_pesewas: number
          payout_fee_pesewas: number
          pending_pesewas: number
          restaurant_id: string
          schedule: string
          updated_at: string
        }
        Insert: {
          available_pesewas?: number
          min_payout_pesewas?: number
          payout_fee_pesewas?: number
          pending_pesewas?: number
          restaurant_id: string
          schedule?: string
          updated_at?: string
        }
        Update: {
          available_pesewas?: number
          min_payout_pesewas?: number
          payout_fee_pesewas?: number
          pending_pesewas?: number
          restaurant_id?: string
          schedule?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payout_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_pesewas: number
          created_at: string
          destination: string | null
          id: string
          paid_at: string | null
          reference: string
          restaurant_id: string
          scheduled_for: string | null
          status: string
        }
        Insert: {
          amount_pesewas: number
          created_at?: string
          destination?: string | null
          id?: string
          paid_at?: string | null
          reference: string
          restaurant_id: string
          scheduled_for?: string | null
          status?: string
        }
        Update: {
          amount_pesewas?: number
          created_at?: string
          destination?: string | null
          id?: string
          paid_at?: string | null
          reference?: string
          restaurant_id?: string
          scheduled_for?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "payouts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_commands: {
        Row: {
          created_at: string
          done_at: string | null
          id: string
          kind: string
          payload: Json
          picked_at: string | null
          restaurant_id: string
          result: string | null
          status: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          id?: string
          kind: string
          payload?: Json
          picked_at?: string | null
          restaurant_id: string
          result?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          id?: string
          kind?: string
          payload?: Json
          picked_at?: string | null
          restaurant_id?: string
          result?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_commands_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_connections: {
        Row: {
          branch_id: string | null
          created_at: string
          credentials_ref: string | null
          health: string
          id: string
          last_sync_at: string | null
          provider: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          credentials_ref?: string | null
          health?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          credentials_ref?: string | null
          health?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_connections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_connections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_connections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_connections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "pos_connections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_connectors: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_seen_at: string | null
          name: string | null
          provider: string
          restaurant_id: string
          settle_payment_name: string | null
          token: string
          writeback_enabled: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string | null
          provider?: string
          restaurant_id: string
          settle_payment_name?: string | null
          token: string
          writeback_enabled?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string | null
          provider?: string
          restaurant_id?: string
          settle_payment_name?: string | null
          token?: string
          writeback_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_credentials: {
        Row: {
          api_key: string | null
          config: Json
          connection_id: string
          db: string | null
          provider: string | null
          updated_at: string
          updated_by: string | null
          url: string
          username: string | null
        }
        Insert: {
          api_key?: string | null
          config?: Json
          connection_id: string
          db?: string | null
          provider?: string | null
          updated_at?: string
          updated_by?: string | null
          url: string
          username?: string | null
        }
        Update: {
          api_key?: string | null
          config?: Json
          connection_id?: string
          db?: string | null
          provider?: string | null
          updated_at?: string
          updated_by?: string | null
          url?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "pos_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_credentials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_odoo_credentials: {
        Row: {
          active: boolean
          api_key: string
          base_url: string
          db: string
          klown_payment_method_id: number | null
          restaurant_id: string
          updated_at: string
          username: string
          writeback_enabled: boolean
        }
        Insert: {
          active?: boolean
          api_key: string
          base_url: string
          db: string
          klown_payment_method_id?: number | null
          restaurant_id: string
          updated_at?: string
          username?: string
          writeback_enabled?: boolean
        }
        Update: {
          active?: boolean
          api_key?: string
          base_url?: string
          db?: string
          klown_payment_method_id?: number | null
          restaurant_id?: string
          updated_at?: string
          username?: string
          writeback_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
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
            referencedRelation: "admin_table_devices"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "qr_tokens_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["table_id"]
          },
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
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "recommendations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "recommendations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "recommendations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["branch_id"]
          },
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
      refunds: {
        Row: {
          amount_pesewas: number
          created_at: string
          id: string
          payment_attempt_id: string
          provider_ref: string | null
          reason: string | null
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_pesewas: number
          created_at?: string
          id?: string
          payment_attempt_id: string
          provider_ref?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_pesewas?: number
          created_at?: string
          id?: string
          payment_attempt_id?: string
          provider_ref?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_support_tickets: {
        Row: {
          body: string | null
          category: string
          created_at: string
          created_by: string | null
          id: string
          priority: string
          ref: string
          restaurant_id: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          ref: string
          restaurant_id: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          priority?: string
          ref?: string
          restaurant_id?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_support_tickets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "restaurant_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "restaurant_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "restaurant_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["branch_id"]
          },
          {
            foreignKeyName: "restaurant_tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_user_invites: {
        Row: {
          created_at: string
          email: string
          name: string | null
          restaurant_id: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          name?: string | null
          restaurant_id: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          name?: string | null
          restaurant_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_user_invites_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_users: {
        Row: {
          created_at: string
          email: string
          id: string
          restaurant_id: string
          role: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          restaurant_id: string
          role?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          restaurant_id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "restaurant_users_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accent_color: string | null
          city: string
          created_at: string
          google_place_id: string | null
          hero_url: string | null
          id: string
          logo_url: string | null
          name: string
          tagline_bottom: string | null
          tagline_top: string | null
          welcome_copy: string | null
        }
        Insert: {
          accent_color?: string | null
          city: string
          created_at?: string
          google_place_id?: string | null
          hero_url?: string | null
          id?: string
          logo_url?: string | null
          name: string
          tagline_bottom?: string | null
          tagline_top?: string | null
          welcome_copy?: string | null
        }
        Update: {
          accent_color?: string | null
          city?: string
          created_at?: string
          google_place_id?: string | null
          hero_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          tagline_bottom?: string | null
          tagline_top?: string | null
          welcome_copy?: string | null
        }
        Relationships: []
      }
      reward_redemptions: {
        Row: {
          created_at: string
          id: string
          phone: string
          points_spent: number
          reward_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone: string
          points_spent: number
          reward_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string
          points_spent?: number
          reward_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "admin_reward_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          inventory: number | null
          name: string
          points_cost: number
          restaurant_id: string | null
          status: string
          tier_required: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          inventory?: number | null
          name: string
          points_cost: number
          restaurant_id?: string | null
          status?: string
          tier_required?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          inventory?: number | null
          name?: string
          points_cost?: number
          restaurant_id?: string | null
          status?: string
          tier_required?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "admin_subscriber_directory"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "rewards_consent_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
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
      staff: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          last_sign_in_at: string | null
          name: string
          role: Database["public"]["Enums"]["staff_role"]
          status: string
          team: string | null
          twofa_enabled: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          invited_by?: string | null
          last_sign_in_at?: string | null
          name?: string
          role?: Database["public"]["Enums"]["staff_role"]
          status?: string
          team?: string | null
          twofa_enabled?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          last_sign_in_at?: string | null
          name?: string
          role?: Database["public"]["Enums"]["staff_role"]
          status?: string
          team?: string | null
          twofa_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "staff_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_bootstrap: {
        Row: {
          created_at: string
          email: string
          name: string | null
          role: Database["public"]["Enums"]["staff_role"]
        }
        Insert: {
          created_at?: string
          email: string
          name?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Update: {
          created_at?: string
          email?: string
          name?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
        }
        Relationships: []
      }
      staff_notifications: {
        Row: {
          amount_pesewas: number | null
          created_at: string
          id: string
          kind: string
          message: string | null
          restaurant_id: string | null
          table_label: string | null
        }
        Insert: {
          amount_pesewas?: number | null
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          restaurant_id?: string | null
          table_label?: string | null
        }
        Update: {
          amount_pesewas?: number | null
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          restaurant_id?: string | null
          table_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "staff_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_assets: {
        Row: {
          alt: string | null
          bytes: number | null
          created_at: string
          focal_point: string | null
          id: string
          kind: string
          restaurant_id: string
          storage_path: string | null
          updated_by: string | null
          url: string
        }
        Insert: {
          alt?: string | null
          bytes?: number | null
          created_at?: string
          focal_point?: string | null
          id?: string
          kind?: string
          restaurant_id: string
          storage_path?: string | null
          updated_by?: string | null
          url: string
        }
        Update: {
          alt?: string | null
          bytes?: number | null
          created_at?: string
          focal_point?: string | null
          id?: string
          kind?: string
          restaurant_id?: string
          storage_path?: string | null
          updated_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_assets_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_catalogue_items: {
        Row: {
          created_at: string
          description: string | null
          dietary_note: string | null
          extras: string | null
          id: string
          image_url: string | null
          name: string
          pos_id: string | null
          price_display: string | null
          price_pesewas: number | null
          restaurant_id: string
          sku: string | null
          symbols: string[]
          tags: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          dietary_note?: string | null
          extras?: string | null
          id?: string
          image_url?: string | null
          name: string
          pos_id?: string | null
          price_display?: string | null
          price_pesewas?: number | null
          restaurant_id: string
          sku?: string | null
          symbols?: string[]
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          dietary_note?: string | null
          extras?: string | null
          id?: string
          image_url?: string | null
          name?: string
          pos_id?: string | null
          price_display?: string | null
          price_pesewas?: number | null
          restaurant_id?: string
          sku?: string | null
          symbols?: string[]
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_catalogue_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_digital_settings: {
        Row: {
          attached_menu_ids: string[]
          banner_bg: string | null
          banner_url: string | null
          biz_name: string | null
          colors: Json
          hours: Json
          id: string
          info: string | null
          link_text: string | null
          link_url: string | null
          logo_url: string | null
          menu_id: string
          menu_selector: boolean
          nav_style: string
          phone: string | null
          public_slug: string | null
          published: boolean
          published_at: string | null
          qr_config: Json
          rec_image_url: string | null
          rec_name: string | null
          rec_note: string | null
          rec_price_pesewas: number | null
          restaurant_id: string
          show_bins: boolean
          show_notes: boolean
          show_prices: boolean
          show_titles: boolean
          single_menu_view: boolean
          thumbnails: string
          updated_at: string
          updated_by: string | null
          welcome_alert: string | null
        }
        Insert: {
          attached_menu_ids?: string[]
          banner_bg?: string | null
          banner_url?: string | null
          biz_name?: string | null
          colors?: Json
          hours?: Json
          id?: string
          info?: string | null
          link_text?: string | null
          link_url?: string | null
          logo_url?: string | null
          menu_id: string
          menu_selector?: boolean
          nav_style?: string
          phone?: string | null
          public_slug?: string | null
          published?: boolean
          published_at?: string | null
          qr_config?: Json
          rec_image_url?: string | null
          rec_name?: string | null
          rec_note?: string | null
          rec_price_pesewas?: number | null
          restaurant_id: string
          show_bins?: boolean
          show_notes?: boolean
          show_prices?: boolean
          show_titles?: boolean
          single_menu_view?: boolean
          thumbnails?: string
          updated_at?: string
          updated_by?: string | null
          welcome_alert?: string | null
        }
        Update: {
          attached_menu_ids?: string[]
          banner_bg?: string | null
          banner_url?: string | null
          biz_name?: string | null
          colors?: Json
          hours?: Json
          id?: string
          info?: string | null
          link_text?: string | null
          link_url?: string | null
          logo_url?: string | null
          menu_id?: string
          menu_selector?: boolean
          nav_style?: string
          phone?: string | null
          public_slug?: string | null
          published?: boolean
          published_at?: string | null
          qr_config?: Json
          rec_image_url?: string | null
          rec_name?: string | null
          rec_note?: string | null
          rec_price_pesewas?: number | null
          restaurant_id?: string
          show_bins?: boolean
          show_notes?: boolean
          show_prices?: boolean
          show_titles?: boolean
          single_menu_view?: boolean
          thumbnails?: string
          updated_at?: string
          updated_by?: string | null
          welcome_alert?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_digital_settings_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_digital_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          menu_id: string | null
          restaurant_id: string
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          menu_id?: string | null
          restaurant_id: string
          source?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          menu_id?: string | null
          restaurant_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_import_jobs_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_import_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_import_rows: {
        Row: {
          errors: Json | null
          id: string
          job_id: string
          mapped: Json | null
          raw: Json | null
          sort: number
        }
        Insert: {
          errors?: Json | null
          id?: string
          job_id: string
          mapped?: Json | null
          raw?: Json | null
          sort?: number
        }
        Update: {
          errors?: Json | null
          id?: string
          job_id?: string
          mapped?: Json | null
          raw?: Json | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "studio_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_items: {
        Row: {
          after_space: number
          alignment: string
          available: boolean
          before_space: number
          bin: string | null
          box_accent_color: string | null
          box_style: string
          catalogue_item_id: string | null
          created_at: string
          description: string | null
          dietary_note: string | null
          extras: string | null
          id: string
          image_url: string | null
          name: string
          pos_id: string | null
          prep_time: number | null
          price_beside: boolean
          price_display: string | null
          price_pesewas: number | null
          restaurant_id: string
          section_id: string
          sizes: Json
          sku: string | null
          sold_out: boolean
          sort: number
          spacing: string
          span: boolean
          symbols: string[]
          tags: string[]
          updated_at: string
          updated_by: string | null
          visible: boolean
          wrap: boolean
        }
        Insert: {
          after_space?: number
          alignment?: string
          available?: boolean
          before_space?: number
          bin?: string | null
          box_accent_color?: string | null
          box_style?: string
          catalogue_item_id?: string | null
          created_at?: string
          description?: string | null
          dietary_note?: string | null
          extras?: string | null
          id?: string
          image_url?: string | null
          name: string
          pos_id?: string | null
          prep_time?: number | null
          price_beside?: boolean
          price_display?: string | null
          price_pesewas?: number | null
          restaurant_id: string
          section_id: string
          sizes?: Json
          sku?: string | null
          sold_out?: boolean
          sort?: number
          spacing?: string
          span?: boolean
          symbols?: string[]
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
          wrap?: boolean
        }
        Update: {
          after_space?: number
          alignment?: string
          available?: boolean
          before_space?: number
          bin?: string | null
          box_accent_color?: string | null
          box_style?: string
          catalogue_item_id?: string | null
          created_at?: string
          description?: string | null
          dietary_note?: string | null
          extras?: string | null
          id?: string
          image_url?: string | null
          name?: string
          pos_id?: string | null
          prep_time?: number | null
          price_beside?: boolean
          price_display?: string | null
          price_pesewas?: number | null
          restaurant_id?: string
          section_id?: string
          sizes?: Json
          sku?: string | null
          sold_out?: boolean
          sort?: number
          spacing?: string
          span?: boolean
          symbols?: string[]
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
          wrap?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "studio_items_catalogue_item_id_fkey"
            columns: ["catalogue_item_id"]
            isOneToOne: false
            referencedRelation: "studio_catalogue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "studio_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_menus: {
        Row: {
          created_at: string
          currency: string
          id: string
          location: string | null
          name: string
          ordering_enabled: boolean
          restaurant_id: string
          service_charge_pct: number
          sort: number
          source: string
          status: string
          tax_pct: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          location?: string | null
          name: string
          ordering_enabled?: boolean
          restaurant_id: string
          service_charge_pct?: number
          sort?: number
          source?: string
          status?: string
          tax_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          location?: string | null
          name?: string
          ordering_enabled?: boolean
          restaurant_id?: string
          service_charge_pct?: number
          sort?: number
          source?: string
          status?: string
          tax_pct?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_menus_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_modifier_groups: {
        Row: {
          id: string
          item_id: string
          max_select: number
          min_select: number
          name: string
          required: boolean
          sort: number
        }
        Insert: {
          id?: string
          item_id: string
          max_select?: number
          min_select?: number
          name?: string
          required?: boolean
          sort?: number
        }
        Update: {
          id?: string
          item_id?: string
          max_select?: number
          min_select?: number
          name?: string
          required?: boolean
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_modifier_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "studio_items"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_modifiers: {
        Row: {
          available: boolean
          group_id: string
          id: string
          name: string
          price_pesewas: number
          sort: number
        }
        Insert: {
          available?: boolean
          group_id: string
          id?: string
          name?: string
          price_pesewas?: number
          sort?: number
        }
        Update: {
          available?: boolean
          group_id?: string
          id?: string
          name?: string
          price_pesewas?: number
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "studio_modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_publishes: {
        Row: {
          id: string
          menu_id: string
          public_url: string | null
          published_at: string
          published_by: string | null
          snapshot: Json
        }
        Insert: {
          id?: string
          menu_id: string
          public_url?: string | null
          published_at?: string
          published_by?: string | null
          snapshot: Json
        }
        Update: {
          id?: string
          menu_id?: string
          public_url?: string | null
          published_at?: string
          published_by?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "studio_publishes_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          menu_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          menu_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          menu_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "studio_revisions_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_sections: {
        Row: {
          accent: string
          accent_color: string | null
          after_space: number
          alignment: string
          before_space: number
          columns: number
          created_at: string
          description: string | null
          id: string
          ignore_global_spacing: boolean
          menu_id: string
          name: string
          nav_label: string | null
          new_page: boolean
          pin: boolean
          restaurant_id: string
          schedule: string | null
          sort: number
          spacing: string
          span: boolean
          span_accent: boolean
          type: string
          updated_at: string
          updated_by: string | null
          visible: boolean
          wrap: boolean
        }
        Insert: {
          accent?: string
          accent_color?: string | null
          after_space?: number
          alignment?: string
          before_space?: number
          columns?: number
          created_at?: string
          description?: string | null
          id?: string
          ignore_global_spacing?: boolean
          menu_id: string
          name?: string
          nav_label?: string | null
          new_page?: boolean
          pin?: boolean
          restaurant_id: string
          schedule?: string | null
          sort?: number
          spacing?: string
          span?: boolean
          span_accent?: boolean
          type?: string
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
          wrap?: boolean
        }
        Update: {
          accent?: string
          accent_color?: string | null
          after_space?: number
          alignment?: string
          before_space?: number
          columns?: number
          created_at?: string
          description?: string | null
          id?: string
          ignore_global_spacing?: boolean
          menu_id?: string
          name?: string
          nav_label?: string | null
          new_page?: boolean
          pin?: boolean
          restaurant_id?: string
          schedule?: string | null
          sort?: number
          spacing?: string
          span?: boolean
          span_accent?: boolean
          type?: string
          updated_at?: string
          updated_by?: string | null
          visible?: boolean
          wrap?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "studio_sections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_sections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_themes: {
        Row: {
          created_at: string
          id: string
          menu_id: string | null
          restaurant_id: string
          template_name: string | null
          tokens: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id?: string | null
          restaurant_id: string
          template_name?: string | null
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string | null
          restaurant_id?: string
          template_name?: string | null
          tokens?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_themes_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "studio_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "studio_themes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_devices: {
        Row: {
          bridge_status: string
          created_at: string
          device_label: string | null
          id: string
          last_heartbeat_at: string | null
          table_id: string
          updated_at: string
        }
        Insert: {
          bridge_status?: string
          created_at?: string
          device_label?: string | null
          id?: string
          last_heartbeat_at?: string | null
          table_id: string
          updated_at?: string
        }
        Update: {
          bridge_status?: string
          created_at?: string
          device_label?: string | null
          id?: string
          last_heartbeat_at?: string | null
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_devices_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "admin_table_devices"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "table_devices_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "admin_table_qr"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "table_devices_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "restaurant_tables"
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
            referencedRelation: "admin_table_devices"
            referencedColumns: ["table_id"]
          },
          {
            foreignKeyName: "waiter_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["table_id"]
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
      workspace_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_marketing_leads: {
        Row: {
          created_at: string | null
          email: string | null
          handled_at: string | null
          handled_by: string | null
          handled_by_name: string | null
          id: string | null
          kind: string | null
          message: string | null
          name: string | null
          phone: string | null
          restaurant_name: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_member_directory: {
        Row: {
          created_at: string | null
          first_name: string | null
          last_seen: string | null
          phone: string | null
          points: number | null
          restaurant_id: string | null
          restaurant_name: string | null
          tier: string | null
          visits: number | null
        }
        Relationships: []
      }
      admin_menu_directory: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          categories: number | null
          city: string | null
          id: string | null
          items: number | null
          last_synced_at: string | null
          name: string | null
          pos_source: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          status: string | null
          sync_health: string | null
        }
        Relationships: []
      }
      admin_payment_feed: {
        Row: {
          amount_pesewas: number | null
          city: string | null
          created_at: string | null
          failure_reason: string | null
          id: string | null
          method: string | null
          provider: string | null
          provider_ref: string | null
          refund_amount_pesewas: number | null
          refund_status: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          status: string | null
          tip_pesewas: number | null
          total_pesewas: number | null
        }
        Relationships: []
      }
      admin_pos_connectors: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string | null
          last_seen_at: string | null
          name: string | null
          provider: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          settle_payment_name: string | null
          writeback_enabled: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_connectors_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_pos_directory: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          city: string | null
          credentials_ref: string | null
          health: string | null
          id: string | null
          last_sync_at: string | null
          provider: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          status: string | null
        }
        Relationships: []
      }
      admin_pos_odoo_config: {
        Row: {
          active: boolean | null
          base_url: string | null
          db: string | null
          key_set: boolean | null
          restaurant_id: string | null
          restaurant_name: string | null
          updated_at: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_member_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_menu_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_payment_feed"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_pos_directory"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_restaurant_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_devices"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "admin_table_qr"
            referencedColumns: ["restaurant_id"]
          },
          {
            foreignKeyName: "pos_odoo_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_restaurant_directory: {
        Row: {
          branches: number | null
          city: string | null
          created_at: string | null
          id: string | null
          last_sync_at: string | null
          members: number | null
          name: string | null
          pos_health: string | null
          pos_provider: string | null
          pos_status: string | null
          tables: number | null
          volume_pesewas: number | null
        }
        Relationships: []
      }
      admin_reward_catalogue: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          inventory: number | null
          name: string | null
          points_cost: number | null
          redeemed: number | null
          redemptions: number | null
          remaining: number | null
          restaurant_name: string | null
          status: string | null
          tier_required: string | null
        }
        Relationships: []
      }
      admin_subscriber_directory: {
        Row: {
          created_at: string | null
          first_name: string | null
          id: string | null
          is_member: boolean | null
          marketing_consent: boolean | null
          phone: string | null
          receipt_consent: boolean | null
          restaurant_name: string | null
          rewards_consent: boolean | null
        }
        Relationships: []
      }
      admin_support_queue: {
        Row: {
          category: string | null
          created_at: string | null
          id: string | null
          restaurant_name: string | null
          source: string | null
          status: string | null
          subject: string | null
        }
        Relationships: []
      }
      admin_table_devices: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          bridge_status: string | null
          device_label: string | null
          has_active_session: boolean | null
          label: string | null
          last_heartbeat_at: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          table_id: string | null
        }
        Relationships: []
      }
      admin_table_qr: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          city: string | null
          qr_url: string | null
          restaurant_id: string | null
          restaurant_name: string | null
          table_id: string | null
          table_label: string | null
          token: string | null
          token_status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_bootstrap: {
        Args: {
          p_email: string
          p_name: string
          p_role: Database["public"]["Enums"]["staff_role"]
        }
        Returns: undefined
      }
      can_bootstrap: { Args: { p_email: string }; Returns: boolean }
      create_bill_split: {
        Args: {
          p_bill: string
          p_mode: string
          p_session: string
          p_shares: Json
          p_total: number
        }
        Returns: {
          bill_id: string
          created_at: string
          created_by_session: string | null
          id: string
          mode: string
          status: string
          total_pesewas: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bill_splits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_pos_connector: {
        Args: { p_name: string; p_provider?: string; p_restaurant_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          roles: Database["public"]["Enums"]["staff_role"][]
          uid: string
        }
        Returns: boolean
      }
      is_staff: { Args: { uid: string }; Returns: boolean }
      owner_branding: { Args: never; Returns: Json }
      owner_context: { Args: never; Returns: Json }
      owner_create_ticket: {
        Args: {
          p_body: string
          p_category: string
          p_priority: string
          p_subject: string
        }
        Returns: Json
      }
      owner_integrations: { Args: never; Returns: Json }
      owner_payments_summary: { Args: { p_days?: number }; Returns: Json }
      owner_payouts: { Args: never; Returns: Json }
      owner_primary_restaurant: { Args: never; Returns: string }
      owner_recent_payments: { Args: { p_limit?: number }; Returns: Json }
      owner_restaurant_ids: { Args: never; Returns: string[] }
      owner_save_bank: {
        Args: {
          p_account_name: string
          p_account_number: string
          p_branch: string
          p_destination_type: string
          p_provider: string
        }
        Returns: Json
      }
      owner_save_branding: {
        Args: {
          p_accent_color: string
          p_hero_url: string
          p_logo_url: string
          p_tagline_bottom: string
          p_tagline_top: string
          p_welcome_copy: string
        }
        Returns: Json
      }
      owner_set_schedule: { Args: { p_schedule: string }; Returns: Json }
      owner_tickets: { Args: never; Returns: Json }
      promote_staff: {
        Args: {
          p_email: string
          p_name?: string
          p_role?: Database["public"]["Enums"]["staff_role"]
        }
        Returns: undefined
      }
      save_pos_odoo_credentials: {
        Args: {
          p_api_key: string
          p_base_url: string
          p_db: string
          p_restaurant_id: string
          p_username: string
        }
        Returns: undefined
      }
      save_restaurant_branding: {
        Args: {
          p_accent_color: string
          p_hero_url: string
          p_logo_url: string
          p_restaurant_id: string
          p_tagline_bottom: string
          p_tagline_top: string
          p_welcome_copy: string
        }
        Returns: undefined
      }
      studio_catalogue_delete: { Args: { p_id: string }; Returns: Json }
      studio_catalogue_list: { Args: never; Returns: Json }
      studio_catalogue_upsert: {
        Args: { p_item: Json; p_restaurant_id?: string }
        Returns: Json
      }
      studio_digital_save: {
        Args: { p_menu_id: string; p_patch: Json }
        Returns: Json
      }
      studio_item_delete: { Args: { p_item_id: string }; Returns: Json }
      studio_item_duplicate: { Args: { p_item_id: string }; Returns: Json }
      studio_item_move: {
        Args: { p_item_id: string; p_to_index: number; p_to_section_id: string }
        Returns: Json
      }
      studio_item_upsert: {
        Args: { p_item: Json; p_section_id: string }
        Returns: Json
      }
      studio_items_reorder: {
        Args: { p_ids: string[]; p_section_id: string }
        Returns: Json
      }
      studio_menu_create: {
        Args: { p_name: string; p_restaurant_id?: string; p_source?: string }
        Returns: Json
      }
      studio_menu_delete: { Args: { p_menu_id: string }; Returns: Json }
      studio_menu_duplicate: { Args: { p_menu_id: string }; Returns: Json }
      studio_menu_get: { Args: { p_menu_id: string }; Returns: Json }
      studio_menu_publish: { Args: { p_menu_id: string }; Returns: Json }
      studio_menu_unpublish: { Args: { p_menu_id: string }; Returns: Json }
      studio_menu_update: {
        Args: { p_menu_id: string; p_patch: Json }
        Returns: Json
      }
      studio_menus_list: { Args: never; Returns: Json }
      studio_modifier_delete: { Args: { p_mod_id: string }; Returns: Json }
      studio_modifier_group_delete: {
        Args: { p_group_id: string }
        Returns: Json
      }
      studio_modifier_group_upsert: {
        Args: { p_group: Json; p_item_id: string }
        Returns: Json
      }
      studio_modifier_upsert: {
        Args: { p_group_id: string; p_modifier: Json }
        Returns: Json
      }
      studio_owned_group: { Args: { p_group_id: string }; Returns: string }
      studio_owned_item: { Args: { p_item_id: string }; Returns: string }
      studio_owned_menu: { Args: { p_menu_id: string }; Returns: string }
      studio_owned_modifier: { Args: { p_mod_id: string }; Returns: string }
      studio_owned_section: { Args: { p_section_id: string }; Returns: string }
      studio_place_catalogue_item: {
        Args: { p_catalogue_item_id: string; p_section_id: string }
        Returns: Json
      }
      studio_revision_restore: {
        Args: { p_menu_id: string; p_revision_id: string }
        Returns: Json
      }
      studio_revision_save: {
        Args: { p_label?: string; p_menu_id: string }
        Returns: Json
      }
      studio_revisions_list: { Args: { p_menu_id: string }; Returns: Json }
      studio_section_delete: { Args: { p_section_id: string }; Returns: Json }
      studio_section_upsert: {
        Args: { p_menu_id: string; p_section: Json }
        Returns: Json
      }
      studio_sections_reorder: {
        Args: { p_ids: string[]; p_menu_id: string }
        Returns: Json
      }
      studio_theme_reset: { Args: { p_menu_id: string }; Returns: Json }
      studio_theme_save: {
        Args: { p_menu_id: string; p_patch: Json }
        Returns: Json
      }
      submit_lead: {
        Args: {
          p_email: string
          p_kind: string
          p_message?: string
          p_name?: string
          p_phone?: string
          p_restaurant?: string
          p_source?: string
          p_user_agent?: string
        }
        Returns: string
      }
      touch_sign_in: { Args: never; Returns: undefined }
    }
    Enums: {
      staff_role:
        | "super_admin"
        | "operations_admin"
        | "finance_admin"
        | "read_only"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      staff_role: [
        "super_admin",
        "operations_admin",
        "finance_admin",
        "read_only",
      ],
    },
  },
} as const
