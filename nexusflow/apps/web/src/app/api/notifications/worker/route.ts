import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/notifications/email-provider";

export async function POST(request: Request) {
  if (!process.env.NOTIFICATION_WORKER_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.NOTIFICATION_WORKER_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Worker database credentials are not configured." }, { status: 503 });
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: jobs, error: claimError } = await supabase.rpc("claim_notification_outbox", { batch_size: 25 });
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  let sent = 0;
  for (const job of jobs ?? []) {
    const { data: notification } = await supabase.from("notifications").select("id, recipient_id, title, body, payload").eq("id", job.notification_id).single();
    const { data: recipient } = await supabase.from("profiles").select("email, full_name").eq("id", job.recipient_id).single();
    if (!notification || !recipient?.email) {
      await supabase.from("notification_outbox").update({ status: "FAILED", last_error: "Recipient email is unavailable." }).eq("id", job.id);
      continue;
    }
    try {
      const ticketNumber = String((notification.payload as Record<string, unknown>).ticket_number ?? "");
      const result = await sendTransactionalEmail({
        to: recipient.email,
        subject: `${notification.title} · ${ticketNumber}`,
        text: `${notification.body}\n\nOpen NexusFlow to review this ticket.`,
        html: `<div style="font-family:Arial,sans-serif;color:#172B3A"><h2 style="color:#287D73">NEXUSFLOW</h2><p>${notification.body}</p><p>Ticket reference: <strong>${ticketNumber}</strong></p></div>`,
      });
      await supabase.from("notification_outbox").update({ status: "SENT", sent_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
      await supabase.from("notification_delivery_attempts").insert({ outbox_id: job.id, attempt_number: job.attempts, status: "SENT", provider_message_id: result.id ?? null });
      sent += 1;
    } catch (error) {
      const attempts = Number(job.attempts);
      const permanent = attempts >= 5;
      await supabase.from("notification_outbox").update({
        status: permanent ? "FAILED" : "FAILED",
        available_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** attempts * 60 * 1000)).toISOString(),
        last_error: error instanceof Error ? error.message : "Email delivery failed.",
      }).eq("id", job.id);
      await supabase.from("notification_delivery_attempts").insert({ outbox_id: job.id, attempt_number: attempts, status: "FAILED", error_message: error instanceof Error ? error.message : "Email delivery failed." });
    }
  }
  return NextResponse.json({ claimed: jobs?.length ?? 0, sent });
}
