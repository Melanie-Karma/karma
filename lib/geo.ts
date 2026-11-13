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

/** Aktuellen Standort holen. Fällt auf den letzten bekannten oder Trebbin zurück. */
export function currentPosition(timeoutMs = 8000): Promise<{ pos: LatLng; precise: boolean }> {
  return new Promise((resolve) => {
    const fallback = () => resolve({ pos: lastKnownPosition() ?? TREBBIN, precise: false });
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
