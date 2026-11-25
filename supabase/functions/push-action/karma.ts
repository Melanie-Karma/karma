// Gemeinsame Helfer für die Push-Funktionen
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      return parsed.default ?? Object.values(parsed)[0];
    } catch {
      /* weiter unten Fehler */
    }
  }
  throw new Error("Kein Service-Schlüssel verfügbar");
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type PushConfig = {
  vapid_public: string;
  vapid_private: string;
  vapid_subject: string;
  action_secret: string;
  trigger_secret: string;
};

let cached: PushConfig | null = null;
export async function pushConfig(db: SupabaseClient): Promise<PushConfig> {
  if (cached) return cached;
  const { data, error } = await db.rpc("push_config");
  if (error || !data) throw new Error("push_config: " + (error?.message ?? "leer"));
  cached = data as PushConfig;
  return cached;
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
