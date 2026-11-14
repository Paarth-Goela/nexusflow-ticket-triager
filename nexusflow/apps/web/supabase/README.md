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

The System Admin Console adds two migrations after the existing security hardening migrations:

- `20261114010000_add_system_admin_role.sql`
- `20261114020000_system_admin_access.sql`

Review both SQL files before applying them. They extend the existing role enum and RLS policies; they do not delete ticket or profile data. The project currently used for NexusFlow has previously been identified as production, so use a separate development Supabase project for experimentation whenever possible.

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

## Customer, employee and system administrator roles

New signups are provisioned as `CUSTOMER` by the database trigger. Signup metadata is used only for the display name; it never determines authorization.

Employee and system administrator roles must be provisioned by a trusted administrator through the Supabase SQL Editor or a server-side administrative process. Never expose the service-role key in browser code or a `NEXT_PUBLIC_*` variable.

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

### Provision the first System Admin

Create and verify the account through the normal signup flow first. Then run this statement manually in the Supabase SQL Editor, replacing the email:

```sql
update public.profiles
set role = 'SYSTEM_ADMIN',
    department = 'OPERATIONS'
where email = 'your-admin-email@example.com';
```

Confirm the result:

```sql
select email, role, department
from public.profiles
where role = 'SYSTEM_ADMIN';
```

Do not add a public signup option for `SYSTEM_ADMIN`. Do not allow an authenticated user to promote themselves. The role is protected by the profile trigger and RLS.

Valid role/department combinations:

- `CUSTOMER`: department must be NULL
- `FACTORY_AGENT`: department must be `FACTORY`
- `LOGISTICS_AGENT`: department must be `LOGISTICS`
- `OPERATIONS_ADMIN`: department must be `OPERATIONS`
- `SYSTEM_ADMIN`: department must be `OPERATIONS` (administrative profile classification only)

The System Admin role has platform-wide read access to profiles, tickets, messages, events and assignment history. It can administer ticket records across departments. Operations Admin retains operational ticket coordination but does not receive the System Admin portal or user-directory administration.

## Environment

Copy `.env.example` to `.env.local` in `apps/web` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key is designed for browser use; authorization is enforced by verified sessions and PostgreSQL RLS. Never add database passwords or service-role/secret keys to the frontend environment.
