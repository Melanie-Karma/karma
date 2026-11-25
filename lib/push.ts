// Push-Benachrichtigungen im Browser (Web-Push, PWA)
import { getSupabase } from "@/lib/supabase";

/** Öffentlicher VAPID-Schlüssel. Der private liegt nur auf dem Server. */
export const VAPID_PUBLIC_KEY =
  "BCISr6MuPe5UF-z9RmMQGhqmXk4q_bx3L5YcqhZCKXoXl1F3Bj8IaSIOO4aaeI0YpQyFZzfsNCboX9HbzfzbX0c";

export type PushSupport = "ok" | "unsupported" | "ios_needs_homescreen" | "denied";

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos() && !isStandalone()) return "ios_needs_homescreen";
  if (!hasApi) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function base64UrlToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Fragt die Erlaubnis ab und speichert das Abo. Gibt true zurück, wenn es geklappt hat. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  const support = pushSupport();
  if (support !== "ok") return { ok: false, reason: support };
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
  if (!reg) return { ok: false, reason: "unsupported" };
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await getSupabase().rpc("save_push_subscription", {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
  });
  return error ? { ok: false, reason: "server" } : { ok: true };
}

/** Abo auf diesem Gerät beenden */
export async function disablePushOnDevice(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await getSupabase().rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
}

export async function hasDeviceSubscription(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/**
 * Beim Öffnen der App: Gibt es auf diesem Gerät schon ein Push-Abo, speichern wir es erneut.
 * So landet ein Abo auch dann in der Datenbank, wenn das Speichern früher schiefging
 * oder der Browser den Schlüssel erneuert hat.
 */
export async function syncPushSubscription(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    // Wer Nachrichten im Profil abgeschaltet hat, bleibt abgeschaltet
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: me } = await supabase.from("profiles").select("push_enabled").eq("id", auth.user.id).maybeSingle();
    if (!me?.push_enabled) return;
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await supabase.rpc("save_push_subscription", {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
    });
  } catch {
    /* egal, nächster Versuch beim nächsten Öffnen */
  }
}
