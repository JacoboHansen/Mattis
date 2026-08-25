-- Keep the browser-facing preference table limited to the authenticated
-- parent flow. Safety events remain server-only.
revoke all on public.parent_safety_preferences from anon, authenticated;
grant select, insert, update on public.parent_safety_preferences to authenticated;
grant all on public.parent_safety_preferences to service_role;
