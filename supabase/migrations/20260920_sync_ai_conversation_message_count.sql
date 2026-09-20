create or replace function public.sync_ai_conversation_message_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.ai_conversations
      set message_count = (
        select count(*) from public.ai_messages where conversation_id = old.conversation_id
      )
    where id = old.conversation_id;
  else
    update public.ai_conversations
      set message_count = (
        select count(*) from public.ai_messages where conversation_id = new.conversation_id
      )
    where id = new.conversation_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ai_messages_sync_message_count on public.ai_messages;

create trigger trg_ai_messages_sync_message_count
after insert or delete on public.ai_messages
for each row
execute function public.sync_ai_conversation_message_count();

update public.ai_conversations c
set message_count = (
  select count(*) from public.ai_messages m where m.conversation_id = c.id
);
