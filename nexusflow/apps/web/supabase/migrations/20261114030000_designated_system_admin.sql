-- Constrain SYSTEM_ADMIN to the one designated, authenticated account.
-- This is a forward-only migration so an already-applied access migration is
-- not rewritten and existing ticket/profile data is retained.

update public.profiles
set role = 'OPERATIONS_ADMIN',
    department = 'OPERATIONS'
where role = 'SYSTEM_ADMIN'
  and lower(email) <> 'f20230006@hyderabad.bits-pilani.ac.in';

insert into public.profiles (id, full_name, email, role, department)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  u.email,
  'SYSTEM_ADMIN',
  'OPERATIONS'
from auth.users u
where lower(u.email) = 'f20230006@hyderabad.bits-pilani.ac.in'
  and u.email_confirmed_at is not null
on conflict (id) do update
set email = excluded.email,
    role = 'SYSTEM_ADMIN',
    department = 'OPERATIONS';

update public.profiles p
set role = 'OPERATIONS_ADMIN',
    department = 'OPERATIONS'
where p.role = 'SYSTEM_ADMIN'
  and not exists (
    select 1
    from auth.users u
    where u.id = p.id
      and lower(u.email) = 'f20230006@hyderabad.bits-pilani.ac.in'
      and u.email_confirmed_at is not null
  );

alter table public.profiles
  drop constraint if exists profiles_system_admin_email_check;
alter table public.profiles
  add constraint profiles_system_admin_email_check
  check (
    role <> 'SYSTEM_ADMIN'
    or lower(email) = 'f20230006@hyderabad.bits-pilani.ac.in'
  );

alter table public.profiles
  drop constraint if exists profiles_system_admin_department_check;
alter table public.profiles
  add constraint profiles_system_admin_department_check
  check (role <> 'SYSTEM_ADMIN' or department = 'OPERATIONS');

create unique index if not exists profiles_single_system_admin_idx
  on public.profiles (role)
  where role = 'SYSTEM_ADMIN';

