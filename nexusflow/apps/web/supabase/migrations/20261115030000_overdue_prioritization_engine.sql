-- Deterministic SLA urgency, overdue escalation, and hold tracking.

alter type public.ticket_status add value if not exists 'ON_HOLD';

create table if not exists public.sla_policies (
  id boolean primary key default true check (id),
  first_response_minutes integer not null default 60 check (first_response_minutes > 0),
  resolution_minutes integer not null default 1440 check (resolution_minutes > 0),
  approaching_percent numeric(5,2) not null default 75 check (approaching_percent > 0 and approaching_percent < 100),
  breached_percent numeric(5,2) not null default 100 check (breached_percent >= approaching_percent),
  operations_review_percent numeric(5,2) not null default 125 check (operations_review_percent >= breached_percent),
  severe_overdue_percent numeric(5,2) not null default 150 check (severe_overdue_percent >= operations_review_percent),
  pause_on_hold boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.sla_policies (id) values (true) on conflict (id) do nothing;

alter table public.tickets
  add column if not exists first_response_deadline timestamptz,
  add column if not exists urgency text not null default 'NORMAL',
  add column if not exists sla_consumed_percent numeric(7,2) not null default 0,
  add column if not exists overdue_since timestamptz,
  add column if not exists escalation_state text not null default 'NONE',
  add column if not exists operations_review_required boolean not null default false,
  add column if not exists management_review_required boolean not null default false,
  add column if not exists sla_breach_count integer not null default 0,
  add column if not exists sla_breached_at timestamptz,
  add column if not exists severely_overdue_at timestamptz,
  add column if not exists hold_reason text,
  add column if not exists hold_started_at timestamptz,
  add column if not exists sla_paused_seconds bigint not null default 0;

alter table public.tickets
  drop constraint if exists tickets_urgency_check,
  drop constraint if exists tickets_escalation_state_check;
alter table public.tickets
  add constraint tickets_urgency_check check (urgency in ('CRITICAL', 'URGENT', 'HIGH', 'NORMAL', 'LOW')),
  add constraint tickets_escalation_state_check check (escalation_state in ('NONE', 'APPROACHING', 'BREACHED', 'OPERATIONS_REVIEW', 'SEVERELY_OVERDUE'));

create table if not exists public.ticket_hold_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  reason text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists ticket_escalation_event_once_idx
  on public.ticket_events(ticket_id, event_type)
  where event_type in ('SLA_BREACHED', 'OPERATIONS_REVIEW_REQUIRED', 'SEVERELY_OVERDUE', 'CRITICAL_OVERDUE');

create index if not exists tickets_urgency_idx on public.tickets(urgency, sla_deadline);
create index if not exists tickets_overdue_idx on public.tickets(overdue_since) where overdue_since is not null;

create or replace function public.apply_ticket_sla_defaults()
returns trigger language plpgsql set search_path = ''
as $$
declare policy_row public.sla_policies;
begin
  if tg_op = 'INSERT' and new.sla_deadline is null then
    select * into policy_row from public.sla_policies where id;
    new.first_response_deadline := new.created_at + make_interval(mins => policy_row.first_response_minutes);
    new.sla_deadline := new.created_at + make_interval(mins => policy_row.resolution_minutes);
  end if;
  return new;
end;
$$;

drop trigger if exists a_apply_ticket_sla_defaults on public.tickets;
create trigger a_apply_ticket_sla_defaults
before insert on public.tickets
for each row execute function public.apply_ticket_sla_defaults();

create or replace function public.track_ticket_hold()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'ON_HOLD' and old.status is distinct from 'ON_HOLD' then
    new.hold_started_at := now();
    new.hold_reason := coalesce(nullif(new.hold_reason, ''), 'Placed on hold');
    insert into public.ticket_hold_history (ticket_id, reason, started_at, actor_id)
    values (new.id, new.hold_reason, new.hold_started_at, (select auth.uid()));
  elsif old.status = 'ON_HOLD' and new.status is distinct from 'ON_HOLD' then
    new.sla_paused_seconds := old.sla_paused_seconds
      + coalesce(extract(epoch from (now() - old.hold_started_at))::bigint, 0);
    new.hold_started_at := null;
    update public.ticket_hold_history
    set ended_at = now()
    where ticket_id = new.id and ended_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists track_ticket_hold_before_update on public.tickets;
create trigger track_ticket_hold_before_update
before update of status, hold_reason on public.tickets
for each row execute function public.track_ticket_hold();

create or replace function public.evaluate_ticket_urgency(run_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy_row public.sla_policies;
  ticket_row public.tickets;
  consumed numeric;
  effective_now timestamptz;
  next_urgency text;
  next_state text;
  previous_state text;
  updated_count integer := 0;
  overdue_at timestamptz;
begin
  if (select public.current_user_role()) not in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
     and (select auth.uid()) is not null then
    raise exception 'Only authorized operations users can evaluate ticket urgency';
  end if;
  select * into policy_row from public.sla_policies where id;

  for ticket_row in
    select * from public.tickets
    where status not in ('RESOLVED', 'CLOSED')
  loop
    effective_now := run_at - make_interval(secs => ticket_row.sla_paused_seconds);
    if ticket_row.status = 'ON_HOLD' and policy_row.pause_on_hold then
      effective_now := ticket_row.hold_started_at;
    end if;
    if ticket_row.sla_deadline is null or ticket_row.sla_deadline <= ticket_row.created_at then
      consumed := 0;
    else
      consumed := greatest(0, extract(epoch from (effective_now - ticket_row.created_at))
        / extract(epoch from (ticket_row.sla_deadline - ticket_row.created_at)) * 100);
    end if;
    next_state := case
      when consumed >= policy_row.severe_overdue_percent then 'SEVERELY_OVERDUE'
      when consumed >= policy_row.operations_review_percent then 'OPERATIONS_REVIEW'
      when consumed >= policy_row.breached_percent then 'BREACHED'
      when consumed >= policy_row.approaching_percent then 'APPROACHING'
      else 'NONE'
    end;
    next_urgency := case
      when ticket_row.priority = 'CRITICAL' or consumed >= policy_row.severe_overdue_percent then 'CRITICAL'
      when ticket_row.priority = 'HIGH' and consumed >= policy_row.approaching_percent then 'URGENT'
      when consumed >= policy_row.operations_review_percent then 'URGENT'
      when consumed >= policy_row.breached_percent then 'HIGH'
      when ticket_row.priority = 'MEDIUM' and consumed >= policy_row.approaching_percent then 'HIGH'
      when ticket_row.priority = 'LOW' and consumed >= policy_row.approaching_percent then 'NORMAL'
      when ticket_row.priority = 'LOW' then 'LOW'
      else 'NORMAL'
    end;
    overdue_at := case when consumed >= policy_row.breached_percent
      then coalesce(ticket_row.overdue_since, ticket_row.sla_deadline) end;
    previous_state := ticket_row.escalation_state;

    update public.tickets
    set urgency = next_urgency,
        sla_consumed_percent = round(consumed, 2),
        overdue_since = overdue_at,
        escalation_state = next_state,
        operations_review_required = consumed >= policy_row.operations_review_percent
          or ticket_row.priority = 'CRITICAL' and consumed >= policy_row.breached_percent,
        management_review_required = consumed >= policy_row.severe_overdue_percent
          or ticket_row.sla_breach_count > 1,
        sla_breached_at = case when consumed >= policy_row.breached_percent
          then coalesce(ticket_row.sla_breached_at, run_at) end,
        severely_overdue_at = case when consumed >= policy_row.severe_overdue_percent
          then coalesce(ticket_row.severely_overdue_at, run_at) end,
        sla_breach_count = case when consumed >= policy_row.breached_percent
          and previous_state not in ('BREACHED', 'OPERATIONS_REVIEW', 'SEVERELY_OVERDUE')
          then ticket_row.sla_breach_count + 1 else ticket_row.sla_breach_count end
    where id = ticket_row.id;
    updated_count := updated_count + 1;

    if next_state = 'BREACHED' and previous_state not in ('BREACHED', 'OPERATIONS_REVIEW', 'SEVERELY_OVERDUE') then
      insert into public.ticket_events (ticket_id, event_type, previous_value, new_value, description)
      values (ticket_row.id, 'SLA_BREACHED', jsonb_build_object('state', previous_state),
        jsonb_build_object('percent', consumed), 'Resolution SLA breached.');
    elsif next_state = 'OPERATIONS_REVIEW' and previous_state not in ('OPERATIONS_REVIEW', 'SEVERELY_OVERDUE') then
      insert into public.ticket_events (ticket_id, event_type, previous_value, new_value, description)
      values (ticket_row.id, 'OPERATIONS_REVIEW_REQUIRED', jsonb_build_object('percent', consumed),
        jsonb_build_object('percent', consumed), 'Ticket reached 125% of its SLA window and requires Operations review.');
    elsif next_state = 'SEVERELY_OVERDUE' and previous_state <> 'SEVERELY_OVERDUE' then
      insert into public.ticket_events (ticket_id, event_type, previous_value, new_value, description)
      values (ticket_row.id, 'SEVERELY_OVERDUE', jsonb_build_object('percent', consumed),
        jsonb_build_object('percent', consumed), 'Ticket reached 150% of its SLA window and requires escalation review.');
    end if;
    if ticket_row.priority = 'CRITICAL' and consumed >= policy_row.breached_percent
       and not exists (select 1 from public.ticket_events where ticket_id = ticket_row.id and event_type = 'CRITICAL_OVERDUE') then
      insert into public.ticket_events (ticket_id, event_type, new_value, description)
      values (ticket_row.id, 'CRITICAL_OVERDUE', jsonb_build_object('percent', consumed), 'Critical ticket is overdue and requires Operations attention.');
    end if;
  end loop;
  return updated_count;
end;
$$;

alter table public.sla_policies enable row level security;
create policy sla_policies_read_operations on public.sla_policies for select to authenticated
using ((select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN'));

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron')
     and not exists (select 1 from cron.job where jobname = 'nexusflow-overdue-evaluator') then
    perform cron.schedule('nexusflow-overdue-evaluator', '*/5 * * * *', 'select public.evaluate_ticket_urgency();');
  end if;
exception when undefined_table then
  null;
end;
$$;

