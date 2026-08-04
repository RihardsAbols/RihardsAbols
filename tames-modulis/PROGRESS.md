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

## Sesija 8: Projektu saraksts / CRUD virs StorageAdapter — ✅ pabeigts

**Uzdevums:** API līmenis projektu izveidei/uzskaitei/labošanai/dzēšanai,
nevis tikai viena zināma projekta save/load.

**Lēmums:** `StorageAdapter` interfeisam pievienotas divas jaunas metodes
(`list()`, `delete()`) blakus esošajām `save()`/`load()` — tās ir
fundamentāli glabāšanas primitīvi, ko atbalstīs arī nākotnes IndexedDB
adapteris. Virs tā izveidots plāns `ProjectService` slānis ar CRUD
funkcijām, kas strādā pret jebkuru `StorageAdapter`, nevis tikai
`FileSystemStorageAdapter` — tas ļauj testēt CRUD loģiku ar vienkāršu
in-memory adapteri, neatkarīgi no faila sistēmas.

**Implementēts:**
- `src/storage/StorageAdapter.ts` — pievienots `ProjectListEntry` tips
  (`projectId`, `projectName`, `updatedAt`) un `list()`/`delete()` metodes.
  `delete()` dokumentēts kā idempotents (dzēšot neeksistējošu projektu,
  kļūda netiek mesta).
- `src/storage/adapters/FileSystemStorageAdapter.ts` — `list()` uzskaita
  apakšdirektorijas zem `data/projects/`, ielādē katru (ar migrāciju), lai
  iegūtu `projectName`/`updatedAt`; `delete()` dzēš visu projekta
  direktoriju (`rm(..., { recursive: true, force: true })`).
- `src/projects/ProjectService.ts` — `createProject` (ģenerē `projectId`
  ar `node:crypto` `randomUUID`, izveido tukšu projektu, saglabā),
  `listProjects`, `getProject`, `updateProject` (ielādē, pielieto
  `updater(state) => state` funkciju, pats atjaunina `updatedAt`, saglabā;
  met `ProjectNotFoundError`, ja projekta nav), `deleteProject`.
- `test/storage.test.ts` — papildināts ar 5 testiem `list()`/`delete()`
  adapterim (tukšs saraksts, saraksts ar vairākiem projektiem, dzēšana,
  idempotenta dzēšana neeksistējošam projektam).
- `test/ProjectService.test.ts` — jauns, 7 testi pret `InMemoryStorageAdapter`
  test dubultnieku: izveide ar unikālu ID, saraksts, `getProject` uz
  neeksistējošu ID, `updateProject` atjaunina saturu un `updatedAt` (bet ne
  `createdAt`) un met kļūdu neeksistējošam projektam, `deleteProject`.

**Definition of Done — pārbaudīts:**
- ✅ Visi testi zaļi: `npm test` — 31/31 (12 storage + 7 calculations +
  5 excel + 7 ProjectService).
- ✅ Typecheck tīrs (`npx tsc --noEmit`).

## Sesija 9: Brauzera UI un IndexedDB adapteris — ✅ pabeigts

**Uzdevums:** brauzera UI un IndexedDB adapteris (apstiprināts ar lietotāju
kā pilns CRUD UI, ar React + Vite pēc manas rekomendācijas).

**Lēmums:** pārstrukturēts uz npm workspace ar divām pakotnēm —
`packages/core` (esošā bibliotēka, pārvietota nemainot loģiku) un
`packages/web` (jauns React + Vite UI). Tas bija nepieciešams, jo
`packages/web` tieši importē `@tames-modulis/core`, un vairākas esošās
vietas kodā izmantoja Node-only API (`node:fs`, `node:crypto`), kas
salauztu brauzera build. Risinājums:
- `FileSystemStorageAdapter` izņemts no universālā `src/index.ts` barela,
  pieejams tikai caur jaunu `@tames-modulis/core/node` (`src/node.ts`) ieejas
  punktu.
- `randomUUID()` no `node:crypto` (`ProjectService.ts`, `excel/import.ts`)
  aizstāts ar globālo `crypto.randomUUID()` (Web Crypto API, pieejams arī
  Node 19+) — vienāds kods strādā abur.
- `exportBoqToBuffer`/`importBoqFromBuffer` pārtaisīti no Node `Buffer` uz
  `ArrayBuffer`, jo `Buffer` globāls neeksistē brauzerī bez polyfill.

**Implementēts:**
- `packages/web/src/storage/IndexedDbStorageAdapter.ts` — `StorageAdapter`
  ar IndexedDB (viens object store `projects`, keyPath `projectId`,
  vērtība = pilns `BoqState`; `load`/`list` izlaiž datus caur
  `migrateToCurrent`, tāpat kā failu adapteris).
- `packages/web/src/components/ProjectList.tsx` — projektu saraksts,
  izveides forma, dzēšana ar apstiprinājumu.
- `packages/web/src/components/ProjectEditor.tsx` — pilna rediģēšana:
  projekta nosaukums, virsizdevumu/peļņas/PVN likmes, sadaļu un pozīciju
  pievienošana/rediģēšana/dzēšana, dzīvs kopsavilkums (`summarizeBoq`
  pārrēķināts katrā renderā), "Saglabāt" (IndexedDB) un "Eksportēt Excel"
  poga (lejupielādē `.xlsx` caur `exportBoqToBuffer` + `Blob`).
- `packages/web/src/App.tsx` — savieno sarakstu un redaktoru.

**Manuāla pārbaude (Playwright + reāls Chromium, ne tikai unit testi):**
pilns lietotāja ceļš pārbaudīts galīgajā (production) un dev buildā:
projekta izveide -> sadaļas/pozīcijas pievienošana -> dzīvais kopsavilkums
pareizs (1000€ tiešās, 120€ virsizdevumi, 50€ peļņa, 1170€ pavisam,
245.70€ PVN, 1415.70€ kopā — sakrīt ar roku rēķinātu) -> Saglabāt ->
lapas pārlāde -> dati saglabājušies IndexedDB -> Eksportēt Excel lejupielādē
derīgu `.xlsx` (pārbaudīts ar `openpyxl`, satura vērtības sakrīt) ->
projekta dzēšana strādā.

**Atrasts un izlabots reāls kļūme, ne tikai tests:** eksportējot ar
diakritiku saturošu projekta nosaukumu (piem. "Testa māja"), Chromium
`download` atribūta failanosaukums krīt atpakaļ uz ģenērisku "download" —
apstiprināts ar izolētu reprodukciju (identisks kods ar ASCII nosaukumu
strādā pareizi, ar diakritiku nē), tātad reāla problēma, ne testa vides
artefakts. Latviešu valodas projektu nosaukumi gandrīz vienmēr satur
diakritiku, tāpēc tas skartu ikvienu reālu lietotāju. Izlabots ar
`toAsciiFileName()` — faila nosaukums tiek attīrīts, saturs paliek
neskarts.

**Definition of Done — pārbaudīts:**
- ✅ Core: visi testi zaļi (`npm test --workspace @tames-modulis/core` —
  31/31), typecheck tīrs.
- ✅ Web: typecheck tīrs, `vite build` veiksmīgs (ar izmēra brīdinājumu,
  skat. zemāk), pilns lietotāja ceļš manuāli pārbaudīts ar Playwright reālā
  Chromium (ne tikai statisks build).
- ⚠️ **Nav pabeigts/zināms trūkums:** `vite build` brīdina, ka galvenais JS
  bundle ir ~1.1MB (322KB gzip) — galvenokārt `exceljs`. Darbojas pareizi,
  bet nav optimizēts; vērts vēlāk code-split'ot (dinamisks `import()`
  Excel eksportam/importam), lai sākotnējā lapas ielāde nebūtu smaga tikai
  tāpēc, ka pastāv Excel eksporta poga.
- ⚠️ Nav pievienots favicon (nekritiski, 404 konsolē).
- ⚠️ Nav testēts, kā UI uzvedas ar ļoti daudzām sadaļām/pozīcijām
  (veiktspēja, ritināšana) — pārbaudīts tikai ar mazu paraugu.

## Sesija 10: `exceljs` code-splitting — ✅ pabeigts

**Uzdevums:** eksporta poga lazy-load'o `exceljs`, lai sākotnējā UI ielāde
nebūtu ~1MB smaga tikai tāpēc, ka pastāv Excel eksporta poga.

**Atklājums implementācijas laikā:** ar `import()` klikšķa apstrādātājā
nepietiek, kamēr `exceljs` atkarīgais kods (`excel/export.ts`) joprojām
tiek statiski eksportēts no `@tames-modulis/core` galvenā barela
(`src/index.ts`), ko `packages/web` jau tāpat importē statiski citām
vajadzībām (`createProject`, `summarizeBoq` u.c.) — Rollup tad ievelk visu
moduļa grafu vienā (agrīni ielādētā) daļā neatkarīgi no `import()`.
Risinājums: izņemts `excel/*` no `src/index.ts`, pievienota atsevišķa
`package.json` `exports` ieeja `@tames-modulis/core/excel`
(`src/excel/index.ts`), un tikai to importē dinamiski
`ProjectEditor.tsx`'s `handleExport`. Node puses `@tames-modulis/core/node`
(`src/node.ts`) re-eksportē `excel/*` arī turpmāk, jo Node pusē bundle
izmērs nav problēma.

**Rezultāts (pārbaudīts):**
- `vite build` galvenais JS chunk: ~1098KB -> ~155KB (49.9KB gzip).
  `exceljs` tagad atsevišķs ~945KB chunk.
- Playwright tests apstiprināja: neviens pieprasījums, kas satur
  "excel"/"exceljs", nenotiek sākotnējā lapas ielādē; tie parādās tikai
  pēc "Eksportēt Excel" klikšķa, un lejupielādētais fails joprojām derīgs
  (pārbaudīts ar `openpyxl`).
- Eksporta pogai pievienots "Sagatavo..." stāvoklis, kamēr chunk ielādējas.

**Definition of Done — pārbaudīts:**
- ✅ Core: visi 31 testi joprojām zaļi, typecheck tīrs.
- ✅ Web: typecheck tīrs, `vite build` bez galvenā bundle izmēra
  brīdinājuma (brīdinājums par ~945KB chunk paliek, bet tas ir tikai
  Excel eksporta lazy chunk, ne sākotnējā ielāde — nekritiski).
- ✅ Playwright apstiprināja lazy-loading uzvedību un eksporta pareizību
  reālā Chromium, ne tikai unit testos.

## Sesija 11: Excel imports UI — ✅ pabeigts

**Uzdevums:** savienot jau esošo `importBoqFromBuffer` (core) ar UI —
lietotājam jāvar importēt `.xlsx` failu tieši no brauzera.

**Lēmums:** imports vienmēr izveido JAUNU projektu (nevis pārraksta atvērtā
projekta sadaļas) — vienkāršāk, drošāk, un simetriski ar "+ Jauns" formu.
Novietots `ProjectList.tsx` līdzās projektu izveides formai (poga
"Importēt Excel" + paslēpts `<input type="file">`). Projekta nosaukums pēc
noklusējuma nāk no faila nosaukuma (bez `.xlsx` paplašinājuma); lietotājs
var pārsaukt redaktorā tāpat kā jebkuru citu projektu. Papildinošs/
pārrakstošs imports esošā projektā apzināti nav implementēts (skat.
zemāk NĀKAMAIS UZDEVUMS, ja tas kādreiz kļūst vajadzīgs).

**Implementēts:**
- `App.tsx` — `handleImport(file)`: dinamiski importē
  `@tames-modulis/core/excel` (tāpat kā eksports Sesijā 10, lai
  saglabātu code-splitting), lasa failu ar `file.arrayBuffer()`, ģenerē
  `projectId` ar `crypto.randomUUID()`, atvasina `projectName` no faila
  nosaukuma, izsauc `importBoqFromBuffer`, saglabā tieši caur
  `adapter.save()` (nevis `ProjectService.createProject` + pārraksts —
  imports jau atgriež gatavu pilnu `BoqState`), atsvaidzina sarakstu un
  izvēlas jauno projektu.
- `ProjectList.tsx` — "Importēt Excel" poga + paslēpts failu ievades
  lauks, "Importē..." stāvoklis kamēr notiek imports.

**Manuāla pārbaude (Playwright + reāls Chromium):**
1. Izveidots avota projekts UI, eksportēts uz `.xlsx` (reāls faila
   lejupielādes ceļš, ne mākslīgi konstruēts fails).
2. Svaigā lapas ielādē apstiprināts: nav excel/exceljs pieprasījumu
   sākotnējā ielādē (code-splitting joprojām strādā importam tāpat kā
   eksportam — abi dinamiskie importi uz to pašu moduli Rollup apvieno
   vienā chunk'ā, nevis dublē).
3. Importēts iepriekš eksportētais fails caur UI — projekta nosaukums,
   sadaļas nosaukums, visas pozīcijas vērtības (kods, apraksts, mērv.,
   daudzums, darba alga/materiāli/mehānismi) un kopsavilkuma aprēķini
   sakrita precīzi ar oriģinālu.
4. Pārbaudīta noturība: lapas pārlāde pēc importa — dati saglabājušies
   IndexedDB, kopsavilkums nemainīgs.

**Definition of Done — pārbaudīts:**
- ✅ Core: visi 31 testi joprojām zaļi, typecheck tīrs (izmaiņas nebija
  vajadzīgas core pusē — `importBoqFromBuffer` jau bija implementēts un
  testēts Sesijā 7).
- ✅ Web: typecheck tīrs, `vite build` bundle izmēri nemainīgi (~155KB
  galvenais chunk, ~945KB koplietots lazy excel chunk gan eksportam, gan
  importam).
- ✅ Pilns imports-caur-UI ceļš manuāli pārbaudīts ar Playwright, ieskaitot
  code-splitting uzvedību un datu noturību pēc pārlādes.

## Sesija 12: Reāla Līguma tāmes faila pārbaude — ✅ pabeigts

**Uzdevums:** pārbaudīt importu pret īstu `.xlsx` failu, nevis tikai pašu
ģenerētiem paraugiem.

**Lietotājs sniedza reālu failu:** 53 lapu, 4.3MB VELVE tipa būvniecības
tāme ("Paula Stradiņa klīniskās universitātes slimnīcas A korpusa
jaunbūve", ~15M€ projekts).

**Rezultāts (pirms labojumiem): imports atgrieza 0 sadaļas, 0 pozīcijas.**
Fiksēto kolonnu pieņēmums (`TAME_COLUMNS`) neatbilda reālajam failam —
daudzēku/daudzstāvu projektu lapās starp "Mērvienība" un "Daudzums" ir
ievietots papildu daudzuma-sadalījuma bloks (pa korpusiem), kas nobīda
visu turpmāko kolonnu pozīciju, un šī nobīde atšķiras pat starp vienas
darbgrāmatas lapām.

**Lēmums (apstiprināts ar lietotāju):** ieviesta kolonnu noteikšana pēc
galvenes teksta (`headerDetection.ts`'s `detectImportColumns`) tā vietā,
lai paļautos uz fiksētām pozīcijām. `TAME_COLUMNS` paliek nemainīgs
eksportam (kur mēs paši kontrolējam izkārtojumu); imports vairs uz to
nepaļaujas.

**Implementēts:**
- `src/excel/headerDetection.ts` — jauns. `detectImportColumns` skenē
  pirmās 50 rindas, meklējot 7 importam vajadzīgo lauku galvenes tekstu
  (Nr.p.k., Būvdarbu nosaukums, Mērvienība, Daudzums, Darba alga,
  Materiāli/būvizstrādājumi, Mehānismi). Atgriež `null`, ja kāds lauks
  nav atrodams — tāda lapa tiek izlaista (piem. satura rādītājs).
- `src/excel/columns.ts` — pievienots `normalizeUnit` (attīra galotnes
  punktus/komatus, Unicode augšraksta ciparus `m²`/`m³`), un `KNOWN_UNITS`
  papildināts ar reāli novērotiem variantiem (`pāris`, `vieta`, `ltr`,
  `objekts`, `litri`, `kompl`, `t.m`, `iepak`, `l`, `k-ts`, `maš/st`,
  `ēka`, `ha`) — iegūti, apsekojot VISU mērvienību kolonnu VISĀS 47 datu
  lapās reālajā failā, nevis uzminēti.
- `src/excel/import.ts` — pārrakstīts, lai izmantotu `detectImportColumns`
  fiksēto `TAME_COLUMNS` vietā.

**Divas reālas kļūdas atrastas un izlabotas ieviešanas gaitā** (nevis tikai
teorētiskas):
1. **Pašu eksports pārstāja strādāt.** Eksports rakstīja saīsinājumu
   "Mērv.", bet jaunā noteikšana meklē "Mērvienība" — pēc pārejas pat
   PAŠU ĢENERĒTIE faili vairs neimportējās (4 esošie testi kļuva sarkani).
   Izlabots: eksports tagad raksta pilnu "Mērvienība".
2. **Apvienota (`merge`) instrukciju rinda maldināja "nosaukuma" lauku.**
   Reālajā failā katrai lapai ir plaša apvienotā šūna
   "(būvdarbu veids vai konstruktīvā elementa nosaukums)", kas satur gan
   "būvdarbu", gan "nosaukums" (tikai ne blakus). exceljs katrai
   apvienotās šūnas kolonnai atgriež to pašu vērtību, tāpēc sākotnējā
   "abi vārdi jebkurā vietā" pārbaude piesaistīja "name" lauku 1. kolonnai
   (pirms sasniedza reālo galveni) — katras pozīcijas apraksts kļuva par
   tās Nr.p.k. vērtību. Izlabots divējādi: (a) "name" pārbaude tagad
   prasa vārdus tieši blakus, (b) galvenes skenēšana izlaiž jebkuru
   apvienoto šūnu, kas nav pati enkurs — vispārīgs labojums, ne tikai
   šim vienam gadījumam.

**Manuāla pārbaude pret reālo failu (pēc labojumiem):**
- 47 no 53 lapām atpazītas kā datu lapas; 6 izlaistas (satura rādītājs +
  5 kopsavilkuma lapas) — pareizi, tām nav "Mērvienība" galvenes vispār.
- **12876 pozīcijas kopā** importētas.
- Izlases pārbaude pret avota datiem (DEM, ZD, LIFT, MEB lapas) — kods,
  apraksts, mērvienība, daudzums, darba alga/materiāli/mehānismi visi
  precīzi sakrita ar Excel faila jēlajām šūnu vērtībām.
- `calculateSectionDirectTotal(DEM)` = 63491.88 — precīzi sakrita ar
  pašas tāmes "Tāmes izmaksas, eiro" šūnu (Z14). Citām lapām atšķirība
  bija ≤0.02€ (avota faila pašas starprindu noapaļošanas dēļ).
- Plaša pārbaude visās 47 lapās/12876 pozīcijās — tikai 2 aizdomīgi
  ieraksti atrasti, abi izrādījās derīgi īsi apraksti ("TV", cenas 0),
  nevis kļūdas.
- **Pilns imports caur reālu UI** (Playwright, ne tikai Node skripts):
  imports + render ~26.5s, saglabāšana IndexedDB ~6.5s, kopsavilkums
  pareizs (81.9M€ tiešās izmaksas, 12%/5% uzcenojums, 21% PVN — visa
  aritmētika sakrīt). Nekrīt, bet lēni — skat. zemāk.

**Negaidīts atklājums (veiktspēja):** šis fails arī bija de facto
"liela datu apjoma" pārbaude (47 sadaļas, 12876 pozīcijas — katra sava
rinda ar 7 ievades laukiem DOM) — kas iepriekš bija atzīmēts kā
nepārbaudīts risks. Imports+render UI ~26.5s, saglabāšana ~6.5s. Strādā,
nesabrūk, bet nav ātri — `ProjectEditor` renderē visas pozīcijas uzreiz,
bez virtualizācijas. Nav labots šajā sesijā (nebija uzdevums), bet tagad
ir konkrēti skaitļi, nevis minējums.

**Definition of Done — pārbaudīts:**
- ✅ Visi core testi zaļi: `npm test` — 39/39 (12 storage + 7 calculations
  + 7 ProjectService + 13 excel, ieskaitot jaunu regresijas testu tieši šai
  apvienoto-šūnu kļūdai).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ Reāls fails manuāli pārbaudīts gan Node skriptā, gan caur UI
  (Playwright), ar konkrētiem skaitliskiem salīdzinājumiem pret avota datiem.

## Sesija 13: UI veiktspēja ar lielu datu apjomu — ✅ pabeigts

**Uzdevums:** izlabot Sesijā 12 atklāto problēmu — imports+render ~17-26.5s
ar 12876 pozīcijām. Lietotājs apstiprināja kandidātu #1 (UI veiktspēja) no
iepriekšējās sesijas saraksta.

**Lēmums (apstiprināts ar lietotāju pēc kandidātu izklāsta):** rindu
virtualizācija katras sadaļas pozīciju tabulai, nevis sakļautas sadaļas pēc
noklusējuma vai lapošana — skat. CLAUDE.md "Pozīciju tabulas
virtualizācija" pilnu pamatojumu, kāpēc ne sakļautas sadaļas (mainītu UX
mazām sadaļām un nerisinātu problēmu pašu par sevi, ja viena sadaļa liela)
un kāpēc ne bibliotēka (piem. `react-window`) — bundle izmērs ir apzināta
prioritāte šajā projektā (skat. arī `exceljs` code-splitting lēmumu).

**Implementēts:**
- `packages/web/src/components/ItemsTable.tsx` — jauns. Izņemta sadaļas
  pozīciju tabula no `ProjectEditor.tsx` atsevišķā komponentē ar pašrocīgu
  windowing virtualizāciju: ritināms konteiners (`max-height: 480px`),
  renderē tikai redzamās rindas (+ overscan), pārējo aizpilda ar diviem
  "spacer" `<tr>` (augšā/apakšā), lai ritjoslas augstums paliktu pareizs.
  Fiksēta rindas augstuma tuvinājuma (`ROW_HEIGHT = 33`) vietā mērīšanas
  vietā, jo visas rindas ir vienāda izkārtojuma.
- `packages/web/src/components/ProjectEditor.tsx` — inline tabula aizstāta
  ar `<ItemsTable items={section.items} onUpdateItem={...}
  onRemoveItem={...} />` katrai sadaļai.
- `packages/web/src/App.css` — `.items-table-scroll` (ritināmais
  konteiners), `.items-table thead th` `position: sticky` (galvene paliek
  redzama ritinot sadaļas iekšienē).

**Manuāla pārbaude (Playwright, reāls Chromium, ne tikai unit testi):**
- Sagatavots sintētisks fixture fails (47 sadaļas × 274 pozīcijas =
  12878 pozīcijas — identiska struktūra Sesijas 12 reālajam failam, jo
  reālais fails šajā sesijā nebija pieejams; ģenerēts ar
  `exportBoqToBuffer` no core, importēts caur UI tāpat kā reāls fails).
- **Pirms labojuma (baseline, izmērīts šajā vidē ar `vite preview`):**
  imports+render ~17.0s, 90146 `<input>` DOM mezgli uzreiz (12878 poz. × 7
  lauki — atbilst tieši).
- **Pēc labojuma:** imports+render ~3.1s (~5.4x ātrāk), ~10199 `<input>`
  DOM mezgli (tikai redzamās rindas 47 sadaļās, nevis visas 12878).
- Pareizības pārbaude pēc virtualizācijas: ritināšana sadaļas iekšienē
  pareizi nomaina redzamās rindas (pārbaudīts pēc koda, ne tikai
  vizuāli); rediģēšana virtualizētā (ritinātā) rindā pielieto izmaiņu
  pareizajai pozīcijai pēc reālā indeksa, nevis redzamā; izmaiņas
  saglabājas, ritinot prom un atpakaļ; sadaļas un projekta kopsavilkums
  atjaunojas pareizi pēc rediģēšanas.
- Regresijas pārbaude mazam projektam (1 sadaļa, 1 pozīcija, izveidots caur
  UI "+"): summas pareizas, nav negribētas ritjoslas (`scrollHeight <=
  clientHeight`), UX vizuāli nemainīgs salīdzinājumā ar iepriekšējo sesiju.

**Apstiprināts arī ar to pašu reālo Sesijas 12 failu** (lietotājs to
pievienoja pēc sākotnējā labojuma) — tiešs pirms/pēc salīdzinājums tajā
pašā vidē, izmantojot `git worktree` uz `0adae4d` (commit tieši pirms šī
labojuma) blakus pašreizējam kodam, abus palaižot ar `vite preview`:

| | Pirms (0adae4d) | Pēc (šis labojums) |
|---|---|---|
| Imports + render | 18.3s | 6.0s (~3.0x ātrāk) |
| `<input>` DOM mezgli | 90132 | 9268 |
| KOPĀ AR PVN | 116003891.89 € | 116003891.89 € (identisks) |

Identiskā kopsumma abās versijās apstiprina, ka virtualizācija nemaina
importēto/aprēķināto datu pareizību, tikai renderēšanu. Reālā faila
paātrinājums (~3.0x) ir nedaudz mazāks nekā sintētiskajam fixture
(~5.4x) — ticamākais iemesls: reālā faila garāki/dažādāki teksta lauki un
pati `exceljs` parsēšana (kas nav skarta šajā labojumā) aizņem lielāku daļu
no kopējā laika nekā sintētiskajā testā ar vienkāršotiem datiem.

**Papildu atklājums: virtualizācija paātrina arī "Saglabāt" un lapas
pārlādi, nevis tikai importu.** Sesijā 12 minētais ~6.5s "saglabāšanas"
laiks tika pārpratīts kā IndexedDB raksta izmaksa pati par sevi — patiesībā
lielāko daļu tā laika aizņēma React re-renderis pēc `setState` (handleSave
un lapas ielādes gadījumā abos tiek uzstādīts pilns `BoqState`, kas pirms
labojuma nozīmēja visu ~90k input mezglu pārbūvi no jauna). Izmērīts ar to
pašu reālo failu, to pašu pirms/pēc `git worktree` metodi:

| | Pirms (0adae4d) | Pēc (šis labojums) |
|---|---|---|
| "Saglabāt" (IndexedDB raksts + re-render) | 3.4s | 0.4s (~8.7x ātrāk) |
| Lapas pārlāde + projekta atvēršana | 6.4s | 1.3s (~4.8x ātrāk) |

Tas nozīmē, ka pats IndexedDB raksta/nolasīšanas laiks reālam ~13k pozīciju
projektam ir zem sekundes — iepriekš atzīmētais "IndexedDB saglabāšanas
ātruma" trūkums (skat. zemāk NĀKAMAIS UZDEVUMS) faktiski jau ir atrisināts
ar šo pašu labojumu, nevis prasa atsevišķu risinājumu.

**Definition of Done — pārbaudīts:**
- ✅ Core: visi 39 testi joprojām zaļi (izmaiņas bija tikai `packages/web`
  pusē, core netika skarts).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ `vite build` veiksmīgs, bundle izmēri nemainīgi (virtualizācija ir
  tikai izmaiņa render loģikā, ne jauna atkarība).
- ✅ Veiktspējas uzlabojums pierādīts ar konkrētiem skaitļiem gan
  sintētiskam (17.0s -> 3.1s), gan **reālam Sesijas 12 failam** (18.3s ->
  6.0s), tiešā pirms/pēc salīdzinājumā tajā pašā vidē.
- ✅ Pareizība pēc virtualizācijas manuāli pārbaudīta (indeksācija,
  noturība pret ritināšanu, dzīvais kopsavilkums, identiska kopsumma
  pirms/pēc ar reālo failu), ne tikai ātrums.
- ✅ IndexedDB saglabāšanas/ielādes laiks reālam failam izmērīts un
  apstiprināts kā jau atrisināts (skat. augšā) — 3.4s -> 0.4s saglabājot,
  6.4s -> 1.3s lapas pārlādei, tas pats pirms/pēc `git worktree` salīdzinājums.

## Sesija 14: "Importēt esošā projektā" — ✅ pabeigts

**Uzdevums:** kandidāts #1 no Sesijas 13 atlikušā saraksta — imports
`.xlsx` failā jau atvērtā (esošā) projektā, nevis tikai jauna projekta
izveide (kā jau bija `ProjectList.tsx`).

**Lēmums (apstiprināts ar lietotāju, jautāts tieši pirms ieviešanas):**
**pārrakstīt**, ne papildināt — importētās sadaļas aizstāj VISAS esošā
projekta sadaļas; projekta ID/nosaukums/likmes paliek nemainīgi. Alternatīvas
(papildināt/pievienot klāt, vai jautāt katru reizi UI) tika piedāvātas, bet
noraidītas kā lietotāja izvēle par labu vienkāršākajam gadījumam ("aizstāt
saturu ar jaunu tāmes versiju").

**Implementēts (tikai `packages/web`, core nemainīts):**
- `packages/web/src/components/ProjectEditor.tsx` — jauna poga "Importēt
  Excel (pārrakstīt sadaļas)" redaktora galvenē, blakus "Saglabāt"/
  "Eksportēt Excel". `handleImportFileChange`: `confirm()` dialogs pirms
  pārrakstīšanas (destruktīva darbība — skat. CLAUDE.md "Executing actions
  with care" principu, kas attiecas arī uz UI, ne tikai git); pēc
  apstiprinājuma dinamiski importē `@tames-modulis/core/excel` (tāpat kā
  eksports/`ProjectList` imports, saglabājot code-splitting), izsauc
  `importBoqFromBuffer(buffer, state.projectId, state.projectName)`, un
  ņem tikai atgrieztā stāvokļa `.sections` — pārējais (`projectId`,
  `projectName`, likmes, `createdAt`) paliek no pašreizējā `state`.
  Rezultāts tiek uzstādīts uz lokālo React stāvokli (tāpat kā jebkura cita
  rediģēšana) — **nesaglabājas automātiski**, lietotājam jānospiež
  "Saglabāt", lai izmaiņas persistētu IndexedDB. Tas dod iespēju
  pārskatīt importēto rezultātu, pirms tas neatgriezeniski aizstāj
  saglabāto projektu.

**Manuāla pārbaude (Playwright, reāls Chromium):**
- Izveidots avota projekts ar atšķirīgu saturu, eksportēts uz `.xlsx`.
- Izveidots mērķa projekts ar CITU saturu un mainītu virsizdevumu likmi
  (15% vietā no 12%).
- Atcelts (dismiss) apstiprinājuma dialogs -> mērķa projekta sadaļa
  nemainīga (pareizi, nekas nenotika).
- Apstiprināts (accept) dialogs -> mērķa projekta sadaļa AIZSTĀTA ar
  avota sadaļu (sadaļu skaits paliek 1, ne 2 — pareizi PĀRRAKSTA, ne
  papildina); pozīcijas kods sakrīt ar avota faila datiem.
- Virsizdevumu likme (15%) un projekta nosaukums ("Mērķa projekts")
  NETIEK skarti pēc importa — pareizi, tikai sadaļas mainījās.
- Pēc "Saglabāt" + lapas pārlādes izmaiņas persistē IndexedDB.
- `exceljs` chunk (~946KB, identificēts pēc faila izmēra tīkla
  pieprasījumos, jo Vite hash nosaukumi literāli nesatur "excel") netiek
  pieprasīts sākotnējā lapas ielādē vai projekta izveidē — tikai pēc
  importa klikšķa redaktorā, tāpat kā eksportam un `ProjectList` importam.

**Kļūda testa skriptā laikā (ne lietotnē) atrasta un izlabota pašā
pārbaudes gaitā:** pirmā mēģinājuma testa skripts aizpildīja tikai pozīcijas
"kods" lauku, atstājot "mērvienība" tukšu — imports korekti atgrieza 0
sadaļas (0 pozīcijas), jo rindas bez atpazītas mērvienības NAV datu rindas
(dokumentēts uzvedība kopš Sesijas 12/7, skat. CLAUDE.md "Kolonnu
noteikšana"). Apstiprināts ar `detectImportColumns` tiešu inspekciju
(pagaidu vitest skripts, izdzēsts pēc lietošanas), ka kolonnas TIEK
pareizi atpazītas — problēma bija testa datos, ne kodā. Pēc testa skripta
labošanas (mērvienība + daudzums aizpildīti) imports strādāja pareizi.

**Definition of Done — pārbaudīts:**
- ✅ Core: visi 39 testi joprojām zaļi (izmaiņas bija tikai `packages/web`).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs, bundle izmēri
  nemainīgi.
- ✅ Pilna imports-esošā-projektā plūsma manuāli pārbaudīta ar Playwright:
  atcelšana, pārrakstīšanas semantika, likmju/nosaukuma saglabāšana,
  persistence pēc saglabāšanas, code-splitting.

## Sesija 15: Projekta līmeņa atlaide (diskonts) — ✅ pabeigts

**Uzdevums:** kandidāts #1 no Sesijas 14 atlikušā saraksta — atlaide/diskonts.

**Lēmums (apstiprināts ar lietotāju, jautāts tieši pirms ieviešanas):**
- **Līmenis:** projekta līmenī, viena likme (`discountRate`) visam
  projektam — nevis pa sadaļām vai pozīcijām. Simetriski ar
  `vatRate`/`overheadRate`/`profitRate`, kas jau ir projekta līmenī.
- **Aprēķina secība:** atlaide atskaitīta NO TIEŠAJĀM IZMAKSĀM, PIRMS
  virsizdevumiem/peļņas — nevis no gala summas pēc uzcenojuma vai pēc PVN.
  T.i. `directTotalAfterDiscount = directTotal - directTotal*discountRate`,
  un tieši no tā rēķina virsizdevumus/peļņu, nevis no `directTotal`.
- **PVN:** paliek viena likme projektam, dažādu PVN likmju atbalsts (piem.
  pa pozīcijām) NAV pievienots šoreiz — lietotājs apstiprināja, ka ar
  diskontu vien pietiek.

**Implementēts:**
- `src/models/boq.ts` — jauns `discountRate: number` lauks `BoqState`,
  `DEFAULT_DISCOUNT_RATE = 0` (bez atlaides pēc noklusējuma),
  `CURRENT_SCHEMA_VERSION` `3 -> 4`.
- `src/storage/migrations/index.ts` — jauna `3: (data) => ...` migrācija,
  kas iztrūkstošam/nepareiza tipa `discountRate` uzstāda
  `DEFAULT_DISCOUNT_RATE`, tāpat kā jau esošās v1/v2 migrācijas citiem
  laukiem. Jau esošs `discountRate` (piem., ja lietotājs to jau bija
  iestatījis pirms migrācijas koda parādīšanās) netiek pārrakstīts.
- `src/calculations/boq.ts` — `summarizeBoq`: katrai sadaļai un projektam
  kopā aprēķina `discountAmount` (`directTotal * discountRate`) un
  `directTotalAfterDiscount` (`directTotal - discountAmount`); virsizdevumi
  un peļņa tagad rēķināti no `directTotalAfterDiscount`, nevis no
  neskartā `directTotal`. Pats `directTotal` lauks (neskarts, pirms
  atlaides) **netika mainīts** — tas joprojām ir tiešā pārbaudes atsauce
  pret avota tāmes "Tāmes izmaksas" šūnu (skat. Sesija 12 DEM lapas
  pārbaudi), un mainīt tā nozīmi būtu salauzis šo pārbaudes ķēdi klusi.
  Noapaļošanas princips (summē nenoapaļotus starprezultātus, noapaļo tikai
  beigās) saglabāts arī atlaides aprēķinam.
- `src/excel/export.ts` — `KOPSAVILKUMS` lapā pievienota "Atlaides likme:"
  rinda (2. rinda, virs virsizdevumu/peļņas/PVN likmēm, kas nobīdītas par
  vienu rindu uz leju) un divas jaunas kolonnas kopsavilkuma tabulā starp
  "Tiešās izmaksas" un "Virsizdevumi": "Atlaide" un "Tiešās izmaksas pēc
  atlaides" — ar formulām (nevis tikai gala vērtībām), tāpat kā pārējās
  šūnas šajā failā. Imports (`import.ts`) **nemainījās** — tas jau iepriekš
  nelasīja likmes (`vatRate`/`overheadRate`/`profitRate`) atpakaļ no
  `KOPSAVILKUMS` lapas (tikai sadaļas/pozīcijas), tāpēc `discountRate` arī
  netiek importēts — konsekventi ar jau dokumentēto "Excel imports/eksports
  ir daļēji zaudējošs" lēmumu.
- `packages/web/src/components/ProjectEditor.tsx` — jauns "Atlaide (%)"
  ievades lauks `.rates` blokā (pirms "Virsizdevumi", atbilstoši aprēķina
  secībai), un jauna "Atlaide: ..." rinda gan sadaļas, gan projekta
  kopsavilkumā — **redzama tikai, ja `discountRate !== 0`**, lai nemainītu
  UX projektiem bez atlaides (noklusējuma gadījums paliek identisks
  iepriekšējam).

**Testi:**
- `test/calculations.test.ts` — jauns tests "subtracts the discount from
  direct costs before computing overhead/profit" (10% atlaide, pārbauda
  gan sadaļas, gan projekta līmeņa `discountAmount`/
  `directTotalAfterDiscount`/`overhead`/`profit`/`subtotal`/`vatAmount`/
  `total`), un esošie testi papildināti ar jaunajiem laukiem
  (`discountAmount: 0`, `directTotalAfterDiscount` = `directTotal`, kad
  atlaides nav).
- `test/storage.test.ts` — jauns migrācijas tests "preserves an
  already-present discountRate instead of overwriting it during
  migration" (v3 dati ar `discountRate: 0.07`).
- Kopā **41/41 core testi zaļi** (39 + 2 jauni; `test/excel.test.ts`
  netika mainīts, jo tā round-trip pārbaudes salīdzina tikai sadaļu/
  pozīciju datus, ne `KOPSAVILKUMS` lapas fiksētās rindas/kolonnas, un
  noklusējuma `discountRate=0` abās pusēs jau sakrīt).

**Manuāla pārbaude (Playwright, reāls Chromium, headless jauna režīmā —
skat. zemāk piezīmi):**
- Izveidots jauns projekts, pievienota sadaļa ar vienu pozīciju
  (100 gab. × (5+3+2) €/vienība = 1000 € tiešās izmaksas).
- Ar `discountRate=0`: "Atlaide" rinda NAV redzama nedz sadaļas, nedz
  projekta kopsavilkumā (esošais UX nemainīts); Pavisam (bez PVN) =
  1170.00 €, KOPĀ AR PVN = 1415.70 € (noklusējuma likmes: virsizdevumi
  12%, peļņa 5%, PVN 21%).
- Iestatot "Atlaide (%)" = 10: sadaļas kopsavilkumā parādās "Atlaide:
  100.00 €", projektā "Atlaide: -100.00 €"; Virsizdevumi pārrēķināti uz
  108.00 € (900×0.12), Peļņa uz 45.00 € (900×0.05), Pavisam (bez PVN) uz
  1053.00 €, PVN uz 221.13 €, KOPĀ AR PVN uz 1274.13 € — visi skaitļi
  sakrīt ar `summarizeBoq` formulu ar roku.
- Pēc "Saglabāt" + lapas pārlādes (atkārtoti izvēloties projektu, jo
  atlasītais projekts ir tikai React stāvoklī, ne persistents — esoša
  uzvedība, nemainīta) `discountRate=10` un visi atvasinātie skaitļi
  saglabājas nemainīgi.
- Atiestatot atlaidi atpakaļ uz 0: "Atlaide" rinda atkal pazūd.
- Excel eksports (`exportBoqToWorkbook`) pārbaudīts tieši (bez UI, ar
  `tsx` skriptu) tam pašam datu kopumam: `KOPSAVILKUMS` lapā 2. rindā
  "Atlaides likme: 10%", tabulas rindā redzamas visas jaunās kolonnas
  ar pareizām formulu rezultāta vērtībām (1000, 100, 900, 108, 45,
  1053), KOPĀ rinda sakrīt, PVN rinda 221.13 — konsekventi ar UI un
  `summarizeBoq`.
- Vienīgā konsoles kļūda visas plūsmas laikā bija `favicon.ico` 404
  (jau zināms, nekritisks, dokumentēts kā atsevišķs "Favicon" kandidāts
  zemāk) — nesaistīts ar šo izmaiņu.
- **Piezīme par pārbaudes rīku:** `chromium-cli` nebija pieejams šajā vidē;
  izmantots tieši `playwright` npm pakotne (instalēta pagaidu scratchpad
  direktorijā, ne repo atkarībās) ar iepriekš instalēto Chromium
  (`/opt/pw-browsers/chromium-1194`). Vajadzēja `--headless=new` karogu,
  jo šī playwright/Chromium kombinācija pēc noklusējuma mēģināja izmantot
  noņemto "old headless" režīmu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 41/41 testi zaļi (39 + 2 jauni šai funkcijai).
- ✅ Typecheck tīrs abās pakotnēs (`npx tsc --noEmit` core, `npm run
  build:web` web, kas ietver typecheck).
- ✅ `vite build` veiksmīgs; bundle izmēri nemainīgi (galvenais ~158KB,
  `exceljs` chunk ~946KB atsevišķi — atlaides lauks nepievienoja jaunas
  atkarības).
- ✅ Aprēķina pareizība manuāli pārbaudīta ar konkrētiem skaitļiem UI
  (Playwright) UN Excel eksportā, abi sakrīt savā starpā un ar
  `summarizeBoq` formulu ar roku.
- ✅ Migrācija (v3 bez `discountRate` -> v4 ar noklusējumu 0; v3 ar jau
  iestatītu `discountRate` -> saglabāts) testēta.
- ✅ UX regresija pārbaudīta: `discountRate=0` gadījumā UI izskatās
  identiski iepriekšējam (nav redzamas "Atlaide" rindas).

## Sesija 16: Favicon — ✅ pabeigts

**Uzdevums:** kandidāts #1 no Sesijas 15 atlikušā saraksta — favicon
(nekritisks kosmētisks trūkums, `packages/web` iepriekš nemaz nedeklarēja
`<link rel="icon">`, tāpēc pārlūks katrā ielādē pieprasīja noklusējuma
`/favicon.ico`, kas atgrieza 404).

**Lēmums:** inline SVG kā `data:` URI tieši `index.html` `<link
rel="icon">`, nevis binārs fails `public/favicon.ico`/`.png`. Vienkāršs
dizains — zils (`#2563eb`) noapaļots kvadrāts (`rx=7` no 32×32 viewBox) ar
baltu "T" monogrammu ("Tāmju modulis"), centrēts teksts. Pamatojums: (a)
nav vajadzīga jauna `public/` direktorija vai build/copy solis — Vite
kopē `public/` saturu neizmainītu, bet šeit pat tas nav nepieciešams; (b)
SVG mērogojas bez kvalitātes zuduma jebkurā tab/bookmark izmērā, un ir
mazāks par ekvivalentu PNG/ICO; (c) saturs paliek redzams/rediģējams
tieši `index.html` iekšienē, nav atsevišķa binārā faila repo, ko nevar
diff'ot lasāmā veidā.

**Implementēts:**
- `packages/web/index.html` — `<link rel="icon" type="image/svg+xml"
  href="data:image/svg+xml,...">` pievienots `<head>`, pirms `<title>`
  aiz. SVG saturs pārbaudīts kā derīgs XML (`xml.dom.minidom.parseString`
  pēc URL-decode) pirms iestrādāšanas.

**Manuāla pārbaude:**
- Renderēts atsevišķi ar headless Chromium (SVG datu URI dekodēts un
  atvērts kā samazināts HTML iesaiņojums), lai pirms iestrādāšanas
  vizuāli apstiprinātu, ka ikona izskatās pareizi (noapaļots zils
  kvadrāts, centrēts baltais "T"). Piezīme par pašu pārbaudes rīku: šīs
  vides headless Chromium `--screenshot` karogam ir savdabīga kļūda —
  KVADRĀTA formas logs (piem. `--window-size=200,200`) apgriež
  ekrānuzņēmumu vertikāli aptuveni pie 72% augstuma NEATKARĪGI no lapas
  satura (pat vienkāršam `<rect>` bez teksta/noapaļošanas); ar
  taisnstūra logu (piem. `200,300`) tas pats saturs renderējas pareizi.
  Tas ir šīs headless vides/binārā artefakts, ne SVG vai koda kļūda —
  atzīmēts šeit, ja nākotnē atkal jāizmanto ekrānuzņēmumi šajā vidē.
- `npm run build:web` (`tsc --noEmit` + `vite build`) veiksmīgs,
  `dist/index.html` satur jauno `<link rel="icon">`.
- Palaists `npm run dev:web`, atvērts reālā headless Chromium (Playwright,
  `--headless=new`, tāpat kā Sesijā 15): `link[rel="icon"]` klāt DOM ar
  gaidīto `data:image/svg+xml,...` `href`; **NULLE 404 pieprasījumu** un
  **NULLE konsoles kļūdu** visā lapas ielādē — apstiprina, ka iepriekšējais
  `favicon.ico` 404 ir novērsts un nekas cits netika salauzts.

**Definition of Done — pārbaudīts:**
- ✅ Typecheck tīrs, `vite build` veiksmīgs (bundle izmēri nemainīgi —
  inline datu URI ir daži simti baitu `index.html` iekšienē, nevis jauna
  atkarība vai chunk).
- ✅ Core testi neskarti (izmaiņas tikai `packages/web/index.html`) — 41/41
  joprojām zaļi.
- ✅ Manuāli pārbaudīts reālā headless Chromium: favicon linktags klāt,
  iepriekšējais 404 novērsts, nav jaunu konsoles kļūdu.

## Sesija 17: Projekta rekvizīti, tāmes numerācija, Excel salasāmība — ✅ pabeigts

**Uzdevums:** reāls lietotāja feedback pēc pirmās pilnās izmēģināšanas ar
īsto VELVE tāmes failu (imports, atlaides tests, eksports) — trīs punkti:
1. Excel eksporta tabulu noformējums (rindu/kolonnu platums) nelasāms.
2. Katrā eksportētajā lapā jāparādās iepriekš iestatītiem laukiem: Projekta
   nosaukums, Būvuzņēmēja rekvizīti, Pasūtītāja rekvizīti, un zem tabulas
   "Vārds, uzvārds" kurš sastādīja/pārbaudīja tāmi.
3. Tāmes numerācija pašlaik ņemta no Excel lapas nosaukuma, bet tie ne
   vienmēr sakrīt reālos failos — vajag manuāli ievadāmu numuru katrai
   sadaļai.

**Lēmumi (apstiprināti ar lietotāju pirms ieviešanas):**
- Būvuzņēmēja/Pasūtītāja rekvizīti un Sastādīja/Pārbaudīja: **strukturēti
  apakšlauki** (nosaukums/reģ.nr./adrese katram uzņēmumam), nevis brīvs
  teksts.
- Visi šie lauki: **projekta līmenī** (vieni visam projektam, rādās
  identiski katrā eksportētajā lapā), nevis pa sadaļām.
- Tāmes numerācija: **tikai teksts lapas iekšienē** ("Lokālā tāme Nr.: X"),
  Excel lapas NOSAUKUMS paliek pēc sadaļas nosaukuma kā līdz šim (nevis
  numurs to aizstāj).

**Implementēts:**
- `packages/core/src/models/boq.ts` — jauns `CompanyDetails` tips
  (`name`/`regNr`/`address`), `BoqState.contractor`/`client`/`preparedBy`/
  `checkedBy` (projekta līmenī), `BoqSection.estimateNumber` (sadaļas
  līmenī). `CURRENT_SCHEMA_VERSION` `4 -> 5`.
- `packages/core/src/storage/migrations/index.ts` — jauna `4: (data) =>
  ...` migrācija ar defaultiem trūkstošiem laukiem, saglabājot jau
  esošos.
- `packages/core/src/excel/export.ts` — pilnībā pārstrādāts: jauns
  `writeProjectHeaderBlock` (galvenes bloks katrā lapā, arī
  `KOPSAVILKUMS`) un `writeSignatureBlock` (paraksta rindas zem katras
  tabulas), abi ar DINAMISKI aprēķinātiem rindu numuriem (nevis
  hardkodētiem), lai formulas nesalūztu, ja bloku garums nākotnē mainās.
  Jauns `COLUMN_WIDTHS` (kolonnu platumi lasāmībai) un `wrapText` uz
  "Būvdarbu nosaukums" kolonnas datu šūnām. `import.ts` NEMAINĪJĀS —
  `estimateNumber` importa laikā vienmēr tukšs (nevar droši atvasināt no
  faila), lietotājs aizpilda manuāli.
- `packages/core/src/index.ts` — barelā pievienoti `CompanyDetails`,
  `createEmptyCompanyDetails`, un (izlaists Sesijā 15 pēc pārskatīšanas)
  `DEFAULT_DISCOUNT_RATE`.
- `packages/web/src/components/ProjectEditor.tsx` — jauns sakļaujams
  `<details>` "Projekta rekvizīti (Excel eksportam)" bloks ar
  Būvuzņēmēja/Pasūtītāja apakšlaukiem un Sastādīja/Pārbaudīja laukiem;
  jauns "Nr." lauks katras sadaļas galvenē (`estimateNumber`).
- `packages/web/src/App.css` — stili jaunajiem elementiem
  (`.project-details`, `.details-grid`, `.section-estimate-number`).

**Testi:** `packages/core/test/storage.test.ts` — 4 jauni migrācijas testi
(v4->v5 defaults, preserve, jau iepriekš pievienotais contractor/client
lauks migrācijas laikā). `packages/core/test/excel.test.ts` — 6 jauni
testi (galvenes bloks sadaļas lapā, tukšs tāmes numurs, paraksta bloks,
`KOPSAVILKUMS` galvene/paraksts, kolonnu platumi, imports joprojām strādā
pēc jaunā eksporta formāta). Kopā **49/49 core testi zaļi** (41 + 8 jauni).

**Manuāla pārbaude (Playwright, reāls Chromium):**
- Izveidots projekts, aizpildīti visi jaunie lauki (Būvuzņēmējs, Pasūtītājs,
  Sastādīja, Pārbaudīja), pievienota sadaļa ar "Nr." = "1-1" un pozīcija.
- Eksportēts, LEJUPIELĀDĒTAIS `.xlsx` fails pārbaudīts tieši (`openpyxl` +
  neapstrādāta XML inspekcija, ne tikai `exportBoqToWorkbook` tiešā
  izsaukumā): galvenes bloks (rindas 1-8), tabula, tiešo izmaksu rinda,
  paraksta bloks (rindas 15-16) — visi pareizajās vietās ar pareizu saturu.
- Kolonnu platumi apstiprināti tieši XML `<cols>` elementā (`unzip` +
  `grep`) — atklāts, ka `openpyxl`'s `column_dimensions` vārdnīca rāda
  `None` blakus kolonnām ar VIENĀDU platumu (exceljs tās konsolidē vienā
  `<col min max width>` diapazonā) — tas IZSKATĀS pēc trūkstoša platuma
  lasot ar `openpyxl`, bet reālajā failā/Excel/LibreOffice platums pareizi
  attiecas uz visu diapazonu. Nozīmīgs atradums nākotnes pārbaudēm — nevis
  kļūda pašā eksportā.
- Pēc "Saglabāt" + lapas pārlādes visi jaunie lauki (Būvuzņēmēja nosaukums,
  sadaļas "Nr.") saglabājas nemainīgi.
- Reāls 47-sadaļu VELVE imports pārbaudīts arī pēc šīm izmaiņām — katrai
  sadaļai parādās (tukšs, rediģējams) "Nr." lauks, imports strādā tāpat kā
  iepriekš (~11.4s import+atvēršana šajā vidē), nav konsoles kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 49/49 testi zaļi (8 jauni šai funkcijai).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi: ~158KB -> ~160KB galvenais bundle, `exceljs` chunk
  nemainīgs).
- ✅ Excel eksporta salasāmība un jaunie rekvizītu/paraksta lauki pārbaudīti
  gan uz reāla lejupielādēta faila, gan unit testos.
- ✅ Reāls VELVE imports joprojām strādā pareizi ar jauno datu modeli.
- ✅ Migrācija (v4 bez jaunajiem laukiem -> v5 ar defaultiem; v4 ar jau
  iestatītiem laukiem -> saglabāti) testēta.

**Lietotāja apstiprinājums pēc Sesijas 17:** lietotājs pats izmēģināja
Sesijas 17 izmaiņas (kolonnu platumi/rekvizīti/tāmes numerācija) reālā
lietotnē ar reālo VELVE failu un apstiprināja, ka strādā. Nav ziņots par
neatbilstībām — nekas atklāts, kas jālabo pirms nākamā uzdevuma.

## Sesija 18: Tāmes izmaiņu (Variation Order) vadība — ✅ pabeigts

**Uzdevums:** Sesijas 17 beigās atstātais "NĀKAMAIS UZDEVUMS" — FIDIC
inženiera/Cost Estimate Manager perspektīva: izveidot un kontrolēt tāmes
izmaiņas pēc bāzes tāmes apstiprināšanas (jauna tāme / apjomu samazinājums
vai pozīciju izslēgšana / apjomu palielinājums).

**Precizējoši jautājumi UZDOTI LIETOTĀJAM PIRMS ieviešanas** (divās kārtās,
skat. sarunas vēsturi) un atbildes:
- Izmaiņas ir **numurētas VO entītijas** (ne tikai "pašreizējie" daudzumi ar
  diff pret bāzi) - katra var skart vairākas pozīcijas.
- VO vajag **formālu statusa plūsmu**: ierosināts -> apstiprināts/noraidīts.
- "Izslēgta" pozīcija ir **atsevišķs karogs** (`excluded`), NAV vienāds ar
  `quantity = 0`.
- UI: **atsevišķa "Izmaiņu" cilne** (nevis blakus kolonnas galvenajā tabulā).
- Bāze tiek iesaldēta ar **skaidru darbību** ("Apstiprināt bāzes tāmi"), nevis
  netieši pirmās VO izveidē.
- "Pašreizējais" stāvoklis vienmēr **ATVASINĀTS** no bāzes + apstiprinātajām
  VO (bāze pēc iesaldēšanas nekad netiek mutēta), nevis VO apstiprināšana
  tieši pārraksta pozīcijas.
- VO **drīkst pievienot pavisam jaunas pozīcijas** (ne tikai mainīt/izslēgt
  bāzes pozīcijas) - atbilst reālai FIDIC praksei.
- Excel: **iekļauts šajā uzdevumā** (nevis atlikts) - reģistra kopsavilkums +
  delta kolonnas sadaļu lapās.

**Datu modelis (`schemaVersion` `5 -> 6`):**
- `packages/core/src/models/variationOrder.ts` (jauns fails) - `VariationOrder`
  (`id`, `number` ("VO-N", secīgs), `title`, `justification`, `instructedBy`,
  `date`, `status` (`proposed`/`approved`/`rejected`), `statusDate`,
  `changes[]`, `createdAt`/`updatedAt`) un `VariationOrderChange` (`id`,
  `sectionId`, `itemId` - `null` nozīmē jaunu pozīciju, `quantityDelta`,
  `excluded`, `newItem` - aizpildīts tikai jaunām pozīcijām).
- `packages/core/src/models/boq.ts` - `BoqItem.excluded?: boolean` (tikai
  atvasinātajā stāvoklī var būt `true`, bāzes pozīcijās vienmēr
  false/undefined), `BoqState.baselineApprovedAt: string | null` (iesaldēšanas
  atzīme) un `BoqState.variationOrders: VariationOrder[]`.

**Aprēķini/atvasināšana (`packages/core/src/variationOrders/deriveCurrentState.ts`,
jauns fails):**
- `deriveCurrentSections(baseline, variationOrders)` - klonē bāzi un piemēro
  padoto VO sarakstu SECĪGI (masīva secībā, ne pēc statusa/datuma - saucēja
  ziņā, kuras VO padot). Jaunām pozīcijām (`itemId === null`) piešķir
  `id` vienādu ar izveidojušās izmaiņas `id`, tāpēc VĒLĀKA VO var atsaukties
  uz to tāpat kā uz bāzes pozīciju (piem. viena VO pievieno pozīciju, cita to
  vēlāk izslēdz). Daudzuma korekcija klampēta pie 0 (nesamazinās zem 0).
- `deriveCurrentState(state)` - ērtības funkcija: `sections` = bāze +
  TIKAI apstiprinātās VO. Lieto UI ("Tāme" cilne pēc iesaldēšanas) un Excel
  eksports.
- `computeVariationOrderDirectTotalImpact(baseline, variationOrders, voId)` -
  konkrētas VO finansiālā ietekme (neatkarīgi no tās paša statusa), rēķināta
  kā starpība starp atvasināto stāvokli TIEŠI PIRMS un TŪLĪT PĒC šīs VO
  (iepriekšējo APSTIPRINĀTO VO kontekstā) - pareizi apstrādā visus
  gadījumus (daudzuma korekcija/izslēgšana/jauna pozīcija) bez atsevišķas
  per-izmaiņas formulas. **Zināms ierobežojums:** ja VAIRĀKAS VO maina TO
  PAŠU pozīciju (piem. viena palielina daudzumu, cita vēlāk to izslēdz), šīs
  funkcijas "ietekme" katrai VO ir marginālā ietekme SAVĀ secības punktā, nevis
  izolēta "šīs VO vienas paša nopelns" - tas ir pareizi kumulatīvai bilancei,
  bet var pārsteigt, lasot atsevišķas VO rindas reģistrā.
- `diffAgainstBaseline(baseline, current)` - atgriež TIKAI pozīcijas, kas
  atšķiras (daudzums mainīts, izslēgtas, vai jaunas) - filtrē negrozītās, lai
  lielai tāmei (tūkstošiem pozīciju) diff skats nebūtu nelietojams troksnis.
- `calculations/boq.ts` `calculateItemCosts` - izslēgtai pozīcijai (`excluded`)
  vienmēr atgriež nulles izmaksas neatkarīgi no `quantity` (daudzums paliek
  redzams atsaucei/diff skatam).

**Migrācija:** `storage/migrations/index.ts` `5: (data) => ...` - defaultē
`baselineApprovedAt: null`, `variationOrders: []` trūkstošiem laukiem,
saglabājot jau esošos.

**Excel eksports (`excel/export.ts`):**
- Kad `baselineApprovedAt !== null`, sadaļu lapas (un `KOPSAVILKUMS`) rāda
  ATVASINĀTO (bāze + apstiprinātās VO) stāvokli, nevis bāzi tieši - atbilst
  reālai FIDIC praksei (darba tāme atspoguļo apstiprinātās izmaiņas). Katrai
  sadaļu lapai divas papildu kolonnas AIZ esošā izkārtojuma (17. spacer, 18.
  "Bāzes daudzums", 19. "Delta") - novietotas STINGRI aiz `TAME_COLUMNS`
  fiksētā izkārtojuma, tāpēc atkārtots imports (kas kolonnas atrod pēc
  galvenes teksta) nav ietekmēts. Izslēgta pozīcija vizuāli marķēta ar
  pārsvītrojumu (`font.strike`) "Būvdarbu nosaukums"/"Daudzums" šūnās -
  NEVIS teksta piedēkli aprakstā, lai atkārtots imports nesabojātu tekstu.
  Bez iesaldētas bāzes eksports paliek NEMAINĪTS (backward compatible).
- Jauna **"IZMAIŅAS" darblapa** (rakstīta tikai, ja `variationOrders.length >
  0`) - projekta rekvizītu galvenes bloks, "Izmaiņu reģistrs" (viena rinda
  katrai VO: numurs/datums/statuss/nosaukums/pamatojums/instruēja/ietekme uz
  tiešajām izmaksām), un "Mainītās pozīcijas" tabula (`diffAgainstBaseline`
  rezultāts - sadaļa/nr./nosaukums/bāzes un pašreizējais daudzums/delta/
  izslēgts/izmaksu delta). Divas loģiskās tabulas dala kolonnas 1-9 (dažādas
  nozīmes katrā) - platumi izvēlēti pēc PLATĀKĀS vajadzības katrā kolonnā
  (šaurāks saturs = tikai lieks baltums, ne salasāmības problēma).

**Web UI:**
- `packages/web/src/components/ProjectEditor.tsx` - jauna poga "Apstiprināt
  bāzes tāmi" (redzama, kamēr `!baselineLocked`) ar `confirm()` dialogu
  (tāpat kā citām destruktīvām/neatgriezeniskām darbībām šajā UI) - iestata
  `baselineApprovedAt`, jāapstiprina ar "Saglabāt" (nesaglabā automātiski,
  konsekventi ar pārējo redaktora uzvedību). Pēc iesaldēšanas: dzeltens
  baneris ar iesaldēšanas datumu, sadaļu/pozīciju rediģēšana atspējota
  (`ItemsTable readOnly`, sadaļas nosaukuma/tāmes numura `input` `disabled`,
  "Dzēst sadaļu"/"+ Pozīcija"/"+ Sadaļa" pogas paslēptas), "Importēt Excel
  (pārrakstīt sadaļas)" poga atspējota (imports pārrakstītu tieši bāzi -
  neatbilst iesaldēšanas semantikai). "Tāme" cilne pēc iesaldēšanas rāda
  ATVASINĀTO stāvokli (`deriveCurrentState`), nevis bāzi tieši. Jaunas
  cilnes ("Tāme" / "Izmaiņas (VO)") parādās TIKAI pēc iesaldēšanas - pirms
  tam UI izskatās un darbojas identiski iepriekšējam (nav VO jēdziena bez
  bāzes).
- `packages/web/src/components/VariationOrders.tsx` (jauns fails) - "Izmaiņu"
  cilnes saturs: forma jaunas VO izveidei (nosaukums/instruēja/datums/
  pamatojums), VO karšu saraksts (statusa nozīme, finansiālā ietekme,
  izmaiņu tabula, "+ Izmaiņa"/"Apstiprināt"/"Noraidīt" pogas - pieejamas
  tikai `status === "proposed"` VO), izmaiņas pievienošanas forma (sadaļas +
  pozīcijas izvēle no ATVASINĀTĀ pašreizējā stāvokļa - ļauj atsaukties arī uz
  cita VO jau pievienotu pozīciju - ar daudzuma korekciju VAI "Izslēgt
  pilnībā" izvēli, VAI jaunas pozīcijas laukiem), un "Mainītās pozīcijas"
  diff tabula (bāze pret pašreizējo, visam projektam).
- `packages/web/src/components/ItemsTable.tsx` - jauns `readOnly` props
  (noklusējums `false`) - atspējo visus `<input>` un paslēpj dzēšanas pogu,
  nevis paslēpj visu tabulu, lai vērtības paliktu salasāmas tajā pašā
  izkārtojumā. Izslēgtai pozīcijai (`item.excluded`) rinda dabū
  `.excluded-row` klasi (pārsvītrojums + samazināts kontrasts, skat. App.css).
- `packages/web/src/App.css` - jauni stili (`.baseline-banner`, `.tabs`,
  `.excluded-row`, `.vo-*`).

**Zināms ierobežojums (dokumentēts, apzināti ĀRPUS šī uzdevuma apjoma):** VO
var pievienot jaunas POZĪCIJAS esošā sadaļā, bet NE jaunas SADAĻAS - reāla
FIDIC prakse dažkārt ievieš pavisam jaunu darbu bloku ar VO, bet tas šajā
sesijā nav atbalstīts (lietotājs to nepieprasīja precizējošajos jautājumos;
nākotnē varētu paplašināt `VariationOrderChange` ar opciju izveidot jaunu
sadaļu, analoģiski `newItem`).

**Testi:** `packages/core/test/variationOrders.test.ts` (jauns fails, 15
testi) - `deriveCurrentSections` (daudzuma +/-, klampēšana pie 0, izslēgšana,
jaunas pozīcijas, atsauce uz cita VO pievienotu pozīciju, bāze netiek
mutēta), `deriveCurrentState` (tikai apstiprinātās VO ietekmē), VO numerācija/
izveide, `computeVariationOrderDirectTotalImpact` (daudzuma pieaugums,
izslēgšana, kumulatīvā secība, nezināms id), `diffAgainstBaseline` (tikai
mainītās pozīcijas). `test/calculations.test.ts` - 1 jauns tests (`excluded`
nulle izmaksas). `test/storage.test.ts` - 2 jauni migrācijas testi (v5->v6
defaulti/saglabāšana), 1 papildināts (v1->current arī pārbauda jaunos
laukus). `test/excel.test.ts` - 3 jauni testi (bez VO nekas nemainās, delta
kolonnas ar pareizām vērtībām + pārsvītrojums, IZMAIŅAS lapas reģistrs/diff
tabula). Kopā **70/70 core testi zaļi** (49 + 21 jauni/papildināti).

**Manuāla pārbaude (Playwright, reāls Chromium, pilna plūsma no nulles):**
izveidots projekts ar sadaļu un divām pozīcijām, saglabāts, apstiprināta
bāze (baneris parādās, ievades lauki atspējoti, "+ Sadaļa" pazūd), pārslēgts
uz "Izmaiņas (VO)" cilni, izveidota VO ar pamatojumu, pievienotas divas
izmaiņas (daudzuma +20 vienai pozīcijai, pilnīga izslēgšana otrai),
apstiprināta VO (statusa nozīme kļūst zaļa "Apstiprināts", ietekme aprēķināta
pareizi), diff tabula rāda pareizas bāzes/pašreizējās/delta vērtības abām
pozīcijām. Pārslēdzoties atpakaļ uz "Tāme" cilni, daudzums UI atjaunināts
pareizi (100 -> 120), kopsavilkums pārrēķināts. Eksportēts `.xlsx` fails
pārbaudīts ar `openpyxl`: `KOPSAVILKUMS`/sadaļas lapa rāda atvasināto
stāvokli ar pareizām "Bāzes daudzums"/"Delta" kolonnām, izslēgtajai pozīcijai
`font.strike == True`, jaunā `IZMAIŅAS` lapa satur pareizu reģistru un diff
tabulu. Konsolē nav kļūdu (`page.on("console"/"pageerror")` tukšs) visā
plūsmā. `npm run build:web` veiksmīgs (galvenais bundle ~172KB, `exceljs`
chunk nemainīgs ~950KB atsevišķi).

**Definition of Done — pārbaudīts:**
- ✅ Core: 70/70 testi zaļi (21 jauni/papildināti šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs (`tsc --noEmit`), `vite build` veiksmīgs.
- ✅ Manuāli pārbaudīts pilna plūsma reālā pārlūkā (Playwright): bāzes
  iesaldēšana, VO izveide/apstiprināšana (daudzuma izmaiņa UN izslēgšana),
  diff skats, Excel eksports ar jauno lapu un delta kolonnām, nav konsoles
  kļūdu.
- ✅ Migrācija (v5 bez jaunajiem laukiem -> v6 ar defaultiem; v5 ar jau
  iestatītiem laukiem -> saglabāti) testēta.
- ✅ Trīs lietotāja nosauktie gadījumi atbalstīti: (1) jauna/bāzes tāme -
  esošā funkcionalitāte + "Apstiprināt bāzes tāmi"; (2) apjomu samazinājums/
  izslēgšana - `quantityDelta < 0` un/vai `excluded: true`; (3) apjomu
  palielinājums - `quantityDelta > 0`, arī pavisam jaunu pozīciju pievienošana.

## Sesija 19: Jaunas sadaļas caur VO + izpildes aktu uzskaite/atlikums — ✅ pabeigts

**Uzdevums:** lietotāja feedback tūlīt pēc Sesijas 19 pieprasījuma, divi
papildinājumi Sesijas 18 VO funkcionalitātei:
1. VO jāspēj izveidot pavisam JAUNU sadaļu ar jaunām pozīcijām (ne tikai
   jaunas pozīcijas esošā sadaļā) - reāls gadījums, kad VO ievieš pavisam
   jaunu darbu bloku, kas sākotnējā tāmē nemaz nebija.
2. Jāievada izpildes aktu vēsture pa atskaites periodiem (piem. mēnesi) -
   katram periodam kolonna ar inženiera apstiprināto izpildīto daudzumu pa
   pozīcijām, PLUS atvasināta "atlikums uz nākamo periodu" kolonna. Šis
   atlikums vienmēr jāredz, gatavojot jaunu VO, lai nesamazinātu/neizslēgtu
   apjomu, kas jau (daļēji) izpildīts.

**Precizējoši jautājumi UZDOTI LIETOTĀJAM PIRMS ieviešanas** (pirmā kārta
pārtraukta/nav atbildēta strukturētā formā, otrā kārta atbildēta tekstā) -
lēmumi:
- Izpildes aktu vēsture: **pilns audit trail** (nevis viens rediģējams
  skaitlis) - katrs periods ir atsevišķs ieraksts ar pozīciju sarakstu un
  šajā periodā izpildīto daudzumu, plus atvasināta atlikuma kolonna.
- Ievade: **manuāla** (nevis Excel imports no izpildes akta faila - tas
  atlikts uz vēlāku sesiju, ja vajadzēs).
- Validācija (VO samazina apjomu zem izpildītā): **brīdinājums, ne
  bloķēšana** - lietotājs pieņem lēmumu, sistēma neuzņemas šķīrējtiesneša
  lomu.
- Jaunas sadaļas caur VO: divu soļu process (viena izmaiņa izveido tukšu
  sadaļu, nākamā tai pievieno pozīcijas), konsekventi ar jau ieviesto
  "jaunas pozīcijas" mehānismu - lietotājs to netieši apstiprināja,
  neiebilstot pret piedāvāto pieeju.

**Datu modelis (`schemaVersion` `6 -> 7`):**
- `packages/core/src/models/executionRecord.ts` (jauns fails) —
  `ExecutionRecord` (`id`, `period` (brīvs teksts, piem. "2026-01"),
  `date`, `approvedBy`, `entries[]`, `createdAt`/`updatedAt`) un
  `ExecutionRecordEntry` (`sectionId`, `itemId`, `executedQuantity` - ŠAJĀ
  PERIODĀ izpildītais, ne kumulatīvs). `BoqState.executionRecords:
  ExecutionRecord[]`.
- `packages/core/src/models/variationOrder.ts` — `VariationOrderChange.
  newSection: { name, estimateNumber } | null` - kad iestatīts, izmaiņa
  izveido tukšu sadaļu ar `id` vienādu ar pašas izmaiņas `id` (self-
  referencing, tāpat kā jaunām pozīcijām), `itemId`/`newItem` paliek
  `null`. Pozīcijas tai pievieno ATSEVIŠĶAS turpmākas izmaiņas, kas norāda
  `sectionId: <sadaļu izveidojušās izmaiņas id>`.

**Aprēķini/atvasināšana:**
- `variationOrders/deriveCurrentState.ts` `applyChange` - jauns pirmais
  pārbaudījums `if (change.newSection)`, kas pievieno tukšu sadaļu un
  atgriežas, PIRMS mēģina meklēt `change.sectionId` esošajās sadaļās (kas
  jaunai sadaļai vienalga neeksistētu pirms šīs izmaiņas). Aizsardzība pret
  dublikātu izveidi, ja funkcija izsaukta atkārtoti ar to pašu VO sarakstu.
- `packages/core/src/executionRecords/executionRecords.ts` (jauns fails) -
  `computeExecutedToDate(executionRecords, itemId)` (summē visus periodus),
  `computeRemainingQuantity(currentQuantity, executedToDate)` (vienkārša
  atņemšana, var atgriezt negatīvu - UI parāda kā brīdinājumu, funkcija
  pati neierobežo), `createExecutionRecord(input)`.

**Reāla kļūda atrasta un izlabota, ieviešot jaunas sadaļas atbalstu:**
`excel/export.ts` `exportBoqToWorkbook` iepriekš saskaņoja katras sadaļas
"pašreizējo" un "bāzes" versiju PĒC MASĪVA INDEKSA (`state.sections[i]`),
pieņemot, ka sadaļu skaits/secība starp `state.sections` (bāze) un
`currentSections` (atvasinātais) vienmēr sakrīt - tas bija patiess TIKAI
tāpēc, ka pirms šīs sesijas VO nevarēja pievienot sadaļas. Ar jaunām
sadaļām šis pieņēmums lūst (jauna sadaļa nobīda visu, kas seko tai
masīvā, no pareizās bāzes atbilstības). Izlabots uz meklēšanu PĒC ID
(`Map` no `state.sections`), un jaunai sadaļai (bez bāzes atbilstības)
padots SINTĒTISKS tukšs bāzes sadaļas objekts (nevis `null`), lai "Bāzes
daudzums"/"Delta" kolonnas paliktu konsekventas visās eksportētajās
lapās. Pārbaudīts ar jaunu testu (`excel.test.ts`), kas tieši šo scenāriju
apstiprina (jauna sadaļa nesabojā esošo sadaļu bāzes saskaņojumu).

**Web UI:**
- `packages/web/src/components/VariationOrders.tsx` - sadaļas izvēlnē
  izmaiņas pievienošanas formā pirmā opcija "+ Jauna sadaļa" (nosaukums +
  tāmes numurs lauki, pozīcijas izvēlne paslēpta). Sadaļu/pozīciju
  izvēlnes balstās uz "preview" atvasinājumu (bāze + apstiprinātās VO +
  ŠĪS VO PAŠAS jau pievienotās izmaiņas, drošs pievienot bez dubultas
  piemērošanas, jo forma atveras tikai "proposed" VO), lai varētu izveidot
  sadaļu un TAJĀ PAŠĀ VO uzreiz tai pievienot pozīcijas. Katras VO izmaiņu
  tabulas nosaukumu izšķirtspēja (`resolveSectionName`) tagad pareizi
  parāda jaunu sadaļu nosaukumus, arī ja VO vēl "proposed" (izmantojot šīs
  VO pašas preview atvasinājumu, nevis tikai globālo apstiprināto stāvokli).
  Jauna izvēloties esošu pozīciju: informācijas rinda "Pašreizējais
  daudzums / Izpildīts līdz šim / Pieejamais atlikums" un brīdinājuma
  teksts, ja izmaiņa samazinātu apjomu zem jau izpildītā.
- `packages/web/src/components/ExecutionRecords.tsx` (jauns fails) -
  "Izpildes akti" cilnes saturs: jauna akta forma (periods/datums/
  apstiprinātājs) + pa sadaļām (tāpat kā "Tāme" cilne) tabula ar Nr./
  Nosaukums/Mērv./Pašreizējais/Izpildīts līdz šim/Šajā periodā (ievade)/
  Atlikums uz nākamo periodu (dzīvi pārrēķināts); rindas ar atlikums < 0
  vizuāli izceltas. Zem tam aktu vēstures tabula. NAV virtualizēta (skat.
  CLAUDE.md zināmais ierobežojums).
- `packages/web/src/components/ProjectEditor.tsx` - trešā cilne "Izpildes
  akti" (rāda tikai pēc bāzes iesaldēšanas, tāpat kā "Izmaiņas (VO)").
- `packages/web/src/App.css` - jauni stili (`.vo-change-new-section`,
  `.vo-remaining-info`, `.vo-executed-warning`, `.execution-*`).

**Testi:** `packages/core/test/variationOrders.test.ts` - 3 jauni testi
(jaunas tukšas sadaļas izveide, pozīcijas pievienošana tajā pašā VO
izveidotai sadaļai, `diffAgainstBaseline` pareizi parāda jaunas sadaļas
pozīcijas). `test/executionRecords.test.ts` (jauns fails, 6 testi) -
`computeExecutedToDate`, `computeRemainingQuantity` (arī negatīvs
gadījums), `createExecutionRecord`. `test/storage.test.ts` - 2 jauni
migrācijas testi (v6->v7 defaulti/`newSection: null` atpakaļaizpilde uz
esošām izmaiņām, un jau iestatītu vērtību saglabāšana). `test/excel.test.ts`
- 1 jauns tests (jauna sadaļa caur VO renderējas kā sava lapa, katra
pozīcija ar "JAUNS" bāzes kolonnā, BEZ esošo sadaļu bāzes saskaņojuma
salaušanas - tieši pārbauda iepriekš minēto kļūdu). Kopā **82/82 core
testi zaļi** (70 + 12 jauni).

**Manuāla pārbaude (Playwright, reāls Chromium):** izveidots projekts ar
sadaļu/pozīciju, apstiprināta bāze, izveidota VO ar DIVĀM secīgām
izmaiņām tajā pašā VO (jauna sadaļa "Papildu sadaļa" + jauna pozīcija
tajā) - izmaiņu tabula pareizi parādīja abas izmaiņas ar pareizu sadaļas
nosaukumu; apstiprinot VO, "Tāme" cilnē parādījās abas sadaļas ar pareizu
kopsavilkumu (1000€ + 60€ = 1060€ tiešās izmaksas). Izveidots izpildes
akts periodam "2026-01" ar izpildītu daudzumu 40 (no 100) vienai
pozīcijai - atlikums tabulā pareizi aprēķināts (60), vēstures tabulā
parādījās kopsavilkums. Jaunā VO izveides formā, izvēloties šo pašu
pozīciju, pareizi parādījās "Pieejamais atlikums: 60 m3"; ievadot -70
daudzuma korekciju (kas samazinātu apjomu uz 30, kas ir mazāk par
izpildītajiem 40), parādījās pareizs brīdinājuma teksts ar konkrētiem
skaitļiem. Konsolē nav kļūdu visā plūsmā (`page.on("console"/"pageerror")`
tukšs). `npm run build:web` veiksmīgs (~178KB galvenais bundle, `exceljs`
chunk nemainīgs).

**Definition of Done — pārbaudīts:**
- ✅ Core: 82/82 testi zaļi (12 jauni šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs.
- ✅ Manuāli pārbaudīts pilna plūsma reālā pārlūkā: jauna sadaļa caur VO
  (divas secīgas izmaiņas vienā VO), izpildes akta ievade un atlikuma
  aprēķins, atlikuma rādīšana un brīdinājums VO izveides formā.
- ✅ Migrācija (v6 bez jaunajiem laukiem -> v7 ar defaultiem, ieskaitot
  atpakaļaizpildi uz iepriekš saglabātām VO izmaiņām; v6 ar jau iestatītiem
  laukiem -> saglabāti) testēta.
- ✅ Reāla Excel eksporta kļūda (index-based sadaļu saskaņojums) atrasta un
  izlabota PIRMS lietotāja to būtu ieraudzījis reālā eksportā - pārbaudīta
  ar mērķtiecīgu testu.

**Papildinājums tajā pašā sesijā - izpildes akta ievades virtualizācija:**
lietotājs pieprasīja virtualizēt izpildes akta ievades tabulu lielam
projektam UZREIZ (nevis gaidīt reālu problēmu, atšķirībā no `ItemsTable`
vēstures Sesijā 12/13). Izveidots `packages/web/src/components/
ExecutionEntryTable.tsx` - lieto TIEŠI TO PAŠU virtualizācijas tehniku/
konstantes kā `ItemsTable.tsx` (scroll-based windowing, `ROW_HEIGHT`/
`OVERSCAN`, augšas/apakšas "spacer" rindas), atsevišķs komponents (nevis
`ItemsTable` paplašinājums), jo kolonnu nozīme atšķiras. `ExecutionRecords.tsx`
tagad renderē `<ExecutionEntryTable>` katrai sadaļai, nevis pilnu tabulu
tieši.

**Manuāli pārbaudīts (Playwright):** sintētisks 300 pozīciju projekts
ievadīts tieši IndexedDB (apejot UI, ātrāk par 300 "+ Pozīcija" klikšķiem) -
DOM renderē tikai ~31 rindu (nevis 300), ritinot mainās redzamās rindas
(pirmā redzamā rinda "1" -> "83"), ievadot daudzumu konkrētā redzamā rindā
("Pozīcija 84"), "Atlikums" pareizi pārrēķinās (100 - 30 = 70), un
saglabātais akts vēsturē satur pareizo kopējo summu (30). Core testi
(82/82), typecheck un `vite build` (abi tīri) palaisti pēc šī papildinājuma
bez izmaiņām nepieciešamības.

## Sesija 20: Izpildes akti Excel eksportā + reāla VELVE faila pārbaude — ✅ pabeigts

**Uzdevums:** kandidāts #1 no Sesijas 19 atlikušā saraksta (Izpildes akti
Excel eksportā) UN kandidāts #5 (pilna VO + izpildes aktu plūsma pret reālo
53-lapu VELVE failu) — abus lietotājs apstiprināja tieši sesijas sākumā, pēc
kandidātu saraksta izklāsta (skat. CLAUDE.md/PROGRESS.md prasību neko
neizvēlēties bez jautāšanas).

**Lēmumi (apstiprināti ar lietotāju, jautāti tieši pirms ieviešanas):**
- **Eksporta apjoms:** ABAS daļas — sadaļu lapām jaunas "Izpildīts"/
  "Atlikums" kolonnas UN atsevišķa "IZPILDES AKTI" reģistra darblapa,
  simetriski ar jau esošo VO/"IZMAIŅAS" pieeju (nevis tikai viena no tām).
- **Naudas vērtība reģistrā:** rādīt EUR summu par periodu (izpildītais
  daudzums × pozīcijas vienības izmaksa, summēts NEATKARĪGI no
  mērvienības), nevis tikai pozīciju skaitu bez naudas summas.

**Implementēts** (tikai `packages/core`, `packages/web` netika skarts —
šis ir tikai eksporta paplašinājums, ne UI): skat. CLAUDE.md "Izpildes akti
Excel eksportā (Sesija 20)" pilnu tehnisko aprakstu — divas jaunas core
funkcijas (`computeExecutionRecordValue`, `computeExecutionOverview`),
jaunas "Izpildīts"/"Atlikums" kolonnas sadaļu lapās (`EXECUTION_COLUMNS`,
stingri aiz VO kolonnām), jauna "IZPILDES AKTI" darblapa
(`writeExecutionRecordsSheet`).

**Manuāli pārbaudīts (sintētisks projekts)** ar pagaidu vitest skriptu, kas
rakstīja reālu `.xlsx` uz disku (izdzēsts pēc lietošanas) un pārbaudīts ar
`openpyxl` — divi izpildes akti pret VO-koriģētu sadaļu, visi skaitļi
(kumulatīvais izpildītais, atlikums, akta EUR vērtība, pārskata tabula)
sakrita ar roku rēķinātu.

**Manuāli pārbaudīts arī pret REĀLO 53-lapu/12876 pozīciju VELVE failu**
(tas pats fails, kas Sesijās 12/13/17 — lietotājs to pievienoja no jauna
šai sesijai). Pagaidu vitest skripts (izdzēsts pēc lietošanas, tāpat kā
iepriekšējo sesiju konvencija): imports -> bāzes iesaldēšana -> viena VO ar
VISIEM izmaiņu veidiem vienlaicīgi (daudzuma korekcija +10 reālai pozīcijai,
esošas pozīcijas izslēgšana, jauna sadaļa, jauna pozīcija tajā) -> divi
izpildes akti (janvāris/februāris) pret VO-koriģēto stāvokli -> Excel
eksports -> `openpyxl` pārbaude uz ģenerētā faila:
- Imports: 47 sadaļas, 12876 pozīcijas, ~8.4s. `deriveCurrentSections`: ~2ms
  (nenozīmīgs pat 12876 pozīcijām). Eksports: ~4.5s, 1.6MB fails. Kopā pilna
  plūsma (imports+VO+akti+eksports, bez UI renderēšanas) ~13s — atbilst jau
  zināmajam Sesijas 12 raksturlielumam (imports/eksports paši ir dārgākā
  daļa, ne VO/izpildes aprēķini).
- **Rezultāts: 51 darblapa** (1 KOPSAVILKUMS + 47 reālās sadaļas + 1 jaunā
  VO sadaļa + 1 IZMAIŅAS + 1 IZPILDES AKTI) — pareizi.
- Reālas pozīcijas (DEM lapas 1. rinda) daudzums 600 (590 bāze + 10 VO),
  vienības izmaksa 21.87 (10.14+0.75+10.98) — Izpildīts=300, Atlikums=300
  (summa = 600, pareizi); reģistra akta vērtība 300×21.87=6561€ sakrita ar
  "IZPILDES AKTI" pārskata tabulu.
- Izslēgtā reālā pozīcija (DEM 2. rinda): Kopā-kolonnas pareizi nullētas
  (izslēgšanas efekts), bet Daudzums/Bāzes daudzums/Atlikums palika redzami
  atsaucei (293/293/293) — apstiprina, ka izslēgšana un izpildes uzskaite
  ir neatkarīgas, korekti mijiedarbojas.
- Jaunā VO sadaļa/pozīcija: "JAUNS"/Delta=5 (VO kolonnas) UN
  Izpildīts=2/Atlikums=3 (izpildes kolonnas) parādījās PAREIZI VIENĀ un tajā
  pašā lapā/rindā — apstiprina, ka abas kolonnu grupas (VO un izpilde)
  strādā kopā arī jaunizveidotai (ne tikai bāzes) pozīcijai.
- Nekādu kļūdu/avāriju visā plūsmā, neskatoties uz pilnu reālo datu apjomu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 90/90 testi zaļi (82 + 8 jauni).
- ✅ Typecheck tīrs abās pakotnēs (`npx tsc --noEmit` core un web).
- ✅ Manuāli pārbaudīts reāls ģenerēts `.xlsx` fails ar `openpyxl`, gan
  sintētiskam, gan REĀLAM 53-lapu/12876 pozīciju VELVE failam.
- ✅ Reāla faila pilna VO + izpildes aktu plūsma pārbaudīta bez kļūdām, ar
  konkrētiem laika mērījumiem (imports ~8.4s, eksports ~4.5s).

## Sesija 21: Izpildes aktu Excel imports — ✅ pabeigts

**Uzdevums:** kandidāts #1 no Sesijas 20 atlikušā saraksta — lietotājs
apstiprināja un uzreiz iesniedza reālu izpildes akta failu pārbaudei
(PSKUS 2021-02 aktu, "Forma 3" tips, 54 darblapas).

**Lēmumi (apstiprināti ar lietotāju, jautāti tieši pirms ieviešanas):**
- Reāla izpildes akta paraugs pieejams pārbaudei šajā pašā sesijā (nevis
  atlikts uz vēlāku sesiju).
- Akta darblapu sasaiste ar projekta sadaļām: automātiski + priekšskata
  apstiprinājums (nevis vienmēr manuāla).
- Kolonnu noteikšana: sākotnēji izvēlēta fiksēta pozīcija pēc Forma Nr.2
  (skill dokumentētā karte) kā "v1 ieteicamā" pieeja.

**Reāla faila pārbaude atklāja, ka pēdējais lēmums nestrādā:** tieši tāpat
kā Sesijā 12 ar Līguma tāmes failu, arī reālajā izpildes akta failā
"Izpildīts atskaites periodā" kolonna atrodas DAŽĀDĀS pozīcijās dažādām
lapām (33 vai 29, atkarībā no tā, vai konkrētās lapas izmaksu sadalījumā ir
papildu "laika norma" apakšgrupa) — fiksēta pozīcija reāli nestrādātu 10+
no 27 datu lapām. Pāreja uz galvenes teksta noteikšanu (tā pati pieeja, kas
jau atrisināja identisku problēmu tāmes importam) bija TEHNISKI
NEPIECIEŠAMA, nevis vēlreiz jautājams dizaina lēmums — ieviesta bez
papildu apstiprinājuma cikla, dokumentēta CLAUDE.md kā šī sesijas
konstatējums.

**Negaidīts pozitīvs atklājums:** akta faila darblapu nosaukumi PRECĪZI
sakrīt ar Līguma tāmes faila darblapu nosaukumiem (abi faili ģenerēti no
tās pašas sistēmas) — sadaļu sasaiste varēja būt vienkārša precīza
nosaukuma sakritība, nevis izplūdusi meklēšana, kas sākotnēji tika
paredzēta kā nepieciešama.

**Implementēts:** skat. CLAUDE.md "Izpildes aktu Excel imports (Sesija 21)"
pilnu tehnisko aprakstu — `headerDetection.ts` paplašināts ar
`detectExecutionActColumns` (kopīga `scanHeaderColumns` palīgfunkcija ar
`detectImportColumns`), jauns `executionActImport.ts`
(`parseExecutionActWorkbook`/`parseExecutionActBuffer`,
`suggestSheetToSectionMapping`, `matchExecutionActToProject`), jauna UI
plūsma `ExecutionRecords.tsx` ("Importēt izpildes aktu (Excel)" poga ->
faila izvēle -> priekšskata tabula ar sadaļu sasaistes `<select>` katrai
akta lapai un dzīvi pārrēķinātiem sakrita/nesakrita skaitiem -> apstiprināt
-> jauns `ExecutionRecord`).

**Manuāli pārbaudīts pret REĀLO PSKUS 2021-02 failu** divos līmeņos:
1. Core līmenī (pret to pašu reālo VELVE tāmes failu, kas Sesijā 20):
   4 akta lapas ar izpildi šajā periodā (ZD/PAM/KARK_O CIKLS/ŪK, 36 rindas
   kopā), VISAS sasaistītas pareizi (0 nesakritušu) gan sadaļu, gan
   pozīciju līmenī.
2. UI līmenī (Playwright, reāls Chromium, `packages/web` dev serveris,
   projekts sagatavots tieši IndexedDB ar apzināti nepilnīgu sadaļu, lai
   pārbaudītu arī nesakritības ceļu): priekšskata tabula, dzīvā
   pārrēķināšana mainot `<select>`, brīdinājuma baneris, un gala akta
   izveide vēstures tabulā — visi skaitļi (rindu skaits, sakrita/nesakrita,
   summa) sakrita ar sagaidāmo, konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: 98/98 testi zaļi (90 + 8 jauni).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi, jaunais kods daļa no jau esošā lazy excel chunk'a).
- ✅ Manuāli pārbaudīts pret REĀLU izpildes akta failu core UN UI līmenī.
- ⚠️ Playwright tika instalēts tikai pagaidu pārbaudei un pēc tam noņemts
  (`packages/web/package.json`/lock atgriezti sākotnējā stāvoklī) — projekts
  Playwright kā pastāvīgu atkarību neiegūst.

## Sesija 22: Pastāvīgs atlikuma pārskats "Tāme" cilnē — ✅ pabeigts

**Uzdevums:** kandidāts #2 no Sesijas 21 atlikušā saraksta.

**Lēmums (apstiprināts ar lietotāju, jautāts tieši pirms ieviešanas):**
kandidāta apraksts pieļāva divus variantus — kolonnas esošajā "Tāme"
tabulā VAI atsevišķa "Atlikumi" cilne/skats. Lietotājs izvēlējās PIRMO
(kolonnas esošajā tabulā) — konsekventi ar to, kas jau tika pievienots
Excel eksportam Sesijā 20, vienkāršāk, izmanto jau esošo virtualizēto
tabulu.

**Implementēts:** skat. CLAUDE.md "Pastāvīgs atlikuma pārskats 'Tāme'
cilnē (Sesija 22)" pilnu tehnisko aprakstu — `ItemsTable.tsx` jauns
opcionāls `executionRecords` props, divas jaunas TIKAI LASĀMAS
"Izpildīts"/"Atlikums" kolonnas (redzamas TIKAI, ja projektam ir vismaz
viens izpildes akts — tas pats nosacījums, kas jau Excel eksportam),
pārsniegtā apjoma rindas iezīmētas ar to pašu `.over-executed` CSS klasi,
ko jau lietoja `ExecutionEntryTable.tsx`. Tikai `packages/web` mainīts —
`packages/core` aprēķinu funkcijas (`computeExecutedToDate`/
`computeRemainingQuantity`) jau bija pieejamas kopš Sesijas 19.

**Manuāli pārbaudīts (Playwright, reāls Chromium, ieskaitot
ekrānuzņēmumu):** divi sintētiski projekti — ar izpildes aktu (3
pozīcijas: daļēji izpildīta 40/100, pārsniegta 70/50, bez izpildes) un bez
tā. Kolonnas parādījās pareizajā vietā ar pareiziem skaitļiem, pārsniegtā
apjoma rinda vizuāli izcelta sarkani (apstiprināts arī ekrānuzņēmumā),
projektam bez izpildes aktiem kolonnas vispār neparādījās (backward
compatible). Konsolē nav kļūdu.

**Definition of Done — pārbaudīts:**
- ✅ Core: nemainīts, 98/98 testi joprojām zaļi.
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs, bundle izmēri
  praktiski nemainīgi.
- ✅ Manuāli pārbaudīts ar Playwright, ieskaitot vizuālu apstiprinājumu
  (ekrānuzņēmums) un backward compatibility pārbaudi.
- ⚠️ Playwright atkal tika instalēts tikai pagaidu pārbaudei un pēc tam
  noņemts (tāpat kā Sesijā 21) — projekts Playwright kā pastāvīgu atkarību
  neiegūst.

## Sesija 23: Izpildes aktu/VO anulēšana (korekcijas mehānisms) — ✅ pabeigts

**Uzdevums:** vienīgais atlikušais kandidāts no Sesijas 22 saraksta —
izpildes akti/VO pēc saglabāšanas nebija NEKĀDĀ VEIDĀ koriģējami (apzināta
audit-trail izvēle kopš Sesijas 18/19). Pirms ieviešanas PAJAUTĀTS
lietotājam (kā prasīts iepriekšējās sesijas ieteikumā) — apstiprināja
strādāt pie šī kandidāta.

**Lēmumi (apstiprināti ar lietotāju, jautāti tieši pirms ieviešanas):**
- **Apjoms:** gan izpildes akti, GAN jau apstiprinātas VO (ne tikai
  izpildes akti, kā bija PROGRESS.md piemērā) — tas pats korekcijas
  mehānisms abiem.
- **Mehānisms: anulēšana (voiding) + jauna, pareiza ieraksta izveide**,
  NEVIS tieša rediģēšana ar izmaiņu vēsturi UN NEVIS pilna
  rediģēšana/dzēšana bez pēdām (abas alternatīvas tika piedāvātas un
  noraidītas) — vecais akts/VO paliek redzams vēsturē ar anulēšanas
  atzīmi + iemeslu, izslēgts no aprēķina, lietotājs izveido jaunu, pareizu
  ierakstu. Pilns audit trail saglabājas (nekas fiziski dzēsts vai klusi
  pārrakstīts).

**Implementēts:** skat. CLAUDE.md "Izpildes aktu/VO anulēšana (Sesija 23)"
pilnu tehnisko aprakstu — `schemaVersion` `7 -> 8`
(`ExecutionRecord.voidedAt`/`voidedReason`, jauns `VariationOrderStatus`
"voided" + `VariationOrder.voidedReason`), jaunas core funkcijas
`voidExecutionRecord`/`voidVariationOrder` (abas met kļūdu uz nederīgu
ievadi — nav atrasts ieraksts, jau anulēts akts, vai VO statuss nav
"approved"), `computeExecutedToDate` izlaiž anulētos aktus (vienīgais
filtrēšanas punkts — propagējas automātiski uz `computeExecutionOverview`/
UI/Excel), VO filtrs pēc `status === "approved"` (jau esošs kopš
Sesijas 18) automātiski izslēdz anulētās VO bez papildu izmaiņām
atvasināšanas loģikā. UI (`VariationOrders.tsx`/`ExecutionRecords.tsx`)
abās vietās "Anulēt" poga + inline forma ar obligātu iemesla lauku
(konsekventi ar esošajām VO izmaiņu/akta formām, nevis `window.prompt()`).
Excel eksportā VO statuss "Anulēts" parādās jau esošajā "Statuss" kolonnā
(Sesija 18) bez izmaiņām; "IZPILDES AKTI" akta reģistram (Sesija 20)
pievienota jauna "Statuss" kolonna. Anulēšanas IEMESLS Excel failā apzināti
NAV atsevišķas kolonnas (paliek UI-only) — konsekventi ar jau dokumentēto
"Excel eksports ir daļēji zaudējošs" lēmumu.

**Zināms ierobežojums (dokumentēts, nav bloķēts):** ja cita apstiprināta VO
atsaucas uz pozīciju/sadaļu, ko izveidoja tieši anulējamā VO
(self-referencing id), pēc anulēšanas tā vēlākā izmaiņa klusi tiks
izlaista (jau esošais "nekonsekventi dati" ceļš no Sesijas 18, ne jauna
kļūda) — UI parāda brīdinājuma tekstu anulēšanas formā PIRMS
apstiprināšanas, konsekventi ar projekta "brīdinājums, nevis bloķēšana"
principu (skat. Sesija 19 pārsniegtā apjoma brīdinājumu).

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma no nulles,
ieskaitot lapas pārlādi persistences pārbaudei):** projekts ar sadaļu/
pozīciju (daudzums 10), bāze iesaldēta; VO ar daudzuma korekciju +5
apstiprināta (daudzums 15 "Tāme" cilnē); VO anulēta ar iemeslu — daudzums
atgriezās uz 10, statusa žetons "Anulēts", iemesls redzams; izpildes akts
ar izpildītu daudzumu 4 (Izpildīts=4/Atlikums=6); akts anulēts ar iemeslu —
Izpildīts=0/Atlikums=10 (pareizi izslēgts), vēstures tabulā "Anulēts
(iemesls)"; PĒC LAPAS PĀRLĀDES abi anulēšanas stāvokļi saglabājās pareizi
(IndexedDB round-trip caur jauno v8 shēmu). Konsolē nav kļūdu. Playwright
atkal instalēts tikai pagaidu pārbaudei (`npm install --no-save
playwright-core`, git status tīrs pēc noņemšanas) un pēc tam noņemts,
tāpat kā Sesijās 20-22.

**Definition of Done — pārbaudīts:**
- ✅ Core: 108/108 testi zaļi (98 + 10 jauni: `voidExecutionRecord`/
  `voidVariationOrder` unit testi, `computeExecutedToDate` anulēta akta
  izslēgšana, migrācijas testi v7->v8 defaultiem UN jau-klātesošu vērtību
  saglabāšanai; divi jau esoši v5/v6 migrācijas testi papildināti ar
  jaunajiem laukiem, ko tagad pieskaita pilnā migrāciju ķēdē).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi — jaunais kods tikai render loģikā/dažas jaunas
  core funkcijas, nav jaunas atkarības).
- ✅ Manuāli pārbaudīts ar Playwright — pilna VO anulēšanas UN izpildes
  akta anulēšanas plūsma, atkārtoto aprēķinu pareizība, statusa/iemesla
  persistence pēc lapas pārlādes, konsolē nav kļūdu.

## Sesija 24: Pozīciju numerācija + VO izmaiņu vēsture "Tāme" cilnē — ✅ pabeigts

Lietotāja manuālā smoke testa (PR #1, Sesijas 23 anulēšanas funkcija)
laikā saņemts feedback ārpus tā testa apjoma, bet tieši uz esošo VO
funkcionalitāti: (1) jaunas sadaļas izveide caur VO ir grūti atrodama
(atbildēts sarunā, funkcionalitāte jau eksistēja kopš Sesijas 19 - nav
koda izmaiņu), (2) jāredz izmaksu izmaiņa (ne tikai daudzuma) attiecībā
pret bāzi, secīgi pa VO, lai izsekotu, kura VO ko mainīja, (3) pozīciju
tabulā jāparādās kolonnām "Daudzums VO nr.X" un atvasinātai N.p.k.
numerācijai (burta piedēklis esošai pozīcijai, jauns unikāls numurs jaunai
pozīcijai esošā sadaļā).

**Lēmumi (apstiprināti ar lietotāju pirms ieviešanas, EnterPlanMode +
AskUserQuestion):**
- VO delta kolonnas rāda TIKAI šīs VO izraisīto izmaiņu (tukšs/"-", ja VO
  šo pozīciju nemainīja) - NE kumulatīvu rezultējošo vērtību.
- Burta piedēklis (a/b/c...) ir POZĪCIJAS PAŠAS revīzijas kārtas
  skaitītājs (cik reižu to KOPĀ mainījušas VO), NEVIS konkrētās VO
  numurs.
- Jaunai pozīcijai esošā sadaļā: numurs = nākamais brīvais cipars sadaļas
  numerācijā + VO atzīme, piem. "21 (VO-2)".
- Izmaksu izmaiņa pa VO ir ATSEVIŠĶA kolonna ("VO-X ΔEUR") blakus katrai
  daudzuma kolonnai ("VO-X ΔDaudz."), nevis viena kopēja summa.
- Apzināti ĀRPUS apjoma: Excel eksports NEMAINĀS (paliek sava "Bāzes
  daudzums"/"Delta" shēma no Sesijas 18); `VariationOrders.tsx` VO kartes
  izmaiņu tabula nemainās - jaunā numerācija/kolonnas ir TIKAI
  `ItemsTable.tsx` ("Tāme" cilnē).

**Implementēts:** jauna core funkcija
`computeItemCodesAndHistory(baseline, variationOrders)`
(`variationOrders/deriveCurrentState.ts`, eksportēta arī no `src/index.ts`)
- atkārtoti lieto jau esošo privāto `applyChange`/`cloneSections` (nedublē
  daudzuma/izslēgšanas mutācijas loģiku), atgriež
  `Map<itemId, {displayCode, impacts}>`: `displayCode` atvasināts pēc
  pozīcijas izcelsmes (bāzes kods + revīzijas burts / auto-numurs + VO
  atzīme jaunai pozīcijai esošā sadaļā / manuāli ievadītais kods jaunā
  VO-sadaļā - nemainās), `impacts[]` katras padotās VO izolētā ietekme
  (daudzums + tiešās izmaksas, `isNew` karogs jaunām pozīcijām). Saucējs
  izvēlas, kuras VO padot (parasti tikai `approved`, tāpat kā
  `deriveCurrentSections`).

`ItemsTable.tsx` jaunas opcionālas propas `itemDisplay`/`voColumns` - kad
padotas, "Nr." šūna rāda atvasināto `displayCode` (tajā pašā disabled
`<input>`, nemaina esošo "inputs disabled, not hidden" konvenciju), un
katrai relevantajai VO pievienojas divas kolonnas TABULAS VIDŪ (aiz
"Mehānismi", pirms "Izpildīts"/"Atlikums") ar šīs VO deltu (vai "-", ja
nav ietekmes; "JAUNS: N" jaunai pozīcijai, tas pats marķieris, ko jau
lieto Excel eksporta "Bāzes daudzums" kolonna). Jauna `.code-input` CSS
klase (`min-width: 6rem`) - bez tās garākie atvasinātie kodi (piem.
"21 (VO-2)") vizuāli apgriezās šaurajā "Nr." kolonnā (atklāts manuālajā
pārbaudē, izlabots). `ProjectEditor.tsx` aprēķina `itemDisplay` (tikai
pēc bāzes iesaldēšanas) un per-sadaļa `voColumns` (filtrē
`approvedVariationOrders` pēc tā, vai kāda šīs sadaļas pozīcija satur
impact ar attiecīgo `voId` - secība garantēta no autoritatīvā VO masīva).

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma no nulles,
ieskaitot lapas pārlādi persistences pārbaudei un ekrānuzņēmumu vizuālai
pārbaudei):** projekts ar 1 pozīciju (daudzums 10, vienības izmaksa 6€) -
VO-1 (+5, apstiprināta), VO-2 (pievieno jaunu pozīciju TAJĀ PAŠĀ sadaļā,
apstiprināta), VO-3 (+3 TAI PAŠAI bāzes pozīcijai, apstiprināta). "Tāme"
cilnē: bāzes pozīcija -> "1.1b" (divas revīzijas: VO-1 un VO-3, VO-2
neietekmēja - "b" pareizi izlaiž "VO-2 burtu", jo tas ir PAŠAS pozīcijas
revīziju skaitītājs, ne VO numurs); VO-1 kolonna +5/30.00€, VO-2 kolonna
"-"/"-" (nemainīja), VO-3 kolonna +3/18.00€; jaunā pozīcija -> "2 (VO-2)"
(sadaļā bija 1 bāzes pozīcija, tāpēc nākamais numurs "2"; manuāli ievadītais
"Kods" lauks pareizi IGNORĒTS displayCode aprēķinā), VO-2 kolonnā "JAUNS: 3"/
"9.00 €" (3×(1+1+1)), VO-1/VO-3 kolonnās "-". PĒC LAPAS PĀRLĀDES abi
displayCode saglabājās identiski. REGRESIJA pārbaudīta ar otru projektu
BEZ jebkādas VO - gan pirms, gan PĒC bāzes iesaldēšanas galvene identiska
oriģinālajai (nav VO kolonnu), "Nr." šūna rāda/rediģē to pašu `item.code`
kā iepriekš. Konsolē nav kļūdu nevienā solī. Playwright atkal instalēts
tikai pagaidu pārbaudei (`npm install --no-save playwright-core`, git
status tīrs pēc noņemšanas) un pēc tam noņemts, tāpat kā iepriekšējās
sesijās.

**Definition of Done — pārbaudīts:**
- ✅ Core: 115/115 testi zaļi (108 + 7 jauni `computeItemCodesAndHistory`
  testi - nemainīta pozīcija, viena/divas revīzijas, jauna pozīcija esošā/
  jaunā sadaļā, no-op izmaiņa nemaina burtu, saucēja filtrēta VO neietekmē).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi - ~189KB galvenais/~954KB excel chunk, nav jaunas
  atkarības).
- ✅ Manuāli pārbaudīts ar Playwright - pilna VO numerācijas/vēstures
  plūsma, persistence pēc lapas pārlādes, regresija projektam bez VO,
  konsolē nav kļūdu.

## Sesija 25: Bilingvāla (LV/EN) C2-10 tāmes faila imports — ✅ pabeigts (Soļi 1+2)

**Uzdevums:** lietotājs iesniedza jaunu reālu tāmes failu (C2-10, "Bill of
Quantities", 67 lapas, LV/EN divvalodu formāts) — "pārbaudi vai tā korekti
uzlādējas un sader ar jau uzprogrammēto, ja kas jāpielabo, tad izstrādā
plānu un pakāpeniski veiksim precizējumus". Vispirms izpētīts konkrētais
faila stāvoklis (nevis pieņemts uzdevums bez apstiprinājuma, skat.
PROGRESS.md ieteikumu iepriekšējā sesijā) — lietotājs apstiprināja sākt ar
Soli 1 (skat. zemāk plānu).

**Atklājums:** imports atgrieza **0 sadaļu, 0 pozīciju** — pilnīga
neveiksme. Cēlonis: šis fails ir divvalodu — VISAS galvenes, ieskaitot
rindas numura kolonnu, ir "Latviski/English" formātā: "N.p.k./No", NEVIS
"Nr. p.k." kā visos iepriekš redzētajos failos (trūkst "r"). `nrPk`
matcheris bija vienīgais no 7 laukiem, kas joprojām lietoja STINGRU
sakritību (`key === "nrpk"`) tā vietā, lai lietotu `.includes(...)`, tāpēc
nekad nesakrita. Pilns tehniskais apraksts un labojums:
`tames-modulis/CLAUDE.md` "Bilingvāla (LV/EN) tāmes faila imports (Sesija
25)".

**Implementēts (`packages/core`, `packages/web` netika skarts):**
- `src/excel/headerDetection.ts` — `nrPk` matcheris (abos, `FIELD_MATCHERS`
  UN `EXECUTION_ACT_FIELD_MATCHERS`) pārrakstīts uz
  `key.startsWith("nrpk") || key.startsWith("npk")`.
- `src/excel/columns.ts` — jauna `isKnownUnit(raw)` funkcija (eksportēta arī
  no `excel/index.ts`), atbalsta divvalodu "/"-atdalītas mērvienības
  ("vieta/place") bez riska jau esošajam `maš/st` (pilna virkne pārbaudīta
  VISPIRMS). `KNOWN_UNITS` papildināts ar `mēn`, `vietas`, `ievads`.
  `normalizeUnit` papildus sabrūk iekļautos rindu pārtraukumus vienā
  atstarpē.
- `src/excel/import.ts`, `src/excel/executionActImport.ts` — abas
  izsaukuma vietas (`KNOWN_UNITS.has(normalizeUnit(...))`) aizstātas ar
  `isKnownUnit(...)`.

**Testi:** `test/excel.test.ts` — 7 jauni (`isKnownUnit` bilingvālam
gadījumam/`maš/st` regresijai/iekļautam rindu pārtraukumam/nezināmai
vērtībai, `normalizeUnit` rindu pārtraukuma sabrukšanai, pilns
`importBoqFromWorkbook` tests ar "N.p.k./No" galveni + "vieta/place"
mērvienību, reproducējot tieši reālā faila struktūru).
`test/executionActImport.test.ts` — 1 jauns (`detectExecutionActColumns` ar
"N.p.k./No" galveni). Kopā **123/123 core testi zaļi** (115 + 8 jauni).

**Manuāli pārbaudīts pret REĀLO C2-10 failu** (pagaidu skripti, izdzēsti pēc
lietošanas): pēc labojuma **63 no 67 lapām atpazītas**, **3708 pozīcijas**
importētas. 4 lapas paliek neatpazītas — `KO`/`KS` ir leģitīmas
kopsavilkuma lapas (tāpat kā mūsu pašu `KOPSAVILKUMS`), pareizi izlaistas;
`A General requirements`/`B Day works` lieto PILNĪBĀ ANGĻU (ne divvalodu)
galvenes, un `B Day works` arī pavisam citu kolonnu struktūru (nav darba
algas/materiālu/mehānismu sadalījuma, tikai Likme×Daudzums=Summa) — ārpus
šī labojuma apjoma, skat. zemāk "Solis 2".

**2-10 lapas (lietotāja konkrētais projekts) aprēķinātā tiešo izmaksu
summa (`calculateSectionDirectTotal`, izsaukta reālajam importētajam
stāvoklim, ne tikai sintētiskam testam) sakrita ar pašas lapas "Izmaksas
kopā" rindu LĪDZ SANTĪMAM** (53500.10999999999 abās) — tā pati pārbaudes
metodoloģija, kas Sesijā 12 (DEM lapa) un Sesijā 20. Pilna projekta (63
sadaļas) aprēķinātā tiešo izmaksu summa: 25766510.57 €.

**Definition of Done — Solis 1 pārbaudīts:**
- ✅ Core: 123/123 testi zaļi (8 jauni šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ Manuāli pārbaudīts pret REĀLO C2-10 failu — 0/67 -> 63/67 lapas, 0 ->
  3708 pozīcijas, 2-10 lapas summa sakrīt ar avota faila summu līdz
  santīmam.
- ✅ Manuālā UI pārbaude (Playwright, reāls imports caur pārlūka plūsmu, ne
  tikai core funkciju tiešs izsaukums) veikta pēc lietotāja apstiprinājuma
  Solim 2 — skat. zemāk, abi soļi pārbaudīti vienā UI plūsmā.

**Solis 2: "A General requirements"/"B Day works" — ✅ pabeigts.**
Izpēte atklāja, ka abas paliekošās nesaprastās lapas ir strukturāli
ATŠĶIRĪGAS cita no citas (skat. CLAUDE.md "'A General requirements'/'B Day
works' — angļu-only lapas (Solis 2)" pilnu tehnisko aprakstu). Lietotājs
apstiprināja: "A" ir izcenota un iekļauta izmaksu kopsavilkumā, tāpēc
jāiekļauj kopējā tāmju struktūrā; "B" ir FIDIC dienas darbu uzskaitījums,
augšupielādēts informācijai — ja radīsies papildu darbi, būs pieejama
informācija par saskaņotām vienības cenām.

**Implementēts:**
- `headerDetection.ts` `FIELD_MATCHERS` — katram no 7 laukiem pievienota
  angļu ekvivalenta pārbaude (disjunkcija ar jau esošo LV/bilingvālo), lai
  atpazītu "A General requirements" (pilnībā angļu galvenes: No./Name of
  construction work/Unit/Quantity/Salary/Materials/Mechanisms).
  `KNOWN_UNITS` papildināts ar `item`.
- `headerDetection.ts` jauns `detectDayworksColumns` (5 lauki: nrPk/name/
  unit/quantity/rate) FIDIC dienas darbu likmju lapas ("B Day works")
  formātam — VIENA "Rate (euro/h)" kolonna, nevis 3-way sadalījums, tāpēc
  standarta `detectImportColumns` to VIENMĒR pareizi noraida (signāls
  mēģināt šo fallback ceļu). `KNOWN_UNITS` papildināts ar `hr`, `bag`.
- `excel/dayworksImport.ts` (jauns fails) — `parseDayworksItems`: katra
  rinda -> `BoqItem` ar `daudzums = 0` (nekas nav reāli pasūtīts, tāpēc
  nekad neietekmē kopsummu — precīzi atbilst faila pašas "Rate Only"
  semantikai), VIENĪGĀ likme ievietota pareizajā no 3 izmaksu laukiem
  atkarībā no lapas PAŠAS brīvā teksta sadaļu virsrakstiem (LABOUR ON SITE/
  MATERIAL DELIVERED TO SITE/PLANT HIRE) — vienkāršs secīgs "pašreizējās
  kategorijas" stāvokļa automāts.
- `import.ts` `importBoqFromWorkbook` — kad `detectImportColumns` atgriež
  `null`, pirms lapas izlaišanas mēģina `detectDayworksColumns` kā fallback.

**Testi:** `test/excel.test.ts` — 2 jauni (angļu-only "A" galvenes
atpazīšana, `importBoqFromWorkbook` fallback uz dayworks formātu).
`test/dayworksImport.test.ts` (jauns fails, 5 testi) — kolonnu noteikšana,
kategoriju sabucketošana (labour/material/plant), "%" uzcenojuma rindu
izlaišana. Kopā **130/130 core testi zaļi** (123 + 7 jauni).

**Manuāli pārbaudīts pret REĀLO C2-10 failu** (pagaidu skripti, izdzēsti
pēc lietošanas): **65 no 67 lapām atpazītas** (`KO`/`KS` paliek pareizi
izlaistas kā leģitīmas kopsavilkuma lapas). "A General requirements": 104
pozīcijas, kopsumma 1673637.22 € (0.08€ starpība no avota 1673637.30 € —
nenozīmīga, tāda paša lieluma kā jau pieņemtā avota faila noapaļošanas
starpība, skat. Sesija 12); pārbaudīts arī, ka lapas "COLLECTION"/"Total
Brought Forward from Page No." starprindu kopsavilkuma tabula NETIEK
importēta (nav "item" mērvienības nevienā tās rindā) — bez tā šīs rindas
dubultotu kopsummu. "B Day works": 39 pozīcijas, VISAS `daudzums=0` ar
pareizi sabucketotu likmi (piem. "Semi-skilled labourers" -> Darba
alga=19€/h, "Cement" -> Materiāli=10€/bag, "Piling rig" -> Mehānismi=197€/h),
kopsumma 0.00 € (pareizi, "Rate Only" semantika). Projekta KOPĒJĀ tiešo
izmaksu summa: 27440147.79 € (25766510.57 no 63 disciplīnu lapām +
1673637.22 no "A", "B" devums 0).

**Pilna UI plūsma pārbaudīta reālā pārlūkā (Playwright, reāls Chromium):**
imports caur `packages/web` dev serveri (nevis tikai core funkciju tiešs
izsaukums) — 65 sadaļas (`Dzēst sadaļu` pogu skaits), projekta kopsavilkums
UI precīzi sakrita ar core aprēķinu (Tiešās izmaksas: 27440147.79 €),
konsolē NAV kļūdu ne importa, ne "Saglabāt" laikā.

**Definition of Done — Solis 2 pārbaudīts:**
- ✅ Core: 130/130 testi zaļi (7 jauni šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs.
- ✅ Manuāli pārbaudīts pret REĀLO C2-10 failu, gan core funkciju tiešā
  izsaukumā, gan REĀLĀ pārlūkā (Playwright, imports+saglabāšana) — 65/67
  lapas, pareiza kopsumma, konsolē nav kļūdu.
- ✅ Abi Sesijas 25 soļi tagad pabeigti — C2-10 fails importējas pilnībā
  pareizi (izņemot `KO`/`KS` kopsavilkuma lapas, kas leģitīmi paliek
  izlaistas, jo tajās nav pozīciju datu).

## Sesija 26: Pasūtītāja rezerve — ✅ pabeigts

**Uzdevums:** lietotāja Sesijas 25 beigās ierosinātā ideja — VO ceļā
izslēgto/samazināto pozīciju ietaupītā vērtība šobrīd vienkārši pazūd; vajag
mehānismu, kas to uzkrāj atsevišķi ("Pasūtītāja rezerve"), lai vēlāk, kad
rodas jauni papildu darbi, varētu redzēt/izmantot šo uzkrājumu segšanai.

**Precizējoši jautājumi UZDOTI LIETOTĀJAM PIRMS ieviešanas** (`AskUserQuestion`,
4 jautājumi, visi ieteicamie varianti apstiprināti) — lēmumi:
- Avots: ABAS izmaiņas (pilna izslēgšana UN daudzuma samazinājums) papildina
  rezervi.
- Tāmes gala summu (Pavisam/KOPĀ AR PVN) rezerve NEIETEKMĒ — tikai
  informatīvs pārskats blakus.
- Izmantošana ir MANUĀLA/skaidra darbība (lietotājs katrai VO ar pozitīvu
  ietekmi var atzīmēt konkrētu summu "segt no rezerves"), NEVIS automātiska.
- UI integrēts esošajā "Izmaiņas (VO)" cilnē, nevis jauna cilne.

**Implementēts:** skat. CLAUDE.md "Pasūtītāja rezerve (Sesija 26)" pilnu
tehnisko aprakstu — `schemaVersion` `8 -> 9` (`VariationOrder.
reserveDrawdown: number`, VIENĪGAIS jaunais tieši ievadāmais lauks, pati
uzkrāšana paliek pilnībā atvasināta), jauna `computeReserveBalance`
funkcija (`variationOrders/deriveCurrentState.ts`, atkārtoti izmanto
`computeVariationOrderDirectTotalImpact`), UI (`VariationOrders.tsx`)
katrai VO ar pozitīvu ietekmi rāda drawdown ievades lauku + divi neatkarīgi
brīdinājumi (pārsniedz atlikumu/pārsniedz pašas VO ietekmi, apzināti nav
klampēti, "brīdinājums, ne bloķēšana" princips), un jauns "Pasūtītāja
rezerve" kopsavilkums/reģistrs zem VO karšu saraksta.

**Testi:** `test/variationOrders.test.ts` — 6 jauni `computeReserveBalance`
testi (uzkrāšana, drawdown lietošana, nav klampēts, ignorē drawdown uz
savings VO, izlaiž proposed/rejected/voided VO, tukšs saraksts).
`test/storage.test.ts` — 2 jauni migrācijas testi (v8->v9 defaulti/
saglabāšana), 1 esošs papildināts (v5->current tests arī jauno lauku).
Kopā **138/138 core testi zaļi** (130 + 8 jauni).

**Manuāli pārbaudīts (Playwright, reāls Chromium, pilna plūsma, projekts
sagatavots tieši IndexedDB, ieskaitot lapas pārlādi persistences
pārbaudei):** bāzes pozīcija (60€) → VO-1 izslēdz pilnībā, apstiprināta →
rezerve "Uzkrāts: 60.00 € · Atlikums: 60.00 €"; VO-2 pievieno jaunu
pozīciju (20€ ietekme, vēl proposed) → "Segt no Pasūtītāja rezerves" lauks
ar pareizu "Pieejamais atlikums šobrīd: 60.00 €"; iestatīts drawdown=20,
apstiprināts → rezerve "Uzkrāts: 60.00 € · Izmantots: 20.00 € · Atlikums:
40.00 €", reģistra tabula pareiza. PĒC LAPAS PĀRLĀDES skaitļi saglabājās
identiski. Brīdinājumu UI pārbaudīts atsevišķi (VO ar 4€ ietekmi un
drawdown=100 parādīja ABUS brīdinājumus pareizi). Konsolē nav kļūdu
nevienā solī.

**Definition of Done — pārbaudīts:**
- ✅ Core: 138/138 testi zaļi (8 jauni šai funkcionalitātei).
- ✅ Typecheck tīrs abās pakotnēs, `vite build` veiksmīgs (bundle izmēri
  praktiski nemainīgi).
- ✅ Manuāli pārbaudīts ar Playwright — pilna uzkrāšanas/izmantošanas
  plūsma, persistence pēc lapas pārlādes, brīdinājumu UI, konsolē nav
  kļūdu.
- ✅ Migrācija (v8 bez `reserveDrawdown` -> v9 ar noklusējumu 0; v8 ar jau
  iestatītu vērtību -> saglabāta) testēta.
- ⚠️ Apzināti ārpus apjoma (lietotājs apstiprināja "UI vispirms"): Excel
  eksports NEMAINĀS — rezerves reģistrs/kopsavilkums pagaidām tikai web UI.

## 🔜 IESPĒJAMIE NĀKAMIE SOĻI (kandidātu saraksts, NAV apstiprināts uzdevums)

**Sesijas 25 un 26 pabeigtas.** Šobrīd nav zināma neapstiprināta kandidāta.

**Apzināti ārpus Sesijas 26 apjoma (varētu būt nākamais kandidāts, JĀPAJAUTĀ
lietotājam, ne jāpieņem):** Pasūtītāja rezerves reģistrs/kopsavilkums Excel
eksportā (šobrīd tikai web UI).

**Joprojām apzināti ārpus apjoma (no Sesijas 24):** Excel eksporta
paplašināšana ar tām pašām atvasinātās numerācijas/VO-delta kolonnām, ko
Sesija 24 pievienoja TIKAI web UI; `VariationOrders.tsx` VO kartes izmaiņu
tabulas atjaunināšana, lai arī tā rādītu atvasināto displayCode.

**Ieteikums nākamajai sesijai:** izlasīt šo PROGRESS.md ierakstu (īpaši
Sesijas 18-26) un CLAUDE.md pilnībā, tad PAJAUTĀT lietotājam, vai ir kāds
konkrēts nākamais uzdevums - nav gatava kandidātu saraksta, ko piedāvāt
bez papildu konteksta no lietotāja.
