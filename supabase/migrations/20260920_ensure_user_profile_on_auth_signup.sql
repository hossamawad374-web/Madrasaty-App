create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (
    id,
    email,
    username,
    role,
    governorate,
    xp_points,
    is_offline_access_enabled,
    is_verified,
    school_name,
    date_of_birth,
    gender,
    guardian_phone,
    avatar_url
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'full_name',
      case when new.email is not null then split_part(new.email, '@', 1) else null end
    ),
    'STUDENT',
    '',
    0,
    false,
    coalesce(new.email_confirmed_at is not null, false),
    '',
    null,
    '',
    '',
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.user_profiles.username, excluded.username),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

grant select, insert, update on public.user_profiles to authenticated;

drop policy if exists "Users can insert their own profile" on public.user_profiles;

create policy "Users can insert their own profile"
  on public.user_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);
