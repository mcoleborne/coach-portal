-- Seeds the test engagement "Club de Vela coaching (test)": Matt as owner, a
-- test guest as coach, three sample cards, last session with actions, the next
-- session, and one sample decision. Sends no email. Safe to run once.
--
-- psql variables (never committed): owner_email, guest_email
--   psql "$DB_URL" -v owner_email=... -v guest_email=... -f scripts/seed-test-engagement.sql

begin;

create temporary table seed_people (email text primary key, id uuid not null) on commit drop;

insert into seed_people (email, id)
select e, coalesce((select u.id from auth.users u where lower(u.email) = lower(e)), gen_random_uuid())
from unnest(array[:'owner_email', :'guest_email']::text[]) as e;

-- Accounts that can receive an emailed sign-in link. Token columns are empty
-- strings, not null, as Supabase Auth expects.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', p.id, 'authenticated', 'authenticated', p.email, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from seed_people p
where not exists (select 1 from auth.users u where u.id = p.id);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), p.id, p.id::text,
       jsonb_build_object('sub', p.id::text, 'email', p.email, 'email_verified', true), 'email', now(), now(), now()
from seed_people p
where not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'email');

with owner as (select id from seed_people where email = :'owner_email'),
     guest as (select id from seed_people where email = :'guest_email'),
     eng as (
       insert into public.engagements (name, client_name, owner_user_id, coach_user_id, tier_by_month)
       select 'Club de Vela coaching (test)', 'Club de Vela', owner.id, guest.id,
              jsonb_build_object(
                to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM'), 'owners_coach',
                to_char((now() at time zone 'Australia/Sydney') + interval '1 month', 'YYYY-MM'), 'launch_intensive'
              )
       from owner, guest
       where not exists (select 1 from public.engagements where name = 'Club de Vela coaching (test)')
       returning id
     ),
     m as (
       insert into public.members (engagement_id, user_id, role, display_name)
       select eng.id, owner.id, 'owner'::public.member_role, 'Matt' from eng, owner
       union all
       select eng.id, guest.id, 'coach'::public.member_role, 'Test guest' from eng, guest
       returning engagement_id
     ),
     c as (
       insert into public.cards (engagement_id, title, question, context_md, document_md, options, recommendation_md, size, due_at)
       select eng.id, v.title, v.question, v.context_md, v.document_md, v.options::jsonb, v.rec, v.size::public.card_size, now() + v.due
       from eng, (values
         ('Cart requirements v1.0 (sample)',
          'Do three carts cover a packed summer Saturday, or do we need a fourth from day one?',
          'Sample context for the test guest. No real document content.',
          E'# Cart requirements v1.0 (sample)\n\n## 1. Purpose of the carts\nSample paragraph.\n\n## 2. Cart one: coffee\n| Item | Power | Water |\n|---|---|---|\n| Sample machine | Sample | Sample |\n\n## 3. Cart two: drinks\nSample paragraph.\n\n## 4. Cart three: grill\nSample paragraph. End of sample document.',
          '[{"key":"A","label":"Three carts as specified: coffee, drinks, grill."},{"key":"B","label":"Add a fourth cart for cold and raw plates from day one."},{"key":"C","label":"Three carts now, with power and space left for a fourth."}]',
          'Sample recommendation: C.', 'standard', interval '2 days'),
         ('Launch menu v1 (sample)',
          'What to cut for opening?',
          'Sample context for the test guest. No real document content.',
          E'# Launch menu v1 (sample)\n\nSample items only.',
          '[{"key":"A","label":"Keep every item."},{"key":"B","label":"Cut to the strongest twenty."}]',
          'Sample recommendation: B.', 'large', interval '3 days'),
         ('Licensee duties checklist (sample)',
          'Anything missing from a good licensee''s week?',
          'Sample context for the test guest. No real document content.',
          E'# Licensee duties checklist (sample)\n\n- Sample duty one\n- Sample duty two',
          '[{"key":"A","label":"Complete as it stands."},{"key":"B","label":"Needs additions."}]',
          'Sample recommendation: A.', 'standard', interval '4 days')
       ) as v(title, question, context_md, document_md, options, rec, size, due)
       returning id
     ),
     last_s as (
       insert into public.sessions (engagement_id, number, starts_at, status, summary_md)
       select eng.id, 2, now() - interval '6 days', 'held'::public.session_status, 'Sample summary of session 2.' from eng
       returning id, engagement_id
     ),
     next_s as (
       insert into public.sessions (engagement_id, number, starts_at, status, agenda_md)
       select eng.id, 3, date_trunc('hour', now() + interval '2 days'), 'scheduled'::public.session_status,
              E'1. Wins and numbers since last session (5 min)\n2. Cart requirements v1.0 (sample): sign-off (20 min)\n3. Upcoming decisions and risks (10 min)'
       from eng
       returning id
     ),
     d as (
       insert into public.decisions (engagement_id, session_id, question, coach_view, decision, decided_at)
       select last_s.engagement_id, last_s.id, 'Which roasters to sample? (sample)', 'Three, local first (sample)',
              'Shortlist of three (sample)', now() - interval '6 days'
       from last_s
       returning id
     )
insert into public.actions (engagement_id, session_id, owner_role, text)
select last_s.engagement_id, last_s.id, v.role::public.member_role, v.text
from last_s, (values ('owner', 'Send three roaster samples (sample)'), ('coach', 'Mark up cart workflow sketch (sample)')) as v(role, text);

commit;

select e.id as engagement_id, e.name, (select count(*) from public.cards c where c.engagement_id = e.id) as cards
from public.engagements e where e.name = 'Club de Vela coaching (test)';
