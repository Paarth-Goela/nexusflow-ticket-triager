# Supabase setup and trusted role provisioning

## Initialize and link the Supabase project

From the repository root:

```bash
cd nexusflow/apps/web
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

If `supabase/config.toml` already exists, skip `npx supabase init`. The init command creates local CLI configuration; it does not replace the existing SQL migrations.

The System Admin Console adds three migrations after the existing security hardening migrations:

- `20261114010000_add_system_admin_role.sql`
- `20261114020000_system_admin_access.sql`
- `20261114030000_designated_system_admin.sql`

Review the SQL files before applying them. They extend the existing role enum and RLS policies and designate the single Central Admin account; they retain existing ticket/profile rows and adjust any other `SYSTEM_ADMIN` profile to the existing `OPERATIONS_ADMIN` role. The project currently used for NexusFlow has previously been identified as production, so use a separate development Supabase project for experimentation whenever possible.

Verify migration history after applying:

```bash
npx supabase migration list --remote
```

Run database security tests against a disposable/local Supabase database:

```bash
npx supabase start
npx supabase test db
```

Do not run fixture-based security tests against production data.

## Customer, employee and Central Admin roles

New signups are provisioned as `CUSTOMER` by the database trigger. Signup metadata is used only for the display name; it never determines authorization.

Employee roles must be provisioned by a trusted administrator through the Supabase SQL Editor or a server-side administrative process. Never expose the service-role key in browser code or a `NEXT_PUBLIC_*` variable.

### Provision a Factory agent

Replace the email with an existing, verified account:

```sql
update public.profiles
set role = 'FACTORY_AGENT',
    department = 'FACTORY'
where email = 'factory-agent@example.com';
```

### Provision an Operations administrator

```sql
update public.profiles
set role = 'OPERATIONS_ADMIN',
    department = 'OPERATIONS'
where email = 'operations-admin@example.com';
```

### Central Admin account

The only account eligible for `SYSTEM_ADMIN` is `f20230006@hyderabad.bits-pilani.ac.in`. The `20261114030000_designated_system_admin.sql` migration assigns that role to its already-verified profile when the account exists. Public signup always creates a `CUSTOMER`; it never grants `SYSTEM_ADMIN`, even for this address. The database enforces that no other profile can hold `SYSTEM_ADMIN`.

After applying the migration and verifying the account, confirm provisioning with:

```sql
select email, role, department
from public.profiles
where lower(email) = 'f20230006@hyderabad.bits-pilani.ac.in';
```

The profile must show `SYSTEM_ADMIN` and `OPERATIONS`. If the account is created after the migration, first finish registration and email verification, then run this statement as a trusted database administrator:

```sql
update public.profiles p
set role = 'SYSTEM_ADMIN',
    department = 'OPERATIONS'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'f20230006@hyderabad.bits-pilani.ac.in'
  and u.email_confirmed_at is not null;
```

Never run that statement from the browser or with credentials exposed to the frontend. Do not promote another account as a temporary substitute.

The Central Admin workspace is `/admin`. Authentication and role are read from the database profile on the server, while RLS controls all Supabase data access.

Valid role/department combinations:

- `CUSTOMER`: department must be NULL
- `FACTORY_AGENT`: department must be `FACTORY`
- `LOGISTICS_AGENT`: department must be `LOGISTICS`
- `OPERATIONS_ADMIN`: department must be `OPERATIONS`
- `SYSTEM_ADMIN`: department must be `OPERATIONS` and profile email must match the single designated account

The System Admin role has platform-wide read access to profiles, tickets, messages, events and assignment history. It can administer ticket records across departments. Operations Admin retains its existing operational ticket coordination permissions and does not receive the `/admin` workspace. Role changes remain restricted to trusted database provisioning; profile editing and signup cannot assign administrator access.

## Environment

Copy `.env.example` to `.env.local` in `apps/web` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key is designed for browser use; authorization is enforced by verified sessions and PostgreSQL RLS. Never add database passwords or service-role/secret keys to the frontend environment.
