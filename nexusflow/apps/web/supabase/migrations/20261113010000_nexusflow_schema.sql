create extension if not exists pgcrypto;

create type public.user_role as enum ('CUSTOMER', 'FACTORY_AGENT', 'LOGISTICS_AGENT', 'OPERATIONS_ADMIN');
create type public.department as enum ('FACTORY', 'LOGISTICS', 'OPERATIONS');
create type public.ticket_priority as enum ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
create type public.ticket_status as enum ('NEW', 'AI_TRIAGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_TEAM', 'RESOLVED', 'CLOSED');
create type public.message_visibility as enum ('PUBLIC', 'INTERNAL');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.user_role not null default 'CUSTOMER',
  department public.department,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_department_check check (
    (role = 'CUSTOMER' and department is null)
    or (role <> 'CUSTOMER' and department is not null)
  )
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  subject text not null,
  description text not null,
  customer_email text not null,
  customer_company text,
  order_id text,
  shipment_id text,
  department public.department not null default 'OPERATIONS',
  category text not null,
  priority public.ticket_priority not null default 'MEDIUM',
  priority_score integer not null default 50 check (priority_score between 0 and 100),
  status public.ticket_status not null default 'NEW',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sla_deadline timestamptz,
  ai_summary text not null default 'Simulated triage pending real AI service integration.'
);

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  message text not null,
  visibility public.message_visibility not null default 'PUBLIC',
  created_at timestamptz not null default now()
);

create table public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  previous_value jsonb,
  new_value jsonb,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.ticket_assignments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  department public.department not null,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index tickets_customer_id_idx on public.tickets(customer_id);
create index tickets_department_status_idx on public.tickets(department, status);
create index tickets_priority_idx on public.tickets(priority);
create index tickets_updated_at_idx on public.tickets(updated_at desc);
create index ticket_messages_ticket_id_idx on public.ticket_messages(ticket_id, created_at);
create index ticket_events_ticket_id_idx on public.ticket_events(ticket_id, created_at);
create index ticket_assignments_ticket_id_idx on public.ticket_assignments(ticket_id, created_at);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger tickets_updated_at before update on public.tickets for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.current_user_department()
returns public.department language sql stable security definer set search_path = ''
as $$
  select department from public.profiles where id = (select auth.uid());
$$;

create or replace function public.provision_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.provision_profile();

create or replace function public.prevent_self_role_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.role is distinct from old.role then
    raise exception 'Profile roles are provisioned by trusted administration';
  end if;
  return new;
end;
$$;

create trigger protect_profile_role before update on public.profiles for each row execute function public.prevent_self_role_change();

create or replace function public.protect_ticket_fields()
returns trigger language plpgsql set search_path = ''
as $$
declare
  role_value public.user_role := public.current_user_role();
begin
  if role_value = 'CUSTOMER' and tg_op = 'INSERT' then
    new.department := 'OPERATIONS';
    new.priority := 'MEDIUM';
    new.priority_score := 50;
    new.status := 'NEW';
    new.assigned_to := null;
    new.ai_summary := 'Simulated triage pending real AI service integration.';
  elsif role_value <> 'OPERATIONS_ADMIN' then
    if new.department is distinct from old.department
      or new.priority is distinct from old.priority
      or new.priority_score is distinct from old.priority_score
      or new.assigned_to is distinct from old.assigned_to
      or new.ai_summary is distinct from old.ai_summary then
      raise exception 'Only operations administrators may change protected ticket fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_ticket_fields before insert or update on public.tickets
for each row execute function public.protect_ticket_fields();

alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_events enable row level security;
alter table public.ticket_assignments enable row level security;

create policy profiles_select_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.current_user_role()) = 'OPERATIONS_ADMIN');
create policy profiles_update_self_nonrole on public.profiles for update to authenticated
using (id = (select auth.uid()) or (select public.current_user_role()) = 'OPERATIONS_ADMIN')
with check (id = (select auth.uid()) or (select public.current_user_role()) = 'OPERATIONS_ADMIN');

create policy tickets_select_owner_department_or_admin on public.tickets for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
);
create policy tickets_insert_customer_owned on public.tickets for insert to authenticated
with check (customer_id = (select auth.uid()) and (select public.current_user_role()) = 'CUSTOMER');
create policy tickets_update_department_or_admin on public.tickets for update to authenticated
using (
  (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
)
with check (
  (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
);
create policy tickets_delete_admin on public.tickets for delete to authenticated
using ((select public.current_user_role()) = 'OPERATIONS_ADMIN');

create policy messages_select_public_owner_or_internal_team on public.ticket_messages for select to authenticated
using (
  (visibility = 'PUBLIC' and exists (select 1 from public.tickets t where t.id = ticket_id and t.customer_id = (select auth.uid())))
  or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or exists (select 1 from public.tickets t where t.id = ticket_id and (
    ((select public.current_user_role()) = 'FACTORY_AGENT' and t.department = 'FACTORY')
    or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and t.department = 'LOGISTICS')
  ))
);
create policy messages_insert_permitted_ticket on public.ticket_messages for insert to authenticated
with check (
  (author_id = (select auth.uid()) and visibility = 'PUBLIC' and exists (select 1 from public.tickets t where t.id = ticket_id and t.customer_id = (select auth.uid())))
  or (author_id = (select auth.uid()) and (select public.current_user_role()) = 'OPERATIONS_ADMIN')
  or (author_id = (select auth.uid()) and exists (select 1 from public.tickets t where t.id = ticket_id and (
    ((select public.current_user_role()) = 'FACTORY_AGENT' and t.department = 'FACTORY')
    or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and t.department = 'LOGISTICS')
  )))
);

create policy events_select_public_owner_or_team on public.ticket_events for select to authenticated
using (
  (actor_id is null or event_type in ('CREATED', 'STATUS_CHANGE', 'CUSTOMER_MESSAGE'))
  and (
    exists (select 1 from public.tickets t where t.id = ticket_id and t.customer_id = (select auth.uid()))
    or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
    or ((select public.current_user_role()) = 'FACTORY_AGENT' and exists (select 1 from public.tickets t where t.id = ticket_id and t.department = 'FACTORY'))
    or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and exists (select 1 from public.tickets t where t.id = ticket_id and t.department = 'LOGISTICS'))
  )
);
create policy events_insert_team_or_admin on public.ticket_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (select public.current_user_role()) = 'OPERATIONS_ADMIN'
    or ((select public.current_user_role()) = 'FACTORY_AGENT' and exists (select 1 from public.tickets t where t.id = ticket_id and t.department = 'FACTORY'))
    or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and exists (select 1 from public.tickets t where t.id = ticket_id and t.department = 'LOGISTICS'))
  )
);

create policy assignments_select_team_or_admin on public.ticket_assignments for select to authenticated
using ((select public.current_user_role()) = 'OPERATIONS_ADMIN' or department = (select public.current_user_department()));
create policy assignments_insert_admin on public.ticket_assignments for insert to authenticated
with check ((select public.current_user_role()) = 'OPERATIONS_ADMIN');
