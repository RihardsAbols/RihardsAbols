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

## 🔜 NĀKAMAIS UZDEVUMS

Nav vienota lēmuma, kas ir nākamais solis — jāapstiprina ar lietotāju pirms
sākšanas. Iespējamie kandidāti:

1. **UI veiktspēja ar lielu datu apjomu** — tagad apstiprināts reāls
   problēma (~26.5s importam+renderam ar 12876 pozīcijām). Iespējamie
   risinājumi: rindu/sadaļu virtualizācija, "lazy" sadaļu paplašināšana
   (sākumā sakļautas), vai lapošana pa sadaļām.
2. **"Importēt esošā projektā" (papildināt/pārrakstīt)** — pašreiz imports
   vienmēr izveido jaunu projektu; ja vajag arī iespēju ievest `.xlsx`
   datus jau atvērtā projektā, jāapstiprina papildināšanas/pārrakstīšanas
   semantika.
3. **Diskonti/atlaides vai sarežģītāka PVN loģika** (piem. dažādas PVN
   likmes pa pozīcijām), ja tas ir reāls prasību lauks.
4. **Favicon** — joprojām neaizskarts, nekritiski.

Pirms jebkura no šiem — apstiprināt ar lietotāju, kurš tieši ir prioritārs.
