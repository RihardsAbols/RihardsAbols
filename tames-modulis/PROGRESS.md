# Tāmju/BOQ Modulis — PROGRESS.md

## 🔜 NĀKAMAIS UZDEVUMS

Sesija 2 — Excel struktūras atpazīšana (`src/parser/detectSheetType.js`,
`src/parser/detectHeaderRow.js`). Skat. `TAMES_MODULE_SPEC.md` §3, Sesija 2. Testu fixtures —
abi reālie paraugfaili ("C2-10 BOQ", "C8-2 Pile BOQ"), skat. §6 (bez anonimizācijas).
Nesākt bez lietotāja apstiprinājuma, ka uzdevums joprojām aktuāls.

---

## 🗓 SESIJA 1 — 2026-07-31 — Projekta skelets un konvencijas

**Kas darīts:**
- Izveidota `tames-modulis/` mape ar `package.json` (viena atkarība: `exceljs`), `node --test`
  ietvaru (`test/smoke.test.js`), `CLAUDE.md` un `PROGRESS.md`.
- Izvēlēts `exceljs` pār `xlsx`/SheetJS — pamatojums skat. `CLAUDE.md` "Excel bibliotēkas izvēle".

**Kāpēc:**
- Modulis būvēts kā patstāvīgs (skat. `TAMES_MODULE_SPEC.md` §0) — atkarību minimums un tīra
  testu bāze ir priekšnoteikums Sesijai 2+, kur pievienosies reāla parsēšanas loģika.

**Verifikācija:**
- `node --test` no `tames-modulis/`: 1/1 testi PASS (smoke tests apstiprina, ka testu ietvars
  strādā un `exceljs` atkarība ielādējas).

---
