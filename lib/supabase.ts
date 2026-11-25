import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Öffentliche Werte (Projekt-URL und Publishable Key sind für den Browser bestimmt).
// .env.local kann sie überschreiben, ist aber nicht mehr nötig.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://zthhyfjsmlchssadhtbn.supabase.co";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_mjFCcmUAvPAMe0tIPu8IgQ_wKMwm8y1";

let client: SupabaseClient | null = null;

/** Browser-Client (Singleton). Nur in Client-Komponenten aufrufen. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}
