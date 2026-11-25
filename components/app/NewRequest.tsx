"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app/AppShell";
import { Chip, btn, input } from "@/components/ui";
import { TREBBIN, currentPosition, placeName, type LatLng } from "@/lib/geo";
import {
  CATEGORIES,
  GENDER_PREF_LABEL,
  estimateOptions,
  maxMinutesFor,
  RECURRENCE_LABEL,
  categoryOf,
  errorText,
  formatMinutes,
  pointsFor,
  type CategoryId,
  type Kind,
} from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

type Day = "now" | "today" | "tomorrow" | "date";
type Mode = "in_person" | "remote";

const STEPS = ["Was", "Details", "Wann & wie viele", "Wo", "Wer"] as const;

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function NewRequest() {
  const router = useRouter();
  const { profile } = useApp();
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<Kind>("request");
  const [lendUntil, setLendUntil] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState<number>(30);
  const [day, setDay] = useState<Day>("today");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [permanent, setPermanent] = useState(false);
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
  const isOffer = kind === "offer";
  const isLend = category === "lend";
  const templates = cat ? (isOffer ? (cat.offerTemplates ?? cat.templates) : cat.templates) : [];

  useEffect(() => {
    // ?art=angebot öffnet direkt „Hilfe anbieten“
    if (new URLSearchParams(window.location.search).get("art") === "angebot") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL gibt es erst im Browser
      setKind("offer");
    }
  }, []);

  const canNext = [
    Boolean(category),
    title.trim().length >= 3,
    permanent || day === "now" || day === "today" || (Boolean(timeStr) && (day === "tomorrow" || Boolean(dateStr))),
    mode === "remote" || Boolean(place),
    true,
  ][step];

  async function locate() {
    setLocating(true);
    setPlace(await currentPosition());
    setLocating(false);
  }

  /** Datum und Uhrzeit in das Format der Datenbank übersetzen */
  function whenForDb(): { timing: string; scheduledAt: string | null } {
    if (isOffer && permanent) return { timing: "always", scheduledAt: null };
    if (day === "now") return { timing: "now", scheduledAt: null };
    if (day === "today" && !timeStr) return { timing: "today", scheduledAt: null };
    const base = day === "today" ? new Date() : day === "tomorrow" ? new Date(Date.now() + 86400000) : new Date(dateStr);
    const [h, m] = (timeStr || "12:00").split(":").map(Number);
    const at = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    return { timing: "date", scheduledAt: at.toISOString() };
  }

  function whenLabel(): string {
    if (isOffer && permanent) return "Dauerhaft";
    if (day === "now") return "Jetzt gleich";
    const d = day === "today" ? "Heute" : day === "tomorrow" ? "Morgen" : dateStr ? new Date(dateStr).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) : "";
    return timeStr ? `${d}, ${timeStr} Uhr` : `${d}, Uhrzeit flexibel`;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const when = whenForDb();
    const { data, error: err } = await getSupabase().rpc("create_request", {
      p_category: category,
      p_title: title.trim(),
      p_description: description.trim(),
      p_estimated_minutes: minutes,
      p_timing: when.timing,
      p_scheduled_at: when.scheduledAt,
      p_recurrence: when.timing === "always" ? "once" : recurrence,
      p_mode: mode,
      p_lat: mode === "in_person" ? place?.pos.lat : null,
      p_lng: mode === "in_person" ? place?.pos.lng : null,
      p_address_note: mode === "in_person" ? addressNote : null,
      p_helpers_needed: helpers,
      p_auto_accept: helpers > 1 && autoAccept,
      p_gender_pref: genderPref,
      p_min_verification: 1,
      p_relieves_staff: isOrg && relievesStaff,
      p_kind: kind,
      p_lend_until: isLend && lendUntil ? lendUntil : null,
    });
    if (err) {
      setBusy(false);
      setError(errorText(err));
      return;
    }
    if (mode === "in_person" && place) {
      const label = await placeName(place.pos);
      if (label) await getSupabase().rpc("set_request_place", { p_request_id: data as string, p_label: label });
    }
    router.replace(`/app/anfrage/${data as string}?neu=1`);
  }

  const pill = (active: boolean) =>
    `rounded-2xl px-4 py-3 text-left font-bold transition ${active ? "bg-brand text-paper" : "bg-white"}`;

  return (
    <div>
      <header className="mb-5">
        <p className="text-sm font-bold text-muted">
          {isOffer ? "Hilfe anbieten" : "Hilfe anfragen"} · Schritt {step + 1} von {STEPS.length}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-ink/10"}`} />
          ))}
        </div>
      </header>

      {step === 0 && (
        <section>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-white p-1 shadow-[0_2px_12px_-6px_rgba(35,32,29,.18)]" role="tablist" aria-label="Art">
            {(
              [
                ["request", "🙋 Ich brauche Hilfe"],
                ["offer", "💪 Ich biete Hilfe an"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={kind === v}
                onClick={() => {
                  setKind(v);
                  setTitle("");
                }}
                className={`rounded-full px-2 py-3 text-sm font-extrabold transition ${kind === v ? (v === "offer" ? "bg-accent text-ink" : "bg-brand text-paper") : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          <h1 className="mb-4 text-2xl font-extrabold text-brand">
            {isOffer ? "Was kannst du anbieten?" : "Wobei brauchst du Hilfe?"}
          </h1>
          {isOffer && (
            <p className="mb-4 rounded-2xl bg-brand-soft p-3 text-sm">
              Egal wie alt du bist: Vorlesen, zuhören, Technik erklären, etwas verleihen. Wer dein Angebot
              annimmt, meldet sich bei dir. Die Karma-Punkte bekommst du.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategory(c.id);
                  setMinutes((m) => Math.min(m, maxMinutesFor(c.id)));
                  if (!c.remoteOk) setMode("in_person");
                  setStep(1);
                }}
                className={`flex flex-col items-start gap-2 rounded-3xl p-4 text-left font-extrabold ${category === c.id ? "bg-accent" : "bg-white"}`}
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
          <h1 className="text-2xl font-extrabold text-brand">
            {cat.emoji} {cat.label}
          </h1>
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTitle(t)}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${title === t ? "bg-brand text-paper" : "bg-white"}`}
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
              placeholder={isOffer ? "z. B. Ich lese gern Krimis vor" : "z. B. Getränkekisten in den 3. Stock"}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Mehr dazu (freiwillig)</span>
            <textarea
              className={`${input} min-h-28`}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                isOffer
                  ? "Was genau bietest du an, wann passt es dir? Keine Adresse hier."
                  : "Was sollte die helfende Person wissen? Keine Adresse und keine Gesundheitsdaten hier."
              }
            />
          </label>
          {cat.keyHint && (
            <p className="rounded-2xl bg-sun/30 p-3 text-sm text-ink">
              🔑 Braucht es einen Schlüssel? Das klärt ihr untereinander, Karma vermittelt keine
              Schlüssel. Tipp: Ein Schlüsseltresor ist sicherer als eine Übergabe.
            </p>
          )}
          {cat.note && <p className="rounded-2xl bg-sun/30 p-3 text-sm text-ink">ℹ️ {cat.note}</p>}
          {category === "shopping" && (
            <p className="rounded-2xl bg-sun/30 p-3 text-sm text-ink">
              💶 Bitte keine Bankkarte und keine PIN weitergeben. Auslagen klärt ihr direkt mit Kassenbon.
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold text-brand">Wann und wie viele?</h1>

          {isOffer && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={pill(!permanent)} onClick={() => setPermanent(false)}>
                📅 Zu einem Termin
              </button>
              <button type="button" className={pill(permanent)} onClick={() => setPermanent(true)}>
                ♾️ Dauerhaft anbieten
              </button>
            </div>
          )}
          {isOffer && permanent && (
            <p className="rounded-2xl bg-brand-soft p-3 text-sm">
              Dein Angebot bleibt sichtbar, bis du es zurückziehst, zum Beispiel für Werkzeug oder regelmäßiges
              Vorlesen. Jede Nutzung wird einzeln bestätigt und bringt dir Punkte.
            </p>
          )}

          {!(isOffer && permanent) && (
            <>
              <fieldset>
                <legend className="mb-2 text-sm font-bold">Datum</legend>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["now", "Jetzt"],
                      ["today", "Heute"],
                      ["tomorrow", "Morgen"],
                      ["date", "Anderer Tag"],
                    ] as const
                  ).map(([v, label]) => (
                    <button key={v} type="button" className={`${pill(day === v)} px-2 text-center text-sm`} onClick={() => setDay(v)}>
                      {label}
                    </button>
                  ))}
                </div>
                {day === "date" && (
                  <input
                    type="date"
                    className={`${input} mt-3`}
                    value={dateStr}
                    min={isoDate(new Date())}
                    onChange={(e) => setDateStr(e.target.value)}
                    aria-label="Datum"
                  />
                )}
              </fieldset>
              {day !== "now" && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold">
                    Uhrzeit {day === "today" ? "(leer lassen = flexibel)" : ""}
                  </span>
                  <input type="time" className={input} value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
                </label>
              )}
            </>
          )}

          <fieldset>
            <legend className="mb-2 text-sm font-bold">
              {isLend ? "Aufwand für Übergabe und Rückgabe" : "Dauer ungefähr"}
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {estimateOptions(category).map((m) => (
                <button key={m} type="button" className={pill(minutes === m)} onClick={() => setMinutes(m)}>
                  {formatMinutes(m)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {isOffer ? "Dafür bekommst du" : "Danach richten sich die Punkte für die helfende Person:"}{" "}
              {pointsFor(minutes, category ?? undefined)} Karma-Punkte.
            </p>
          </fieldset>

          <div className="flex items-center justify-between rounded-3xl bg-white p-5">
            <div>
              <p className="font-bold">{isOffer ? "Für wie viele Personen gleichzeitig?" : "Wie viele Helfende brauchst du?"}</p>
              <p className="text-sm text-muted">
                {isOffer ? "Meist eine, beim Vorlesen gern auch mehr." : "Für Umzüge oder Aktionen auch mehrere."}
              </p>
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

          {isLend && (
            <label className="block">
              <span className="mb-1 block text-sm font-bold">
                {isOffer ? "Verleihen bis höchstens" : "Zurück bis"} (freiwillig)
              </span>
              <input
                type="date"
                className={input}
                value={lendUntil}
                min={isoDate(new Date())}
                onChange={(e) => setLendUntil(e.target.value)}
              />
            </label>
          )}

          {!(isOffer && permanent) && (
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
          )}
        </section>
      )}

      {step === 3 && cat && (
        <section className="space-y-5">
          <h1 className="text-2xl font-extrabold text-brand">Wo?</h1>
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
                  <p className="mt-3 text-sm font-bold text-brand">
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
          <h1 className="text-2xl font-extrabold text-brand">{isOffer ? "Wer darf annehmen?" : "Wer darf helfen?"}</h1>
          {helpers > 1 && (
            <label className="flex items-start gap-3 rounded-3xl bg-white p-5">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-brand"
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
            <legend className="mb-2 text-sm font-bold">{isOffer ? "Wer darf annehmen?" : "Wer darf helfen?"}</legend>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(GENDER_PREF_LABEL).map(([v, label]) => (
                <button key={v} type="button" className={pill(genderPref === v)} onClick={() => setGenderPref(v)}>
                  {label}
                </button>
              ))}
            </div>
            {genderPref !== "any" && (
              <p className="mt-2 text-xs text-muted">Alle anderen sehen das gar nicht.</p>
            )}
          </fieldset>
          {isOrg && !isOffer && (
            <label className="flex items-start gap-3 rounded-3xl bg-white p-5">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-brand"
                checked={relievesStaff}
                onChange={(e) => setRelievesStaff(e.target.checked)}
              />
              <span>
                <b>Wäre sonst bei unserem Personal gelandet</b>
                <span className="block text-sm text-muted">Zählt in eurer Auswertung als entlastete Fachkraftstunde.</span>
              </span>
            </label>
          )}

          <div className={`rounded-3xl p-5 ${isOffer ? "bg-brand-soft" : "bg-accent-soft"}`}>
            <p className="text-sm font-bold text-muted">Zusammenfassung</p>
            <p className="mt-1 text-lg font-extrabold">
              {cat?.emoji} {title}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip>{isOffer ? "Angebot" : "Anfrage"}</Chip>
              <Chip>📅 {whenLabel()}</Chip>
              {!isLend && <Chip>{formatMinutes(minutes)}</Chip>}
              {isLend && lendUntil && <Chip>↩︎ bis {new Date(lendUntil).toLocaleDateString("de-DE")}</Chip>}
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
            <button type="button" className={`${btn.accent} flex-[1.4]`} disabled={busy} onClick={submit}>
              {busy ? "Wird gesendet …" : isOffer ? "Angebot veröffentlichen" : "Anfrage senden"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
