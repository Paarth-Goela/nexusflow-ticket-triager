-- Run with: supabase test db
-- Fixtures are created inside this transaction and rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'customer-a@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Customer A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'customer-b@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Customer B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'factory@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Factory Agent"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'logistics@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Logistics Agent"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005',
   'authenticated', 'authenticated', 'ops@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Operations Admin"}', now(), now());

update public.profiles
set role = 'FACTORY_AGENT', department = 'FACTORY'
where id = '10000000-0000-0000-0000-000000000003';

update public.profiles
set role = 'LOGISTICS_AGENT', department = 'LOGISTICS'
where id = '10000000-0000-0000-0000-000000000004';

update public.profiles
set role = 'OPERATIONS_ADMIN', department = 'OPERATIONS'
where id = '10000000-0000-0000-0000-000000000005';

insert into public.tickets (
  ticket_number, customer_id, subject, description, customer_email, category, department
) values
  ('TEST-CUSTOMER-A', '10000000-0000-0000-0000-000000000001',
   'Customer A ticket', 'Test ticket A', 'customer-a@nexusflow.test', 'Other', 'FACTORY'),
  ('TEST-CUSTOMER-B', '10000000-0000-0000-0000-000000000002',
   'Customer B ticket', 'Test ticket B', 'customer-b@nexusflow.test', 'Other', 'LOGISTICS');

insert into public.ticket_messages (ticket_id, author_id, message, visibility)
select id, '10000000-0000-0000-0000-000000000003', 'Internal investigation note', 'INTERNAL'
from public.tickets where ticket_number = 'TEST-CUSTOMER-A';

insert into public.ticket_messages (ticket_id, author_id, message, visibility)
select id, '10000000-0000-0000-0000-000000000003', 'Public progress update', 'PUBLIC'
from public.tickets where ticket_number = 'TEST-CUSTOMER-A';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select extensions.is(
  (select count(*)::integer from public.tickets where ticket_number = 'TEST-CUSTOMER-B'),
  0,
  'Customer A cannot read Customer B tickets'
);
select extensions.is(
  (select count(*)::integer from public.ticket_messages where visibility = 'INTERNAL'),
  0,
  'Customer A cannot read internal messages'
);
select extensions.is(
  (select count(*)::integer from public.ticket_messages where visibility = 'PUBLIC'),
  1,
  'Customer A can read public messages on their own ticket'
);
select extensions.throws_ok(
  $$update public.profiles set role = 'OPERATIONS_ADMIN' where id = '10000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Profile roles and departments are provisioned by trusted administration',
  'A customer cannot promote their own role'
);
select extensions.throws_ok(
  $$update public.profiles set department = 'FACTORY' where id = '10000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Profile roles and departments are provisioned by trusted administration',
  'A customer cannot assign themselves to a department'
);

insert into public.tickets (
  customer_id, customer_email, customer_company, subject, description,
  category, department, priority, priority_score, status, assigned_to, ai_summary
) values (
  '10000000-0000-0000-0000-000000000001', 'spoofed@example.test', 'Customer A',
  'Malicious field override attempt', 'Customer-supplied test record', 'Other',
  'FACTORY', 'CRITICAL', 100, 'CLOSED',
  '10000000-0000-0000-0000-000000000004', 'Untrusted summary'
);

select extensions.is(
  (select department::text || ':' || priority::text || ':' || status::text || ':' ||
    coalesce(assigned_to::text, 'NULL') || ':' || customer_email
   from public.tickets where subject = 'Malicious field override attempt'),
  'OPERATIONS:MEDIUM:NEW:NULL:customer-a@nexusflow.test',
  'Customer inserts cannot override routing, priority, status, assignee, or account email'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.tickets where department = 'LOGISTICS'),
  0,
  'Factory agents cannot read logistics tickets'
);
select extensions.throws_ok(
  $$update public.tickets set assigned_to = '10000000-0000-0000-0000-000000000004' where ticket_number = 'TEST-CUSTOMER-A'$$,
  'P0001',
  'Ticket assignee must be an employee in the ticket department',
  'Factory agents cannot assign tickets to logistics agents'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.tickets where department = 'FACTORY'),
  0,
  'Logistics agents cannot read factory tickets'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::integer from public.tickets where ticket_number in ('TEST-CUSTOMER-A', 'TEST-CUSTOMER-B')),
  2,
  'Operations administrators can read tickets across departments'
);

select * from extensions.finish();
rollback;
