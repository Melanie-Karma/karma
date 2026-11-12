import type { Zone } from "@/lib/types";

export default function ZoneProgress({ zone, dark = false }: { zone: Zone; dark?: boolean }) {
  const missing = Math.max(zone.unlock_threshold - zone.member_count, 0);
  const pct = Math.min((zone.member_count / zone.unlock_threshold) * 100, 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-extrabold tabular-nums">
          {zone.member_count}
          <span className={dark ? "text-white/60" : "text-muted"}> / {zone.unlock_threshold}</span>
        </span>
        <span className="text-sm font-semibold">
          {zone.is_unlocked ? "Freigeschaltet 🎉" : `noch ${missing} bis zum Start`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Fortschritt ${zone.name}`}
        aria-valuemin={0}
        aria-valuemax={zone.unlock_threshold}
        aria-valuenow={Math.min(zone.member_count, zone.unlock_threshold)}
        className={`mt-2 h-3 overflow-hidden rounded-full ${dark ? "bg-white/15" : "bg-ink/10"}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${dark ? "bg-lime" : "bg-forest"}`}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
    </div>
  );
}
