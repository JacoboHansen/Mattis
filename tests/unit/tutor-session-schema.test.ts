import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const baseline = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822064942_mattis_poc_baseline.sql'),
  'utf8',
);
const retention = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260822110000_tutor_session_retention.sql'),
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
});
