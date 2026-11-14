-- Grant SYSTEM_ADMIN platform-wide read and operational access.
-- Operations administrators retain their existing cross-department ticket
-- coordination permissions; system administration is a separate role.

alter table public.profiles
  drop constraint if exists employee_department_check;

alter table public.profiles
  add constraint employee_department_check check (
    (role = 'CUSTOMER' and department is null)
    or (role <> 'CUSTOMER' and department is not null)
  );

drop policy if exists profiles_select_self_admin_or_department on public.profiles;
create policy profiles_select_self_admin_or_department
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
  or (
    department is not null
    and department = (select public.current_user_department())
    and (select public.current_user_role()) in ('FACTORY_AGENT', 'LOGISTICS_AGENT')
  )
);

drop policy if exists tickets_select_owner_department_or_admin on public.tickets;
create policy tickets_select_owner_department_or_admin
on public.tickets for select to authenticated
using (
  customer_id = (select auth.uid())
  or (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
);

drop policy if exists tickets_update_department_or_admin on public.tickets;
create policy tickets_update_department_or_admin
on public.tickets for update to authenticated
using (
  (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
)
with check (
  (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
  or ((select public.current_user_role()) = 'FACTORY_AGENT' and department = 'FACTORY')
  or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and department = 'LOGISTICS')
);

drop policy if exists tickets_delete_admin on public.tickets;
create policy tickets_delete_admin
on public.tickets for delete to authenticated
using ((select public.current_user_role()) = 'SYSTEM_ADMIN');

drop policy if exists messages_select_public_owner_or_internal_team on public.ticket_messages;
create policy messages_select_public_owner_or_internal_team
on public.ticket_messages for select to authenticated
using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (
        (t.customer_id = (select auth.uid()) and visibility = 'PUBLIC')
        or (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
        or ((select public.current_user_role()) = 'FACTORY_AGENT' and t.department = 'FACTORY')
        or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and t.department = 'LOGISTICS')
      )
  )
);

drop policy if exists messages_insert_permitted_ticket on public.ticket_messages;
create policy messages_insert_permitted_ticket
on public.ticket_messages for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (
        (
          (select public.current_user_role()) = 'CUSTOMER'
          and t.customer_id = (select auth.uid())
          and visibility = 'PUBLIC'
        )
        or (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
        or ((select public.current_user_role()) = 'FACTORY_AGENT' and t.department = 'FACTORY')
        or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and t.department = 'LOGISTICS')
      )
  )
);

drop policy if exists events_select_public_owner_or_team on public.ticket_events;
create policy events_select_public_owner_or_team
on public.ticket_events for select to authenticated
using (
  exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and (
        (
          t.customer_id = (select auth.uid())
          and event_type in ('CREATED', 'STATUS_CHANGE', 'CUSTOMER_MESSAGE')
        )
        or (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
        or ((select public.current_user_role()) = 'FACTORY_AGENT' and t.department = 'FACTORY')
        or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and t.department = 'LOGISTICS')
      )
  )
);

drop policy if exists events_insert_team_or_admin on public.ticket_events;
create policy events_insert_team_or_admin
on public.ticket_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
    or ((select public.current_user_role()) = 'FACTORY_AGENT' and exists (
      select 1 from public.tickets t where t.id = ticket_id and t.department = 'FACTORY'
    ))
    or ((select public.current_user_role()) = 'LOGISTICS_AGENT' and exists (
      select 1 from public.tickets t where t.id = ticket_id and t.department = 'LOGISTICS'
    ))
  )
);

drop policy if exists assignments_select_team_or_admin on public.ticket_assignments;
create policy assignments_select_team_or_admin
on public.ticket_assignments for select to authenticated
using (
  (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
  or department = (select public.current_user_department())
);

drop policy if exists assignments_insert_department_or_admin on public.ticket_assignments;
create policy assignments_insert_department_or_admin
on public.ticket_assignments for insert to authenticated
with check (
  assigned_by = (select auth.uid())
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_id
      and t.department = ticket_assignments.department
      and (
        (select public.current_user_role()) in ('OPERATIONS_ADMIN', 'SYSTEM_ADMIN')
        or (
          ticket_assignments.department = (select public.current_user_department())
          and (select public.current_user_role()) in ('FACTORY_AGENT', 'LOGISTICS_AGENT')
        )
      )
  )
  and (
    assigned_user_id is null
    or exists (
      select 1 from public.profiles p
      where p.id = assigned_user_id
        and p.department = ticket_assignments.department
        and p.role not in ('CUSTOMER', 'SYSTEM_ADMIN')
    )
  )
);
