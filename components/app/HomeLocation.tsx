"use client";

import { useState, type FormEvent } from "react";
import { useApp } from "@/components/app/AppShell";
import { btn, card, input } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

type Hit = { lat: number; lng: number; label: string };

/** Ort per OpenStreetMap suchen (nur Deutschland) */
async function geocode(q: string): Promise<Hit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=de&limit=1&addressdetails=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string>;
  }>;
  const h = data[0];
  if (!h) return null;
  const a = h.address ?? {};
  const place = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? h.display_name.split(",")[0];
  const label = [a.postcode, place].filter(Boolean).join(" ");
  return { lat: Number(h.lat), lng: Number(h.lon), label: label || h.display_name.split(",")[0] };
}

/**
 * Heimatort: gilt für Feed und Push-Nachrichten, wenn der Standort nicht freigegeben ist
 * oder länger als 3 Tage nicht aktualisiert wurde.
 */
export default function HomeLocation({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const { profile, reloadProfile } = useApp();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(hit: Hit) {
    const { error } = await getSupabase().rpc("set_home_location", {
      p_lat: hit.lat,
      p_lng: hit.lng,
      p_label: hit.label,
    });
    if (error) {
      setMsg("Speichern hat nicht geklappt.");
      return false;
    }
    await reloadProfile();
    setMsg(`Gespeichert: ${hit.label}`);
    setQ("");
    onSaved?.();
    return true;
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      const hit = await geocode(q.trim());
      if (!hit) setMsg("Ort nicht gefunden. Versuch es mit Postleitzahl und Ort.");
      else await save(hit);
    } catch {
      setMsg("Suche hat nicht geklappt. Bitte später nochmal.");
    }
    setBusy(false);
  }

  function useCurrent() {
    if (!navigator.geolocation) {
      setMsg("Dein Gerät gibt keinen Standort heraus.");
      return;
    }
    setBusy(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        await save({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Mein Standort" });
        setBusy(false);
      },
      () => {
        setMsg("Standort nicht freigegeben. Gib einfach Postleitzahl und Ort ein.");
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <section id="zuhause" className={`${card} space-y-3`}>
      {!compact && (
        <div>
          <h2 className="font-extrabold">Dein Heimatort</h2>
          <p className="text-sm text-muted">
            Wenn dein Standort aus ist, zeigen wir dir Anfragen und Nachrichten rund um diesen Ort.
          </p>
        </div>
      )}
      <p className="text-sm">
        Aktuell: <b>{profile.home_label ?? "noch nicht festgelegt"}</b>
      </p>
      <form onSubmit={search} className="flex gap-2">
        <input
          className={`${input} flex-1`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="PLZ und Ort, z. B. 14959 Trebbin"
          autoComplete="postal-code"
        />
        <button className={btn.primary} disabled={busy || q.trim().length < 3}>
          {busy ? "…" : "Speichern"}
        </button>
      </form>
      <button type="button" className="text-sm font-bold underline" onClick={useCurrent} disabled={busy}>
        📍 Aktuellen Standort als Heimatort nehmen
      </button>
      {msg && <p className="text-sm font-bold">{msg}</p>}
      <p className="text-xs text-muted">Ortssuche über OpenStreetMap.</p>
    </section>
  );
}
