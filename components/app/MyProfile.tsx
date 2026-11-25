"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useApp } from "@/components/app/AppShell";
import ProfileView from "@/components/app/ProfileView";
import HomeLocation from "@/components/app/HomeLocation";
import PushSettings from "@/components/app/PushSettings";
import { disablePushOnDevice } from "@/lib/push";
import { AnimalBubble, Sheet, Spinner, StreakFlame, btn, card, input, useToast } from "@/components/ui";
import { ANIMALS, animalFor, progressFor, streakFor } from "@/lib/animals";
import { AGE_GROUPS, errorText, type Gender, type PublicProfile } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

export default function MyProfile() {
  const { profile, reloadProfile } = useApp();
  const [pub, setPub] = useState<PublicProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast, toastNode } = useToast();

  const loadPublic = useCallback(async () => {
    const { data } = await getSupabase().from("public_profiles").select("*").eq("id", profile.id).maybeSingle();
    setPub((data as PublicProfile) ?? null);
  }, [profile.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initiales Laden
    void loadPublic();
  }, [loadPublic, profile]);

  const animal = animalFor(profile.animal_stage);
  const prog = progressFor(profile.karma_points, profile.animal_stage);
  const streak = streakFor(profile.streak_weeks, profile.streak_week);
  const [referrals, setReferrals] = useState(0);
  useEffect(() => {
    void getSupabase()
      .rpc("my_referrals")
      .then(({ data }) => setReferrals(Number(data ?? 0)));
  }, []);

  async function uploadAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast("Bitte ein Bild unter 5 MB wählen.");
      return;
    }
    setUploading(true);
    const supabase = getSupabase();
    const blob = await shrink(file);
    const path = `${profile.id}/avatar-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) {
      setUploading(false);
      toast("Upload hat nicht geklappt.");
      return;
    }
    const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    setUploading(false);
    await reloadProfile();
    toast("Foto gespeichert.");
  }

  async function invite() {
    const url = `${window.location.origin}/?ref=${profile.id}`;
    const text = "Ich teste gerade Karma: Menschen helfen Menschen, hier in Trebbin. Machst du mit?";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Karma", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast("Link kopiert.");
    } catch {
      /* abgebrochen */
    }
  }

  async function flyer() {
    const { downloadFlyer } = await import("@/lib/flyer");
    await downloadFlyer({ place: "Trebbin", inviteUrl: `${window.location.origin}/?ref=${profile.id}` }, "trebbin");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-brand p-5 text-paper">
        <div className="flex items-center gap-4">
          <AnimalBubble animal={animal} aura={profile.aura_active} size={46} />
          <div className="flex-1">
            <p className="text-sm text-paper/70">Dein Tier</p>
            <p className="text-2xl font-extrabold">{animal.name}</p>
            <p className="font-bold text-sun">{profile.karma_points} Karma-Punkte</p>
          </div>
        </div>
        {prog.next ? (
          <div className="mt-4">
            <div className="h-3 overflow-hidden rounded-full bg-paper/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sun to-accent"
                style={{ width: `${Math.max(4, Math.round(prog.ratio * 100))}%` }}
              />
            </div>
            <p className="mt-2 text-sm">
              Noch <b className="text-sun">{prog.missing} Karma-Punkte</b> bis {prog.next.emoji} <b>{prog.next.name}</b>{" "}
              <span className="text-paper/70">(ab {prog.next.from})</span>
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-paper/80">Höchste Stufe erreicht. Danke für so viel Hilfe!</p>
        )}
        <ol className="-mx-5 mt-4 flex gap-3 overflow-x-auto px-5 pb-1" aria-label="Alle Tiere">
          {ANIMALS.map((a) => (
            <li key={a.stage} className="flex flex-col items-center gap-1">
              <AnimalBubble animal={a} size={15} aura={a.stage === profile.animal_stage} dim={a.stage > profile.animal_stage} />
              <span className={`text-[10px] font-bold ${a.stage === profile.animal_stage ? "text-sun" : "text-paper/60"}`}>
                {a.from}
              </span>
            </li>
          ))}
        </ol>
        {!profile.aura_active && (
          <p className="mt-3 rounded-2xl bg-paper/10 p-3 text-sm">
            Dein Tier ist müde und grau geworden. Hilf jemandem oder biete etwas an, dann wird es wieder munter.
          </p>
        )}
      </section>

      <section className="flex items-center gap-4 rounded-3xl bg-white p-5">
        <span className="grid h-16 w-16 place-items-center">
          <StreakFlame weeks={streak.weeks} size={34} />
        </span>
        <div className="flex-1">
          {streak.weeks > 0 ? (
            <>
              <p className="text-xl font-extrabold text-ink">
                {streak.weeks} {streak.weeks === 1 ? "Woche" : "Wochen"} in Folge
              </p>
              <p className="text-sm text-muted">
                {streak.thisWeek
                  ? "Diese Woche hast du schon geholfen. Deine Flamme brennt."
                  : "Hilf diese Woche jemandem, sonst erlischt deine Flamme am Sonntag."}
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-extrabold text-ink">Noch keine Flamme</p>
              <p className="text-sm text-muted">
                Hilf jede Woche mindestens einmal, dann wächst deine Flamme von Woche zu Woche.
              </p>
            </>
          )}
        </div>
      </section>

      <div className="flex gap-3">
        <label className={`${btn.ghost} flex-1 cursor-pointer`}>
          {uploading ? "Lädt …" : "📷 Foto"}
          <input type="file" accept="image/*" className="sr-only" onChange={uploadAvatar} disabled={uploading} />
        </label>
        <button type="button" className={`${btn.ghost} flex-1`} onClick={() => setEditOpen(true)}>
          ✏️ Bearbeiten
        </button>
      </div>

      <PushSettings />

      <HomeLocation />

      <section className={`${card} flex items-center justify-between gap-3`}>
        <div>
          <h2 className="font-extrabold">In der Nachbarschafts-Rangliste zeigen</h2>
          <p className="text-sm text-muted">Vorname, Tier und Punkte sehen Nachbarn in deinem Umkreis.</p>
          <Link href="/app/nachbarn" className="text-sm font-bold underline">
            🏆 Zur Rangliste
          </Link>
        </div>
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--color-brand)]"
          checked={profile.show_in_board}
          onChange={async (e) => {
            await getSupabase().from("profiles").update({ show_in_board: e.target.checked }).eq("id", profile.id);
            await reloadProfile();
          }}
          aria-label="In der Rangliste zeigen"
        />
      </section>

      {pub ? <ProfileView p={pub} hideAnimal /> : <Spinner />}

      <section className={`${card} space-y-3`}>
        <h2 className="font-extrabold">Nachbarn einladen</h2>
        <p className="text-sm text-muted">
          Für jede Person, die über deinen Link mitmacht, bekommst du <b className="text-ink">2 Karma-Punkte</b>.
          {referrals > 0 && (
            <>
              {" "}
              Bisher: <b className="text-ink">{referrals}</b> {referrals === 1 ? "Person" : "Personen"}.
            </>
          )}
        </p>
        <div className="flex gap-3">
          <button type="button" className={`${btn.accent} flex-1`} onClick={invite}>
            Link teilen
          </button>
          <button type="button" className={`${btn.ghost} flex-1`} onClick={flyer}>
            Aushang (PDF)
          </button>
        </div>
      </section>

      <section className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-sm text-muted">
        <Link href="/regeln" className="underline">
          Regeln
        </Link>
        <Link href="/datenschutz" className="underline">
          Datenschutz
        </Link>
        <Link href="/impressum" className="underline">
          Impressum
        </Link>
        <Link href="/nutzungsbedingungen" className="underline">
          Nutzungsbedingungen
        </Link>
        <button type="button" className="underline" onClick={() => void getSupabase().auth.signOut()}>
          Abmelden
        </button>
        <button type="button" className="underline" onClick={() => setDeleteOpen(true)}>
          Konto löschen
        </button>
      </section>

      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} userId={profile.id} />

      <EditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          setEditOpen(false);
          await reloadProfile();
          toast("Gespeichert.");
        }}
      />
      {toastNode}
    </div>
  );
}

/** Konto endgültig löschen: Foto, Push auf diesem Gerät, dann alles in der Datenbank */
function DeleteAccountSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    try {
      const { data: files } = await supabase.storage.from("avatars").list(userId);
      if (files?.length) {
        await supabase.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
      }
    } catch {
      /* Foto egal, Konto trotzdem löschen */
    }
    try {
      await disablePushOnDevice();
    } catch {
      /* egal */
    }
    const { error: rpcError } = await supabase.rpc("delete_my_account");
    if (rpcError) {
      setBusy(false);
      setError("Das hat nicht geklappt. Bitte versuch es nochmal oder schreib uns an kontakt@meinguteskarma.de.");
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("karma_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* kein Speicher verfügbar */
    }
    window.location.replace("/?konto=geloescht");
  }

  function close() {
    if (busy) return;
    setStep(1);
    setConfirmText("");
    setError(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title="Konto löschen">
      {step === 1 ? (
        <>
          <p className="text-ink/80">Wenn du dein Konto löschst, ist sofort und endgültig weg:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
            <li>dein Profil mit Foto, dein Tier und deine Karma-Punkte</li>
            <li>deine Anfragen und Angebote</li>
            <li>deine Chatnachrichten</li>
          </ul>
          <p className="mt-3 text-ink/80">
            Bewertungen, die du anderen gegeben hast, bleiben bei ihnen stehen, aber ohne deinen Namen. Dort steht
            dann „Ehemaliges Mitglied“. Erledigte Hilfen zählen ohne Namen weiter in unserer Statistik.
          </p>
          <p className="mt-3 font-bold">Das lässt sich nicht rückgängig machen.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" className={`${btn.primary} flex-1`} onClick={close}>
              Behalten
            </button>
            <button type="button" className={`${btn.danger} flex-1`} onClick={() => setStep(2)}>
              Weiter
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-extrabold">Bist du dir ganz sicher?</h2>
          <p className="mt-3 text-ink/80">
            Letzter Schritt. Tippe LÖSCHEN ein und bestätige. Danach ist dein Konto weg.
          </p>
          <label className="mt-5 block">
            <span className="mb-1 block text-sm font-bold">Zum Bestätigen tippe LÖSCHEN</span>
            <input
              className={input}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm font-bold">
              {error}
            </p>
          )}
          <div className="mt-5 flex gap-3">
            <button type="button" className={`${btn.primary} flex-1`} onClick={close} disabled={busy}>
              Abbrechen
            </button>
            <button
              type="button"
              className={`${btn.danger} flex-1`}
              onClick={() => void deleteAccount()}
              disabled={busy || confirmText.trim().toUpperCase() !== "LÖSCHEN"}
            >
              {busy ? "Wird gelöscht …" : "Endgültig löschen"}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Bild auf max. 512 px verkleinern und als JPEG speichern */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

function EditSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { profile } = useApp();
  const [f, setF] = useState({
    first_name: profile.first_name ?? "",
    last_initial: profile.last_initial ?? "",
    gender: (profile.gender ?? "") as Gender | "",
    age_group: profile.age_group ?? "",
    district: profile.district ?? "",
    languages: profile.languages.join(", "),
    about: profile.about ?? "",
    skills: profile.skills.join(", "),
    availability: profile.availability ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("profiles")
      .update({
        first_name: f.first_name.trim(),
        last_initial: f.last_initial.trim().toUpperCase() || null,
        gender: f.gender || null,
        age_group: f.age_group || null,
        district: f.district.trim() || null,
        languages: list(f.languages),
        about: f.about.trim() || null,
        skills: list(f.skills),
        availability: f.availability.trim() || null,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (err) {
      setError(errorText(err));
      return;
    }
    onSaved();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Profil bearbeiten">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Vorname">
            <input className={input} maxLength={30} value={f.first_name} onChange={set("first_name")} />
          </Field>
          <Field label="Nachname">
            <input className={`${input} text-center`} maxLength={1} value={f.last_initial} onChange={set("last_initial")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Geschlecht">
            <select className={input} value={f.gender} onChange={set("gender")}>
              <option value="">Keine Angabe</option>
              <option value="female">Frau</option>
              <option value="male">Mann</option>
            </select>
          </Field>
          <Field label="Alter">
            <select className={input} value={f.age_group} onChange={set("age_group")}>
              <option value="">Keine Angabe</option>
              {AGE_GROUPS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Ortsteil">
          <input className={input} maxLength={60} value={f.district} onChange={set("district")} />
        </Field>
        <Field label="Sprachen (mit Komma)">
          <input className={input} value={f.languages} onChange={set("languages")} placeholder="Deutsch, Englisch" />
        </Field>
        <Field label="Das kann ich gut (mit Komma)">
          <input className={input} value={f.skills} onChange={set("skills")} placeholder="Handy, Garten, Auto" />
        </Field>
        <Field label="Wann hast du meistens Zeit?">
          <input className={input} maxLength={120} value={f.availability} onChange={set("availability")} placeholder="z. B. abends und am Wochenende" />
        </Field>
        <Field label="Über mich">
          <textarea className={`${input} min-h-24`} maxLength={300} value={f.about} onChange={set("about")} />
        </Field>
        <p className="text-xs text-muted">
          Adresse, Telefonnummer und Nachname zeigen wir nie im Profil. Bitte trag sie auch hier nicht ein.
        </p>
        {error && <p className="text-sm font-bold text-red-800">{error}</p>}
        <button type="button" className={`${btn.primary} w-full`} disabled={busy || !f.first_name.trim()} onClick={save}>
          {busy ? "Speichert …" : "Speichern"}
        </button>
      </div>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold">{label}</span>
      {children}
    </label>
  );
}
