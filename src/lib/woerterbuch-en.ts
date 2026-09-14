/**
 * Deutsch → Englisch. Schluessel ist der deutsche Text, wie er im Code steht.
 *
 * Ohne "server-only": das Woerterbuch wird auch von Client-Komponenten
 * gebraucht (Navigation, Menueleiste), die ihre Sprache als Eigenschaft
 * bekommen.
 *
 * Was hier fehlt, erscheint auf Deutsch. Beim Ergaenzen den deutschen
 * Text genau so uebernehmen, wie er im Code steht - samt Umlauten,
 * Auslassungspunkten und Bindestrichen.
 */
export const WOERTERBUCH_EN: Record<string, string> = {
  // --- Navigation und Grundgeruest -----------------------------------------
  Übersicht: "Overview",
  Dashboard: "Dashboard",
  Belegungsplan: "Occupancy plan",
  Vermietung: "Letting",
  Objekte: "Properties",
  Mieter: "Tenants",
  Mietverträge: "Rental contracts",
  Buchhaltung: "Accounting",
  Buchungen: "Transactions",
  Kontoauszüge: "Bank statements",
  Mieteingänge: "Rent payments",
  Belege: "Receipts",
  "Offene Posten": "Open items",
  Steuerberater: "Tax advisor",
  System: "System",
  Einstellungen: "Settings",
  Abmelden: "Sign out",
  "Menü umschalten": "Toggle menu",
  "Zum Dashboard": "To the dashboard",
  Monteurunterkünfte: "Contractor accommodation",

  // --- Schwebende Menueleiste (Handy) --------------------------------------
  Belegung: "Occupancy",
  Mieten: "Rents",
  Schnellzugriff: "Quick access",
  "Schnell erledigen": "Quick actions",
  "Schnellaktionen öffnen": "Open quick actions",
  "Schnellaktionen schließen": "Close quick actions",
  "Beleg fotografieren": "Photograph receipt",
  "Quittung direkt mit der Kamera erfassen": "Capture a receipt with the camera",
  "Miete abhaken": "Tick off rent",
  "Eingegangene Mieten des Monats bestätigen": "Confirm this month's incoming rents",
  "Mieter anlegen": "Add tenant",
  "Neuer Monteur mit Bett und Vertrag": "New contractor with bed and contract",
  "Kontoauszug einlesen": "Import bank statement",
  "PDF oder CSV der Bank hochladen": "Upload a PDF or CSV from the bank",
  Schließen: "Close",

  // --- Anmeldung ------------------------------------------------------------
  Anmelden: "Sign in",
  "Verwaltung für Monteurunterkünfte": "Contractor accommodation management",
  "Bitte mit den Zugangsdaten der Hausverwaltung anmelden.":
    "Please sign in with the property management credentials.",
  "E-Mail-Adresse oder Passwort ist nicht korrekt.": "Email address or password is incorrect.",
  "Erste Anmeldung": "First sign-in",
  "Keine Datenbankverbindung": "No database connection",
  "E-Mail": "Email",
  Passwort: "Password",
  "Passwort anzeigen": "Show password",
  "Passwort verbergen": "Hide password",
  "Mieter benötigen keinen Zugang – sie erhalten einen persönlichen Vertragslink.":
    "Tenants do not need an account - they receive a personal contract link.",

  // --- Wiederkehrende Schaltflaechen und Begriffe --------------------------
  Speichern: "Save",
  Abbrechen: "Cancel",
  Löschen: "Delete",
  Bearbeiten: "Edit",
  Anzeigen: "Show",
  Filtern: "Filter",
  Zurücksetzen: "Reset",
  Suche: "Search",
  Status: "Status",
  Alle: "All",
  Sprache: "Language",
  "Sprache wählen": "Choose language",
};
