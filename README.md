# NexusFlow Ticket Triager

NexusFlow is an operational ticket management app for customers, factory teams, logistics teams, operations administrators, and one Central Admin. It provides role-based workspaces for submitting, routing, tracking, and resolving service tickets, with activity history, assignments, and workload views.

The current application lives in [`nexusflow/apps/web`](nexusflow/apps/web). It is built with Next.js, React, TypeScript, Tailwind CSS, and Supabase. When Supabase is not configured, the web app runs with browser-local demo data; that fallback is intended for development only.

## Features

- Customer registration, sign-in, ticket submission, and ticket tracking
- Separate factory, logistics, and operations workspaces
- A platform-wide Central Admin console at `/admin`
- Ticket status, priority, assignment, internal notes, and customer messages
- Supabase Auth, PostgreSQL persistence, realtime updates, and row-level security
- Demo mode for exploring the interface without a Supabase project

## Requirements

- Node.js 20 or newer and npm
- A Supabase project for persistent, multi-user data (optional for demo mode)

## Run locally

From the web app directory:

```bash
cd nexusflow/apps/web
npm ci
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If you leave the Supabase values blank, the app uses local demo data saved in your browser.

Available scripts:

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run build    # Create a production build
npm run start    # Serve the production build
```

## Configure Supabase

1. Create a Supabase project.
2. In `nexusflow/apps/web/.env.local`, set the project API URL and publishable key:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   ```

3. Apply the SQL migrations in `nexusflow/apps/web/supabase/migrations/` in filename order, using the Supabase SQL editor or Supabase CLI.
4. Restart the web app after changing environment values.
5. Register a customer account at `/signup`. Employee profiles must be provisioned by a trusted administrator; public sign-up cannot assign employee roles.

The database setup, employee provisioning example, and security-test guidance are in [`nexusflow/apps/web/supabase/README.md`](nexusflow/apps/web/supabase/README.md). The RLS checklist is in [`nexusflow/apps/web/supabase/rls-tests.sql`](nexusflow/apps/web/supabase/rls-tests.sql).

## Roles and routes

| Role | Workspace |
| --- | --- |
| Customer | `/customer` |
| Factory agent | `/factory` |
| Logistics agent | `/logistics` |
| Operations admin | `/operations` |
| Central Admin (`SYSTEM_ADMIN`) | `/admin` |

The `SYSTEM_ADMIN` role is reserved for the designated verified account `f20230006@hyderabad.bits-pilani.ac.in`. Access is determined from the authenticated user's protected `profiles` row, checked on the server, and enforced by database row-level security. Employee access requires trusted profile provisioning.

## Security notes

- `.env.local` is ignored by Git. Keep credentials there and never commit it.
- Only the Supabase publishable key belongs in `NEXT_PUBLIC_*` variables.
- Never expose a service-role key, database password, or other secret in browser code or frontend environment variables.
- Demo mode stores data in the current browser and does not provide shared or production persistence.

## Repository layout

```text
nexusflow/
└── apps/
    └── web/       Next.js application and Supabase migrations
```
