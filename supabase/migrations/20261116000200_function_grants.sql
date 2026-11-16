-- Least privilege on functions. Postgres grants EXECUTE to PUBLIC by default,
-- which reaches the anon role through the REST API. Trigger functions need no
-- caller at all (EXECUTE is checked when the trigger is created, not when it
-- fires). Membership helpers are used inside RLS policies, so signed-in people
-- keep them. Person acts stay callable by signed-in people only, and each
-- checks membership and role in its body.

revoke execute on function public.inherit_engagement_from_card() from public, anon, authenticated;
revoke execute on function public.inherit_engagement_from_session() from public, anon, authenticated;
revoke execute on function public.on_answer_insert() from public, anon, authenticated;
revoke execute on function public.on_comment_insert() from public, anon, authenticated;
revoke execute on function public.on_upload_insert() from public, anon, authenticated;
revoke execute on function public.on_raised_insert() from public, anon, authenticated;
revoke execute on function public.on_action_update() from public, anon, authenticated;
revoke execute on function public.on_session_update() from public, anon, authenticated;

revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.member_role_of(uuid) from public, anon;
revoke execute on function public.try_uuid(text) from public, anon;
revoke execute on function public.mark_card_opened(uuid) from public, anon;
revoke execute on function public.record_consent(uuid, boolean) from public, anon;
revoke execute on function public.tick_action(uuid) from public, anon;
revoke execute on function public.request_reschedule(uuid, text) from public, anon;
revoke execute on function public.submit_answer(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.raise_item(uuid, public.raised_kind, text, boolean, jsonb) from public, anon;

grant execute on function public.is_member(uuid) to authenticated, service_role;
grant execute on function public.member_role_of(uuid) to authenticated, service_role;
grant execute on function public.try_uuid(text) to authenticated, service_role;
grant execute on function public.mark_card_opened(uuid) to authenticated;
grant execute on function public.record_consent(uuid, boolean) to authenticated;
grant execute on function public.tick_action(uuid) to authenticated;
grant execute on function public.request_reschedule(uuid, text) to authenticated;
grant execute on function public.submit_answer(uuid, text, text, jsonb) to authenticated;
grant execute on function public.raise_item(uuid, public.raised_kind, text, boolean, jsonb) to authenticated;
