-- Persistent in-app notifications and an idempotent email outbox.

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  assignment_enabled boolean not null default true,
  status_enabled boolean not null default true,
  escalation_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  ticket_id uuid references public.tickets(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null default 'EMAIL' check (channel in ('EMAIL')),
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.notification_outbox(id) on delete cascade,
  attempt_number integer not null,
  status text not null check (status in ('SENT', 'FAILED')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(status, available_at);

create or replace function public.ensure_notification_preferences()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notification_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_notification_preferences_after_profile on public.profiles;
create trigger ensure_notification_preferences_after_profile
after insert on public.profiles for each row execute function public.ensure_notification_preferences();

insert into public.notification_preferences(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.enqueue_notification(
  recipient_id_input uuid,
  ticket_id_input uuid,
  category_input text,
  title_input text,
  body_input text,
  payload_input jsonb,
  idempotency_key_input text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare notification_id_value uuid;
begin
  if not exists (
    select 1 from public.notification_preferences p
    where p.user_id = recipient_id_input and (p.in_app_enabled or p.email_enabled)
  ) then
    return null;
  end if;
  insert into public.notifications(
    recipient_id, ticket_id, category, title, body, payload, idempotency_key
  ) values (
    recipient_id_input, ticket_id_input, category_input, title_input, body_input,
    coalesce(payload_input, '{}'::jsonb), idempotency_key_input
  )
  on conflict (idempotency_key) do nothing
  returning id into notification_id_value;

  if notification_id_value is null then
    select id into notification_id_value from public.notifications
    where idempotency_key = idempotency_key_input;
  end if;

  insert into public.notification_outbox(notification_id, recipient_id)
  select notification_id_value, recipient_id_input
  where exists (
    select 1 from public.notification_preferences p
    where p.user_id = recipient_id_input
      and p.email_enabled
      and (category_input not in ('TICKET_ASSIGNED', 'TICKET_REASSIGNED') or p.assignment_enabled)
      and (category_input not in ('STATUS_CHANGED', 'PUBLIC_REPLY', 'TICKET_RESOLVED', 'TICKET_REOPENED') or p.status_enabled)
      and (category_input not in ('SLA_APPROACHING', 'SLA_BREACHED', 'ESCALATION') or p.escalation_enabled)
  )
  on conflict (notification_id) do nothing;
  return notification_id_value;
end;
$$;

create or replace function public.notify_ticket_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare ticket_row public.tickets;
declare recipient uuid;
declare category_value text;
declare title_value text;
declare body_value text;
begin
  select * into ticket_row from public.tickets where id = new.ticket_id;
  category_value := case new.event_type
    when 'ROUTED' then 'TICKET_CREATED'
    when 'ASSIGNMENT' then 'TICKET_ASSIGNED'
    when 'STATUS_CHANGE' then case when new.new_value->>'status' in ('RESOLVED', 'CLOSED') then 'TICKET_RESOLVED' else 'STATUS_CHANGED' end
    when 'DEPARTMENT_CHANGE' then 'DEPARTMENT_TRANSFERRED'
    when 'SLA_APPROACHING' then 'SLA_APPROACHING'
    when 'SLA_BREACHED' then 'SLA_BREACHED'
    when 'OPERATIONS_REVIEW_REQUIRED' then 'ESCALATION'
    when 'SEVERELY_OVERDUE' then 'ESCALATION'
    when 'CRITICAL_OVERDUE' then 'ESCALATION'
    else null
  end;
  if category_value is null then return new; end if;
  title_value := replace(initcap(lower(category_value)), '_', ' ');
  body_value := coalesce(new.description, 'Ticket activity requires your attention.');

  if category_value in ('TICKET_CREATED', 'STATUS_CHANGED', 'TICKET_RESOLVED', 'SLA_APPROACHING', 'PUBLIC_REPLY') then
    perform public.enqueue_notification(
      ticket_row.customer_id, ticket_row.id, category_value, title_value,
      'Ticket ' || ticket_row.ticket_number || ': ' || body_value,
      jsonb_build_object('ticket_number', ticket_row.ticket_number),
      new.id::text || ':customer'
    );
  end if;

  if category_value in ('SLA_APPROACHING', 'SLA_BREACHED', 'ESCALATION', 'DEPARTMENT_TRANSFERRED') then
    for recipient in select id from public.profiles
      where role in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
        and (category_value <> 'DEPARTMENT_TRANSFERRED' or department = ticket_row.department or role = 'SYSTEM_ADMIN')
    loop
      perform public.enqueue_notification(
        recipient, ticket_row.id, category_value, title_value,
        'Ticket ' || ticket_row.ticket_number || ': ' || body_value,
        jsonb_build_object('ticket_number', ticket_row.ticket_number, 'department', ticket_row.department),
        new.id::text || ':' || recipient::text
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_ticket_event_after_insert on public.ticket_events;
create trigger notify_ticket_event_after_insert
after insert on public.ticket_events for each row execute function public.notify_ticket_event();

create or replace function public.notify_assignment()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ticket_row public.tickets;
declare category_value text;
begin
  if new.assigned_user_id is null then return new; end if;
  select * into ticket_row from public.tickets where id = new.ticket_id;
  category_value := case when exists (
    select 1 from public.ticket_assignments where ticket_id = new.ticket_id and id <> new.id
  ) then 'TICKET_REASSIGNED' else 'TICKET_ASSIGNED' end;
  perform public.enqueue_notification(
    new.assigned_user_id, new.ticket_id, category_value,
    replace(initcap(lower(category_value)), '_', ' '),
    'Ticket ' || ticket_row.ticket_number || ' is assigned to you.',
    jsonb_build_object('ticket_number', ticket_row.ticket_number, 'department', new.department),
    new.id::text || ':assignee'
  );
  return new;
end;
$$;

drop trigger if exists notify_assignment_after_insert on public.ticket_assignments;
create trigger notify_assignment_after_insert
after insert on public.ticket_assignments for each row execute function public.notify_assignment();

create or replace function public.notify_public_message()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare ticket_row public.tickets;
begin
  if new.visibility <> 'PUBLIC' then return new; end if;
  select * into ticket_row from public.tickets where id = new.ticket_id;
  perform public.enqueue_notification(
    ticket_row.customer_id, ticket_row.id, 'PUBLIC_REPLY', 'Public reply',
    'New public update on ticket ' || ticket_row.ticket_number || '.',
    jsonb_build_object('ticket_number', ticket_row.ticket_number),
    new.id::text || ':public-reply'
  );
  return new;
end;
$$;

drop trigger if exists notify_public_message_after_insert on public.ticket_messages;
create trigger notify_public_message_after_insert
after insert on public.ticket_messages for each row execute function public.notify_public_message();

create or replace function public.record_sla_approaching_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.escalation_state = 'APPROACHING' and old.escalation_state is distinct from 'APPROACHING' then
    insert into public.ticket_events(ticket_id, actor_id, event_type, previous_value, new_value, description)
    values (
      new.id, null, 'SLA_APPROACHING',
      jsonb_build_object('state', old.escalation_state),
      jsonb_build_object('state', new.escalation_state, 'percent', new.sla_consumed_percent),
      'Ticket reached the configured SLA approaching threshold.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_sla_approaching_event_after_update on public.tickets;
create trigger record_sla_approaching_event_after_update
after update of escalation_state on public.tickets
for each row execute function public.record_sla_approaching_event();

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempts enable row level security;

create policy notification_preferences_self on public.notification_preferences
for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_self_read on public.notifications
for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_self_mark_read on public.notifications
for update to authenticated using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

revoke all on public.notification_outbox from authenticated, anon;
revoke all on public.notification_delivery_attempts from authenticated, anon;
revoke all on function public.enqueue_notification(uuid, uuid, text, text, text, jsonb, text) from public;
grant execute on function public.enqueue_notification(uuid, uuid, text, text, text, jsonb, text) to authenticated;

create or replace function public.claim_notification_outbox(batch_size integer default 25)
returns setof public.notification_outbox
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id from public.notification_outbox
    where status in ('PENDING', 'FAILED') and available_at <= now() and attempts < 5
    order by available_at, created_at
    for update skip locked limit greatest(1, least(batch_size, 100))
  )
  update public.notification_outbox o
  set status = 'PROCESSING', locked_at = now(), attempts = o.attempts + 1
  from claimed where o.id = claimed.id
  returning o.*;
end;
$$;

revoke all on function public.claim_notification_outbox(integer) from public;
grant execute on function public.claim_notification_outbox(integer) to service_role;
