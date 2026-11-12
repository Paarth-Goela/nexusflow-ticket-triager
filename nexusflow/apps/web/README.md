# NexusFlow Web

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Apply `supabase/migrations/20261113010000_nexusflow_schema.sql` in the Supabase SQL editor or with the Supabase CLI.
4. Create a customer account through `/signup`.
5. Provision employee profiles through a trusted SQL/admin process; public signup always creates `CUSTOMER`.
6. Use `supabase/rls-tests.sql` as the minimum permission-test checklist.

The browser uses only the publishable key. Never commit `.env.local`, database passwords, or service-role credentials.

Without Supabase variables, the app displays the local development demo. This is explicitly a development fallback, not production persistence.

Run locally with `npm run dev`, then open `http://localhost:3000`.
