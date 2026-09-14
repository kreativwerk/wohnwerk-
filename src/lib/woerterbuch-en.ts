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

  // --- Tickets ---------------------------------------------------------------
  Tickets: "Tickets",
  "Anliegen aus den Objekten: was kaputt ist, was fehlt, was jemand gemeldet hat.":
    "Issues from the properties: what is broken, what is missing, what someone reported.",
  "Ticket anlegen": "Create ticket",
  "Ticket bearbeiten": "Edit ticket",
  "Ticket löschen": "Delete ticket",
  "Ticket samt Verlauf und Anhängen löschen?": "Delete ticket including history and attachments?",
  "Ticket melden": "Report a ticket",
  "Schaden oder Anliegen mit Foto festhalten": "Record damage or an issue with a photo",
  "Keine Tickets": "No tickets",
  "Hier steht, was in den Objekten zu tun ist. Legen Sie das erste Anliegen an.":
    "This is where the work on your properties is listed. Create the first issue.",
  "Ein Satz genügt; Foto und Details sind freiwillig.":
    "One sentence is enough; photo and details are optional.",
  Anliegen: "Issue",
  Zuordnung: "Assignment",
  Beschreibung: "Description",
  "Keine weitere Beschreibung.": "No further description.",
  "z. B. Boiler in Bad 2 tropft": "e.g. boiler in bathroom 2 is dripping",
  "Was genau ist passiert? Seit wann? Wer hat es gemeldet?":
    "What exactly happened? Since when? Who reported it?",
  Dringlichkeit: "Priority",
  Niedrig: "Low",
  Normal: "Normal",
  Hoch: "High",
  Offen: "Open",
  "In Arbeit": "In progress",
  Erledigt: "Done",
  Aktuell: "Current",
  "Betroffenes Objekt": "Property concerned",
  "Betroffener Mieter": "Tenant concerned",
  "Kein Objekt": "No property",
  "Kein Mieter": "No tenant",
  Bearbeiter: "Assignee",
  "Wer kümmert sich?": "Who is taking care of it?",
  "Foto oder Dokument": "Photo or document",
  Verlauf: "History",
  "Wer hat was erledigt, wen angerufen, was vereinbart.":
    "Who did what, who was called, what was agreed.",
  "Noch keine Notizen.": "No notes yet.",
  "Notiz hinzufügen": "Add a note",
  "Notiz speichern": "Save note",
  "Was ist passiert?": "What happened?",
  Anhänge: "Attachments",
  Notizen: "notes",
  "Fotos vom Schaden, Kostenvoranschlag, Rechnung.": "Photos of the damage, quote, invoice.",
  "Noch keine Anhänge.": "No attachments yet.",
  "Anhang hinzufügen": "Add attachment",
  "Wieder öffnen": "Reopen",
  Auf: "Mark as",
  Angelegt: "Created",
  "Erledigt am": "Completed on",
  "Liegt seit": "Open for",
  Tagen: "days",
  Ehemalig: "Former",

  // --- Support-Meldungen an die IT -----------------------------------------
  "Problem melden": "Report a problem",
  "Stimmt etwas in dieser Anwendung nicht? Die Meldung geht an die IT.":
    "Something wrong in this application? The report goes to IT.",
  "Stimmt in der App etwas nicht? Ab zur IT.": "Something off in the app? Straight to IT.",
  "Was stimmt nicht?": "What is wrong?",
  "z. B. Beleg lässt sich nicht speichern": "e.g. receipt will not save",
  "Was haben Sie gemacht?": "What were you doing?",
  "Welcher Schritt, was war erwartet, was kam stattdessen?":
    "Which step, what did you expect, what happened instead?",
  Bildschirmfoto: "Screenshot",
  "Mitgeschickt wird:": "Sent along:",
  "Meldung senden": "Send report",
  Art: "Kind",
  "Alle Arten": "All kinds",
  Support: "Support",

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
