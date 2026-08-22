-- Mattis learning loop v1.
--
-- Adds durable session planning metadata, task phases, tutor-turn metadata and
-- idempotent learning evidence. Mastery is updated transactionally whenever a
-- learning signal is stored. All student-facing tables remain protected by
-- the existing owner-scoped RLS policies.

alter table public.tasks
  add column if not exists phase text not null default 'homework',
  add column if not exists origin text not null default 'manual',
  add column if not exists estimated_minutes smallint not null default 6;

alter table public.tasks
  drop constraint if exists tasks_phase_check,
  add constraint tasks_phase_check
    check (phase in ('homework', 'repetition')),
  drop constraint if exists tasks_origin_check,
  add constraint tasks_origin_check
    check (origin in ('image', 'manual', 'planned_review')),
  drop constraint if exists tasks_estimated_minutes_check,
  add constraint tasks_estimated_minutes_check
    check (estimated_minutes between 1 and 60);

alter table public.sessions
  add column if not exists plan_snapshot jsonb not null default '{}'::jsonb;

alter table public.sessions
  drop constraint if exists sessions_plan_snapshot_object_check,
  add constraint sessions_plan_snapshot_object_check
    check (jsonb_typeof(plan_snapshot) = 'object');

alter table public.messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.messages
  drop constraint if exists messages_metadata_object_check,
  add constraint messages_metadata_object_check
    check (jsonb_typeof(metadata) = 'object');

alter table public.messages
  add constraint messages_id_user_unique unique (id, user_id);

alter table public.learning_evidence
  add column if not exists source_message_id uuid;

alter table public.learning_evidence
  add constraint learning_evidence_source_message_owner_fk
    foreign key (source_message_id, user_id)
    references public.messages(id, user_id)
    on delete cascade;

alter table public.learning_evidence
  add constraint learning_evidence_source_concept_unique
    unique (source_message_id, concept_key);

alter table public.homework_uploads
  drop constraint if exists homework_uploads_status_check,
  add constraint homework_uploads_status_check
    check (status in ('prepared', 'uploaded', 'processing', 'parsed', 'failed', 'deleted'));

-- Keep server-owned metadata out of unrestricted timestamp/retention columns.
revoke update on public.sessions from authenticated;
grant update (
  status,
  current_phase,
  planned_at,
  duration_minutes,
  started_at,
  ended_at,
  summary_nb,
  next_topic_nb,
  plan_snapshot,
  updated_at
) on public.sessions to authenticated;

revoke insert on public.messages from authenticated;
grant insert (
  user_id,
  session_id,
  task_id,
  role,
  content_nb,
  intent,
  client_message_id,
  metadata
) on public.messages to authenticated;

revoke insert on public.learning_evidence from authenticated;
grant insert (
  user_id,
  session_id,
  task_id,
  concept_key,
  evidence_type,
  score,
  confidence,
  misconception_code,
  note_nb,
  source_message_id
) on public.learning_evidence to authenticated;

-- Mastery is derived data. Students may read their own profile, but only the
-- evidence trigger below is allowed to change it.
revoke insert, update, delete on public.mastery from authenticated;

create index if not exists tasks_user_session_phase_status_idx
  on public.tasks (user_id, session_id, phase, status, sequence_no);

create index if not exists mastery_user_estimate_idx
  on public.mastery (user_id, estimate, confidence desc);

create index if not exists learning_evidence_source_message_idx
  on public.learning_evidence (source_message_id)
  where source_message_id is not null;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.update_mastery_from_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_weight numeric := greatest(0.08, least(0.35, new.confidence * 0.30));
begin
  if auth.uid() is null or auth.uid() <> new.user_id then
    raise exception 'learning evidence owner mismatch' using errcode = '42501';
  end if;

  insert into public.mastery (
    user_id,
    concept_key,
    estimate,
    confidence,
    evidence_count,
    last_practiced_at,
    updated_at
  ) values (
    new.user_id,
    new.concept_key,
    round((0.5 * (1 - evidence_weight) + new.score * evidence_weight)::numeric, 3),
    round(least(1, 0.10 + new.confidence * 0.15)::numeric, 3),
    1,
    new.created_at,
    now()
  )
  on conflict (user_id, concept_key) do update set
    estimate = round((
      public.mastery.estimate * (1 - evidence_weight)
      + new.score * evidence_weight
    )::numeric, 3),
    confidence = round(least(
      1,
      public.mastery.confidence + 0.05 + new.confidence * 0.10
    )::numeric, 3),
    evidence_count = public.mastery.evidence_count + 1,
    last_practiced_at = new.created_at,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.update_mastery_from_evidence() from public;

drop trigger if exists learning_evidence_updates_mastery on public.learning_evidence;
create trigger learning_evidence_updates_mastery
after insert on public.learning_evidence
for each row execute function private.update_mastery_from_evidence();

-- Compact, grade-spanning taxonomy used by the first parser/planner. It is a
-- product taxonomy aligned to MAT01-05, not a replacement for storing the
-- complete curriculum text and competence-goal mappings later.
insert into public.curriculum_concepts (
  concept_key,
  title_nb,
  description_nb,
  grade_min,
  grade_max,
  prerequisite_keys,
  curriculum_version,
  source_reference
) values
  ('numbers.place_value', 'Tallforståelse og plassverdi', 'Lese, sammenligne og representere tall.', 1, 10, '{}', 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('numbers.operations', 'Regnearter', 'Addisjon, subtraksjon, multiplikasjon og divisjon.', 1, 13, '{}', 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('numbers.negative', 'Negative tall', 'Regning og resonnering med negative tall.', 5, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('numbers.fractions_decimals', 'Brøk og desimaltall', 'Brøk, desimaltall og sammenhenger mellom representasjoner.', 4, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('numbers.powers_roots', 'Potenser og røtter', 'Potenser, kvadratrøtter og regneregler.', 8, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('algebra.patterns', 'Mønstre og generalisering', 'Oppdage og beskrive matematiske mønstre.', 3, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('algebra.expressions', 'Algebraiske uttrykk', 'Forenkle og bruke uttrykk med variabler.', 7, 13, array['algebra.patterns'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('algebra.equations', 'Likninger', 'Løse og forklare likninger.', 7, 13, array['algebra.expressions'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('algebra.systems', 'Likningssett', 'Modellere og løse systemer av likninger.', 9, 13, array['algebra.equations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('functions.linear', 'Lineære funksjoner', 'Tolke og bruke lineære sammenhenger.', 8, 13, array['algebra.equations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('functions.other', 'Ikke-lineære funksjoner', 'Tolke og bruke andre funksjonstyper.', 9, 13, array['functions.linear'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('geometry.shapes_angles', 'Figurer og vinkler', 'Egenskaper ved geometriske figurer og vinkler.', 1, 13, '{}', 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('geometry.measurement', 'Måling, omkrets, areal og volum', 'Måle og beregne geometriske størrelser.', 3, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('geometry.pythagoras', 'Pytagoras', 'Bruke Pytagoras’ setning i rettvinklede trekanter.', 8, 13, array['geometry.measurement'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('geometry.similarity_congruence', 'Formlikhet og kongruens', 'Resonnere om målestokk, formlikhet og kongruens.', 8, 13, array['geometry.shapes_angles'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('statistics', 'Statistikk', 'Samle, representere og tolke data.', 3, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('probability', 'Sannsynlighet', 'Beregne og vurdere sannsynlighet.', 5, 13, array['numbers.fractions_decimals'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('percent.finance', 'Prosent og økonomi', 'Prosent, vekstfaktor, rente og personlig økonomi.', 5, 13, array['numbers.fractions_decimals'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('units.rates', 'Enheter og sammensatte enheter', 'Regne med enheter, fart og andre forholdstall.', 5, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('spreadsheet.modelling', 'Regneark og modellering', 'Bruke regneark til beregning, utforsking og modeller.', 5, 13, array['numbers.operations'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05'),
  ('programming.math', 'Programmering i matematikk', 'Lese og lage enkle programmer for matematiske problemer.', 5, 13, array['algebra.patterns'], 'MAT01-05-taxonomy-v1', 'LK20 MAT01-05')
on conflict (concept_key) do update set
  title_nb = excluded.title_nb,
  description_nb = excluded.description_nb,
  grade_min = excluded.grade_min,
  grade_max = excluded.grade_max,
  prerequisite_keys = excluded.prerequisite_keys,
  curriculum_version = excluded.curriculum_version,
  source_reference = excluded.source_reference,
  updated_at = now();
