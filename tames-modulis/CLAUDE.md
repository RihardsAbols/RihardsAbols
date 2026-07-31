# Tāmju/BOQ Modulis — CLAUDE.md

## Vides ierobežojumi
- Node.js portable, pilnais ceļš: `C:/Users/rihards.abols/Documents/nodejs/node.exe`
  (tas pats binārais, kas Kanban app — analoģija apstiprināta Sesijā 1, skat.
  `ARCHITECTURE_EXPORT.md` §1).
- Bez admin tiesībām, bez instalatora, bez build/bundler soļa kodola loģikai.
- Testi: `node --test` (izmantot pilno `node.exe` ceļu skriptos/dokumentācijā uz lietotāja mašīnas).

## Excel bibliotēkas: `exceljs` (primārā) + `xlsx`/SheetJS (legacy .xls fallback)
Sesijā 1 izvēlēts `exceljs` pār `xlsx`/SheetJS priekš `.xlsx`:
- `xlsx` npm pakotnes community versija ir iesaldēta pie novecojušas versijas (0.18.x); aktīvā
  attīstība pārcelta uz izstrādātāju pašu CDN ārpus npm reģistra.
- `exceljs` ir MIT licencēts, aktīvi uzturēts tieši npm reģistrā, bez natīvām atkarībām.

**Sesijā 2 precizēts (reāli paraugfaili atklāja robežu)**: viens no diviem reālajiem paraugfailiem
("C8-2 Pile BOQ") izrādījās vecais binārais `.xls` (BIFF/CDF) formāts, nevis `.xlsx`. `exceljs`
**principiāli nevar** lasīt `.xls` (tikai OOXML/zip formātu — `.xls` mēģinājums dod
"Can't find end of central directory : is this a zip file?"). LibreOffice `--headless
--convert-to xlsx` konvertācija šim konkrētajam failam arī neizdevās ("source file could not be
loaded", pārbaudīts ar tīru profilu). SheetJS `xlsx` gan lasa šo failu tieši, bez ārējiem
procesiem. Tāpēc:
- **`.xlsx`** → `exceljs` (kā lemts Sesijā 1; formulu cached-values pieejami caur formulas
  objektu `.result`, kur tie ir korekti aprēķināti avotfailā).
- **`.xls`** (legacy binārais) → `xlsx`/SheetJS kā fallback (`src/parser/loadWorkbook.js`
  izvēlas bibliotēku pēc faila paplašinājuma un abstrahē abas aiz vienotas
  `{ sheets: [{ name, getRows(maxRow) }] }` saskarnes).
- **Atklāts, vēl neatrisināts jautājums Sesijai 3+**: abu paraugfailu formulu cached-values
  daļēji ir novecojuši/nulle (piem. KO lapas starplapu formulas dod `undefined`/`0`, nevis
  reālo summu) — tātad TAMES_MODULE_SPEC.md §1 minētais "LibreOffice recalc pirms nolasīšanas"
  solis būs jārisina Sesijā 3 (rindu ekstrakcija), UN jāņem vērā, ka LibreOffice recalc/convert
  var neizdoties tieši `.xls` failiem (skat. augstāk) — iespējams risinājums: pārrēķināt
  formulas Node pusē (nevis paļauties uz cached-values), vai izmantot LibreOffice makro ar
  atšķirīgu importa filtru. Nav vēl izlemts — jāapspriež Sesijā 3.

## Definition of Done (katram uzdevumam)
- [ ] Kods uzrakstīts kā tīra, testējama funkcija atsevišķā modulī (ne monolītā UI failā).
- [ ] Testi uzrakstīti un PASS (norādīt skaitu).
- [ ] Ja finanšu dati — integer centi + daļskaitļu likmes ievērotas.
- [ ] PROGRESS.md ieraksts pievienots ar pamatojumu un verifikāciju.

## Sesijas protokols
Skat. `TAMES_MODULE_SPEC.md` §4 — obligāts katras sesijas beigās.

## Nākamais solis
Sesija 3 — Rindu ekstrakcija un kanoniskais modelis: `src/parser/extractLineItems.js`.
Vispirms jārisina atklātais formulu cached-values jautājums (skat. augstāk "Excel bibliotēkas"
sadaļu) — pirms rindu ekstrakcijas jāizlemj, kā iegūt korektas (nevis novecojušas/nulles)
formulu vērtības abiem failu formātiem. Skat. `TAMES_MODULE_SPEC.md` §3, Sesija 3, "Gatavs, kad"
kritērijs. Nesākt bez lietotāja apstiprinājuma, ka šis solis joprojām aktuāls.
