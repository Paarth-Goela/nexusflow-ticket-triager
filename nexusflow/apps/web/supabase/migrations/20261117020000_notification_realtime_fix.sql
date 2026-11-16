-- Ensure notification changes reach subscribed portal clients.

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['notifications', 'notification_preferences']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;

create or replace function public.notify_ticket_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ticket_row public.tickets;
  recipient uuid;
  category_value text;
  title_value text;
  body_value text;
begin
  select * into ticket_row from public.tickets where id = new.ticket_id;
  category_value := case new.event_type
    when 'ROUTED' then 'TICKET_CREATED'
    when 'ASSIGNMENT' then 'TICKET_ASSIGNED'
    when 'STATUS_CHANGE' then case
      when new.previous_value->>'status' in ('RESOLVED', 'CLOSED')
        and new.new_value->>'status' not in ('RESOLVED', 'CLOSED') then 'TICKET_REOPENED'
      when new.new_value->>'status' in ('RESOLVED', 'CLOSED') then 'TICKET_RESOLVED'
      else 'STATUS_CHANGED'
    end
    when 'DEPARTMENT_CHANGE' then 'DEPARTMENT_TRANSFERRED'
    when 'SLA_APPROACHING' then 'SLA_APPROACHING'
    when 'SLA_BREACHED' then 'SLA_BREACHED'
    when 'OPERATIONS_REVIEW_REQUIRED', 'SEVERELY_OVERDUE', 'CRITICAL_OVERDUE' then 'ESCALATION'
    else null
  end;
  if category_value is null then return new; end if;
  title_value := replace(initcap(lower(category_value)), '_', ' ');
  body_value := coalesce(new.description, 'Ticket activity requires your attention.');

  if category_value in ('TICKET_CREATED', 'STATUS_CHANGED', 'TICKET_REOPENED', 'TICKET_RESOLVED', 'SLA_APPROACHING') then
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
