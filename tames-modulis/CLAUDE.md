# Tāmju/BOQ Modulis — CLAUDE.md

## Vides ierobežojumi
- Node.js portable, pilnais ceļš: `C:/Users/rihards.abols/Documents/nodejs/node.exe`
  (tas pats binārais, kas Kanban app — analoģija apstiprināta Sesijā 1, skat.
  `ARCHITECTURE_EXPORT.md` §1).
- Bez admin tiesībām, bez instalatora, bez build/bundler soļa kodola loģikai.
- Testi: `node --test` (izmantot pilno `node.exe` ceļu skriptos/dokumentācijā uz lietotāja mašīnas).

## Excel bibliotēkas izvēle: `exceljs`, nevis `xlsx` (SheetJS)
Izvēlēts `exceljs` (nevis `xlsx`/SheetJS), pamatojums:
- `xlsx` npm pakotnes community versija ir iesaldēta pie novecojušas versijas (0.18.x); aktīvā
  attīstība pārcelta uz izstrādātāju pašu CDN ārpus npm reģistra, kas apgrūtina uzticamu,
  reproducējamu instalāciju bez admin tiesībām/interneta piekļuves nenoteiktībām.
- `exceljs` ir MIT licencēts, aktīvi uzturēts tieši npm reģistrā, bez natīvām atkarībām — der
  portablajam Node.js iestatījumam.
- `exceljs` tieši atbalsta izcache-otu formulu vērtību nolasīšanu (`cell.result` pēc
  `workbook.xlsx.readFile()`), kas tieši nepieciešams §1 no `TAMES_MODULE_SPEC.md`
  ("Excel fails jāatver ar cached-values pēc LibreOffice recalc, ne tikai formulu virknes").

## Definition of Done (katram uzdevumam)
- [ ] Kods uzrakstīts kā tīra, testējama funkcija atsevišķā modulī (ne monolītā UI failā).
- [ ] Testi uzrakstīti un PASS (norādīt skaitu).
- [ ] Ja finanšu dati — integer centi + daļskaitļu likmes ievērotas.
- [ ] PROGRESS.md ieraksts pievienots ar pamatojumu un verifikāciju.

## Sesijas protokols
Skat. `TAMES_MODULE_SPEC.md` §4 — obligāts katras sesijas beigās.

## Nākamais solis
Sesija 2 — Excel struktūras atpazīšana: `src/parser/detectSheetType.js` +
`src/parser/detectHeaderRow.js`. Skat. `TAMES_MODULE_SPEC.md` §3, Sesija 2, "Gatavs, kad" kritērijs.
Nesākt bez lietotāja apstiprinājuma, ka šis solis joprojām aktuāls.
