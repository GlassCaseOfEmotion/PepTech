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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          role: string
          session_id: string
          tenant_id: string
          tool_calls: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          role: string
          session_id: string
          tenant_id: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tenant_id?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          created_at: string
          id: string
          status: string
          tenant_id: string
          title: string | null
          trigger: string
          trigger_ref: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          tenant_id: string
          title?: string | null
          trigger?: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          tenant_id?: string
          title?: string | null
          trigger?: string
          trigger_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_number: string
          coa_path: string | null
          created_at: string
          expires_at: string | null
          id: string
          product_id: string
          stock: number
          tenant_id: string
        }
        Insert: {
          batch_number: string
          coa_path?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          product_id: string
          stock?: number
          tenant_id: string
        }
        Update: {
          batch_number?: string
          coa_path?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          product_id?: string
          stock?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel_identifier: string
          channel_type: string
          created_at: string
          customer_id: string
          id: string
          is_pinned: boolean
          last_message_at: string | null
          last_message_snippet: string | null
          snoozed_until: string | null
          status: string
          tenant_id: string
          unread_count: number
          updated_at: string
          window_expires_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel_identifier: string
          channel_type: string
          created_at?: string
          customer_id: string
          id?: string
          is_pinned?: boolean
          last_message_at?: string | null
          last_message_snippet?: string | null
          snoozed_until?: string | null
          status?: string
          tenant_id: string
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel_identifier?: string
          channel_type?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_pinned?: boolean
          last_message_at?: string | null
          last_message_snippet?: string | null
          snoozed_until?: string | null
          status?: string
          tenant_id?: string
          unread_count?: number
          updated_at?: string
          window_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_channels: {
        Row: {
          channel_type: string
          created_at: string
          customer_id: string
          display_handle: string
          id: string
          identifier: string
          is_primary: boolean
          tenant_id: string
        }
        Insert: {
          channel_type: string
          created_at?: string
          customer_id: string
          display_handle: string
          id?: string
          identifier: string
          is_primary?: boolean
          tenant_id: string
        }
        Update: {
          channel_type?: string
          created_at?: string
          customer_id?: string
          display_handle?: string
          id?: string
          identifier?: string
          is_primary?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_channels_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_protocol_overrides: {
        Row: {
          created_at: string
          customer_id: string
          draw_volume_ml: number | null
          frequency: string | null
          id: string
          notes: string | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          draw_volume_ml?: number | null
          frequency?: string | null
          id?: string
          notes?: string | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          draw_volume_ml?: number | null
          frequency?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_protocol_overrides_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_protocol_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_protocol_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          tag: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          tag: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          display_name: string
          id: string
          ltv: number
          notes: string | null
          tenant_id: string
          trust_score: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          ltv?: number
          notes?: string | null
          tenant_id: string
          trust_score?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          ltv?: number
          notes?: string | null
          tenant_id?: string
          trust_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          fetched_at: string
          from_currency: string
          rate: number
          to_currency: string
        }
        Insert: {
          fetched_at?: string
          from_currency: string
          rate: number
          to_currency: string
        }
        Update: {
          fetched_at?: string
          from_currency?: string
          rate?: number
          to_currency?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          id: string
          invoice_number: string
          order_id: string
          pdf_path: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number: string
          order_id: string
          pdf_path: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string
          order_id?: string
          pdf_path?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          created_at: string
          id: string
          label: string
          sort_order: number
          storage_path: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          storage_path?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          storage_path?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      media_product_tags: {
        Row: {
          media_item_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          media_item_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          media_item_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_product_tags_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_product_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          metadata: Json | null
          sent_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          note: string | null
          order_id: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          batch_id: string | null
          id: string
          order_id: string
          product_id: string
          qty: number
          tenant_id: string
          unit_price_snapshot: number
        }
        Insert: {
          batch_id?: string | null
          id?: string
          order_id: string
          product_id: string
          qty: number
          tenant_id: string
          unit_price_snapshot: number
        }
        Update: {
          batch_id?: string | null
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          tenant_id?: string
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          carrier: string | null
          conversation_id: string | null
          created_at: string
          currency: string
          customer_id: string
          delivered_at: string | null
          estimated_delivery: string | null
          exchange_rate: number | null
          id: string
          notes: string | null
          payment_address: string | null
          payment_amount: number
          payment_amount_base: number | null
          payment_asset: string
          ref_number: string
          shipped_at: string | null
          shipping_address: Json | null
          status: string
          tenant_id: string
          tracking_number: string | null
          tracking_url: string | null
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          payment_address?: string | null
          payment_amount?: number
          payment_amount_base?: number | null
          payment_asset?: string
          ref_number: string
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          tenant_id: string
          tracking_number?: string | null
          tracking_url?: string | null
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          conversation_id?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          exchange_rate?: number | null
          id?: string
          notes?: string | null
          payment_address?: string | null
          payment_amount?: number
          payment_amount_base?: number | null
          payment_asset?: string
          ref_number?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          status?: string
          tenant_id?: string
          tracking_number?: string | null
          tracking_url?: string | null
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
        }
        Relationships: []
      }
      product_protocols: {
        Row: {
          created_at: string
          cycle_length_weeks: number | null
          draw_volume_ml: number
          frequency: string
          id: string
          notes: string | null
          product_id: string
          reconstitution_ml: number
          storage: string | null
          tenant_id: string
          timing: string | null
          updated_at: string
          vial_strength: string | null
        }
        Insert: {
          created_at?: string
          cycle_length_weeks?: number | null
          draw_volume_ml: number
          frequency: string
          id?: string
          notes?: string | null
          product_id: string
          reconstitution_ml: number
          storage?: string | null
          tenant_id: string
          timing?: string | null
          updated_at?: string
          vial_strength?: string | null
        }
        Update: {
          created_at?: string
          cycle_length_weeks?: number | null
          draw_volume_ml?: number
          frequency?: string
          id?: string
          notes?: string | null
          product_id?: string
          reconstitution_ml?: number
          storage?: string | null
          tenant_id?: string
          timing?: string | null
          updated_at?: string
          vial_strength?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_protocols_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_protocols_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          product_family: string
          resources: Json
          sku: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          product_family: string
          resources?: Json
          sku: string
          tenant_id: string
          unit_price: number
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          product_family?: string
          resources?: Json
          sku?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          label: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          label: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          label?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          content: string
          created_at: string
          hidden_by_tenants: string[]
          id: string
          sort_order: number
          tenant_id: string | null
          title: string
        }
        Insert: {
          content: string
          created_at?: string
          hidden_by_tenants?: string[]
          id?: string
          sort_order?: number
          tenant_id?: string | null
          title: string
        }
        Update: {
          content?: string
          created_at?: string
          hidden_by_tenants?: string[]
          id?: string
          sort_order?: number
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_channels: {
        Row: {
          channel_type: string
          created_at: string
          credentials: Json | null
          id: string
          identifier: string
          is_active: boolean
          tenant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          channel_type: string
          created_at?: string
          credentials?: Json | null
          id?: string
          identifier: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          channel_type?: string
          created_at?: string
          credentials?: Json | null
          id?: string
          identifier?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_order_sequences: {
        Row: {
          last_value: number
          tenant_id: string
        }
        Insert: {
          last_value?: number
          tenant_id: string
        }
        Update: {
          last_value?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_order_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_configs: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          created_at: string
          iban: string | null
          id: string
          is_active: boolean
          sort_code: string | null
          tenant_id: string
          type: string
          wallet_address: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          sort_code?: string | null
          tenant_id: string
          type: string
          wallet_address?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          sort_code?: string | null
          tenant_id?: string
          type?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          base_currency: string
          business_type: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_path: string | null
          name: string
          onboarded_at: string | null
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          base_currency?: string
          business_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          onboarded_at?: string | null
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          business_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          onboarded_at?: string | null
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          role: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          role?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          content_sid: string | null
          created_at: string
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          content_sid?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          content_sid?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_activity: {
        Row: {
          amount: number | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          label: string | null
          note: string | null
          ref_number: string | null
          source: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_tenant_id: { Args: never; Returns: string }
      compute_customer_trust: {
        Args: { p_customer_id: string }
        Returns: number
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_auth_tenant_id: { Args: never; Returns: string }
      get_tenant_id_for_user: { Args: { user_id: string }; Returns: string }
      hide_platform_template: {
        Args: { template_id: string }
        Returns: undefined
      }
      increment_unread_count: {
        Args: { conv_id: string; tenant: string }
        Returns: undefined
      }
      next_order_ref: { Args: { p_tenant_id: string }; Returns: string }
      pack_order: {
        Args: { p_assignments: Json; p_order_id: string; p_tenant_id: string }
        Returns: undefined
      }
      unsnooze_expired: { Args: never; Returns: undefined }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
