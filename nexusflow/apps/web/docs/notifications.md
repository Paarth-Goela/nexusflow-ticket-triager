# Notification worker

The notification migration creates an idempotent database outbox. Ticket events create in-app notifications and email jobs without blocking ticket writes.

Configure these server-only variables:

- `RESEND_API_KEY`
- `NEXUSFLOW_EMAIL_FROM`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NOTIFICATION_WORKER_SECRET`

Invoke the worker every minute from a trusted scheduler:

```sh
curl -X POST "$NEXUSFLOW_URL/api/notifications/worker" \
  -H "Authorization: Bearer $NOTIFICATION_WORKER_SECRET"
```

The worker claims jobs with row locks, retries failures up to five times with bounded backoff, and records delivery attempts. It is not automatically deployed by this repository; configure the scheduler and verify Resend delivery before enabling production email.
