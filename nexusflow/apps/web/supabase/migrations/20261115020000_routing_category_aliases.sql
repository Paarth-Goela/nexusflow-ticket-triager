-- Preserve the applied routing migration while accepting the canonical
-- Operations categories used by the customer form.

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
    when 'other' then 'OPERATIONS'::public.department
    when 'unclassified' then 'OPERATIONS'::public.department
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
      'other', 'unclassified', 'other / unclassified'
    ) then initcap(trim(category)) || ' routes to ' || department::text || '.'
    else 'Unsupported category "' || category || '" defaults to Operations.'
  end;
$$;
