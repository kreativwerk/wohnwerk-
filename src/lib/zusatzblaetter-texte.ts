/**
 * Texte der Zusatzblaetter zum Mietvertrag: Hausregeln und Muelltrennung.
 *
 * Gedruckt wird immer Deutsch und - wenn der Mieter eine andere Sprache
 * liest - dieselbe Regel in seiner Sprache direkt daneben. So koennen
 * Hausverwaltung und Bewohner auf dasselbe Blatt zeigen.
 */

import type { KautionSprache } from "./mahnung";

export type Regel = { titel: string; text: string };

export type TonnenArt = "gelb" | "papier" | "bio" | "rest" | "glas" | "pfand" | "sonder";

export type Tonne = { name: string; rein: string; nicht?: string };

export type ZusatzTexte = {
  zusatz: string;
  hausregeln: string;
  hausregelnIntro: string;
  regeln: Regel[];
  muell: string;
  muellIntro: string;
  rein: string;
  nicht: string;
  tonnen: Record<TonnenArt, Tonne>;
  abfuhr: string;
  bestaetigung: string;
  name: string;
  ortDatum: string;
  unterschrift: string;
};

/** Reihenfolge auf dem Blatt. */
export const TONNEN_REIHENFOLGE: readonly TonnenArt[] = ["gelb", "papier", "bio", "rest", "glas", "pfand", "sonder"];

const DE: ZusatzTexte = {
  zusatz: "Zusatzblatt zum Mietvertrag",
  hausregeln: "Hausregeln",
  hausregelnIntro:
    "Damit das Zusammenleben für alle gut funktioniert, gelten in der Unterkunft folgende Regeln. Wer wiederholt dagegen verstößt, bekommt eine Abmahnung und muss im Ernstfall mit der Kündigung rechnen.",
  regeln: [
    { titel: "Nachtruhe", text: "Von 22:00 bis 6:00 Uhr ist Ruhe im Haus. Keine laute Musik, keine Feiern – auch am Wochenende." },
    { titel: "Rauchen nur draußen", text: "Rauchen ist in allen Räumen verboten, auch E-Zigaretten und Shisha. Kippen in den Aschenbecher, nicht auf den Boden." },
    { titel: "Küche und Bad", text: "Nach jeder Benutzung sauber hinterlassen. Geschirr gleich spülen, Lebensmittel nicht offen stehen lassen. Den Putzplan einhalten." },
    { titel: "Richtig lüften", text: "3× am Tag 5–10 Minuten das Fenster ganz öffnen, nicht dauernd gekippt lassen. Wäsche nicht im Zimmer trocknen – so entsteht kein Schimmel." },
    { titel: "Heizung und Strom", text: "Beim Lüften die Heizung zudrehen. Keine eigenen Heizlüfter, Kochplatten oder Elektrogrills im Zimmer. Licht aus und Fenster zu, wenn Sie gehen." },
    { titel: "Brandschutz", text: "Keine Kerzen, kein offenes Feuer. Flure und Treppen frei halten. Rauchmelder nie abdecken oder abbauen." },
    { titel: "Besuch", text: "Besuch nur nach Absprache mit der Hausverwaltung. Übernachtungsgäste sind nicht erlaubt." },
    { titel: "Keine Haustiere", text: "Tiere dürfen nicht gehalten werden." },
    { titel: "Schäden melden", text: "Defekte (Wasser, Strom, Heizung, Fenster) sofort der Hausverwaltung melden. Selbst verursachte Schäden werden in Rechnung gestellt." },
    { titel: "Schlüssel", text: "Schlüssel nicht weitergeben oder nachmachen lassen. Verlust sofort melden – die Kosten für Ersatz trägt der Mieter." },
    { titel: "Toilette", text: "Keine Feuchttücher, Hygieneartikel, Essensreste oder Fett in Toilette oder Abfluss." },
    { titel: "Zimmer und Betten", text: "Betten, Zimmer und Möbel nicht eigenmächtig tauschen oder umstellen. Die Hausverwaltung weist die Schlafplätze zu." },
    { titel: "Nachbarn und Parken", text: "Rücksicht auf die Nachbarn nehmen. Nur auf den erlaubten Flächen parken, Einfahrten frei halten." },
  ],
  muell: "Mülltrennung",
  muellIntro:
    "Müll muss in Deutschland getrennt werden. Falsch befüllte Tonnen werden nicht geleert – die Kosten für Nachsortieren oder Sonderabholung werden auf die Bewohner umgelegt.",
  rein: "Hinein",
  nicht: "Nicht hinein",
  tonnen: {
    gelb: {
      name: "Gelber Sack / Gelbe Tonne",
      rein: "Verpackungen aus Plastik, Metall und Verbundstoff: Joghurtbecher, Plastikflaschen ohne Pfand, Folien, Konservendosen, Getränkekartons, Alufolie. Leer, aber nicht ausgespült.",
      nicht: "Papier, Glas, Essensreste, Spielzeug.",
    },
    papier: {
      name: "Papiertonne (blau)",
      rein: "Zeitungen, Prospekte, Kartons (flach falten), Papiertüten, Eierkartons.",
      nicht: "Verschmutztes oder nasses Papier, benutzte Taschentücher, Kassenbons.",
    },
    bio: {
      name: "Biotonne (braun)",
      rein: "Obst- und Gemüsereste, Speisereste, Kaffeesatz, Filter, Teebeutel, Eierschalen.",
      nicht: "Plastiktüten – auch keine „kompostierbaren“ –, Flüssigkeiten, Verpackungen.",
    },
    rest: {
      name: "Restmüll (grau/schwarz)",
      rein: "Alles, was nicht wiederverwertet werden kann: benutzte Taschentücher, Hygieneartikel, Staubsaugerbeutel, Kehricht, kalte Zigarettenkippen, Kassenbons, zerbrochenes Geschirr.",
      nicht: "Batterien, Elektrogeräte, Wertstoffe.",
    },
    glas: {
      name: "Glascontainer",
      rein: "Leere Flaschen und Gläser, nach Farbe: weiß, grün, braun (andere Farben zu grün). Deckel ab.",
      nicht: "Trinkgläser, Spiegel, Fensterglas, Porzellan. Einwurf nur zu den angeschriebenen Zeiten, nie an Sonn- und Feiertagen.",
    },
    pfand: {
      name: "Pfandflaschen und -dosen",
      rein: "Mit Pfandzeichen (25 Cent): zurück in den Supermarkt – Sie bekommen Geld zurück.",
    },
    sonder: {
      name: "Batterien, Elektro, Sperrmüll",
      rein: "Batterien in die Sammelbox im Supermarkt. Elektrogeräte, Lampen, Farben zum Wertstoffhof. Möbel und Matratzen nur nach Absprache mit der Hausverwaltung.",
    },
  },
  abfuhr:
    "Abfuhrtermine stehen im Abfallkalender der Gemeinde bzw. in der Abfall-App des Landkreises. Die Tonnen am Abend vorher an die Straße stellen und nach der Leerung wieder zurückstellen.",
  bestaetigung: "Ich habe die Hausregeln und die Hinweise zur Mülltrennung gelesen und verstanden.",
  name: "Name",
  ortDatum: "Ort, Datum",
  unterschrift: "Unterschrift",
};

const SQ: ZusatzTexte = {
  zusatz: "Fletë shtesë e kontratës së qirasë",
  hausregeln: "Rregullat e shtëpisë",
  hausregelnIntro:
    "Që jetesa e përbashkët të funksionojë mirë për të gjithë, në banesë vlejnë rregullat e mëposhtme. Kush i shkel në mënyrë të përsëritur, merr paralajmërim me shkrim dhe në rast të rëndë edhe ndërprerje të kontratës.",
  regeln: [
    { titel: "Qetësia e natës", text: "Nga ora 22:00 deri në 06:00 duhet qetësi në shtëpi. Pa muzikë të lartë, pa festa – edhe në fundjavë." },
    { titel: "Duhani vetëm jashtë", text: "Pirja e duhanit është e ndaluar në të gjitha ambientet, edhe cigaret elektronike dhe nargjileja. Bishtat në tavëll, jo në tokë." },
    { titel: "Kuzhina dhe banjo", text: "Pas çdo përdorimi lërini të pastra. Lani enët menjëherë, mos lini ushqime të hapura. Respektoni planin e pastrimit." },
    { titel: "Ajrosja e duhur", text: "3 herë në ditë hapeni dritaren plotësisht për 5–10 minuta, mos e lini gjithmonë gjysmë të hapur. Mos thani rroba në dhomë – kështu nuk krijohet myk." },
    { titel: "Ngrohja dhe rryma", text: "Gjatë ajrosjes mbyllni kaloriferin. Pa ngrohës elektrikë, pllaka gatimi apo skara elektrike në dhomë. Fikni dritën dhe mbyllni dritaren kur dilni." },
    { titel: "Mbrojtja nga zjarri", text: "Pa qirinj, pa zjarr të hapur. Korridoret dhe shkallët mbajini të lira. Asnjëherë mos e mbuloni ose hiqni detektorin e tymit." },
    { titel: "Vizitorët", text: "Vizita vetëm me marrëveshje me administratën. Mysafirët nuk lejohen të flenë këtu." },
    { titel: "Pa kafshë shtëpiake", text: "Nuk lejohet mbajtja e kafshëve." },
    { titel: "Njoftoni dëmet", text: "Defektet (ujë, rrymë, ngrohje, dritare) njoftojini menjëherë administratës. Dëmet e shkaktuara nga ju do t'ju faturohen." },
    { titel: "Çelësat", text: "Mos ua jepni çelësat të tjerëve dhe mos i kopjoni. Humbjen njoftojeni menjëherë – kostot e zëvendësimit i paguan qiramarrësi." },
    { titel: "Tualeti", text: "Mos hidhni peceta të lagura, artikuj higjienikë, mbetje ushqimi apo yndyrë në tualet ose lavaman." },
    { titel: "Dhomat dhe shtretërit", text: "Mos ndërroni ose zhvendosni shtretërit, dhomat apo mobiljet pa leje. Administrata cakton vendet e fjetjes." },
    { titel: "Fqinjët dhe parkimi", text: "Kini respekt për fqinjët. Parkoni vetëm në vendet e lejuara, mbani hyrjet të lira." },
  ],
  muell: "Ndarja e mbeturinave",
  muellIntro:
    "Në Gjermani mbeturinat duhet të ndahen. Kazanët e mbushur gabim nuk zbrazen – kostot për rindarjen ose marrjen e veçantë u ngarkohen banorëve.",
  rein: "Hidhni këtu",
  nicht: "Mos hidhni",
  tonnen: {
    gelb: {
      name: "Thesi i verdhë / Kazani i verdhë",
      rein: "Ambalazhe plastike, metali dhe të përbëra: gota kosi, shishe plastike pa kauzion, najlone, kanaçe konservash, kuti pijesh (tetrapak), letër alumini. Bosh, nuk duhet larë.",
      nicht: "Letër, xhami, mbetje ushqimi, lodra.",
    },
    papier: {
      name: "Kazani i letrës (blu)",
      rein: "Gazeta, fletëpalosje, kartona (të palosur), qese letre, kuti vezësh.",
      nicht: "Letër e ndotur ose e lagur, shami letre të përdorura, kupona arke.",
    },
    bio: {
      name: "Kazani bio (kafe)",
      rein: "Mbetje frutash dhe perimesh, mbetje ushqimi, llum kafeje, filtra, çantëza çaji, lëvozhga vezësh.",
      nicht: "Qese plastike – as ato „të kompostueshme“ –, lëngje, ambalazhe.",
    },
    rest: {
      name: "Mbeturina të përziera (gri/zi)",
      rein: "Gjithçka që nuk riciklohet: shami letre të përdorura, artikuj higjienikë, qese të fshesës elektrike, pluhur, bishta cigaresh të fikur, kupona arke, enë të thyera.",
      nicht: "Bateri, pajisje elektrike, materiale të riciklueshme.",
    },
    glas: {
      name: "Kontejneri i xhamit",
      rein: "Shishe dhe kavanoza bosh, sipas ngjyrës: e bardhë, jeshile, kafe (ngjyrat e tjera te jeshilja). Hiqni kapakët.",
      nicht: "Gota pijeje, pasqyra, xham dritaresh, porcelan. Hidhni vetëm në oraret e shkruara, asnjëherë të dielave dhe në festa.",
    },
    pfand: {
      name: "Shishe dhe kanaçe me kauzion",
      rein: "Me shenjën e kauzionit (25 cent): kthejini në supermarket – merrni para mbrapsht.",
    },
    sonder: {
      name: "Bateri, pajisje elektrike, mbeturina të mëdha",
      rein: "Bateritë në kutinë e grumbullimit në supermarket. Pajisjet elektrike, llambat, bojërat në qendrën e riciklimit (Wertstoffhof). Mobiljet dhe dyshekët vetëm me marrëveshje me administratën.",
    },
  },
  abfuhr:
    "Datat e mbledhjes janë në kalendarin e mbeturinave të komunës ose në aplikacionin e mbeturinave të rrethit. Nxirrni kazanët në rrugë një mbrëmje më parë dhe kthejini pas zbrazjes.",
  bestaetigung: "Kam lexuar dhe kuptuar rregullat e shtëpisë dhe udhëzimet për ndarjen e mbeturinave.",
  name: "Emri",
  ortDatum: "Vendi, data",
  unterschrift: "Nënshkrimi",
};

const BG: ZusatzTexte = {
  zusatz: "Допълнителен лист към договора за наем",
  hausregeln: "Правила на дома",
  hausregelnIntro:
    "За да върви съвместният живот добре за всички, в жилището важат следните правила. При повторни нарушения следва писмено предупреждение, а в сериозни случаи – прекратяване на договора.",
  regeln: [
    { titel: "Нощна тишина", text: "От 22:00 до 06:00 ч. в къщата трябва да е тихо. Без силна музика и купони – и през уикенда." },
    { titel: "Пушене само навън", text: "Пушенето е забранено във всички помещения, включително електронни цигари и наргиле. Фасовете – в пепелника, не на земята." },
    { titel: "Кухня и баня", text: "След всяко ползване ги оставяйте чисти. Измивайте съдовете веднага, не оставяйте храна открита. Спазвайте графика за почистване." },
    { titel: "Правилно проветряване", text: "3 пъти на ден отваряйте прозореца изцяло за 5–10 минути, не го оставяйте постоянно открехнат. Не сушете пране в стаята – така няма да се появи мухъл." },
    { titel: "Отопление и ток", text: "Докато проветрявате, спирайте радиатора. Без собствени духалки, котлони или електрически скари в стаята. Гасете лампата и затваряйте прозореца, когато излизате." },
    { titel: "Пожарна безопасност", text: "Без свещи и открит огън. Коридорите и стълбите да са свободни. Никога не покривайте и не махайте димния датчик." },
    { titel: "Гости", text: "Гости само след съгласуване с управлението. Нощуване на гости не е разрешено." },
    { titel: "Без домашни животни", text: "Не е разрешено отглеждането на животни." },
    { titel: "Съобщавайте за повреди", text: "Повреди (вода, ток, отопление, прозорци) съобщавайте веднага на управлението. Щетите, причинени от вас, се заплащат от вас." },
    { titel: "Ключове", text: "Не давайте ключовете на други и не ги копирайте. При загуба съобщете веднага – разходите за подмяна са за сметка на наемателя." },
    { titel: "Тоалетна", text: "Не хвърляйте мокри кърпички, хигиенни продукти, остатъци от храна или мазнина в тоалетната или мивката." },
    { titel: "Стаи и легла", text: "Не сменяйте и не местете легла, стаи или мебели без разрешение. Управлението разпределя местата за спане." },
    { titel: "Съседи и паркиране", text: "Отнасяйте се с уважение към съседите. Паркирайте само на разрешените места, не запречвайте входовете." },
  ],
  muell: "Разделяне на отпадъците",
  muellIntro:
    "В Германия отпадъците трябва да се разделят. Неправилно напълнените кофи не се изпразват – разходите за пресортиране или специално извозване се поемат от живущите.",
  rein: "Изхвърляйте тук",
  nicht: "Не изхвърляйте",
  tonnen: {
    gelb: {
      name: "Жълт чувал / жълта кофа",
      rein: "Опаковки от пластмаса, метал и комбинирани материали: кофички от кисело мляко, пластмасови бутилки без депозит, фолио, консервени кутии, кутии от напитки (тетрапак), алуминиево фолио. Празни, не е нужно да се мият.",
      nicht: "Хартия, стъкло, остатъци от храна, играчки.",
    },
    papier: {
      name: "Кофа за хартия (синя)",
      rein: "Вестници, брошури, кашони (сгънати), хартиени торбички, кутии за яйца.",
      nicht: "Замърсена или мокра хартия, използвани носни кърпички, касови бележки.",
    },
    bio: {
      name: "Био кофа (кафява)",
      rein: "Остатъци от плодове и зеленчуци, остатъци от храна, утайка от кафе, филтри, пакетчета чай, черупки от яйца.",
      nicht: "Найлонови торбички – и „компостируемите“ –, течности, опаковки.",
    },
    rest: {
      name: "Смесени отпадъци (сива/черна)",
      rein: "Всичко, което не се рециклира: използвани носни кърпички, хигиенни продукти, торби от прахосмукачка, смет, изгасени фасове, касови бележки, счупени съдове.",
      nicht: "Батерии, електроуреди, рециклируеми материали.",
    },
    glas: {
      name: "Контейнер за стъкло",
      rein: "Празни бутилки и буркани, по цвят: бяло, зелено, кафяво (другите цветове – при зеленото). Махнете капачките.",
      nicht: "Чаши за пиене, огледала, прозоречно стъкло, порцелан. Изхвърляне само в посочените часове, никога в неделя и празници.",
    },
    pfand: {
      name: "Бутилки и кутии с депозит",
      rein: "Със знака за депозит (25 цента): върнете ги в супермаркета – получавате пари обратно.",
    },
    sonder: {
      name: "Батерии, електроуреди, едрогабаритни отпадъци",
      rein: "Батериите – в кутията за събиране в супермаркета. Електроуреди, лампи, бои – в пункта за отпадъци (Wertstoffhof). Мебели и матраци само след съгласуване с управлението.",
    },
  },
  abfuhr:
    "Датите на извозване са в календара за отпадъци на общината или в приложението за отпадъци на окръга. Изнесете кофите на улицата вечерта преди това и ги приберете след изпразването.",
  bestaetigung: "Прочетох и разбрах правилата на дома и указанията за разделяне на отпадъците.",
  name: "Име",
  ortDatum: "Място, дата",
  unterschrift: "Подпис",
};

const RO: ZusatzTexte = {
  zusatz: "Anexă la contractul de închiriere",
  hausregeln: "Regulile casei",
  hausregelnIntro:
    "Pentru ca traiul împreună să funcționeze bine pentru toți, în locuință se aplică următoarele reguli. Cine le încalcă în mod repetat primește un avertisment scris, iar în cazuri grave contractul poate fi reziliat.",
  regeln: [
    { titel: "Liniștea de noapte", text: "Între orele 22:00 și 06:00 este liniște în casă. Fără muzică tare, fără petreceri – nici în weekend." },
    { titel: "Fumatul doar afară", text: "Fumatul este interzis în toate încăperile, inclusiv țigările electronice și narghileaua. Mucurile în scrumieră, nu pe jos." },
    { titel: "Bucătăria și baia", text: "Lăsați-le curate după fiecare folosire. Spălați vasele imediat, nu lăsați alimente descoperite. Respectați planul de curățenie." },
    { titel: "Aerisirea corectă", text: "De 3 ori pe zi deschideți fereastra complet timp de 5–10 minute, nu o lăsați mereu întredeschisă. Nu uscați rufe în cameră – așa nu apare mucegai." },
    { titel: "Încălzirea și curentul", text: "Când aerisiți, închideți caloriferul. Fără aeroterme, plite sau grătare electrice proprii în cameră. Stingeți lumina și închideți fereastra când plecați." },
    { titel: "Protecția la incendiu", text: "Fără lumânări, fără foc deschis. Holurile și scările trebuie să rămână libere. Nu acoperiți și nu demontați niciodată detectorul de fum." },
    { titel: "Vizitele", text: "Vizite doar cu acordul administrației. Musafirii nu au voie să rămână peste noapte." },
    { titel: "Fără animale de companie", text: "Nu este permisă ținerea de animale." },
    { titel: "Anunțați defectele", text: "Defectele (apă, curent, încălzire, ferestre) se anunță imediat administrației. Daunele provocate de dumneavoastră vă vor fi facturate." },
    { titel: "Cheile", text: "Nu dați cheile altcuiva și nu le copiați. Pierderea se anunță imediat – costurile de înlocuire le suportă chiriașul." },
    { titel: "Toaleta", text: "Nu aruncați șervețele umede, articole de igienă, resturi de mâncare sau grăsime în toaletă sau chiuvetă." },
    { titel: "Camerele și paturile", text: "Nu schimbați și nu mutați paturi, camere sau mobilier fără acord. Administrația stabilește locurile de dormit." },
    { titel: "Vecinii și parcarea", text: "Respectați vecinii. Parcați doar pe locurile permise, lăsați intrările libere." },
  ],
  muell: "Colectarea separată a deșeurilor",
  muellIntro:
    "În Germania deșeurile trebuie separate. Pubelele umplute greșit nu sunt golite – costurile pentru resortare sau ridicare specială se împart între locatari.",
  rein: "Aruncați aici",
  nicht: "Nu aruncați",
  tonnen: {
    gelb: {
      name: "Sacul galben / Pubela galbenă",
      rein: "Ambalaje din plastic, metal și materiale compozite: pahare de iaurt, sticle de plastic fără garanție, folii, conserve, cutii de băuturi (tetrapak), folie de aluminiu. Goale, nu e nevoie să fie spălate.",
      nicht: "Hârtie, sticlă, resturi de mâncare, jucării.",
    },
    papier: {
      name: "Pubela de hârtie (albastră)",
      rein: "Ziare, pliante, cutii de carton (pliate), pungi de hârtie, cofraje de ouă.",
      nicht: "Hârtie murdară sau udă, șervețele folosite, bonuri de casă.",
    },
    bio: {
      name: "Pubela bio (maro)",
      rein: "Resturi de fructe și legume, resturi de mâncare, zaț de cafea, filtre, pliculețe de ceai, coji de ou.",
      nicht: "Pungi de plastic – nici cele „compostabile“ –, lichide, ambalaje.",
    },
    rest: {
      name: "Deșeuri reziduale (gri/negru)",
      rein: "Tot ce nu se reciclează: șervețele folosite, articole de igienă, saci de aspirator, gunoi măturat, mucuri de țigară stinse, bonuri de casă, vase sparte.",
      nicht: "Baterii, aparate electrice, materiale reciclabile.",
    },
    glas: {
      name: "Containerul de sticlă",
      rein: "Sticle și borcane goale, după culoare: alb, verde, maro (celelalte culori la verde). Scoateți capacele.",
      nicht: "Pahare, oglinzi, geam de fereastră, porțelan. Aruncați doar în orele afișate, niciodată duminica și de sărbători.",
    },
    pfand: {
      name: "Sticle și doze cu garanție",
      rein: "Cu semnul de garanție (25 de cenți): înapoi la supermarket – primiți banii înapoi.",
    },
    sonder: {
      name: "Baterii, aparate electrice, deșeuri voluminoase",
      rein: "Bateriile în cutia de colectare din supermarket. Aparatele electrice, becurile, vopselele la centrul de reciclare (Wertstoffhof). Mobila și saltelele doar cu acordul administrației.",
    },
  },
  abfuhr:
    "Datele de colectare se găsesc în calendarul de deșeuri al comunei sau în aplicația de deșeuri a districtului. Scoateți pubelele la stradă cu o seară înainte și puneți-le la loc după golire.",
  bestaetigung: "Am citit și am înțeles regulile casei și indicațiile privind colectarea separată a deșeurilor.",
  name: "Nume",
  ortDatum: "Locul, data",
  unterschrift: "Semnătura",
};

const HU: ZusatzTexte = {
  zusatz: "A bérleti szerződés kiegészítő lapja",
  hausregeln: "Házirend",
  hausregelnIntro:
    "Annak érdekében, hogy az együttélés mindenki számára jól működjön, a szálláson az alábbi szabályok érvényesek. Aki ismételten megszegi őket, írásbeli figyelmeztetést, súlyos esetben felmondást kap.",
  regeln: [
    { titel: "Éjszakai csend", text: "22:00 és 06:00 óra között csend van a házban. Nincs hangos zene, nincs buli – hétvégén sem." },
    { titel: "Dohányzás csak kint", text: "Minden helyiségben tilos a dohányzás, az e-cigaretta és a vízipipa is. A csikket a hamutartóba, ne a földre." },
    { titel: "Konyha és fürdő", text: "Minden használat után tisztán kell hagyni. Az edényt azonnal mosogassa el, ne hagyjon ételt nyitva. Tartsa be a takarítási beosztást." },
    { titel: "Helyes szellőztetés", text: "Naponta 3-szor 5–10 percre nyissa ki teljesen az ablakot, ne hagyja állandóan bebillentve. Ne szárítson ruhát a szobában – így nem penészedik." },
    { titel: "Fűtés és áram", text: "Szellőztetéskor zárja el a radiátort. Saját hősugárzó, főzőlap vagy elektromos grill nem használható a szobában. Távozáskor kapcsolja le a villanyt és csukja be az ablakot." },
    { titel: "Tűzvédelem", text: "Gyertya és nyílt láng tilos. A folyosókat és a lépcsőket hagyja szabadon. A füstérzékelőt soha ne takarja le és ne szerelje le." },
    { titel: "Látogatók", text: "Látogató csak a házkezelővel egyeztetve. Vendég nem éjszakázhat." },
    { titel: "Háziállat nem tartható", text: "Állatot tartani nem szabad." },
    { titel: "Hibák bejelentése", text: "A hibákat (víz, áram, fűtés, ablak) azonnal jelentse a házkezelőnek. Az Ön által okozott károkat kiszámlázzuk." },
    { titel: "Kulcsok", text: "A kulcsot ne adja tovább és ne másoltassa le. Elvesztését azonnal jelentse – a pótlás költségét a bérlő viseli." },
    { titel: "WC", text: "Ne dobjon nedves törlőkendőt, egészségügyi terméket, ételmaradékot vagy zsírt a WC-be vagy a lefolyóba." },
    { titel: "Szobák és ágyak", text: "Az ágyakat, szobákat és bútorokat engedély nélkül ne cserélje és ne rendezze át. A fekhelyeket a házkezelő osztja ki." },
    { titel: "Szomszédok és parkolás", text: "Legyen tekintettel a szomszédokra. Csak az engedélyezett helyeken parkoljon, a bejáratokat hagyja szabadon." },
  ],
  muell: "Szelektív hulladékgyűjtés",
  muellIntro:
    "Németországban a hulladékot szelektíven kell gyűjteni. A rosszul megtöltött kukákat nem ürítik ki – az utólagos válogatás vagy a külön elszállítás költségét a lakók viselik.",
  rein: "Ide dobja",
  nicht: "Ne dobja ide",
  tonnen: {
    gelb: {
      name: "Sárga zsák / sárga kuka",
      rein: "Műanyag, fém és társított csomagolások: joghurtos poharak, betétdíj nélküli műanyag palackok, fóliák, konzervdobozok, italos dobozok (tetrapak), alufólia. Üresen, kimosni nem kell.",
      nicht: "Papír, üveg, ételmaradék, játékok.",
    },
    papier: {
      name: "Papírkuka (kék)",
      rein: "Újságok, prospektusok, kartondobozok (lapítva), papírzacskók, tojástartók.",
      nicht: "Szennyezett vagy nedves papír, használt papírzsebkendő, blokkok.",
    },
    bio: {
      name: "Biokuka (barna)",
      rein: "Gyümölcs- és zöldséghulladék, ételmaradék, kávézacc, filter, teafilter, tojáshéj.",
      nicht: "Nejlonzacskó – a „komposztálható“ sem –, folyadékok, csomagolás.",
    },
    rest: {
      name: "Kommunális hulladék (szürke/fekete)",
      rein: "Minden, ami nem hasznosítható újra: használt papírzsebkendő, egészségügyi termékek, porszívózsák, söprés, kialudt csikkek, blokkok, törött edények.",
      nicht: "Elemek, elektromos készülékek, újrahasznosítható anyagok.",
    },
    glas: {
      name: "Üveggyűjtő konténer",
      rein: "Üres palackok és befőttesüvegek, szín szerint: fehér, zöld, barna (a többi szín a zöldhöz). A kupakot vegye le.",
      nicht: "Ivópohár, tükör, ablaküveg, porcelán. Bedobni csak a kiírt időben szabad, vasárnap és ünnepnapon soha.",
    },
    pfand: {
      name: "Betétdíjas palackok és dobozok",
      rein: "Betétdíj-jelzéssel (25 cent): vigye vissza a szupermarketbe – visszakapja a pénzt.",
    },
    sonder: {
      name: "Elemek, elektromos készülékek, lom",
      rein: "Az elemeket a szupermarket gyűjtődobozába. Elektromos készülékeket, izzókat, festékeket a hulladékudvarba (Wertstoffhof). Bútort és matracot csak a házkezelővel egyeztetve.",
    },
  },
  abfuhr:
    "Az elszállítási időpontok a község hulladéknaptárában vagy a járás hulladék-alkalmazásában találhatók. A kukákat előző este tegye ki az utcára, ürítés után tegye vissza.",
  bestaetigung: "A házirendet és a szelektív hulladékgyűjtésre vonatkozó tudnivalókat elolvastam és megértettem.",
  name: "Név",
  ortDatum: "Hely, dátum",
  unterschrift: "Aláírás",
};

const EN: ZusatzTexte = {
  zusatz: "Supplementary sheet to the tenancy agreement",
  hausregeln: "House rules",
  hausregelnIntro:
    "So that living together works well for everyone, the following rules apply in the accommodation. Repeated violations lead to a written warning and, in serious cases, to termination of the contract.",
  regeln: [
    { titel: "Quiet hours", text: "From 10 pm to 6 am the house must be quiet. No loud music, no parties – weekends included." },
    { titel: "Smoking outside only", text: "Smoking is forbidden in all rooms, including e-cigarettes and shisha. Cigarette butts go in the ashtray, not on the ground." },
    { titel: "Kitchen and bathroom", text: "Leave them clean after every use. Wash dishes right away, do not leave food uncovered. Follow the cleaning rota." },
    { titel: "Airing properly", text: "Open the window fully for 5–10 minutes 3 times a day; do not leave it tilted all the time. Do not dry laundry in your room – this prevents mould." },
    { titel: "Heating and electricity", text: "Turn the heating down while airing. No personal fan heaters, hot plates or electric grills in the room. Switch off the light and close the window when you leave." },
    { titel: "Fire safety", text: "No candles, no open flames. Keep corridors and stairs clear. Never cover or remove the smoke detector." },
    { titel: "Visitors", text: "Visitors only after agreement with the property management. Overnight guests are not allowed." },
    { titel: "No pets", text: "Keeping animals is not permitted." },
    { titel: "Report damage", text: "Report defects (water, electricity, heating, windows) to the property management immediately. Damage you cause will be charged to you." },
    { titel: "Keys", text: "Do not hand keys to others or have them copied. Report a loss immediately – the tenant pays for replacement." },
    { titel: "Toilet", text: "Do not flush wet wipes, hygiene products, food waste or fat down the toilet or drain." },
    { titel: "Rooms and beds", text: "Do not swap or move beds, rooms or furniture without permission. The property management assigns the sleeping places." },
    { titel: "Neighbours and parking", text: "Be considerate of the neighbours. Park only in permitted areas and keep driveways clear." },
  ],
  muell: "Waste separation",
  muellIntro:
    "In Germany waste must be separated. Wrongly filled bins are not emptied – the cost of re-sorting or special collection is passed on to the residents.",
  rein: "Put in",
  nicht: "Not in",
  tonnen: {
    gelb: {
      name: "Yellow bag / yellow bin",
      rein: "Packaging made of plastic, metal and composites: yoghurt pots, plastic bottles without deposit, foil, tins, drink cartons, aluminium foil. Empty, no need to rinse.",
      nicht: "Paper, glass, food waste, toys.",
    },
    papier: {
      name: "Paper bin (blue)",
      rein: "Newspapers, leaflets, cardboard boxes (folded flat), paper bags, egg boxes.",
      nicht: "Dirty or wet paper, used tissues, receipts.",
    },
    bio: {
      name: "Organic bin (brown)",
      rein: "Fruit and vegetable scraps, food leftovers, coffee grounds, filters, tea bags, eggshells.",
      nicht: "Plastic bags – not even “compostable” ones –, liquids, packaging.",
    },
    rest: {
      name: "General waste (grey/black)",
      rein: "Everything that cannot be recycled: used tissues, hygiene products, vacuum cleaner bags, sweepings, extinguished cigarette butts, receipts, broken crockery.",
      nicht: "Batteries, electrical devices, recyclables.",
    },
    glas: {
      name: "Glass container",
      rein: "Empty bottles and jars, by colour: white, green, brown (other colours go with green). Remove the lids.",
      nicht: "Drinking glasses, mirrors, window glass, porcelain. Only at the times posted – never on Sundays or public holidays.",
    },
    pfand: {
      name: "Deposit bottles and cans",
      rein: "With the deposit symbol (25 cents): take them back to the supermarket – you get money back.",
    },
    sonder: {
      name: "Batteries, electrical items, bulky waste",
      rein: "Batteries into the collection box at the supermarket. Electrical devices, lamps, paint to the recycling centre (Wertstoffhof). Furniture and mattresses only after agreement with the property management.",
    },
  },
  abfuhr:
    "Collection dates are in the municipal waste calendar or the district's waste app. Put the bins out on the street the evening before and bring them back after emptying.",
  bestaetigung: "I have read and understood the house rules and the waste separation guidelines.",
  name: "Name",
  ortDatum: "Place, date",
  unterschrift: "Signature",
};

const TEXTE: Record<KautionSprache, ZusatzTexte> = { de: DE, sq: SQ, bg: BG, ro: RO, hu: HU, en: EN };

export function zusatzTexte(sprache: KautionSprache): ZusatzTexte {
  return TEXTE[sprache] ?? DE;
}
