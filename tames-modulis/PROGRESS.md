# Progress log — Tāmju/BOQ modulis

## Piezīme par vēsturi

Šī moduļa kods, `CLAUDE.md` un šis progresa žurnāls repozitorijā
(`RihardsAbols/RihardsAbols`) neeksistēja pirms šīs sesijas — nebija ne
`tames-modulis/` direktorijas, ne agrāku commit'u ar Sesiju 1-4 darbu. Tāpēc
šis ieraksts sāk žurnālu no faktiskā koda stāvokļa, nevis izliekas par
turpinājumu kaut kam, kas šeit nav atrodams. Ja "Sesijas 1-4" jau notika
citur (cits repo, cits rīks, saruna bez koda), un ir konkrēti lēmumi no tām,
kas jāievēro — tie jāatkārto/jāpaziņo, lai tos var iestrādāt šeit.

## Sesija 5: Glabāšana un versionēšana — ✅ pabeigts

**Uzdevums:** izveidot BOQ datu glabāšanu un shēmas versionēšanas pamatu.

**Lēmums:** JSON faili (`data/projects/<projectId>/boq-state.json`) caur
`StorageAdapter` saskarni, nevis IndexedDB — IndexedDB atliekam, kamēr nav
reāla brauzera UI, kas to lietotu (Sesija 7+, skat. CLAUDE.md).

**Implementēts:**
- `src/models/boq.ts` — minimāls BOQ datu modelis (`BoqState`, `BoqSection`,
  `BoqItem`, `createEmptyBoqState`), lai būtu ko glabāt/ielādēt.
- `src/storage/StorageAdapter.ts` — glabāšanas saskarne (`save`/`load`).
- `src/storage/adapters/FileSystemStorageAdapter.ts` — JSON failu
  implementācija ar atomisku rakstīšanu (temp fails + `rename`).
- `src/storage/migrations/index.ts` — `migrateToCurrent` ar
  `schemaVersion` lauku; `v1` ir pašreizējā versija; trūkstoša versija tiek
  uzskatīta par `v1`; nezināma nākotnes versija izmet
  `UnsupportedSchemaVersionError`. Migrāciju ķēde (`migrations` map) ir
  tukša — gatava, lai pievienotu `v1 -> v2` u.tml., kad shēma mainīsies.
- `test/storage.test.ts` — 6 testi (vitest): save/load round-trip,
  neeksistējoša projekta ielāde (`null`), atkārtota saglabāšana
  (pārraksta), un migrāciju stubs (pass-through, trūkstoša versija,
  nezināma nākotnes versija).

**Definition of Done — pārbaudīts:**
- ✅ save/load round-trip testēts (`npm test`, visi 6 testi zaļi).
- ✅ Shēmas versiju migrācijas stubs gatavs (v1, ar vietu nākamajām
  versijām), typecheck tīrs (`npx tsc --noEmit`).

## Sesija 6: BOQ aprēķinu kodols — summas un PVN — ✅ pabeigts

**Uzdevums:** pozīciju/sadaļu summas un PVN aprēķins virs esošā datu modeļa.

**Lēmums:** PVN likme (`vatRate`) glabājas katrā `BoqState`, nevis kā globāla
konstante — noklusējums `DEFAULT_VAT_RATE = 0.21` (LV standarta likme). Tā kā
`vatRate` ir jauns obligāts lauks, šī bija reāla shēmas maiņa, nevis tikai
stubs — `schemaVersion` pacelts uz `2`, un pirmoreiz tiek izmantota migrāciju
ķēde, kas tapa Sesijā 5 (`v1 -> v2` pievieno trūkstošo `vatRate`).

**Implementēts:**
- `src/calculations/boq.ts` — `calculateItemTotal`, `calculateSectionSubtotal`,
  `summarizeBoq` (atgriež `BoqSummary`: sadaļu starpsummas, `subtotal`,
  `vatRate`, `vatAmount`, `total`) un `round2` palīgfunkcija naudas
  noapaļošanai. Summēšana notiek pa nenoapaļotiem starprezultātiem, tikai
  beigās noapaļojot — lai daudzu sīku pozīciju gadījumā kļūda nesakrātos.
- `src/models/boq.ts` — pievienots `vatRate: number` laukam `BoqState`,
  `DEFAULT_VAT_RATE` konstante, `CURRENT_SCHEMA_VERSION` pārcelts uz šejieni
  (modelis tagad "pieder" savai versijai) un pacelts uz `2`.
- `src/storage/migrations/index.ts` — pievienota `1: (data) => ...` migrācija,
  kas pievieno `vatRate: DEFAULT_VAT_RATE`, ja tā trūkst; saglabā esošu
  vērtību, ja tā jau ir norādīta.
- `test/calculations.test.ts` — 7 testi: pozīcijas/sadaļas summas, pilns
  kopsavilkums ar PVN, tukšs projekts (visur 0), noapaļošanas artefaktu
  tests (`0.1 + 0.2` u.c.).
- `test/storage.test.ts` — papildināts ar migrāciju testiem: trūkstoša
  versija -> `v2` + noklusējuma PVN, eksplicīts `v1` bez `vatRate` -> `v2`,
  un jau esoša `vatRate` vērtība netiek pārrakstīta migrācijas laikā.

**Definition of Done — pārbaudīts:**
- ✅ Visi testi zaļi: `npm test` — 15/15 (8 storage + 7 calculations).
- ✅ Typecheck tīrs (`npx tsc --noEmit`).
- ✅ Migrācijas mehānisms reāli nostrādāts (ne tikai teorētisks stubs).

## Sesija 7: Excel imports/eksports — ✅ pabeigts

**Uzdevums:** BOQ Excel imports/eksports.

**Lēmums (apstiprināts ar lietotāju):** eksportētais/importētais formāts
atbilst reālajai Latvijas "Līguma tāme" kolonnu kartei, ko izmanto arī
`izpildes-akts-validacija` skill (darba alga/materiāli/mehānismi
sadalījums + virsizdevumi 12% + peļņa 5% + PVN), nevis vienkāršotam
`unitPrice` modelim. Tas nozīmēja reālu datu modeļa paplašinājumu:

- `BoqItem.unitPrice` aizstāts ar `unitLaborCost` / `unitMaterialsCost` /
  `unitMechanismsCost`.
- `BoqState` papildināts ar `overheadRate` (noklusējums 12%) un
  `profitRate` (noklusējums 5%).
- `schemaVersion` pacelts uz `3`, ar jaunu `v2 -> v3` migrāciju. Tā kā nav
  iespējams atgūt darba algas/materiālu/mehānismu sadalījumu no viena
  vecā `unitPrice`, migrācija to (apzināti, ar zaudējumu) ieliek
  `unitMaterialsCost` un pārējās divas komponentes uzstāda uz `0` — tas ir
  dokumentēts kā tuvinājums, nevis korekcija.

**Implementēts:**
- `src/calculations/boq.ts` pārrakstīts: `calculateItemCosts` (darba
  alga/materiāli/mehānismi -> tiešās izmaksas), `summarizeBoq` tagad rēķina
  pilnu ķēdi: tiešās izmaksas -> virsizdevumi -> peļņa -> pavisam (bez PVN)
  -> PVN -> kopā ar PVN. Rounding stratēģija (noapaļot tikai beigās) saglabāta.
- `src/excel/columns.ts` — `TAME_COLUMNS` (kolonnu karte) un `KNOWN_UNITS`
  (mērvienību saraksts), abi pārņemti tieši no izpildes-akts-validacija
  SKILL.md, lai formāti sakristu.
- `src/excel/export.ts` — `exportBoqToWorkbook`/`exportBoqToBuffer` (exceljs).
  `KOPSAVILKUMS` darblapa ar likmju pieņēmumiem un projekta kopsavilkumu,
  pa darblapai katrai sadaļai. Šūnas ar formulām (nevis hardkodētām
  vērtībām), ar kešotu `result`, lai fails rāda pareizas summas uzreiz.
- `src/excel/import.ts` — `importBoqFromWorkbook`/`importBoqFromBuffer`.
  Datu rindas atpazīst pēc mērvienības kolonnas satura (nevis rindas
  numura) — tas pats princips, kas izpildes-akts-validacija skill, tāpēc
  var importēt gan pašu ģenerētus failus, gan patiesus Līguma tāmes
  failus ar citu rindu/kolonnu izkārtojumu (papildu galvenes u.tml.).
  Atvasinātās kolonnas (Vienības kopā, Kopā *) netiek lasītas — vienmēr
  pārrēķinātas, lai nebūtu divu patiesības avotu.
- `test/calculations.test.ts` — pārrakstīts jaunajam modelim (7 testi).
- `test/storage.test.ts` — papildināts ar `v2 -> v3` migrācijas testu
  (unitPrice -> unitMaterialsCost sadale).
- `test/excel.test.ts` — 5 jauni testi: eksports/imports round-trip
  (sadaļas/pozīcijas, `summarizeBoq` rezultāti sakrīt), `KOPSAVILKUMS`
  darblapa netiek importēta kā sadaļa (nav datu rindu), un imports no
  manuāli būvētas "svešas" darblapas ar citu izkārtojumu (pierāda, ka
  atpazīšana strādā neatkarīgi no rindu/kolonnu pozīcijas, ne tikai uz
  pašu eksportētiem failiem).

**Manuāla pārbaude:** eksportēts paraugfails pārbaudīts ar `openpyxl`
(`data_only=True`) — visas kešotās formulu vērtības atbilst
`summarizeBoq` aprēķinam (tiešās izmaksas 1200, virsizdevumi 144, peļņa 60,
pavisam 1404, PVN 294.84, kopā 1698.84). LibreOffice `recalc.py` pārbaude
šajā vidē pārtrūka (`soffice` timeout, iespējams vides ierobežojums), tāpēc
formulu *pareizību Excel atverot* nav apstiprinājis pats LibreOffice — bet
tā kā katrā formulas šūnā jau ir kešota, pareiza `result` vērtība, fails ir
lietojams uzreiz neatkarīgi no tā.

**Definition of Done — pārbaudīts:**
- ✅ Visi testi zaļi: `npm test` — 20/20 (8 storage + 7 calculations + 5 excel).
- ✅ Typecheck tīrs (`npx tsc --noEmit`).
- ✅ Migrācijas mehānisms iztestēts arī `v2 -> v3` gadījumam.
- ⚠️ LibreOffice recalc nav apstiprinājis formulas šajā vidē (skat. augšā) —
  ja nākamajā sesijā ir pieejams strādājošs `soffice`, vērts atkārtot pārbaudi.

## 🔜 NĀKAMAIS UZDEVUMS

Nav vienota lēmuma, kas ir nākamais solis — jāapstiprina ar lietotāju pirms
sākšanas. Iespējamie kandidāti:

1. **Projektu saraksts / CRUD virs `StorageAdapter`** — pirms UI, lai būtu
   API līmenis projektu izveidei/dzēšanai, ne tikai viena projekta
   save/load.
2. **Reāla Līguma tāmes parauga pārbaude** — ja lietotājam ir īsts `.xlsx`
   fails, importēt to un salīdzināt rezultātu, lai apstiprinātu, ka
   `KNOWN_UNITS`/`TAME_COLUMNS` pieņēmumi patiešām sakrīt ar reālo formātu
   (pašlaik pārbaudīts tikai pret SKILL.md dokumentāciju, ne pret reālu failu).
3. **Diskonti/atlaides vai sarežģītāka PVN loģika** (piem. dažādas PVN
   likmes pa pozīcijām), ja tas ir reāls prasību lauks.

Pirms jebkura no šiem — apstiprināt ar lietotāju, kurš tieši ir prioritārs.
