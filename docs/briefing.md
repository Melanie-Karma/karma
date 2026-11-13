# Projekt-Briefing: "Karma" · Gamifizierte hyperlokale Nachbarschaftshilfe (PWA / Mobile App)

Stand: 13.11.2026 · ergänzt um Non-Profit-Partner, Bumerang-Effekt, Sammel-Badges sowie Abschnitt 5 (Anforderungen vom 13.11.2026)

## 1. Produktvision & Kernkonzept
"Karma" ist ein gamifiziertes Echtzeit-Hilfesystem für Nachbarschaften, Bezirke und Uni-Campus-Umgebungen ("Tinder meets Uber für schnelle Alltagshilfe").
Im Gegensatz zu klassischen Nachbarschafts-Foren (wie nebenan.de) gibt es keinen Newsfeed, keinen Tratsch und keine Postkarten-Verifizierung. Alles basiert auf dem aktuellen GPS-Radius des Nutzers (offen für Anwohner, Studierende, Pendler und Besucher).

### Kern-Mechanik
1. **Hilfe anfragen:** Ein Nutzer erstellt in unter 30 Sekunden ein konkretes Hilfe-Ticket (Was wird gebraucht? Wann/Zeitfenster? Ungefähre Dauer? GPS-Standort).
2. **Tinder-Swipe-Radar:** Alle aktiven Nutzer im definierten Umkreis (z. B. 1 bis 5 km) sehen offene Anfragen als Karten-Stack:
   - **Swipe rechts:** "Ich helfe / Angebot senden" → Match entsteht, direkter 1:1-Chat öffnet sich.
   - **Swipe links:** "Kann gerade nicht" → Karte verschwindet für diesen Nutzer.
3. **Abschluss & Bewertung:** Nach erledigter Hilfe bestätigen beide Seiten den Abschluss (oder per QR-Code-Scan vor Ort), vergeben ein "Danke" und eine kurze Bewertung.
4. **Karma-Evolution & Gamification:**
   - Jede erfolgreich geleistete Hilfe bringt Karma-Punkte und lässt den persönlichen Tier-Avatar evolvieren:
     `Stufe 1: Amöbe` → `Stufe 2: Ameise` → `Stufe 3: Regenwurm` → `Stufe 4: Schmetterling` → `Stufe 5: Singvogel` → `Stufe 6: Falke` → `Stufe 7: Adler / Phönix`.
   - **Schutz vor De-Evolutions-Frust:** Das erreichte Basistier bleibt dauerhaft erhalten. Bei Inaktivität (mehr als 14 Tage ohne Hilfe) verliert das Tier seinen "Energie-/Aura-Status" (wird müde/grau) und strahlt sofort wieder nach der nächsten Hilfe.
   - **Anti-Cheat:** Wiederholte Hilfen für dieselbe Privatperson innerhalb von 7 Tagen geben stark reduzierte Punkte (Diminishing Returns). Ausnahme: verifizierte Non-Profits (siehe 1.6).
5. **Social-Share-Loop (Viralität):** Nach jeder abgeschlossenen Hilfe oder Tier-Evolution generiert die App eine visuelle "Share-Card" (9:16 für Instagram Stories & TikTok) mit Tier-Avatar, erledigter Aufgabe, Bezirk/Campus und persönlichem Einladungs-QR-Code.
   - Bei Hilfen für Privatpersonen zeigt die Karte nur die **Kategorie** (z. B. "Tragehilfe"), nie den Titel der Anfrage. Ein Titel wie "Begleitung zum Arzt" plus Bezirk wäre öffentlich ein Datenschutzproblem für die Person, der geholfen wurde.
   - Bei Non-Profit-Hilfen zeigt die Karte Titel und Organisations-Badge prominent (siehe 1.6).

### 1.6 Verifizierte Non-Profit-Organisationen (Tierheime, Tafel, Obdachlosenhilfe)
- **Account-Typ:** Organisationen nutzen dieselbe App ohne separates Portal, erhalten aber den Status `nonprofit` mit sichtbarem **Herz-Badge** und ihrem Organisationsnamen (z. B. ein Tierheim oder eine Tafel).
- **Verifizierung:** Nur durch das Karma-Team (Admin). Organisationen können sich nicht selbst freischalten, ihren Namen nach der Verifizierung nicht selbst ändern und ihren Status nicht selbst setzen. Name und Kategorie sind erst nach der Verifizierung öffentlich sichtbar.
- **Kategorie:** Jede Organisation erhält eine Kategorie: `animal_welfare` (Tierheim, Tierschutz), `social` (Tafel, Obdachlosenhilfe, Kältebus) oder `other`. Die Kategorie entscheidet, welches Sammel-Badge eine Hilfe zählt.
- **Swipe-Deck-Darstellung:** Karten von Non-Profits erhalten einen dezenten goldenen/grünen Rahmen, das Herz-Badge mit Organisationsnamen und den Hinweis "2x Karma".
- **Punkte:** Bei Abschluss **2x Karma-Punkte** (`karma_multiplier = 2`).
- **Kein Anti-Cheat-Limit:** Die 7-Tage-Diminishing-Returns-Regel greift bei Non-Profits nicht, damit Nutzer regelmäßig z. B. Gassi gehen oder bei der Tafel helfen können.
- **Social-Share-Card:** Bei Non-Profit-Hilfen wird das Organisations-Badge prominent auf der 9:16 Share-Card angezeigt.

### 1.7 Der "Bumerang-Effekt" (Top-Helfer-Priorität)
- Nutzer ab **50 Karma-Punkten** erhalten bei eigenen Hilfsanfragen automatisch ein sichtbares **"Top-Helfer sucht Hilfe"-Badge** auf ihrer Swipe-Karte (`requester_is_top_helper = true`). Das soll Vertrauen und Antwortgeschwindigkeit erhöhen.
- Grundlage sind bewusst die Punkte und nicht die Tier-Stufe: Stufe 4 (Schmetterling) ist über die Gründer-Aura auch mit 3 Einladungen erreichbar, ganz ohne geholfen zu haben. Punkte gibt es nur für bestätigte Hilfe. 50 Punkte entsprechen etwa 3 bis 5 Hilfen.
- Der Status wird beim Anlegen der Anfrage festgehalten. Organisationen bekommen das Badge nicht, sie haben bereits das Herz-Badge.

### 1.8 Sammel-Badges (Langzeit-Motivation)
Zusätzlich zur Tier-Evolution sammeln Nutzer thematische Meilenstein-Abzeichen im Profil. Ein Badge geht nie wieder verloren.

| Badge | Bedingung |
|---|---|
| `animal_lover` | 3 bestätigte Hilfen für verifizierte Tierschutz-Organisationen |
| `social_angel` | 3 bestätigte Hilfen für verifizierte soziale Organisationen (Tafel, Obdachlosenhilfe, Kältebus) |
| `kiez_hero` | 5 bestätigte Nachbarschaftshilfen im selben Bezirk, für 5 verschiedene Personen |
| `night_owl` | eine Hilfe zwischen 21:00 und 06:00 Uhr (Berliner Zeit, gemessen am Zeitpunkt "Hilfe erledigt" des Helfers) |

`kiez_hero` zählt verschiedene Personen, sonst ließe sich das Badge mit einem Freund erspielen, der fünfmal anfragt.

---

## 2. Entwicklungs-Roadmap (2-Phasen-Architektur)

Wir bauen das System modular in zwei sofort nutzbaren Ausbaustufen auf:

### Phase 1: Virale "Kiez- & Campus-Unlock"-Warteliste (48h-Validierungs-MVP)
Bevor der Swipe-Feed für eine Zone live geht, sammelt die App kritische Masse pro Standort:
- **Standort-/Campus-Auswahl:** Nutzer wählen ihre Uni oder ihren Bezirk (z. B. "TU Berlin", "HU Berlin", "Prenzlauer Berg").
- **Live-Fortschrittsbalken:** Zeigt an, wie viele Nutzer noch fehlen, bis die Zone freigeschaltet wird (z. B. `112 / 150 Helfer, noch 38 bis zum Campus-Start!`).
- **Referral-Mechanik:** Jeder Nutzer erhält nach Anmeldung (Magic Link / E-Mail) einen persönlichen Invite-Link (`karma.app/?ref=CODE`) sowie ein automatisch generiertes **1-Klick-PDF für den Hausflur/Campus-Aushang** mit individuellem QR-Code.
- **Incentive:** Wer 3 Freunde über seinen Link einlädt, überspringt die Amöbe und startet zum Launch direkt als `Schmetterling` (Stufe 4) mit "Gründer-Aura".

### Phase 2: Die Core-App (Swipe-Radar, Match-Chat & Karma-System)
Sobald eine Zone freigeschaltet ist (oder für Beta-Tester), greift die Haupt-App:
- **Onboarding (30 Sek.):** Name/Nickname, Profilfoto, optional Skill-/Werkzeug-Tags (`Auto/Transporter`, `Werkzeug/Bohrmaschine`, `Tragehilfe`, `Einkauf`, `Technik`, `Hund/Tier`).
- **Home / Swipe-Deck:** Kartenansicht offener Anfragen im gewählten Radius (Slider 500 m bis 5 km), sortiert nach Dringlichkeit und Entfernung.
  - Non-Profit-Karten: goldener/grüner Rahmen, Herz-Badge mit Organisationsname, "2x Karma".
  - Top-Helfer-Karten: Badge "Top-Helfer sucht Hilfe".
- **Ticket erstellen (+ Button):** Kategorie wählen, Kurztitel (max. 80 Zeichen), Zeitfenster (`Jetzt sofort`, `Heute`, `Morgen`, `Datum wählen`), geschätzter Zeitaufwand (`15 Min`, `30 Min`, `1 Std+`).
- **Match & Echtzeit-Chat:** Bei Swipe rechts wird der Anfragende benachrichtigt und kann den Helfer akzeptieren → 1:1-Chat (Supabase Realtime) + Standort-Detailfreigabe + "Hilfe abschließen"-Button.
- **Profil & Tier-Vitrine:** Aktueller Tier-Avatar, Aura-Status, Karma-Punkte, erledigte Hilfen, Danke-Bewertungen, **Sammel-Badges** (erreichte farbig, offene ausgegraut mit Fortschritt) und "Share-Card erstellen"-Button. Organisationen zeigen Herz-Badge und Organisationsnamen.

---

## 3. Tech-Stack & Architektur-Vorgaben
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS + Framer Motion (für flüssige Swipe-Gesten und Tier-Evolutions-Animationen), konfiguriert als **Progressive Web App (PWA)** mit Web-Push-Notifications.
- **Backend & Auth:** Supabase (PostgreSQL, PostGIS für schnelle GPS-Umkreissuchen, Supabase Auth mit Magic Link / Google / Apple Login, Supabase Realtime für Chat & Live-Counter).
- **Storage:** Supabase Storage (für Profilbilder und generierte Social-Share-Cards).
- **Grundsatz:** Alles, was Punkte, Stufen, Badges oder Vertrauen beeinflusst (Karma, Multiplikator, Top-Helfer, Verifizierung), berechnet ausschließlich die Datenbank. Der Client kann diese Felder nicht schreiben.

---

## 4. Datenbank-Schema (Supabase / PostgreSQL + PostGIS)

Umgesetzt in `supabase/migrations/` (Basis + Delta vom 12.11.2026), inkl. Row Level Security.

1. `profiles`
   - `id` (uuid, PK, ref auth.users)
   - `username` (text)
   - `avatar_url` (text)
   - `skills` (text[], z. B. ['car', 'tools', 'carrying'])
   - `karma_points` (int, default 0)
   - `animal_stage` (int, default 1: 1 = Amöbe bis 7 = Adler)
   - `aura_active` (boolean, default true)
   - `founder_aura` (boolean, default false)
   - `last_helped_at` (timestamptz)
   - `referral_code` (text, unique)
   - `referred_by` (uuid, nullable, ref profiles.id)
   - `referral_count` (int, default 0)
   - `zone_id` (uuid, ref zones.id)
   - `last_location` (geography(Point, 4326))
   - `account_type` (text, default 'individual': 'individual' | 'nonprofit') **neu**
   - `is_verified_nonprofit` (boolean, default false, nur Admin) **neu**
   - `organization_name` (text) **neu**
   - `nonprofit_category` (text: 'animal_welfare' | 'social' | 'other') **neu**
   - `badges` (text[], default '{}') **neu**
   - `created_at` (timestamptz)

2. `zones` (für den Campus-/Kiez-Unlock)
   - `id` (uuid, PK)
   - `name` (text, z. B. "TU Berlin / Charlottenburg")
   - `slug` (text, unique)
   - `center_location` (geography(Point, 4326))
   - `unlock_threshold` (int, default 150)
   - `is_unlocked` (boolean, default false)
   - `member_count` (int, per Trigger gepflegt, für den Live-Counter)

3. `help_requests`
   - `id` (uuid, PK)
   - `requester_id` (uuid, ref profiles.id)
   - `title` (text)
   - `description` (text)
   - `category` (text)
   - `urgency` (text: 'now', 'today', 'scheduled')
   - `scheduled_at` (timestamptz, Pflicht bei 'scheduled')
   - `estimated_minutes` (int)
   - `location` (geography(Point, 4326))
   - `status` (text: 'open', 'matched', 'completed', 'cancelled')
   - `is_nonprofit_request` (boolean, default false, per Trigger) **neu**
   - `karma_multiplier` (int, default 1, per Trigger: 2 bei Non-Profits) **neu**
   - `requester_is_top_helper` (boolean, default false, per Trigger) **neu**
   - `zone_id` (uuid, Bezirk der Anfrage, per Trigger, für `kiez_hero`) **neu**
   - `created_at` (timestamptz)

4. `swipes`
   - `id` (uuid, PK)
   - `request_id` (uuid, ref help_requests.id)
   - `swiper_id` (uuid, ref profiles.id)
   - `direction` (text: 'left', 'right')
   - `created_at` (timestamptz)
   - Unique Constraint auf `(request_id, swiper_id)`

5. `matches`
   - `id` (uuid, PK)
   - `request_id` (uuid, ref help_requests.id, unique)
   - `requester_id` (uuid, ref profiles.id)
   - `helper_id` (uuid, ref profiles.id)
   - `status` (text: 'active', 'completed_by_helper', 'confirmed')
   - `thank_you_note` (text, nullable)
   - `karma_awarded` (int, default 0)
   - `helper_done_at` (timestamptz, Zeitpunkt "Hilfe erledigt", für `night_owl`) **neu**
   - `completed_at` (timestamptz, nullable)

6. `messages`
   - `id` (uuid, PK)
   - `match_id` (uuid, ref matches.id)
   - `sender_id` (uuid, ref profiles.id)
   - `content` (text)
   - `created_at` (timestamptz)

### Trigger-Logik bei Abschluss (`matches.status = 'confirmed'`)
1. Basispunkte: bis 15 Min = 10, bis 30 Min = 20, länger = 40, "Jetzt sofort" +5.
2. Privatperson: Diminishing Returns (gleiche Person in 7 Tagen: 2. Hilfe 25 %, ab der 3. 10 %).
3. Non-Profit: keine Diminishing Returns.
4. Ergebnis × `karma_multiplier`.
5. Tier-Stufe steigt automatisch mit, Aura wird wieder aktiv.
6. Danach werden die Sammel-Badges aus der gesamten Historie neu berechnet und ergänzt.

### RPCs für das Frontend
`nearby_requests` (Swipe-Feed inkl. Non-Profit- und Top-Helfer-Feldern), `swipe`, `accept_helper`, `mark_help_done`, `confirm_help`, `claim_referral`, `share_card` (Daten für die 9:16 Share-Card, nur für den Helfer selbst).

---

## 5. Anforderungen vom 13.11.2026 (gelten ab dem ersten Release)

### 5.1 Teilen auf TikTok, Instagram, Facebook und Co.
- Ab Release 1: Nach jeder bestätigten Hilfe und jeder Tier-Evolution erzeugt die App die 9:16-Share-Card als Bild direkt auf dem Gerät.
- Teilen über das Teilen-Menü des Handys (Web Share API mit Bilddatei). Damit landet die Karte mit einem Tipp in Instagram-Story, TikTok, Facebook, WhatsApp. Fallback am Desktop: Bild herunterladen.
- Keine direkte Anbindung an die Schnittstellen von TikTok oder Meta: Die verlangen eine App-Prüfung, das Teilen-Menü reicht.
- Schutz der Hilfeempfangenden: Die Karte zeigt nie Namen, Fotos oder Adresse der Person, der geholfen wurde. Bei privaten Hilfen nur die Kategorie, bei Organisationen Titel und Organisationsname.
- Optional: Helfende können ein eigenes Foto als Hintergrund wählen (nur von sich selbst, Hinweis in der App).

### 5.2 Einsamkeit als eigener Schwerpunkt
- Neue Kategorie **„Zeit & Gesellschaft“**: Vorlesen, Spaziergang, Gesellschaft leisten, gemeinsam einkaufen gehen.
- Kategorie **„Technik“** ausdrücklich mit Beispielen: Fernseher, Drucker, Handy oder Tablet einrichten.
- Kategorie **„Haus & Garten“**: Pflanzen gießen, Briefkasten leeren, kleine Handgriffe.
- **Wiederkehrende Hilfe (Patenschaft):** Eine Anfrage kann sich wöchentlich wiederholen und bevorzugt an dieselbe helfende Person gehen. Einsamkeit lindert man durch feste Kontakte, nicht durch wechselnde.
- **Achtung Anti-Cheat:** Die 7-Tage-Abwertung bei derselben Person würde genau diese Patenschaften bestrafen. Sie gilt deshalb nicht für wiederkehrende Anfragen und nicht für Anfragen, die ein Träger stellvertretend einstellt.
- Einordnung: platoniq ist als Präventionskurs nach § 20 SGB V zertifiziert und wird von Krankenkassen erstattet. Das ist ein psychologisches Kursprogramm, kein Wettbewerber, aber ein Beleg dafür, dass Kassen Einsamkeit als Gesundheitsthema finanzieren. Möglicher späterer Finanzierungsweg für Karma: Pflegekassen über den Entlastungsbetrag und die Brandenburger Anerkennung von Nachbarschaftshilfe (vor Umsetzung rechtlich prüfen).

### 5.3 Messung von Anfang an
- Beim Abschluss trägt die helfende Person die **tatsächliche Dauer** ein, die anfragende Person (oder der Träger) bestätigt sie. Die Schätzung aus der Anfrage bleibt als Vergleichswert.
- Gezählt werden pro Person, pro Quartier, pro Organisation und gesamt:
  - Anzahl Hilfen
  - Geleistete Stunden
  - Anzahl verschiedener Menschen, denen geholfen wurde
  - Davon „Zeit & Gesellschaft“ (Kennzahl gegen Einsamkeit) und Anzahl fester Patenschaften
- **Entlastete Fachkraftstunden:** Nur Hilfen bei Anfragen, die ein Träger stellvertretend eingestellt hat. Der Träger markiert bei der Anfrage, ob die Aufgabe sonst bei seinen Fachkräften gelandet wäre. Nur diese Stunden zählen als Entlastung. So bleibt die Zahl ehrlich und hält einer Prüfung im Förderprojekt stand.
- Auswertung für Organisationen und Wohnungsunternehmen: anonymisiert, ab einer Mindestzahl von Fällen, als Export für Förder- und Jahresberichte.

### 5.4 Verifizierung in Stufen
Ziel: niedrige Einstiegshürde für Helfende, mehr Sicherheit dort, wo es nötig ist. Karma garantiert nicht für das Verhalten Einzelner, stellt aber Regeln und Werkzeuge bereit.

| Stufe | Wie | Darf |
|---|---|---|
| 1 Basis | E-Mail und Handynummer per SMS-Code bestätigt, ab 18 Jahren | Private Anfragen in der Nachbarschaft |
| 2 Bestätigt | Ein Träger oder Wohnungsunternehmen bestätigt die Person nach einem persönlichen Kennenlernen | Zusätzlich Anfragen, die Träger stellvertretend für ältere Menschen einstellen |
| 3 Ausweis | Online-Ausweisfunktion (später) | Sichtbares Ausweis-Abzeichen im Profil |

- Träger legen pro Anfrage fest, welche Stufe sie mindestens verlangen.
- Für alle: Melde- und Blockierfunktion, Sperren bei Verstößen, Regeln in den Nutzungsbedingungen, Sicherheitshinweise vor dem ersten Treffen.
- Online-Ausweis erst später: Er braucht ein Berechtigungszertifikat (Antrag mit Handelsregisterauszug, also erst mit eingetragener Gesellschaft) und einen kostenpflichtigen eID-Dienstleister.
- Versicherung: Klären, ob Helfende über die Sammelversicherung des Landes Brandenburg für Ehrenamtliche erfasst sind. Wenn ja, ist das ein starkes Argument für Träger und Helfende.

### 5.5 Geschäftsmodell und Pilot (Arbeitsstand, noch zu validieren)
- Wohnungsunternehmen: 0,50 € pro Wohnung und Monat, mindestens 500 € im Monat.
- Träger der Wohlfahrt: im Pilot kostenlos, später über Förderprojekte.
- Kommunen: Jahreslizenz nach Einwohnerzahl.
- Pilot: 6 Monate zum halben Preis.
- Pilotort: Potsdam. Einstieg über den Arbeitskreis StadtSpuren (Genossenschaften, kommunale Gesellschaft, Studentenwerk). Danach Übertragung in den ländlichen Raum als gefördertes Modellprojekt.

### 5.6 Abgrenzung zum Wettbewerb (für Förderantrag)
- nebenan.de: Forum und Feed. Karma: konkrete Hilfe in Minuten.
- StadtLand.Funk (früher DorfFunk): Kommunikationsplattform für Kommunen. Eigene Werkzeuge für klassische Nachbarschaftshilfe haben sich dort laut Betreiber nicht bewährt. Karma setzt dagegen auf Motivation durch Spielmechanik und verlässliche Nachfrage über Träger.
- hilver: städtische Hilfevermittlung für Menschen ab 80 mit persönlicher Registrierung der Helfenden. Karma: offen für alle Altersgruppen, Stufenmodell statt Pflicht-Registrierung, stellvertretende Anfragen durch Träger, Messung entlasteter Fachkraftstunden.
