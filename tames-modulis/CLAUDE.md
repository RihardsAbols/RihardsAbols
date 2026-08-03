# Tāmju/BOQ modulis

Npm workspace ar divām pakotnēm:
- `packages/core` — TypeScript bibliotēka: BOQ datu modelis, aprēķini,
  glabāšana/versionēšana, Excel imports/eksports, projektu CRUD. Vidi
  nezinošs (universāls) kods, kas strādā gan Node, gan brauzerī.
- `packages/web` — React + Vite brauzera UI, kas patērē `@tames-modulis/core`
  un glabā datus IndexedDB.

## Struktūra (`packages/core`)

- `src/models/boq.ts` — datu modelis (`BoqState`, `BoqSection`, `BoqItem`).
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
  Pašreiz `v1 -> v2 -> v3 -> v4`, `migrateToCurrent` atbalsta pakāpenisku
  migrāciju pievienošanu arī turpmāk.
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
    darblapai katrai sadaļai ar pozīcijām. Šūnas raksta ar **formulām**
    (nevis tikai gala vērtībām), pievienojot arī kešotu `result`, lai fails
    rāda pareizas vērtības uzreiz, pat ja neviens neatver to Excel/LibreOffice.
    `exportBoqToBuffer` atgriež `ArrayBuffer` (nevis Node `Buffer`), lai
    strādātu arī brauzerī.
  - `import.ts` — `importBoqFromWorkbook`/`importBoqFromBuffer`: kolonnas
    nosaka `detectImportColumns` (galvenes teksts), datu rindas atpazīst pēc
    mērvienības kolonnas (nevis rindas numura). Atvasinātās kolonnas
    (Vienības kopā, Kopā *) netiek lasītas atpakaļ — tās vienmēr pārrēķina
    `calculations/boq.ts`, lai nebūtu divu patiesības avotu.
- `test/` — vitest testi (glabāšanas round-trip, migrāciju stubs, aprēķini,
  Excel eksports/imports round-trip un imports no "svešas" darblapas,
  `ProjectService` CRUD pret in-memory `StorageAdapter`).

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
  (atlaide/virsizdevumi/peļņa/PVN) rediģēšana, dzīvs kopsavilkums (`summarizeBoq`
  pārrēķināts katrā render), "Saglabāt" (IndexedDB), "Eksportēt Excel"
  (lejupielādē `.xlsx`) un "Importēt Excel (pārrakstīt sadaļas)" (imports
  esošā, jau atvērtā projektā — skat. "Imports esošā projektā" zemāk).
  Eksporta/importa pogas importē `exportBoqToBuffer`/`importBoqFromBuffer`
  ar dinamisku `import("@tames-modulis/core/excel")` klikšķa brīdī, nevis
  statiski augšā failā — skat. "Bundle izmērs / code-splitting" zemāk.
- `src/components/ItemsTable.tsx` — sadaļas pozīciju tabula ar rindu
  virtualizāciju (skat. "Pozīciju tabulas virtualizācija" zemāk). Lieto
  `ProjectEditor.tsx` katrai sadaļai.
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
