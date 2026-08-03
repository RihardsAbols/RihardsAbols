# Tāmju/BOQ modulis

Npm workspace ar divām pakotnēm:
- `packages/core` — TypeScript bibliotēka: BOQ datu modelis, aprēķini,
  glabāšana/versionēšana, Excel imports/eksports, projektu CRUD. Vidi
  nezinošs (universāls) kods, kas strādā gan Node, gan brauzerī.
- `packages/web` — React + Vite brauzera UI, kas patērē `@tames-modulis/core`
  un glabā datus IndexedDB.

## Struktūra (`packages/core`)

- `src/models/boq.ts` — datu modelis (`BoqState`, `BoqSection`, `BoqItem`,
  `CompanyDetails`). `BoqState.contractor`/`client` (`CompanyDetails` —
  nosaukums/reģ.nr./adrese) un `preparedBy`/`checkedBy` ir projekta līmenī;
  `BoqSection.estimateNumber` ir manuāli ievadāma tāmes numerācija sadaļas
  līmenī — skat. "Projekta rekvizīti un tāmes numerācija" zemāk.
  `BoqState.baselineApprovedAt`/`variationOrders`/`executionRecords` un
  `BoqItem.excluded` — tāmes izmaiņu (Variation Order) vadība un izpildes
  aktu uzskaite, skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/models/variationOrder.ts` — `VariationOrder`/`VariationOrderChange`
  tipi, ieskaitot `VariationOrderChange.newSection` (VO var izveidot
  pavisam jaunu sadaļu, ne tikai pozīciju esošā) — skat. "Tāmes izmaiņu
  (Variation Order) vadība" zemāk.
- `src/models/executionRecord.ts` — `ExecutionRecord`/`ExecutionRecordEntry`
  tipi (izpildes akts par vienu atskaites periodu) — skat. "Tāmes izmaiņu
  (Variation Order) vadība" zemāk.
- `src/variationOrders/deriveCurrentState.ts` — `deriveCurrentSections`/
  `deriveCurrentState` (atvasina bāze + apstiprinātās VO, arī jaunas
  sadaļas), VO izveide/numerācija, `computeVariationOrderDirectTotalImpact`,
  `diffAgainstBaseline` — skat. "Tāmes izmaiņu (Variation Order) vadība"
  zemāk pilnu semantiku.
- `src/executionRecords/executionRecords.ts` — `computeExecutedToDate`
  (kumulatīvais izpildītais daudzums no visiem periodiem),
  `computeRemainingQuantity`, `createExecutionRecord` — skat. "Tāmes
  izmaiņu (Variation Order) vadība" zemāk.
- `src/storage/StorageAdapter.ts` — glabāšanas saskarne
  (`save`/`load`/`list`/`delete`), lai glabāšanas mehānismu varētu nomainīt
  (fails <-> IndexedDB) nemainot pārējo kodu. `delete` ir idempotents —
  dzēšot neeksistējošu projektu, kļūda netiek mesta.
- `src/storage/adapters/FileSystemStorageAdapter.ts` — Node implementācija:
  JSON fails `data/projects/<projectId>/boq-state.json`. Raksta caur
  pagaidu failu + `rename`, lai avārijas gadījumā fails nepaliktu pusceļā
  pierakstīts. **Node-only** (`node:fs/promises`) — tāpēc NAV daļa no
  universālā `src/index.ts` barela, skat. zemāk "Node vs. universāls kods".
- `src/projects/ProjectService.ts` — CRUD virs `StorageAdapter`:
  `createProject` (ģenerē `projectId` ar `crypto.randomUUID()`, izveido
  tukšu projektu, saglabā), `listProjects`, `getProject` (`null`, ja nav),
  `updateProject` (ielādē, pielieto `updater` funkciju, pats atjaunina
  `updatedAt`, saglabā — met `ProjectNotFoundError`, ja projekta nav), un
  `deleteProject`. Universāls — strādā ar jebkuru `StorageAdapter`.
- `src/storage/migrations/index.ts` — shēmas versiju migrāciju ķēde.
  Pašreiz `v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7`, `migrateToCurrent` atbalsta
  pakāpenisku migrāciju pievienošanu arī turpmāk.
- `src/calculations/boq.ts` — aprēķinu kodols: pozīcijas izmaksas
  (`calculateItemCosts`), sadaļas tiešās izmaksas
  (`calculateSectionDirectTotal`), un pilns kopsavilkums ar atlaidi,
  virsizdevumiem, peļņu un PVN (`summarizeBoq` -> `BoqSummary`) — skat.
  "Atlaide (diskonts)" zemāk aprēķina secību.
- `src/excel/` — Excel imports/eksports. **Nav daļa no universālā
  `src/index.ts` barela** (skat. zemāk) — pieejams caur
  `@tames-modulis/core/excel` (`src/excel/index.ts`).
  - `columns.ts` — `TAME_COLUMNS` (kolonnu karte, ko **raksta** eksports),
    `KNOWN_UNITS` (kanoniskais mērvienību saraksts) un `normalizeUnit`
    (attīra reālu failu variantus — galotnes punktu/komatu, Unicode
    augšraksta cipariem `m²`/`m³` — pirms salīdzināšanas ar `KNOWN_UNITS`).
    Sarakstu papildina gan `izpildes-akts-validacija` skill dokumentācija,
    gan reāla 53-lapu Līguma tāmes faila pilna mērvienību apsekošana
    (skat. PROGRESS.md, Sesija 12).
  - `headerDetection.ts` — `detectImportColumns`: **importam** kolonnas
    atrod pēc galvenes teksta (nevis fiksētas pozīcijas kā `TAME_COLUMNS`,
    ko lieto tikai eksports) — skat. "Kolonnu noteikšana pēc galvenes
    teksta" zemāk.
  - `export.ts` — `exportBoqToWorkbook`/`exportBoqToBuffer`: viena darblapa
    (`KOPSAVILKUMS`) ar pieņēmumiem (likmes) un projekta kopsavilkumu, un pa
    darblapai katrai sadaļai ar pozīcijām. Katra lapa sākas ar projekta/
    rekvizītu galvenes bloku (`writeProjectHeaderBlock`) un beidzas ar
    paraksta bloku (`writeSignatureBlock`) — skat. "Projekta rekvizīti un
    tāmes numerācija" zemāk. Kolonnu platumi (`COLUMN_WIDTHS`) iestatīti
    tieši, lai ievadītie teksti/cipari būtu lasāmi (nevis Excel noklusējuma
    ~8.43 rakstzīmes). Šūnas raksta ar **formulām** (nevis tikai gala
    vērtībām), pievienojot arī kešotu `result`, lai fails rāda pareizas
    vērtības uzreiz, pat ja neviens neatver to Excel/LibreOffice.
    `exportBoqToBuffer` atgriež `ArrayBuffer` (nevis Node `Buffer`), lai
    strādātu arī brauzerī. Ja projektam ir VO, sadaļu lapām pievienotas
    "Bāzes daudzums"/"Delta" kolonnas + "IZMAIŅAS" lapa; ja ir izpildes
    akti, papildus "Izpildīts"/"Atlikums" kolonnas + "IZPILDES AKTI" lapa
    — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk pilnu semantiku.
  - `import.ts` — `importBoqFromWorkbook`/`importBoqFromBuffer`: kolonnas
    nosaka `detectImportColumns` (galvenes teksts), datu rindas atpazīst pēc
    mērvienības kolonnas (nevis rindas numura). Atvasinātās kolonnas
    (Vienības kopā, Kopā *) netiek lasītas atpakaļ — tās vienmēr pārrēķina
    `calculations/boq.ts`, lai nebūtu divu patiesības avotu.
- `test/` — vitest testi (glabāšanas round-trip, migrāciju stubs, aprēķini,
  Excel eksports/imports round-trip un imports no "svešas" darblapas,
  `ProjectService` CRUD pret in-memory `StorageAdapter`,
  `variationOrders/deriveCurrentState.ts` derivācija/VO izveide/diff,
  `executionRecords/executionRecords.ts` izpildīto/atlikuma aprēķini).

### Node vs. universāls kods, un ieejas punkti

`src/index.ts` ir **universālais barels** — drīkst importēt tikai kodu, kas
strādā gan Node, gan brauzerī (bez `node:fs`, `node:crypto` u.tml.), jo
`packages/web` to importē tieši un Vite/Rollup mēģina atrisināt (resolve)
visus importus modulī, pat ja rezultāts tiek tree-shaken. Tāpēc:
- `FileSystemStorageAdapter` NAV eksportēts no `src/index.ts` — tas ir
  pieejams tikai caur `@tames-modulis/core/node` (`src/node.ts`), ko
  izmanto tikai Node puses kods.
- ID ģenerēšanai visur izmantots `crypto.randomUUID()` (Web Crypto API,
  globāls arī Node 19+), nevis `import { randomUUID } from "node:crypto"`.
- `excel/export.ts`/`import.ts` lieto `ArrayBuffer`, nevis Node `Buffer`,
  jo pēdējais nepastāv brauzerī bez polyfill.
- **`excel/` (exceljs) arī NAV daļa no `src/index.ts`** — ne Node/browser
  savietojamības, bet **bundle izmēra** dēļ: `exceljs` ir liels (~1MB
  minificēts), un lielākā daļa `@tames-modulis/core` patērētāju (projektu
  saraksts, rediģēšana) to nemaz nelieto. Pieejams caur atsevišķu
  `package.json` `exports` ieeju `@tames-modulis/core/excel`
  (`src/excel/index.ts`), ko `packages/web` importē ar dinamisku `import()`
  tikai eksporta pogas klikšķī — skat. "Bundle izmērs / code-splitting".
- Node puses kodam (`@tames-modulis/core/node`, `src/node.ts`) bundle
  izmērs nav aktuāls, tāpēc tas re-eksportē arī `excel/index.js` — Node
  patērētājiem nav jāzina par atsevišķo `/excel` ieeju.

## Struktūra (`packages/web`)

- `src/storage/IndexedDbStorageAdapter.ts` — `StorageAdapter` implementācija
  ar IndexedDB (viens object store `projects`, keyPath `projectId`, vērtība
  ir pilns `BoqState`). `load`/`list` izlaiž datus caur `migrateToCurrent`,
  tāpat kā `FileSystemStorageAdapter`.
- `src/components/ProjectList.tsx` — projektu saraksts, izveide, dzēšana, un
  "Importēt Excel" (failu izvēle -> `importBoqFromBuffer` -> jauns
  projekts, nosaukums no faila nosaukuma). Tāpat kā eksports, imports
  dinamiski importē `@tames-modulis/core/excel` failu izvēles apstrādē,
  nevis statiski.
- `src/components/ProjectEditor.tsx` — sadaļu/pozīciju rediģēšana, likmju
  (atlaide/virsizdevumi/peļņa/PVN) rediģēšana, projekta rekvizītu
  (Būvuzņēmējs/Pasūtītājs/Sastādīja/Pārbaudīja, sakļaujams `<details>` bloks)
  un sadaļu tāmes numuru (`estimateNumber`, "Nr." lauks sadaļas galvenē)
  rediģēšana — skat. "Projekta rekvizīti un tāmes numerācija" zemāk. Dzīvs
  kopsavilkums (`summarizeBoq` pārrēķināts katrā render), "Saglabāt"
  (IndexedDB), "Eksportēt Excel" (lejupielādē `.xlsx`) un "Importēt Excel
  (pārrakstīt sadaļas)" (imports esošā, jau atvērtā projektā — skat.
  "Imports esošā projektā" zemāk). Eksporta/importa pogas importē
  `exportBoqToBuffer`/`importBoqFromBuffer` ar dinamisku
  `import("@tames-modulis/core/excel")` klikšķa brīdī, nevis statiski augšā
  failā — skat. "Bundle izmērs / code-splitting" zemāk. "Apstiprināt bāzes
  tāmi" poga un "Tāme"/"Izmaiņas (VO)"/"Izpildes akti" cilnes pēc
  iesaldēšanas — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/components/VariationOrders.tsx` — "Izmaiņu" cilnes saturs (VO
  izveide/apstiprināšana/noraidīšana, izmaiņu pievienošana — ieskaitot
  jaunas sadaļas izveidi, atlikuma rādīšana pirms izmaiņas pievienošanas,
  diff skats) — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/components/ExecutionRecords.tsx` — "Izpildes akti" cilnes saturs
  (jauna izpildes akta ievade pa sadaļām ar izpildīts/atlikums kolonnām,
  aktu vēsture) — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/components/ExecutionEntryTable.tsx` — virtualizēta pozīciju tabula
  izpildes akta ievadei (tā pati tehnika kā `ItemsTable.tsx`, skat.
  "Pozīciju tabulas virtualizācija" un "Tāmes izmaiņu (Variation Order)
  vadība" zemāk). Lieto `ExecutionRecords.tsx` katrai sadaļai.
- `src/components/ItemsTable.tsx` — sadaļas pozīciju tabula ar rindu
  virtualizāciju (skat. "Pozīciju tabulas virtualizācija" zemāk). Lieto
  `ProjectEditor.tsx` katrai sadaļai. `readOnly` props atspējo ievadi pēc
  bāzes iesaldēšanas (skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk).
- `src/App.tsx` — savieno sarakstu un redaktoru, tur vienīgā
  `IndexedDbStorageAdapter` instance.
- `index.html` — `<link rel="icon">` ir inline SVG `data:` URI (zils
  noapaļots kvadrāts ar "T"), nevis atsevišķs binārs fails `public/`
  direktorijā — nav vajadzīgs jauns build solis/asset, un faila saturs ir
  redzams tieši `index.html` (skat. arī zemāk "Favicon").

## Lēmumi

- **Glabāšana sākās ar vienkāršiem JSON failiem, tagad arī IndexedDB
  brauzerim** — abi implementē to pašu `StorageAdapter` saskarni, tāpēc
  `ProjectService`/UI kods neatšķiras pēc glabāšanas mehānisma.
- **Migrācijas** tiek risinātas ar `schemaVersion` laukā katrā saglabātajā
  stāvoklī (fails vai IndexedDB ieraksts — abi adapteri izsauc
  `migrateToCurrent` ielādes brīdī). Trūkstoša versija tiek uzskatīta par
  `v1`. Nezināma nākotnes versija izmet `UnsupportedSchemaVersionError`.
- **PVN likme (`vatRate`) glabājas katrā projektā**, nevis kā globāla
  konstante. Noklusējums — `DEFAULT_VAT_RATE = 0.21` (LV standarta likme).
  Viena likme visam projektam — dažādas PVN likmes pa pozīcijām/sadaļām
  apzināti nav atbalstītas (skat. "Atlaide (diskonts)" zemāk, Sesija 15).
- **Atlaide (`discountRate`) ir projekta līmenī**, viena likme visam
  projektam (nevis pa sadaļām/pozīcijām) — simetriski ar `vatRate`/
  `overheadRate`/`profitRate`. Noklusējums `DEFAULT_DISCOUNT_RATE = 0`
  (bez atlaides). Skat. "Atlaide (diskonts)" zemāk pilnu pamatojumu un
  aprēķina secību.
- **Būvuzņēmēja/Pasūtītāja rekvizīti un Sastādīja/Pārbaudīja ir projekta
  līmenī, strukturēti apakšlauki** (nosaukums/reģ.nr./adrese katram
  uzņēmumam), nevis brīvs teksts vai sadaļas līmeņa lauki — apstiprināts ar
  lietotāju. **Tāmes numerācija (`estimateNumber`) ir sadaļas līmenī**,
  brīvs teksts, neatkarīgs no sadaļas nosaukuma UN no Excel eksporta lapas
  nosaukuma. Skat. "Projekta rekvizīti un tāmes numerācija" zemāk.
- **Tāmes izmaiņas (Variation Order) ir numurētas entītijas ar formālu
  statusa plūsmu** (ierosināts/apstiprināts/noraidīts), NEVIS tikai
  rediģējami "pašreizējie" daudzumi — un "pašreizējais" stāvoklis vienmēr
  ATVASINĀTS no iesaldētas bāzes + apstiprinātajām VO, bāze pēc iesaldēšanas
  nekad netiek mutēta. VO var izveidot arī pavisam JAUNU sadaļu (ne tikai
  pozīciju esošā). Skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- **Izpildes akti veido atsevišķu, papildinošu vēsturi pa atskaites
  periodiem** (`BoqState.executionRecords`), nevis vienu rediģējamu
  "izpildīts kopā" skaitli pozīcijā — kumulatīvais izpildītais un atlikums
  vienmēr ATVASINĀTS no šīs vēstures. Skat. "Tāmes izmaiņu (Variation
  Order) vadība" zemāk.
- **Aprēķini noapaļo tikai vienreiz, beigās** (`summarizeBoq`) — sadaļu un
  kopējās summas tiek saskaitītas no nenoapaļotiem starprezultātiem, lai
  daudzu sīku pozīciju gadījumā noapaļošanas kļūda nesakrātos.
- **`BoqItem` sadala izmaksas darba algā/materiālos/mehānismos** (nevis viens
  `unitPrice`), lai eksportētie/importētie faili atbilstu reālajai Latvijas
  Līguma tāmes struktūrai, ko izmanto arī `izpildes-akts-validacija` skill.
  Virsizdevumi (noklusējums 12%) un peļņa (noklusējums 5%) tiek rēķināti no
  tiešajām izmaksām sadaļas/projekta līmenī, nevis pa pozīcijām.
- **Excel imports/eksports ir apzināti dokumentēts kā daļēji zaudējošs
  (lossy)** ceļš — Excel neuztur mūsu iekšējos `id` laukus. Pilnai,
  bezzudumu glabāšanai izmanto `StorageAdapter` (fails/IndexedDB).
- **`exceljs` ir code-split, nevis daļa no galvenā UI bundle** — skat.
  "Bundle izmērs / code-splitting" zemāk.
- **`ProjectList.tsx` "Importēt Excel" vienmēr izveido JAUNU projektu**,
  nevis pārraksta atvērtā projekta sadaļas — vienkāršāk un drošāk (nav
  riska nejauši pārrakstīt esošu projektu tikai izvēloties nepareizu
  failu), un simetriski ar "+ Jauns" formu (abi ir "izveidot projektu"
  varianti — pēc nosaukuma vai pēc faila). Projekta nosaukums pēc
  noklusējuma nāk no faila nosaukuma (bez paplašinājuma); lietotājs var to
  pārsaukt redaktorā.
- **`ProjectEditor.tsx` "Importēt Excel (pārrakstīt sadaļas)"** (Sesija 14)
  importē failu ESOŠĀ, jau atvērtā projektā — skat. "Imports esošā
  projektā" zemāk pilnu pamatojumu un semantiku.
- **`ProjectService` ir plāns slānis virs `StorageAdapter`**, testēts pret
  vienkāršu in-memory adapteri neatkarīgi no faila sistēmas vai brauzera.
- **React + Vite priekš UI** — lielākā ekosistēma, vieglāk atrast palīdzību;
  vienkāršs, mazs risku pieņēmums, kas nebija pretrunā ar prasībām.
- **`packages/web` importē `@tames-modulis/core` avota TS failus tieši**
  (`package.json` `main`/`types`/`exports` rāda uz `src/index.ts`, nevis
  `dist/`), nevis pirms tam kompilē uz JS — vienkāršāk lokālai monorepo
  izstrādei (nav "aizmirsu pārbūvēt core" kļūdu risks), Vite/esbuild
  apstrādā TS avotu tāpat kā jebkuru citu.
- **Excel eksporta faila nosaukums tiek attīrīts no diakritiskajām zīmēm**
  (`toAsciiFileName` iekš `ProjectEditor.tsx`) — pārbaudīts ar Playwright,
  ka Chromium ar diakritiku (piem. "ā") `download` atribūtā krīt atpakaļ uz
  ģenērisku "download" nosaukumu, ar ASCII vārdu strādā pareizi. Tas nav
  testa artefakts — tas skars reālus lietotājus, jo projektu nosaukumi
  latviešu valodā parasti satur diakritiku. Faila iekšējais saturs
  (`projectName`) paliek neskarts.

### Bundle izmērs / code-splitting

`exceljs` (~1MB minificēts) sākotnēji nokļuva galvenajā UI bundle, jo
`packages/web` importēja `exportBoqToBuffer` statiski no
`@tames-modulis/core`, un tas caur `src/index.ts` barelu ievilka arī
`excel/export.ts` -> `exceljs`. Risinājums bija divpusējs — nepietiek
vienkārši uzrakstīt `import()` klikšķa apstrādātājā, ja pati atkarība
joprojām ir tajā pašā statiski importētajā modulī, ko lieto arī citur:

1. Izņemts `excel/*` eksports no `src/index.ts` (skat. "Node vs. universāls
   kods, un ieejas punkti"), lai tas vairs nebūtu daļa no moduļa, ko
   `packages/web` importē statiski citām vajadzībām (`createProject`,
   `summarizeBoq` u.c.).
2. `packages/web/src/components/ProjectEditor.tsx` `handleExport` un
   `App.tsx` `handleImport` iekšienē `exportBoqToBuffer`/
   `importBoqFromBuffer` tiek iegūti ar
   `await import("@tames-modulis/core/excel")` attiecīgi eksporta klikšķa
   un faila izvēles brīdī, nevis statiski faila augšā. Abas vietas
   dinamiski importē to pašu moduli, tāpēc Rollup to iebūvē vienā kopīgā
   chunk'ā (nevis dublē).

**Rezultāts (pārbaudīts):** `vite build` galvenais JS bundle samazinājās
no ~1098KB uz ~155KB (49.9KB gzip); `exceljs` tagad ir atsevišķs ~945KB
chunk, kas Playwright testā apstiprināti netiek pieprasīts sākotnējā lapas
ielādē — tikai pēc "Eksportēt Excel" klikšķa. Eksportētais fails joprojām
derīgs (pārbaudīts ar `openpyxl`).

### Kolonnu noteikšana pēc galvenes teksta (import)

Pārbaudot importu pret reālu 53-lapu Latvijas būvniecības tāmes failu
(VELVE tipa eksports, ~15M€ slimnīcas projekts), izrādījās, ka
`TAME_COLUMNS` (fiksētas kolonnu pozīcijas) neatbilst reāliem failiem —
**imports atgrieza 0 sadaļu, 0 pozīciju**. Reālajā failā papildu kolonnas
(piem., daudzstāvu/daudzēku projektiem — daudzuma sadalījums pa korpusiem)
tiek ievietotas starp "Mērvienība" un "Daudzums", nobīdot visu, kas seko,
un šī nobīde atšķiras pat starp vienas darbgrāmatas lapām atkarībā no tā,
vai konkrētajai lapai ir šāds papildu bloks.

**Risinājums:** `headerDetection.ts`'s `detectImportColumns` importam
kolonnas atrod, meklējot galvenes tekstu ("Mērvienība", "Daudzums",
"Būvdarbu nosaukums", "Darba alga", "Materiāli"/"būvizstrādājumi",
"Mehānismi", "Nr. p.k.") nevis pieņemot fiksētu pozīciju. `TAME_COLUMNS`
paliek nemainīgs — to joprojām lieto tikai eksports (rakstot zināmā
formātā), tikai imports vairs uz to nepaļaujas.

**Divas reālas kļūdas atrastas un izlabotas šī darba gaitā** (ne tikai
hipotētiskas):
1. Mūsu pašu eksports rakstīja saīsinājumu "Mērv." nevis pilnu
   "Mērvienība" — pēc pārejas uz galvenes-teksta noteikšanu tas nozīmēja,
   ka pat PAŠU ĢENERĒTIE faili vairs neimportējās. Izlabots, eksports
   tagad raksta "Mērvienība".
2. Reālā failā katrā lapā ir plaša apvienota (`merge`) instrukciju rinda
   ("(būvdarbu veids vai konstruktīvā elementa nosaukums)"), kas nejauši
   satur gan "būvdarbu", gan "nosaukums" (tikai ne blakus). exceljs katrai
   apvienotās šūnas kolonnai (ne tikai enkuram) atgriež to pašu vērtību,
   tāpēc "abi vārdi jebkurā vietā" pārbaude nepareizi sasaistīja "name"
   lauku ar 1. kolonnu (pirms sasniedza reālo galveni). Izlabots divējādi:
   (a) "name" pārbaude tagad prasa vārdus tieši blakus (`"būvdarbunosaukum"`
   kā viena apakšvirkne), (b) galvenes skenēšana tagad izlaiž jebkuras
   apvienotās šūnas, kas nav pati enkurs (`cell.isMerged && cell.master !==
   cell`) — vispārīgs labojums pret šo kļūdu klasi, ne tikai šo vienu
   gadījumu.

**Rezultāts pēc labojumiem (pārbaudīts pret reālo failu):** 47 no 53
lapām atpazītas kā datu lapas (6 izlaistas — satura rādītājs un
kopsavilkuma lapas bez "Mērvienība" galvenes vispār, pareizi), 12876
pozīcijas importētas. Izlases pārbaude: `DEM` lapas aprēķinātā tiešo
izmaksu summa (`calculateSectionDirectTotal`) sakrita ar pašas tāmes
"Tāmes izmaksas, eiro" šūnu līdz santīmam (63491.88 abās); citu lapu
starpība bija ≤0.02€ (avota faila pašas noapaļošanas dēļ, ne mūsu kļūda).
Pilns imports arī manuāli pārbaudīts caur reālu UI (Playwright): imports +
render ~26.5s, saglabāšana IndexedDB ~6.5s — strādā, bet lēni (skat.
PROGRESS.md par veiktspējas ierobežojumu ar lielu datu apjomu).

**Mērvienību saraksts paplašināts** ar reāli novērotiem variantiem, kas
SKILL.md dokumentācijā nebija minēti: `pāris`, `vieta`, `ltr`, `objekts`,
`litri`, `kompl`, `t.m`, `iepak`, `l`, `k-ts`, `maš/st`, `ēka`, `ha`, plus
`normalizeUnit` apstrādā galotnes punktus/komatus un Unicode
augšraksta ciparus (`m²`→`m2`, `m³`→`m3`) tā vietā, lai katru variantu
uzskaitītu atsevišķi.

### Pozīciju tabulas virtualizācija (UI veiktspēja)

Sesijā 12 (reāla 53-lapu Līguma tāmes faila pārbaude) atklāts, ka `import` +
render UI ar 12876 pozīcijām aizņēma ~17-26.5s, jo `ProjectEditor` renderēja
katras sadaļas VISAS pozīcijas uzreiz — 7 `<input>` elementi uz pozīciju,
kopā ~90k DOM mezglu. Sesijā 13 tas izlabots ar rindu virtualizāciju
(`ItemsTable.tsx`): katras sadaļas tabula ir ietverta ritināmā konteinerī
(`max-height: 480px`), un renderē tikai rindas, kas ietilpst redzamajā
apgabalā (+ nedaudz overscan uz katru pusi), pārējo vietu aizpildot ar
diviem "spacer" `<tr>` (augšā/apakšā), lai ritjoslas augstums paliktu
pareizs. Rindas augstums (`ROW_HEIGHT = 33`) ir fiksēta tuvināta vērtība,
nevis mērīta katrai rindai — pietiekami, jo visām rindām ir vienāds
izkārtojums.

**Kāpēc nevis bibliotēka (piem. `react-window`):** ievērots tas pats
princips kā `exceljs` code-splitting lēmumā (skat. zemāk) — bundle izmērs
ir apzināta prioritāte šajā projektā, un pašrocīga virtualizācija bez
papildu atkarības ir pietiekami vienkārša fiksēta-augstuma tabulai.

**Kāpēc nevis sakļautas sadaļas pēc noklusējuma:** tas mainītu UX arī
mazu projektu gadījumā (lietotājam jāklikšķina, lai redzētu pozīcijas) un
nerisinātu pašu problēmu — pat viena sadaļa ar simtiem pozīciju joprojām
būtu lēna, ja atvērta. Virtualizācija strādā neatkarīgi no sadaļu skaita
UN pozīciju skaita sadaļā, tāpēc UX nemainās mazām sadaļām (viss ietilpst,
nav ritjoslas), bet lielām sadaļām DOM mezglu skaits paliek ierobežots.

**Rezultāts (pārbaudīts ar sintētisku 47 sadaļu × 274 pozīciju failu,
identiska struktūra reālajam Sesijas 12 failam, ģenerēts un pārbaudīts ar
Playwright reālā Chromium):**
- Imports + render: ~17s -> ~3.1s (~5.4x ātrāk).
- DOM `<input>` mezglu skaits pēc importa: 90146 -> ~10199 (tikai redzamās
  rindas katrā no 47 sadaļām, nevis visas).
- Manuāli pārbaudīts: ritināšana sadaļas iekšienē pareizi maina redzamās
  rindas, rediģēšana virtualizētā rindā pielieto izmaiņu pareizajai
  pozīcijai (nevis redzamajam indeksam), izmaiņas saglabājas pēc
  ritināšanas prom un atpakaļ, dzīvais kopsavilkums (sadaļas un projekta
  līmenī) atjaunojas pareizi. Mazu projektu (1 sadaļa, 1 pozīcija) plūsma
  nemainīga — nav negribētas ritjoslas.

**Apstiprināts arī pret to pašu reālo Sesijas 12 failu** (53-lapu VELVE
tāme), tiešā pirms/pēc salīdzinājumā tajā pašā vidē (`git worktree` uz
commit tieši pirms šī labojuma, blakus pašreizējam kodam, abi caur `vite
preview`):
- Imports + render: 18.3s -> 6.0s (~3.0x ātrāk); DOM `<input>` mezgli:
  90132 -> 9268; KOPĀ AR PVN identisks abās versijās (116003891.89 €) —
  apstiprina, ka pareizība nav skarta.
- **"Saglabāt" (IndexedDB raksts):** 3.4s -> 0.4s (~8.7x ātrāk). Lapas
  pārlāde + projekta atvēršana: 6.4s -> 1.3s (~4.8x ātrāk). Sesijā 12
  minētais ~6.5s "saglabāšanas" laiks izrādījās nevis IndexedDB raksta
  izmaksa pati par sevi, bet React re-renderis pēc `setState` (pirms
  labojuma — visu ~90k input mezglu pārbūve no jauna pēc katras `save`/
  ielādes) — tātad šis labojums risina arī to, nevis tikai sākotnējo
  importa renderi.

### Imports esošā projektā

Sesijā 14 pievienots "Importēt Excel (pārrakstīt sadaļas)" `ProjectEditor.tsx`
redaktora galvenē — līdzās jau esošajam `ProjectList.tsx` "Importēt Excel"
(kas vienmēr veido jaunu projektu, skat. augšā "Lēmumi").

**Semantika (apstiprināta ar lietotāju): pārrakstīt, ne papildināt.**
Importētās sadaļas AIZSTĀJ visas esošā projekta sadaļas pilnībā — nevis
tiek pievienotas klāt. Projekta `projectId`, `projectName`, likmes
(`overheadRate`/`profitRate`/`vatRate`) un `createdAt` netiek skarti,
tikai `sections`. Implementēts, atkārtoti lietojot `importBoqFromBuffer`
(izsaukts ar pašreizējā projekta `projectId`/`projectName`, jo tā ir
obligāta funkcijas signatūra) un pēc tam paņemot tikai atgrieztā stāvokļa
`.sections` lauku, saglabājot pārējo pašreizējā `state` nemainīgu — core
pusē nekas nemainījās.

**Nesaglabā automātiski.** Tāpat kā jebkura cita rediģēšana redaktorā,
imports maina tikai lokālo (React) stāvokli — lietotājam jānospiež
"Saglabāt", lai izmaiņas nonāktu IndexedDB. Tas dod iespēju pārskatīt
importēto rezultātu pirms tas neatgriezeniski aizstāj saglabāto projektu,
un ir konsekventi ar pārējo redaktora uzvedību (nav īpašs gadījums).

**Apstiprinājuma dialogs pirms pārrakstīšanas** (`confirm()`, tāpat kā
`ProjectList.tsx` projekta dzēšanai) — imports ir destruktīva darbība
(aizstāj visu redaktorā redzamo saturu), tāpēc lietotājam jāapstiprina
pirms tas notiek, ne tikai jāatsauc pēc fakta.

**Manuāli pārbaudīts (Playwright, reāls Chromium):** eksportēts avota
projekts -> importēts mērķa projektā ar citu saturu un mainītu likmi ->
apstiprināts, ka (a) atceļot apstiprinājuma dialogu nekas nemainās, (b)
apstiprinot dialogu vecā sadaļa tiek AIZSTĀTA (sadaļu skaits paliek 1, ne
2), (c) likme un projekta nosaukums saglabājas nemainīgi, (d) izmaiņas
persistē pēc "Saglabāt" + lapas pārlādes. Pārbaudīts arī, ka `exceljs`
chunk (~946KB) svaigā lapas ielādē un projekta izveidē NETIEK pieprasīts —
tikai pēc importa klikšķa (chunk identificēts pēc izmēra, ne faila
nosaukuma, jo Vite hash nosaukumi nesatur "excel").

### Atlaide (diskonts)

Sesijā 15 pievienots projekta līmeņa `discountRate` (skat. "Lēmumi" augšā).

**Aprēķina secība (apstiprināta ar lietotāju): atskaitīta no tiešajām
izmaksām, PIRMS virsizdevumiem/peļņas.** `summarizeBoq` (`calculations/
boq.ts`) katrai sadaļai un projektam kopā vispirms rēķina
`discountAmount = directTotal * discountRate` un
`directTotalAfterDiscount = directTotal - discountAmount`, un tikai TAD no
`directTotalAfterDiscount` (nevis no neskartā `directTotal`) rēķina
virsizdevumus un peļņu. `directTotal` pats par sevi (pirms atlaides)
**paliek neskarts** — tā ir tiešā pārbaudes atsauce pret avota Līguma tāmes
"Tāmes izmaksas" šūnu (skat. Sesija 12 DEM lapas pārbaudi), un mainīt tā
nozīmi būtu klusi salauzis šo pārbaudes ķēdi.

**Excel eksportā** (`excel/export.ts`) `KOPSAVILKUMS` lapā pievienota
"Atlaides likme:" rinda pieņēmumu blokā un divas kolonnas kopsavilkuma
tabulā ("Atlaide", "Tiešās izmaksas pēc atlaides") starp "Tiešās izmaksas"
un "Virsizdevumi" — ar formulām, tāpat kā pārējās šūnas šajā failā.
**Imports** (`excel/import.ts`) nemainījās — tas jau iepriekš nelasīja
likmes atpakaļ no `KOPSAVILKUMS` lapas (tikai sadaļas/pozīcijas), tāpēc
`discountRate` arī netiek importēts, konsekventi ar jau dokumentēto
"Excel imports/eksports ir daļēji zaudējošs" lēmumu.

**UI** (`ProjectEditor.tsx`) "Atlaide (%)" lauks parādās `.rates` blokā
pirms "Virsizdevumi" (atbilstoši aprēķina secībai), un "Atlaide: ..."
rinda gan sadaļas, gan projekta kopsavilkumā parādās TIKAI, ja
`discountRate !== 0` — lai UX projektiem bez atlaides paliktu identisks
iepriekšējam (nav lieku rindu ar "0.00 €").

### Projekta rekvizīti un tāmes numerācija

Sesijā 17 pievienoti, pēc reālas lietošanas ar reālu VELVE tāmes failu
saņemtā feedback (Excel eksporta salasāmība, trūkstoši rekvizītu/paraksta
lauki, nepieciešamība manuāli ievadīt tāmes numuru):

**Datu modelis (`schemaVersion` `4 -> 5`):** `BoqState.contractor`/`client`
(`CompanyDetails` — `name`/`regNr`/`address`), `preparedBy`/`checkedBy`
(vārds/uzvārds teksta lauki) — projekta līmenī, VIENI visam projektam
(apstiprināts ar lietotāju, nevis pa sadaļām). `BoqSection.estimateNumber`
— brīvs teksts (piem. "1-1"), sadaļas līmenī, manuāli ievadāms.

**Kāpēc manuāla tāmes numerācija, nevis atvasināta no sadaļas/lapas
nosaukuma:** reāli Līguma tāmju faili numurē lokālās tāmes ("Lokālā tāme
Nr. 1-1") citādi, nekā ir nosaukta pati Excel lapa (piem. lapa "DEM",
numurs "1-1") — apstiprināts, ka nosaukumi ne vienmēr sakrīt. `import.ts`
tāpēc atstāj `estimateNumber` tukšu importējot (nevar to droši atvasināt no
faila), lietotājs to aizpilda manuāli redaktorā.

**`estimateNumber` NEAIZSTĀJ Excel eksporta lapas nosaukumu** (apstiprināts
ar lietotāju) — lapas nosaukums joprojām nāk no `section.name` (skat.
`sanitizeSheetName`), numurs parādās tikai kā teksts pašas lapas iekšienē
("Lokālā tāme Nr.: X"). Tas nozīmē arī `KOPSAVILKUMS` lapas formulas, kas
atsaucas uz sadaļu lapām pēc nosaukuma, nav ietekmētas.

**Excel eksportā** (`excel/export.ts`) katra lapa (arī `KOPSAVILKUMS`)
sākas ar `writeProjectHeaderBlock`: "Projekts:", "Būvuzņēmējs:" +
reģ.nr./adrese, "Pasūtītājs:" + reģ.nr./adrese, un (tikai sadaļu lapās)
"Lokālā tāme Nr.:". Katra lapa beidzas ar `writeSignatureBlock`:
"Sastādīja:"/"Pārbaudīja:" zem pozīciju tabulas/kopsavilkuma tabulas.
Rindu skaitīšana ir DINAMISKA (`headerLines`/`ratesStartRow`/
`tableHeaderRow` u.tml. aprēķināti no iepriekšējo bloku garuma, nevis
hardkodēti), lai nākotnē pievienojot/noņemot rindas nebūtu jāatjaunina
katra formula atsevišķi.

**Garās galvenes/paraksta rindu etiķetes (piem. "Būvuzņēmēja reģ. Nr.:",
16-22 rakstzīmes) ir apvienotas (`mergeCells`) pāri kolonnām 1-3** (nevis
tikai kolonnai 1, kas sadaļu lapās ir šaurā "Nr.p.k." kolonna, platums 7) —
apvienošana ir rindas-specifiska (row-scoped), tāpēc neietekmē šo kolonnu
platumu citās (datu) rindās tajā pašā lapā. Vērtību šūnas tāpat apvienotas
pāri vairākām kolonnām, lai uzņēmuma nosaukumam/adresei būtu pietiekami
vietas. `KOPSAVILKUMS` lapā (tikai 7 kolonnas) etiķetes/vērtības apvienotas
šaurāk (1-2 / 3-7), jo kolonna 1 tur jau ir plaša (32 rakstzīmes, dubultā
kalpo arī "Sadaļa" nosaukumu kolonnai).

**Kolonnu platumi un teksta aplaušana (`COLUMN_WIDTHS`, teksta
salasāmība):** lietotāja feedback pēc reāla VELVE faila eksporta — Excel
noklusējuma ~8.43 rakstzīmju platums padarīja ievadītos tekstus/ciparus
nelasāmus. Katrai sadaļu lapas kolonnai iestatīts platums tieši
(`sheet.getColumn(n).width`), un "Būvdarbu nosaukums" kolonnai (platākā, 48
rakstzīmes) papildus `wrapText: true` uz katras datu šūnas, lai garāki
apraksti aplaužas nevis tiek apgriezti. **Pārbaudot rezultātu ar
`openpyxl`** atklājās, ka blakus kolonnas ar VIENĀDU platumu tiek
konsolidētas vienā `<col min=X max=Y width=W>` XML ierakstā (exceljs
optimizācija) — `openpyxl`'s `column_dimensions` vārdnīca tad rāda `None`
starprindas kolonnām (tikai diapazona pirmajai), kas IZSKATĀS pēc
trūkstoša platuma, bet reālajā XML/Excel/LibreOffice platums pareizi
attiecas uz visu diapazonu — pārbaudīts tieši ar `unzip` + XML inspekciju,
nevis tikai `openpyxl`.

**Manuāli pārbaudīts (Playwright, reāls Chromium, ieskaitot lejupielādētā
`.xlsx` faila satura pārbaudi ar `openpyxl` un neapstrādātu XML):**
izveidots projekts, aizpildīti Būvuzņēmēja/Pasūtītāja rekvizīti un
Sastādīja/Pārbaudīja, pievienota sadaļa ar "Nr." = "1-1", eksportēts —
lejupielādētajā failā visi lauki parādās pareizajās rindās/kolonnās (galvenes
bloks, tabula, tiešo izmaksu rinda, paraksta bloks), kolonnu platumi
atbilst iestatītajiem. Pēc "Saglabāt" + lapas pārlādes rekvizīti un tāmes
numurs saglabājas. Reāls 47-sadaļu VELVE imports pārbaudīts arī pēc šīm
izmaiņām — katrai sadaļai parādās (tukšs) "Nr." lauks, rediģējams, nav
konsoles kļūdu, imports strādā tāpat kā iepriekš.

**Definition of Done — pārbaudīts:**
- ✅ Core: 49/49 testi zaļi (8 jauni: migrācijas v4->v5 defaults/preserve,
  Excel eksporta galvenes/paraksta bloka saturs, kolonnu platumi).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi — jaunie lauki ir daži simti baitu papildu koda/UI,
  nevis jauna atkarība).
- ✅ Manuāli pārbaudīts ar reālu lejupielādētu `.xlsx` failu (ne tikai
  `exportBoqToWorkbook` tiešā izsaukumā) — galvenes/paraksta bloki, kolonnu
  platumi apstiprināti gan lietotnē, gan pašā failā.
- ✅ Reāls 47-sadaļu VELVE fails joprojām importējas pareizi ar jauno
  `estimateNumber` lauku.

### Tāmes izmaiņu (Variation Order) vadība

Sesijā 18 pievienota FIDIC-stila tāmes izmaiņu vadība pēc bāzes tāmes
apstiprināšanas — lēmumi apstiprināti ar lietotāju PIRMS ieviešanas (skat.
PROGRESS.md Sesija 18 pilnu jautājumu/atbilžu sarakstu).

**Bāzes iesaldēšana ir skaidra darbība**, nevis netieša. `BoqState.
baselineApprovedAt: string | null` — `null` nozīmē "melnraksts" (sadaļas/
pozīcijas brīvi rediģējamas kā jebkurā projektā pirms šīs funkcijas). Kad
lietotājs nospiež "Apstiprināt bāzes tāmi" (`ProjectEditor.tsx`), datums
tiek iestatīts un **`sections` no tā brīža ir bāze — pastāvīga, nekad vairs
tieši nerediģēta atsauce**. Nav atsevišķa "baseline snapshot" lauka —
`sections` PATS IR bāze pēc iesaldēšanas, tāpēc nav divu paralēlu kopiju,
kas varētu izklīst.

**"Pašreizējais" stāvoklis vienmēr ATVASINĀTS, nekad glabāts.**
`deriveCurrentSections(baseline, variationOrders)`
(`variationOrders/deriveCurrentState.ts`) klonē bāzi un piemēro padoto VO
sarakstu SECĪGI — funkcija pati NEZINA/NEPĀRBAUDA statusu, saucējs izvēlas,
kuras VO padot (parasti tikai `status === "approved"`, skat.
`deriveCurrentState`). Šis dizains (nevis VO apstiprināšana tieši pārraksta
`quantity`) izvēlēts apzināti: bāze paliek vienīgais patiesības avots
pārbaudei/audit trail, un tā pati atvasināšanas funkcija ir atkalizmantojama
"kas notiktu, ja" simulācijām (skat. zemāk
`computeVariationOrderDirectTotalImpact`).

**VO datu modelis** (`models/variationOrder.ts`): `VariationOrder` (numurs
"VO-N" secīgs, statuss ierosināts/apstiprināts/noraidīts, datums,
pamatojums, instruējošā puse, `changes[]`). Katra `VariationOrderChange`
attiecas VAI NU uz jau esošu pozīciju (`itemId` — daudzuma korekcija
`quantityDelta` un/vai pilnīga izslēgšana `excluded`), VAI ievieš pavisam
jaunu pozīciju esošā sadaļā (`itemId: null`, dati `newItem` laukā). **Jaunas
pozīcijas dabū `id` vienādu ar to izveidojušās izmaiņas `id`** — tas ļauj
VĒLĀKAI VO atsaukties uz to tāpat kā uz bāzes pozīciju (piem. viena VO
pievieno pozīciju, cita to vēlāk izslēdz vai koriģē).

**"Izslēgta" pozīcija ir atsevišķs karogs, NAV vienāds ar `quantity = 0`**
(apstiprināts ar lietotāju — `0` var nozīmēt arī "vēl nav sākts", ne
"atcelts"). `BoqItem.excluded?: boolean` — TIKAI atvasinātajā stāvoklī var
būt `true` (bāzes pozīcijās vienmēr false/undefined).
`calculations/boq.ts` `calculateItemCosts` izslēgtai pozīcijai vienmēr
atgriež nulles izmaksas NEATKARĪGI no `quantity` — daudzums paliek redzams
atsaucei/diff skatam, tikai izmaksas tiek nullētas.

**Zināms ierobežojums (apzināti ārpus šī uzdevuma apjoma):** VO var
pievienot jaunas POZĪCIJAS esošā sadaļā, bet NE jaunas SADAĻAS — lietotājs
to nepieprasīja precizējošajos jautājumos. Nākotnē varētu paplašināt
`VariationOrderChange`, analoģiski `newItem`.

**Finansiālā ietekme** — `computeVariationOrderDirectTotalImpact(baseline,
variationOrders, voId)` rēķina VIENAS VO ietekmi (neatkarīgi no tās paša
statusa — arī vēl "ierosināta" VO rāda paredzamo ietekmi) kā starpību starp
atvasināto stāvokli TIEŠI PIRMS un TŪLĪT PĒC šīs VO piemērošanas
(iepriekšējo APSTIPRINĀTO VO kontekstā, masīva secībā). Tas pareizi
apstrādā VISUS gadījumus (daudzuma korekcija/izslēgšana/jauna pozīcija)
vienādi, bez atsevišķas per-izmaiņas formulas dublēšanās — maksā divas
`deriveCurrentSections` izsaukumus, kas ir pieņemami reālu projektu VO
skaitam (desmiti, ne tūkstoši). **Ierobežojums:** ja vairākas VO maina TO
PAŠU pozīciju, katras VO "ietekme" ir marginālā ietekme SAVĀ secības
punktā (pareizi kumulatīvai bilancei), nevis izolēta "šīs VO vienas paša
nopelns".

**UI** (`ProjectEditor.tsx`, `VariationOrders.tsx`): pēc iesaldēšanas
parādās dzeltens baneris un divas cilnes — "Tāme" (rāda ATVASINĀTO
stāvokli, `ItemsTable` `readOnly`, struktūras pogas paslēptas, "Importēt
Excel" atspējots — imports pārrakstītu bāzi tieši) un "Izmaiņas (VO)"
(`VariationOrders.tsx` — jaunas VO forma, VO karšu saraksts ar
apstiprināšanas/noraidīšanas pogām TIKAI `proposed` statusam, izmaiņas
pievienošanas forma ar sadaļas/pozīcijas izvēli no ATVASINĀTĀ pašreizējā
stāvokļa, un "Mainītās pozīcijas" diff tabula visam projektam). Pirms
iesaldēšanas UI izskatās un darbojas identiski iepriekšējam — cilnes
vispār nerenderējas, jo VO jēdziens bez bāzes nav definēts.

**Excel eksports** (`excel/export.ts`): kad bāze iesaldēta, sadaļu lapas un
`KOPSAVILKUMS` rāda ATVASINĀTO (bāze + apstiprinātās VO) stāvokli — atbilst
reālai FIDIC praksei, kur darba tāme atspoguļo apstiprinātās izmaiņas.
Katrai sadaļu lapai divas papildu kolonnas STINGRI AIZ esošā
`TAME_COLUMNS` izkārtojuma ("Bāzes daudzums", "Delta") — novietojums aiz
fiksētajām kolonnām nozīmē, ka atkārtots imports (kas kolonnas atrod pēc
galvenes teksta, nevis pozīcijas) nav ietekmēts. Izslēgta pozīcija vizuāli
marķēta ar pārsvītrojumu (`font.strike`), NEVIS teksta piedēkli aprakstā —
lai atkārtots imports nesabojātu aprakstu. Jauna **"IZMAIŅAS" darblapa**
(tikai, ja projektam ir vismaz viena VO) — izmaiņu reģistrs (viena rinda
katrai VO ar finansiālo ietekmi) + "Mainītās pozīcijas" tabula
(`diffAgainstBaseline`). Bez iesaldētas bāzes eksports paliek pilnībā
nemainīgs (backward compatible ar projektiem, kas šo funkciju nelieto).

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma no nulles):**
skat. PROGRESS.md Sesija 18 pilnu pārbaudes aprakstu — bāzes iesaldēšana,
VO izveide/izmaiņu pievienošana (daudzuma pieaugums UN izslēgšana)/
apstiprināšana, diff skats, Excel eksports (`.xlsx` fails pārbaudīts ar
`openpyxl`), konsolē nav kļūdu.

#### Jaunas sadaļas caur VO (Sesija 19)

Sesijā 18 VO varēja pievienot jaunas POZĪCIJAS esošā sadaļā, bet ne jaunas
SADAĻAS — dokumentēts kā zināms ierobežojums. Sesijā 19 lietotājs
pieprasīja to atbalstīt (reāls gadījums: VO ievieš pavisam jaunu darbu
bloku, kas sākotnējā tāmē nemaz nebija).

**Mehānisms — divu soļu process, konsekventi ar jau esošo "jaunas
pozīcijas" pieeju:** `VariationOrderChange.newSection: { name, estimateNumber
} | null` — kad iestatīts, šī izmaiņa izveido TUKŠU sadaļu ar `id` vienādu
ar pašas izmaiņas `id` (self-referencing, tāpat kā jaunām pozīcijām).
Pozīcijas šai sadaļai pievieno ATSEVIŠĶAS turpmākas izmaiņas (tajā pašā vai
vēlākā VO), kas norāda `sectionId: <sadaļu izveidojušās izmaiņas id>` un
`itemId: null`. Nevis viena izmaiņa, kas izveido sadaļu UN pievieno pirmo
pozīciju vienlaicīgi — tas prasītu piešķirt VIENU `id` gan jaunajai sadaļai,
gan jaunajai pozīcijai, kas sajauktu id telpu (sadaļu un pozīciju id vairs
nebūtu skaidri atšķirami pēc izcelsmes).

**`deriveCurrentSections`** (`variationOrders/deriveCurrentState.ts`)
`applyChange` tagad vispirms pārbauda `change.newSection` — ja iestatīts,
pievieno tukšu sadaļu un atgriežas, NEMEKLĒJOT `change.sectionId` esošajās
sadaļās (kas jaunai sadaļai vienalga neeksistētu pirms šīs izmaiņas).

**Excel eksporta labojums (reāla kļūda, atrasta ieviešot šo funkciju):**
`excel/export.ts` `exportBoqToWorkbook` iepriekš meklēja katras sadaļas
bāzes versiju pēc MASĪVA INDEKSA (`state.sections[i]`), pieņemot, ka
`currentSections.length === state.sections.length` vienmēr — tas bija
patiess TIKAI tāpēc, ka VO līdz šim nevarēja pievienot sadaļas. Ar jaunām
sadaļām šis pieņēmums lūst (jaunā sadaļa nobīda visu, kas seko tai masīvā).
Izlabots uz meklēšanu PĒC ID (`Map` no `state.sections`), un jaunai sadaļai
(bez bāzes atbilstības) padod SINTĒTISKU tukšu bāzes sadaļu (nevis `null`)
— lai "Bāzes daudzums"/"Delta" kolonnas paliktu konsekventas visās lapās
(jaunās sadaļas pozīcijām pareizi rāda "JAUNS"/pilnu daudzumu kā deltu),
nevis klusi trūktu tikai šajā vienā lapā.

**UI** (`VariationOrders.tsx`): sadaļas izvēlnē pirmā opcija ir "+ Jauna
sadaļa" — izvēloties to, parādās nosaukuma/tāmes numura lauki (pozīcijas
izvēlne paslēpta, jo jaunā sadaļa sākumā tukša). Sadaļu/pozīciju izvēlnes
IZMAIŅAS PIEVIENOŠANAS formā balstās uz "preview" atvasinājumu (bāze +
apstiprinātās VO + ŠĪS VO PAŠAS jau pievienotās izmaiņas), lai varētu
izveidot sadaļu un TAJĀ PAŠĀ, vēl neapstiprinātajā VO uzreiz tai pievienot
pozīcijas.

#### Izpildes aktu uzskaite un atlikuma aprēķins (Sesija 19)

Lietotāja pieprasījums: pirms VO izveides jāredz, cik no pašreizējā
(bāze + apstiprinātās VO) apjoma jau ir izpildīts un apstiprināts ar
izpildes aktiem, lai nesamazinātu/neizslēgtu apjomu, kas jau (daļēji)
izpildīts.

**Datu modelis (`schemaVersion` `6 -> 7`):** `models/executionRecord.ts` —
`ExecutionRecord` (izpildes akts par VIENU atskaites periodu, piem. mēnesi
— brīvs teksta `period` apzīmējums, nevis auto-numurēts, jo lietotāja
prakse var atšķirties; `date`, `approvedBy`, `entries[]`) un
`ExecutionRecordEntry` (`sectionId`, `itemId`, `executedQuantity` — ŠAJĀ
PERIODĀ izpildītais, NEVIS kumulatīvs). `BoqState.executionRecords:
ExecutionRecord[]`. **Append-only** — reiz saglabāts akts nav rediģējams/
dzēšams šajā versijā (audit trail, konsekventi ar to, ka apstiprināta/
noraidīta VO arī vairs nav rediģējama).

**Kumulatīvais/atlikums VIENMĒR ATVASINĀTS, nekad glabāts** (tas pats
princips kā "pašreizējais" VO stāvoklis) —
`executionRecords/executionRecords.ts`:
- `computeExecutedToDate(executionRecords, itemId)` — summē `entries`
  visos periodos šai pozīcijai.
- `computeRemainingQuantity(currentQuantity, executedToDate)` —
  `currentQuantity - executedToDate`. `currentQuantity` ir PAŠREIZĒJAIS
  (bāze + apstiprinātās VO) daudzums, NEVIS bāzes daudzums — jo jautājums
  ir "cik vēl paliek NO LĪGUMĀ PAREDZĒTĀ apjoma tieši tagad", ne no
  sākotnējās bāzes. Var atgriezt negatīvu vērtību (izpildīts vairāk par
  paredzēto) — funkcija to neierobežo, UI parāda kā brīdinājumu (skat.
  zemāk).

**Validācija: brīdinājums, NEVIS bloķēšana** (apstiprināts ar lietotāju) —
ja VO izmaiņa samazinātu/izslēgtu apjomu ZEM jau izpildītā, UI parāda
brīdinājumu, bet ļauj saglabāt — var būt leģitīmi iemesli (strīds, akta
kļūdas labošana), un lietotne apzināti neuzņemas šķīrējtiesneša lomu.

**Ievade: manuāla, nevis Excel imports** (apstiprināts ar lietotāju šai
versijai) — `ExecutionRecords.tsx` "Izpildes akti" cilne (rāda TIKAI pēc
bāzes iesaldēšanas, tāpat kā "Izmaiņas (VO)"): jauna akta forma (periods/
datums/apstiprinātājs) + PA SADAĻĀM (tāpat kā "Tāme" cilne) tabula ar
kolonnām Nr./Nosaukums/Mērv./Pašreizējais/Izpildīts līdz šim (PIRMS šī
akta)/Šajā periodā (ievade)/**Atlikums uz nākamo periodu** (dzīvi
pārrēķināts, rakstot) — pēdējā lieto lietotāja pieprasīts tieši šo
formulējumu. Rindas ar `atlikums < 0` vizuāli izceltas (`.over-executed`).
Zem tam aktu vēstures tabula (periods/datums/apstiprinātājs/pozīciju
skaits/kopā izpildīts šajā periodā).

**Akta ievades tabula ir virtualizēta** (`ExecutionEntryTable.tsx`, jauns
komponents) — lietotājs pieprasīja to uzreiz (nevis pēc reālas problēmas,
atšķirībā no `ItemsTable` vēstures Sesijā 12/13), jo šai tabulai ir
TIEŠI TĀDS PATS "viena rinda uz pozīciju" izkārtojums, kas reālam
projektam (skat. Sesija 12, 12876 pozīcijas) būtu tikpat lēns bez
virtualizācijas. Lieto TIEŠI TO PAŠU tehniku/konstantes kā `ItemsTable.tsx`
(`ROW_HEIGHT`/`OVERSCAN`/scroll-based windowing ar augšas/apakšas "spacer"
rindām) - atsevišķs komponents, nevis `ItemsTable` paplašinājums, jo
kolonnu kopa/nozīme atšķiras (izpildes/atlikuma kolonnas, nevis
rediģējamas izmaksu kolonnas). **Pārbaudīts (Playwright, 300 pozīciju
sintētisks projekts, ievadīts tieši IndexedDB, apejot UI):** DOM renderē
tikai ~31 rindu (nevis 300), ritināšana pareizi maina redzamās rindas,
ievadot daudzumu konkrētā redzamā rindā, "Atlikums" pareizi pārrēķinās
(piem. 100 - 30 = 70), un saglabātais akts satur pareizo vērtību.

**Atlikuma rādīšana VO izveidē** (`VariationOrders.tsx`): izvēloties esošu
pozīciju izmaiņas pievienošanas formā, parādās informācijas rinda
"Pašreizējais daudzums / Izpildīts līdz šim / Pieejamais atlikums", un, ja
ievadītā daudzuma korekcija/izslēgšana samazinātu apjomu zem jau izpildītā,
parādās brīdinājuma teksts (dzeltens bloks, tāpat kā bāzes iesaldēšanas
baneris) ar konkrētiem skaitļiem.

**Manuāli pārbaudīts (Playwright, reāls Chromium):** izveidota VO ar jaunu
sadaļu un tajā jaunu pozīciju (viena VO, divas secīgas izmaiņas) —
apstiprinot parādās abas sadaļas "Tāme" cilnē ar pareiziem kopsavilkumiem;
izveidots izpildes akts ar izpildītu daudzumu vienai pozīcijai — atlikums
tabulā aprēķināts pareizi; jaunā VO izveides formā pareizi parādīts
"Pieejamais atlikums"; mēģinot samazināt apjomu zem izpildītā, parādījās
pareizs brīdinājuma teksts ar precīziem skaitļiem. Konsolē nav kļūdu.

#### Izpildes akti Excel eksportā (Sesija 20)

Līdz Sesijai 19 (ieskaitot) `state.executionRecords` Excel eksportā vispār
neparādījās — nedz reģistrs, nedz ietekme uz sadaļu lapām. Lietotājs
apstiprināja abas daļas (sadaļu kolonnas UN atsevišķa reģistra lapa, skat.
zemāk), simetriski ar jau esošo VO/"IZMAIŅAS" pieeju.

**Jaunas core funkcijas** (`executionRecords/executionRecords.ts`), abas
testētas (`test/executionRecords.test.ts`):
- `computeExecutionRecordValue(record, currentItemsById)` — viena izpildes
  akta EUR vērtība (visu tā `entries` izpildīto daudzumu × attiecīgās
  pozīcijas vienības izmaksa, summēts NEATKARĪGI no mērvienības, jo tā ir
  naudas summa, ne daudzums — atšķirībā no `ExecutionRecords.tsx` vēstures
  tabulas "Kopā izpildīts šajā periodā", kas summē jēlos daudzumus un tāpēc
  jēgpilna tikai vienas mērvienības gadījumā). Lieto pozīcijas PAŠREIZĒJO
  vienības izmaksu, nevis vēsturisko cenu akta brīdī (kas netiek glabāta
  atsevišķi) — konsekventi ar to, ka arī atlikums rēķina pret pašreizējo
  daudzumu, nevis akta laika daudzumu.
- `computeExecutionOverview(currentSections, executionRecords)` — pārskata
  rindas VISĀM pozīcijām ar vismaz kādu izpildi (`executedToDate !== 0`) —
  pozīcijas bez izpildes izlaistas, tāpat kā `diffAgainstBaseline` izlaiž
  nemainītas pozīcijas.

Abas funkcijas izslēgtai pozīcijai (`BoqItem.excluded`) lieto vienības
izmaksu `0`, konsekventi ar `calculateItemCosts`.

**Excel eksportā** (`excel/export.ts`) divas izmaiņas:
1. Katrai sadaļu lapai (`writeSectionSheet`) divas jaunas kolonnas STINGRI
   AIZ jau esošajām VO "Bāzes daudzums"/"Delta" kolonnām (`EXECUTION_COLUMNS`,
   pēc `VARIATION_COLUMNS.quantityDelta`) — "Izpildīts" (`computeExecutedToDate`)
   un "Atlikums" (`computeRemainingQuantity`). Renderētas TIKAI, ja
   `state.executionRecords.length > 0` (`showExecution` karogs) — praksē tas
   vienmēr nozīmē arī iesaldētu bāzi, jo UI "Izpildes akti" cilne pati ir
   redzama tikai pēc iesaldēšanas, bet kods to tieši nepieņem (pārbauda
   `executionRecords`, nevis `baselineApprovedAt`), lai abas kolonnu grupas
   paliktu neatkarīgas viena no otras (projekts ar VO, bet BEZ izpildes,
   joprojām rāda tikai Bāzes/Delta, nevis tukšas Izpildīts/Atlikums kolonnas).
2. Jauna **"IZPILDES AKTI" darblapa** (`writeExecutionRecordsSheet`, tikai
   ja projektam ir vismaz viens izpildes akts) — akta reģistrs (viena rinda
   katram aktam: periods/datums/apstiprinātājs/pozīciju skaits/akta EUR
   vērtība caur `computeExecutionRecordValue`) + "Izpildes pārskats"
   tabula (`computeExecutionOverview`, visas sadaļas kopā) ar Sadaļa/Nr./
   Nosaukums/Mērv./Pašreizējais daudzums/Izpildīts līdz šim/Atlikums/
   Izpildītā vērtība. Sekmīga struktūra/rindu skaitīšana kopēta no
   `writeVariationOrdersSheet` (galvenes bloks -> reģistra virsraksts+tabula
   -> pārskata virsraksts+tabula), tai skaitā tas pats kolonnu-platuma
   kompromiss (viena kolonnu grupa, divas nozīmes pa tabulām).

Bez izpildes akta datiem (`executionRecords.length === 0`) eksports paliek
pilnībā nemainīgs (backward compatible), tāpat kā VO eksporta izmaiņas
Sesijā 18.

**Manuāli pārbaudīts** (pagaidu vitest skripts, kas rakstīja reālu `.xlsx`
uz disku, izdzēsts pēc lietošanas — tāpat kā Sesijas 14 testa skripta
piezīme): divi izpildes akti (janvāris: pozīcija "a" 40 vienības; februāris:
"a" +50, "b" 50) pret VO-koriģētu sadaļu (pozīcija "a" 100 -> 130 caur VO).
Pārbaudīts ar `openpyxl` (`data_only=True`): sadaļas lapā pozīcijai "a"
Izpildīts=90 (40+50 kumulatīvi), Atlikums=40 (130-90); pozīcijai "b"
Izpildīts=50, Atlikums=0. "IZPILDES AKTI" lapā reģistra rindas 400€ (janvāra
akts, tikai "a": 40×10) un 700€ (februāra akts: "a" 50×10=500 +
"b" 50×4=200); pārskata tabulā abas pozīcijas ar pareizu pašreizējo/
izpildīto/atlikuma/vērtības kolonnu. Visi skaitļi sakrita ar roku rēķinātu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 90/90 testi zaļi (82 + 8 jauni: 6 `computeExecutionRecordValue`/
  `computeExecutionOverview` unit testi, 2 Excel eksporta testi ar/bez
  izpildes akta datiem).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ Manuāli pārbaudīts reāls ģenerēts `.xlsx` fails ar `openpyxl`
  (sadaļu kolonnas UN "IZPILDES AKTI" lapa), ne tikai `exportBoqToWorkbook`
  tiešā unit testā.
- ⚠️ **Nav vēl pārbaudīts ar reālo 53-lapu/12876 pozīciju VELVE failu** —
  lietotājs apstiprināja, ka arī to vajag šajā sesijā, bet fails vēl jāsaņem
  no jauna (skat. PROGRESS.md Sesija 20).

### Favicon

Sesijā 16 pievienots vienkāršs favicon — zils noapaļots kvadrāts ar baltu
"T" monogrammu, inline SVG kā `data:image/svg+xml,...` `<link rel="icon">`
`index.html` `<head>`. Apzināti NAV atsevišķs binārs fails
`public/favicon.ico`/`.png` — inline SVG datu URI nozīmē, ka nav vajadzīga
jauna `public/` direktorija, jauns build/copy solis, vai binārā faila
glabāšana repo (kas nav diff-friendly); saturs ir tieši lasāms/rediģējams
`index.html` iekšienē kā jebkurš cits marķējums. SVG (ne PNG/ICO), jo
mērogojas bez kvalitātes zuduma jebkurā tab izmērā un ir mazāks par
ekvivalentu bitmapu. Pirms tam pārlūka konsolē katrā lapas ielādē bija
`favicon.ico` 404 (nekritiski, bet redzams "trokšņa" avots
`console --errors` pārbaudēs, tai skaitā Sesijas 15 manuālajā pārbaudē) —
tas tagad novērsts.

## Palaišana

```bash
cd tames-modulis
npm install                    # instalē abas pakotnes (npm workspaces)

# core bibliotēka
npm test --workspace @tames-modulis/core
npx tsc -p packages/core/tsconfig.json --noEmit

# web UI
npm run dev:web                # Vite dev serveris (packages/web)
npm run build:web              # production build (typecheck + vite build)
```

## Konvencijas

- Visi `packages/core` publiski eksportētie tipi/funkcijas iet caur
  `src/index.ts` (universāls) vai `src/node.ts` (+ Node-only adapteri).
  Nepievieno neko `node:*` importējošu `src/index.ts` — skat. augšā "Node
  vs. universāls kods".
- UI komponentes (`packages/web`) glabā visu BOQ stāvokli vienā
  `useState<BoqState>` un pārrēķina `summarizeBoq` katrā renderā —
  vienkāršāk nekā atsevišķa memoizācija/atvasināts stāvoklis šajā apjomā.
