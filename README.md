# Karma · Phase 1 (Kiez- & Campus-Unlock)

Warteliste mit Live-Counter pro Zone, Referral-Tracking und PDF-Aushang mit QR-Code.
Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase.

## In 15 Minuten live

1. **Supabase-Projekt anlegen** (Region Frankfurt).
2. **Migration einspielen:** Inhalt von `supabase/migrations/20261112000000_karma_init.sql`
   im SQL Editor ausführen (oder `supabase db push`). Legt PostGIS, pg_cron, alle Tabellen,
   Trigger, RLS, Storage-Buckets und drei Test-Zonen an.
3. **Auth einstellen** (Authentication > URL Configuration):
   - Site URL: deine Domain, z. B. `https://karma-app.vercel.app`
   - Redirect URLs: `https://karma-app.vercel.app/auth/confirm` und `http://localhost:3000/auth/confirm`
4. **Magic-Link-Mail anpassen** (Authentication > Email Templates > Magic Link). Wichtig,
   weil viele den Link am Handy öffnen, obwohl sie sich am Laptop angemeldet haben:
   ```html
   <h2>Dein Karma-Link</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard">Jetzt bestätigen</a></p>
   ```
   Gleiches für „Confirm signup“ mit `type=signup`.
5. **Eigenen SMTP-Versand** eintragen (z. B. Resend, Brevo). Der Supabase-Standard schickt
   nur wenige Mails pro Stunde, das reicht für keinen Uni-Testlauf.
6. **Lokal starten:**
   ```bash
   cp .env.example .env.local   # URL + Anon-Key eintragen
   npm install
   npm run dev
   ```
7. **Deploy:** Repo bei Vercel importieren, die beiden Env-Variablen setzen, fertig.

Zonen anpassen: Tabelle `zones` im Table Editor, Koordinaten als `POINT(länge breite)`.
Für den ersten Testlauf `unlock_threshold` realistisch setzen (siehe unten).

## Ablauf

```
/?ref=CODE&zone=tu-berlin   Einladungslink, speichert den Code lokal, wählt die Zone vor
  └─ E-Mail eintragen       signInWithOtp mit zone_slug + ref als Metadaten
     └─ Mail-Link            /auth/confirm → Session
        └─ DB-Trigger        Profil anlegen, Zone +1, Einlader +1 (erst nach Bestätigung)
           └─ /dashboard     Tier, Zonen-Fortschritt, 3er-Referral, Link teilen, PDF-Aushang
```

Der Counter läuft über `zones.member_count` (per Trigger gepflegt) und Supabase Realtime.
Beim 150. bestätigten Mitglied setzt die Datenbank `is_unlocked` automatisch.

## Ordnerstruktur (inkl. Phase 2)

```
app/
  page.tsx                  Phase 1 Landing
  dashboard/                Phase 1 Einladen + Aushang
  auth/confirm/route.ts     Magic-Link-Ziel
  impressum/ datenschutz/   Pflichtseiten (Platzhalter!)
  (app)/                    Phase 2, hinter Login + is_unlocked
    radar/                  Swipe-Deck (rpc nearby_requests, swipe)
    neu/                    Ticket erstellen
    chat/[matchId]/         Realtime-Chat, Abschluss (mark_help_done, confirm_help)
    profil/                 Tier-Vitrine, Share-Card
components/                 UI-Bausteine
lib/                        Supabase-Client, Typen, Tierstufen, PDF
supabase/migrations/        SQL
```

## Datenbank: was die Migration absichert

- **RLS überall.** `profiles` liest nur der Eigentümer (enthält Standort); andere sehen die
  View `public_profiles` ohne Standort und Referral-Daten.
- **Karma, Stufe, Aura, Referral-Zähler** sind für Nutzer nicht schreibbar, nur per Trigger.
- **Swipes und Matches** entstehen nur über RPCs (`swipe`, `accept_helper`, `mark_help_done`,
  `confirm_help`). Karma gibt es erst, wenn die anfragende Person bestätigt.
- **Swipe-Feed** (`nearby_requests`) liefert Entfernung auf 50 m gerundet, nie Koordinaten.
  Den genauen Ort sieht nur der akzeptierte Helfer.
- **Anti-Cheat:** gleiche Person in 7 Tagen → 2. Hilfe 25 %, ab der 3. Hilfe 10 % der Punkte.
- **Aura-Verfall** täglich 03:15 Uhr per pg_cron nach 14 Tagen ohne Hilfe.

Punkte: bis 15 Min = 10, bis 30 Min = 20, länger = 40, „Jetzt sofort“ +5.
Stufen ab 0 / 20 / 60 / 150 / 300 / 600 / 1000 Punkten.

## Vor dem Livegang

- Impressum und Datenschutzerklärung ausfüllen (Platzhalter unter `app/impressum`, `app/datenschutz`).
- Mail-Vorlage und SMTP wie oben, sonst kommen die Links nicht oder nur im selben Browser an.
