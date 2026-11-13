# Karma · Stufe 1 (Testphase Trebbin)

Nachbarschaftshilfe per Swipe. Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase.
Die Spezifikation steht in `docs/briefing.md` (Abschnitte 5.9 bis 5.13).

## Was Stufe 1 kann

- Anmeldung per Magic Link oder 6-stelligem Code, kein Passwort
- Willkommen-Seite: Vorname, Initial, freiwillig Geschlecht, Alter, Ortsteil, Regeln bestätigen (18+)
- Anfrage-Assistent in 5 Schritten: Kategorie, Textvorlage plus Freitext, Wann und wie lange
  (15 bis 120 Min.), einmalig oder wiederkehrend, vor Ort oder per Telefon/Video, Anzahl
  Helfende (mit „automatisch annehmen“), „Wer darf helfen?“ (alle, nur Frauen, nur Männer)
- Swipe-Feed mit Umkreis 2, 5, 10 (Standard) oder 20 km, Entfernung auf 50 m gerundet
- Anfrage-Detail: Angebote annehmen oder ablehnen, Gruppenchat in Echtzeit, Adresse nur für
  Angenommene, Helfer meldet „erledigt“, anfragende Person bestätigt Zeit, Sterne und Text
- Nach 24 Stunden ohne Bestätigung und ohne Meldung zählt automatisch die geschätzte Zeit
- Punkte: 10 je angefangene Viertelstunde, max. 4 Stunden; Tiere steigen nur auf,
  die Aura verblasst nach 14 Tagen ohne Hilfe
- Profil mit Foto, Tier, Hilfen, Stunden, Menschen, Bewertungen; Melden und Blockieren
- Bewertungen unter 3 Sternen landen automatisch in der Moderation
- Einladen per Teilen-Link oder A4-Aushang mit QR-Code

Bewusst noch nicht drin: Push, SMS-Verifizierung, Angebote ohne Anfrage, Familienfreigabe,
Träger-Auswertung, Badges, Share-Card.

## Supabase

Projekt „Karma“ (`zthhyfjsmlchssadhtbn`, Frankfurt). Die Migration
`supabase/migrations/20261113000000_stage1.sql` ist dort bereits eingespielt.
Die alten Entwürfe liegen in `supabase/archive/` und werden nicht mehr verwendet.
`supabase/tests_stage1.sql` ist der Ablauftest gegen eine lokale Postgres-Instanz.

### Einmalig im Supabase-Dashboard einstellen

1. **Authentication > URL Configuration**
   - Site URL: die spätere Adresse, z. B. `https://karma-trebbin.vercel.app`
   - Redirect URLs: `https://karma-trebbin.vercel.app/auth/confirm` und `http://localhost:3000/auth/confirm`
2. **Authentication > Email Templates > Magic Link** (damit Link und Code auch auf einem
   anderen Gerät funktionieren):
   ```html
   <h2>Dein Karma-Zugang</h2>
   <p>Tippe hier, um dich anzumelden:</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app">Bei Karma anmelden</a></p>
   <p>Oder gib diesen Code in der App ein: <b>{{ .Token }}</b></p>
   ```
   Dasselbe für **Confirm signup** mit `type=signup`.
3. **Authentication > SMTP Settings**: eigenen Versand eintragen (z. B. Resend oder Brevo).
   Der Supabase-Standard schickt nur wenige Mails pro Stunde, das reicht nicht für 30 Leute.

### Einrichtung oder Admin freischalten

```sql
-- Einrichtung (Altersheim, Hort, Verein) verifizieren
update public.profiles
   set account_type = 'organization', is_verified_org = true,
       organization_name = 'Seniorenheim Trebbin', verification_level = 2
 where id = (select id from auth.users where email = 'kontakt@einrichtung.de');

-- Dich selbst als Admin (sieht alle Meldungen)
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'deine@adresse.de');

-- Offene Meldungen ansehen
select * from public.reports where status = 'open' order by created_at desc;

-- Auswertung Test: Hilfen getrennt nach Einrichtung und Privat
select r.is_org_request, count(*) as hilfen, sum(r.final_minutes) / 60.0 as stunden,
       count(distinct h.helper_id) as helfende
  from public.help_requests r
  join public.request_helpers h on h.request_id = r.id and h.attended
 where r.status = 'completed'
 group by r.is_org_request;
```

## Lokal starten

```bash
cp .env.example .env.local   # URL + Publishable Key eintragen
npm install
npm run dev                  # http://localhost:3000
```

## Online stellen (Vercel)

Repo bei Vercel importieren, die beiden Variablen aus `.env.example` setzen, deployen.
Danach die Vercel-Adresse oben bei Site URL und Redirect URLs eintragen.

## Vor dem Teststart

- Impressum und Datenschutzerklärung ausfüllen (`app/impressum`, `app/datenschutz`).
- Mail-Vorlage und SMTP wie oben.
- Kurze Testvereinbarung für die Teilnehmenden (Testbetrieb, Feedback, Ansprechpartnerin).

## Ordnerstruktur

```
app/
  page.tsx                 Landing mit Anmeldung
  app/                     eingeloggter Bereich (Shell mit unterer Navigation)
    page.tsx               Swipe-Feed
    neu/                   Anfrage-Assistent
    meine/                 Meine Anfragen und Meine Hilfen
    anfrage/[id]/          Detail, Annehmen, Chat, Abschluss, Melden
    person/[id]/           Öffentliches Profil, Melden, Blockieren
    profil/                Eigenes Profil, Tier, Einladen, Aushang
    willkommen/            Onboarding und Regeln
  auth/confirm/route.ts    Ziel des Magic Links
  regeln/ impressum/ datenschutz/
components/                UI und Bildschirme
lib/                       Supabase-Client, Kategorien, Tiere, Standort, Regeln, PDF
supabase/                  Migration, Test, Archiv
```
