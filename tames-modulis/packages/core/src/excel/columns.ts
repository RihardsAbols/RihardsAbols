/**
 * Column layout this module WRITES when exporting, matching the column map
 * documented in the izpildes-akts-validacija skill so exported files line up
 * with real-world tāme documents and stay readable by that skill's parser.
 * Columns 2, 6, 7 and 12 are intentionally unused spacer columns in the
 * source format (sub-labels / merged header cells in real documents).
 *
 * NOT used for reading arbitrary real files - a real Līguma tāme (verified
 * against an actual 53-sheet construction budget) commonly inserts extra
 * columns (e.g. a per-building quantity breakdown) between these fixed
 * points, shifting every column after them. Import locates columns by
 * header text instead - see headerDetection.ts.
 */
export const TAME_COLUMNS = {
  nrPk: 1,
  name: 3,
  unit: 4,
  quantity: 5,
  unitLabor: 8,
  unitMaterials: 9,
  unitMechanisms: 10,
  unitTotal: 11,
  totalLabor: 13,
  totalMaterials: 14,
  totalMechanisms: 15,
  totalAll: 16,
} as const;

/**
 * Known mērvienība values (canonical/normalized form - see normalizeUnit). A
 * row is treated as a data row (rather than a header/label row) when its
 * unit-column cell normalizes to one of these, mirroring the heuristic in
 * izpildes-akts-validacija's compare_acts.py - Nr. p.k. columns can't be used
 * as the filter because header rows may also contain small integers.
 *
 * Sourced from izpildes-akts-validacija's documented list plus every unit
 * abbreviation actually observed in a real 53-sheet Līguma tāme (VELVE-style
 * export) - not guessed.
 */
export const KNOWN_UNITS = new Set([
  "m2",
  "m",
  "m3",
  "gb",
  "gab",
  "kpl",
  "obj",
  "objekts",
  "t",
  "km",
  "kg",
  "l",
  "ltr",
  "litri",
  "ha",
  "ēka",
  "vieta",
  "vietas",
  "pāris",
  "kompl",
  "iepak",
  "k-ts",
  "t.m",
  "maš/st",
  "mēn",
  "ievads",
  // English-only variants, seen in a real bilingual file's English-only
  // "General Requirements"/"Dayworks Schedule" pages (see CLAUDE.md
  // "Bilingvāla (LV/EN) tāmes faila imports" Solis 2).
  "item",
  "hr",
  "bag",
]);

/**
 * Normalizes a raw mērvienība cell value for comparison against KNOWN_UNITS.
 * Real files vary the same unit with trailing punctuation ("kpl.", "gb,")
 * and Unicode superscripts ("m²", "m³") rather than plain digits, and (a real
 * bilingual LV/EN Bill of Quantities file) embedded line breaks within a
 * single cell ("kpl./\nset") - normalize those away instead of listing every
 * variant as a separate KNOWN_UNITS entry.
 */
export function normalizeUnit(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3");
}

/**
 * Whether a raw mērvienība cell value is a known unit, after normalizeUnit.
 * A real bilingual file pairs the Latvian unit with an English translation
 * separated by "/" ("vieta/place", "vietas / place") - checked as a fallback
 * ONLY after the full string fails, so an already-known unit that happens to
 * contain a literal "/" itself ("maš/st") still matches on the first check
 * and never reaches the split.
 */
export function isKnownUnit(raw: string): boolean {
  const full = normalizeUnit(raw);
  if (KNOWN_UNITS.has(full)) return true;
  if (full.includes("/")) {
    const firstPart = normalizeUnit(full.split("/")[0]);
    if (KNOWN_UNITS.has(firstPart)) return true;
  }
  return false;
}
