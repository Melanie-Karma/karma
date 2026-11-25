// Zusagen oder Ablehnen direkt aus der Push-Nachricht (Service Worker, ohne Anmeldung).
// Abgesichert über ein signiertes Token je Person und Anfrage.
import { adminClient, hmac, pushConfig, safeEqual } from "./karma.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ status: "error" }, 405);

  const { r, u, t, a } = (await req.json().catch(() => ({}))) as {
    r?: string;
    u?: string;
    t?: string;
    a?: string;
  };
  if (!r || !u || !t || (a !== "accept" && a !== "decline")) return json({ status: "error" }, 400);

  const db = adminClient();
  const cfg = await pushConfig(db);
  const expected = await hmac(cfg.action_secret, `${u}:${r}`);
  if (!safeEqual(expected, t)) return json({ status: "forbidden" }, 403);

  const { data, error } = await db.rpc("swipe_for", {
    p_user: u,
    p_request_id: r,
    p_direction: a === "accept" ? "right" : "left",
  });
  if (error) {
    const known = ["request_full", "request_not_open", "not_eligible", "profile_incomplete"];
    const hit = known.find((k) => error.message.includes(k));
    return json({ status: hit ?? "error" }, 200);
  }
  return json({ status: data });
});
