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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      pos_attendance_challenges: {
        Row: {
          action: string | null
          challenge: string
          created_at: string
          employee_id: string
          expires_at: string
          id: string
          origin: string
          purpose: string
          rp_id: string
          salon: string
        }
        Insert: {
          action?: string | null
          challenge: string
          created_at?: string
          employee_id: string
          expires_at: string
          id: string
          origin: string
          purpose: string
          rp_id: string
          salon: string
        }
        Update: {
          action?: string | null
          challenge?: string
          created_at?: string
          employee_id?: string
          expires_at?: string
          id?: string
          origin?: string
          purpose?: string
          rp_id?: string
          salon?: string
        }
        Relationships: []
      }
      pos_attendance_records: {
        Row: {
          admin_verified_at: string | null
          admin_verified_by: string | null
          check_in_admin_verified_at: string | null
          check_in_admin_verified_by: string | null
          check_in_at: string
          check_out_admin_verified_at: string | null
          check_out_admin_verified_by: string | null
          check_out_at: string | null
          created_at: string
          employee_id: string
          employee_name: string
          id: string
          salon: string
          work_date: string
        }
        Insert: {
          admin_verified_at?: string | null
          admin_verified_by?: string | null
          check_in_admin_verified_at?: string | null
          check_in_admin_verified_by?: string | null
          check_in_at: string
          check_out_admin_verified_at?: string | null
          check_out_admin_verified_by?: string | null
          check_out_at?: string | null
          created_at?: string
          employee_id: string
          employee_name: string
          id: string
          salon: string
          work_date: string
        }
        Update: {
          admin_verified_at?: string | null
          admin_verified_by?: string | null
          check_in_admin_verified_at?: string | null
          check_in_admin_verified_by?: string | null
          check_in_at?: string
          check_out_admin_verified_at?: string | null
          check_out_admin_verified_by?: string | null
          check_out_at?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          id?: string
          salon?: string
          work_date?: string
        }
        Relationships: []
      }
      pos_cashier_access_pins: {
        Row: {
          account_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          pin_salt: string
          updated_at: string
        }
        Insert: {
          account_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          pin_salt: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          pin_salt?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_customers: {
        Row: {
          created_at: string
          last_transaction_at: string | null
          name: string
          phone: string
          points: number
          total_spent: number
          transaction_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_transaction_at?: string | null
          name: string
          phone: string
          points?: number
          total_spent?: number
          transaction_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_transaction_at?: string | null
          name?: string
          phone?: string
          points?: number
          total_spent?: number
          transaction_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_employee_attendance_auth: {
        Row: {
          employee_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          pin_salt: string
          salon: string
          updated_at: string
        }
        Insert: {
          employee_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          pin_salt: string
          salon: string
          updated_at?: string
        }
        Update: {
          employee_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          pin_salt?: string
          salon?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_employee_attendance_passkeys: {
        Row: {
          backed_up: boolean
          counter: number
          created_at: string
          device_type: string
          employee_id: string
          id: string
          public_key: string
          salon: string
          transports: string[]
        }
        Insert: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          device_type: string
          employee_id: string
          id: string
          public_key: string
          salon: string
          transports?: string[]
        }
        Update: {
          backed_up?: boolean
          counter?: number
          created_at?: string
          device_type?: string
          employee_id?: string
          id?: string
          public_key?: string
          salon?: string
          transports?: string[]
        }
        Relationships: []
      }
      pos_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          payment_method: string | null
          salon: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          expense_date: string
          id?: string
          payment_method?: string | null
          salon: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          payment_method?: string | null
          salon?: string
        }
        Relationships: []
      }
      pos_queue_bookings: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          employee_id: string
          employee_name: string
          id: string
          notes: string | null
          salon: string
          scheduled_date: string
          scheduled_time: string
          service_id: string
          service_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          employee_id: string
          employee_name: string
          id?: string
          notes?: string | null
          salon: string
          scheduled_date: string
          scheduled_time: string
          service_id: string
          service_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          employee_id?: string
          employee_name?: string
          id?: string
          notes?: string | null
          salon?: string
          scheduled_date?: string
          scheduled_time?: string
          service_id?: string
          service_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_sale_items: {
        Row: {
          commission_amount: number
          commission_base: number
          commission_percent: number
          discount: number
          discount_type: string
          employee_id: string | null
          employee_name: string | null
          id: string
          line_index: number
          name: string
          quantity: number
          sale_id: string
          service_id: string
          unit_price: number
        }
        Insert: {
          commission_amount?: number
          commission_base?: number
          commission_percent?: number
          discount?: number
          discount_type?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          line_index: number
          name: string
          quantity: number
          sale_id: string
          service_id: string
          unit_price: number
        }
        Update: {
          commission_amount?: number
          commission_base?: number
          commission_percent?: number
          discount?: number
          discount_type?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          line_index?: number
          name?: string
          quantity?: number
          sale_id?: string
          service_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          amount_received: number
          cashier_name: string | null
          change_amount: number
          created_at: string
          customer_name: string
          customer_phone: string | null
          discount: number
          discount_mode: string
          discount_value: number
          id: string
          invoice_number: string
          payment_method: string
          points_balance: number
          points_earned: number
          salon: string
          subtotal: number
          total: number
        }
        Insert: {
          amount_received: number
          cashier_name?: string | null
          change_amount?: number
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          discount?: number
          discount_mode?: string
          discount_value?: number
          id: string
          invoice_number: string
          payment_method: string
          points_balance?: number
          points_earned?: number
          salon?: string
          subtotal: number
          total: number
        }
        Update: {
          amount_received?: number
          cashier_name?: string | null
          change_amount?: number
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          discount?: number
          discount_mode?: string
          discount_value?: number
          id?: string
          invoice_number?: string
          payment_method?: string
          points_balance?: number
          points_earned?: number
          salon?: string
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      pos_salon_customers: {
        Row: {
          created_at: string
          last_transaction_at: string | null
          member_code: string
          name: string
          phone: string
          points: number
          salon: string
          total_spent: number
          transaction_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          last_transaction_at?: string | null
          member_code?: string
          name: string
          phone: string
          points?: number
          salon: string
          total_spent?: number
          transaction_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          last_transaction_at?: string | null
          member_code?: string
          name?: string
          phone?: string
          points?: number
          salon?: string
          total_spent?: number
          transaction_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_salon_employees: {
        Row: {
          active: boolean
          commission_percent: number
          created_at: string
          id: string
          is_cashier: boolean
          name: string
          salon: string
        }
        Insert: {
          active?: boolean
          commission_percent: number
          created_at?: string
          id: string
          is_cashier?: boolean
          name: string
          salon: string
        }
        Update: {
          active?: boolean
          commission_percent?: number
          created_at?: string
          id?: string
          is_cashier?: boolean
          name?: string
          salon?: string
        }
        Relationships: []
      }
      pos_salon_point_redemptions: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          points_spent: number
          redeemed_by: string
          reward_name: string
          salon: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone: string
          id?: string
          points_spent: number
          redeemed_by: string
          reward_name: string
          salon: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          points_spent?: number
          redeemed_by?: string
          reward_name?: string
          salon?: string
        }
        Relationships: []
      }
      pos_salon_point_rewards: {
        Row: {
          points: number
          reward: string
          salon: string
        }
        Insert: {
          points: number
          reward: string
          salon: string
        }
        Update: {
          points?: number
          reward?: string
          salon?: string
        }
        Relationships: []
      }
      pos_salon_promo_settings: {
        Row: {
          description: string
          end_date: string | null
          is_active: boolean
          salon: string
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          description?: string
          end_date?: string | null
          is_active?: boolean
          salon: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          description?: string
          end_date?: string | null
          is_active?: boolean
          salon?: string
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_salon_receipt_settings: {
        Row: {
          salon: string
          tagline_text: string
          thank_you_text: string
          updated_at: string
        }
        Insert: {
          salon: string
          tagline_text: string
          thank_you_text: string
          updated_at?: string
        }
        Update: {
          salon?: string
          tagline_text?: string
          thank_you_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      pos_services: {
        Row: {
          category: string
          commission_percent: number | null
          id: string
          max_price: number | null
          min_price: number
          name: string
          price_type: string
          salon: string
          sort_order: number
        }
        Insert: {
          category: string
          commission_percent?: number | null
          id: string
          max_price?: number | null
          min_price: number
          name: string
          price_type: string
          salon: string
          sort_order?: number
        }
        Update: {
          category?: string
          commission_percent?: number | null
          id?: string
          max_price?: number | null
          min_price?: number
          name?: string
          price_type?: string
          salon?: string
          sort_order?: number
        }
        Relationships: []
      }
      pos_whatsapp_campaign_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          customer_name: string
          id: string
          phone: string
          salon: string
          sent_at: string | null
          sent_by: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_name: string
          id?: string
          phone: string
          salon: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_name?: string
          id?: string
          phone?: string
          salon?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_whatsapp_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "pos_whatsapp_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_whatsapp_campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          created_by: string
          id: string
          message: string
          salon: string
          title: string
        }
        Insert: {
          campaign_type?: string
          created_at?: string
          created_by: string
          id?: string
          message: string
          salon: string
          title: string
        }
        Update: {
          campaign_type?: string
          created_at?: string
          created_by?: string
          id?: string
          message?: string
          salon?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      app_sql: { Args: { params?: Json; q: string }; Returns: Json }
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
    Enums: {},
  },
} as const
