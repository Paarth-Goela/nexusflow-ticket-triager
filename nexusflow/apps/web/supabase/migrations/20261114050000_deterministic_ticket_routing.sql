-- Deterministic ticket routing and workload-based assignment.

alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.resolve_ticket_department(category text)
returns public.department
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(category))
    when 'production' then 'FACTORY'::public.department
    when 'machine breakdown' then 'FACTORY'::public.department
    when 'quality defect' then 'FACTORY'::public.department
    when 'component shortage' then 'FACTORY'::public.department
    when 'maintenance' then 'FACTORY'::public.department
    when 'shipment delay' then 'LOGISTICS'::public.department
    when 'delivery issue' then 'LOGISTICS'::public.department
    when 'transporter issue' then 'LOGISTICS'::public.department
    when 'dispatch issue' then 'LOGISTICS'::public.department
    when 'general operations' then 'OPERATIONS'::public.department
    when 'other / unclassified' then 'OPERATIONS'::public.department
    else 'OPERATIONS'::public.department
  end;
$$;

create or replace function public.ticket_routing_reason(category text, department public.department)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(trim(category)) in (
      'production', 'machine breakdown', 'quality defect', 'component shortage', 'maintenance',
      'shipment delay', 'delivery issue', 'transporter issue', 'dispatch issue', 'general operations',
      'other / unclassified'
    ) then initcap(trim(category)) || ' routes to ' || department::text || '.'
    else 'Unsupported category "' || category || '" defaults to Operations.'
  end;
$$;

create or replace function public.select_ticket_assignee(target_department public.department)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  left join public.tickets t
    on t.assigned_to = p.id
   and t.status not in ('RESOLVED'::public.ticket_status, 'CLOSED'::public.ticket_status)
  where p.department = target_department
    and p.is_active
    and p.role in (
      'FACTORY_AGENT'::public.user_role,
      'LOGISTICS_AGENT'::public.user_role,
      'OPERATIONS_ADMIN'::public.user_role
    )
  group by p.id
  order by count(t.id), p.id
  limit 1;
$$;

create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    new.role is distinct from old.role
    or new.department is distinct from old.department
    or new.email is distinct from old.email
    or new.is_active is distinct from old.is_active
  ) then
    raise exception 'Profile roles, departments, activity and email are provisioned by trusted administration';
  end if;
  return new;
end;
$$;

create or replace function public.protect_ticket_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  role_value public.user_role := public.current_user_role();
  routed_department public.department;
begin
  if tg_op = 'INSERT' then
    if role_value = 'CUSTOMER' then
      routed_department := public.resolve_ticket_department(new.category);
      new.ticket_number := 'NFX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      new.customer_id := (select auth.uid());
      select p.email into new.customer_email
      from public.profiles p
      where p.id = (select auth.uid());
      new.department := routed_department;
      new.priority := 'MEDIUM';
      new.priority_score := 50;
      new.status := 'NEW';
      new.assigned_to := public.select_ticket_assignee(routed_department);
      new.ai_summary := 'Deterministically routed from the selected category.';
      new.sla_deadline := null;
      new.proof_of_delivery_reference := null;
      new.created_at := now();
      new.updated_at := now();
    elsif role_value is not null and role_value not in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN') then
      raise exception 'Only customers or trusted operations provisioning may create tickets';
    end if;
    return new;
  end if;

  if new.ticket_number is distinct from old.ticket_number
    or new.customer_id is distinct from old.customer_id
    or new.customer_email is distinct from old.customer_email
    or new.customer_company is distinct from old.customer_company
    or new.order_id is distinct from old.order_id
    or new.shipment_id is distinct from old.shipment_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Ticket identity and customer-submitted fields cannot be changed';
  end if;

  if new.assigned_to is not null and not exists (
    select 1
    from public.profiles p
    where p.id = new.assigned_to
      and p.department = new.department
      and p.is_active
      and p.role in (
        'FACTORY_AGENT'::public.user_role,
        'LOGISTICS_AGENT'::public.user_role,
        'OPERATIONS_ADMIN'::public.user_role
      )
  ) then
    raise exception 'Ticket assignee must be an active employee in the ticket department';
  end if;

  if role_value in ('FACTORY_AGENT', 'LOGISTICS_AGENT') then
    if new.department is distinct from old.department
      or new.ai_summary is distinct from old.ai_summary
      or new.subject is distinct from old.subject
      or new.description is distinct from old.description
      or new.category is distinct from old.category then
      raise exception 'Only authorized operations users may change department or AI assessment';
    end if;

    if new.priority is distinct from old.priority
      or new.priority_score is distinct from old.priority_score then
      if not (new.priority = 'CRITICAL' and new.priority_score >= old.priority_score) then
        raise exception 'Department agents may only escalate a ticket to critical priority';
      end if;
    end if;
  elsif role_value = 'CUSTOMER' then
    raise exception 'Customers cannot update tickets after submission';
  end if;

  return new;
end;
$$;

create or replace function public.record_ticket_routing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ticket_events (
    ticket_id, actor_id, event_type, previous_value, new_value, description
  ) values (
    new.id,
    (select auth.uid()),
    'ROUTED',
    jsonb_build_object('category', new.category),
    jsonb_build_object(
      'department', new.department,
      'assigned_to', new.assigned_to
    ),
    public.ticket_routing_reason(new.category, new.department)
      || case
        when new.assigned_to is null then ' No active employee was available; ticket remains in the department queue.'
        else ' Assigned to ' || new.assigned_to::text || ' by lowest open-ticket workload.'
      end
  );

  if new.assigned_to is not null then
    insert into public.ticket_assignments (
      ticket_id, department, assigned_user_id, assigned_by
    ) values (
      new.id, new.department, new.assigned_to, (select auth.uid())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists record_ticket_routing_after_insert on public.tickets;
create trigger record_ticket_routing_after_insert
after insert on public.tickets
for each row execute function public.record_ticket_routing();

create or replace function public.transfer_ticket(
  ticket_number_input text,
  destination_department public.department
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role := public.current_user_role();
  ticket_row public.tickets;
  previous_department public.department;
  next_assignee uuid;
begin
  if actor_role not in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN') then
    raise exception 'Only Operations users or the Central Admin can transfer tickets';
  end if;

  select *
  into ticket_row
  from public.tickets
  where ticket_number = ticket_number_input
  for update;

  if not found then
    raise exception 'Ticket was not found';
  end if;

  previous_department := ticket_row.department;
  next_assignee := public.select_ticket_assignee(destination_department);
  update public.tickets
  set department = destination_department,
      assigned_to = next_assignee,
      status = case
        when next_assignee is null and status = 'ASSIGNED' then 'NEW'::public.ticket_status
        when next_assignee is not null and status = 'NEW' then 'ASSIGNED'::public.ticket_status
        else status
      end
  where id = ticket_row.id
  returning * into ticket_row;

  insert into public.ticket_events (
    ticket_id, actor_id, event_type, previous_value, new_value, description
  ) values (
    ticket_row.id,
    (select auth.uid()),
    'DEPARTMENT_CHANGE',
    jsonb_build_object('department', previous_department),
    jsonb_build_object('department', destination_department, 'assigned_to', next_assignee),
    'Ticket transferred to ' || destination_department::text || '.'
  );

  insert into public.ticket_assignments (
    ticket_id, department, assigned_user_id, assigned_by
  ) values (
    ticket_row.id, destination_department, next_assignee, (select auth.uid())
  );

  return ticket_row;
end;
$$;

revoke all on function public.transfer_ticket(text, public.department) from public;
grant execute on function public.transfer_ticket(text, public.department) to authenticated;
