"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useApp } from "@/components/app/AppShell";
import ProfileView from "@/components/app/ProfileView";
import { Sheet, Spinner, btn, card, input, useToast } from "@/components/ui";
import { animalFor, progressFor } from "@/lib/animals";
import { AGE_GROUPS, errorText, type Gender, type PublicProfile } from "@/lib/karma";
import { getSupabase } from "@/lib/supabase";

export default function MyProfile() {
  const { profile, reloadProfile } = useApp();
  const [pub, setPub] = useState<PublicProfile | null>(null);
  const [editOpen, setEditOpen] = useState(false);
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
    const url = window.location.origin;
    const text = "Ich teste gerade Karma, Nachbarschaftshilfe per Swipe hier in Trebbin. Machst du mit?";
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
    await downloadFlyer({ place: "Trebbin", inviteUrl: window.location.origin }, "trebbin");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-forest p-5 text-paper">
        <div className="flex items-center gap-4">
          <span
            className={`grid h-20 w-20 place-items-center rounded-full text-5xl ${profile.aura_active ? "bg-lime shadow-[0_0_0_8px_rgba(198,242,78,.3)]" : "bg-paper/10 opacity-70 grayscale"}`}
          >
            {animal.emoji}
          </span>
          <div className="flex-1">
            <p className="text-sm text-paper/70">Dein Tier</p>
            <p className="text-2xl font-extrabold">{animal.name}</p>
            <p className="font-bold text-lime">{profile.karma_points} Karma</p>
          </div>
        </div>
        {prog.next ? (
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-paper/15">
              <div className="h-full rounded-full bg-lime" style={{ width: `${Math.round(prog.ratio * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-paper/80">
              Noch {prog.missing} Karma bis {prog.next.emoji} {prog.next.name}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-paper/80">Höchste Stufe erreicht. Danke für so viel Hilfe!</p>
        )}
        {!profile.aura_active && (
          <p className="mt-3 rounded-2xl bg-paper/10 p-3 text-sm">
            Dein Tier ruht gerade. Es leuchtet wieder, sobald du jemandem hilfst.
          </p>
        )}
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

      {pub ? <ProfileView p={pub} hideAnimal /> : <Spinner />}

      <section className={`${card} space-y-3`}>
        <h2 className="font-extrabold">Nachbarn einladen</h2>
        <p className="text-sm text-muted">Je mehr mitmachen, desto schneller findet jede Anfrage Hilfe.</p>
        <div className="flex gap-3">
          <button type="button" className={`${btn.lime} flex-1`} onClick={invite}>
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
        <button type="button" className="underline" onClick={() => void getSupabase().auth.signOut()}>
          Abmelden
        </button>
      </section>

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
