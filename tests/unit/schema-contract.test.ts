import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = resolve(process.cwd(), 'mattis-poc-spec/mattis-poc-schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

const publicTables = Array.from(
  schema.matchAll(/create table public\.(\w+)/g),
  (match) => match[1],
);

describe('Supabase schema contract', () => {
  it('enables RLS on every public table', () => {
    expect(publicTables.length).toBeGreaterThan(0);

    for (const table of publicTables) {
      expect(schema).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it('uses explicit grants and no anonymous table access', () => {
    expect(schema).toContain('from anon;');

    for (const table of publicTables) {
      expect(schema).toMatch(new RegExp(`grant [^;]+ on public\\.${table} to authenticated;`));
    }
  });

  it('binds user-owned child records to their parent owner', () => {
    const ownerConstraints = [
      'homework_uploads_session_owner_fk',
      'tasks_session_owner_fk',
      'tasks_upload_owner_fk',
      'messages_session_owner_fk',
      'messages_task_owner_fk',
      'learning_evidence_session_owner_fk',
      'learning_evidence_task_owner_fk',
      'ai_generations_session_owner_fk',
      'ai_generations_task_owner_fk',
      'product_events_session_owner_fk',
    ];

    for (const constraint of ownerConstraints) {
      expect(schema).toContain(`constraint ${constraint}`);
    }
  });

  it('keeps the homework bucket private and scoped to auth.uid()', () => {
    expect(schema).toContain("'homework-private'");
    expect(schema).toMatch(/'homework-private',[\s\S]*?false,[\s\S]*?10485760/);
    expect(schema).toContain('(storage.foldername(name))[1] = (select auth.uid())::text');
  });
});
