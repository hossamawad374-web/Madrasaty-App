drop function if exists public.handle_new_user_profile();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_ai_conversation_message_count() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
