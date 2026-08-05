import ExcelJS from "exceljs";
import type { BoqSection } from "../models/boq.js";
import type { ExecutionRecordEntry } from "../models/executionRecord.js";
import { cellNumber, cellText } from "./cellValue.js";
import { isKnownUnit } from "./columns.js";
import { detectExecutionActColumns } from "./headerDetection.js";

export interface ParsedExecutionActRow {
  code: string;
  description: string;
  unit: string;
  executedQuantity: number;
}

export interface ParsedExecutionActSheet {
  sheetName: string;
  rows: ParsedExecutionActRow[];
}

/**
 * Reads "šī perioda izpildītais daudzums" (the "Izpildīts atskaites
 * periodā" column) out of an arbitrary izpildes akts-shaped workbook (Forma
 * Nr.2/Nr.3, LBN 501-17 - one sheet per lokālā tāme, same general shape as a
 * Līguma tāme sheet plus execution-tracking columns). Columns are located by
 * header text (detectExecutionActColumns), not fixed position - see that
 * function for why. Data rows are identified the same way as the Līguma
 * tāme import: the mērvienība column matching a known unit, not row
 * position (a Forma sheet's Nr.p.k. column can restart or repeat in ways a
 * position-based filter would misread).
 *
 * Only rows with executedQuantity !== 0 are kept - a Forma sheet lists EVERY
 * contracted position whether or not anything happened this period, but
 * BoqState.executionRecords only stores positions with actual execution
 * (see models/executionRecord.ts) - carrying the zero rows through would
 * just be discarded downstream anyway. Sheets with no recognizable header
 * (rollup/summary tabs, e.g. "KOPT"/"saturs") are skipped entirely, same as
 * import.ts does for the Līguma tāme.
 */
export function parseExecutionActWorkbook(workbook: ExcelJS.Workbook): ParsedExecutionActSheet[] {
  const sheets: ParsedExecutionActSheet[] = [];

  workbook.eachSheet((sheet) => {
    const columns = detectExecutionActColumns(sheet);
    if (!columns) return;

    const rows: ParsedExecutionActRow[] = [];
    sheet.eachRow((row) => {
      const unitText = cellText(row.getCell(columns.unit)).trim();
      if (!isKnownUnit(unitText)) return;

      const executedQuantity = cellNumber(row.getCell(columns.executedThisPeriod));
      if (executedQuantity === 0) return;

      rows.push({
        code: cellText(row.getCell(columns.nrPk)).trim(),
        description: cellText(row.getCell(columns.name)).trim(),
        unit: unitText,
        executedQuantity,
      });
    });

    if (rows.length > 0) {
      sheets.push({ sheetName: sheet.name, rows });
    }
  });

  return sheets;
}

/** Takes ArrayBuffer, not Node's Buffer - see import.ts's importBoqFromBuffer for the same reasoning (browser compatibility). */
export async function parseExecutionActBuffer(buffer: ArrayBuffer): Promise<ParsedExecutionActSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return parseExecutionActWorkbook(workbook);
}

/**
 * Suggests a sheet -> BoqSection mapping by exact name match. A real akts
 * file for the same project uses the SAME sheet names as the Līguma tāme it
 * was generated against - BoqSection.name (and .id) come straight from the
 * original tāme's sheet.name (see import.ts), so this needs no fuzzy
 * matching for a file produced by the same tooling. `null` for a sheet name
 * with no exact match - the caller (UI) shows this as "no section" in the
 * import preview, letting the user pick one manually or skip that sheet,
 * rather than guessing and risking a wrong-section match.
 */
export function suggestSheetToSectionMapping(parsedSheets: ParsedExecutionActSheet[], currentSections: BoqSection[]): Record<string, string | null> {
  const sectionIdByName = new Map(currentSections.map((s) => [s.name, s.id]));
  const mapping: Record<string, string | null> = {};
  for (const sheet of parsedSheets) {
    mapping[sheet.sheetName] = sectionIdByName.get(sheet.sheetName) ?? null;
  }
  return mapping;
}

export interface ExecutionActSheetMatch {
  sheetName: string;
  sectionId: string | null;
  entries: ExecutionRecordEntry[];
  /** Rows that couldn't be turned into an entry - no section mapped for their sheet, or their code matched no item in that section. Surfaced so the caller can show them before committing, rather than silently dropping executed quantity. */
  unmatchedRows: ParsedExecutionActRow[];
}

/**
 * Resolves parsed akta rows against actual project items, given a (usually
 * user-confirmed, see suggestSheetToSectionMapping) sheet -> BoqSection
 * mapping. Matches a row to an item by `code` (the same Nr.p.k. text
 * captured on the original tāme import) WITHIN the mapped section only - a
 * code match in the wrong section would silently misattribute executed
 * quantity/value to an unrelated pozīcija, since codes are only unique
 * within a section, not across the whole project.
 */
export function matchExecutionActToProject(
  parsedSheets: ParsedExecutionActSheet[],
  currentSections: BoqSection[],
  sheetToSectionId: Record<string, string | null>,
): ExecutionActSheetMatch[] {
  const sectionsById = new Map(currentSections.map((s) => [s.id, s]));

  return parsedSheets.map((sheet) => {
    const sectionId = sheetToSectionId[sheet.sheetName] ?? null;
    const section = sectionId ? (sectionsById.get(sectionId) ?? null) : null;
    if (!section) {
      return { sheetName: sheet.sheetName, sectionId: null, entries: [], unmatchedRows: sheet.rows };
    }

    const itemsByCode = new Map(section.items.map((item) => [item.code, item]));
    const entries: ExecutionRecordEntry[] = [];
    const unmatchedRows: ParsedExecutionActRow[] = [];
    for (const row of sheet.rows) {
      const item = itemsByCode.get(row.code);
      if (!item) {
        unmatchedRows.push(row);
        continue;
      }
      entries.push({ id: crypto.randomUUID(), sectionId: section.id, itemId: item.id, executedQuantity: row.executedQuantity });
    }
    return { sheetName: sheet.sheetName, sectionId: section.id, entries, unmatchedRows };
  });
}
