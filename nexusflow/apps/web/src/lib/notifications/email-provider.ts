type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendTransactionalEmail(message: EmailMessage) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NEXUSFLOW_EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Email provider is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
  return (await response.json()) as { id?: string };
}
