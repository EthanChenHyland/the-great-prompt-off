-- Transaction-safe admin clearing helpers.
-- Run this in Supabase before deploying the app code that calls these RPCs.

create or replace function public.admin_clear_participant_run_data(
  target_participant_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_participant_id uuid;
begin
  select id
    into target_participant_id
  from participants
  where participant_code = trim(target_participant_code);

  if target_participant_id is null then
    raise exception 'Participant % not found.', target_participant_code;
  end if;

  delete from prompt_run_items
  where prompt_run_id in (
    select id from prompt_runs where participant_id = target_participant_id
  );

  delete from submissions
  where participant_id = target_participant_id;

  delete from prompt_runs
  where participant_id = target_participant_id;
end;
$$;

comment on function public.admin_clear_participant_run_data(text) is
  'Admin-only RPC. Atomically deletes prompt_run_items, submissions, and prompt_runs for one participant while preserving participant identity, access codes, reports, answer keys, and challenges.';

create or replace function public.admin_reset_workshop_run_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from prompt_run_items;
  delete from submissions;
  delete from prompt_runs;
end;
$$;

comment on function public.admin_reset_workshop_run_data() is
  'Admin-only RPC. Atomically deletes all prompt_run_items, submissions, and prompt_runs while preserving participants, access codes, reports, answer keys, and challenges.';

revoke execute on function public.admin_clear_participant_run_data(text)
  from public, anon, authenticated;
revoke execute on function public.admin_reset_workshop_run_data()
  from public, anon, authenticated;

grant execute on function public.admin_clear_participant_run_data(text)
  to service_role;
grant execute on function public.admin_reset_workshop_run_data()
  to service_role;
