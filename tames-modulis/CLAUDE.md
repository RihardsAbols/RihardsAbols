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
  pavisam jaunu sadaļu, ne tikai pozīciju esošā) un
  `VariationOrder.reserveDrawdown` (EUR summa, ko VO izmanto no atvasinātās
  "Pasūtītāja rezerves", skat. "Pasūtītāja rezerve (Sesija 26)" zemāk) —
  skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/models/executionRecord.ts` — `ExecutionRecord`/`ExecutionRecordEntry`
  tipi (izpildes akts par vienu atskaites periodu) — skat. "Tāmes izmaiņu
  (Variation Order) vadība" zemāk.
- `src/variationOrders/deriveCurrentState.ts` — `deriveCurrentSections`/
  `deriveCurrentState` (atvasina bāze + apstiprinātās VO, arī jaunas
  sadaļas), VO izveide/numerācija, `voidVariationOrder` (anulē apstiprinātu
  VO, skat. "Izpildes aktu/VO anulēšana (Sesija 23)" zemāk),
  `computeVariationOrderDirectTotalImpact`, `diffAgainstBaseline`,
  `computeItemCodesAndHistory` (atvasinātā N.p.k. numerācija + katras VO
  izolētā ietekme uz katru pozīciju, skat. "Pozīciju numerācija + VO
  izmaiņu vēsture (Sesija 24)" zemāk), `computeReserveBalance` ("Pasūtītāja
  rezerve" uzkrāšanas/izmantošanas atvasinājums, skat. "Pasūtītāja rezerve
  (Sesija 26)" zemāk) — skat. "Tāmes izmaiņu (Variation Order) vadība"
  zemāk pilnu semantiku.
- `src/executionRecords/executionRecords.ts` — `computeExecutedToDate`
  (kumulatīvais izpildītais daudzums no visiem periodiem, izlaižot
  anulētos aktus), `computeRemainingQuantity`, `createExecutionRecord`,
  `voidExecutionRecord` (anulē aktu, skat. "Izpildes aktu/VO anulēšana
  (Sesija 23)" zemāk) — skat. "Tāmes izmaiņu (Variation Order) vadība"
  zemāk.
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
  Pašreiz `v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 -> v8`, `migrateToCurrent`
  atbalsta pakāpenisku migrāciju pievienošanu arī turpmāk.
- `src/calculations/boq.ts` — aprēķinu kodols: pozīcijas izmaksas
  (`calculateItemCosts`), sadaļas tiešās izmaksas
  (`calculateSectionDirectTotal`), un pilns kopsavilkums ar atlaidi,
  virsizdevumiem, peļņu un PVN (`summarizeBoq` -> `BoqSummary`) — skat.
  "Atlaide (diskonts)" zemāk aprēķina secību.
- `src/excel/` — Excel imports/eksports. **Nav daļa no universālā
  `src/index.ts` barela** (skat. zemāk) — pieejams caur
  `@tames-modulis/core/excel` (`src/excel/index.ts`).
  - `columns.ts` — `TAME_COLUMNS` (kolonnu karte, ko **raksta** eksports),
    `KNOWN_UNITS` (kanoniskais mērvienību saraksts), `normalizeUnit`
    (attīra reālu failu variantus — galotnes punktu/komatu, iekļautus rindu
    pārtraukumus, Unicode augšraksta cipariem `m²`/`m³` — pirms
    salīdzināšanas ar `KNOWN_UNITS`) un `isKnownUnit` (pilns-virknes
    pārbaude, TAD, ja neizdodas UN virknē ir "/", daļas pirms pirmā "/"
    pārbaude — atbalsta divvalodu LV/EN mērvienības kā "vieta/place" bez
    riska jau esošajam vienas-virknes-ar-"/" `maš/st`, skat. "Bilingvāla
    (LV/EN) tāmes faila imports (Sesija 25)" zemāk). Sarakstu papildina gan
    `izpildes-akts-validacija` skill dokumentācija, gan reāla 53-lapu Līguma
    tāmes faila pilna mērvienību apsekošana (skat. PROGRESS.md, Sesija 12),
    gan reāla divvalodu C2-10 faila apsekošana (Sesija 25).
  - `headerDetection.ts` — `detectImportColumns`: **importam** kolonnas
    atrod pēc galvenes teksta (nevis fiksētas pozīcijas kā `TAME_COLUMNS`,
    ko lieto tikai eksports) — skat. "Kolonnu noteikšana pēc galvenes
    teksta" zemāk; katram no 7 laukiem matcheris pārbauda gan LV, gan EN
    galvenes tekstu (skat. "Bilingvāla (LV/EN) tāmes faila imports (Sesija
    25)" zemāk). `detectExecutionActColumns` — tas pats galvenes-teksta
    princips izpildes akta (Forma Nr.2/Nr.3) failiem, skat. "Izpildes aktu
    Excel imports (Sesija 21)" zemāk. `detectDayworksColumns` — atsevišķs,
    5 lauku matcheris FIDIC dienas darbu likmju lapas formātam (VIENA "Rate"
    kolonna, ne 3-way sadalījums), skat. "'A General requirements'/'B Day
    works' — angļu-only lapas (Solis 2)" zemāk.
  - `executionActImport.ts` — `parseExecutionActWorkbook`/
    `parseExecutionActBuffer` (nolasa "šī perioda izpildīts" katrai akta
    lapai), `suggestSheetToSectionMapping` (akta lapa -> `BoqSection` pēc
    nosaukuma), `matchExecutionActToProject` (akta rinda -> `BoqItem` pēc
    koda mapotajā sadaļā) — skat. "Izpildes aktu Excel imports (Sesija 21)"
    zemāk pilnu semantiku.
  - `dayworksImport.ts` — `parseDayworksItems`: FIDIC dienas darbu (dayworks)
    likmju lapas import — katra rinda kļūst par `BoqItem` ar `daudzums = 0`
    (informatīva likme, ne pasūtīts darbs) un VIENĪGO likmi ievieto pareizajā
    izmaksu laukā pēc lapas PAŠAS brīvā teksta sadaļu virsrakstiem (LABOUR/
    MATERIAL/PLANT), skat. "'A General requirements'/'B Day works' — angļu-
    only lapas (Solis 2)" zemāk.
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
    "Nr.p.k." kolonnā pēc bāzes iesaldēšanas rāda atvasināto `displayCode`
    (nevis bāzes `item.code`), un katrai sadaļai relevanta apstiprināta VO
    pievieno "VO-X ΔDaudz."/"VO-X ΔEUR" kolonnu pāri — tā pati
    `computeItemCodesAndHistory` atvasinātā numerācija/vēsture, ko
    `ItemsTable.tsx` jau rāda "Tāme" cilnē, skat. "Excel eksports:
    pozīciju numerācija (displayCode) + VO delta kolonnas (Sesija 27)"
    zemāk.
    Abas funkcijas pieņem opcionālu `ExportOptions` otro parametru
    (`{ includeReserveRegister?: boolean }`, noklusējums `false`) — TIKAI
    kad `true`, "IZMAIŅAS" lapai pievienota trešā "Pasūtītāja rezerve"
    tabula, skat. "Pasūtītāja rezerve (Sesija 26)" zemāk.
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
  diff skats, "Pasūtītāja rezerve" kopsavilkums/reģistrs un tās izmantošanas
  ievade katrai VO) — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/components/ExecutionRecords.tsx` — "Izpildes akti" cilnes saturs
  (jauna izpildes akta ievade pa sadaļām ar izpildīts/atlikums kolonnām,
  aktu vēsture, izpildes akta Excel imports ar priekšskata/sasaistes soli)
  — skat. "Tāmes izmaiņu (Variation Order) vadība" zemāk.
- `src/components/ExecutionEntryTable.tsx` — virtualizēta pozīciju tabula
  izpildes akta ievadei (tā pati tehnika kā `ItemsTable.tsx`, skat.
  "Pozīciju tabulas virtualizācija" un "Tāmes izmaiņu (Variation Order)
  vadība" zemāk). Lieto `ExecutionRecords.tsx` katrai sadaļai.
- `src/components/ItemsTable.tsx` — sadaļas pozīciju tabula ar rindu
  virtualizāciju (skat. "Pozīciju tabulas virtualizācija" zemāk). Lieto
  `ProjectEditor.tsx` katrai sadaļai. `readOnly` props atspējo ievadi pēc
  bāzes iesaldēšanas, `executionRecords` props pievieno pastāvīgas
  "Izpildīts"/"Atlikums" kolonnas, `itemDisplay`/`voColumns` props aizstāj
  "Nr." ar atvasinātu numerāciju un pievieno VO delta kolonnas (skat.
  "Tāmes izmaiņu (Variation Order) vadība" zemāk).
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
  statusa plūsmu** (ierosināts/apstiprināts/noraidīts/**anulēts**), NEVIS
  tikai rediģējami "pašreizējie" daudzumi — un "pašreizējais" stāvoklis
  vienmēr ATVASINĀTS no iesaldētas bāzes + apstiprinātajām (un NEanulētajām)
  VO, bāze pēc iesaldēšanas nekad netiek mutēta. VO var izveidot arī
  pavisam JAUNU sadaļu (ne tikai pozīciju esošā). Kļūdaini apstiprinātu VO
  koriģē ar ANULĒŠANU + jaunu VO, nevis tiešu rediģēšanu (skat. "Izpildes
  aktu/VO anulēšana (Sesija 23)" zemāk). Skat. "Tāmes izmaiņu (Variation
  Order) vadība" zemāk.
- **Izpildes akti veido atsevišķu, papildinošu vēsturi pa atskaites
  periodiem** (`BoqState.executionRecords`), nevis vienu rediģējamu
  "izpildīts kopā" skaitli pozīcijā — kumulatīvais izpildītais un atlikums
  vienmēr ATVASINĀTS no šīs vēstures (izlaižot ANULĒTOS aktus). Kļūdainu
  aktu koriģē ar ANULĒŠANU + jaunu aktu, nevis tiešu rediģēšanu/dzēšanu
  (skat. "Izpildes aktu/VO anulēšana (Sesija 23)" zemāk). Skat. "Tāmes
  izmaiņu (Variation Order) vadība" zemāk.
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

### Bilingvāla (LV/EN) tāmes faila imports (Sesija 25)

Reāla projekta faila (C2-10, "Bill of Quantities", 67 lapas) pārbaude atklāja,
ka imports atgriež **0 sadaļu, 0 pozīciju** — pilnīga neveiksme, nevis daļēja
kā Sesijās 12/21. Cēlonis: šis fails ir divvalodu (LV/EN) — katra galvene
teksta veidā "Latviski/English", **arī rindas numura kolonna**: "N.p.k./No",
NEVIS "Nr. p.k." kā visos iepriekš redzētajos failos (trūkst burta "r").
`headerDetection.ts`'s `nrPk` matcheris bija VIENĪGAIS lauks, kas joprojām
lietoja STINGRU sakritību (`key === "nrpk"`) tā vietā, lai lietotu
`.includes(...)` kā pārējie 6 lauki — normalizētā galvene "N.p.k./No" kļūst
par "npkno" (ar pievienoto angļu "No"), kas NEKAD nesakristu ar "nrpk" pat
citādi identiskam failam.

**Labojums:** `nrPk` abos matcher'os (`FIELD_MATCHERS` un
`EXECUTION_ACT_FIELD_MATCHERS`) pārrakstīts uz `key.startsWith("nrpk") ||
key.startsWith("npk")` — `startsWith`, nevis brīvs `.includes`, lai
neriskētu sakrist ar "npk" kaut kur cita teksta vidū.

**Otrs, mazāks atradums tajā pašā failā:** mērvienības arī rakstītas
divvalodu formā ar "/" atdalītāju ("vieta/place", "vietas / place"), dažkārt
ar iekļautu rindas pārtraukumu vienā šūnā ("kpl./\nset"). Tā kā `maš/st` jau
ir VIENS KNOWN_UNITS ieraksts AR burtisku "/" (nevis divvalodu atdalītāju),
vienkārša "sadalīt pēc '/' vienmēr" pieeja to salauztu. Risinājums — jauna
`isKnownUnit(raw)` funkcija (`columns.ts`, eksportēta arī no
`excel/index.ts`) abu esošo tiešo izsaukuma vietu (`import.ts`,
`executionActImport.ts`) vietā: vispirms pārbauda PILNU normalizēto virkni
pret `KNOWN_UNITS` (tā "maš/st" sakrīt uzreiz, nekad nesasniedzot
sadalīšanu), TIKAI TAD, ja tas neizdodas UN virknē ir "/", pārbauda daļu
PIRMS pirmā "/" atsevišķi. `normalizeUnit` papildus sabrūk iekļautos rindu
pārtraukumus vienā atstarpē (`\s+` -> `" "`), lai "kpl./\nset" sadalīšanas
pirmā daļa ("kpl.") paliktu tīra. `KNOWN_UNITS` papildināts ar reāli
novērotiem jauniem variantiem: `mēn` (mēnesis), `vietas` (daudzskaitlis no
jau esošā `vieta`), `ievads` (cauruļu ievads).

**Pārbaudīts pret REĀLO C2-10 failu** (pagaidu skripts, izdzēsts pēc
lietošanas, tāpat kā iepriekšējo sesiju konvencija): pēc labojuma **63 no 67
lapām atpazītas** (4 neatpazītas — `KO`/`KS` ir leģitīmas kopsavilkuma lapas,
pareizi izlaistas; `A General requirements`/`B Day works` lieto PILNĪBĀ
ANGĻU (ne divvalodu) galvenes un `B Day works` arī pavisam citu kolonnu
struktūru — apzināti ĀRPUS šī labojuma apjoma, skat. PROGRESS.md Sesija 25
par to kā atsevišķu, vēl neapstiprinātu turpmāko soli), **3708 pozīcijas**
importētas. `2-10` lapas (lietotāja konkrētais projekts) aprēķinātā tiešo
izmaksu summa (`calculateSectionDirectTotal`) sakrita ar pašas lapas "Izmaksas
kopā" rindu LĪDZ SANTĪMAM (53500.10999999999 abās) — tā pati pārbaudes
metodoloģija, kas Sesijā 12 (DEM lapa) un Sesijā 20.

#### "A General requirements"/"B Day works" — angļu-only lapas (Solis 2)

Šīs divas C2-10 faila lapas paliek NEATPAZĪTAS pat pēc Soļa 1 labojuma —
NEVIS bilingvālas kā pārējās 63, bet PILNĪBĀ ANGĻU galvenes ("No.", "Name of
construction work", "Unit", "Quantity", "Salary"/"Materials"/"Mechanisms").
Izpēte (skat. PROGRESS.md Sesija 25) atklāja, ka abas ir strukturāli
atšķirīgas cita no citas, un lietotājs apstiprināja atšķirīgu apstrādi
katrai:

**"A General requirements" IR reāla, izcenota tāmes daļa** — aprēķinātā
kopsumma **1 673 637.30 €** precīzi sakrīt ar `KS` kopsavilkuma lapas
"General Requirement" kategorijas rindu (~5.6% no visas tāmes). Lietotājs
apstiprināja: jāiekļauj kopējā tāmju struktūrā. `headerDetection.ts`
`FIELD_MATCHERS` katram no 7 laukiem papildināts ar angļu ekvivalentu
(disjunkcija ar jau esošo LV/bilingvālo pārbaudi, piem. `unit: (key) =>
key.includes("mērvien") || key === "unit"`) — LV un EN pārbaudes VIENĀ
matcherī, nevis atsevišķs ceļš priekš angļu failiem. `KNOWN_UNITS`
papildināts ar `item` (angļu vispārīgā vienība lump-sum pozīcijām). Reālās
cenotās pozīcijas (~15-20 gab.) ir izkaisītas starp ~30 rindām ar garu
līguma punktu tekstu (arī ar mērvienību "item", bet 0€ izmaksām) — apzināta
izvēle importēt VISU (arī 0€ teksta rindas), nevis filtrēt pēc izmaksām,
lai saglabātu pilnu avota faila audit trail (konsekventi ar jau dokumentēto
"Excel imports/eksports ir daļēji zaudējošs, bet nefiltrē pēc satura"
principu) — pārbaudīts, ka lapas "COLLECTION"/"Total Brought Forward from
Page No." starprindu kopsavilkuma tabula (pati satur agregētas summas par
katru no 14 avota lapām) NETIEK importēta kā pozīcijas (tai nav "item"
mērvienības vērtības nevienā rindā) — bez tā šīs rindas dubultotu kopsummu.

**"B Day works" NAV izcenota tāme, bet FIDIC dienas darbu (dayworks)
likmju saraksts** — apstiprināts, ka VISĀ lapā `Quantity` kolonna ir tukša,
un pašas lapas noslēguma kopsavilkums burtiski raksta **"Rate Only"** katrai
no 6 lapām — nav reālas pasūtītas summas, tikai saskaņotas vienības cenas
"informācijai" (lietotāja vārdiem) turpmākiem VO, ja radīsies papildu darbi,
kas jāapmaksā pēc dienas darbu likmēm. Struktūra pilnībā atšķiras no
standarta 7-kolonnu izkārtojuma — VIENA "Rate (euro/h)" kolonna (nevis
Darba alga/Materiāli/Mehānismi sadalījums), tāpēc `detectImportColumns`
(kas pieprasa visus 7 laukus) to VIENMĒR noraida — tas ir tieši signāls
`importBoqFromWorkbook`-am mēģināt jaunu, atsevišķu ceļu:

- `headerDetection.ts` `detectDayworksColumns` — 5 lauku (nrPk/name/unit/
  quantity/rate) noteikšana, tikai angļu galvenēm (šī faila veids nekad nav
  bijis bilingvāls novērotajos paraugos).
- `excel/dayworksImport.ts` (jauns fails) — `parseDayworksItems` importē
  KATRU rindu ar `daudzums = 0` (nekas nav reāli pasūtīts, tāpēc šīs
  pozīcijas NEKAD neietekmē tāmes kopsummu — precīzi atbilst "Rate Only"
  semantikai), bet VIENĪGĀ likme tiek ierakstīta pareizajā no trim izmaksu
  laukiem (Darba alga/Materiāli/Mehānismi) atkarībā no tā, zem kuras no
  lapas PAŠAS brīvā teksta sadaļu virsrakstiem ("LABOUR ON SITE"/"MATERIAL
  DELIVERED TO SITE"/"PLANT HIRE") rinda atrodas — vienkāršs secīgs
  "pašreizējās kategorijas" stāvokļa automāts skenējot rindas no augšas uz
  leju, pārslēdzas, ieraugot šos atslēgvārdus teksta kolonnā. Procentu
  uzcenojuma rindas ("Allow for Profit and Overhead on labour", mērvienība
  "%") pareizi izlaistas — `%` NAV `KNOWN_UNITS`, tā pati pārbaude, ko lieto
  visas pārējās lapas.
- `import.ts` `importBoqFromWorkbook` — kad `detectImportColumns` atgriež
  `null` kādai lapai, PIRMS tās izlaišanas mēģina `detectDayworksColumns`
  kā fallback; ja arī tas neizdodas (piem. patiess satura rādītājs/
  kopsavilkuma lapa), lapa paliek izlaista tāpat kā līdz šim.

**Pārbaudīts pret REĀLO C2-10 failu:** pēc abiem labojumiem **65 no 67
lapām atpazītas** (`KO`/`KS` paliek pareizi izlaistas — tās ir leģitīmas
kopsavilkuma lapas). "A General requirements": 104 pozīcijas, kopsumma
1673637.22 € (0.08€ starpība no avota 1673637.30 € — nenozīmīga, tāda paša
lieluma kā iepriekš pieņemtā avota faila noapaļošanas starpība, skat.
Sesija 12). "B Day works": 39 pozīcijas, VISAS ar `daudzums=0` un pareizi
sabucketotu likmi (piem. "Semi-skilled labourers" -> Darba alga=19,
"Cement" -> Materiāli=10, "Piling rig" -> Mehānismi=197), kopsumma 0.00 €
(pareizi). Projekta KOPĒJĀ tiešo izmaksu summa: 27440147.79 € (25766510.57
+ 1673637.22, B devums 0). Pārbaudīts gan `importBoqFromWorkbook` tiešā
izsaukumā, gan REĀLĀ pārlūkā (Playwright): 65 sadaļas, konsolē nav kļūdu,
UI kopsavilkums precīzi sakrīt.

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
versijai — Excel imports pievienots vēlāk, Sesijā 21, skat. zemāk
"Izpildes aktu Excel imports") — `ExecutionRecords.tsx` "Izpildes akti"
cilne (rāda TIKAI pēc bāzes iesaldēšanas, tāpat kā "Izmaiņas (VO)"): jauna
akta forma (periods/datums/apstiprinātājs) + PA SADAĻĀM (tāpat kā "Tāme"
cilne) tabula ar kolonnām Nr./Nosaukums/Mērv./Pašreizējais/Izpildīts līdz
šim (PIRMS šī akta)/Šajā periodā (ievade)/**Atlikums uz nākamo periodu**
(dzīvi pārrēķināts, rakstot) — pēdējā lieto lietotāja pieprasīts tieši šo
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

**Manuāli pārbaudīts (sintētisks projekts)** (pagaidu vitest skripts, kas
rakstīja reālu `.xlsx` uz disku, izdzēsts pēc lietošanas — tāpat kā Sesijas
14 testa skripta piezīme): divi izpildes akti (janvāris: pozīcija "a" 40
vienības; februāris: "a" +50, "b" 50) pret VO-koriģētu sadaļu (pozīcija "a"
100 -> 130 caur VO). Pārbaudīts ar `openpyxl` (`data_only=True`): sadaļas
lapā pozīcijai "a" Izpildīts=90 (40+50 kumulatīvi), Atlikums=40 (130-90);
pozīcijai "b" Izpildīts=50, Atlikums=0. "IZPILDES AKTI" lapā reģistra rindas
400€ (janvāra akts, tikai "a": 40×10) un 700€ (februāra akts: "a" 50×10=500
+ "b" 50×4=200); pārskata tabulā abas pozīcijas ar pareizu pašreizējo/
izpildīto/atlikuma/vērtības kolonnu. Visi skaitļi sakrita ar roku rēķinātu.

**Manuāli pārbaudīts arī pret REĀLO 53-lapu/12876 pozīciju VELVE failu**
(lietotājs to pievienoja pēc pieprasījuma) — pagaidu vitest skripts
(izdzēsts pēc lietošanas): imports (47 sadaļas, 12876 pozīcijas, ~8.4s) ->
bāzes iesaldēšana -> viena VO ar VISIEM izmaiņu veidiem vienlaicīgi
(daudzuma korekcija reālai pozīcijai, esošas pozīcijas izslēgšana, jauna
sadaļa, jauna pozīcija tajā) -> divi izpildes akti pret VO-koriģēto
stāvokli -> Excel eksports (~4.5s, 1.6MB fails, kopā pilna plūsma bez UI
renderēšanas ~13s) -> `openpyxl` pārbaude. Rezultāts: 51 darblapa (1
KOPSAVILKUMS + 47 reālās sadaļas + 1 jaunā VO sadaļa + 1 IZMAIŅAS + 1
IZPILDES AKTI); reālas pozīcijas Izpildīts/Atlikums summējās pareizi ar
pašreizējo daudzumu, reģistra akta EUR vērtība sakrita ar pārskata tabulu,
izslēgtai pozīcijai Kopā-kolonnas pareizi nullētas, bet
daudzums/atlikums palika redzami; jaunajai VO sadaļai/pozīcijai VO kolonnas
("JAUNS"/Delta) UN izpildes kolonnas (Izpildīts/Atlikums) parādījās pareizi
KOPĀ vienā rindā. Nekādu kļūdu visā plūsmā.

**Definition of Done — pārbaudīts:**
- ✅ Core: 90/90 testi zaļi (82 + 8 jauni: 6 `computeExecutionRecordValue`/
  `computeExecutionOverview` unit testi, 2 Excel eksporta testi ar/bez
  izpildes akta datiem).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ Manuāli pārbaudīts reāls ģenerēts `.xlsx` fails ar `openpyxl`, gan
  sintētiskam projektam, gan REĀLAM 53-lapu/12876 pozīciju VELVE failam.
- ✅ Reāla faila pilna VO + izpildes aktu plūsma pārbaudīta bez kļūdām, ar
  konkrētiem laika mērījumiem.

#### Izpildes aktu Excel imports (Sesija 21)

Sesijā 19 manuālā ievade bija apzināta izvēle "šai versijai" (skat. augšā).
Sesijā 21 lietotājs apstiprināja Excel importu, un uzreiz sniedza reālu
izpildes akta failu pārbaudei (PSKUS 2021-02 aktu, Forma Nr.2/Nr.3 pēc
LBN 501-17) — kas atklāja, ka reālā izpildes akta faila kolonnu izkārtojums
IR TIKPAT mainīgs pa lapām kā Līguma tāmes failam (Sesija 12): sākotnēji
apstiprinātā "fiksēta pozīcija pēc Forma Nr.2" pieeja izrādījās neizmantojama
— "Izpildīts atskaites periodā" kolonna reālajā failā atrodas kolonnā 33
dažām lapām (DEM, ZD, PAM) un kolonnā 29 citām (KARK, EL, AVK-* u.c.),
atkarībā no tā, vai konkrētās lapas izmaksu sadalījumā ir papildu "laika
norma" apakšgrupa. Pāreja uz galvenes teksta noteikšanu (tā pati pieeja, kas
jau izlaboja šo PAŠU kļūdu klasi tāmes importam) bija tehniski nepieciešama,
nevis izvēles jautājums — īstenota bez atkārtotas jautāšanas, konsekventi ar
jau iedibināto principu "reāla faila pārbaude nosaka pieeju".

**Negaidīts pozitīvs atklājums:** reāla izpildes akta faila darblapu
nosaukumi ("DEM", "ZD", "PAM", "KARK" u.c.) PRECĪZI SAKRĪT ar attiecīgā
Līguma tāmes faila darblapu nosaukumiem (abi faili nāk no tās pašas
projektu vadības sistēmas) — `BoqSection.name`/`.id` jau nāk tieši no
tāmes `sheet.name` (skat. `import.ts`), tāpēc sadaļu sasaiste var būt
VIENKĀRŠA precīza nosaukuma sakritība, nevis izplūdusi (fuzzy) meklēšana,
ko sākotnēji paredzēja lietotāja apstiprinātais dizains. Fails satur arī
"Kods" kolonnu formātā `"T:1-1, R:3"` (T=tāmes numurs, R=Nr.p.k.), bet tā
nav aizpildīta VISĀS lapās (piem. KARK lapā tukša) — tāpēc netiek izmantota
matching pamatā, tikai sadaļas nosaukums + pozīcijas kods (Nr.p.k.).

**Jauni core moduļi** (`packages/core/src/excel/`):
- `headerDetection.ts` — iekšējā skenēšanas cilpa izvilkta kopīgā
  `scanHeaderColumns` funkcijā (lietota gan `detectImportColumns`, gan jaunā
  `detectExecutionActColumns`), lai nedublētu merge-šūnu apstrādes loģiku.
  `detectExecutionActColumns` atrod TIKAI 4 laukus (nrPk, name, unit,
  executedThisPeriod) — apzināti mazāk nekā tāmes importa 7, jo akta lapu
  izmaksu sadalījuma kolonnas (darba alga/materiāli/mehānismi) atšķiras pa
  disciplīnām un prasot tās noraidītu lapas, ko citādi var pareizi nolasīt.
- `executionActImport.ts` — jauns:
  - `parseExecutionActWorkbook`/`parseExecutionActBuffer` — nolasa TIKAI
    "Izpildīts atskaites periodā" (šī perioda daudzums) katrai datu rindai
    (mērvienība = pazīstama, tāpat kā tāmes imports), tikai rindas ar
    `executedQuantity !== 0` (tukšas/nulles rindas nav execution akta
    ieraksts, skat. `models/executionRecord.ts`).
  - `suggestSheetToSectionMapping` — akta lapa -> `BoqSection` PĒC PRECĪZAS
    NOSAUKUMA SAKRITĪBAS, `null`, ja nav atbilstības (UI ļauj izvēlēties
    manuāli vai izlaist).
  - `matchExecutionActToProject` — atrisina akta rindas pret reāliem
    projekta `BoqItem` PĒC KODA (Nr.p.k.) TIKAI mapotajā sadaļā (kods ir
    unikāls tikai sadaļas ietvaros, ne visā projektā) — nesakrītošas rindas
    (nav mapotas sadaļas VAI kods neatrasts) nonāk `unmatchedRows`, NEVIS
    tiek klusi izmestas, lai UI tās var parādīt pirms apstiprināšanas.

**UI** (`ExecutionRecords.tsx`): jauna poga "Importēt izpildes aktu
(Excel)" līdzās "+ Jauns izpildes akts" (abas paslēptas, kamēr rāda kādu no
formām). Klikšķis -> faila izvēle -> dinamisks `import("@tames-modulis/core/excel")`
(tāpat kā visur citur, skat. "Bundle izmērs / code-splitting") ->
`parseExecutionActBuffer` + `suggestSheetToSectionMapping` -> PRIEKŠSKATA
tabula (akta lapa / sadaļas izvēlne / sakrita / nesakrita skaits katrai
lapai) — lietotājs apstiprinātā dizaina "automātiski + priekšskata
apstiprinājums" pieeja. Sadaļas `<select>` maiņa uzreiz PĀRRĒĶINA
sakrišanas (`matchExecutionActToProject` izsaukts no `useMemo`, atkarīgs no
pašreizējās mapping), nav vajadzīgs atkārtots faila nolasījums. Brīdinājuma
baneris (`.baseline-banner`, tas pats stils kā bāzes iesaldēšanai), ja
kopējais nesakritušo pozīciju skaits > 0. "Apstiprināt importu" izveido
VIENU `ExecutionRecord` no visu mapoto lapu `entries` (lietotājs aizpilda
periodu/datumu/apstiprinātāju TAJĀ PAŠĀ priekšskata formā) — nesaglabājas
automātiski IndexedDB, tāpat kā manuālā ievade (jānospiež "Saglabāt").
**Nav atbalstīts `.xls` fails** (tikai `.xlsx`) — `izpildes-akts-validacija`
skill min LibreOffice konversiju priekš `.xls`, bet tas ir servera/CLI
rīks, nevis kaut kas pieejams brauzera vidē; ārpus šī uzdevuma apjoma.

**Manuāli pārbaudīts pret REĀLO PSKUS 2021-02 izpildes akta failu** (54
darblapas, "Forma 3" tips) divos līmeņos:
1. **Core līmenī** (pagaidu vitest skripts, izdzēsts pēc lietošanas):
   fails importēts pret reālo VELVE tāmes failu (47 sadaļas/12876 pozīcijas,
   tas pats fails, kas Sesijā 20) — `parseExecutionActWorkbook` atrada 4
   lapas ar izpildi šajā periodā (ZD: 4, PAM: 7, KARK_O CIKLS: 11, ŪK: 14 =
   36 rindas kopā), `suggestSheetToSectionMapping` pareizi sasaistīja visas
   4 lapas pēc PRECĪZA nosaukuma (bez fuzzy loģikas vajadzības), un
   `matchExecutionActToProject` sasaistīja VISAS 36 rindas pareizi (0
   nesakritušu) — katras rindas kods (Nr.p.k.) atrada precīzi to pašu
   pozīciju tāmē pēc apraksta/mērvienības/vienības izmaksām.
2. **UI līmenī** (Playwright, reāls Chromium, `packages/web` dev serveris;
   projekts sagatavots tieši IndexedDB ar 2 sadaļām — "ZD" ar TIKAI 2 no 4
   reālā akta ZD-lapas kodiem kā pozīcijām, lai apzināti pārbaudītu
   nesakritības ceļu, un nesaistīta sadaļa citam nosaukumam): priekšskata
   tabula pareizi parādīja visu 4 lapu rindu skaitus (4/7/11/14, sakrīt ar
   core līmeņa rezultātu); "ZD" lapa autouzatiecās pareizi uz "ZD" sadaļu
   (`<option selected>`); sakrita=2/nesakrita=2 aprēķināts pareizi šai
   lapai, pārējām (nemapotām) lapām sakrita=0/nesakrita=to pilnais rindu
   skaits; brīdinājuma baneris parādīja pareizu kopējo skaitu (34) un
   tekstu; "Apstiprināt importu" poga rādīja pareizu kopējo sakritības
   skaitu (2) un bija atspējota, kamēr periods nebija aizpildīts; pēc
   apstiprināšanas jaunais akts parādījās vēstures tabulā ar pareizu
   pozīciju skaitu (2) un summu (0.08+7927.4=7927.48, sakrīt tieši ar akta
   faila jēlajām vērtībām pozīcijām "2" un "5"). Konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 98/98 testi zaļi (90 + 8 jauni: `detectExecutionActColumns`,
  `parseExecutionActWorkbook`, `suggestSheetToSectionMapping`,
  `matchExecutionActToProject`).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi — jaunais imports kods ir daļa no jau esošā lazy
  `@tames-modulis/core/excel` chunk'a, galvenais bundle pieaudzis tikai par
  jaunā UI komponenta kodu, ~155KB -> ~183KB).
- ✅ Manuāli pārbaudīts pret REĀLU izpildes akta failu gan core, gan UI
  līmenī (Playwright) — 0 nesakritušu pozīciju reālajā datu apakškopā, kur
  bija pieejama atbilstoša tāme.

#### Pastāvīgs atlikuma pārskats "Tāme" cilnē (Sesija 22)

Līdz Sesijai 22 "Pieejamais atlikums" bija redzams TIKAI pa vienai pozīcijai
`VariationOrders.tsx` VO izveides formā. Lietotājs apstiprināja (jautāts
tieši pirms ieviešanas) pievienot pastāvīgas "Izpildīts"/"Atlikums"
kolonnas TIEŠI ItemsTable komponentē "Tāme" cilnē (nevis atsevišķu
"Atlikumi" cilni/skatu) — konsekventi ar to, kas jau tika pievienots Excel
eksportam Sesijā 20 (skat. augšā "Izpildes akti Excel eksportā"), tāpēc UI
un eksportētais fails tagad rāda to pašu ainu.

**Implementēts** (tikai `packages/web`, `packages/core` nemainīts —
`computeExecutedToDate`/`computeRemainingQuantity` jau bija pieejami no
Sesijas 19): `ItemsTable.tsx` pieņem jaunu opcionālu `executionRecords?:
ExecutionRecord[]` propu. Kad padots un nav tukšs (`showExecution` karogs,
tas pats nosacījums kā `excel/export.ts`'s `state.executionRecords.length >
0`), pievieno divas papildu kolonnas TABULAS BEIGĀS (aiz "Mehānismi", pirms
dzēšanas pogas kolonnas) — "Izpildīts" (`computeExecutedToDate`) un
"Atlikums" (`computeRemainingQuantity`), abas TIKAI LASĀMAS (vienkāršs
teksts, ne `<input>`, jo šīs vērtības vienmēr atvasinātas, nekad tieši
rediģējamas). Rindas ar `atlikums < 0` iegūst `over-executed` klasi —
LIETO TO PAŠU CSS klasi/stilu, ko jau `ExecutionEntryTable.tsx` (selektors
`App.css` paplašināts uz `.execution-entry-table tr.over-executed,
.items-table tr.over-executed`, nevis dublēts stils), lai pārsniegtā
apjoma marķējums izskatītos identiski abās vietās. `ProjectEditor.tsx`
padod `executionRecords={state.executionRecords}` — projektiem BEZ izpildes
aktiem (`[]`) vai pirms bāzes iesaldēšanas kolonnas nemaz nerenderējas,
UX paliek identisks iepriekšējam (backward compatible).

Virtualizācijas spacer-rindu `colSpan` mainīts dinamiski (8 vai 10 atkarībā
no `showExecution`), lai ritjoslas augstums paliktu pareizs abos
gadījumos — tā pati tehnika, kas jau CLAUDE.md dokumentēta "Pozīciju
tabulas virtualizācija".

**Manuāli pārbaudīts (Playwright, reāls Chromium, ieskaitot ekrānuzņēmumu
vizuālai pārbaudei):** divi sintētiski projekti — viens ar izpildes aktu
(3 pozīcijas: daļēji izpildīta, pārsniegta, bez izpildes), otrs bez tā.
Projektā AR izpildi: galvenes rindā parādās "Izpildīts"/"Atlikums" pareizajā
vietā; pozīcijai ar daudzumu 100 un izpildītu 40 rāda Izpildīts=40,
Atlikums=60; pozīcijai ar daudzumu 50 un izpildītu 70 (pārsniegums) rāda
Izpildīts=70, Atlikums=-20, RINDA VIZUĀLI IZCELTA SARKANI (`.over-executed`,
apstiprināts arī ar ekrānuzņēmumu); pozīcijai bez izpildes rāda Izpildīts=0,
Atlikums=10. Projektā BEZ izpildes aktiem: kolonnas VISPĀR NEPARĀDĀS (tabula
identiska iepriekšējam 8-kolonnu izkārtojumam) — apstiprina backward
compatibility. Konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: nemainīts, 98/98 testi joprojām zaļi (izmaiņas bija tikai
  `packages/web`).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs, bundle izmēri
  praktiski nemainīgi (jauns kods tikai render loģikā, nav jaunas
  atkarības).
- ✅ Manuāli pārbaudīts ar Playwright, ieskaitot vizuālu apstiprinājumu
  (ekrānuzņēmums) pārsniegtā apjoma iezīmējumam un backward compatibility
  projektam bez izpildes aktiem.

### Izpildes aktu/VO anulēšana (Sesija 23)

Līdz Sesijai 22 (ieskaitot) izpildes akti un apstiprinātas/noraidītas VO
bija pilnīgi append-only — reiz saglabāts akts vai apstiprināta VO nebija
NEKĀDĀ VEIDĀ koriģējama, ja tajā bija ievadīta kļūda (piem. nepareizi
uzrakstīts skaitlis). Lietotājs apstiprināja (skat. PROGRESS.md Sesijas 23
jautājumu/atbilžu sarakstu), ka šī ir reāla vajadzība, un izvēlējās
**anulēšanu (voiding) + jauna, pareiza ieraksta izveidi**, nevis tiešu
rediģēšanu/dzēšanu — tas saglabā pilnu audit trail (nekas netiek
pārrakstīts vai fiziski dzēsts), maksājot vienu papildu soli (anulēt +
ievadīt no jauna) korekcijas ērtuma vietā. Apjoms: **gan izpildes akti, gan
apstiprinātas VO** (nevis tikai izpildes akti).

**Datu modelis (`schemaVersion` `7 -> 8`):**
- `ExecutionRecord.voidedAt: string | null` / `voidedReason: string | null`
  (`models/executionRecord.ts`) — `null` kamēr akts aktīvs.
- `VariationOrderStatus` papildināts ar `"voided"` (`models/
  variationOrder.ts`), `VariationOrder.voidedReason: string | null`. Statusa
  maiņas datumu (kad anulēts) glabā TAS PATS jau esošais `statusDate` lauks
  (nav vajadzīgs jauns timestamp lauks — konsekventi ar to, ka `statusDate`
  jau apraksta "kad statuss pēdējoreiz mainīts").

**Anulēšana ir statusa/karoga maiņa, NEVIS dzēšana** — akts/VO paliek
attiecīgi `executionRecords`/`variationOrders` sarakstā (redzams vēsturē
UI un Excel eksportā), bet tiek IZSLĒGTS no aprēķina:
- `executionRecords/executionRecords.ts` `computeExecutedToDate` izlaiž
  ierakstus, kam `record.voidedAt !== null` — šis ir VIENĪGAIS punkts, kur
  jāfiltrē (`computeExecutionOverview`/UI `ItemsTable`/Excel eksports visi
  izsauc šo funkciju, tāpēc anulēšana automātiski propagējas visur, bez
  atsevišķas filtrēšanas katrā izsaukuma vietā).
- `variationOrders/deriveCurrentState.ts` `deriveCurrentState`/UI/Excel
  eksports jau filtrē VO pēc `status === "approved"` (esošs kods no
  Sesijas 18) — kad VO statuss mainās uz `"voided"`, tā AUTOMĀTISKI vairs
  neietilpst šajā filtrā, nekas papildu nav jāmaina atvasināšanas loģikā.

**Jaunās core funkcijas** (abas testētas, throw uz nederīgu ievadi):
- `executionRecords/executionRecords.ts` `voidExecutionRecord(records,
  recordId, reason)` — met kļūdu, ja `recordId` nav atrasts VAI akts jau
  anulēts (nevar anulēt divreiz).
- `variationOrders/deriveCurrentState.ts` `voidVariationOrder(orders, voId,
  reason)` — met kļūdu, ja `voId` nav atrasts VAI VO statuss NAV `"approved"`
  (apzināti NEATĻAUTS anulēt `proposed` VO — tā jau ir brīvi rediģējama/
  dzēšama pa izmaiņām, skat. `handleRemoveChange` `VariationOrders.tsx`, un
  NAV atļauts anulēt `rejected`/jau `voided` VO — noraidīta VO jau
  neietekmē neko, anulēšana tai nedotu jēgu).

**Zināms ierobežojums (apzināti nav bloķēts, dokumentēts kā ir):** ja cita
APSTIPRINĀTA VO atsaucas (`change.itemId`/`sectionId`) uz pozīciju/sadaļu,
ko izveidoja TIEŠI ANULĒJAMĀ VO (self-referencing id, skat. "Tāmes izmaiņu
(Variation Order) vadība" augšā), pēc anulēšanas `applyChange`
(`deriveCurrentSections`) šo vēlāko izmaiņu klusi izlaidīs (sadaļa/pozīcija
vairs neeksistēs atvasinātajā stāvoklī) — tas jau ir esošais "nekonsekventi
dati" ceļš (Sesija 18), nevis jauna kļūda šai funkcijai, bet UI parāda par
to brīdinājuma tekstu anulēšanas formā, lai lietotājs par to zinātu PIRMS
apstiprināšanas (konsekventi ar "brīdinājums, nevis bloķēšana" principu,
skat. "Izpildes aktu uzskaite un atlikuma aprēķins" augšā).

**UI** (`VariationOrders.tsx`/`ExecutionRecords.tsx`): abas ir vienāda
"atveras inline forma ar obligātu iemesla lauku" plūsma, konsekventi ar jau
esošajām VO izmaiņu/jauna akta formām (nevis `window.prompt()` — projektā
līdz šim nav lietots, tikai `confirm()` destruktīvām darbībām un state
vadītas formas tekstam):
- `VariationOrders.tsx` — apstiprinātai VO kartei parādās "Anulēt" poga
  (blakus vietai, kur `proposed` VO rāda Apstiprināt/Noraidīt); klikšķis
  atver `.vo-void-form` (iemesla teksta lauks + brīdinājuma teksts par
  atsauču ierobežojumu + Apstiprināt/Atcelt), "Apstiprināt anulēšanu"
  atspējota, kamēr iemesls tukšs. VO karte pēc anulēšanas rāda "Anulēts"
  statusa nozīmi (`vo-status-voided`, pelēks, jauns `STATUS_LABELS`
  ieraksts) un "Anulēšanas iemesls: ..." rindu (tāpat kā `justification`).
- `ExecutionRecords.tsx` — aktu vēstures tabulai jauna "Statuss" kolonna
  ("Aktīvs"/"Anulēts (iemesls)") un pēdējā kolonna ar "Anulēt" pogu (TIKAI
  aktīviem aktiem) -> `.execution-void-form` (tas pats izkārtojums kā VO).

**Excel eksportā** (`excel/export.ts`) minimālas, apzināti ierobežotas
izmaiņas — anulēšanas IEMESLS Excel failā NAV atsevišķas kolonnas (paliek
UI-only, konsekventi ar jau dokumentēto "Excel imports/eksports ir daļēji
zaudējošs" lēmumu), tikai STATUSS ir redzams:
- `VO_STATUS_LABELS` papildināts ar `voided: "Anulēts"` — jau esošā
  "IZMAIŅAS" lapas "Statuss" kolonna (Sesija 18) to rāda automātiski, nav
  vajadzīga papildu kolonna vai izkārtojuma izmaiņa.
- "IZPILDES AKTI" lapas akta reģistram (Sesija 20) pievienota JAUNA
  "Statuss" kolonna (6. kolonna, kas iepriekš piederēja TIKAI pārskata
  tabulai zemāk tajā pašā lapā — tas pats "koplietotas kolonnas, dažādas
  nozīmes pa tabulām" paņēmiens, kas jau dokumentēts
  `EXECUTION_RECORDS_SHEET_COLUMN_WIDTHS` komentārā) — "Aktīvs"/"Anulēts".

**Migrācija (`v7 -> v8`):** trūkstošam `voidedAt`/`voidedReason`
(izpildes akti) vai `voidedReason` (VO) uzstāda `null` — esošs projekts bez
šīs funkcijas lietošanas paliek pilnībā nemainīgs (visi akti/VO
"neanulēti").

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma no nulles,
ieskaitot lapas pārlādi persistences pārbaudei):** izveidots projekts ar
vienu sadaļu/pozīciju (daudzums 10), bāze iesaldēta; VO ar daudzuma
korekciju +5 izveidota un apstiprināta — "Tāme" cilnē daudzums 15;
VO anulēta ar iemeslu — daudzums atgriezās uz 10, statusa žetons "Anulēts",
iemesls redzams kartē; izpildes akts ar izpildītu daudzumu 4 — "Tāme" cilnē
Izpildīts=4/Atlikums=6; akts anulēts ar iemeslu — Izpildīts=0/Atlikums=10
(pareizi izslēgts no aprēķina), vēstures tabulā "Anulēts (iemesls)";
PĒC LAPAS PĀRLĀDES abi anulēšanas stāvokļi (VO statusa žetons, akta
statusa kolonna) saglabājās pareizi (IndexedDB round-trip caur jauno v8
shēmu). Konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 108/108 testi zaļi (98 + 10 jauni: `voidExecutionRecord`/
  `voidVariationOrder` unit testi, `computeExecutedToDate` anulēta akta
  izslēgšana, migrācijas testi v7->v8 defaultiem UN jau-klātesošu vērtību
  saglabāšanai).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi).
- ✅ Manuāli pārbaudīts ar Playwright pilna plūsma (VO anulēšana, izpildes
  akta anulēšana, atkārtoto aprēķinu pareizība, persistence pēc lapas
  pārlādes), ieskaitot to, ka Playwright atkal tika instalēts tikai
  pagaidu pārbaudei (`npm install --no-save playwright-core`, git status
  tīrs pēc noņemšanas) un pēc tam noņemts, tāpat kā Sesijās 20-22.

### Pozīciju numerācija + VO izmaiņu vēsture "Tāme" cilnē (Sesija 24)

Lietotāja pieprasījums pēc PR review smoke testa: gribēja redzēt izmaksu
(ne tikai daudzuma) izmaiņu attiecībā pret bāzi SECĪGI pa VO (kura VO ko
mainīja), un pozīciju tabulā ("Tāme" cilne) atvasinātu N.p.k. numerāciju,
kas atspoguļo pozīcijas izcelsmi/revīziju vēsturi, nevis tikai bāzes brīvo
tekstu. Precīza semantika apstiprināta ar lietotāju (`AskUserQuestion`)
pirms ieviešanas — skat. lēmumus zemāk.

**Jauna core funkcija** `computeItemCodesAndHistory(baseline,
variationOrders)` (`variationOrders/deriveCurrentState.ts`, eksportēta arī
no `src/index.ts`) — atgriež `Map<itemId, ItemDisplayInfo>`
(`{ displayCode, impacts }`). Atkārtoti lieto jau esošo privāto
`applyChange`/`cloneSections` (nedublē daudzuma/izslēgšanas mutācijas
loģiku) — vienā caurgājienā pa padoto VO sarakstu (saucējs izvēlas, kuras
padot, parasti `approved`, tāpat kā `deriveCurrentSections`) uzkrāj katras
pozīcijas izcelsmi un katras VO izolēto ietekmi uz to (daudzums +
`calculateItemCosts` tiešo izmaksu delta, TIEŠI ap `applyChange` izsaukumu
"pirms"/"pēc" salīdzinājumā).

**`displayCode` noteikšana pēc pozīcijas izcelsmes:**
- Bāzes pozīcija, ko neviena VO nav mainījusi: `= item.code` (nemainīts).
- Bāzes pozīcija, ko mainījušas N VO (kopā, neatkarīgi no konkrētās VO
  numura): `item.code` + burta piedēklis — burts ir ŠĪS POZĪCIJAS PAŠAS
  revīzijas KĀRTA (1. korekcija = "a", 2. = "b", ...), NEVIS konkrētās VO
  numurs (apstiprināts ar lietotāju — ja VO-1 un VO-3 maina to pašu
  pozīciju, bet VO-2 to nemaina, pozīcija kļūst "1a" pēc VO-1, tad "1b"
  pēc VO-3, VO-2 burtu "izlaižot", jo tas nekad nemainīja ŠO pozīciju).
- Pavisam jauna pozīcija, ko VO pievieno ESOŠĀ (bāzes) sadaļā: jauns
  unikāls numurs (turpina sadaļas bāzes numerāciju, piem. "21") + VO
  atzīme iekavās, piem. "21 (VO-2)" — lietotāja manuāli ievadītais "Kods"
  lauks šai gadījumā TIEK IGNORĒTS displayCode aprēķinā (paliek glabāts
  `BoqItem.code`, bet nerādās "Nr." kolonnā). Ja šo pozīciju vēlāka VO
  atkal maina, tā papildus dabū revīzijas burtu (piem. "21a (VO-2)").
- Jauna pozīcija JAUNĀ (VO izveidotā) sadaļā: `= newItem.code` tieši, kā
  lietotājs to ievadījis — nav auto-numura/tag, jo sadaļa pati jau "sākas
  no 1" (skat. "Jaunas sadaļas caur VO" augšā).

**UI** (`ItemsTable.tsx`, jaunas opcionālas propas `itemDisplay`/
`voColumns`): "Nr." šūna kad `itemDisplay` padots rāda atvasināto
`displayCode` (tajā pašā disabled `<input>`, nemaina "inputs disabled, not
hidden" konvenciju). Katrai `voColumns` VO pievienojas divas kolonnas AIZ
"Mehānismi", PIRMS "Izpildīts"/"Atlikums" — "VO-X ΔDaudz." un "VO-X ΔEUR",
rādot TIKAI šīs VO izraisīto DELTU (apstiprināts ar lietotāju — ne
kumulatīvu rezultējošo vērtību), tukšs "-" ja VO šo pozīciju nemainīja,
"JAUNS: N" jaunai pozīcijai (tas pats marķieris, ko jau lieto Excel
eksporta "Bāzes daudzums" kolonna, skat. "Tāmes izmaiņu (Variation Order)
vadība" augšā). `ProjectEditor.tsx` aprēķina `itemDisplay` TIKAI pēc bāzes
iesaldēšanas (tāpat kā visur citur VO jēdziens bez bāzes nav definēts), un
per-sadaļa `voColumns` filtrējot `approvedVariationOrders` pēc tā, vai
kāda šīs sadaļas pozīcija satur impact ar attiecīgo VO — secība garantēta
no autoritatīvā VO masīva, ne no impact apvienošanas kārtas.

**Jauna `.code-input` CSS klase** (`min-width: 6rem`) — bez tās garākie
atvasinātie kodi (piem. "21 (VO-2)") vizuāli apgriezās šaurajā "Nr."
kolonnā (atklāts manuālajā Playwright pārbaudē ar ekrānuzņēmumu, izlabots
pirms uzskatīt par pabeigtu — skat. "Kolonnu platumi" augšā par to pašu
kļūdu klasi Excel eksportā).

**Apzināti ĀRPUS šī uzdevuma apjoma** (varētu būt nākamais kandidāts,
JĀPAJAUTĀ lietotājam, ne jāpieņem, skat. PROGRESS.md Sesija 24): Excel
eksports NEMAINĀS (paliek sava "Bāzes daudzums"/"Delta" shēma, Sesija 18);
`VariationOrders.tsx` VO kartes izmaiņu tabula (kas jau rāda "daudzums +5"
u.tml.) nemainās — jaunā numerācija/kolonnas ir TIKAI `ItemsTable.tsx`.

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma no nulles,
ieskaitot lapas pārlādi persistences pārbaudei un ekrānuzņēmumu vizuālai
pārbaudei):** projekts ar 1 bāzes pozīciju (daudzums 10, vienības izmaksa
6€) — VO-1 (+5, apstiprināta), VO-2 (pievieno jaunu pozīciju TAJĀ PAŠĀ
sadaļā, apstiprināta), VO-3 (+3 TAI PAŠAI bāzes pozīcijai, apstiprināta).
Bāzes pozīcija -> "1.1b" (VO-1 kolonnā +5/30.00€, VO-2 kolonnā "-"/"-",
VO-3 kolonnā +3/18.00€); jaunā pozīcija -> "2 (VO-2)" (VO-2 kolonnā
"JAUNS: 3"/"9.00 €", VO-1/VO-3 kolonnās "-", manuāli ievadītais kods
pareizi ignorēts). PĒC LAPAS PĀRLĀDES abi displayCode saglabājās
identiski. REGRESIJA pārbaudīta ar projektu BEZ jebkādas VO — gan pirms,
gan pēc bāzes iesaldēšanas galvene identiska oriģinālajai (nav VO
kolonnu), "Nr." šūna rāda/rediģē to pašu `item.code` kā iepriekš. Konsolē
nav kļūdu nevienā solī.

**Definition of Done — pārbaudīts:**
- ✅ Core: 115/115 testi zaļi (108 + 7 jauni `computeItemCodesAndHistory`
  testi).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi).
- ✅ Manuāli pārbaudīts ar Playwright — pilna numerācijas/vēstures plūsma,
  persistence pēc lapas pārlādes, regresija projektam bez VO, konsolē nav
  kļūdu, tāpat instalēts/noņemts tikai pagaidu pārbaudei kā iepriekšējās
  sesijās.

### Pasūtītāja rezerve (Sesija 26)

Lietotāja ideja: VO ceļā izslēgto/samazināto pozīciju ietaupītā vērtība
šobrīd vienkārši pazūd (samazina "Tiešās izmaksas" un neko neatstāj aiz
sevis) — vajadzīgs mehānisms, kas šo vērtību uzkrāj atsevišķi, lai vēlāk,
kad rodas jauni papildu darbi, to varētu izmantot segšanai (FIDIC
"Provisional Sum" stila jēdziens, bet atvasināts no izslēgumiem, nevis
iepriekš noteikts budžets). Lēmumi apstiprināti ar lietotāju
(`AskUserQuestion`, 4 jautājumi) PIRMS ieviešanas:

- **Avots:** ABAS izmaiņas — pilna izslēgšana (`excluded`) UN daudzuma
  samazinājums (`quantityDelta < 0`) — papildina rezervi, ne tikai pilna
  izslēgšana.
- **Ietekme uz summu:** TIKAI informatīvs pārskats — tāmes "Pavisam"/"KOPĀ
  AR PVN" paliek NEMAINĪTA (jau pareizi atspoguļo visu apstiprināto VO
  derivāciju), rezerve ir atsevišķs reģistrs blakus.
- **Izmantošana:** MANUĀLA/skaidra darbība — lietotājs katrai VO ar
  pozitīvu ietekmi var atzīmēt konkrētu EUR summu "segt no rezerves",
  NEVIS automātiska.
- **UI:** integrēts esošajā "Izmaiņas (VO)" cilnē, nevis jauna cilne.

**Datu modelis (`schemaVersion` `8 -> 9`):** `VariationOrder.
reserveDrawdown: number` (noklusējums 0) — VIENĪGAIS jaunais, tieši
ievadāmais lauks, un TIKAI izmantošanas pusei. Pati UZKRĀŠANA paliek
pilnībā ATVASINĀTA (nav manuāli jāatzīmē katrs izslēgums), konsekventi ar
visu pārējo VO mehānismu ("pašreizējais" stāvoklis vienmēr atvasināts,
nekad glabāts). Rediģējams TIKAI, kamēr `status === "proposed"` — tāpat kā
pārējie VO lauki, kļūdu pēc apstiprināšanas labo ar jau esošo anulēšanas
mehānismu (Sesija 23), nevis tiešu rediģēšanu.

**Aprēķins** (`variationOrders/deriveCurrentState.ts`, jauna funkcija
`computeReserveBalance(baseline, variationOrders)`): iet secīgi cauri
APSTIPRINĀTAJĀM (un neanulētajām) VO — tas pats filtrs kā
`deriveCurrentState` — katrai atkārtoti izmantojot jau esošo
`computeVariationOrderDirectTotalImpact`:
- Ietekme < 0 (izslēgšana/samazinājums) → summa AUTOMĀTISKI papildina
  rezervi (`contribution`).
- Ietekme > 0 (papildu darbi) → `vo.reserveDrawdown` (ja iestatīts)
  SAMAZINA pieejamo atlikumu (`drawdown`) — VO ar ietaupījumu
  `reserveDrawdown` lauks tiek IGNORĒTS, pat ja kļūdaini iestatīts (nav
  jēgas "izmantot rezervi" VO, kas pati to papildina).

Atgriež reģistru (`entries[]`, viena rinda katrai apstiprinātajai VO ar
`directTotalImpact`/`contribution`/`drawdown`/kumulatīvo `balanceAfter`) +
kopsavilkumu (`totalAccumulated`/`totalDrawn`/`available`). `variationOrders`
jāpadod PILNS saraksts (ne tikai apstiprinātās) — tāpat kā
`computeVariationOrderDirectTotalImpact`, katrai VO vajadzīgs tās secības
konteksts pilnajā masīvā.

**Apzināti NAV klampēts** (dizaina izvēle, konsekventi ar citiem
neklampētiem laukiem šajā projektā, piem. `quantityDelta`/
`executedQuantity`): `drawdown` var pārsniegt gan pieejamo atlikumu, gan
pašas VO ietekmi — funkcija to neierobežo, UI parāda BRĪDINĀJUMU (nevis
bloķē), tas pats "brīdinājums, ne bloķēšana" princips kā izpildes
pārsniegumam (Sesija 19).

**UI** (`VariationOrders.tsx`): katrai `proposed` VO ar POZITĪVU ietekmi
parādās "Segt no Pasūtītāja rezerves (€)" ievades lauks ar redzamu
"Pieejamais atlikums šobrīd" (= `computeReserveBalance` rezultāts NO
VISĀM APSTIPRINĀTAJĀM VO — tas pats skaitlis, kas jārāda kā konteksts vēl
"proposed" VO, jo tā vēl neietekmē šo aprēķinu); DIVI neatkarīgi
brīdinājumi (pārsniedz atlikumu / pārsniedz pašas VO ietekmi), abi var
rādīties vienlaicīgi. Apstiprinātai VO ar `reserveDrawdown > 0` rāda
lasāmu "Segts no Pasūtītāja rezerves: X €" rindu. Zem VO karšu saraksta
jauna "Pasūtītāja rezerve" sadaļa — kopsavilkuma rinda (Uzkrāts/Izmantots/
Atlikums) + reģistra tabula (viena rinda katrai apstiprinātai VO).

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma, projekts
sagatavots tieši IndexedDB, ieskaitot lapas pārlādi persistences
pārbaudei):** bāzes pozīcija (daudzums 10, vienības izmaksa 6€, tiešā
summa 60€) — VO-1 izslēdz to pilnībā (apstiprināta) → rezerve
"Uzkrāts: 60.00 € · Izmantots: 0.00 € · Atlikums: 60.00 €"; VO-2 pievieno
jaunu pozīciju (4 gab × 5€ = 20€ ietekme, vēl "proposed") → parādās
"Segt no Pasūtītāja rezerves" lauks ar "Pieejamais atlikums šobrīd: 60.00 €";
iestatīts `reserveDrawdown = 20`, apstiprināts → rezerve
"Uzkrāts: 60.00 € · Izmantots: 20.00 € · Atlikums: 40.00 €", reģistra
tabulā abas rindas ar pareiziem skaitļiem. PĒC LAPAS PĀRLĀDES (pilns
IndexedDB round-trip caur jauno v9 shēmu) rezerves skaitļi saglabājās
identiski. Brīdinājumu UI pārbaudīts atsevišķi: VO ar ietekmi 4€ un
iestatītu `reserveDrawdown = 100` (pieejamais atlikums 0€) parādīja ABUS
brīdinājumus vienlaicīgi ar pareiziem skaitļiem. Konsolē nav kļūdu nevienā
solī.

**Definition of Done — UI daļa pārbaudīta:**
- ✅ Core: 138/138 testi zaļi (130 + 8 jauni: 6 `computeReserveBalance`
  testi, 2 migrācijas testi v8->v9).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi).
- ✅ Manuāli pārbaudīts ar Playwright — pilna uzkrāšanas/izmantošanas
  plūsma, persistence pēc lapas pārlādes, brīdinājumu UI, konsolē nav
  kļūdu.
- ✅ Migrācija (v8 bez `reserveDrawdown` -> v9 ar noklusējumu 0; v8 ar jau
  iestatītu vērtību -> saglabāta) testēta.

#### Rezerves reģistrs Excel eksportā, ar opt-in checkbox (turpinājums)

Lietotājs pieprasīja pievienot rezerves reģistru Excel eksportam TŪLĪT pēc
UI daļas pabeigšanas, ar skaidru nosacījumu: **opt-in checkbox sistēmā** —
eksportēts TIKAI, ja atzīmēts. Cēlonis: Pasūtītāja rezerve ir iekšēja
darbuzņēmēja uzskaite, ne visos gadījumos vēlama koplietotā/pasūtītājam
sūtāmā Excel failā, tāpēc pēc noklusējuma IZSLĒGTS, nevis automātisks (kā
VO/izpildes aktu sadaļas, kas parādās eksportā, tiklīdz tām ir dati).

**Implementēts:**
- `excel/export.ts` — jauns `ExportOptions` tips
  (`{ includeReserveRegister?: boolean }`, noklusējums `false`),
  `exportBoqToWorkbook(state, options?)`/`exportBoqToBuffer(state, options?)`
  pieņem to kā otro (opcionālu) parametru. Kad `true` UN projektam ir
  vismaz viena VO (esošais "IZMAIŅAS" lapas nosacījums), jauna
  `writeReserveRegisterTable` funkcija pievieno TREŠO loģisko tabulu
  ("Pasūtītāja rezerve" — kopsavilkuma rinda + reģistrs) TAJĀ PAŠĀ
  "IZMAIŅAS" lapā, zem jau esošās "Mainītās pozīcijas" tabulas — tas pats
  "vairākas tabulas, koplietotas kolonnas" paņēmiens, ko lapa jau lieto
  VO reģistram/diff tabulai (skat. augšā "Tāmes izmaiņu (Variation Order)
  vadība"). Bez opcijas eksports paliek PILNĪBĀ nemainīgs (backward
  compatible, tāpat kā katra iepriekšējā VO/izpildes aktu eksporta izmaiņa).
- `packages/web/src/components/ProjectEditor.tsx` — jauna checkbox
  "Iekļaut Pasūtītāja rezervi eksportā" blakus "Eksportēt Excel" pogai,
  redzama TIKAI, kad `baselineLocked && state.variationOrders.length > 0`
  (rezerve bez VO nav definēta). **Apzināti EFEMĒRS (nesaglabāts) stāvoklis**
  (`useState`, ne `BoqState` lauks) — tā ir eksporta darbības opcija (kā
  drukas dialoga checkbox), ne pastāvīga projekta īpašība, tāpēc katrā
  eksportā jāizvēlas no jauna, nav shēmas versijas maiņas.

**Manuāli pārbaudīts (Playwright, reāls Chromium, ieskaitot lejupielādētā
`.xlsx` faila satura pārbaudi ar `openpyxl`):** projekts ar VO-1 (izslēgšana,
-60€ ietekme) un VO-2 (papildu darbs, +20€ ietekme, `reserveDrawdown=20`).
Eksports BEZ checkbox atzīmēšanas — lejupielādētajā failā "IZMAIŅAS" lapā
NAV "Pasūtītāja rezerve" teksta nevienā šūnā (pareizi). Checkbox atzīmēts,
eksportēts atkārtoti — lejupielādētajā failā "Pasūtītāja rezerve" tabula
klāt ar PRECĪZIEM skaitļiem ("Uzkrāts: 60.00 € · Izmantots: 20.00 € ·
Atlikums: 40.00 €", VO-1 rinda: -60/60/0/60, VO-2 rinda: 20/0/20/40) — sakrīt
precīzi ar tiem pašiem skaitļiem, kas jau pārbaudīti UI kopsavilkumā (skat.
augšā). Konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 141/141 testi zaļi (138 + 3 jauni: opt-in noklusējuma tests,
  tests ar reāliem skaitļiem `includeReserveRegister: true`,
  `exportBoqToBuffer` opciju forward tests).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs.
- ✅ Manuāli pārbaudīts ar Playwright, ieskaitot lejupielādētā `.xlsx` faila
  satura pārbaudi ar `openpyxl` — checkbox pareizi kontrolē, vai rezerves
  tabula parādās eksportā, skaitļi precīzi sakrīt ar UI.

### Excel eksports: pozīciju numerācija (displayCode) + VO delta kolonnas (Sesija 27)

Sesijas 24 (skat. augšā "Pozīciju numerācija + VO izmaiņu vēsture ('Tāme'
cilnē")) beigās apzināti ĀRPUS apjoma atstāts kandidāts — Excel eksports
sadaļu lapās joprojām rādīja bāzes `item.code`, nevis `ItemsTable.tsx` "Tāme"
cilnē jau redzamo atvasināto `displayCode`/VO delta ainu. Lietotājs
apstiprināja (`AskUserQuestion`) pilnu apjomu — GAN numerāciju, GAN
VO-specifiskās delta kolonnas (nevis tikai numerāciju) — pirms ieviešanas.

**Implementēts** (`excel/export.ts`, `packages/web` netika skarts):
`writeSectionSheet` dabū divus jaunus parametrus — `itemDisplay: Map<string,
ItemDisplayInfo> | null` un `voColumns: { voId: string; voNumber: string }[]`
— TIEŠI TĀ PATI aprēķina loģika, ko `ProjectEditor.tsx` jau lieto
`ItemsTable.tsx` propām: `exportBoqToWorkbook` aprēķina `itemDisplay` VIENU
REIZI visam projektam ar `computeItemCodesAndHistory(state.sections,
approvedVariationOrders)` (tikai kad `hasBaseline`), un katrai sadaļai
filtrē `sectionVoColumns` pēc tā, vai kāda šīs sadaļas pozīcija satur impact
ar attiecīgo VO — nav jaunas core funkcijas, tikai tā paša atvasinājuma
otrs patērētājs.

- **"Nr.p.k." kolonna:** `itemDisplay?.get(item.id)?.displayCode ??
  item.code` — pirms bāzes iesaldēšanas (`itemDisplay === null`) uzvedība
  NEMAINĀS (rāda bāzes kodu, kā vienmēr).
- **VO delta kolonnas:** pievienotas AIZ esošajām VARIATION_COLUMNS/
  EXECUTION_COLUMNS grupām (nevis to vietā vai starp tām) — pozīcija
  DINAMISKA (atkarīga no tā, vai baseline/izpilde ir/nav, un cik VO
  relevanti tieši šai sadaļai), tāpēc platumi tiek pielietoti per-sadaļa
  ciklā, nevis statiskā `Record<number, number>` kā `VARIATION_COLUMN_WIDTHS`/
  `EXECUTION_COLUMN_WIDTHS`. Katra VO grupa: "VO-X ΔDaudz." (skaitlis ar
  `QUANTITY_FORMAT`, vai teksts "JAUNS: N" jaunai pozīcijai, vai teksts "-"
  ja VO šo pozīciju nemainīja) + "VO-X ΔEUR" (skaitlis ar `MONEY_FORMAT`, vai
  "-"). **Apzināta atšķirība no `ItemsTable.tsx`:** UI rāda tekstuālu "+5"
  (ar piespiedu "+" priekšā), Excel puses ΔDaudz./ΔEUR šūnas paliek PARASTI
  SKAITĻI (bez piespiedu "+"), konsekventi ar to, kā šis fails JAU rakstīja
  `VARIATION_COLUMNS.quantityDelta`/diff tabulas EUR deltu (skat. augšā) —
  ļauj Excel pusē summēt/filtrēt, un neievieš jaunu formatējuma konvenciju
  tikai šai vienai kolonnu grupai.
- **`COLUMN_WIDTHS[TAME_COLUMNS.nrPk]` paplašināts no 7 uz 12** rakstzīmēm —
  tā pati kļūdu klase, ko Sesija 24 jau izlaboja UI pusē (`.code-input`
  min-width) — bez tā garāki atvasinātie kodi (piem. "21a (VO-2)") Excel
  šaurajā kolonnā vizuāli apgrieztos. Šis platums tiek pielietots VIENMĒR
  (arī projektiem bez VO) — tikai kosmētiska, ne-lūstoša izmaiņa.

**Testi:** `test/excel.test.ts` — 2 jauni (displayCode + VO delta kolonnu
vērtības sadaļā, kuru VO ietekmēja, tostarp revīzijas burta "izlaišana"
neietekmētai VO, kā arī neietekmētas sadaļas regresija; "JAUNS: N" marķieris
jaunai VO pievienotai pozīcijai). 1 esošs tests pārrakstīts — "omits
Izpildīts/Atlikums..." iepriekš pārbaudīja fiksētu kolonnas nobīdi, kas TAGAD
likumīgi aizņemta ar jaunu VO kolonnu tam pašam testa projektam (tam ir
apstiprināta VO); pārrakstīts, lai pārbaudītu ar galvenes TEKSTU
("Izpildīts"/"Atlikums" nav rindā 11), nevis pozīciju — pareizais fokuss šim
testam vienmēr bija izpildes kolonnu neesamība, nevis konkrēta kolonnas
nobīde. Kopā **143/143 core testi zaļi** (141 + 2 jauni).

**Manuāli pārbaudīts (Solis 1 — tiešs core izsaukums):** pagaidu skripts ar
`tsx`, tieši izsaucot `exportBoqToBuffer` un pārlasot rezultātu ar
`exceljs`, izdzēsts pēc lietošanas: projekts ar 2 bāzes pozīcijām vienā
sadaļā — VO-1 (+5 pozīcijai "1"), VO-2 (pievieno jaunu pozīciju), VO-3 (+2
pozīcijai "1"). Pozīcija "1" -> "1b" ("VO-2 burts izlaists", jo tā pozīciju
nemainīja — tieši Sesijas 24 dokumentētā semantika), VO-1 kolonnā 5/30€,
VO-2 kolonnā "-"/"-", VO-3 kolonnā 2/12€. Nemainītā pozīcija "2" -> paliek
"2", visās VO kolonnās "-". Jaunā pozīcija -> "3 (VO-2)" (manuāli ievadītais
kods ignorēts), VO-2 kolonnā "JAUNS: 3"/9€, pārējās "-".

**Manuāli pārbaudīts (Solis 2 — reāls pārlūks, Playwright, pēc lietotāja
pieprasījuma "pārbaudi arī pārlūkā, lai redzētu eksportēto failu
vizuāli"):** `playwright-core` instalēts pagaidu pārbaudei (`npm install
--no-save`, noņemts pēc lietošanas), `npm run dev:web` palaists fonā, tas
pats scenārijs (VO-1/VO-2/VO-3) sagatavots TIEŠI IndexedDB (tāpat kā
Sesijas 22/26 konvencija), lapa pārlādēta, projekts atvērts caur reālu UI
klikšķi. "Tāme" cilnē (noklusējuma aktīvā pēc bāzes iesaldēšanas)
ekrānuzņēmums apstiprināja identisku ainu tam, ko UI jau rādīja kopš
Sesijas 24 ("1b", "2", "3 (VO-2)", VO-1/VO-2/VO-3 ΔDaudz./ΔEUR kolonnas).
Pēc tam reāls klikšķis uz "Eksportēt Excel" (nevis tiešs funkcijas
izsaukums) -> lejupielādētais `.xlsx` fails pārlasīts ar `exceljs` -
IDENTISKAS vērtības Solim 1 (tas pats "1b"/"2"/"3 (VO-2)" un VO-1/VO-2/VO-3
kolonnu skaitļi). Konsolē NAV kļūdu (nedz `console.error`, nedz
`pageerror`) nevienā solī. Pagaidu skripts un `playwright-core` noņemti pēc
lietošanas, `git status` tīrs.

**Definition of Done — pārbaudīts:**
- ✅ Core: 143/143 testi zaļi (2 jauni šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi — ~192KB galvenais/~958KB excel chunk).
- ✅ Manuāli pārbaudīts ar reālu eksportētu `.xlsx` failu, GAN tiešā core
  izsaukumā, GAN REĀLĀ pārlūkā (Playwright, klikšķis uz "Eksportēt Excel")
  — displayCode/VO delta kolonnas precīzi sakrīt ar jau apstiprināto
  `computeItemCodesAndHistory` semantiku abos ceļos, konsolē nav kļūdu.

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

### Lietotāja lokālā vide (manuāla pārbaude pārlūkā)

Lietotājam ir lokāla repo kopija Windows datorā:
**`%USERPROFILE%\Documents\RihardsAbols`**. Lietotājs PATS palaiž
`npm run dev:web` un atver `http://localhost:5173/` savā pārlūkā, lai
manuāli izmēģinātu izmaiņas — **nav jautāt/jāatgādina šī informācija katru
reizi**, lietotājs to zina un pats pieprasīs manuālu pārbaudi, kad būs
gatavs. Ja lietotājs pajautā "vai varu pats izmēģināt pārlūkā" vai līdzīgi,
atbilde vienmēr ir: jā, `cd %USERPROFILE%\Documents\RihardsAbols\tames-modulis`,
`npm run dev:web`, atvērt `http://localhost:5173/`.

Šajā (mākoņa/CI) sesijas vidē manuālā pārbaude pārlūkā notiek ar
Playwright + jau instalēto Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
`--headless=new` karogs, skat. iepriekšējo sesiju piemērus PROGRESS.md) —
instalē `playwright-core` pagaidām (`npm install --no-save playwright-core`
attiecīgajā pakotnē), izmanto, un pēc pārbaudes noņem, tāpat kā katrā
iepriekšējā sesijā.

## Konvencijas

- Visi `packages/core` publiski eksportētie tipi/funkcijas iet caur
  `src/index.ts` (universāls) vai `src/node.ts` (+ Node-only adapteri).
  Nepievieno neko `node:*` importējošu `src/index.ts` — skat. augšā "Node
  vs. universāls kods".
- UI komponentes (`packages/web`) glabā visu BOQ stāvokli vienā
  `useState<BoqState>` un pārrēķina `summarizeBoq` katrā renderā —
  vienkāršāk nekā atsevišķa memoizācija/atvasināts stāvoklis šajā apjomā.
