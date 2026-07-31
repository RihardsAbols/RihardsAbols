# Tāmju/BOQ Modulis — PROGRESS.md

## 🔜 NĀKAMAIS UZDEVUMS

Sesija 3 — Rindu ekstrakcija un kanoniskais modelis (`src/parser/extractLineItems.js`). Skat.
`TAMES_MODULE_SPEC.md` §3, Sesija 3. **Vispirms jāizlemj**: kā risināt novecojušas/nulles
formulu cached-values abos paraugfailos (skat. `CLAUDE.md` "Excel bibliotēkas" sadaļu un šīs
sesijas ierakstu zemāk) — LibreOffice recalc, ko spec §1 pieņēma kā doto, vismaz vienam
paraugfailam (`.xls`) neizdodas tieši konvertēt/atvērt. Nesākt bez lietotāja apstiprinājuma, ka
uzdevums joprojām aktuāls.

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
