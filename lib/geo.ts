export type LatLng = { lat: number; lng: number };

/** Marktplatz Trebbin, Ausweichpunkt wenn der Standort nicht freigegeben ist */
export const TREBBIN: LatLng = { lat: 52.2178, lng: 13.2248 };

const KEY = "karma_last_pos";

export function lastKnownPosition(): LatLng | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LatLng;
    return typeof p.lat === "number" && typeof p.lng === "number" ? p : null;
  } catch {
    return null;
  }
}

/** Aktuellen Standort holen. Fällt auf Heimatort, letzten bekannten Standort oder Trebbin zurück. */
export function currentPosition(
  timeoutMs = 8000,
  home: LatLng | null = null,
): Promise<{ pos: LatLng; precise: boolean }> {
  return new Promise((resolve) => {
    // Ohne Freigabe: eingegebener Heimatort, sonst letzter bekannter Standort, sonst Trebbin
    const fallback = () => resolve({ pos: home ?? lastKnownPosition() ?? TREBBIN, precise: false });
    if (typeof navigator === "undefined" || !navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        try {
          localStorage.setItem(KEY, JSON.stringify(pos));
        } catch {
          /* egal */
        }
        resolve({ pos, precise: true });
      },
      fallback,
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/**
 * Grober Ortsname zu einem Punkt (z. B. "Trebbin" oder "Glau (Trebbin)"), über OpenStreetMap.
 * Wird mit jeder Anfrage gespeichert, damit Helfende einschätzen können, wo es ist.
 */
export async function placeName(pos: LatLng): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&lat=${pos.lat}&lon=${pos.lng}`;
    const res = await fetch(url, { headers: { "Accept-Language": "de" } });
    if (!res.ok) return null;
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    const town = a.city ?? a.town ?? a.municipality;
    const local = a.village ?? a.hamlet ?? a.suburb ?? a.city_district;
    if (town && local && local !== town) return `${local} (${town})`;
    return town ?? local ?? null;
  } catch {
    return null;
  }
}
