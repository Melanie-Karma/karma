import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser-Client (Singleton). Nur in Client-Komponenten aufrufen. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error(
        "Supabase ist nicht konfiguriert. Lege .env.local nach dem Muster von .env.example an.",
      );
    }
    client = createBrowserClient(url, key);
  }
  return client;
}
