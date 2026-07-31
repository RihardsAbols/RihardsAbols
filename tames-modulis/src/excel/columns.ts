/**
 * Column layout for the "Līguma tāme" format, matching the column map
 * documented in the izpildes-akts-validacija skill so exported files line up
 * with real-world tāme documents and stay readable by that skill's parser.
 * Columns 2, 6, 7 and 12 are intentionally unused spacer columns in the
 * source format (sub-labels / merged header cells in real documents).
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
 * Known mērvienība values. A row is treated as a data row (rather than a
 * header/label row) when its unit-column cell matches one of these,
 * mirroring the heuristic in izpildes-akts-validacija's compare_acts.py —
 * Nr. p.k. columns can't be used as the filter because header rows may also
 * contain small integers.
 */
export const KNOWN_UNITS = new Set([
  "m2",
  "m",
  "gb",
  "kpl",
  "kpl.",
  "obj.",
  "obj",
  "t",
  "m3",
  "km",
  "kg",
  "gab",
]);
