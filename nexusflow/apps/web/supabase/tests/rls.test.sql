-- Run with: supabase test db
-- Fixtures are created inside this transaction and rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

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
  ('00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'factory@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Factory Agent"}', now(), now()),
  ('00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004',
   'authenticated', 'authenticated', 'logistics@nexusflow.test', 'test-password',
   now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Logistics Agent"}', now(), now());

update public.profiles
set role = 'FACTORY_AGENT', department = 'FACTORY'
where id = '10000000-0000-0000-0000-000000000003';

update public.profiles
set role = 'LOGISTICS_AGENT', department = 'LOGISTICS'
where id = '10000000-0000-0000-0000-000000000004';

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

select is(
  (select count(*)::integer from public.tickets where ticket_number = 'TEST-CUSTOMER-B'),
  0,
  'Customer A cannot read Customer B tickets'
);
select is(
  (select count(*)::integer from public.ticket_messages where visibility = 'INTERNAL'),
  0,
  'Customer A cannot read internal messages'
);
select is(
  (select count(*)::integer from public.ticket_messages where visibility = 'PUBLIC'),
  1,
  'Customer A can read public messages on their own ticket'
);
select throws_ok(
  $$update public.profiles set role = 'OPERATIONS_ADMIN' where id = '10000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Profile roles and departments are provisioned by trusted administration',
  'A customer cannot promote their own role'
);
select throws_ok(
  $$update public.profiles set department = 'FACTORY' where id = '10000000-0000-0000-0000-000000000001'$$,
  'P0001',
  'Profile roles and departments are provisioned by trusted administration',
  'A customer cannot assign themselves to a department'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.tickets where department = 'LOGISTICS'),
  0,
  'Factory agents cannot read logistics tickets'
);
select throws_ok(
  $$update public.tickets set assigned_to = '10000000-0000-0000-0000-000000000004' where ticket_number = 'TEST-CUSTOMER-A'$$,
  'P0001',
  'Tickets can only be assigned to an agent in the same department',
  'Factory agents cannot assign tickets to logistics agents'
);

select * from finish();
rollback;
