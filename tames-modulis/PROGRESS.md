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

## 🔜 NĀKAMAIS UZDEVUMS

Nav vienota lēmuma, kas ir nākamais solis — jāapstiprina ar lietotāju pirms
sākšanas. Iespējamie kandidāti:

1. **Excel imports/eksports** — ievērojot, ka repo jau ir saistīta
   `izpildes-akts-validacija` prasme (izpildes aktu salīdzināšana ar tāmi),
   iespējams, BOQ modulim vajadzēs savietojamību ar to pašu `.xlsx` formātu.
2. **Projektu saraksts / CRUD virs `StorageAdapter`** — pirms UI, lai būtu
   API līmenis projektu izveidei/dzēšanai, ne tikai viena projekta
   save/load.
3. **Diskonti/atlaides vai sarežģītāka PVN loģika** (piem. dažādas PVN
   likmes pa pozīcijām), ja tas ir reāls prasību lauks.

Pirms jebkura no šiem — apstiprināt ar lietotāju, kurš tieši ir prioritārs.
