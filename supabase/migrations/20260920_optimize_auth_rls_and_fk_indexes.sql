alter policy "Users can read their own profile" on public.user_profiles
  using (id = (select auth.uid()));

alter policy "Users can update their own profile" on public.user_profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "Users can insert their own profile" on public.user_profiles
  with check ((select auth.uid()) = id);

alter policy "Students can read their own quiz results" on public.quiz_results
  using (student_id = (select auth.uid()));

alter policy "Students can insert their own quiz results" on public.quiz_results
  with check (student_id = (select auth.uid()));

alter policy "Users can read their conversations" on public.ai_conversations
  using (user_id = (select auth.uid()));

alter policy "Users can create conversations" on public.ai_conversations
  with check (user_id = (select auth.uid()));

alter policy "Users can update their conversations" on public.ai_conversations
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "Users can delete their conversations" on public.ai_conversations
  using (user_id = (select auth.uid()));

alter policy "Users can read their AI messages" on public.ai_messages
  using (user_id = (select auth.uid()));

alter policy "Users can create their AI messages" on public.ai_messages
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

create index if not exists idx_ai_messages_user_id on public.ai_messages(user_id);
create index if not exists idx_quiz_results_lesson_id on public.quiz_results(lesson_id);
