"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { ZONE_COLUMNS, type Zone } from "./types";

/** Lädt alle Zonen und hält die Zähler per Supabase Realtime aktuell. */
export function useZones() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let supabase;
    try {
      supabase = getSupabase();
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalige Konfigurationsmeldung
      setError((e as Error).message);
      return;
    }

    let active = true;
    supabase
      .from("zones")
      .select(ZONE_COLUMNS)
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setError("Die Zonen konnten nicht geladen werden.");
        else setZones(data as Zone[]);
      });

    const channel = supabase
      .channel("zones-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "zones" },
        (payload) => {
          const next = payload.new as Zone;
          setZones((prev) =>
            prev ? prev.map((z) => (z.id === next.id ? { ...z, ...next } : z)) : prev,
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { zones, error };
}
