export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      ai_generations: {
        Row: {
          capability: string;
          created_at: string;
          estimated_cost_usd: number | null;
          id: string;
          input_units: number | null;
          latency_ms: number | null;
          model: string;
          output_units: number | null;
          prompt_hash: string | null;
          provider: string;
          request_schema_version: string;
          response_schema_version: string;
          safety_flags: string[];
          session_id: string | null;
          status: string;
          task_id: string | null;
          user_id: string;
        };
        Insert: {
          capability: string;
          created_at?: string;
          estimated_cost_usd?: number | null;
          id?: string;
          input_units?: number | null;
          latency_ms?: number | null;
          model: string;
          output_units?: number | null;
          prompt_hash?: string | null;
          provider: string;
          request_schema_version: string;
          response_schema_version: string;
          safety_flags?: string[];
          session_id?: string | null;
          status: string;
          task_id?: string | null;
          user_id: string;
        };
        Update: {
          capability?: string;
          created_at?: string;
          estimated_cost_usd?: number | null;
          id?: string;
          input_units?: number | null;
          latency_ms?: number | null;
          model?: string;
          output_units?: number | null;
          prompt_hash?: string | null;
          provider?: string;
          request_schema_version?: string;
          response_schema_version?: string;
          safety_flags?: string[];
          session_id?: string | null;
          status?: string;
          task_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_generations_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'ai_generations_task_owner_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      curriculum_concepts: {
        Row: {
          concept_key: string;
          created_at: string;
          curriculum_version: string;
          description_nb: string | null;
          grade_max: number | null;
          grade_min: number | null;
          prerequisite_keys: string[];
          source_reference: string | null;
          title_nb: string;
          updated_at: string;
        };
        Insert: {
          concept_key: string;
          created_at?: string;
          curriculum_version: string;
          description_nb?: string | null;
          grade_max?: number | null;
          grade_min?: number | null;
          prerequisite_keys?: string[];
          source_reference?: string | null;
          title_nb: string;
          updated_at?: string;
        };
        Update: {
          concept_key?: string;
          created_at?: string;
          curriculum_version?: string;
          description_nb?: string | null;
          grade_max?: number | null;
          grade_min?: number | null;
          prerequisite_keys?: string[];
          source_reference?: string | null;
          title_nb?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      homework_uploads: {
        Row: {
          byte_size: number | null;
          created_at: string;
          delete_after: string;
          deleted_at: string | null;
          height_px: number | null;
          id: string;
          mime_type: string;
          page_number: number;
          session_id: string;
          sha256: string | null;
          status: string;
          storage_path: string;
          user_id: string;
          width_px: number | null;
        };
        Insert: {
          byte_size?: number | null;
          created_at?: string;
          delete_after?: string;
          deleted_at?: string | null;
          height_px?: number | null;
          id?: string;
          mime_type: string;
          page_number?: number;
          session_id: string;
          sha256?: string | null;
          status?: string;
          storage_path: string;
          user_id: string;
          width_px?: number | null;
        };
        Update: {
          byte_size?: number | null;
          created_at?: string;
          delete_after?: string;
          deleted_at?: string | null;
          height_px?: number | null;
          id?: string;
          mime_type?: string;
          page_number?: number;
          session_id?: string;
          sha256?: string | null;
          status?: string;
          storage_path?: string;
          user_id?: string;
          width_px?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'homework_uploads_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      learning_evidence: {
        Row: {
          concept_key: string;
          confidence: number;
          created_at: string;
          evidence_type: string;
          id: string;
          misconception_code: string | null;
          note_nb: string | null;
          score: number;
          session_id: string;
          source_message_id: string | null;
          task_id: string | null;
          user_id: string;
        };
        Insert: {
          concept_key: string;
          confidence: number;
          created_at?: string;
          evidence_type: string;
          id?: string;
          misconception_code?: string | null;
          note_nb?: string | null;
          score: number;
          session_id: string;
          source_message_id?: string | null;
          task_id?: string | null;
          user_id: string;
        };
        Update: {
          concept_key?: string;
          confidence?: number;
          created_at?: string;
          evidence_type?: string;
          id?: string;
          misconception_code?: string | null;
          note_nb?: string | null;
          score?: number;
          session_id?: string;
          source_message_id?: string | null;
          task_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'learning_evidence_concept_key_fkey';
            columns: ['concept_key'];
            isOneToOne: false;
            referencedRelation: 'curriculum_concepts';
            referencedColumns: ['concept_key'];
          },
          {
            foreignKeyName: 'learning_evidence_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'learning_evidence_source_message_owner_fk';
            columns: ['source_message_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'learning_evidence_task_owner_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      mastery: {
        Row: {
          concept_key: string;
          confidence: number;
          estimate: number;
          evidence_count: number;
          last_practiced_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          concept_key: string;
          confidence?: number;
          estimate?: number;
          evidence_count?: number;
          last_practiced_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          concept_key?: string;
          confidence?: number;
          estimate?: number;
          evidence_count?: number;
          last_practiced_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mastery_concept_key_fkey';
            columns: ['concept_key'];
            isOneToOne: false;
            referencedRelation: 'curriculum_concepts';
            referencedColumns: ['concept_key'];
          },
        ];
      };
      messages: {
        Row: {
          client_message_id: string | null;
          content_nb: string;
          created_at: string;
          expires_at: string;
          id: string;
          intent: string | null;
          metadata: Json;
          role: Database['public']['Enums']['message_role'];
          session_id: string;
          task_id: string | null;
          user_id: string;
        };
        Insert: {
          client_message_id?: string | null;
          content_nb: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          intent?: string | null;
          metadata?: Json;
          role: Database['public']['Enums']['message_role'];
          session_id: string;
          task_id?: string | null;
          user_id: string;
        };
        Update: {
          client_message_id?: string | null;
          content_nb?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          intent?: string | null;
          metadata?: Json;
          role?: Database['public']['Enums']['message_role'];
          session_id?: string;
          task_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'messages_task_owner_fk';
            columns: ['task_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      product_events: {
        Row: {
          created_at: string;
          event_name: string;
          expires_at: string;
          id: number;
          properties: Json;
          session_id: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_name: string;
          expires_at?: string;
          id?: never;
          properties?: Json;
          session_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          expires_at?: string;
          id?: never;
          properties?: Json;
          session_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'product_events_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      profiles: {
        Row: {
          course_code: string | null;
          created_at: string;
          display_name: string;
          grade_level: number | null;
          id: string;
          locale: string;
          onboarding_completed_at: string | null;
          timezone: string;
          updated_at: string;
          weekly_goal_minutes: number;
        };
        Insert: {
          course_code?: string | null;
          created_at?: string;
          display_name: string;
          grade_level?: number | null;
          id: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          weekly_goal_minutes?: number;
        };
        Update: {
          course_code?: string | null;
          created_at?: string;
          display_name?: string;
          grade_level?: number | null;
          id?: string;
          locale?: string;
          onboarding_completed_at?: string | null;
          timezone?: string;
          updated_at?: string;
          weekly_goal_minutes?: number;
        };
        Relationships: [];
      };
      schedules: {
        Row: {
          created_at: string;
          duration_minutes: number;
          enabled: boolean;
          focus_nb: string | null;
          id: string;
          recurrence_rule: string | null;
          starts_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_minutes?: number;
          enabled?: boolean;
          focus_nb?: string | null;
          id?: string;
          recurrence_rule?: string | null;
          starts_at: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_minutes?: number;
          enabled?: boolean;
          focus_nb?: string | null;
          id?: string;
          recurrence_rule?: string | null;
          starts_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          created_at: string;
          current_phase: string;
          delete_after: string;
          duration_minutes: number;
          ended_at: string | null;
          id: string;
          next_topic_nb: string | null;
          plan_snapshot: Json;
          planned_at: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['session_status'];
          summary_nb: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          current_phase?: string;
          delete_after?: string;
          duration_minutes?: number;
          ended_at?: string | null;
          id?: string;
          next_topic_nb?: string | null;
          plan_snapshot?: Json;
          planned_at?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['session_status'];
          summary_nb?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_phase?: string;
          delete_after?: string;
          duration_minutes?: number;
          ended_at?: string | null;
          id?: string;
          next_topic_nb?: string | null;
          plan_snapshot?: Json;
          planned_at?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['session_status'];
          summary_nb?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          completed_at: string | null;
          concept_keys: string[];
          created_at: string;
          estimated_minutes: number;
          figure_spec: Json | null;
          id: string;
          normalized_text: string;
          origin: string;
          parse_confidence: number;
          phase: string;
          sequence_no: number;
          session_id: string;
          source_label: string | null;
          source_text: string;
          status: Database['public']['Enums']['task_status'];
          task_type: string;
          updated_at: string;
          upload_id: string | null;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          concept_keys?: string[];
          created_at?: string;
          estimated_minutes?: number;
          figure_spec?: Json | null;
          id?: string;
          normalized_text: string;
          origin?: string;
          parse_confidence?: number;
          phase?: string;
          sequence_no: number;
          session_id: string;
          source_label?: string | null;
          source_text: string;
          status?: Database['public']['Enums']['task_status'];
          task_type: string;
          updated_at?: string;
          upload_id?: string | null;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          concept_keys?: string[];
          created_at?: string;
          estimated_minutes?: number;
          figure_spec?: Json | null;
          id?: string;
          normalized_text?: string;
          origin?: string;
          parse_confidence?: number;
          phase?: string;
          sequence_no?: number;
          session_id?: string;
          source_label?: string | null;
          source_text?: string;
          status?: Database['public']['Enums']['task_status'];
          task_type?: string;
          updated_at?: string;
          upload_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_session_owner_fk';
            columns: ['session_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id', 'user_id'];
          },
          {
            foreignKeyName: 'tasks_upload_owner_fk';
            columns: ['upload_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'homework_uploads';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      message_role: 'student' | 'tutor' | 'system';
      session_status:
        | 'planned'
        | 'capturing'
        | 'parsing'
        | 'reviewing'
        | 'active'
        | 'summarizing'
        | 'completed'
        | 'cancelled';
      task_status: 'detected' | 'confirmed' | 'in_progress' | 'checking' | 'completed' | 'skipped';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      message_role: ['student', 'tutor', 'system'],
      session_status: [
        'planned',
        'capturing',
        'parsing',
        'reviewing',
        'active',
        'summarizing',
        'completed',
        'cancelled',
      ],
      task_status: ['detected', 'confirmed', 'in_progress', 'checking', 'completed', 'skipped'],
    },
  },
} as const;
