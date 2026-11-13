"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import LegalFooter from "@/components/LegalFooter";
import { btn, input } from "@/components/ui";
import { ANIMALS } from "@/lib/animals";
import { getSupabase } from "@/lib/supabase";

type Step = "email" | "code";

const EXAMPLES = [
  { emoji: "📱", text: "Handy einrichten", meta: "30 Min. · 400 m" },
  { emoji: "🐕", text: "Gassi gehen mit Bruno", meta: "45 Min. · 1,2 km" },
  { emoji: "☕", text: "Vorlesen am Nachmittag", meta: "60 Min. · jede Woche" },
];

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
    if (params.get("fehler") === "link") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL gibt es erst im Browser
      setNotice("Der Link war abgelaufen oder schon benutzt. Hol dir einfach einen neuen.");
    }
    if (params.get("login")) formRef.current?.scrollIntoView({ behavior: "smooth" });
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
        data: firstName.trim() ? { first_name: firstName.trim() } : undefined,
      },
    });
    setBusy(false);
    if (error) {
      setNotice(
        error.status === 429
          ? "Zu viele Versuche. Bitte warte eine Minute."
          : "Das hat nicht geklappt. Stimmt die E-Mail-Adresse?",
      );
      return;
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
    router.replace("/app");
  }

  return (
    <>
      <main className="mx-auto max-w-xl px-5">
        <header className="flex items-center justify-between py-5">
          <span className="rounded-full bg-forest px-3 py-1 text-sm font-extrabold tracking-wide text-lime">
            KARMA
          </span>
          <span className="text-sm font-bold text-muted">Testphase Trebbin</span>
        </header>

        <section className="pt-6 pb-10">
          <h1 className="text-[2.6rem] leading-[1.05] font-extrabold tracking-tight text-forest">
            Kurz mal Hilfe gebraucht?
            <br />
            <span className="bg-lime px-1 text-ink">Oder 15 Minuten Zeit?</span>
          </h1>
          <p className="mt-5 text-lg text-ink/80">
            Karma bringt Nachbarn zusammen. Du fragst an, was du brauchst. Wer in der Nähe Zeit hat,
            wischt nach rechts und hilft. Ohne Geld, ohne Tratsch.
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
          {EXAMPLES.map((ex, i) => (
            <div
              key={ex.text}
              className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-[0_1px_0_rgba(20,32,26,.08)]"
              style={{ transform: `rotate(${[-1.2, 0.8, -0.4][i]}deg)` }}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-paper text-2xl">{ex.emoji}</span>
              <div className="flex-1">
                <p className="font-extrabold">{ex.text}</p>
                <p className="text-sm text-muted">{ex.meta}</p>
              </div>
              <span className="rounded-full bg-lime px-3 py-1 text-sm font-extrabold">Ich helfe →</span>
            </div>
          ))}
        </section>

        <section className="mb-12 rounded-[2rem] bg-forest p-6 text-paper">
          <h2 className="text-2xl font-extrabold">Jede Hilfe zählt gleich viel</h2>
          <p className="mt-2 text-paper/80">
            Pro angefangene Viertelstunde gibt es 10 Karma. Dein Tier wächst mit, von der Amöbe bis
            zum Phönix. Es fällt nie zurück, aber ohne Hilfe wird es mit der Zeit blass und müde.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-2xl" aria-label="Die sieben Tiere">
            {ANIMALS.map((a) => (
              <span key={a.stage} title={a.name} className="grid h-11 w-11 place-items-center rounded-full bg-paper/10">
                {a.emoji}
              </span>
            ))}
          </div>
        </section>

        <section ref={formRef} id="mitmachen" className="mb-6 scroll-mt-6 rounded-[2rem] bg-lime p-6">
          {step === "email" ? (
            <form onSubmit={sendLink} className="space-y-3">
              <h2 className="text-2xl font-extrabold">Mach mit</h2>
              <p className="text-ink/80">Wir schicken dir einen Anmeldelink und einen Code. Kein Passwort nötig.</p>
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
                {busy ? "Wird gesendet …" : "Anmeldelink schicken"}
              </button>
              <p className="text-xs text-ink/70">
                Schon dabei? Einfach E-Mail eingeben, der Vorname bleibt dann wie er ist.
              </p>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-3">
              <h2 className="text-2xl font-extrabold">Schau in dein Postfach</h2>
              <p className="text-ink/80">
                Tipp auf den Link in der Mail an <b>{email}</b>. Oder gib hier den Code aus der Mail ein.
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
