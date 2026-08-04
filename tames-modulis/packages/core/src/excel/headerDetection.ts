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
  // startsWith, not exact "nrpk" - a real bilingual (LV/EN) file's header
  // "N.p.k./No" normalizes to "npkno" (missing the "r" of "Nr.", plus the
  // trailing English "No"), which an exact match rejects entirely (see
  // headerDetection.test.ts). "nrpk"/"npk" prefixes cover both the
  // Latvian-only and bilingual forms without loosening this into a bare
  // .includes(), which would also match "npk" appearing deeper in unrelated
  // header text.
  nrPk: (key) => key.startsWith("nrpk") || key.startsWith("npk"),
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
 * Scans a worksheet's header rows for cell text matching each of `matchers`,
 * shared by detectImportColumns and detectExecutionActColumns below - both
 * need the same "scan rows, skip non-anchor merged cells, first match wins"
 * behavior, just over a different field set.
 */
function scanHeaderColumns<F extends string>(sheet: ExcelJS.Worksheet, matchers: Record<F, (key: string) => boolean>): Partial<Record<F, number>> {
  const found: Partial<Record<F, number>> = {};
  const fields = Object.keys(matchers) as F[];

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
      for (const field of fields) {
        if (found[field] === undefined && matchers[field](key)) {
          found[field] = colNumber;
        }
      }
    });
  }

  return found;
}

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
  const found = scanHeaderColumns(sheet, FIELD_MATCHERS);

  for (const field of FIELD_NAMES) {
    if (found[field] === undefined) {
      return null;
    }
  }

  return found as DetectedImportColumns;
}

export interface DetectedExecutionActColumns {
  nrPk: number;
  name: number;
  unit: number;
  /** "Izpildīts atskaites periodā" -> Daudzums (this reporting period's executed quantity) - see executionActImport.ts. */
  executedThisPeriod: number;
}

const EXECUTION_ACT_FIELD_MATCHERS: Record<keyof DetectedExecutionActColumns, (key: string) => boolean> = {
  // Same startsWith relaxation as FIELD_MATCHERS.nrPk above, for bilingual akts files.
  nrPk: (key) => key.startsWith("nrpk") || key.startsWith("npk"),
  name: (key) => key.includes("būvdarbunosaukum"),
  unit: (key) => key.includes("mērvien"),
  executedThisPeriod: (key) => key.includes("izpildītsatskaitesperiodā"),
};

const EXECUTION_ACT_FIELD_NAMES = Object.keys(EXECUTION_ACT_FIELD_MATCHERS) as (keyof DetectedExecutionActColumns)[];

/**
 * Same header-text-scanning approach as detectImportColumns, for a real
 * izpildes akts (Forma Nr.2/Nr.3, LBN 501-17) workbook instead of a Līguma
 * tāme - verified against a real akts file where the "Izpildīts atskaites
 * periodā" column sits at column 29 on some sheets and 33 on others,
 * depending on whether that sheet's cost breakdown includes an extra "laika
 * norma" sub-group - the same class of column-shift already seen on tāme
 * imports, just triggered by a different real-file quirk. Only the 4 fields
 * actually needed to build an ExecutionRecordEntry are required (unlike
 * detectImportColumns's 7) - an akts sheet's cost-breakdown columns vary
 * enough between disciplines (electrical vs. demolition, say) that requiring
 * them here would reject sheets we can otherwise read correctly.
 */
export function detectExecutionActColumns(sheet: ExcelJS.Worksheet): DetectedExecutionActColumns | null {
  const found = scanHeaderColumns(sheet, EXECUTION_ACT_FIELD_MATCHERS);

  for (const field of EXECUTION_ACT_FIELD_NAMES) {
    if (found[field] === undefined) {
      return null;
    }
  }

  return found as DetectedExecutionActColumns;
}
