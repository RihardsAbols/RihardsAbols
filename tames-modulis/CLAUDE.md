# Tāmju/BOQ modulis

TypeScript modulis būvniecības tāmju (Bill of Quantities) datu modelim un
glabāšanai. Mērķis: ļaut veidot, saglabāt un ielādēt tāmes (pozīcijas,
sadaļas, daudzumi, cenas) neatkarīgi no UI slāņa, lai vēlāk (Sesija 7+) virs
tā uzbūvētu brauzera saskarni.

## Struktūra

- `src/models/boq.ts` — datu modelis (`BoqState`, `BoqSection`, `BoqItem`).
- `src/storage/StorageAdapter.ts` — glabāšanas saskarne (`save`/`load`), lai
  glabāšanas mehānismu varētu nomainīt (fails -> IndexedDB) nemainot
  pārējo kodu.
- `src/storage/adapters/FileSystemStorageAdapter.ts` — pašreizējā
  implementācija: JSON fails `data/projects/<projectId>/boq-state.json`.
  Raksta caur pagaidu failu + `rename`, lai avārijas gadījumā fails
  nepaliktu pusceļā pierakstīts.
- `src/storage/migrations/index.ts` — shēmas versiju migrāciju ķēde.
  Pašreiz `v1 -> v2 -> v3`, `migrateToCurrent` atbalsta pakāpenisku
  migrāciju pievienošanu arī turpmāk.
- `src/calculations/boq.ts` — aprēķinu kodols: pozīcijas izmaksas
  (`calculateItemCosts`), sadaļas tiešās izmaksas
  (`calculateSectionDirectTotal`), un pilns kopsavilkums ar virsizdevumiem,
  peļņu un PVN (`summarizeBoq` -> `BoqSummary`).
- `src/excel/` — Excel imports/eksports:
  - `columns.ts` — `TAME_COLUMNS` (Līguma tāmes kolonnu karte) un
    `KNOWN_UNITS` (mērvienību saraksts datu rindu atpazīšanai), abi tieši
    pārņemti no `izpildes-akts-validacija` skill dokumentācijas, lai formāti
    sakristu.
  - `export.ts` — `exportBoqToWorkbook`/`exportBoqToBuffer`: viena darblapa
    (`KOPSAVILKUMS`) ar pieņēmumiem (likmes) un projekta kopsavilkumu, un pa
    darblapai katrai sadaļai ar pozīcijām. Šūnas raksta ar **formulām**
    (nevis tikai gala vērtībām), pievienojot arī kešotu `result`, lai fails
    rāda pareizas vērtības uzreiz, pat ja neviens neatver to Excel/LibreOffice.
  - `import.ts` — `importBoqFromWorkbook`/`importBoqFromBuffer`: datu rindas
    atpazīst pēc mērvienības kolonnas (nevis fiksētas rindas numura), tāpēc
    var lasīt gan pašu ģenerētus failus, gan reālus Līguma tāmes failus.
    Atvasinātās kolonnas (Vienības kopā, Kopā *) netiek lasītas atpakaļ —
    tās vienmēr pārrēķina `calculations/boq.ts`, lai nebūtu divu patiesības
    avotu.
- `test/` — vitest testi (glabāšanas round-trip, migrāciju stubs, aprēķini,
  Excel eksports/imports round-trip un imports no "svešas" darblapas).

## Lēmumi

- **Glabāšana sākas ar vienkāršiem JSON failiem**, nevis IndexedDB, jo UI vēl
  nav būvēts — IndexedDB adapteris tiks pievienots, kad būs reāls brauzera
  UI (Sesija 7+). `StorageAdapter` saskarne ir izveidota tieši tāpēc, lai šī
  maiņa nebūtu jāpārraksta izsaucējkodā.
- **Migrācijas** tiek risinātas ar `schemaVersion` laukā katrā `boq-state.json`.
  Trūkstoša versija tiek uzskatīta par `v1`. Nezināma nākotnes versija
  (lielāka par kodā zināmo) izmet `UnsupportedSchemaVersionError`, nevis
  klusi turpina ar bojātiem datiem.
- **Bez datubāzes** šajā posmā — projekta dati ir faili, nevis DB ieraksti,
  jo tas ir vienkāršākais variants pirms UI un daudzlietotāju piekļuves
  prasībām.
- **PVN likme (`vatRate`) glabājas katrā projektā**, nevis kā globāla
  konstante, jo dažādiem projektiem/pozīcijām teorētiski var būt cita
  likme. Noklusējums — `DEFAULT_VAT_RATE = 0.21` (LV standarta likme).
- **Aprēķini noapaļo tikai vienreiz, beigās** (`summarizeBoq`) — sadaļu un
  kopējās summas tiek saskaitītas no nenoapaļotiem starprezultātiem, lai
  daudzu sīku pozīciju gadījumā noapaļošanas kļūda nesakrātos. Sadaļu
  starpsummas kopsavilkumā gan tiek parādītas noapaļotas (displejam), bet
  kopsummas aprēķins tās neizmanto par pamatu.
- **`BoqItem` sadala izmaksas darba algā/materiālos/mehānismos** (nevis viens
  `unitPrice`), lai eksportētie/importētie faili atbilstu reālajai Latvijas
  Līguma tāmes struktūrai, ko izmanto arī `izpildes-akts-validacija` skill.
  Virsizdevumi (`overheadRate`, noklusējums 12%) un peļņa (`profitRate`,
  noklusējums 5%) tiek rēķināti no tiešajām izmaksām sadaļas/projekta līmenī,
  nevis pa pozīcijām — tā strādā arī izpildes aktu validācijas skill.
- **Excel imports/eksports ir apzināti dokumentēti kā daļēji zaudējošs
  (lossy)** ceļš, nevis pilna JSON glabāšanas alternatīva: Excel neuztur
  mūsu iekšējos `id` laukus, tāpēc importējot sadaļas `id` kļūst par
  darblapas nosaukumu un pozīciju `id` tiek ģenerēts no jauna. Pilnai,
  bezzudumu glabāšanai turpina izmantot `StorageAdapter`/JSON — Excel ir
  cilvēkiem lasāms/rediģējams un savietojams ar citiem rīkiem formāts, nevis
  primārais glabātuve.

## Palaišana

```bash
cd tames-modulis
npm install
npm test        # vitest, ieskaitot save/load round-trip
npx tsc -p tsconfig.json --noEmit   # typecheck
```

## Konvencijas

- Visi publiski eksportētie tipi/funkcijas iet caur `src/index.ts`.
- Nepievienot IndexedDB vai cita glabāšanas mehānisma kodu, kamēr nav reāla
  UI, kas to lieto — skat. PROGRESS.md par plānoto secību.
