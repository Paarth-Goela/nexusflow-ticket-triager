-- Add a distinct platform-level administrator role.
-- Keep this enum change isolated so PostgreSQL can safely use the new value
-- in the following migration.
alter type public.user_role add value if not exists 'SYSTEM_ADMIN';
