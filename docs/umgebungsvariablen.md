# Umgebungsvariablen

Diese Datei ist bewusst **keine** `.env.example`. Vercel liest eine solche
Datei beim Import aus und legt daraus stillschweigend alle Variablennamen an,
gefüllt mit den Beispielwerten. Das Projekt sieht danach vollständig
eingerichtet aus, während die Werte leer sind, und der Build scheitert mit
einer Meldung, die woanders hinzeigt.

Für den lokalen Betrieb legen Sie sich eine `.env` an und kopieren die
gewünschten Zeilen aus dem Block am Ende hierher.

## Zum Start nötig

| Variable | Bedeutung |
| --- | --- |
| `DATABASE_URL` | PostgreSQL-Verbindung. Bei Anbietern mit Pooling die gepoolte Adresse |
| `AUTH_SECRET` | Zufälliger Schlüssel für die Sitzungs-Cookies, mindestens 16 Zeichen |
| `ADMIN_EMAIL` | Daraus entsteht beim ersten Login das Administratorkonto |
| `ADMIN_PASSWORD` | Passwort für diesen ersten Zugang |
| `APP_URL` | Adresse der Anwendung, ohne Schrägstrich am Ende |

`AUTH_SECRET` erzeugen:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Später, für die Dokumentenablage

| Variable | Bedeutung |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Schlüssel des Dienstkontos, roh oder Base64 |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | Ziel-Ordner, die ID aus der Drive-Adresse |
| `GOOGLE_IMPERSONATE_USER` | Nur bei domainweiter Delegation |

Alternativ statt des Dienstkontos: `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` und `GOOGLE_REFRESH_TOKEN`.

Ohne Drive nimmt die Anwendung keine Dokumente an und sagt das deutlich.
Auf Vercel gibt es keine Festplatte, die ein Deployment überlebt.

## Optional

| Variable | Bedeutung |
| --- | --- |
| `ADMIN_NAME` | Anzeigename des ersten Kontos, sonst „Administrator“ |
| `RESEND_API_KEY` | Ohne Schlüssel wird der Vertragslink zum Kopieren angezeigt statt versendet |
| `MAIL_FROM` | Absender der Vertragsmails |
| `STORAGE_DIR` | Nur lokal. Auf Vercel wirkungslos, das Dateisystem ist schreibgeschützt |

## Vorlage für die lokale `.env`

```bash
DATABASE_URL="postgresql://benutzer:passwort@localhost:5432/wohnwerk"
AUTH_SECRET=""
ADMIN_EMAIL="verwaltung@example.de"
ADMIN_PASSWORD=""
ADMIN_NAME="Hausverwaltung"
APP_URL="http://localhost:3000"
STORAGE_DIR="./storage"
```
