/**
 * Uebersetzung des Mietvertrags zum Lesen - maßgeblich bleibt die deutsche
 * Fassung.
 *
 * Uebersetzt werden die Beschriftungen und die Standardtexte (Einleitung,
 * Kuendigung, Bedingungen, Hausordnung). Weicht ein Text in den Einstellungen
 * vom hier hinterlegten deutschen Original ab, gibt es dafuer keine
 * Uebersetzung (null) - dann bleibt dieser Teil deutsch, statt eine
 * veraltete Uebersetzung zu zeigen.
 */

import type { KautionSprache } from "./mahnung";

export type UebersetzteSprache = Exclude<KautionSprache, "de">;

/** Die deutschen Texte, zu denen die Uebersetzungen passen. */
const ORIGINAL = {
  intro:
    "Zwischen dem Vermieter und dem Mieter wird folgender Mietvertrag für Wohnraum über einen möblierten Schlafplatz im genannten Zimmer geschlossen.",
  kuendigung:
    "Das Mietverhältnis kann von beiden Seiten mit einer Frist von einem Monat zum Monatsende in Textform gekündigt werden.",
  hausordnung:
    "Nachtruhe 22:00–06:00 Uhr · Rauchverbot in allen Innenräumen · Küche und Bad nach Benutzung sauber hinterlassen · Müll getrennt entsorgen · Keine Haustiere · Besuch nur nach Absprache",
  bedingungen: [
    "1. Mietgegenstand: Überlassen wird der oben bezeichnete Schlafplatz im genannten Zimmer zur alleinigen Nutzung. Küche, Bad und Aufenthaltsräume werden gemeinschaftlich mit den übrigen Bewohnern genutzt.",
    "2. Mietzweck: Die Überlassung erfolgt zu Wohnzwecken im Rahmen einer auswärtigen Tätigkeit des Mieters.",
    "3. Miete: Die Miete ist im Voraus bis zum vereinbarten Fälligkeitstag auf das Konto des Vermieters zu zahlen. Betriebs- und Nebenkosten sowie Strom, Wasser, Heizung und Internet sind in der Miete enthalten, sofern nicht abweichend vereinbart.",
    "4. Kaution: Eine vereinbarte Kaution ist vor Bezug zu hinterlegen und wird nach ordnungsgemäßer Rückgabe des Schlafplatzes und Ausgleich aller Forderungen zurückgezahlt.",
    "5. Nutzung: Die Unterkunft darf nur von der im Vertrag genannten Person genutzt werden. Die Aufnahme weiterer Personen sowie eine Untervermietung sind nicht gestattet.",
    "6. Hausordnung: Die Hausordnung ist Bestandteil dieses Vertrages. Rauchen ist in allen Innenräumen untersagt. Von 22:00 bis 06:00 Uhr ist Nachtruhe einzuhalten.",
    "7. Rückgabe: Der Schlafplatz ist zum Vertragsende besenrein und geräumt zurückzugeben. Schlüssel sind vollständig auszuhändigen. Für nicht zurückgegebene Schlüssel wird der Aufwand für den Austausch der Schließanlage berechnet.",
    "8. Haftung: Der Mieter haftet für von ihm verursachte Schäden. Für in die Unterkunft eingebrachte Sachen übernimmt der Vermieter keine Haftung.",
    "9. Meldepflicht: Der Mieter versichert, die für den Aufenthalt erforderlichen melderechtlichen Pflichten zu erfüllen und auf Verlangen eine Wohnungsgeberbestätigung entgegenzunehmen.",
    "10. Schlussbestimmungen: Änderungen und Ergänzungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen wirksam.",
  ],
};

type Texte = {
  titel: string;
  hinweis: string;
  intro: string;
  kuendigung: string;
  hausordnung: string;
  hausordnungObjekt: string;
  unterschriebenAm: string;
  bedingungen: string[];
  /** Beschriftungen: deutscher Text -> Uebersetzung */
  beschriftung: Record<string, string>;
};

const SQ: Texte = {
  titel: "Përkthim",
  hinweis: "Përkthim vetëm për lexim. Vlen versioni gjerman i kontratës.",
  intro: "Ndërmjet qiradhënësit dhe qiramarrësit lidhet kjo kontratë qiraje banimi për një vend fjetjeje të mobiluar në dhomën e përmendur.",
  kuendigung: "Secila palë mund ta zgjidhë qiranë me shkrim, me afat njoftimi një muaj deri në fund të muajit.",
  hausordnung:
    "Qetësi gjatë natës 22:00–06:00 · Ndalohet duhani në të gjitha ambientet e brendshme · Kuzhina dhe banjo lihen të pastra pas përdorimit · Mbeturinat ndahen sipas llojit · Ndalohen kafshët shtëpiake · Vizitorët vetëm me marrëveshje",
  hausordnungObjekt: "Rregullorja e shtëpisë së objektit",
  unterschriebenAm: "Nënshkruar elektronikisht më",
  bedingungen: [
    "1. Objekti i qirasë: Vendi i fjetjes i përshkruar më sipër në dhomën e përmendur jepet për përdorim vetjak. Kuzhina, banjo dhe ambientet e përbashkëta përdoren bashkë me banorët e tjerë.",
    "2. Qëllimi: Strehimi jepet për banim gjatë punës së qiramarrësit larg vendbanimit.",
    "3. Qiraja: Qiraja paguhet paraprakisht deri në datën e caktuar të pagesës në llogarinë e qiradhënësit. Shpenzimet e funksionimit dhe ato shtesë, si dhe rryma, uji, ngrohja dhe interneti përfshihen në qira, përveç nëse është rënë dakord ndryshe.",
    "4. Depozita: Depozita e rënë dakord paguhet para hyrjes dhe kthehet pas dorëzimit të rregullt të vendit të fjetjes dhe shlyerjes së të gjitha detyrimeve.",
    "5. Përdorimi: Strehimi mund të përdoret vetëm nga personi i përmendur në kontratë. Nuk lejohet strehimi i personave të tjerë dhe as nënqiradhënia.",
    "6. Rregullorja e shtëpisë: Rregullorja e shtëpisë është pjesë e kësaj kontrate. Duhani ndalohet në të gjitha ambientet e brendshme. Nga ora 22:00 deri në 06:00 duhet të ruhet qetësia e natës.",
    "7. Dorëzimi: Në fund të kontratës vendi i fjetjes dorëzohet i pastruar dhe i zbrazur. Të gjithë çelësat duhet të dorëzohen. Për çelësat që nuk kthehen, faturohet kostoja e ndërrimit të sistemit të bravave.",
    "8. Përgjegjësia: Qiramarrësi përgjigjet për dëmet që shkakton. Qiradhënësi nuk mban përgjegjësi për sendet e sjella në strehim.",
    "9. Detyrimi i regjistrimit: Qiramarrësi siguron se do të përmbushë detyrimet e regjistrimit të nevojshme për qëndrimin dhe se do të pranojë, nëse kërkohet, vërtetimin e strehuesit (Wohnungsgeberbestätigung).",
    "10. Dispozitat përfundimtare: Ndryshimet dhe shtesat bëhen me shkrim. Nëse një dispozitë është e pavlefshme, pjesa tjetër e kontratës mbetet e vlefshme.",
  ],
  beschriftung: {
    "Mietvertrag für Wohnraum": "Kontratë qiraje banimi",
    "Vertrag {nummer}": "Kontrata {nummer}",
    "1. Vertragsparteien": "1. Palët e kontratës",
    "2. Mietgegenstand": "2. Objekti i qirasë",
    "3. Mietzeit und Mietzins": "3. Kohëzgjatja dhe qiraja",
    "4. Vertragsbedingungen": "4. Kushtet e kontratës",
    "5. Hausordnung": "5. Rregullorja e shtëpisë",
    "6. Unterschrift": "6. Nënshkrimi",
    Vermieter: "Qiradhënësi",
    Mieter: "Qiramarrësi",
    Name: "Emri",
    Anschrift: "Adresa",
    Telefon: "Telefoni",
    "E-Mail": "E-mail",
    "USt-IdNr.": "Nr. TVSH",
    Geburtsdatum: "Datëlindja",
    Staatsangehörigkeit: "Shtetësia",
    Ausweisnummer: "Nr. i dokumentit",
    Meldeanschrift: "Adresa në vendlindje",
    Firma: "Firma",
    Objekt: "Objekti",
    Zimmer: "Dhoma",
    Schlafplatz: "Vendi i fjetjes",
    "wird vor Ort zugewiesen": "caktohet në vend",
    Mietbeginn: "Fillimi i qirasë",
    Mietende: "Mbarimi i qirasë",
    unbefristet: "pa afat",
    "Miete monatlich": "Qiraja mujore",
    "Miete monatlich (pauschal)": "Qiraja mujore (gjithëpërfshirëse)",
    "{betrag} inkl. aller Nebenkosten": "{betrag} me të gjitha shpenzimet",
    "davon Nebenkosten": "nga kjo shpenzime",
    Kaution: "Depozita",
    keine: "asnjë",
    Fälligkeit: "Afati i pagesës",
    "zum {tag}. eines Monats im Voraus": "deri më {tag} të çdo muaji, paraprakisht",
    Verwendungszweck: "Përshkrimi i pagesës",
    Empfänger: "Përfituesi",
    "Zahlung auf": "Pagesa në",
    "Unterschrift des Mieters": "Nënshkrimi i qiramarrësit",
  },
};

const BG: Texte = {
  titel: "Превод",
  hinweis: "Превод само за четене. Валидна е немската версия на договора.",
  intro: "Между наемодателя и наемателя се сключва следният договор за наем на жилище за обзаведено място за спане в посочената стая.",
  kuendigung: "Всяка от страните може да прекрати наема писмено с предизвестие от един месец до края на месеца.",
  hausordnung:
    "Нощна тишина 22:00–06:00 · Забранено пушенето във всички закрити помещения · Кухнята и банята се оставят чисти след ползване · Разделно изхвърляне на отпадъците · Без домашни любимци · Посещения само след уговорка",
  hausordnungObjekt: "Вътрешен правилник на обекта",
  unterschriebenAm: "Подписано електронно на",
  bedingungen: [
    "1. Предмет на наема: Описаното по-горе място за спане в посочената стая се предоставя за самостоятелно ползване. Кухнята, банята и общите помещения се ползват съвместно с останалите обитатели.",
    "2. Цел: Настаняването се предоставя за живеене във връзка с работата на наемателя извън постоянното му местоживеене.",
    "3. Наем: Наемът се плаща предварително до уговорения ден на падежа по сметката на наемодателя. Експлоатационните и допълнителните разходи, както и токът, водата, отоплението и интернетът са включени в наема, освен ако не е уговорено друго.",
    "4. Депозит: Уговореният депозит се внася преди настаняването и се връща след надлежно предаване на мястото за спане и уреждане на всички задължения.",
    "5. Ползване: Жилището може да се ползва само от посоченото в договора лице. Не се разрешава настаняването на други лица, нито преотдаването под наем.",
    "6. Вътрешен правилник: Вътрешният правилник е част от този договор. Пушенето е забранено във всички закрити помещения. От 22:00 до 06:00 ч. трябва да се спазва нощна тишина.",
    "7. Връщане: При изтичане на договора мястото за спане се предава почистено и освободено. Всички ключове се връщат. За невърнати ключове се начисляват разходите за смяна на заключващата система.",
    "8. Отговорност: Наемателят отговаря за причинените от него щети. Наемодателят не носи отговорност за внесените в жилището вещи.",
    "9. Задължение за регистрация: Наемателят се задължава да изпълни необходимите за престоя задължения по адресна регистрация и при поискване да приеме удостоверение от наемодателя (Wohnungsgeberbestätigung).",
    "10. Заключителни разпоредби: Промените и допълненията изискват писмена форма. Ако някоя разпоредба е недействителна, останалата част от договора остава в сила.",
  ],
  beschriftung: {
    "Mietvertrag für Wohnraum": "Договор за наем на жилище",
    "Vertrag {nummer}": "Договор {nummer}",
    "1. Vertragsparteien": "1. Страни по договора",
    "2. Mietgegenstand": "2. Предмет на наема",
    "3. Mietzeit und Mietzins": "3. Срок и наем",
    "4. Vertragsbedingungen": "4. Условия на договора",
    "5. Hausordnung": "5. Вътрешен правилник",
    "6. Unterschrift": "6. Подпис",
    Vermieter: "Наемодател",
    Mieter: "Наемател",
    Name: "Име",
    Anschrift: "Адрес",
    Telefon: "Телефон",
    "E-Mail": "Имейл",
    "USt-IdNr.": "ДДС номер",
    Geburtsdatum: "Дата на раждане",
    Staatsangehörigkeit: "Гражданство",
    Ausweisnummer: "Номер на документа",
    Meldeanschrift: "Постоянен адрес",
    Firma: "Фирма",
    Objekt: "Обект",
    Zimmer: "Стая",
    Schlafplatz: "Място за спане",
    "wird vor Ort zugewiesen": "определя се на място",
    Mietbeginn: "Начало на наема",
    Mietende: "Край на наема",
    unbefristet: "безсрочно",
    "Miete monatlich": "Месечен наем",
    "Miete monatlich (pauschal)": "Месечен наем (всичко включено)",
    "{betrag} inkl. aller Nebenkosten": "{betrag} с всички разходи",
    "davon Nebenkosten": "в т.ч. разходи",
    Kaution: "Депозит",
    keine: "няма",
    Fälligkeit: "Падеж",
    "zum {tag}. eines Monats im Voraus": "до {tag}-о число на всеки месец, предварително",
    Verwendungszweck: "Основание за плащане",
    Empfänger: "Получател",
    "Zahlung auf": "Плащане по",
    "Unterschrift des Mieters": "Подпис на наемателя",
  },
};

const RO: Texte = {
  titel: "Traducere",
  hinweis: "Traducere doar pentru citire. Este valabilă versiunea germană a contractului.",
  intro: "Între proprietar și chiriaș se încheie următorul contract de închiriere de locuință pentru un loc de dormit mobilat în camera menționată.",
  kuendigung: "Contractul poate fi reziliat de oricare dintre părți, în scris, cu un preaviz de o lună până la sfârșitul lunii.",
  hausordnung:
    "Liniște pe timpul nopții 22:00–06:00 · Fumatul interzis în toate spațiile interioare · Bucătăria și baia se lasă curate după folosire · Gunoiul se sortează · Fără animale de companie · Vizite doar cu acord prealabil",
  hausordnungObjekt: "Regulamentul casei al obiectivului",
  unterschriebenAm: "Semnat electronic la",
  bedingungen: [
    "1. Obiectul închirierii: Locul de dormit descris mai sus în camera menționată se închiriază pentru folosință exclusivă. Bucătăria, baia și spațiile comune se folosesc împreună cu ceilalți locatari.",
    "2. Scopul: Cazarea se acordă în scop de locuit, în legătură cu activitatea chiriașului în afara domiciliului.",
    "3. Chiria: Chiria se plătește în avans, până la data scadentă convenită, în contul proprietarului. Costurile de exploatare și utilitățile, precum și curentul, apa, încălzirea și internetul sunt incluse în chirie, dacă nu s-a convenit altfel.",
    "4. Garanția: Garanția convenită se depune înainte de mutare și se restituie după predarea corespunzătoare a locului de dormit și achitarea tuturor datoriilor.",
    "5. Folosința: Cazarea poate fi folosită doar de persoana menționată în contract. Primirea altor persoane și subînchirierea nu sunt permise.",
    "6. Regulamentul casei: Regulamentul casei face parte din acest contract. Fumatul este interzis în toate spațiile interioare. Între orele 22:00 și 06:00 trebuie respectată liniștea de noapte.",
    "7. Predarea: La încetarea contractului, locul de dormit se predă curat și eliberat. Toate cheile se predau. Pentru cheile nereturnate se facturează costul înlocuirii sistemului de încuietori.",
    "8. Răspunderea: Chiriașul răspunde pentru pagubele cauzate de el. Proprietarul nu își asumă răspunderea pentru bunurile aduse în locuință.",
    "9. Obligația de înregistrare: Chiriașul se obligă să îndeplinească obligațiile de înregistrare necesare pentru șederea sa și să primească, la cerere, confirmarea proprietarului (Wohnungsgeberbestätigung).",
    "10. Dispoziții finale: Modificările și completările necesită forma scrisă. Dacă o prevedere este nevalabilă, restul contractului rămâne valabil.",
  ],
  beschriftung: {
    "Mietvertrag für Wohnraum": "Contract de închiriere locuință",
    "Vertrag {nummer}": "Contract {nummer}",
    "1. Vertragsparteien": "1. Părțile contractului",
    "2. Mietgegenstand": "2. Obiectul închirierii",
    "3. Mietzeit und Mietzins": "3. Durata și chiria",
    "4. Vertragsbedingungen": "4. Condițiile contractului",
    "5. Hausordnung": "5. Regulamentul casei",
    "6. Unterschrift": "6. Semnătura",
    Vermieter: "Proprietar",
    Mieter: "Chiriaș",
    Name: "Nume",
    Anschrift: "Adresa",
    Telefon: "Telefon",
    "E-Mail": "E-mail",
    "USt-IdNr.": "Cod TVA",
    Geburtsdatum: "Data nașterii",
    Staatsangehörigkeit: "Cetățenie",
    Ausweisnummer: "Nr. actului de identitate",
    Meldeanschrift: "Adresa de domiciliu",
    Firma: "Firma",
    Objekt: "Obiectiv",
    Zimmer: "Camera",
    Schlafplatz: "Loc de dormit",
    "wird vor Ort zugewiesen": "se stabilește la fața locului",
    Mietbeginn: "Începutul închirierii",
    Mietende: "Sfârșitul închirierii",
    unbefristet: "pe durată nedeterminată",
    "Miete monatlich": "Chirie lunară",
    "Miete monatlich (pauschal)": "Chirie lunară (totul inclus)",
    "{betrag} inkl. aller Nebenkosten": "{betrag} cu toate utilitățile incluse",
    "davon Nebenkosten": "din care utilități",
    Kaution: "Garanție",
    keine: "niciuna",
    Fälligkeit: "Scadența",
    "zum {tag}. eines Monats im Voraus": "până pe {tag} ale fiecărei luni, în avans",
    Verwendungszweck: "Referința plății",
    Empfänger: "Beneficiar",
    "Zahlung auf": "Plata în contul",
    "Unterschrift des Mieters": "Semnătura chiriașului",
  },
};

const HU: Texte = {
  titel: "Fordítás",
  hinweis: "Fordítás csak olvasásra. A szerződés német változata az irányadó.",
  intro: "A bérbeadó és a bérlő között a következő lakásbérleti szerződés jön létre egy bútorozott alvóhelyre a megnevezett szobában.",
  kuendigung: "A bérleti jogviszonyt bármelyik fél írásban, egy hónapos felmondási idővel a hónap végére felmondhatja.",
  hausordnung:
    "Éjszakai csend 22:00–06:00 · Minden belső helyiségben tilos a dohányzás · A konyhát és a fürdőt használat után tisztán kell hagyni · Szelektív hulladékgyűjtés · Háziállat nem tartható · Látogatók csak előzetes egyeztetéssel",
  hausordnungObjekt: "Az ingatlan házirendje",
  unterschriebenAm: "Elektronikusan aláírva:",
  bedingungen: [
    "1. A bérlet tárgya: A fent megnevezett szobában lévő alvóhely kizárólagos használatra kerül átadásra. A konyhát, a fürdőt és a közös helyiségeket a többi lakóval közösen kell használni.",
    "2. A bérlet célja: A szállás lakás céljára szolgál, a bérlő lakóhelyén kívüli munkavégzésével összefüggésben.",
    "3. Bérleti díj: A bérleti díjat előre, a megállapodott esedékességi napig kell a bérbeadó számlájára befizetni. Az üzemeltetési és rezsiköltségek, valamint az áram, a víz, a fűtés és az internet a bérleti díjban benne vannak, hacsak másként nem állapodtak meg.",
    "4. Kaució: A megállapodott kauciót beköltözés előtt kell befizetni; az alvóhely szabályszerű visszaadása és minden követelés rendezése után visszajár.",
    "5. Használat: A szállást csak a szerződésben megnevezett személy használhatja. Más személyek befogadása és az albérletbe adás nem megengedett.",
    "6. Házirend: A házirend e szerződés része. Minden belső helyiségben tilos a dohányzás. 22:00 és 06:00 óra között éjszakai csendet kell tartani.",
    "7. Visszaadás: A szerződés végén az alvóhelyet kitakarítva és kiürítve kell visszaadni. Minden kulcsot vissza kell adni. A vissza nem adott kulcsok esetén a zárrendszer cseréjének költségét kiszámlázzuk.",
    "8. Felelősség: A bérlő felel az általa okozott károkért. A bérbeadó nem vállal felelősséget a szállásra bevitt tárgyakért.",
    "9. Bejelentési kötelezettség: A bérlő vállalja, hogy teljesíti a tartózkodáshoz szükséges lakcím-bejelentési kötelezettségeit, és kérésre átveszi a szállásadói igazolást (Wohnungsgeberbestätigung).",
    "10. Záró rendelkezések: A módosításokhoz és kiegészítésekhez írásbeli forma szükséges. Ha valamely rendelkezés érvénytelen, a szerződés többi része érvényes marad.",
  ],
  beschriftung: {
    "Mietvertrag für Wohnraum": "Lakásbérleti szerződés",
    "Vertrag {nummer}": "Szerződés {nummer}",
    "1. Vertragsparteien": "1. Szerződő felek",
    "2. Mietgegenstand": "2. A bérlet tárgya",
    "3. Mietzeit und Mietzins": "3. Időtartam és bérleti díj",
    "4. Vertragsbedingungen": "4. Szerződési feltételek",
    "5. Hausordnung": "5. Házirend",
    "6. Unterschrift": "6. Aláírás",
    Vermieter: "Bérbeadó",
    Mieter: "Bérlő",
    Name: "Név",
    Anschrift: "Cím",
    Telefon: "Telefon",
    "E-Mail": "E-mail",
    "USt-IdNr.": "Adószám",
    Geburtsdatum: "Születési dátum",
    Staatsangehörigkeit: "Állampolgárság",
    Ausweisnummer: "Igazolvány száma",
    Meldeanschrift: "Állandó lakcím",
    Firma: "Cég",
    Objekt: "Ingatlan",
    Zimmer: "Szoba",
    Schlafplatz: "Alvóhely",
    "wird vor Ort zugewiesen": "a helyszínen kerül kijelölésre",
    Mietbeginn: "A bérlet kezdete",
    Mietende: "A bérlet vége",
    unbefristet: "határozatlan idejű",
    "Miete monatlich": "Havi bérleti díj",
    "Miete monatlich (pauschal)": "Havi bérleti díj (átalány)",
    "{betrag} inkl. aller Nebenkosten": "{betrag}, minden rezsivel együtt",
    "davon Nebenkosten": "ebből rezsi",
    Kaution: "Kaució",
    keine: "nincs",
    Fälligkeit: "Esedékesség",
    "zum {tag}. eines Monats im Voraus": "minden hónap {tag}. napjáig, előre",
    Verwendungszweck: "Közlemény",
    Empfänger: "Kedvezményezett",
    "Zahlung auf": "Fizetés ide",
    "Unterschrift des Mieters": "A bérlő aláírása",
  },
};

const EN: Texte = {
  titel: "Translation",
  hinweis: "Translation for reading only. The German version of the contract is binding.",
  intro: "Between the landlord and the tenant, the following residential rental contract for a furnished sleeping place in the stated room is concluded.",
  kuendigung: "Either party may terminate the tenancy in text form with one month's notice to the end of a month.",
  hausordnung:
    "Quiet hours 22:00–06:00 · No smoking in any indoor area · Leave kitchen and bathroom clean after use · Separate the waste · No pets · Visitors only by arrangement",
  hausordnungObjekt: "House rules of the property",
  unterschriebenAm: "Signed electronically on",
  bedingungen: [
    "1. Rented item: The sleeping place described above in the stated room is let for sole use. Kitchen, bathroom and common rooms are shared with the other residents.",
    "2. Purpose: The accommodation is provided for residential purposes in connection with the tenant's work away from home.",
    "3. Rent: The rent is payable in advance by the agreed due date to the landlord's account. Operating and service costs as well as electricity, water, heating and internet are included in the rent unless otherwise agreed.",
    "4. Deposit: An agreed deposit must be paid before moving in and will be refunded after proper return of the sleeping place and settlement of all claims.",
    "5. Use: The accommodation may only be used by the person named in the contract. Taking in other persons and subletting are not permitted.",
    "6. House rules: The house rules form part of this contract. Smoking is prohibited in all indoor areas. Quiet hours must be observed from 22:00 to 06:00.",
    "7. Return: At the end of the contract the sleeping place must be returned swept clean and vacated. All keys must be handed back. For keys not returned, the cost of replacing the locking system will be charged.",
    "8. Liability: The tenant is liable for damage they cause. The landlord accepts no liability for items brought into the accommodation.",
    "9. Registration: The tenant assures that they will fulfil the registration obligations required for the stay and will accept a landlord confirmation (Wohnungsgeberbestätigung) on request.",
    "10. Final provisions: Changes and additions require text form. Should a provision be invalid, the rest of the contract remains valid.",
  ],
  beschriftung: {
    "Mietvertrag für Wohnraum": "Residential rental contract",
    "Vertrag {nummer}": "Contract {nummer}",
    "1. Vertragsparteien": "1. Parties",
    "2. Mietgegenstand": "2. Rented item",
    "3. Mietzeit und Mietzins": "3. Term and rent",
    "4. Vertragsbedingungen": "4. Terms and conditions",
    "5. Hausordnung": "5. House rules",
    "6. Unterschrift": "6. Signature",
    Vermieter: "Landlord",
    Mieter: "Tenant",
    Name: "Name",
    Anschrift: "Address",
    Telefon: "Phone",
    "E-Mail": "Email",
    "USt-IdNr.": "VAT ID",
    Geburtsdatum: "Date of birth",
    Staatsangehörigkeit: "Nationality",
    Ausweisnummer: "ID number",
    Meldeanschrift: "Home address",
    Firma: "Company",
    Objekt: "Property",
    Zimmer: "Room",
    Schlafplatz: "Sleeping place",
    "wird vor Ort zugewiesen": "assigned on site",
    Mietbeginn: "Start of tenancy",
    Mietende: "End of tenancy",
    unbefristet: "open-ended",
    "Miete monatlich": "Monthly rent",
    "Miete monatlich (pauschal)": "Monthly rent (flat rate)",
    "{betrag} inkl. aller Nebenkosten": "{betrag} incl. all utilities",
    "davon Nebenkosten": "of which utilities",
    Kaution: "Deposit",
    keine: "none",
    Fälligkeit: "Due date",
    "zum {tag}. eines Monats im Voraus": "by day {tag} of each month, in advance",
    Verwendungszweck: "Payment reference",
    Empfänger: "Recipient",
    "Zahlung auf": "Pay to",
    "Unterschrift des Mieters": "Tenant's signature",
  },
};

const ALLE: Record<UebersetzteSprache, Texte> = { sq: SQ, bg: BG, ro: RO, hu: HU, en: EN };

export function istUebersetzteSprache(s: string | null | undefined): s is UebersetzteSprache {
  return Boolean(s && s in ALLE);
}

const gleich = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export type Vertragsuebersetzung = {
  sprache: UebersetzteSprache;
  titel: string;
  hinweis: string;
  unterschriebenAm: string;
  /** Beschriftung uebersetzen; unbekannt -> null */
  beschriftung: (deutsch: string, werte?: Record<string, string | number>) => string | null;
  intro: (deutsch: string) => string;
  kuendigung: (deutsch: string) => string;
  hausordnung: (deutsch: string) => string;
  /** Bedingungen zeilenweise; nur bekannte Zeilen werden uebersetzt */
  bedingungen: (deutsch: string) => string[];
};

export function vertragsuebersetzung(sprache: string | null | undefined): Vertragsuebersetzung | null {
  if (!istUebersetzteSprache(sprache)) return null;
  const x = ALLE[sprache];
  return {
    sprache,
    titel: x.titel,
    hinweis: x.hinweis,
    unterschriebenAm: x.unterschriebenAm,
    beschriftung: (deutsch, werte) => {
      const text = x.beschriftung[deutsch];
      if (!text) return null;
      return text.replace(/\{(\w+)\}/g, (_, n: string) => String(werte?.[n] ?? `{${n}}`));
    },
    intro: (deutsch) => (gleich(deutsch, ORIGINAL.intro) ? x.intro : deutsch),
    kuendigung: (deutsch) => (gleich(deutsch, ORIGINAL.kuendigung) ? x.kuendigung : deutsch),
    hausordnung: (deutsch) => {
      // "…\n\nHausordnung des Objekts: https://…" - Zusatz des Objekts mit uebersetzen.
      const [haupt, ...rest] = deutsch.split("\n\nHausordnung des Objekts: ");
      const text = gleich(haupt, ORIGINAL.hausordnung) ? x.hausordnung : haupt;
      return rest.length ? `${text}\n\n${x.hausordnungObjekt}: ${rest.join("")}` : text;
    },
    bedingungen: (deutsch) =>
      deutsch
        .split("\n")
        .map((zeile) => zeile.trim())
        .filter(Boolean)
        .map((zeile) => {
          const i = ORIGINAL.bedingungen.findIndex((o) => gleich(o, zeile));
          return i >= 0 ? x.bedingungen[i] : zeile;
        }),
  };
}

/** Fuer Tests: jede Sprache vollstaendig, Platzhalter gleich. */
export function vertragsuebersetzungVollstaendig(beschriftungen: string[]): string[] {
  const fehler: string[] = [];
  for (const [sprache, x] of Object.entries(ALLE)) {
    if (x.bedingungen.length !== ORIGINAL.bedingungen.length) fehler.push(`${sprache}: Bedingungen`);
    for (const b of beschriftungen) {
      if (!x.beschriftung[b]) fehler.push(`${sprache}: ${b}`);
      else {
        const p = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).join();
        if (p(b) !== p(x.beschriftung[b])) fehler.push(`${sprache}: Platzhalter ${b}`);
      }
    }
  }
  return fehler;
}
