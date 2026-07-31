import type ExcelJS from "exceljs";
import { cellText } from "./cellValue.js";

export interface DetectedImportColumns {
  nrPk: number;
  name: number;
  unit: number;
  quantity: number;
  unitLabor: number;
  unitMaterials: number;
  unitMechanisms: number;
}

/** Headers live well within the first ~20 rows in every real file and export seen so far; generous margin. */
const HEADER_SCAN_ROWS = 50;

function normalizeHeaderKey(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[^\p{L}]/gu, "");
}

const FIELD_MATCHERS: Record<keyof DetectedImportColumns, (key: string) => boolean> = {
  nrPk: (key) => key === "nrpk",
  // Adjacent substring, not "includes both words anywhere" - a real sheet's
  // instructional caption "(būvdarbu veids vai konstruktīvā elementa
  // nosaukums)" contains both words too, just not next to each other, and a
  // looser check false-matched it (see headerDetection.test.ts).
  name: (key) => key.includes("būvdarbunosaukum"),
  unit: (key) => key.includes("mērvien"),
  quantity: (key) => key.includes("daudzum"),
  unitLabor: (key) => key.includes("darbaalga"),
  unitMaterials: (key) => key.includes("materiāli") || key.includes("būvizstrādājumi"),
  unitMechanisms: (key) => key.includes("mehānismi"),
};

const FIELD_NAMES = Object.keys(FIELD_MATCHERS) as (keyof DetectedImportColumns)[];

/**
 * Locates the BOQ columns in a worksheet by scanning header text, instead of
 * assuming fixed column positions (TAME_COLUMNS). Real Līguma tāme files
 * insert extra columns - e.g. a per-building quantity breakdown between
 * "Mērvienība" and "Daudzums" for multi-building projects - which shifts
 * every column after them. A fixed-position map only matches files shaped
 * exactly like our own export; this doesn't.
 *
 * Only the 7 columns actually needed to read an item are detected - unit
 * totals and grand totals are recomputed by calculations/boq.ts, never read
 * back (see import.ts). Where a label appears twice (e.g. "Darba alga" once
 * for the per-unit group, once for the totals group), the first match in
 * natural row-major/column-ascending scan order is used, since the per-unit
 * group always sits left of the totals group in every file seen.
 *
 * Returns null if any required column can't be found, e.g. a
 * table-of-contents or rollup sheet with no line items - the caller skips
 * such sheets rather than importing an empty/garbage section.
 */
export function detectImportColumns(sheet: ExcelJS.Worksheet): DetectedImportColumns | null {
  const found: Partial<Record<keyof DetectedImportColumns, number>> = {};

  for (let rowNumber = 1; rowNumber <= HEADER_SCAN_ROWS; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      // A merged cell's non-anchor members all report the anchor's value via
      // exceljs, so a wide merged caption (real sheets have one: a ~26-column
      // instructional note) would otherwise look like a header match at every
      // column it spans. Only the top-left anchor cell's text counts.
      if (cell.isMerged && cell.master !== cell) return;

      const text = cellText(cell).trim();
      if (!text) return;
      const key = normalizeHeaderKey(text);
      for (const field of FIELD_NAMES) {
        if (found[field] === undefined && FIELD_MATCHERS[field](key)) {
          found[field] = colNumber;
        }
      }
    });
  }

  for (const field of FIELD_NAMES) {
    if (found[field] === undefined) {
      return null;
    }
  }

  return found as DetectedImportColumns;
}
