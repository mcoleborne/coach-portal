-- Slice 4: the intake trigger and the schedules.
--
-- Every intake_events row pokes the app's filing route straight away through
-- pg_net (a database webhook). The route files the event to Fibery and fires
-- the AG-095 routine. pg_cron calls the same route every 15 minutes to retry
-- anything unfiled, and calls the digest route at 7:30am Sydney.
--
-- The poke carries no secret. The route treats it as a hint: it reads pending
-- events itself with the service role and files only those, so a stray call
-- can do no more than file what was already waiting.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- app_config keys used here (set per environment, not in this file):
--   app_url             e.g. https://coach-portal.vercel.app
--   intake_webhook_on   'true' to poke on every event (off by default)

create function public.call_app(p_path text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_id bigint;
begin
  select value into v_url from public.app_config where key = 'app_url';
  if v_url is null or v_url = '' then
    return null;
  end if;
  select net.http_post(
    url := rtrim(v_url, '/') || p_path,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'User-Agent', 'coach-portal-db'),
    timeout_milliseconds := 10000
  ) into v_id;
  return v_id;
end;
$$;

create function public.poke_intake()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.app_config where key = 'intake_webhook_on' and value = 'true') then
    perform public.call_app(
      '/api/intake/process',
      jsonb_build_object('event_id', new.id, 'kind', new.kind, 'source', 'webhook')
    );
  end if;
  return null;
end;
$$;

create trigger intake_events_poke after insert on public.intake_events
  for each row execute function public.poke_intake();

revoke execute on function public.call_app(text, jsonb) from public, anon, authenticated;
revoke execute on function public.poke_intake() from public, anon, authenticated;
grant execute on function public.call_app(text, jsonb) to service_role;

-- Schedules are in UTC. 20:30 UTC is 7:30am AEDT and 21:30 UTC is 7:30am AEST.
-- The digest route checks the Sydney clock and the once-a-day log, so only
-- the call that lands at 7:30am local sends.
select cron.schedule(
  'coach-portal-intake-retry', '*/15 * * * *',
  $$ select public.call_app('/api/intake/process', '{"source":"cron"}'::jsonb) $$
);
select cron.schedule(
  'coach-portal-digest-aedt', '30 20 * * *',
  $$ select public.call_app('/api/digest', '{"source":"cron"}'::jsonb) $$
);
select cron.schedule(
  'coach-portal-digest-aest', '30 21 * * *',
  $$ select public.call_app('/api/digest', '{"source":"cron"}'::jsonb) $$
);
