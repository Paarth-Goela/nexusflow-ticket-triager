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

Run the database security tests against a disposable/local Supabase database:

```bash
npx supabase start
npx supabase test db
```

The test file creates temporary fixture users and rolls back its transaction. Do not run it against production data.

## Customer and employee roles

New signups are provisioned as `CUSTOMER` by the database trigger. Signup metadata is used only for the display name; it never determines authorization.

Employee roles must be provisioned by a trusted administrator through the Supabase SQL Editor or a server-side administrative process. Never expose the service-role key in browser code or a `NEXT_PUBLIC_*` variable.

Example SQL (replace the UUID with an existing employee's `auth.users.id`):

```sql
update public.profiles
set role = 'FACTORY_AGENT',
    department = 'FACTORY'
where id = '00000000-0000-0000-0000-000000000000';
```

Valid role/department combinations:

- `CUSTOMER`: department must be NULL
- `FACTORY_AGENT`: department must be `FACTORY`
- `LOGISTICS_AGENT`: department must be `LOGISTICS`
- `OPERATIONS_ADMIN`: department must be `OPERATIONS`

Trusted provisioning is required because authenticated users cannot change their own role, department, or email through the public API.

## Environment

Copy `.env.example` to `.env.local` in `apps/web` and set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The publishable key is designed for browser use; authorization is enforced by verified sessions and PostgreSQL RLS. Never add database passwords or service-role/secret keys to the frontend environment.
