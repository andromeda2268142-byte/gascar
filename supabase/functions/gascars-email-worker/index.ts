import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("GASCARS_EMAIL_FROM") || "Gas Car's <onboarding@resend.dev>";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async () => {
  if (!resendApiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        configured: false,
        message: "RESEND_API_KEY is not configured. Pending Gas Car's emails remain queued.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const { data: rows, error } = await supabase
    .from("gascars_email_outbox")
    .select("id,recipient_email,subject,body_text,message_id,condition,attempts")
    .eq("status", "pending")
    .lte("not_before", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    if (row.condition === "message_unread" && row.message_id) {
      const { data: message } = await supabase
        .from("gascars_lead_messages")
        .select("seen_at")
        .eq("id", row.message_id)
        .maybeSingle();

      if (message?.seen_at) {
        await supabase.from("gascars_email_outbox").update({
          status: "cancelled",
          last_error: "Message was read before reminder email was due",
        }).eq("id", row.id);
        cancelled += 1;
        continue;
      }
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [row.recipient_email],
          subject: row.subject,
          text: row.body_text,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        await supabase.from("gascars_email_outbox").update({
          attempts: (row.attempts ?? 0) + 1,
          last_error: responseText.slice(0, 1000),
          status: (row.attempts ?? 0) >= 4 ? "failed" : "pending",
        }).eq("id", row.id);
        failed += 1;
        continue;
      }

      await supabase.from("gascars_email_outbox").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: (row.attempts ?? 0) + 1,
        last_error: null,
      }).eq("id", row.id);
      sent += 1;
    } catch (error) {
      await supabase.from("gascars_email_outbox").update({
        attempts: (row.attempts ?? 0) + 1,
        last_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
        status: (row.attempts ?? 0) >= 4 ? "failed" : "pending",
      }).eq("id", row.id);
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: (rows ?? []).length, sent, cancelled, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
