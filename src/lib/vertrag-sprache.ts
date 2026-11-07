/**
 * Die oeffentliche Unterschriftsseite in der Sprache des Mieters.
 *
 * Der Vertrag selbst bleibt deutsch (maßgebliche Fassung) - uebersetzt wird
 * alles, was der Mieter ausfuellen und bestaetigen muss. Die Sprache kommt
 * ueber "?sprache=sq" aus der WhatsApp-Einladung und laesst sich oben auf
 * der Seite umschalten.
 */

import type { KautionSprache } from "./mahnung";

export const VERTRAG_SPRACHEN: readonly KautionSprache[] = ["de", "sq", "bg", "ro", "hu", "en"];

/** Name jeder Sprache in ihrer eigenen Sprache - fuer den Umschalter. */
export const VERTRAG_SPRACHE_EIGENNAME: Record<KautionSprache, string> = {
  de: "Deutsch",
  sq: "Shqip",
  bg: "Български",
  ro: "Română",
  hu: "Magyar",
  en: "English",
};

export function istVertragSprache(wert: string | null | undefined): wert is KautionSprache {
  return VERTRAG_SPRACHEN.includes(wert as KautionSprache);
}

type Schluessel =
  | "kopf"
  | "willkommen"
  | "einleitung"
  | "fassung"
  | "angaben"
  | "angabenHinweis"
  | "vorname"
  | "nachname"
  | "geburtsdatum"
  | "staatsangehoerigkeit"
  | "geschlecht"
  | "keineAngabe"
  | "maennlich"
  | "weiblich"
  | "divers"
  | "ausweis"
  | "optional"
  | "telefon"
  | "email"
  | "meldeanschrift"
  | "strasse"
  | "plz"
  | "ort"
  | "land"
  | "unterschrift"
  | "vollerName"
  | "datum"
  | "bestaetigung"
  | "absenden"
  | "feld"
  | "feldHinweis"
  | "erfasst"
  | "keine"
  | "loeschen"
  | "fertigTitel"
  | "fertigText"
  | "pdf"
  | "abgelaufenTitel"
  | "abgelaufenText"
  | "nichtGefundenTitel"
  | "nichtGefundenText"
  | "storniertTitel"
  | "storniertText"
  | "entwurfTitel"
  | "entwurfText"
  | "fehltNoch"
  | "fehlerEmail"
  | "fehlerName"
  | "fehlerUnterschrift"
  | "fehlerBestaetigung"
  | "hinweisTitel"
  | "hinweisKuendigung"
  | "hinweisKuendigungForm"
  | "hinweisKaution"
  | "hinweisPuenktlich"
  | "hinweisVorschuss"
  | "hinweisHausregeln"
  | "hinweisWgb"
  | "pdfWgb";

type Woerter = Record<Schluessel, string>;

const DE: Woerter = {
  kopf: "Ihr Mietvertrag",
  willkommen: "Willkommen, {name}",
  einleitung: "Bitte tragen Sie unten Ihre Daten ein und unterschreiben Sie den Vertrag. Mietbeginn ist der {datum}.",
  fassung: "Der Vertrag ist auf Deutsch. Maßgeblich ist die deutsche Fassung.",
  angaben: "Ihre Angaben",
  angabenHinweis: "Nur das Nötigste für den Vertrag und die Anmeldung. Felder mit * sind Pflicht.",
  vorname: "Vorname",
  nachname: "Nachname",
  geburtsdatum: "Geburtsdatum",
  staatsangehoerigkeit: "Staatsangehörigkeit",
  geschlecht: "Geschlecht",
  keineAngabe: "– keine Angabe –",
  maennlich: "männlich",
  weiblich: "weiblich",
  divers: "divers",
  ausweis: "Ausweis-/Passnummer",
  optional: "optional",
  telefon: "Telefon",
  email: "E-Mail",
  meldeanschrift: "Heimatadresse",
  strasse: "Straße und Hausnummer",
  plz: "PLZ",
  ort: "Ort",
  land: "Land",
  unterschrift: "Unterschrift",
  vollerName: "Vollständiger Name",
  datum: "Datum",
  bestaetigung: "Ich habe den Mietvertrag und die Hausordnung gelesen und erkenne beide an. Mir ist bekannt, dass die elektronische Unterschrift der Textform nach § 126b BGB entspricht.",
  absenden: "Vertrag rechtsverbindlich unterschreiben",
  feld: "Unterschriftenfeld",
  feldHinweis: "Hier mit dem Finger unterschreiben",
  erfasst: "Unterschrift erfasst.",
  keine: "Noch keine Unterschrift.",
  loeschen: "Löschen",
  fertigTitel: "Vertrag unterschrieben",
  fertigText: "Vielen Dank. Ihr Mietvertrag ist gültig abgeschlossen – Sie können ihn hier jederzeit als PDF herunterladen.",
  pdf: "Vertrag als PDF herunterladen",
  abgelaufenTitel: "Link abgelaufen",
  abgelaufenText: "Dieser Link ist nicht mehr gültig. Bitte fordern Sie bei der Hausverwaltung einen neuen an.",
  nichtGefundenTitel: "Vertrag nicht gefunden",
  nichtGefundenText: "Der Link ist ungültig. Bitte wenden Sie sich an Ihre Hausverwaltung.",
  storniertTitel: "Vertrag storniert",
  storniertText: "Dieser Mietvertrag wurde storniert und kann nicht mehr unterschrieben werden.",
  entwurfTitel: "Noch nicht freigegeben",
  entwurfText: "Der Vertrag wird gerade vorbereitet. Bitte versuchen Sie es später erneut.",
  fehltNoch: "Bitte noch ausfüllen: {felder}",
  fehlerEmail: "Bitte eine gültige E-Mail-Adresse angeben.",
  fehlerName: "Bitte tragen Sie Ihren vollständigen Namen ein.",
  fehlerUnterschrift: "Bitte unterschreiben Sie im dafür vorgesehenen Feld.",
  fehlerBestaetigung: "Bitte bestätigen Sie, dass Sie den Vertrag gelesen haben.",
  hinweisTitel: "Wichtig – bitte lesen",
  hinweisKuendigung: "Kündigungsfrist nur 1 Monat – in Deutschland sind sonst 3 Monate üblich.",
  hinweisKuendigungForm: "Kündigung nur als unterschriebenes PDF. Es zählt der Tag, an dem sie bei uns eingeht.",
  hinweisKaution: "Kaution nur {kaution} – in Deutschland sind sonst bis zu 3 Monatsmieten üblich.",
  hinweisPuenktlich: "Miete bitte immer pünktlich zahlen.",
  hinweisVorschuss: "Ihr Arbeitgeber zahlt Ihnen für die Anfangszeit einen Vorschuss – das ist mit ihm abgesprochen.",
  hinweisHausregeln: "Müll bitte trennen und die Hausregeln einhalten: Nachtruhe 22–6 Uhr, Rauchen nur draußen, Küche und Bad sauber hinterlassen.",
  hinweisWgb: "Die Wohnungsgeberbestätigung für die Anmeldung bekommen Sie direkt nach der Unterschrift hier zum Herunterladen.",
  pdfWgb: "Wohnungsgeberbestätigung herunterladen",
};

const SQ: Woerter = {
  kopf: "Kontrata jote e qirasë",
  willkommen: "Mirë se vjen, {name}",
  einleitung: "Të lutem plotëso më poshtë të dhënat e tua dhe nënshkruaj kontratën. Qiraja fillon më {datum}.",
  fassung: "Kontrata është në gjermanisht. Vlen versioni gjerman.",
  angaben: "Të dhënat e tua",
  angabenHinweis: "Vetëm ato që duhen për kontratën dhe regjistrimin. Fushat me * janë të detyrueshme.",
  vorname: "Emri",
  nachname: "Mbiemri",
  geburtsdatum: "Datëlindja",
  staatsangehoerigkeit: "Shtetësia",
  geschlecht: "Gjinia",
  keineAngabe: "– pa përgjigje –",
  maennlich: "mashkull",
  weiblich: "femër",
  divers: "tjetër",
  ausweis: "Numri i letërnjoftimit/pasaportës",
  optional: "opsionale",
  telefon: "Telefoni",
  email: "E-mail",
  meldeanschrift: "Adresa në vendlindje",
  strasse: "Rruga dhe numri",
  plz: "Kodi postar",
  ort: "Qyteti",
  land: "Shteti",
  unterschrift: "Nënshkrimi",
  vollerName: "Emri dhe mbiemri",
  datum: "Data",
  bestaetigung: "E kam lexuar kontratën e qirasë dhe rregulloren e shtëpisë dhe i pranoj të dyja. E di që nënshkrimi elektronik vlen si formë me shkrim sipas § 126b BGB.",
  absenden: "Nënshkruaj kontratën",
  feld: "Fusha e nënshkrimit",
  feldHinweis: "Nënshkruaj këtu me gisht",
  erfasst: "Nënshkrimi u regjistrua.",
  keine: "Ende pa nënshkrim.",
  loeschen: "Fshi",
  fertigTitel: "Kontrata u nënshkrua",
  fertigText: "Faleminderit. Kontrata jote e qirasë është e vlefshme – mund ta shkarkosh këtu si PDF në çdo kohë.",
  pdf: "Shkarko kontratën si PDF",
  abgelaufenTitel: "Linku ka skaduar",
  abgelaufenText: "Ky link nuk është më i vlefshëm. Të lutem kërko një të ri nga administrata.",
  nichtGefundenTitel: "Kontrata nuk u gjet",
  nichtGefundenText: "Linku nuk është i vlefshëm. Të lutem kontakto administratën.",
  storniertTitel: "Kontrata u anulua",
  storniertText: "Kjo kontratë qiraje është anuluar dhe nuk mund të nënshkruhet më.",
  entwurfTitel: "Ende jo gati",
  entwurfText: "Kontrata po përgatitet. Të lutem provo përsëri më vonë.",
  fehltNoch: "Të lutem plotëso: {felder}",
  fehlerEmail: "Të lutem shkruaj një adresë e-mail të vlefshme.",
  fehlerName: "Të lutem shkruaj emrin dhe mbiemrin e plotë.",
  fehlerUnterschrift: "Të lutem nënshkruaj në fushën e nënshkrimit.",
  fehlerBestaetigung: "Të lutem konfirmo që e ke lexuar kontratën.",
  hinweisTitel: "E rëndësishme – të lutem lexo",
  hinweisKuendigung: "Afati i njoftimit për largim është vetëm 1 muaj – në Gjermani zakonisht është 3 muaj.",
  hinweisKuendigungForm: "Njoftimi për largim vetëm si PDF i nënshkruar. Vlen dita kur na arrin.",
  hinweisKaution: "Depozita vetëm {kaution} – në Gjermani zakonisht deri në 3 qira mujore.",
  hinweisPuenktlich: "Të lutem paguaj qiranë gjithmonë në kohë.",
  hinweisVorschuss: "Punëdhënësi yt të jep një paradhënie për fillim – kjo është rënë dakord me të.",
  hinweisHausregeln: "Të lutem ndaj mbeturinat dhe respekto rregullat e shtëpisë: qetësi 22–6, duhani vetëm jashtë, kuzhina dhe banjo të pastra pas përdorimit.",
  hinweisWgb: "Vërtetimin e strehuesit (Wohnungsgeberbestätigung) për regjistrim e merr këtu menjëherë pas nënshkrimit.",
  pdfWgb: "Shkarko vërtetimin e strehuesit",
};

const BG: Woerter = {
  kopf: "Твоят договор за наем",
  willkommen: "Добре дошъл, {name}",
  einleitung: "Моля, попълни данните си по-долу и подпиши договора. Наемът започва на {datum}.",
  fassung: "Договорът е на немски език. Валидна е немската версия.",
  angaben: "Твоите данни",
  angabenHinweis: "Само необходимото за договора и регистрацията. Полетата с * са задължителни.",
  vorname: "Име",
  nachname: "Фамилия",
  geburtsdatum: "Дата на раждане",
  staatsangehoerigkeit: "Гражданство",
  geschlecht: "Пол",
  keineAngabe: "– не е посочено –",
  maennlich: "мъж",
  weiblich: "жена",
  divers: "друго",
  ausweis: "Номер на лична карта/паспорт",
  optional: "по желание",
  telefon: "Телефон",
  email: "Имейл",
  meldeanschrift: "Постоянен адрес",
  strasse: "Улица и номер",
  plz: "Пощенски код",
  ort: "Град",
  land: "Държава",
  unterschrift: "Подпис",
  vollerName: "Име и фамилия",
  datum: "Дата",
  bestaetigung: "Прочетох договора за наем и вътрешния правилник и ги приемам. Знам, че електронният подпис отговаря на писмената форма по § 126b BGB.",
  absenden: "Подпиши договора",
  feld: "Поле за подпис",
  feldHinweis: "Подпиши тук с пръст",
  erfasst: "Подписът е записан.",
  keine: "Все още няма подпис.",
  loeschen: "Изтрий",
  fertigTitel: "Договорът е подписан",
  fertigText: "Благодарим. Договорът ти за наем е валиден – можеш да го изтеглиш тук като PDF по всяко време.",
  pdf: "Изтегли договора като PDF",
  abgelaufenTitel: "Линкът е изтекъл",
  abgelaufenText: "Този линк вече не е валиден. Моля, поискай нов от администрацията.",
  nichtGefundenTitel: "Договорът не е намерен",
  nichtGefundenText: "Линкът е невалиден. Моля, свържи се с администрацията.",
  storniertTitel: "Договорът е анулиран",
  storniertText: "Този договор за наем е анулиран и вече не може да бъде подписан.",
  entwurfTitel: "Още не е готов",
  entwurfText: "Договорът се подготвя. Моля, опитай отново по-късно.",
  fehltNoch: "Моля, попълни: {felder}",
  fehlerEmail: "Моля, въведи валиден имейл адрес.",
  fehlerName: "Моля, въведи пълното си име.",
  fehlerUnterschrift: "Моля, подпиши се в полето за подпис.",
  fehlerBestaetigung: "Моля, потвърди, че си прочел договора.",
  hinweisTitel: "Важно – моля, прочети",
  hinweisKuendigung: "Срок за предизвестие само 1 месец – в Германия обикновено е 3 месеца.",
  hinweisKuendigungForm: "Предизвестие само като подписан PDF. Важи денят, в който го получим.",
  hinweisKaution: "Депозит само {kaution} – в Германия обикновено до 3 месечни наема.",
  hinweisPuenktlich: "Моля, плащай наема винаги навреме.",
  hinweisVorschuss: "Работодателят ти дава аванс за началото – това е уговорено с него.",
  hinweisHausregeln: "Моля, изхвърляй отпадъците разделно и спазвай правилата: тишина 22–6 ч., пушене само навън, кухнята и банята да остават чисти.",
  hinweisWgb: "Удостоверението от наемодателя (Wohnungsgeberbestätigung) за регистрацията получаваш тук веднага след подписа.",
  pdfWgb: "Изтегли удостоверението от наемодателя",
};

const RO: Woerter = {
  kopf: "Contractul tău de închiriere",
  willkommen: "Bun venit, {name}",
  einleitung: "Te rog completează mai jos datele tale și semnează contractul. Închirierea începe pe {datum}.",
  fassung: "Contractul este în limba germană. Versiunea germană este cea valabilă.",
  angaben: "Datele tale",
  angabenHinweis: "Doar ce este necesar pentru contract și înregistrare. Câmpurile cu * sunt obligatorii.",
  vorname: "Prenume",
  nachname: "Nume",
  geburtsdatum: "Data nașterii",
  staatsangehoerigkeit: "Cetățenie",
  geschlecht: "Sex",
  keineAngabe: "– nespecificat –",
  maennlich: "masculin",
  weiblich: "feminin",
  divers: "altul",
  ausweis: "Număr buletin/pașaport",
  optional: "opțional",
  telefon: "Telefon",
  email: "E-mail",
  meldeanschrift: "Adresa de domiciliu",
  strasse: "Strada și numărul",
  plz: "Cod poștal",
  ort: "Localitate",
  land: "Țara",
  unterschrift: "Semnătura",
  vollerName: "Nume complet",
  datum: "Data",
  bestaetigung: "Am citit contractul de închiriere și regulamentul casei și le accept pe amândouă. Știu că semnătura electronică corespunde formei scrise conform § 126b BGB.",
  absenden: "Semnează contractul",
  feld: "Câmp pentru semnătură",
  feldHinweis: "Semnează aici cu degetul",
  erfasst: "Semnătura a fost înregistrată.",
  keine: "Încă nu există semnătură.",
  loeschen: "Șterge",
  fertigTitel: "Contract semnat",
  fertigText: "Mulțumim. Contractul tău de închiriere este valabil – îl poți descărca aici ca PDF oricând.",
  pdf: "Descarcă contractul ca PDF",
  abgelaufenTitel: "Link expirat",
  abgelaufenText: "Acest link nu mai este valabil. Te rog cere unul nou de la administrație.",
  nichtGefundenTitel: "Contractul nu a fost găsit",
  nichtGefundenText: "Linkul nu este valabil. Te rog contactează administrația.",
  storniertTitel: "Contract anulat",
  storniertText: "Acest contract de închiriere a fost anulat și nu mai poate fi semnat.",
  entwurfTitel: "Încă nu este gata",
  entwurfText: "Contractul este în pregătire. Te rog încearcă din nou mai târziu.",
  fehltNoch: "Te rog completează: {felder}",
  fehlerEmail: "Te rog introdu o adresă de e-mail validă.",
  fehlerName: "Te rog introdu numele complet.",
  fehlerUnterschrift: "Te rog semnează în câmpul pentru semnătură.",
  fehlerBestaetigung: "Te rog confirmă că ai citit contractul.",
  hinweisTitel: "Important – te rog citește",
  hinweisKuendigung: "Termen de reziliere doar 1 lună – în Germania de obicei sunt 3 luni.",
  hinweisKuendigungForm: "Rezilierea doar ca PDF semnat. Contează ziua în care ajunge la noi.",
  hinweisKaution: "Garanție doar {kaution} – în Germania de obicei până la 3 chirii lunare.",
  hinweisPuenktlich: "Te rog plătește chiria mereu la timp.",
  hinweisVorschuss: "Angajatorul îți dă un avans pentru început – am stabilit asta cu el.",
  hinweisHausregeln: "Te rog sortează gunoiul și respectă regulile casei: liniște 22–6, fumatul doar afară, bucătăria și baia curate după folosire.",
  hinweisWgb: "Confirmarea proprietarului (Wohnungsgeberbestätigung) pentru înregistrare o primești aici imediat după semnare.",
  pdfWgb: "Descarcă confirmarea proprietarului",
};

const HU: Woerter = {
  kopf: "A bérleti szerződésed",
  willkommen: "Üdvözlünk, {name}",
  einleitung: "Kérlek, add meg lent az adataidat, és írd alá a szerződést. A bérlet kezdete: {datum}.",
  fassung: "A szerződés német nyelvű. A német változat az irányadó.",
  angaben: "Adataid",
  angabenHinweis: "Csak ami a szerződéshez és a bejelentkezéshez kell. A *-gal jelölt mezők kötelezők.",
  vorname: "Keresztnév",
  nachname: "Vezetéknév",
  geburtsdatum: "Születési dátum",
  staatsangehoerigkeit: "Állampolgárság",
  geschlecht: "Nem",
  keineAngabe: "– nincs megadva –",
  maennlich: "férfi",
  weiblich: "nő",
  divers: "egyéb",
  ausweis: "Személyi igazolvány/útlevél száma",
  optional: "nem kötelező",
  telefon: "Telefon",
  email: "E-mail",
  meldeanschrift: "Állandó lakcím",
  strasse: "Utca és házszám",
  plz: "Irányítószám",
  ort: "Település",
  land: "Ország",
  unterschrift: "Aláírás",
  vollerName: "Teljes név",
  datum: "Dátum",
  bestaetigung: "Elolvastam a bérleti szerződést és a házirendet, és mindkettőt elfogadom. Tudom, hogy az elektronikus aláírás megfelel a § 126b BGB szerinti szöveges formának.",
  absenden: "Szerződés aláírása",
  feld: "Aláírási mező",
  feldHinweis: "Írd alá itt az ujjaddal",
  erfasst: "Aláírás rögzítve.",
  keine: "Még nincs aláírás.",
  loeschen: "Törlés",
  fertigTitel: "Szerződés aláírva",
  fertigText: "Köszönjük. A bérleti szerződésed érvényes – itt bármikor letöltheted PDF-ként.",
  pdf: "Szerződés letöltése PDF-ként",
  abgelaufenTitel: "A link lejárt",
  abgelaufenText: "Ez a link már nem érvényes. Kérj újat a házkezelőtől.",
  nichtGefundenTitel: "A szerződés nem található",
  nichtGefundenText: "A link érvénytelen. Kérlek, fordulj a házkezelőhöz.",
  storniertTitel: "Szerződés visszavonva",
  storniertText: "Ezt a bérleti szerződést visszavonták, már nem írható alá.",
  entwurfTitel: "Még nincs kész",
  entwurfText: "A szerződés előkészítés alatt áll. Kérlek, próbáld újra később.",
  fehltNoch: "Kérlek, töltsd ki: {felder}",
  fehlerEmail: "Kérlek, adj meg egy érvényes e-mail címet.",
  fehlerName: "Kérlek, add meg a teljes nevedet.",
  fehlerUnterschrift: "Kérlek, írd alá az aláírási mezőben.",
  fehlerBestaetigung: "Kérlek, erősítsd meg, hogy elolvastad a szerződést.",
  hinweisTitel: "Fontos – kérlek, olvasd el",
  hinweisKuendigung: "Felmondási idő csak 1 hónap – Németországban általában 3 hónap.",
  hinweisKuendigungForm: "Felmondás csak aláírt PDF-ként. Az a nap számít, amikor megérkezik hozzánk.",
  hinweisKaution: "Kaució csak {kaution} – Németországban általában akár 3 havi bérleti díj.",
  hinweisPuenktlich: "Kérlek, a bérleti díjat mindig időben fizesd.",
  hinweisVorschuss: "A munkáltatód előleget ad a kezdeti időszakra – ezt megbeszéltük vele.",
  hinweisHausregeln: "Kérlek, válogasd szét a szemetet és tartsd be a házirendet: csend 22–6 óra között, dohányozni csak kint, a konyhát és a fürdőt tisztán hagyni.",
  hinweisWgb: "A bejelentkezéshez szükséges szállásadói igazolást (Wohnungsgeberbestätigung) az aláírás után azonnal letöltheted itt.",
  pdfWgb: "Szállásadói igazolás letöltése",
};

const EN: Woerter = {
  kopf: "Your rental contract",
  willkommen: "Welcome, {name}",
  einleitung: "Please enter your details below and sign the contract. The tenancy starts on {datum}.",
  fassung: "The contract is in German. The German version is binding.",
  angaben: "Your details",
  angabenHinweis: "Only what we need for the contract and registration. Fields marked * are required.",
  vorname: "First name",
  nachname: "Last name",
  geburtsdatum: "Date of birth",
  staatsangehoerigkeit: "Nationality",
  geschlecht: "Gender",
  keineAngabe: "– not specified –",
  maennlich: "male",
  weiblich: "female",
  divers: "other",
  ausweis: "ID card/passport number",
  optional: "optional",
  telefon: "Phone",
  email: "Email",
  meldeanschrift: "Home address",
  strasse: "Street and number",
  plz: "Postcode",
  ort: "City",
  land: "Country",
  unterschrift: "Signature",
  vollerName: "Full name",
  datum: "Date",
  bestaetigung: "I have read the rental contract and the house rules and accept both. I am aware that the electronic signature meets the text form under § 126b BGB.",
  absenden: "Sign the contract",
  feld: "Signature field",
  feldHinweis: "Sign here with your finger",
  erfasst: "Signature captured.",
  keine: "No signature yet.",
  loeschen: "Clear",
  fertigTitel: "Contract signed",
  fertigText: "Thank you. Your rental contract is now valid – you can download it here as a PDF at any time.",
  pdf: "Download contract as PDF",
  abgelaufenTitel: "Link expired",
  abgelaufenText: "This link is no longer valid. Please ask the management for a new one.",
  nichtGefundenTitel: "Contract not found",
  nichtGefundenText: "The link is invalid. Please contact the management.",
  storniertTitel: "Contract cancelled",
  storniertText: "This rental contract was cancelled and can no longer be signed.",
  entwurfTitel: "Not ready yet",
  entwurfText: "The contract is being prepared. Please try again later.",
  fehltNoch: "Please fill in: {felder}",
  fehlerEmail: "Please enter a valid email address.",
  fehlerName: "Please enter your full name.",
  fehlerUnterschrift: "Please sign in the signature field.",
  fehlerBestaetigung: "Please confirm that you have read the contract.",
  hinweisTitel: "Important – please read",
  hinweisKuendigung: "Notice period only 1 month – in Germany it is usually 3 months.",
  hinweisKuendigungForm: "Notice only as a signed PDF. The day we receive it counts.",
  hinweisKaution: "Deposit only {kaution} – in Germany up to 3 months’ rent is usual.",
  hinweisPuenktlich: "Please always pay the rent on time.",
  hinweisVorschuss: "Your employer pays you an advance for the first weeks – we have agreed this with them.",
  hinweisHausregeln: "Please separate your waste and follow the house rules: quiet hours 22:00–06:00, smoking outside only, leave kitchen and bathroom clean.",
  hinweisWgb: "You can download the landlord confirmation (Wohnungsgeberbestätigung) for your registration here right after signing.",
  pdfWgb: "Download landlord confirmation",
};

const ALLE: Record<KautionSprache, Woerter> = { de: DE, sq: SQ, bg: BG, ro: RO, hu: HU, en: EN };

export type VertragText = (schluessel: Schluessel, werte?: Record<string, string | number>) => string;

/** Texte der Unterschriftsseite in einer Sprache; Platzhalter in {geschweiften Klammern}. */
export function vertragText(sprache: string | null | undefined): VertragText {
  const woerter = ALLE[istVertragSprache(sprache) ? sprache : "de"];
  return (schluessel, werte) =>
    woerter[schluessel].replace(/\{(\w+)\}/g, (_, name: string) => String(werte?.[name] ?? `{${name}}`));
}

/** Fuer Tests: jede Sprache hat jeden Schluessel und dieselben Platzhalter. */
export function vertragSprachenVollstaendig(): string[] {
  const fehler: string[] = [];
  const platzhalter = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const sprache of VERTRAG_SPRACHEN) {
    for (const schluessel of Object.keys(DE) as Schluessel[]) {
      const text = ALLE[sprache][schluessel];
      if (!text?.trim()) fehler.push(`${sprache}.${schluessel} fehlt`);
      else if (platzhalter(text) !== platzhalter(DE[schluessel])) fehler.push(`${sprache}.${schluessel} Platzhalter`);
    }
  }
  return fehler;
}
