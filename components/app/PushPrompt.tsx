"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { btn } from "@/components/ui";
import { enablePush, hasDeviceSubscription, pushSupport, type PushSupport } from "@/lib/push";
import { getSupabase } from "@/lib/supabase";

export const LATER_KEY = "karma_push_later";

/** Text, wenn jemand Push ablehnen will */
export const DECLINE_HINT =
  "Das ist völlig in Ordnung. Du verpasst dann aber, wenn jemand in deiner Nähe schnell Hilfe braucht.";

/**
 * Push ist standardmäßig an. Hat dieses Gerät noch kein Push-Abo, fragt ein Pop-up beim Öffnen der App:
 * ein Tipp auf „OK“, dann kommt direkt die Abfrage des Handys. „Später“ fragt beim nächsten Öffnen wieder,
 * „Nein, ich will keine“ schaltet Push im Profil ab (dort wieder einschaltbar).
 */
export default function PushPrompt({ ready }: { ready: boolean }) {
  const { profile, reloadProfile } = useApp();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmNo, setConfirmNo] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser-APIs gibt es erst im Browser
    setSupport(pushSupport());
    void hasDeviceSubscription().then(setSubscribed);
    try {
      setLater(sessionStorage.getItem(LATER_KEY) === "1");
    } catch {
      /* kein Speicher, dann eben nochmal fragen */
    }
  }, []);

  if (!ready || later || !profile.push_enabled || subscribed !== false || !support || support === "unsupported") {
    return null;
  }

  function closeForNow() {
    try {
      sessionStorage.setItem(LATER_KEY, "1");
    } catch {
      /* egal */
    }
    setLater(true);
  }

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    const res = await enablePush();
    setBusy(false);
    if (res.ok) {
      setConfirmNo(false);
      setSubscribed(true);
      await reloadProfile();
      return;
    }
    setConfirmNo(false);
    setSupport(pushSupport());
    setMsg(
      res.reason === "denied"
        ? "Das Handy hat Nachrichten blockiert. Du kannst sie in den Einstellungen des Browsers für Karma erlauben."
        : "Das hat nicht geklappt. Versuch es bitte nochmal.",
    );
  }

  async function decline() {
    setBusy(true);
    await getSupabase().from("profiles").update({ push_enabled: false }).eq("id", profile.id);
    setBusy(false);
    await reloadProfile();
  }

  if (confirmNo) {
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="push-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
        <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-xl">
          <p className="text-5xl" aria-hidden>
            🤝
          </p>
          <h2 id="push-title" className="mt-3 text-2xl font-extrabold text-brand">
            Wirklich keine Nachrichten?
          </h2>
          <p className="mt-3 text-muted">{DECLINE_HINT}</p>
          {support === "ok" && (
            <button type="button" className={`${btn.accent} mt-5 w-full text-lg`} disabled={busy} onClick={turnOn}>
              {busy ? "Einen Moment …" : "Doch einschalten"}
            </button>
          )}
          <button type="button" className={`${btn.ghost} mt-3 w-full`} disabled={busy} onClick={decline}>
            Ja, keine Nachrichten
          </button>
          <p className="mt-3 text-xs text-muted">Du kannst das jederzeit im Profil ändern.</p>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="push-title" className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-[2rem] bg-white p-6 text-center shadow-xl">
        <p className="text-5xl" aria-hidden>
          🔔
        </p>
        <h2 id="push-title" className="mt-3 text-2xl font-extrabold text-brand">
          Dürfen wir dir Bescheid geben?
        </h2>

        {support === "ios_needs_homescreen" ? (
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-left">
            <li>
              Tippe in Safari unten auf <b>Teilen</b> (Quadrat mit Pfeil).
            </li>
            <li>
              Wähle <b>Zum Home-Bildschirm</b>.
            </li>
            <li>Öffne Karma über das neue Symbol. Dann fragen wir nochmal.</li>
          </ol>
        ) : support === "denied" ? (
          <p className="mt-3 text-muted">
            Das Handy blockiert gerade Nachrichten von Karma. Erlaube sie in den Einstellungen des Browsers und öffne
            Karma neu.
          </p>
        ) : (
          <p className="mt-3 text-muted">
            Wenn jemand in deiner Nähe Hilfe braucht, bekommst du eine Nachricht. Tippe auf OK und dann auf{" "}
            <b>Zulassen</b>.
          </p>
        )}

        {msg && <p className="mt-3 text-sm font-bold text-red-800">{msg}</p>}

        {support === "ok" ? (
          <button type="button" className={`${btn.accent} mt-5 w-full text-lg`} disabled={busy} onClick={turnOn}>
            {busy ? "Einen Moment …" : "OK"}
          </button>
        ) : (
          <button type="button" className={`${btn.accent} mt-5 w-full text-lg`} onClick={closeForNow}>
            Verstanden
          </button>
        )}
        <div className="mt-4 flex justify-center gap-5 text-sm font-bold text-muted">
          {support === "ok" && (
            <button type="button" className="underline" disabled={busy} onClick={closeForNow}>
              Später
            </button>
          )}
          <button type="button" className="underline" disabled={busy} onClick={() => setConfirmNo(true)}>
            Nein, ich will keine
          </button>
        </div>
      </div>
    </div>
  );
}
