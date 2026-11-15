alter table public.tickets
  add column if not exists overdue_seconds bigint not null default 0;

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
  overdue_duration bigint;
begin
  if (select public.current_user_role()) not in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
     and (select auth.uid()) is not null then
    raise exception 'Only authorized operations users can evaluate ticket urgency';
  end if;
  select * into policy_row from public.sla_policies where id;
  for ticket_row in select * from public.tickets where status not in ('RESOLVED', 'CLOSED') loop
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
      else 'NONE' end;
    next_urgency := case
      when ticket_row.priority = 'CRITICAL' or consumed >= policy_row.severe_overdue_percent then 'CRITICAL'
      when ticket_row.priority = 'HIGH' and consumed >= policy_row.approaching_percent then 'URGENT'
      when consumed >= policy_row.operations_review_percent then 'URGENT'
      when consumed >= policy_row.breached_percent then 'HIGH'
      when ticket_row.priority = 'MEDIUM' and consumed >= policy_row.approaching_percent then 'HIGH'
      when ticket_row.priority = 'LOW' and consumed >= policy_row.approaching_percent then 'NORMAL'
      when ticket_row.priority = 'LOW' then 'LOW'
      else 'NORMAL' end;
    overdue_at := case when consumed >= policy_row.breached_percent
      then coalesce(ticket_row.overdue_since, ticket_row.sla_deadline) end;
    overdue_duration := case when overdue_at is not null
      then greatest(0, extract(epoch from (effective_now - overdue_at))::bigint) else 0 end;
    previous_state := ticket_row.escalation_state;
    update public.tickets
    set urgency = next_urgency, sla_consumed_percent = round(consumed, 2),
        overdue_since = overdue_at, overdue_seconds = overdue_duration,
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
