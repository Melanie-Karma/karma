"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useApp } from "@/components/app/AppShell";
import { btn, input } from "@/components/ui";
import { AGE_GROUPS, errorText, type Gender } from "@/lib/karma";
import { RULES } from "@/lib/rules";
import { getSupabase } from "@/lib/supabase";

export default function Page() {
  const router = useRouter();
  const { profile, reloadProfile } = useApp();
  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [initial, setInitial] = useState(profile.last_initial ?? "");
  const [gender, setGender] = useState<Gender | "">(profile.gender ?? "");
  const [ageGroup, setAgeGroup] = useState(profile.age_group ?? "");
  const [district, setDistrict] = useState(profile.district ?? "Trebbin");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_initial: initial.trim().toUpperCase() || null,
        gender: gender || null,
        age_group: ageGroup || null,
        district: district.trim() || null,
      })
      .eq("id", profile.id);
    if (upErr) {
      setBusy(false);
      setError(errorText(upErr));
      return;
    }
    const { error: termsErr } = await supabase.rpc("accept_terms");
    if (termsErr) {
      setBusy(false);
      setError(errorText(termsErr));
      return;
    }
    await reloadProfile();
    router.replace("/app");
  }

  return (
    <form onSubmit={submit} className="space-y-6 pt-4">
      <div>
        <p className="text-sm font-bold text-muted">Willkommen bei Karma</p>
        <h1 className="mt-1 text-3xl font-extrabold text-forest">Kurz vorstellen, dann geht es los</h1>
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Vorname</span>
          <input className={input} required maxLength={30} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Nachname</span>
          <input
            className={`${input} text-center`}
            maxLength={1}
            placeholder="B"
            value={initial}
            onChange={(e) => setInitial(e.target.value.replace(/[^a-zA-ZäöüÄÖÜ]/g, "").toUpperCase())}
            aria-describedby="initial-hint"
          />
        </label>
      </div>
      <p id="initial-hint" className="-mt-4 text-xs text-muted">
        Vom Nachnamen zeigen wir nur den ersten Buchstaben, z. B. „Melanie B.“.
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-bold">Geschlecht (freiwillig)</legend>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["female", "Frau"],
              ["male", "Mann"],
              ["", "Keine Angabe"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setGender(v)}
              className={`rounded-full px-4 py-2 font-bold ${gender === v ? "bg-forest text-paper" : "bg-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Manche Anfragen sind nur für Frauen oder nur für Männer. Die siehst du nur mit passender Angabe.
        </p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Alter (freiwillig)</span>
          <select className={input} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
            <option value="">Keine Angabe</option>
            {AGE_GROUPS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Ortsteil</span>
          <input className={input} maxLength={60} value={district} onChange={(e) => setDistrict(e.target.value)} />
        </label>
      </div>

      <section className="rounded-3xl bg-white p-5">
        <h2 className="font-extrabold">Unsere Regeln</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {RULES.map((r) => (
            <li key={r.title}>
              <b>{r.title}.</b> <span className="text-muted">{r.text}</span>
            </li>
          ))}
        </ul>
        <label className="mt-4 flex items-start gap-3 rounded-2xl bg-lime/50 p-3 font-bold">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 accent-forest"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            required
          />
          Ich bin mindestens 18 Jahre alt und halte mich an diese Regeln.
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}
      <button className={`${btn.primary} w-full`} disabled={busy || !accepted || !firstName.trim()}>
        {busy ? "Speichert …" : "Los geht's"}
      </button>
    </form>
  );
}
