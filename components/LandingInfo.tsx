import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/contact";

const STEPS = [
  { n: "1", title: "Anfragen oder anbieten", text: "Schreib kurz, was du brauchst oder was du kannst. Dauert eine Minute." },
  { n: "2", title: "Jemand in der Nähe sagt zu", text: "Wer in deiner Gegend ist, bekommt Bescheid und sagt mit einem Tipp zu." },
  { n: "3", title: "Helfen und bestätigen", text: "Nach der Hilfe bestätigt die hilfesuchende Person die Zeit. Dafür gibt es Karma." },
];

const DIFFERENT = [
  { emoji: "🤝", title: "Nur Hilfe, sonst nichts", text: "Kein Marktplatz, keine Werbung, kein Geld über die App. Hier geht es nur ums Helfen." },
  { emoji: "✅", title: "Verbindlich", text: "Anfrage, Zusage, Bestätigung. Jede Hilfe wird von der Person bestätigt, die sie bekommen hat." },
  { emoji: "🏠", title: "Auch für Einrichtungen", text: "Tafel, Tierheim oder Verein können selbst konkrete Hilfe anfragen, zum Beispiel Sortieren, Fahrten oder Gassi gehen." },
  { emoji: "🌱", title: "Wertschätzung, die man sieht", text: "Jede Hilfe zählt, auch die zehnte. Dein Tier wächst mit, Stufe für Stufe." },
];

const PRIVACY = [
  "Andere sehen nie deinen genauen Standort, nur die ungefähre Entfernung und einen groben Ortsnamen.",
  "Deine Adresse sehen nur die Menschen, deren Hilfe du angenommen hast.",
  "Deine E-Mail-Adresse sieht niemand. Anmeldung ohne Passwort, mit Code.",
  "Keine Werbung, keine Analyse- oder Tracking-Tools.",
  "Die Datenbank liegt auf Servern in Frankfurt am Main.",
];

export default function LandingInfo() {
  return (
    <>
      <section aria-labelledby="so-gehts" className="mb-12">
        <h2 id="so-gehts" className="text-2xl font-extrabold text-brand">
          So geht&apos;s
        </h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-3xl bg-white p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sun text-lg font-extrabold">
                {s.n}
              </span>
              <div>
                <p className="font-extrabold">{s.title}</p>
                <p className="text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="anders" className="mb-12">
        <h2 id="anders" className="text-2xl font-extrabold text-brand">
          Was Karma anders macht
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DIFFERENT.map((d) => (
            <div key={d.title} className="rounded-3xl bg-white p-4">
              <p className="text-2xl" aria-hidden>
                {d.emoji}
              </p>
              <p className="mt-1 font-extrabold">{d.title}</p>
              <p className="text-muted">{d.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="daten" className="mb-12 rounded-[2rem] bg-brand-soft p-6">
        <h2 id="daten" className="text-2xl font-extrabold text-brand">
          Deine Daten bleiben bei dir
        </h2>
        <p className="mt-2 text-ink/80">
          Wer in der Nachbarschaft hilft, verrät viel: wo man wohnt, wann man zu Hause ist. Deshalb teilt Karma nur das
          Nötigste.
        </p>
        <ul className="mt-4 space-y-2">
          {PRIVACY.map((p) => (
            <li key={p} className="flex gap-3">
              <span className="font-extrabold text-brand" aria-hidden>
                ✓
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink/80">
          Woran wir arbeiten: Standorte nur noch in groben Waben speichern statt als genaue Koordinaten, damit auch in
          kleinen Orten niemand herausfinden kann, wo jemand wohnt.{" "}
          <Link href="/datenschutz" className="font-bold underline underline-offset-4">
            Zur Datenschutzerklärung
          </Link>
        </p>
      </section>

      <section aria-labelledby="test" className="mb-12 rounded-[2rem] bg-white p-6">
        <h2 id="test" className="text-2xl font-extrabold text-brand">
          Testphase in Trebbin
        </h2>
        <p className="mt-2 text-ink/80">
          Ab Dezember 2026 testen wir Karma in Trebbin und Umgebung. Jede Anfrage und jedes Feedback hilft uns, Karma so
          zu bauen, dass es im Alltag wirklich trägt.
        </p>
        {CONTACT_EMAIL && (
          <p className="mt-3 text-ink/80">
            Ihr seid ein Verein, eine Einrichtung oder eine Kommune und wollt mitmachen? Schreibt uns:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-bold underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>
          </p>
        )}
      </section>
    </>
  );
}
