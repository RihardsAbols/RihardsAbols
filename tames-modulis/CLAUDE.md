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
    `exportBoqToBuffer` atgriež `ArrayBuffer` (nevis Node `Buffer`), lai
    strādātu arī brauzerī.
  - `import.ts` — `importBoqFromWorkbook`/`importBoqFromBuffer`: datu rindas
    atpazīst pēc mērvienības kolonnas (nevis fiksētas rindas numura), tāpēc
    var lasīt gan pašu ģenerētus failus, gan reālus Līguma tāmes failus.
    Atvasinātās kolonnas (Vienības kopā, Kopā *) netiek lasītas atpakaļ —
    tās vienmēr pārrēķina `calculations/boq.ts`, lai nebūtu divu patiesības
    avotu.
- `test/` — vitest testi (glabāšanas round-trip, migrāciju stubs, aprēķini,
  Excel eksports/imports round-trip un imports no "svešas" darblapas,
  `ProjectService` CRUD pret in-memory `StorageAdapter`).

### Node vs. universāls kods

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

## Struktūra (`packages/web`)

- `src/storage/IndexedDbStorageAdapter.ts` — `StorageAdapter` implementācija
  ar IndexedDB (viens object store `projects`, keyPath `projectId`, vērtība
  ir pilns `BoqState`). `load`/`list` izlaiž datus caur `migrateToCurrent`,
  tāpat kā `FileSystemStorageAdapter`.
- `src/components/ProjectList.tsx` — projektu saraksts, izveide, dzēšana.
- `src/components/ProjectEditor.tsx` — sadaļu/pozīciju rediģēšana, likmju
  (virsizdevumi/peļņa/PVN) rediģēšana, dzīvs kopsavilkums (`summarizeBoq`
  pārrēķināts katrā render), "Saglabāt" (IndexedDB) un "Eksportēt Excel"
  (lejupielādē `.xlsx`, izmantojot `exportBoqToBuffer`).
- `src/App.tsx` — savieno sarakstu un redaktoru, tur vienīgā
  `IndexedDbStorageAdapter` instance.

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
