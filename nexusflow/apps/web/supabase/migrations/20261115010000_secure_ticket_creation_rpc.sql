-- Route and persist customer-created tickets inside one trusted transaction.

create or replace function public.create_customer_ticket(
  subject_input text,
  description_input text,
  customer_company_input text,
  category_input text,
  order_id_input text default null,
  shipment_id_input text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role public.user_role := public.current_user_role();
  created_ticket public.tickets;
begin
  if actor_id is null or actor_role <> 'CUSTOMER' then
    raise exception 'Only authenticated customers can create tickets';
  end if;

  if nullif(trim(subject_input), '') is null
    or nullif(trim(description_input), '') is null
    or nullif(trim(customer_company_input), '') is null
    or nullif(trim(category_input), '') is null then
    raise exception 'Subject, description, company and category are required';
  end if;

  insert into public.tickets (
    customer_id,
    customer_email,
    customer_company,
    order_id,
    shipment_id,
    subject,
    description,
    category
  )
  select
    actor_id,
    p.email,
    trim(customer_company_input),
    nullif(trim(order_id_input), ''),
    nullif(trim(shipment_id_input), ''),
    trim(subject_input),
    trim(description_input),
    trim(category_input)
  from public.profiles p
  where p.id = actor_id
  returning * into created_ticket;

  if not found then
    raise exception 'Customer profile is not available';
  end if;

  return created_ticket;
end;
$$;

revoke all on function public.create_customer_ticket(text, text, text, text, text, text) from public;
grant execute on function public.create_customer_ticket(text, text, text, text, text, text) to authenticated;

drop policy if exists tickets_insert_customer_owned on public.tickets;
