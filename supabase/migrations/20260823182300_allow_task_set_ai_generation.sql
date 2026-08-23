alter table public.ai_generations
  drop constraint if exists ai_generations_capability_check;

alter table public.ai_generations
  add constraint ai_generations_capability_check
  check (capability in ('homework_parser', 'tutor', 'figure_generator', 'task_set'));
