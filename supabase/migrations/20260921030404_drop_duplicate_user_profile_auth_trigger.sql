-- Keep a single auth.users -> user_profiles trigger.
-- The restored on_auth_user_created_profile trigger is the canonical trigger.
drop trigger if exists on_auth_user_created on auth.users;
