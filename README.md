# Wohnwerk

Verwaltungs-Dashboard für Monteurunterkünfte: Objekte mit Zimmern und Betten,
Mieter mit digital unterschriebenem Mietvertrag und eine Buchhaltung, die aus
hochgeladenen Kontoauszügen die offenen Mieten erkennt und alle Belege so in
Google Drive ablegt, dass der Steuerberater den Ordner nur noch öffnen muss.

---

## Was das System kann

**Objekte, Zimmer, Betten**
Jedes Objekt hat eine Adresse, Ansprechpartner und WLAN-Daten. Darin liegen
Zimmer, in den Zimmern die einzelnen Betten – jedes Bett mit eigenem Mietpreis
und eigenem Status. Vermietet wird das Bett, nicht das Zimmer.

**Belegungsplan**
Eine Zeitleiste über drei Monate zeigt für jedes Bett, wer wann darin wohnt,
was noch frei ist und was gesperrt ist. Auslastung und laufende Mieteinnahmen
stehen als Kennzahl darüber.

**Mieter und Mietverträge**
Beim Anlegen eines Mieters wird direkt ein Bett zugewiesen. Daraus entsteht ein
Vertragsentwurf. Nach der Freigabe bekommt der Mieter einen persönlichen Link:
Er sieht dort den vollständigen Vertrag, ergänzt seine Daten (Geburtsdatum,
Ausweisnummer, Meldeanschrift) und unterschreibt mit Finger oder Maus direkt im
Browser. Danach entsteht das PDF mit eingebetteter Unterschrift, es wird in
Google Drive abgelegt und das Mietverhältnis auf „aktiv“ gesetzt.
Doppelbelegungen sind ausgeschlossen: überschneidende Zeiträume auf demselben
Bett werden beim Anlegen abgelehnt.

**Buchhaltung**
Kontoauszüge werden als CSV, CAMT.053 oder MT940 hochgeladen. Die Spalten
gängiger deutscher Banken werden automatisch erkannt, Duplikate übersprungen.
Für jedes laufende Mietverhältnis entsteht pro Monat eine Forderung; eingehende
Zahlungen werden über die Vertragsreferenz oder den Namen automatisch
zugeordnet. Was nicht eindeutig ist, bleibt offen und wird per Klick zugeordnet
– lieber eine Rückfrage als eine falsche Buchung.

**Belege und Steuerberater**
Zu jeder Ausgabe lässt sich ein Beleg hochladen; er landet im Monatsordner in
Drive. Die Übersicht zeigt jederzeit, für welche Ausgaben noch ein Beleg fehlt.
Der Jahresexport erzeugt drei CSV-Dateien (Buchungen, Belegliste, Mieten) mit
dem Link zum jeweiligen Beleg in jeder Zeile und legt sie im Jahresordner ab.
Diesen Ordner gibt man dem Steuerberater mit einem Klick frei.

---

## Warum Postgres *und* Google Drive

Der Wunsch war, „Google Drive als Datenbank“ zu nutzen, damit alles an den
Steuerberater weitergegeben werden kann. Umgesetzt ist es so:

- **Google Drive ist die Dokumentenablage** – Mietverträge, Belege,
  Kontoauszüge und die Auswertungs-CSVs. Das ist genau das, was der
  Steuerberater braucht, und er bekommt es als freigegebenen Ordner.
- **PostgreSQL hält die Daten**, mit denen die Anwendung arbeitet (Objekte,
  Betten, Mietverhältnisse, Buchungen). Drive kann das nicht: Es gibt keine
  gleichzeitigen Schreibzugriffe, keine Suche, keine Referenzen zwischen
  Datensätzen und keinen Schutz davor, dass zwei Vorgänge dieselbe Datei
  überschreiben. Ein Belegungsplan über 40 Betten wäre auf Dateibasis weder
  schnell noch verlässlich.

Praktisch heißt das: Sie arbeiten im Dashboard, und in Drive wächst parallel
der vollständige, sortierte Ordner für die Steuerkanzlei. Nichts muss
exportiert, gesammelt oder zusammengesucht werden.

---

## Technik

| Bereich       | Wahl                                                          |
| ------------- | ------------------------------------------------------------- |
| Framework     | Next.js 15 (App Router), React 19, TypeScript                 |
| Datenbank     | PostgreSQL über Prisma                                        |
| Oberfläche    | Tailwind CSS v4                                               |
| PDF           | pdf-lib (serverseitig, ohne Browser)                          |
| Dateiablage   | Google Drive API, lokaler Ordner als Rückfallebene            |
| Anmeldung     | Signiertes Cookie, Passwörter mit scrypt aus `node:crypto`    |
| E-Mail        | Resend über HTTP (optional)                                   |

Beträge werden durchgängig als ganze Cent gespeichert – keine Rundungsfehler.
Statuswerte liegen als Strings in der Datenbank und werden zentral in
`src/lib/enums.ts` beschriftet.

---

## Lokal starten

Voraussetzung: Node 20 oder neuer und eine PostgreSQL-Datenbank.

```bash
npm install
cp .env.example .env          # Werte eintragen, siehe unten
npm run db:migrate            # Tabellen anlegen
npm run db:seed               # optional: Beispieldaten
npm run dev                   # http://localhost:3000
```

Beim ersten Aufruf von `/login` wird aus `ADMIN_EMAIL` und `ADMIN_PASSWORD` der
Administrator angelegt. Danach greifen diese Variablen nicht mehr; weitere
Zugänge legen Sie unter *Einstellungen* an.

Mindestens nötig in der `.env`:

```env
DATABASE_URL="postgresql://…"
AUTH_SECRET="…"               # node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
ADMIN_EMAIL="verwaltung@example.de"
ADMIN_PASSWORD="…"
APP_URL="http://localhost:3000"
```

Ohne Google-Drive-Konfiguration läuft alles weiter – Dateien liegen dann unter
`./storage`. Auf Vercel ist das nur ein Notnagel, weil das Dateisystem dort
nicht dauerhaft ist; für den echten Betrieb sollte Drive verbunden sein.

---

## Auf Vercel veröffentlichen

**1. Datenbank anlegen.**
Im Vercel-Projekt unter *Storage* eine Postgres-Datenbank erstellen (Neon), oder
eine bestehende Supabase-/Neon-Datenbank verwenden. Vercel setzt `DATABASE_URL`
dann selbst; bei externen Anbietern die **gepoolte** Verbindungs-URL eintragen.

**2. Repository verbinden.**
In Vercel *New Project* → dieses Repository auswählen. Framework wird als
Next.js erkannt. Gebaut wird über das Skript `vercel-build`, das den
Prisma-Client erzeugt und die Migrationen einspielt – ohne Zutun.

**3. Umgebungsvariablen setzen** (Project Settings → Environment Variables):

| Variable                      | Pflicht | Bedeutung                                     |
| ----------------------------- | ------- | --------------------------------------------- |
| `DATABASE_URL`                | ja      | PostgreSQL-Verbindung                         |
| `AUTH_SECRET`                 | ja      | Zufälliger Schlüssel für Sitzungs-Cookies     |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | ja    | Erster Zugang beim ersten Login               |
| `APP_URL`                     | ja      | Ihre Domain, z. B. `https://verwaltung.firma.de` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | für Drive | Schlüssel des Dienstkontos                  |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | für Drive | Ziel-Ordner in Drive                        |
| `RESEND_API_KEY`, `MAIL_FROM` | optional | Automatischer Versand der Vertragslinks      |

**4. Datenbankschema.**
Nichts zu tun. Vercel verwendet den Befehl `vercel-build`, der bei jedem
Deployment `prisma migrate deploy` mitlaufen lässt und das Schema anlegt bzw.
aktualisiert. Schlägt die Verbindung fehl, bricht das Deployment sichtbar ab,
statt mit halber Datenbank online zu gehen.

**5. Google Drive einrichten.**
Auf Vercel ist das Dateisystem schreibgeschuetzt, eine lokale Ablage gibt es
dort nicht. Ohne eingerichtetes Drive weist die Anwendung Uploads mit einer
klaren Meldung ab, statt Belege ins Leere zu schreiben. Die Einrichtung steht
weiter unten unter *Google Drive verbinden*.

**6. Domain verbinden.**
In Vercel unter *Settings → Domains* die Domain eintragen und die angezeigten
DNS-Einträge beim Anbieter setzen. Danach dieselbe Adresse in `APP_URL` und
unter *Einstellungen → Adresse der Anwendung* eintragen – daraus werden die
Vertragslinks für die Mieter gebaut.

---

## Google Drive verbinden

1. In der [Google Cloud Console](https://console.cloud.google.com) ein Projekt
   anlegen und die **Google Drive API** aktivieren.
2. Unter *IAM & Verwaltung → Dienstkonten* ein Dienstkonto anlegen und einen
   **JSON-Schlüssel** herunterladen.
3. In Google Drive den Ordner anlegen, in dem alles liegen soll (z. B.
   „Wohnwerk“), und ihn für die E-Mail-Adresse des Dienstkontos als
   **Bearbeiter** freigeben.
   Alternativ eine geteilte Ablage verwenden und das Dienstkonto dort als
   Mitglied hinzufügen – dafür braucht das Dienstkonto keinen eigenen
   Speicherplatz.
4. Die Ordner-ID aus der Adresszeile kopieren:
   `https://drive.google.com/drive/folders/`**`DIESE_ID`**
5. In Vercel setzen:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` – Inhalt der JSON-Datei (roh oder
     Base64-kodiert, `base64 -w0 schluessel.json`)
   - `GOOGLE_DRIVE_ROOT_FOLDER_ID` – die kopierte ID
6. Neu bereitstellen. Unter *Einstellungen* muss der Punkt „Google Drive“ grün
   sein.

So sieht die Ablage danach aus:

```
Wohnwerk/
├── Mietvertraege/
│   └── 2026/                     unterschriebene Verträge als PDF
└── Buchhaltung/
    └── 2026/
        ├── 01 Belege/ … 12 Belege/   Rechnungen und Quittungen je Monat
        ├── Kontoauszuege/            Originaldateien der Bank
        └── Steuerberater-Export/     Buchungen, Belegliste, Mieten als CSV
```

Unter *Buchhaltung → Steuerberater* geben Sie den Jahresordner mit einer
E-Mail-Adresse frei – die Kanzlei erhält Leserechte auf alles darin.

---

## E-Mail-Versand (optional)

Ohne Konfiguration zeigt die Anwendung den Vertragslink zum Kopieren an und
bietet einen Entwurf für das eigene E-Mail-Programm. Mit einem
[Resend](https://resend.com)-Schlüssel (`RESEND_API_KEY`) und einer geprüften
Absenderadresse (`MAIL_FROM`) geht die Einladung automatisch an den Mieter.

---

## Der Vertragstext

Die mitgelieferte Vorlage ist auf die vorübergehende Überlassung möblierter
Schlafplätze zugeschnitten (§ 549 Abs. 2 Nr. 1 BGB) und lässt sich unter
*Einstellungen → Vertragstext* vollständig anpassen. Sie ist als praxisnaher
Ausgangspunkt gedacht und **ersetzt keine Rechtsberatung** – lassen Sie den
Text einmalig anwaltlich prüfen.

Freigegebene Verträge frieren ihren Wortlaut ein: Spätere Änderungen an den
Einstellungen wirken nur auf neue Verträge, nie rückwirkend auf bereits
versendete oder unterschriebene.

Die elektronische Unterschrift entspricht der Textform nach § 126b BGB. Für
Mietverträge über weniger als ein Jahr genügt das; bei längeren Festlaufzeiten
verlangt § 550 BGB die Schriftform. Verträge, die vor Ort auf Papier
unterschrieben wurden, lassen sich im Vertrag als unterschrieben erfassen.

---

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build (erzeugt den Prisma-Client mit)
npm start          # Produktionsserver
npm test           # Prüfungen für Beträge, Datumsformate und Bankdateien
npm run typecheck  # TypeScript ohne Ausgabe prüfen
npm run db:migrate # Migration erstellen und anwenden
npm run db:seed    # Beispieldaten
npm run db:studio  # Datenbank im Browser ansehen
```

---

## Aufbau

```
prisma/schema.prisma        Datenmodell
src/lib/                    Fachlogik ohne Oberfläche
  bank.ts                   CSV-, CAMT.053- und MT940-Parser
  accounting.ts             Mietforderungen, Zahlungszuordnung, Auswertungen
  storage.ts                Google Drive mit lokaler Rückfallebene
  contract-pdf.ts           PDF-Erzeugung
  tenancy.ts                Belegung und Überschneidungsprüfung
  export.ts                 CSV-Ausgabe für den Steuerberater
src/app/(dashboard)/        Geschützte Seiten
src/app/vertrag/[token]/    Öffentliche Vertragsseite für Mieter
src/app/actions/            Server Actions (alle Änderungen laufen hierüber)
src/components/             Wiederverwendbare Bausteine
tests/run.ts                Prüfungen
```
