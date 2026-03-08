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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          contact_no: string
          created_at: string
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          total_orders: number
          total_spend: number
        }
        Insert: {
          address?: string | null
          contact_no: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          total_orders?: number
          total_spend?: number
        }
        Update: {
          address?: string | null
          contact_no?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          total_orders?: number
          total_spend?: number
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          channel: string
          delivery_status: string
          id: string
          message_preview: string | null
          order_id: string
          recipient_email: string | null
          recipient_phone: string | null
          sent_at: string
          status_at_send: string | null
        }
        Insert: {
          channel: string
          delivery_status?: string
          id?: string
          message_preview?: string | null
          order_id: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status_at_send?: string | null
        }
        Update: {
          channel?: string
          delivery_status?: string
          id?: string
          message_preview?: string | null
          order_id?: string
          recipient_email?: string | null
          recipient_phone?: string | null
          sent_at?: string
          status_at_send?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_files: {
        Row: {
          file_size: number | null
          filename: string
          id: string
          mime_type: string | null
          order_id: string
          storage_url: string
          uploaded_at: string | null
        }
        Insert: {
          file_size?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          order_id: string
          storage_url: string
          uploaded_at?: string | null
        }
        Update: {
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          order_id?: string
          storage_url?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_files_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fulfillments: {
        Row: {
          created_at: string
          delivered_by: string | null
          delivery_note: string | null
          fulfillment_date: string
          id: string
          order_id: string
          qty_delivered: number
        }
        Insert: {
          created_at?: string
          delivered_by?: string | null
          delivery_note?: string | null
          fulfillment_date?: string
          id?: string
          order_id: string
          qty_delivered: number
        }
        Update: {
          created_at?: string
          delivered_by?: string | null
          delivery_note?: string | null
          fulfillment_date?: string
          id?: string
          order_id?: string
          qty_delivered?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_tags: {
        Row: {
          id: string
          order_id: string
          tag_name: string
        }
        Insert: {
          id?: string
          order_id: string
          tag_name: string
        }
        Update: {
          id?: string
          order_id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_tags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance_paid: number
          amount: number
          assigned_to: string | null
          balance_due: number | null
          base_amount: number | null
          cgst_amount: number | null
          cgst_percent: number | null
          color_mode: Database["public"]["Enums"]["color_mode"]
          contact_no: string
          created_at: string
          customer_name: string
          delivery_date: string
          email: string | null
          file_url: string | null
          gstin: string | null
          hsn_code: string | null
          id: string
          igst_amount: number | null
          igst_percent: number | null
          is_partial_order: boolean | null
          order_date: string
          order_no: string
          paper_type: string | null
          po_contact_person: string | null
          po_id: string | null
          po_line_item_id: string | null
          po_number: string | null
          product_type: string
          qty_fulfilled: number | null
          qty_ordered: number | null
          qty_pending: number | null
          quantity: number
          sgst_amount: number | null
          sgst_percent: number | null
          size: string | null
          source: Database["public"]["Enums"]["order_source"]
          special_instructions: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_tax_amount: number | null
          updated_at: string
          whatsapp_message_body: string | null
          whatsapp_message_sent_at: string | null
        }
        Insert: {
          advance_paid?: number
          amount?: number
          assigned_to?: string | null
          balance_due?: number | null
          base_amount?: number | null
          cgst_amount?: number | null
          cgst_percent?: number | null
          color_mode?: Database["public"]["Enums"]["color_mode"]
          contact_no: string
          created_at?: string
          customer_name: string
          delivery_date: string
          email?: string | null
          file_url?: string | null
          gstin?: string | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          igst_percent?: number | null
          is_partial_order?: boolean | null
          order_date?: string
          order_no: string
          paper_type?: string | null
          po_contact_person?: string | null
          po_id?: string | null
          po_line_item_id?: string | null
          po_number?: string | null
          product_type: string
          qty_fulfilled?: number | null
          qty_ordered?: number | null
          qty_pending?: number | null
          quantity?: number
          sgst_amount?: number | null
          sgst_percent?: number | null
          size?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_tax_amount?: number | null
          updated_at?: string
          whatsapp_message_body?: string | null
          whatsapp_message_sent_at?: string | null
        }
        Update: {
          advance_paid?: number
          amount?: number
          assigned_to?: string | null
          balance_due?: number | null
          base_amount?: number | null
          cgst_amount?: number | null
          cgst_percent?: number | null
          color_mode?: Database["public"]["Enums"]["color_mode"]
          contact_no?: string
          created_at?: string
          customer_name?: string
          delivery_date?: string
          email?: string | null
          file_url?: string | null
          gstin?: string | null
          hsn_code?: string | null
          id?: string
          igst_amount?: number | null
          igst_percent?: number | null
          is_partial_order?: boolean | null
          order_date?: string
          order_no?: string
          paper_type?: string | null
          po_contact_person?: string | null
          po_id?: string | null
          po_line_item_id?: string | null
          po_number?: string | null
          product_type?: string
          qty_fulfilled?: number | null
          qty_ordered?: number | null
          qty_pending?: number | null
          quantity?: number
          sgst_amount?: number | null
          sgst_percent?: number | null
          size?: string | null
          source?: Database["public"]["Enums"]["order_source"]
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_tax_amount?: number | null
          updated_at?: string
          whatsapp_message_body?: string | null
          whatsapp_message_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string | null
          default_color_mode: string | null
          default_paper_type: string | null
          default_size: string | null
          hsn_code: string | null
          id: string
          name: string
          whatsapp_template_body: string | null
        }
        Insert: {
          created_at?: string | null
          default_color_mode?: string | null
          default_paper_type?: string | null
          default_size?: string | null
          hsn_code?: string | null
          id?: string
          name: string
          whatsapp_template_body?: string | null
        }
        Update: {
          created_at?: string | null
          default_color_mode?: string | null
          default_paper_type?: string | null
          default_size?: string | null
          hsn_code?: string | null
          id?: string
          name?: string
          whatsapp_template_body?: string | null
        }
        Relationships: []
      }
      purchase_order_line_items: {
        Row: {
          amount: number | null
          created_at: string | null
          description: string | null
          hsn_code: string | null
          id: string
          line_item_no: number | null
          mapped_product_type_id: string | null
          purchase_order_id: string
          qty: number | null
          status: string | null
          unit_price: number | null
          uom: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          line_item_no?: number | null
          mapped_product_type_id?: string | null
          purchase_order_id: string
          qty?: number | null
          status?: string | null
          unit_price?: number | null
          uom?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          line_item_no?: number | null
          mapped_product_type_id?: string | null
          purchase_order_id?: string
          qty?: number | null
          status?: string | null
          unit_price?: number | null
          uom?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_line_items_mapped_product_type_id_fkey"
            columns: ["mapped_product_type_id"]
            isOneToOne: false
            referencedRelation: "product_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_line_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          contact_no: string | null
          contact_person: string | null
          created_at: string | null
          currency: string | null
          delivery_address: string | null
          delivery_date: string | null
          gstin: string | null
          id: string
          parsed_data: Json | null
          payment_terms: string | null
          po_date: string | null
          po_file_url: string | null
          po_number: string
          status: string | null
          tax_amount: number | null
          total_amount: number | null
          vendor_name: string | null
        }
        Insert: {
          contact_no?: string | null
          contact_person?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          gstin?: string | null
          id?: string
          parsed_data?: Json | null
          payment_terms?: string | null
          po_date?: string | null
          po_file_url?: string | null
          po_number: string
          status?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Update: {
          contact_no?: string | null
          contact_person?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_address?: string | null
          delivery_date?: string | null
          gstin?: string | null
          id?: string
          parsed_data?: Json | null
          payment_terms?: string | null
          po_date?: string | null
          po_file_url?: string | null
          po_number?: string
          status?: string | null
          tax_amount?: number | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          business_address: string | null
          business_name: string
          contact_number: string | null
          created_at: string
          gstin: string | null
          id: string
          invoice_footer: string | null
          logo_url: string | null
          operator_names: string[] | null
          order_prefix: string
          paper_types: string[] | null
          product_types: string[] | null
          show_gst_breakdown: boolean | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_name?: string
          contact_number?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          invoice_footer?: string | null
          logo_url?: string | null
          operator_names?: string[] | null
          order_prefix?: string
          paper_types?: string[] | null
          product_types?: string[] | null
          show_gst_breakdown?: boolean | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_address?: string | null
          business_name?: string
          contact_number?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          invoice_footer?: string | null
          logo_url?: string | null
          operator_names?: string[] | null
          order_prefix?: string
          paper_types?: string[] | null
          product_types?: string[] | null
          show_gst_breakdown?: boolean | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      status_logs: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_order_no: { Args: never; Returns: string }
    }
    Enums: {
      color_mode: "full_color" | "black_white" | "spot_color"
      order_source: "whatsapp" | "email" | "manual" | "purchase_order"
      order_status:
        | "Order Received"
        | "Design Review"
        | "Plate Making"
        | "Printing"
        | "Cutting / Binding"
        | "Quality Check"
        | "Ready to Dispatch"
        | "Delivered"
        | "Payment Pending"
        | "Cancelled"
        | "Partially Fulfilled"
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
      color_mode: ["full_color", "black_white", "spot_color"],
      order_source: ["whatsapp", "email", "manual", "purchase_order"],
      order_status: [
        "Order Received",
        "Design Review",
        "Plate Making",
        "Printing",
        "Cutting / Binding",
        "Quality Check",
        "Ready to Dispatch",
        "Delivered",
        "Payment Pending",
        "Cancelled",
        "Partially Fulfilled",
      ],
    },
  },
} as const
