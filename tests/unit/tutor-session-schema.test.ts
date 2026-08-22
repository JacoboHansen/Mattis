import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const baseline = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822064942_mattis_poc_baseline.sql'),
  'utf8',
);
const retention = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822084344_tutor_session_retention.sql'),
  'utf8',
);
const learningLoop = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822105420_learning_loop_v1.sql'),
  'utf8',
);
const learningLoopIndexes = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260822105559_cover_learning_evidence_source_owner_fk.sql',
  ),
  'utf8',
);

describe('real tutor session data contract', () => {
  it('keeps student session and message access authenticated and owner-scoped', () => {
    for (const table of ['sessions', 'messages', 'learning_evidence']) {
      expect(baseline).toContain(`alter table public.${table} enable row level security;`);
      expect(baseline).toContain(
        `revoke all on public.profiles, public.curriculum_concepts, public.sessions,`,
      );
      expect(baseline).toMatch(
        new RegExp(
          `create policy "${table === 'learning_evidence' ? 'evidence' : table}_select_own"`,
        ),
      );
      expect(baseline).toMatch(
        new RegExp(`on public\\.${table} for select to authenticated using \\(`),
      );
    }
    expect(baseline).toContain('(select auth.uid()) = user_id');
    expect(baseline).toContain('messages_session_owner_fk');
  });

  it('adds an explicit, bounded session retention deadline without a privileged bypass', () => {
    expect(retention).toContain('add column if not exists delete_after timestamptz');
    expect(retention).toContain("created_at + interval '180 days'");
    expect(retention).toContain('sessions_delete_after_idx');
    expect(retention).toContain('revoke update on public.sessions from authenticated;');
    expect(retention).toContain(
      'revoke update on public.messages, public.learning_evidence from authenticated;',
    );
    expect(retention).toContain('revoke insert on public.sessions from authenticated;');
    expect(retention).toContain(
      'revoke insert on public.messages, public.learning_evidence from authenticated;',
    );
    expect(retention).not.toMatch(/service_role|security definer|bypassrls/i);
  });

  it('makes tutor evidence idempotent and updates mastery transactionally', () => {
    expect(learningLoop).toContain('source_message_id uuid');
    expect(learningLoop).toContain('unique (source_message_id, concept_key)');
    expect(learningLoop).toContain('create trigger learning_evidence_updates_mastery');
    expect(learningLoop).toContain('insert into public.mastery');
    expect(learningLoop).toContain('on conflict (user_id, concept_key) do update');
    expect(learningLoop).toContain(
      'revoke insert, update, delete on public.mastery from authenticated;',
    );
    expect(learningLoop).toContain('security definer');
    expect(learningLoop).toContain("set search_path = ''");
    expect(learningLoop).toContain('auth.uid() <> new.user_id');
    expect(learningLoop).toContain('revoke all on schema private from public;');
  });

  it('stores a versioned plan and seeds the grade-spanning curriculum taxonomy', () => {
    expect(learningLoop).toContain('add column if not exists plan_snapshot jsonb');
    expect(learningLoop).toContain(
      "add column if not exists phase text not null default 'homework'",
    );
    expect(learningLoop).toContain("'algebra.equations'");
    expect(learningLoop).toContain("'geometry.pythagoras'");
    expect(learningLoop).toContain("'programming.math'");
  });

  it('covers the owner-scoped source-message foreign key', () => {
    expect(learningLoopIndexes).toContain(
      'on public.learning_evidence (source_message_id, user_id)',
    );
  });
});
