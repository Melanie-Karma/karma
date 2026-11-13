"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { Chip, btn, input } from "@/components/ui";
import { TREBBIN, currentPosition, type LatLng } from "@/lib/geo";
import {
  CATEGORIES,
  GENDER_PREF_LABEL,
  MINUTE_OPTIONS,
  RECURRENCE_LABEL,
  categoryOf,
  errorText,
  formatMinutes,
  pointsFor,
  type CategoryId,
} from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type Timing = "now" | "today" | "date";
type Mode = "in_person" | "remote";

const STEPS = ["Was", "Details", "Wann", "Wo", "Wer"] as const;

export default function NewRequest() {
  const router = useRouter();
  const { profile } = useApp();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState<number>(30);
  const [timing, setTiming] = useState<Timing>("today");
  const [date, setDate] = useState("");
  const [recurrence, setRecurrence] = useState("once");
  const [mode, setMode] = useState<Mode>("in_person");
  const [place, setPlace] = useState<{ pos: LatLng; precise: boolean } | null>(null);
  const [locating, setLocating] = useState(false);
  const [addressNote, setAddressNote] = useState("");
  const [helpers, setHelpers] = useState(1);
  const [autoAccept, setAutoAccept] = useState(false);
  const [genderPref, setGenderPref] = useState("any");
  const [relievesStaff, setRelievesStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cat = category ? categoryOf(category) : null;
  const isOrg = profile.account_type === "organization" && profile.is_verified_org;

  const canNext = [
    Boolean(category),
    title.trim().length >= 3,
    timing !== "date" || Boolean(date),
    mode === "remote" || Boolean(place),
    true,
  ][step];

  async function locate() {
    setLocating(true);
    setPlace(await currentPosition());
    setLocating(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await getSupabase().rpc("create_request", {
      p_category: category,
      p_title: title.trim(),
      p_description: description.trim(),
      p_estimated_minutes: minutes,
      p_timing: timing,
      p_scheduled_at: timing === "date" && date ? new Date(date).toISOString() : null,
      p_recurrence: recurrence,
      p_mode: mode,
      p_lat: mode === "in_person" ? place?.pos.lat : null,
      p_lng: mode === "in_person" ? place?.pos.lng : null,
      p_address_note: mode === "in_person" ? addressNote : null,
      p_helpers_needed: helpers,
      p_auto_accept: helpers > 1 && autoAccept,
      p_gender_pref: genderPref,
      p_min_verification: 1,
      p_relieves_staff: isOrg && relievesStaff,
    });
    setBusy(false);
    if (err) {
      setError(errorText(err));
      return;
    }
    router.replace(`/app/anfrage/${data as string}?neu=1`);
  }

  const pill = (active: boolean) =>
    `rounded-2xl px-4 py-3 text-left font-bold transition ${active ? "bg-forest text-paper" : "bg-white"}`;

  return (
    <div>
      <header className="mb-5">
        <p className="text-sm font-bold text-muted">
          Hilfe anfragen · Schritt {step + 1} von {STEPS.length}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-forest" : "bg-ink/10"}`} />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section>
          <h1 className="mb-4 text-2xl font-extrabold text-forest">Wobei brauchst du Hilfe?</h1>
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategory(c.id);
                  if (!c.remoteOk) setMode("in_person");
                  setStep(1);
                }}
                className={`flex flex-col items-start gap-2 rounded-3xl p-4 text-left font-extrabold ${category === c.id ? "bg-lime" : "bg-white"}`}
              >
                <span className="text-3xl">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && cat && (
        <section className="space-y-4">
          <h1 className="text-2xl font-extrabold text-forest">
            {cat.emoji} {cat.label}
          </h1>
          {cat.templates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cat.templates.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTitle(t)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${title === t ? "bg-forest text-paper" : "bg-white"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Kurz gesagt</span>
            <input
              className={input}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Getränkekisten in den 3. Stock"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Mehr dazu (freiwillig)</span>
            <textarea
              className={`${input} min-h-28`}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Was sollte die helfende Person wissen? Keine Adresse und keine Gesundheitsdaten hier."
            />
          </label>
          {cat.keyHint && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              🔑 Braucht es einen Schlüssel? Das klärt ihr untereinander, Karma vermittelt keine
              Schlüssel. Tipp: Ein Schlüsseltresor ist sicherer als eine Übergabe.
            </p>
          )}
          {category === "shopping" && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              💶 Bitte keine Bankkarte und keine PIN weitergeben. Auslagen klärt ihr direkt mit Kassenbon.
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold text-forest">Wann und wie lange?</h1>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Wann</legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["now", "Jetzt gleich"],
                  ["today", "Heute"],
                  ["date", "Termin"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" className={pill(timing === v)} onClick={() => setTiming(v)}>
                  {label}
                </button>
              ))}
            </div>
            {timing === "date" && (
              <input
                type="datetime-local"
                className={`${input} mt-3`}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Datum und Uhrzeit"
              />
            )}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Wie lange ungefähr?</legend>
            <div className="grid grid-cols-3 gap-2">
              {MINUTE_OPTIONS.map((m) => (
                <button key={m} type="button" className={pill(minutes === m)} onClick={() => setMinutes(m)}>
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              Danach richten sich die Punkte für die helfende Person: {pointsFor(minutes)} Karma.
              Nach der Hilfe bestätigst du die tatsächliche Zeit.
            </p>
          </fieldset>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Wie oft?</span>
            <select className={input} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {Object.entries(RECURRENCE_LABEL).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {step === 3 && cat && (
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold text-forest">Wo?</h1>
          {cat.remoteOk && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={pill(mode === "in_person")} onClick={() => setMode("in_person")}>
                Vor Ort
              </button>
              <button type="button" className={pill(mode === "remote")} onClick={() => setMode("remote")}>
                Per Telefon oder Video
              </button>
            </div>
          )}
          {mode === "in_person" ? (
            <>
              <div className="rounded-3xl bg-white p-5">
                <p className="font-bold">Ungefährer Ort</p>
                <p className="mt-1 text-sm text-muted">
                  Andere sehen nur die Entfernung, nie den genauen Punkt.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btn.primary} onClick={locate} disabled={locating}>
                    {locating ? "Suche …" : "📍 Mein Standort"}
                  </button>
                  <button
                    type="button"
                    className={btn.ghost}
                    onClick={() => setPlace({ pos: TREBBIN, precise: false })}
                  >
                    Trebbin Mitte
                  </button>
                </div>
                {place && (
                  <p className="mt-3 text-sm font-bold text-forest">
                    {place.precise ? "✓ Standort übernommen" : "✓ Trebbin Mitte als Ort gewählt"}
                  </p>
                )}
              </div>
              <label className="block">
                <span className="mb-1 block text-sm font-bold">Adresse oder Treffpunkt (freiwillig)</span>
                <input
                  className={input}
                  maxLength={200}
                  value={addressNote}
                  onChange={(e) => setAddressNote(e.target.value)}
                  placeholder="z. B. Bahnhofstraße 5, Klingel Müller"
                />
                <span className="mt-1 block text-xs text-muted">
                  Sehen nur Personen, deren Hilfe du angenommen hast.
                </span>
              </label>
            </>
          ) : (
            <p className="rounded-2xl bg-white p-4 text-sm">
              Ihr verabredet euch im Chat. Telefonnummern tauscht ihr nur, wenn ihr beide wollt.
            </p>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold text-forest">Wer soll helfen?</h1>
          <div className="flex items-center justify-between rounded-3xl bg-white p-5">
            <div>
              <p className="font-bold">Wie viele Personen?</p>
              <p className="text-sm text-muted">Für Umzüge oder Aktionen auch mehrere.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Weniger"
                className="h-10 w-10 rounded-full bg-paper text-xl font-bold"
                onClick={() => setHelpers((h) => Math.max(1, h - 1))}
              >
                −
              </button>
              <span className="w-6 text-center text-xl font-extrabold" aria-live="polite">
                {helpers}
              </span>
              <button
                type="button"
                aria-label="Mehr"
                className="h-10 w-10 rounded-full bg-paper text-xl font-bold"
                onClick={() => setHelpers((h) => Math.min(30, h + 1))}
              >
                +
              </button>
            </div>
          </div>
          {helpers > 1 && (
            <label className="flex items-start gap-3 rounded-3xl bg-white p-5">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-forest"
                checked={autoAccept}
                onChange={(e) => setAutoAccept(e.target.checked)}
              />
              <span>
                <b>Automatisch annehmen</b>
                <span className="block text-sm text-muted">
                  Die ersten {helpers} sind direkt dabei, du musst niemanden einzeln bestätigen.
                </span>
              </span>
            </label>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Wer darf helfen?</legend>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(GENDER_PREF_LABEL).map(([v, label]) => (
                <button key={v} type="button" className={pill(genderPref === v)} onClick={() => setGenderPref(v)}>
                  {label}
                </button>
              ))}
            </div>
            {genderPref !== "any" && (
              <p className="mt-2 text-xs text-muted">Alle anderen sehen diese Anfrage gar nicht.</p>
            )}
          </fieldset>
          {isOrg && (
            <label className="flex items-start gap-3 rounded-3xl bg-white p-5">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-forest"
                checked={relievesStaff}
                onChange={(e) => setRelievesStaff(e.target.checked)}
              />
              <span>
                <b>Wäre sonst bei unserem Personal gelandet</b>
                <span className="block text-sm text-muted">Zählt in eurer Auswertung als entlastete Fachkraftstunde.</span>
              </span>
            </label>
          )}

          <div className="rounded-3xl bg-lime/60 p-5">
            <p className="text-sm font-bold text-muted">Zusammenfassung</p>
            <p className="mt-1 text-lg font-extrabold">
              {cat?.emoji} {title}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>{formatMinutes(minutes)}</Chip>
              <Chip>{mode === "remote" ? "Telefon oder Video" : "Vor Ort"}</Chip>
              <Chip>👥 {helpers}</Chip>
              {recurrence !== "once" && <Chip>🔁 {RECURRENCE_LABEL[recurrence]}</Chip>}
            </div>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      {step > 0 && (
        <div className="mt-6 flex gap-3">
          <button type="button" className={`${btn.ghost} flex-1`} onClick={() => setStep((s) => s - 1)}>
            Zurück
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" className={`${btn.primary} flex-[1.4]`} disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Weiter
            </button>
          ) : (
            <button type="button" className={`${btn.lime} flex-[1.4]`} disabled={busy} onClick={submit}>
              {busy ? "Wird gesendet …" : "Anfrage senden"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
