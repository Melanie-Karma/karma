"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ZoneProgress from "@/components/ZoneProgress";
import { animalFor } from "@/lib/animals";
import { getSupabase } from "@/lib/supabase";
import { REF_STORAGE_KEY, REFERRALS_FOR_FOUNDER, type OwnProfile } from "@/lib/types";
import { useZones } from "@/lib/useZones";

const PROFILE_COLUMNS =
  "id,username,referral_code,referral_count,referred_by,founder_aura,animal_stage,zone_id";

export default function Dashboard() {
  const router = useRouter();
  const { zones } = useZones();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [flyerBusy, setFlyerBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const loadProfile = useCallback(async (): Promise<OwnProfile | null> => {
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      router.replace("/");
      return null;
    }
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", auth.user.id)
      .maybeSingle();
    if (data) setProfile(data as OwnProfile);
    return (data as OwnProfile) ?? null;
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- navigator gibt es erst im Browser
    setCanShare(typeof navigator !== "undefined" && "share" in navigator);

    (async () => {
      try {
        const loaded = await loadProfile();
        if (!loaded) {
          setProblem("Dein Profil ist noch nicht bereit. Lade die Seite in ein paar Sekunden neu.");
          return;
        }

        // Einladungscode nachträglich einlösen, falls er beim Signup nicht mitkam
        let ref: string | null = null;
        try {
          ref = localStorage.getItem(REF_STORAGE_KEY);
          localStorage.removeItem(REF_STORAGE_KEY);
        } catch {
          /* ignorieren */
        }
        if (ref && !loaded.referred_by) {
          await getSupabase().rpc("claim_referral", { p_code: ref });
        }
      } catch (e) {
        setProblem((e as Error).message);
      }
    })();

    // Einladungsfortschritt aktualisieren, wenn man zur Seite zurückkommt
    const onFocus = () => void loadProfile().catch(() => {});
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadProfile]);

  async function chooseZone(zoneId: string) {
    if (!profile) return;
    const { error } = await getSupabase()
      .from("profiles")
      .update({ zone_id: zoneId })
      .eq("id", profile.id);
    if (error) setProblem("Die Zone konnte nicht gespeichert werden.");
    else await loadProfile();
  }

  async function logout() {
    await getSupabase().auth.signOut();
    router.replace("/");
  }

  if (problem) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <p role="alert" className="rounded-2xl bg-red-100 px-4 py-3 text-red-900">
          {problem}
        </p>
      </main>
    );
  }

  if (!profile || !zones) {
    return (
      <main className="mx-auto max-w-xl space-y-3 px-5 py-10" aria-busy>
        <div className="h-40 animate-pulse rounded-3xl bg-ink/5" />
        <div className="h-28 animate-pulse rounded-3xl bg-ink/5" />
      </main>
    );
  }

  const zone = zones.find((z) => z.id === profile.zone_id) ?? null;

  // Falls beim Signup keine Zone mitkam (z. B. späterer Google-Login)
  if (!zone) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <h1 className="text-3xl font-extrabold">Wo bist du unterwegs?</h1>
        <div className="mt-5 space-y-3">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => chooseZone(z.id)}
              className="block w-full rounded-3xl border-2 border-ink/10 bg-white p-4 text-left hover:border-forest"
            >
              <span className="mb-2 block font-bold">{z.name}</span>
              <ZoneProgress zone={z} />
            </button>
          ))}
        </div>
      </main>
    );
  }

  const animal = animalFor(profile.animal_stage);
  const inviteUrl = `${window.location.origin}/?ref=${profile.referral_code}&zone=${zone.slug}`;
  const missing = Math.max(zone.unlock_threshold - zone.member_count, 0);
  const invites = Math.min(profile.referral_count, REFERRALS_FOR_FOUNDER);
  const shareText =
    missing > 0
      ? `Ich schalte gerade Karma für ${zone.name} frei: schnelle Nachbarschaftshilfe per Swipe. Es fehlen noch ${missing}. Bist du dabei?`
      : `Karma ist für ${zone.name} gestartet: schnelle Nachbarschaftshilfe per Swipe. Komm dazu!`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Link kopieren:", inviteUrl);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "Karma", text: shareText, url: inviteUrl });
    } catch {
      /* abgebrochen */
    }
  }

  async function flyer() {
    setFlyerBusy(true);
    try {
      // jsPDF und QR-Code erst beim Klick laden, hält die Seite schlank
      const { downloadFlyer } = await import("@/lib/flyer");
      await downloadFlyer({ zoneName: zone!.name, inviteUrl, missing }, zone!.slug);
    } finally {
      setFlyerBusy(false);
    }
  }

  return (
    <main>
      <section className="rounded-b-[2.5rem] bg-forest px-5 pb-10 pt-5 text-white">
        <div className="mx-auto max-w-xl">
          <header className="flex items-center justify-between">
            <span className="rounded-full bg-lime px-4 py-1.5 text-sm font-extrabold tracking-wide text-ink">
              KARMA
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-sm font-semibold underline underline-offset-4"
            >
              Abmelden
            </button>
          </header>

          <div className="mt-8 flex items-center gap-4">
            <span
              className={`grid size-20 shrink-0 place-items-center rounded-full text-5xl ${
                profile.founder_aura
                  ? "bg-lime shadow-[0_0_0_8px_rgba(198,242,78,0.3)]"
                  : "bg-white/10"
              }`}
              role="img"
              aria-label={animal.name}
            >
              <span className="animate-float">{animal.emoji}</span>
            </span>
            <div>
              <p className="text-sm text-white/70">Du bist dabei als</p>
              <h1 className="text-3xl font-extrabold leading-tight">
                {animal.name}
                {profile.founder_aura && <span className="text-lime"> mit Gründer-Aura</span>}
              </h1>
            </div>
          </div>

          <div className="mt-8">
            <p className="mb-2 font-bold">{zone.name}</p>
            <ZoneProgress zone={zone} dark />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-xl px-5">
        {/* Referral-Fortschritt */}
        <section className="mt-8 rounded-3xl bg-white p-5">
          <h2 className="text-xl font-extrabold">
            {profile.founder_aura
              ? "Geschafft: Du startest als Schmetterling."
              : `Noch ${REFERRALS_FOR_FOUNDER - invites} bis zum Schmetterling`}
          </h2>
          <p className="mt-1 text-muted">
            {profile.founder_aura
              ? "Jede weitere Einladung bringt deine Zone schneller an den Start."
              : `Lade ${REFERRALS_FOR_FOUNDER} Leute ein und überspring die Amöbe. Es zählt, wer seine E-Mail bestätigt.`}
          </p>
          <div
            className="mt-4 flex gap-3"
            role="img"
            aria-label={`${invites} von ${REFERRALS_FOR_FOUNDER} Einladungen angenommen`}
          >
            {Array.from({ length: REFERRALS_FOR_FOUNDER }, (_, i) => (
              <span
                key={i}
                className={`grid h-14 flex-1 place-items-center rounded-2xl text-2xl ${
                  i < invites ? "bg-lime" : "border-2 border-dashed border-ink/20"
                }`}
              >
                {i < invites ? "🙌" : ""}
              </span>
            ))}
          </div>
          {profile.referral_count > REFERRALS_FOR_FOUNDER && (
            <p className="mt-3 text-sm font-semibold">
              Insgesamt eingeladen: {profile.referral_count}
            </p>
          )}
        </section>

        {/* Teilen */}
        <section className="mt-6" aria-labelledby="teilen">
          <h2 id="teilen" className="text-xl font-extrabold">
            Dein Einladungslink
          </h2>
          <button
            type="button"
            onClick={copyLink}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 text-left"
          >
            <span className="truncate font-mono text-sm">{inviteUrl.replace(/^https?:\/\//, "")}</span>
            <span className="shrink-0 text-sm font-bold">{copied ? "Kopiert ✓" : "Kopieren"}</span>
          </button>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {canShare && (
              <button
                type="button"
                onClick={nativeShare}
                className="col-span-2 rounded-2xl bg-lime px-4 py-4 text-lg font-extrabold shadow-[0_5px_0_0_var(--color-ink)] transition active:translate-y-1 active:shadow-none"
              >
                Link teilen
              </button>
            )}
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${inviteUrl}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-white px-4 py-4 text-center font-bold"
            >
              WhatsApp
            </a>
            <button
              type="button"
              onClick={flyer}
              disabled={flyerBusy}
              className="rounded-2xl bg-forest px-4 py-4 font-bold text-white disabled:opacity-60"
            >
              {flyerBusy ? "Erstelle PDF …" : "Aushang als PDF"}
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            Der Aushang ist ein A4-Blatt mit deinem persönlichen QR-Code. Ausdrucken, in den
            Hausflur oder ans Schwarze Brett hängen, fertig.
          </p>
        </section>
      </div>
    </main>
  );
}
