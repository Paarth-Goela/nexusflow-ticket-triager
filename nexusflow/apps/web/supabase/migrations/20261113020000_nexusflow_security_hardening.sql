-- Milestone 3 hardening: preserve the existing schema and tighten authorization.
alter table public.tickets
  add column if not exists proof_of_delivery_reference text;

alter table public.tickets
  alter column ticket_number set default (
    'NFX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

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
  ) then
    raise exception 'Profile roles and departments are provisioned by trusted administration';
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
begin
  if tg_op = 'INSERT' then
    if role_value = 'CUSTOMER' then
      new.customer_id := (select auth.uid());
      select p.email into new.customer_email
      from public.profiles p
      where p.id = (select auth.uid());
      new.department := 'OPERATIONS';
      new.priority := 'MEDIUM';
      new.priority_score := 50;
      new.status := 'NEW';
      new.assigned_to := null;
      new.ai_summary := 'Awaiting operational review.';
    elsif role_value is not null and role_value <> 'OPERATIONS_ADMIN' then
      raise exception 'Only customers or trusted operations provisioning may create tickets';
    end if;
    return new;
  end if;

  -- Ticket identity and customer-supplied fields are immutable after creation.
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
      and p.role <> 'CUSTOMER'
  ) then
    raise exception 'Ticket assignee must be an employee in the ticket department';
  end if;

  if role_value in ('FACTORY_AGENT', 'LOGISTICS_AGENT') then
    if new.department is distinct from old.department
      or new.ai_summary is distinct from old.ai_summary
      or new.subject is distinct from old.subject
      or new.description is distinct from old.description
      or new.category is distinct from old.category then
      raise exception 'Only operations administrators may change department or AI assessment';
    end if;

    if new.priority is distinct from old.priority
      or new.priority_score is distinct from old.priority_score then
      if not (
        new.priority = 'CRITICAL'
        and new.priority_score >= old.priority_score
      ) then
        raise exception 'Department agents may only escalate a ticket to critical priority';
      end if;
    end if;

    if new.assigned_to is distinct from old.assigned_to
      and new.assigned_to is not null
      and not exists (
        select 1
        from public.profiles p
        where p.id = new.assigned_to
          and p.department = old.department
          and (
            (old.department = 'FACTORY' and p.role = 'FACTORY_AGENT')
            or (old.department = 'LOGISTICS' and p.role = 'LOGISTICS_AGENT')
          )
      ) then
      raise exception 'Tickets can only be assigned to an agent in the same department';
    end if;
  elsif role_value = 'CUSTOMER' then
    raise exception 'Customers cannot update tickets after submission';
  end if;

  return new;
end;
$$;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_admin_or_department
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or (
    department is not null
    and department = (select public.current_user_department())
    and (select public.current_user_role()) in ('FACTORY_AGENT', 'LOGISTICS_AGENT')
  )
);

drop policy if exists profiles_update_self_nonrole on public.profiles;
create policy profiles_update_self_only
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists tickets_update_department_or_admin on public.tickets;
create policy tickets_update_department_or_admin
on public.tickets for update to authenticated
using (
  (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or (
    (select public.current_user_role()) = 'FACTORY_AGENT'
    and department = 'FACTORY'
  )
  or (
    (select public.current_user_role()) = 'LOGISTICS_AGENT'
    and department = 'LOGISTICS'
  )
)
with check (
  (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or (
    (select public.current_user_role()) = 'FACTORY_AGENT'
    and department = 'FACTORY'
  )
  or (
    (select public.current_user_role()) = 'LOGISTICS_AGENT'
    and department = 'LOGISTICS'
  )
);

drop policy if exists messages_select_public_owner_or_internal_team on public.ticket_messages;
create policy messages_select_public_owner_or_internal_team
on public.ticket_messages for select to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and (
        (t.customer_id = (select auth.uid()) and visibility = 'PUBLIC')
        or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
        or (
          (select public.current_user_role()) = 'FACTORY_AGENT'
          and t.department = 'FACTORY'
        )
        or (
          (select public.current_user_role()) = 'LOGISTICS_AGENT'
          and t.department = 'LOGISTICS'
        )
      )
  )
);

drop policy if exists messages_insert_permitted_ticket on public.ticket_messages;
create policy messages_insert_permitted_ticket
on public.ticket_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and (
        (
          (select public.current_user_role()) = 'CUSTOMER'
          and t.customer_id = (select auth.uid())
          and visibility = 'PUBLIC'
        )
        or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
        or (
          (select public.current_user_role()) = 'FACTORY_AGENT'
          and t.department = 'FACTORY'
        )
        or (
          (select public.current_user_role()) = 'LOGISTICS_AGENT'
          and t.department = 'LOGISTICS'
        )
      )
  )
);

drop policy if exists events_select_public_owner_or_team on public.ticket_events;
create policy events_select_public_owner_or_team
on public.ticket_events for select to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and (
        (
          t.customer_id = (select auth.uid())
          and event_type in ('CREATED', 'STATUS_CHANGE', 'CUSTOMER_MESSAGE')
        )
        or (select public.current_user_role()) = 'OPERATIONS_ADMIN'
        or (
          (select public.current_user_role()) = 'FACTORY_AGENT'
          and t.department = 'FACTORY'
        )
        or (
          (select public.current_user_role()) = 'LOGISTICS_AGENT'
          and t.department = 'LOGISTICS'
        )
      )
  )
);

drop policy if exists assignments_select_team_or_admin on public.ticket_assignments;
create policy assignments_select_team_or_admin
on public.ticket_assignments for select to authenticated
using (
  (select public.current_user_role()) = 'OPERATIONS_ADMIN'
  or department = (select public.current_user_department())
);

drop policy if exists assignments_insert_admin on public.ticket_assignments;
create policy assignments_insert_department_or_admin
on public.ticket_assignments for insert to authenticated
with check (
  assigned_by = (select auth.uid())
  and exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and t.department = department
      and (
        (select public.current_user_role()) = 'OPERATIONS_ADMIN'
        or (
          department = (select public.current_user_department())
          and (select public.current_user_role()) in ('FACTORY_AGENT', 'LOGISTICS_AGENT')
        )
      )
  )
  and (
    assigned_user_id is null
    or exists (
      select 1
      from public.profiles p
      where p.id = assigned_user_id
        and p.department = department
        and p.role <> 'CUSTOMER'
    )
  )
);

-- Helper functions are callable by authenticated clients only; trigger functions
-- remain trigger-only and cannot be invoked as ordinary RPC endpoints.
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.current_user_department() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_department() to authenticated;

revoke all on function public.provision_profile() from public, anon, authenticated;
revoke all on function public.prevent_self_role_change() from public, anon, authenticated;
revoke all on function public.protect_ticket_fields() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
