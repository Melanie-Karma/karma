// Wird per Datenbank-Trigger bei jeder neuen Anfrage aufgerufen
// und schickt Push-Nachrichten an passende Personen in der Nähe.
import webpush from "npm:web-push@3.6.7";
import { adminClient, hmac, pushConfig, safeEqual } from "./karma.ts";

const APP_URL = Deno.env.get("KARMA_APP_URL") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const db = adminClient();
  const cfg = await pushConfig(db);
  const secret = req.headers.get("x-karma-secret") ?? "";
  if (!safeEqual(secret, cfg.trigger_secret)) return new Response("Forbidden", { status: 403 });

  const { request_id } = (await req.json().catch(() => ({}))) as { request_id?: string };
  if (!request_id) return new Response("Bad request", { status: 400 });

  const { data: targets, error } = await db.rpc("push_targets", { p_request_id: request_id });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  const actionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/push-action`;

  let sent = 0;
  let removed = 0;
  for (const t of (targets ?? []) as {
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    title: string;
    body: string;
    request_id: string;
  }[]) {
    const token = await hmac(cfg.action_secret, `${t.user_id}:${t.request_id}`);
    const payload = JSON.stringify({
      title: t.title,
      body: t.body,
      r: t.request_id,
      u: t.user_id,
      t: token,
      actionUrl,
      url: `${APP_URL}/app/anfrage/${t.request_id}`,
    });
    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        payload,
        { TTL: 60 * 60 * 6, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.rpc("push_remove_endpoint", { p_endpoint: t.endpoint });
        removed++;
      }
    }
  }
  return new Response(JSON.stringify({ sent, removed }), {
    headers: { "Content-Type": "application/json" },
  });
});
