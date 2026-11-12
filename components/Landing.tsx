"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ZoneProgress from "@/components/ZoneProgress";
import { ANIMALS } from "@/lib/animals";
import { getSupabase } from "@/lib/supabase";
import { REF_STORAGE_KEY, REFERRALS_FOR_FOUNDER } from "@/lib/types";
import { useZones } from "@/lib/useZones";

type FormState = "idle" | "sending" | "sent";

const STEPS = [
  {
    emoji: "🙋",
    title: "Hilfe anfragen",
    text: "In 30 Sekunden: Was brauchst du, wann und wie lange ungefähr?",
  },
  {
    emoji: "👉",
    title: "Nach rechts wischen",
    text: "Leute in deiner Nähe sehen die Anfrage als Karte. Rechts heißt: Ich helfe.",
  },
  {
    emoji: "✨",
    title: "Karma sammeln",
    text: "Für jede Hilfe gibt es Punkte, und dein Tier entwickelt sich weiter.",
  },
];

export default function Landing() {
  const { zones, error: zonesError } = useZones();
  const [slug, setSlug] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [formState, setFormState] = useState<FormState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Einladungscode und vorgewählte Zone aus dem Link übernehmen
  useEffect(() => {
    // Browser-Werte (URL, localStorage, navigator) erst nach dem Hydrieren lesen,
    // sonst weicht das vorgerenderte HTML vom Client ab.
    /* eslint-disable react-hooks/set-state-in-effect */
    const params = new URLSearchParams(window.location.search);

    const ref = params.get("ref");
    if (ref && /^[a-z0-9]{6,12}$/i.test(ref)) {
      try {
        localStorage.setItem(REF_STORAGE_KEY, ref.toLowerCase());
      } catch {
        /* privater Modus: dann eben ohne Einladungscode */
      }
      setInvited(true);
    }

    const zone = params.get("zone");
    if (zone) setSlug(zone);

    if (params.get("fehler")) {
      setNotice("Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.");
    }

    try {
      getSupabase()
        .auth.getSession()
        .then(({ data }) => setLoggedIn(Boolean(data.session)));
    } catch {
      /* Konfiguration fehlt: useZones zeigt die Meldung */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const selected = zones?.find((z) => z.slug === slug) ?? null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selected || formState === "sending") return;
    setFormState("sending");
    setNotice(null);

    let ref: string | null = null;
    try {
      ref = localStorage.getItem(REF_STORAGE_KEY);
    } catch {
      /* ignorieren */
    }

    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard`,
        // Wird beim Bestätigen der Mail vom DB-Trigger handle_new_user gelesen
        data: { zone_slug: selected.slug, ...(ref ? { ref } : {}) },
      },
    });

    if (error) {
      setFormState("idle");
      setNotice(
        error.status === 429
          ? "Gerade melden sich sehr viele an. Probier es in einer Minute nochmal."
          : "Das hat nicht geklappt. Prüf bitte deine E-Mail-Adresse.",
      );
      return;
    }
    setFormState("sent");
  }

  return (
    <main>
      {/* Hero */}
      <section className="rounded-b-[2.5rem] bg-forest px-5 pb-12 pt-5 text-white">
        <div className="mx-auto max-w-xl">
          <header className="flex items-center justify-between">
            <span className="rounded-full bg-lime px-4 py-1.5 text-sm font-extrabold tracking-wide text-ink">
              KARMA
            </span>
            {loggedIn && (
              <Link href="/dashboard" className="text-sm font-semibold underline underline-offset-4">
                Mein Karma
              </Link>
            )}
          </header>

          <div className="mt-10 flex items-end justify-between gap-4">
            <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight">
              Schalte deinen <span className="text-lime">Kiez</span> frei.
            </h1>
            <span className="animate-float select-none text-6xl" aria-hidden>
              🦋
            </span>
          </div>
          <p className="mt-5 text-lg leading-relaxed text-white/85">
            Karma ist schnelle Nachbarschaftshilfe per Swipe. Jemand braucht kurz eine Bohrmaschine
            oder zwei Hände, du wischst nach rechts und hilfst. Kein Feed, kein Tratsch.
          </p>
          <p className="mt-3 font-semibold text-lime">
            Sobald genug Leute dabei sind, geht deine Zone live.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-xl px-5">
        {invited && (
          <p className="mt-6 rounded-2xl bg-lime px-4 py-3 font-semibold">
            🎟️ Du wurdest eingeladen. Deine Anmeldung zählt doppelt: für deine Zone und für die
            Person, die dich eingeladen hat.
          </p>
        )}

        {/* Zonenwahl mit Live-Counter */}
        <section className="mt-8" aria-labelledby="zonen">
          <h2 id="zonen" className="text-xl font-extrabold">
            1. Wo bist du unterwegs?
          </h2>

          {zonesError && (
            <p role="alert" className="mt-3 rounded-2xl bg-red-100 px-4 py-3 text-red-900">
              {zonesError}
            </p>
          )}
          {!zones && !zonesError && (
            <div className="mt-3 space-y-3" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl bg-ink/5" />
              ))}
            </div>
          )}

          <div role="radiogroup" aria-labelledby="zonen" className="mt-3 space-y-3">
            {zones?.map((zone) => {
              const active = zone.slug === slug;
              return (
                <button
                  key={zone.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSlug(zone.slug);
                    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className={`block w-full rounded-3xl border-2 p-4 text-left transition ${
                    active
                      ? "border-forest bg-white shadow-[0_6px_0_0_var(--color-forest)]"
                      : "border-ink/10 bg-white/60 hover:border-ink/30"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-bold">{zone.name}</span>
                    <span
                      className={`grid size-6 place-items-center rounded-full border-2 text-xs ${
                        active ? "border-forest bg-forest text-lime" : "border-ink/20"
                      }`}
                      aria-hidden
                    >
                      {active ? "✓" : ""}
                    </span>
                  </div>
                  <ZoneProgress zone={zone} />
                </button>
              );
            })}
          </div>
        </section>

        {/* Anmeldung */}
        <section className="mt-8" aria-labelledby="anmelden">
          <h2 id="anmelden" className="text-xl font-extrabold">
            2. Platz sichern
          </h2>

          {formState === "sent" ? (
            <div className="mt-3 rounded-3xl bg-forest p-5 text-white" role="status">
              <p className="text-2xl font-extrabold">📬 Schau in dein Postfach</p>
              <p className="mt-2 text-white/85">
                Wir haben dir einen Link an <strong>{email.trim()}</strong> geschickt. Ein Klick,
                und du bist für {selected?.name} dabei. Danach bekommst du deinen Einladungslink
                und deinen Aushang.
              </p>
              <button
                type="button"
                onClick={() => setFormState("idle")}
                className="mt-4 text-sm font-semibold text-lime underline underline-offset-4"
              >
                Andere Adresse verwenden
              </button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={onSubmit} className="mt-3 space-y-3">
              <label className="block">
                <span className="sr-only">E-Mail-Adresse</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="deine@mail.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border-2 border-ink/15 bg-white px-4 py-4 text-lg outline-none focus:border-forest"
                />
              </label>
              <button
                type="submit"
                disabled={!selected || formState === "sending"}
                className="w-full rounded-2xl bg-lime px-4 py-4 text-lg font-extrabold shadow-[0_5px_0_0_var(--color-ink)] transition active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:shadow-none"
              >
                {formState === "sending"
                  ? "Wird gesendet …"
                  : selected
                    ? `Dabei sein: ${selected.name}`
                    : "Erst oben eine Zone wählen"}
              </button>
              {notice && (
                <p role="alert" className="rounded-2xl bg-red-100 px-4 py-3 text-red-900">
                  {notice}
                </p>
              )}
              <p className="text-sm text-muted">
                Kein Passwort nötig. Mit der Anmeldung akzeptierst du die{" "}
                <Link href="/datenschutz" className="underline underline-offset-4">
                  Datenschutzerklärung
                </Link>
                .
              </p>
            </form>
          )}
        </section>

        {/* Incentive */}
        <section className="mt-10 rounded-3xl bg-white p-5">
          <p className="text-sm font-bold uppercase tracking-wider text-muted">Gründer-Bonus</p>
          <h2 className="mt-1 text-2xl font-extrabold leading-tight">
            Lade {REFERRALS_FOR_FOUNDER} Leute ein und überspring die Amöbe.
          </h2>
          <p className="mt-2 text-muted">
            Dann startest du zum Launch direkt als Schmetterling mit Gründer-Aura. Nach der
            Anmeldung bekommst du deinen Link und einen fertigen Aushang für Hausflur oder
            Schwarzes Brett.
          </p>
          <ol className="mt-5 flex items-center justify-between" aria-label="Tier-Evolution">
            {ANIMALS.map((a) => (
              <li
                key={a.stage}
                title={`Stufe ${a.stage}: ${a.name}`}
                className={`grid size-10 place-items-center rounded-full text-xl ${
                  a.stage === 4 ? "bg-lime ring-4 ring-lime/40" : "bg-paper"
                }`}
              >
                <span role="img" aria-label={a.name}>
                  {a.emoji}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* So funktioniert es */}
        <section className="mt-10" aria-labelledby="ablauf">
          <h2 id="ablauf" className="text-xl font-extrabold">
            So läuft es nach dem Start
          </h2>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step) => (
              <li key={step.title} className="flex gap-4 rounded-3xl bg-white p-4">
                <span className="text-3xl" aria-hidden>
                  {step.emoji}
                </span>
                <div>
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="text-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
