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
**Sesijā 3 izrēķināts un atrisināts galīgi**: iemesls, kāpēc formulu vērtības šķita
"novecojušas/nulle", NAV avotfaila dati — tas ir `exceljs` PARSĒŠANAS IEROBEŽOJUMS. Pierādīts ar
xlsx XML tiešu inspekciju (`KO!D24` satur `<f>KS!D21</f><v>0</v>` — cache PATIESĪBĀ TUR IR), bet
`exceljs` `cell.value` šai šūnai atgriež `{formula:"KS!D21"}` **bez** `result` atslēgas vispār.
Tas pats novērots VISĀM "vienkāršām" (ne-shared) formulām ar funkcijām vai starplapu atsaucēm
(`SUM(...)`, `D24+D28+D29+D30`, `ROUND(...)`) — tikai "shared formula" grupas (piem. rindu
numerācijas `=E12+1` virknes) `exceljs` uzticami atgriež ar `result`.

**Lēmums (pēc lietotāja apstiprinājuma "pārrēķini pašā Node kodā")**: NEVIENA formulas vērtība
netiek uzticēta no bibliotēkas cache — VISAS formulas tiek pārrēķinātas pašu rakstītā Node
formulu dzinējā (`src/parser/formulaEngine.js` + `workbookModel.js`):
- Atbalstītais formulu vārdu krājums (pārbaudīts pret abu paraugfailu VISĀM formulām, ne
  minēts): `+ - * / ^ %`, salīdzināšana (`=`), funkcijas `SUM`, `ROUND`, `IF`, `COUNTA`,
  `COUNTBLANK`; šūnu/diapazonu atsauces (relatīvas/absolūtas, ar/bez lapas prefiksa, ar pēdiņotu
  lapas nosaukumu). Apzināti NAV vispārīgs Excel dzinējs — tikai novērotais vārdu krājums.
- "Shared formula" atkarīgās šūnas (`{result, sharedFormula:'F12'}`) tiek iztulkotas uz pilnu,
  patstāvīgu formulas virkni PIRMS pārrēķina (relatīvo atsaužu nobīde pēc kolonnu/rindu delta,
  absolūtās ar `$` nemainās) — arī tās PĀRRĒĶINĀTAS, nevis uzticēts `exceljs` `result`.
- Ārējo darbgrāmatu saišu marķieris `[n]Sheet!Ref` (parādās sheetos "A General requirements"/
  "B Day works", kas kopēti no cita avota faila) tiek uztverts kā IEKŠĒJA atsauce (labākais
  variants bez piekļuves ārējam failam) — skar tikai virsraksta/metadatu šūnas (rindas 4-6), ne
  BOQ pozīciju datus, tāpēc nav bloķējošs.
- **Validēts pret reāliem, nozīmīgiem skaitļiem** (nevis tikai nullēm): C8-2 `Kops.1!F20`
  ("Estimated costs" sadaļai "1.2 Substructure") pārrēķinās uz `2453969` — TIEŠI sakrīt ar
  Excel oriģinālo vērtību, UN sakrīt ar neatkarīgi ekstrahēto un summēto `1.2 Substructure`
  rindu `totalCost.totalCents` summu. C2-10 (bāzes tāme bez cenām, skat. §0) korekti pārrēķinās
  uz `0` visur — tas NAV bugs, tas ir avotfaila patiesā daba (tikai daudzumi, bez cenu datiem).

## Definition of Done (katram uzdevumam)
- [ ] Kods uzrakstīts kā tīra, testējama funkcija atsevišķā modulī (ne monolītā UI failā).
- [ ] Testi uzrakstīti un PASS (norādīt skaitu).
- [ ] Ja finanšu dati — integer centi + daļskaitļu likmes ievērotas.
- [ ] PROGRESS.md ieraksts pievienots ar pamatojumu un verifikāciju.

## Sesijas protokols
Skat. `TAMES_MODULE_SPEC.md` §4 — obligāts katras sesijas beigās.

## Nākamais solis
Sesija 4 — Izmaiņu vadības dzinējs: `diffBoq(baseline, revised)`. Skat.
`TAMES_MODULE_SPEC.md` §3, Sesija 4, "Gatavs, kad" kritērijs (sintētiska "revidēta" C2-10 kopija,
diff pret bāzi klasificē `unchanged`/`quantity_changed`/`added`/`removed`; staged-review plūsma
pirms commit). Nesākt bez lietotāja apstiprinājuma, ka šis solis joprojām aktuāls.
