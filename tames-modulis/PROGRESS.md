# Tāmju/BOQ Modulis — PROGRESS.md

## 🔜 NĀKAMAIS UZDEVUMS

Sesija 4 — Izmaiņu vadības dzinējs (`diffBoq(baseline, revised)`). Skat.
`TAMES_MODULE_SPEC.md` §3, Sesija 4. Saskaņo rindas pēc koda+apraksta (fuzzy,
`normalizeCostRef`/`looseCostRefKey` loģikas analogs no Kanban app, skat.
`ARCHITECTURE_EXPORT.md` §5), klasificē `unchanged`/`quantity_changed`/`added`/`removed`,
staged-review plūsma pirms commit. Nesākt bez lietotāja apstiprinājuma, ka uzdevums joprojām
aktuāls.

---

## 🗓 SESIJA 3 — 2026-07-31 — Rindu ekstrakcija un kanoniskais modelis

**Kas darīts:**
- `src/parser/cellRef.js` — šūnu adrešu parsēšana/formatēšana (kolonnu burti ↔ skaitļi) un
  `shiftFormulaReferences()` relatīvo atsauču pārbīdei (shared formula tulkošanai).
- `src/parser/formulaEngine.js` — minimāls Excel formulu tokenizētājs/parseris/izpildītājs
  (nevis vispārīgs dzinējs — tikai reāli novērotais vārdu krājums: `+-*/^%=`, `SUM`, `ROUND`,
  `IF`, `COUNTA`, `COUNTBLANK`, šūnu/diapazonu/lapu atsauces).
- `src/parser/workbookModel.js` — būvē "jēlo" formulu modeli (exceljs `.xlsx` / SheetJS `.xls`),
  iztulko shared-formula atkarīgās šūnas uz pilnu formulas virkni, un `loadRecalculatedWorkbook()`
  atgriež `getValue(sheet, address)`, kas VISU formulu vērtības ATVASINA pēc pieprasījuma
  (memoizēts, ar ciklisku atsauču noteikšanu) — NEVIENA vērtība nav uzticēta bibliotēkas cache.
- `src/parser/extractLineItems.js` — `extractSheetLineItems()` (viena DETAIL lapa → §2 "BOQ
  rinda" kanoniskais modelis, no galvenes līdz kopsummas rindai) un `extractAllDetailSheets()`
  (ērtības funkcija — ielādē darbgrāmatu VIENU reizi, ekstrahē visas DETAIL lapas).

**Svarīgs atradums — kāpēc formulu vērtības šķita "novecojušas/nulle" (izrēķināts Sesijā 3, ne
Sesijā 2)**: pierādīts ar xlsx XML tiešu inspekciju, ka avotfailā PATIESĪBĀ IR cache-otas
`<v>` vērtības (piem. `KO!D24`: `<f>KS!D21</f><v>0</v>`), bet `exceljs` tās PAZAUDĒ savas
parsēšanas laikā tieši formulām ar funkcijām/starplapu atsaucēm (atgriež `{formula:"..."}`
bez `result`) — tikai "shared formula" grupas dabū `result` uzticami. Tas ir `exceljs`
ierobežojums, ne avotfaila datu kvalitātes problēma. Pēc lietotāja apstiprinājuma ("pārrēķini
pašā Node kodā") uzbūvēts pilnīgi patstāvīgs formulu pārrēķina dzinējs — sk. `CLAUDE.md`.

**Kāpēc (arhitektūras lēmumi):**
- Formulu dzinējs apzināti ierobežots līdz REĀLI NOVĒROTAJAM vārdu krājumam abos paraugfailos
  (pārbaudīts ar pilnu formulu skenēšanu — 6045 formulu šūnas C2-10, 278 C8-2), nevis būvēts kā
  vispārīgs Excel emulators — atbilst spec §1 "tīras, testējamas funkcijas", nevis
  pāri-inženierēts risinājums hipotētiskiem gadījumiem.
- Rindas identificēšana par "BOQ pozīciju" (nevis sadaļas virsrakstu vai veidnes artefaktu)
  balstās uz DIVIEM kritērijiem — ir daudzums UN apraksts ir teksts (ne kails skaitlis). Otrais
  kritērijs bija nepieciešams, jo šī tāmju veidnes ģimene liek papildu "kolonnu indeksu" rindu
  (1,2,3,4...) tieši aiz galvenes rindas (piem. `1-2Pp!12. rinda`), kas citādi nepareizi tiktu
  atpazīta par pirmo BOQ pozīciju (jo tai IR skaitliska "daudzuma" vērtība kolonnā 5).
- `extractAllDetailSheets()` pievienota pēc veiktspējas problēmas atklāšanas testos (69 lapu
  faila ekstrakcija ar VIENU parsēšanu uz lapu aizņēma ~109s, jo katrs izsaukums no jauna lasīja
  visu 1.1 MB failu) — ar koplietotu darbgrāmatas ielādi tas paātrinājās līdz ~6s.

**Verifikācija:**
- `node --test`: **12/12 testi PASS** (`test/extractLineItems.test.js` + Sesijas 2 testi).
- Punktpārbaude pret ZINĀMU, NOZĪMĪGU (ne tikai nulles) kopsummu: C8-2 `1.2 Substructure`
  ekstrahēto rindu `totalCost.totalCents` summa = `2453969` = `Kops.1!F20` neatkarīgi
  pārrēķinātā vērtība (arī = Excel oriģinālā vērtība). C2-10 (bāzes tāme bez cenām) korekti
  dod `0` visur — atbilst spec §0 aprakstītajai faila dabai.
- Visas abu paraugfailu DETAIL lapas (69 no 72 kopā) ekstrahējas bez kļūdām
  (`extractAllDetailSheets`, smoke tests).

---

## 🗓 SESIJA 2 — 2026-07-31 — Excel struktūras atpazīšana

**Kas darīts:**
- `src/parser/loadWorkbook.js` — vienota ielādes saskarne (`{ sheets: [{ name,
  getRows(maxRow) }] }`), kas aiz sevis paslēpj, vai fails lasīts ar `exceljs` (.xlsx) vai
  `xlsx`/SheetJS (.xls fallback — skat. zemāk).
- `src/parser/keywords.js` — atslēgvārdu vārdnīca (lapu tipu un kolonnu lauku regex), koplietota
  gan `detectSheetType`, gan `detectHeaderRow`.
- `src/parser/detectSheetType.js` — klasificē lapu kā `master-summary` / `object-summary` /
  `detail` / `unknown` pēc atslēgvārdiem pirmajās rindās (nevis pēc lapas nosaukuma).
- `src/parser/detectHeaderRow.js` — atrod galvenes rindu (var būt divas — grupas rinda +
  specifisko lauku rinda, skat. C8-2 paraugu) un piesaista kolonnu virsraksta vērtības
  kanoniskajiem lauku nosaukumiem no §2 (`unitCost.*`/`totalCost.*` detail lapām ar fāzes
  loģiku pēc kolonnu secības; flat lauki summary lapām).
- Testu fixtures: abi reālie paraugfaili (`test/fixtures/C2-10_BOQ.xlsx`,
  `test/fixtures/C8-2_Pile_BOQ.xls`), bez anonimizācijas (§6.3).

**Svarīgs atradums — mainīja Sesijas 1 lēmumu:**
"C8-2 Pile BOQ" reālais fails ir vecais binārais `.xls` (BIFF/CDF) formāts, ne `.xlsx`. `exceljs`
principiāli nevar to lasīt (tikai OOXML/zip). LibreOffice `--headless --convert-to xlsx`
konvertācija šim konkrētajam failam arī neizdevās (pārbaudīts, "source file could not be
loaded", arī ar tīru profilu) — Python `xlrd` un Node `xlsx`/SheetJS gan to lasa veiksmīgi.
Lietotājam apstiprinot ("dari, kā uzskati par pareizu"), pievienots `xlsx` (SheetJS) kā
**fallback tikai legacy .xls failiem**, `exceljs` paliek primārā bibliotēka `.xlsx` failiem —
skat. `CLAUDE.md` pilnu pamatojumu. Papildu atklāts, vēl neatrisināts jautājums Sesijai 3: abu
paraugfailu formulu cached-values daļēji novecojuši/nulle — spec §1 pieņemtais "LibreOffice
recalc" solis jāpārskata (nevar paļauties, ka tas darbosies visiem failu formātiem).

**Kāpēc (arhitektūras lēmumi):**
- Sheet-tipa un galvenes atpazīšana balstās TIKAI uz atslēgvārdiem un kolonnu secību (nevis
  fiksētiem nosaukumiem), jo abi paraugfaili pierādīja, ka lapu/kolonnu nosaukumi tiešām
  atšķiras starp projektiem (LV/EN, "KO/KS" pret "Buvn.kopt./Kops.1", "Kods" pret "Code" u.tml.)
  — tieši kā spec §0 brīdināja.
- Izmaksu apakšlauki (`salaryCents`/`materialsCents`/`mechanismsCents`) katrā detail lapā
  parādās DIVREIZ (reizi zem "vienības izmaksas", reizi zem "kopā par apjomu"); atrisināts ar
  "fāzes" izsekošanu kolonnu secībā (pirmā "kopā/total" kolona pārslēdz no `unitCost` uz
  `totalCost` grupu) — atbilst spec §0 norādei paļauties arī uz "formulu paraugiem/kolonnu
  secību", ne tikai atslēgvārdiem.

**Verifikācija:**
- `node --test`: **9/9 testi PASS**, ieskaitot pārbaudi, ka VISĀS abu paraugfailu lapās (67 + 5)
  galvenes rinda tiek atrasta ar vismaz 3 piesaistītiem laukiem — atbilst Sesijas 2 "Gatavs, kad"
  kritērijam pilnībā (`test/parser.test.js`).

---

## 🗓 SESIJA 1 — 2026-07-31 — Projekta skelets un konvencijas

**Kas darīts:**
- Izveidota `tames-modulis/` mape ar `package.json` (viena atkarība: `exceljs`), `node --test`
  ietvaru (`test/smoke.test.js`), `CLAUDE.md` un `PROGRESS.md`.
- Izvēlēts `exceljs` pār `xlsx`/SheetJS — pamatojums skat. `CLAUDE.md` "Excel bibliotēkas izvēle".

**Kāpēc:**
- Modulis būvēts kā patstāvīgs (skat. `TAMES_MODULE_SPEC.md` §0) — atkarību minimums un tīra
  testu bāze ir priekšnoteikums Sesijai 2+, kur pievienosies reāla parsēšanas loģika.

**Verifikācija:**
- `node --test` no `tames-modulis/`: 1/1 testi PASS (smoke tests apstiprina, ka testu ietvars
  strādā un `exceljs` atkarība ielādējas).

---
