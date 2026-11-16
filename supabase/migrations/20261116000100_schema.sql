-- Coach portal v1: schema, row-level security and the shared intake contract.
-- Every table carries engagement_id. RLS is enabled on every table and a person
-- reads and writes only rows whose engagement they belong to.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'coach');
create type public.card_size as enum ('standard', 'large');
create type public.card_status as enum ('awaiting_coach', 'question_back', 'answered', 'actioned');
create type public.upload_kind as enum ('photo', 'video', 'pdf', 'audio', 'other');
create type public.raised_kind as enum ('risk', 'supplier_tip', 'idea', 'question');
create type public.session_status as enum (
  'scheduled', 'held', 'cancelled_by_owner_late', 'cancelled', 'reschedule_requested'
);
create type public.intake_kind as enum (
  'answer', 'comment', 'upload', 'voice_note', 'raised_item',
  'question_back', 'action_ticked', 'reschedule_request'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_name text,
  coach_user_id uuid references auth.users (id) on delete set null,
  owner_user_id uuid references auth.users (id) on delete set null,
  -- {"2026-11": "owners_coach", "2026-12": "launch_intensive"}
  tier_by_month jsonb not null default '{}'::jsonb,
  recording_consent_at timestamptz,
  created_at timestamptz not null default now()
);
-- engagement_id for this table is its own id. A generated alias keeps the
-- "every table carries engagement_id" invariant literal.
alter table public.engagements
  add column engagement_id uuid generated always as (id) stored;

create table public.members (
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  display_name text not null,
  consent_answered_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (engagement_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  title text not null,
  question text not null,
  context_md text,
  document_md text,
  document_pdf_path text,
  -- [{"key": "A", "label": "Three carts as specified"}]
  options jsonb not null default '[]'::jsonb,
  recommendation_md text,
  size public.card_size not null default 'standard',
  due_at timestamptz,
  status public.card_status not null default 'awaiting_coach',
  fibery_ref text,
  published_at timestamptz not null default now(),
  opened_at timestamptz,
  answered_at timestamptz,
  actioned_at timestamptz,
  created_at timestamptz not null default now()
);
create index cards_engagement_idx on public.cards (engagement_id, status);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  option_key text not null,
  reasoning_md text,
  created_at timestamptz not null default now()
);
create index answers_card_idx on public.answers (card_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  author_id uuid references auth.users (id),
  author_kind text not null default 'person' check (author_kind in ('person', 'claude')),
  is_question_back boolean not null default false,
  body_md text not null check (length(trim(body_md)) > 0),
  created_at timestamptz not null default now()
);
create index comments_card_idx on public.comments (card_id, created_at);

create table public.raised_items (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  kind public.raised_kind not null,
  body_md text not null check (length(trim(body_md)) > 0),
  add_to_agenda boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  card_id uuid references public.cards (id) on delete set null,
  answer_id uuid references public.answers (id) on delete set null,
  raised_item_id uuid references public.raised_items (id) on delete set null,
  author_id uuid references auth.users (id),
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  kind public.upload_kind not null default 'other',
  transcript_md text,
  created_at timestamptz not null default now()
);
create index uploads_engagement_idx on public.uploads (engagement_id, created_at desc);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  number integer,
  starts_at timestamptz not null,
  duration_min integer not null default 60,
  call_url text,
  agenda_md text,
  summary_md text,
  status public.session_status not null default 'scheduled',
  cancelled_at timestamptz,
  reschedule_note text,
  created_at timestamptz not null default now()
);
create index sessions_engagement_idx on public.sessions (engagement_id, starts_at);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  owner_role public.member_role not null,
  text text not null,
  done_at timestamptz,
  done_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  card_id uuid references public.cards (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  question text not null,
  coach_view text,
  decision text not null,
  decided_at timestamptz not null default now(),
  fibery_ref text
);

create table public.intake_events (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  kind public.intake_kind not null,
  entity_table text not null,
  entity_id uuid not null,
  actor_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  filed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  fibery_ref text,
  routine_fired_at timestamptz,
  judged_at timestamptz
);
create index intake_unfiled_idx on public.intake_events (created_at) where filed_at is null;
create index intake_unjudged_idx on public.intake_events (created_at) where judged_at is null;

create table public.digest_log (
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  sent_on date not null,
  sent_at timestamptz not null default now(),
  card_count integer not null default 0,
  primary key (engagement_id, sent_on)
);

-- Private key/value settings read only by the server (service role).
create table public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies on members do not recurse.
-- ---------------------------------------------------------------------------
create function public.is_member(eid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.engagement_id = eid and m.user_id = (select auth.uid())
  );
$$;

create function public.member_role_of(eid uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.members m
  where m.engagement_id = eid and m.user_id = (select auth.uid());
$$;

create function public.try_uuid(t text)
returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return t::uuid;
exception when others then
  return null;
end;
$$;

-- Child rows take engagement_id from their parent, so a client can neither
-- forget it nor point a row at an engagement it does not belong to.
create function public.inherit_engagement_from_card()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.card_id is not null then
    select c.engagement_id into new.engagement_id from public.cards c where c.id = new.card_id;
  end if;
  return new;
end;
$$;

create function public.inherit_engagement_from_session()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select s.engagement_id into new.engagement_id from public.sessions s where s.id = new.session_id;
  return new;
end;
$$;

create trigger answers_engagement before insert on public.answers
  for each row execute function public.inherit_engagement_from_card();
create trigger comments_engagement before insert on public.comments
  for each row execute function public.inherit_engagement_from_card();
create trigger uploads_engagement before insert on public.uploads
  for each row execute function public.inherit_engagement_from_card();
create trigger actions_engagement before insert on public.actions
  for each row execute function public.inherit_engagement_from_session();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.engagements enable row level security;
alter table public.members enable row level security;
alter table public.cards enable row level security;
alter table public.answers enable row level security;
alter table public.comments enable row level security;
alter table public.raised_items enable row level security;
alter table public.uploads enable row level security;
alter table public.sessions enable row level security;
alter table public.actions enable row level security;
alter table public.decisions enable row level security;
alter table public.intake_events enable row level security;
alter table public.digest_log enable row level security;
alter table public.app_config enable row level security;
-- app_config has no policies: only the service role reads it.

create policy engagements_read on public.engagements for select to authenticated
  using ((select public.is_member(id)));
create policy members_read on public.members for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy cards_read on public.cards for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy answers_read on public.answers for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy answers_write on public.answers for insert to authenticated
  with check (
    (select public.is_member(engagement_id)) and author_id = (select auth.uid())
  );
create policy comments_read on public.comments for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy comments_write on public.comments for insert to authenticated
  with check (
    (select public.is_member(engagement_id))
    and author_id = (select auth.uid())
    and author_kind = 'person'
  );
create policy raised_read on public.raised_items for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy raised_write on public.raised_items for insert to authenticated
  with check (
    (select public.is_member(engagement_id)) and author_id = (select auth.uid())
  );
create policy uploads_read on public.uploads for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy uploads_write on public.uploads for insert to authenticated
  with check (
    (select public.is_member(engagement_id))
    and author_id = (select auth.uid())
    and split_part(storage_path, '/', 1) = engagement_id::text
  );
create policy sessions_read on public.sessions for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy actions_read on public.actions for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy decisions_read on public.decisions for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy intake_read on public.intake_events for select to authenticated
  using ((select public.is_member(engagement_id)));
create policy digest_read on public.digest_log for select to authenticated
  using ((select public.is_member(engagement_id)));

-- Least privilege for the API roles. Writes not listed here go through the
-- SECURITY DEFINER functions below, which check membership themselves.
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant insert on public.answers, public.comments, public.raised_items, public.uploads to authenticated;

-- ---------------------------------------------------------------------------
-- The shared intake contract. One function, used by every coach act through
-- AFTER triggers, so each act writes exactly one intake_events row in the same
-- transaction as the act itself. Writes by the service role (Claude) carry no
-- auth.uid() and are not intake.
-- ---------------------------------------------------------------------------
create function public.record_intake(
  p_engagement uuid, p_kind public.intake_kind, p_table text, p_entity uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return;
  end if;
  insert into public.intake_events (engagement_id, kind, entity_table, entity_id, actor_id)
  values (p_engagement, p_kind, p_table, p_entity, (select auth.uid()));
end;
$$;

create function public.on_answer_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.cards
     set status = 'answered', answered_at = coalesce(answered_at, now())
   where id = new.card_id and status <> 'actioned';
  perform public.record_intake(new.engagement_id, 'answer', 'answers', new.id);
  return null;
end;
$$;
create trigger answers_intake after insert on public.answers
  for each row execute function public.on_answer_insert();

create function public.on_comment_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.author_kind <> 'person' then
    return null;
  end if;
  if new.is_question_back then
    update public.cards set status = 'question_back'
     where id = new.card_id and status = 'awaiting_coach';
    perform public.record_intake(new.engagement_id, 'question_back', 'comments', new.id);
  else
    perform public.record_intake(new.engagement_id, 'comment', 'comments', new.id);
  end if;
  return null;
end;
$$;
create trigger comments_intake after insert on public.comments
  for each row execute function public.on_comment_insert();

create function public.on_upload_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_intake(
    new.engagement_id,
    case when new.kind = 'audio' then 'voice_note'::public.intake_kind else 'upload'::public.intake_kind end,
    'uploads', new.id
  );
  return null;
end;
$$;
create trigger uploads_intake after insert on public.uploads
  for each row execute function public.on_upload_insert();

create function public.on_raised_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.record_intake(new.engagement_id, 'raised_item', 'raised_items', new.id);
  return null;
end;
$$;
create trigger raised_intake after insert on public.raised_items
  for each row execute function public.on_raised_insert();

create function public.on_action_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.done_at is null and new.done_at is not null then
    perform public.record_intake(new.engagement_id, 'action_ticked', 'actions', new.id);
  end if;
  return null;
end;
$$;
create trigger actions_intake after update of done_at on public.actions
  for each row execute function public.on_action_update();

create function public.on_session_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'reschedule_requested' and old.status is distinct from 'reschedule_requested' then
    perform public.record_intake(new.engagement_id, 'reschedule_request', 'sessions', new.id);
  end if;
  return null;
end;
$$;
create trigger sessions_intake after update of status on public.sessions
  for each row execute function public.on_session_update();

-- ---------------------------------------------------------------------------
-- Person acts that change existing rows. Each checks membership and role.
-- ---------------------------------------------------------------------------
create function public.submit_answer(
  p_card_id uuid, p_option_key text, p_reasoning text, p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_answer uuid;
  v_engagement uuid;
  a jsonb;
begin
  select engagement_id into v_engagement from public.cards where id = p_card_id;
  if v_engagement is null then
    raise exception 'card not found' using errcode = 'P0002';
  end if;
  insert into public.answers (engagement_id, card_id, author_id, option_key, reasoning_md)
  values (v_engagement, p_card_id, (select auth.uid()), p_option_key, nullif(trim(p_reasoning), ''))
  returning id into v_answer;
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.uploads (
      engagement_id, card_id, answer_id, author_id, storage_path, file_name, mime_type, size_bytes, kind
    ) values (
      v_engagement, p_card_id, v_answer, (select auth.uid()),
      a ->> 'storage_path', a ->> 'file_name', a ->> 'mime_type',
      nullif(a ->> 'size_bytes', '')::bigint,
      coalesce(a ->> 'kind', 'other')::public.upload_kind
    );
  end loop;
  return v_answer;
end;
$$;

create function public.raise_item(
  p_engagement uuid, p_kind public.raised_kind, p_body text, p_add_to_agenda boolean,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_item uuid;
  a jsonb;
begin
  insert into public.raised_items (engagement_id, author_id, kind, body_md, add_to_agenda)
  values (p_engagement, (select auth.uid()), p_kind, p_body, coalesce(p_add_to_agenda, false))
  returning id into v_item;
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.uploads (
      engagement_id, raised_item_id, author_id, storage_path, file_name, mime_type, size_bytes, kind
    ) values (
      p_engagement, v_item, (select auth.uid()),
      a ->> 'storage_path', a ->> 'file_name', a ->> 'mime_type',
      nullif(a ->> 'size_bytes', '')::bigint,
      coalesce(a ->> 'kind', 'other')::public.upload_kind
    );
  end loop;
  return v_item;
end;
$$;

create function public.mark_card_opened(p_card_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_engagement uuid;
begin
  select engagement_id into v_engagement from public.cards where id = p_card_id;
  if public.member_role_of(v_engagement) = 'coach' then
    update public.cards set opened_at = now() where id = p_card_id and opened_at is null;
  end if;
end;
$$;

create function public.record_consent(p_engagement uuid, p_consent boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_member(p_engagement) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  update public.members set consent_answered_at = now()
   where engagement_id = p_engagement and user_id = (select auth.uid());
  if p_consent and public.member_role_of(p_engagement) = 'coach' then
    update public.engagements set recording_consent_at = coalesce(recording_consent_at, now())
     where id = p_engagement;
  end if;
end;
$$;

create function public.tick_action(p_action_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  select engagement_id, owner_role, done_at into r from public.actions where id = p_action_id;
  if r is null or public.member_role_of(r.engagement_id) is distinct from r.owner_role then
    raise exception 'not your action' using errcode = '42501';
  end if;
  update public.actions set done_at = now(), done_by = (select auth.uid())
   where id = p_action_id and done_at is null;
end;
$$;

create function public.request_reschedule(p_session_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_engagement uuid;
begin
  select engagement_id into v_engagement from public.sessions where id = p_session_id;
  if v_engagement is null or not public.is_member(v_engagement) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  update public.sessions
     set status = 'reschedule_requested', reschedule_note = nullif(trim(p_note), '')
   where id = p_session_id and status = 'scheduled';
end;
$$;

-- ---------------------------------------------------------------------------
-- Intake processing helpers, service role only.
-- ---------------------------------------------------------------------------
-- A short lease so one filer runs at a time (wiki appends are read then write).
create function public.acquire_intake_lease(p_holder text, p_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare v_ok boolean;
begin
  insert into public.app_config (key, value) values ('intake_lease', '')
  on conflict (key) do nothing;
  update public.app_config
     set value = p_holder || '|' || (now() + make_interval(secs => p_seconds))::text,
         updated_at = now()
   where key = 'intake_lease'
     and (value = '' or split_part(value, '|', 2)::timestamptz < now()
          or split_part(value, '|', 1) = p_holder)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create function public.release_intake_lease(p_holder text)
returns void
language sql security definer set search_path = ''
as $$
  update public.app_config set value = '', updated_at = now()
   where key = 'intake_lease' and split_part(value, '|', 1) = p_holder;
$$;

create function public.claim_intake_events(p_limit integer, p_max_attempts integer default 12)
returns setof public.intake_events
language sql security definer set search_path = ''
as $$
  update public.intake_events e
     set claimed_at = now()
   where e.id in (
     select id from public.intake_events
      where filed_at is null
        and attempts < p_max_attempts
        and (claimed_at is null or claimed_at < now() - interval '1 minute')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning e.*;
$$;

revoke execute on function public.acquire_intake_lease(text, integer) from public, anon, authenticated;
revoke execute on function public.release_intake_lease(text) from public, anon, authenticated;
revoke execute on function public.claim_intake_events(integer, integer) from public, anon, authenticated;
revoke execute on function public.record_intake(uuid, public.intake_kind, text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_intake_lease(text, integer) to service_role;
grant execute on function public.release_intake_lease(text) to service_role;
grant execute on function public.claim_intake_events(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Private storage. Objects live under <engagement_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 52428800)
on conflict (id) do nothing;

create policy uploads_bucket_read on storage.objects for select to authenticated
  using (
    bucket_id = 'uploads'
    and (select public.is_member(public.try_uuid((storage.foldername(name))[1])))
  );
create policy uploads_bucket_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (select public.is_member(public.try_uuid((storage.foldername(name))[1])))
  );
