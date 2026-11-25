"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import LandingInfo from "@/components/LandingInfo";
import LegalFooter from "@/components/LegalFooter";
import { AnimalBubble, btn, input } from "@/components/ui";
import { ANIMALS } from "@/lib/animals";
import { getSupabase } from "@/lib/supabase";

type Step = "email" | "code";

const EXAMPLES = [
  { emoji: "📦", text: "Umzug: 4 Leute gesucht", meta: "Samstag · 2 Std. · 800 m", cta: "Ich helfe →" },
  { emoji: "🪚", text: "Säge ausleihen", meta: "bis Sonntag · 300 m", cta: "Ich helfe →" },
  { emoji: "📖", text: "Ich lese gern vor", meta: "Angebot · dienstags · 1,1 km", cta: "Annehmen →" },
  { emoji: "🐾", text: "Gassi mit Tierheim-Hunden", meta: "Tierheim · heute · 2,4 km", cta: "Ich helfe →" },
];

const PENDING_KEY = "karma_pending_login";
const REF_KEY = "karma_ref";

function storedRef(): string | null {
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export default function Landing() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Landet der Mail-Link auf der Startseite (Standard-Vorlage von Supabase),
    // reichen wir ihn an die Bestätigungs-Route weiter.
    if (params.get("code") || params.get("token_hash")) {
      window.location.replace(`/auth/confirm${window.location.search}`);
      return;
    }
    if (params.get("fehler") === "link") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL gibt es erst im Browser
      setNotice("Der Link war abgelaufen oder schon benutzt. Hol dir einfach einen neuen.");
    }
    if (params.get("konto") === "geloescht") {
      setNotice("Dein Konto ist gelöscht. Danke, dass du dabei warst.");
      formRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    if (params.get("login")) formRef.current?.scrollIntoView({ behavior: "smooth" });
    // Einladungslink: Werber merken, bis sich jemand anmeldet
    const ref = params.get("ref");
    if (ref && /^[0-9a-f-]{36}$/i.test(ref)) {
      try {
        localStorage.setItem(REF_KEY, ref);
      } catch {
        /* egal */
      }
    }
    // Code angefordert und Seite zwischendurch geschlossen? Dann direkt zur Code-Eingabe.
    try {
      const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as { email: string; at: number } | null;
      if (pending && Date.now() - pending.at < 60 * 60 * 1000) {
        setEmail(pending.email);
        setStep("code");
      }
    } catch {
      /* kein Speicher verfügbar */
    }
    // Schon angemeldet? Dann direkt in die App
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace("/app");
      });
  }, [router]);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/app`,
        data: {
          ...(firstName.trim() ? { first_name: firstName.trim() } : {}),
          ...(storedRef() ? { ref: storedRef() } : {}),
        },
      },
    });
    setBusy(false);
    if (error) {
      const secs = /after (\d+) seconds/.exec(error.message)?.[1];
      setNotice(
        error.status === 429
          ? secs
            ? `Bitte warte noch ${secs} Sekunden. Hast du schon einen Code? Dann tipp unten auf „Ich habe schon einen Code“.`
            : "Gerade wurden zu viele Anmeldemails verschickt. Bitte versuch es später nochmal."
          : "Das hat nicht geklappt. Stimmt die E-Mail-Adresse?",
      );
      return;
    }
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ email: email.trim(), at: Date.now() }));
    } catch {
      /* egal */
    }
    setStep("code");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error } = await getSupabase().auth.verifyOtp({
      email: email.trim(),
      token: code.replace(/\s/g, ""),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setNotice("Der Code passt nicht oder ist abgelaufen.");
      return;
    }
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* egal */
    }
    router.replace("/app");
  }

  return (
    <>
      <main className="mx-auto max-w-xl px-5">
        <header className="flex items-center justify-between py-5">
          <span className="rounded-full bg-brand px-3 py-1 text-sm font-extrabold tracking-wide text-sun">
            KARMA
          </span>
          <span className="text-sm font-bold text-muted">Testphase Trebbin</span>
        </header>

        <section className="pt-6 pb-10">
          <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-brand">
            Menschen helfen Menschen.
            <br />
            <span className="bg-accent px-1 text-ink">Einfach. Direkt. Hier.</span>
          </h1>
          <p className="mt-5 text-lg text-ink/80">
            Umzug, Säge leihen, Mitfahrt zum Arzt, Aufräumaktion im Dorf oder einfach jemand, der
            vorliest. Frag an, was du brauchst, oder biete an, was du kannst. Wer in der Nähe ist,
            bekommt Bescheid und sagt mit einem Tipp zu. Ohne Geld, ohne Tratsch.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              className={btn.primary}
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
            >
              Mitmachen
            </button>
            <Link href="/regeln" className={btn.ghost}>
              Die Regeln
            </Link>
          </div>
        </section>

        <section aria-label="Beispiele" className="relative -mx-1 mb-12 space-y-3">
          {EXAMPLES.map((ex) => (
            <div
              key={ex.text}
              className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-[0_4px_18px_-10px_rgba(35,32,29,.35)]"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-paper text-2xl">{ex.emoji}</span>
              <div className="flex-1">
                <p className="font-extrabold">{ex.text}</p>
                <p className="text-sm text-muted">{ex.meta}</p>
              </div>
              <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-sm font-extrabold">{ex.cta}</span>
            </div>
          ))}
        </section>

        <section className="mb-12 rounded-[2rem] bg-brand p-6 text-paper">
          <h2 className="text-2xl font-extrabold">Hilf mit und lass dein Tier wachsen</h2>
          <p className="mt-2 text-paper/80">
            Jede Hilfe bringt Karma-Punkte. Damit wächst dein Tier, Stufe für Stufe. Wer am Ende ganz oben
            ankommt? Finde es heraus.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Ein paar der Tiere">
            {ANIMALS.filter((a) => [1, 4, 7, 10, 13, 16].includes(a.stage)).map((a, i, arr) => (
              <span key={a.stage} className="flex items-center gap-2">
                <AnimalBubble animal={a} size={i === arr.length - 1 ? 18 : 22} dim={i === arr.length - 1} />
                {i < arr.length - 1 && <span className="text-paper/40">›</span>}
              </span>
            ))}
            <span className="self-center text-xl font-extrabold text-sun">?</span>
          </div>
        </section>

        <LandingInfo />

        <section ref={formRef} id="mitmachen" className="mb-6 scroll-mt-6 rounded-[2rem] bg-accent p-6">
          {step === "email" ? (
            <form onSubmit={sendLink} className="space-y-3">
              <h2 className="text-2xl font-extrabold">Mach mit</h2>
              <p className="text-ink/80">Wir schicken dir einen Code per Mail. Kein Passwort nötig.</p>
              <label className="block">
                <span className="mb-1 block text-sm font-bold">Vorname</span>
                <input
                  className={input}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  maxLength={30}
                  placeholder="z. B. Melanie"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold">E-Mail</span>
                <input
                  className={input}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="du@beispiel.de"
                />
              </label>
              <button className={`${btn.primary} w-full`} disabled={busy || !email}>
                {busy ? "Wird gesendet …" : "Code schicken"}
              </button>
              <p className="text-xs text-ink/70">
                Schon dabei? Einfach E-Mail eingeben, der Vorname bleibt dann wie er ist.
              </p>
              <p className="text-xs text-ink/70">
                Deine E-Mail-Adresse nutzen wir nur für die Anmeldung, wie in der{" "}
                <Link href="/datenschutz" className="underline underline-offset-2">
                  Datenschutzerklärung
                </Link>{" "}
                beschrieben.
              </p>
              <button
                type="button"
                className="w-full text-sm font-bold underline"
                onClick={() => (email ? setStep("code") : setNotice("Gib zuerst deine E-Mail-Adresse ein."))}
              >
                Ich habe schon einen Code
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <h2 className="text-2xl font-extrabold">Schau in dein Postfach</h2>
              <p className="text-ink/80">
                Gib den Code aus der Mail an <b>{email}</b> ein. Der Code gilt eine Stunde.
              </p>
              <input
                className={`${input} text-center text-2xl tracking-[.4em]`}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={10}
              />
              <button className={`${btn.primary} w-full`} disabled={busy || code.replace(/\s/g, "").length < 6}>
                {busy ? "Prüfe …" : "Anmelden"}
              </button>
              <button type="button" className="w-full text-sm underline" onClick={() => setStep("email")}>
                Andere E-Mail verwenden
              </button>
            </form>
          )}
          {notice && (
            <p role="alert" className="mt-3 rounded-2xl bg-white/70 p-3 text-sm font-bold">
              {notice}
            </p>
          )}
        </section>
      </main>
      <LegalFooter />
    </>
  );
}
