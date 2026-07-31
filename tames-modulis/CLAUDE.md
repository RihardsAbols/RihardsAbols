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
  Pašlaik tikai `v1`, bet `migrateToCurrent` jau atbalsta pakāpenisku
  migrāciju pievienošanu nākotnē.
- `test/` — vitest testi (glabāšanas round-trip, migrāciju stubs).

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
