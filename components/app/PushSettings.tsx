"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { btn, card } from "@/components/ui";
import {
  disablePushOnDevice,
  enablePush,
  hasDeviceSubscription,
  isIos,
  pushSupport,
  type PushSupport,
} from "@/lib/push";
import { getSupabase } from "@/lib/supabase";
import { DECLINE_HINT, LATER_KEY } from "@/components/app/PushPrompt";

const PER_DAY = [1, 2, 3, 5, 10];

type Status = { enabled: boolean; per_day: number; devices: number; sent_today: number };

function useDevicePush() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    setSupport(pushSupport());
    setSubscribed(await hasDeviceSubscription());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser-APIs gibt es erst im Browser
    void refresh();
  }, [refresh]);
  return { support, subscribed, refresh };
}

function HomescreenHint() {
  return (
    <div className="rounded-2xl bg-sun/40 p-4 text-sm">
      <p className="font-extrabold">Auf dem iPhone erst zum Home-Bildschirm hinzufügen</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Tippe in Safari unten auf <b>Teilen</b> (Quadrat mit Pfeil).
        </li>
        <li>
          Wähle <b>Zum Home-Bildschirm</b>.
        </li>
        <li>Öffne Karma über das neue Symbol und schalte hier die Nachrichten ein.</li>
      </ol>
    </div>
  );
}

/** Abfrage beim ersten Login: Nachrichten einschalten und Anzahl pro Tag wählen */
export function OnboardingPush({ onDone }: { onDone: () => void }) {
  const { profile, reloadProfile } = useApp();
  const { support } = useDevicePush();
  const [perDay, setPerDay] = useState(profile.push_per_day ?? 3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmNo, setConfirmNo] = useState(false);

  async function savePerDay() {
    await getSupabase().from("profiles").update({ push_per_day: perDay }).eq("id", profile.id);
  }

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    await savePerDay();
    const res = await enablePush();
    setBusy(false);
    if (!res.ok && res.reason === "denied") {
      setMsg("Nachrichten sind im Browser blockiert. Du kannst sie später im Profil einschalten.");
      return;
    }
    await reloadProfile();
    onDone();
  }

  return (
    <div className="space-y-6 pt-4">
      <div>
        <p className="text-sm font-bold text-muted">Fast geschafft</p>
        <h1 className="mt-1 text-3xl font-extrabold text-brand">Sollen wir dir Bescheid geben?</h1>
        <p className="mt-2 text-muted">
          Wenn in deiner Nähe jemand Hilfe braucht, bekommst du eine Nachricht und sagst direkt darin zu oder ab.
          Ablehnen hat keine Folgen. Zwischen 21 und 8 Uhr schicken wir nichts.
        </p>
      </div>

      <fieldset className={`${card}`}>
        <legend className="sr-only">Höchstens pro Tag</legend>
        <p className="font-extrabold">Wie viele Nachrichten höchstens pro Tag?</p>
        <p className="text-sm text-muted">Du kannst das jederzeit im Profil ändern.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PER_DAY.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={perDay === n}
              onClick={() => setPerDay(n)}
              className={`min-w-12 rounded-full px-4 py-2 font-bold ${perDay === n ? "bg-brand text-paper" : "bg-paper"}`}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {support === "ios_needs_homescreen" && <HomescreenHint />}
      {msg && <p className="rounded-2xl bg-sun/30 p-3 text-sm font-bold">{msg}</p>}

      <div className="space-y-2">
        {support === "ok" && (
          <button type="button" className={`${btn.accent} w-full`} disabled={busy} onClick={turnOn}>
            {busy ? "Einen Moment …" : confirmNo ? "🔔 Doch einschalten" : "🔔 OK, Nachrichten einschalten"}
          </button>
        )}
        {support === "ok" ? (
          confirmNo ? (
            <div className="rounded-2xl bg-sun/30 p-4 text-center">
              <p className="font-bold">{DECLINE_HINT}</p>
              <button
                type="button"
                className={`${btn.ghost} mt-3 w-full`}
                disabled={busy}
                onClick={async () => {
                  await getSupabase()
                    .from("profiles")
                    .update({ push_per_day: perDay, push_enabled: false })
                    .eq("id", profile.id);
                  await reloadProfile();
                  onDone();
                }}
              >
                Ja, keine Nachrichten
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full py-2 text-sm font-bold text-muted underline"
              disabled={busy}
              onClick={() => setConfirmNo(true)}
            >
              Nein, ich will keine
            </button>
          )
        ) : (
          <button
            type="button"
            className={`${btn.ghost} w-full`}
            disabled={busy}
            onClick={async () => {
              await savePerDay();
              try {
                sessionStorage.setItem(LATER_KEY, "1");
              } catch {
                /* egal */
              }
              onDone();
            }}
          >
            Weiter
          </button>
        )}
      </div>
    </div>
  );
}

/** Einstellungen im Profil */
export default function PushSettings() {
  const { reloadProfile } = useApp();
  const { support, subscribed, refresh } = useDevicePush();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await getSupabase().rpc("my_push_status");
    setStatus((data as Status | null) ?? null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden
    void load();
  }, [load]);

  async function setField(patch: Partial<{ push_enabled: boolean; push_per_day: number }>) {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    await supabase.from("profiles").update(patch).eq("id", auth.user.id);
    await load();
    await reloadProfile();
  }

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    const res = await enablePush();
    setBusy(false);
    if (!res.ok) {
      setMsg(
        res.reason === "denied"
          ? "Nachrichten sind im Browser blockiert. Erlaube sie in den Website-Einstellungen."
          : "Das hat nicht geklappt. Bitte versuch es nochmal.",
      );
    }
    await refresh();
    await load();
    await reloadProfile();
  }

  async function turnOffDevice() {
    setBusy(true);
    await disablePushOnDevice();
    setBusy(false);
    await refresh();
    await load();
  }

  const active = Boolean(status?.enabled) && Boolean(subscribed);

  return (
    <section className={`${card} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Benachrichtigungen</h2>
          <p className="text-sm text-muted">
            Neue Anfragen aus deiner Nähe. Zählt ist, wo du gerade bist, nicht wo du wohnst.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${active ? "bg-accent text-ink" : "bg-ink/5"}`}>
          {active ? "An" : "Aus"}
        </span>
      </div>

      {support === "ios_needs_homescreen" && <HomescreenHint />}
      {support === "unsupported" && (
        <p className="rounded-2xl bg-ink/5 p-3 text-sm">
          Dieser Browser kann keine Nachrichten empfangen. {isIos() ? "Öffne Karma in Safari." : "Probier Chrome, Edge oder Firefox."}
        </p>
      )}
      {support === "denied" && (
        <p className="rounded-2xl bg-sun/40 p-3 text-sm">
          Nachrichten sind im Browser blockiert. Erlaube sie in den Website-Einstellungen und lade die Seite neu.
        </p>
      )}

      {support === "ok" && !subscribed && (
        <button type="button" className={`${btn.primary} w-full`} disabled={busy} onClick={turnOn}>
          {busy ? "Einen Moment …" : "🔔 Auf diesem Gerät einschalten"}
        </button>
      )}

      {subscribed && (
        <>
          <label className="flex items-center justify-between gap-3">
            <span className="font-bold">Nachrichten erhalten</span>
            <input
              type="checkbox"
              className="h-6 w-6 accent-brand"
              checked={Boolean(status?.enabled)}
              onChange={(e) => void setField({ push_enabled: e.target.checked })}
            />
          </label>
          <fieldset>
            <legend className="mb-2 font-bold">Höchstens pro Tag</legend>
            <div className="flex flex-wrap gap-2">
              {PER_DAY.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={status?.per_day === n}
                  onClick={() => void setField({ push_per_day: n })}
                  className={`min-w-12 rounded-full px-4 py-2 font-bold ${status?.per_day === n ? "bg-brand text-paper" : "bg-paper"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Heute bekommen: {status?.sent_today ?? 0}. Zwischen 21 und 8 Uhr schicken wir nichts. Ablehnen hat
              keine Folgen.
            </p>
          </fieldset>
          <button type="button" className="text-sm font-bold text-muted underline" disabled={busy} onClick={turnOffDevice}>
            Auf diesem Gerät ausschalten
          </button>
        </>
      )}
      {msg && <p className="text-sm font-bold text-red-800">{msg}</p>}
    </section>
  );
}
