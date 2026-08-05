import ExcelJS from "exceljs";
import { createEmptyBoqState, type BoqItem, type BoqSection, type BoqState } from "../models/boq.js";
import { cellNumber, cellText } from "./cellValue.js";
import { isKnownUnit } from "./columns.js";
import { parseDayworksItems } from "./dayworksImport.js";
import { detectDayworksColumns, detectImportColumns } from "./headerDetection.js";

/**
 * Reads BOQ sections out of an arbitrary Līguma tāme-shaped workbook — either
 * one produced by exportBoqToWorkbook, or a real-world file. Columns are
 * located per-sheet by header text (detectImportColumns), not by fixed
 * position — verified against a real 53-sheet construction budget where
 * per-building quantity-breakdown columns shift everything after
 * "Mērvienība" for some sheets but not others, which a fixed-column map
 * can't handle.
 *
 * Within a recognized sheet, data rows are identified by the mērvienība
 * column matching a known unit (same heuristic as izpildes-akts-validacija's
 * compare_acts.py), not by row position. Sheets where no header columns can
 * be found at all (e.g. a table-of-contents or rollup summary tab) are
 * skipped entirely, not imported as empty sections. Derived columns
 * (Vienības kopā, Kopā *) are not read back — they're recomputed from the
 * unit costs instead of trusted as stored values, since this module is the
 * source of truth for them.
 *
 * A sheet that fails the standard 7-column detection is tried once more as a
 * Dayworks Schedule (single Rate column, no Salary/Materials/Mechanisms
 * split) before being skipped — see dayworksImport.ts.
 *
 * Sheet name becomes the section id/name and freshly generated ids are
 * assigned to items, since Excel carries no equivalent of our internal ids —
 * round-tripping JSON storage through Excel and back is lossy by nature.
 * `estimateNumber` (manual tāmes numerācija, e.g. "1-1") starts empty on
 * import - real files often number lokālās tāmes differently than the sheet
 * is named, so it can't be inferred and is left for the user to fill in
 * (skat. ProjectEditor.tsx "Nr." lauks).
 */
export function importBoqFromWorkbook(
  workbook: ExcelJS.Workbook,
  projectId: string,
  projectName: string,
): BoqState {
  const sections: BoqSection[] = [];

  workbook.eachSheet((sheet) => {
    const columns = detectImportColumns(sheet);
    let items: BoqItem[];

    if (columns) {
      items = [];
      sheet.eachRow((row) => {
        const unitText = cellText(row.getCell(columns.unit)).trim();
        if (!isKnownUnit(unitText)) {
          return;
        }

        items.push({
          id: crypto.randomUUID(),
          code: cellText(row.getCell(columns.nrPk)).trim(),
          description: cellText(row.getCell(columns.name)).trim(),
          unit: unitText,
          quantity: cellNumber(row.getCell(columns.quantity)),
          unitLaborCost: cellNumber(row.getCell(columns.unitLabor)),
          unitMaterialsCost: cellNumber(row.getCell(columns.unitMaterials)),
          unitMechanismsCost: cellNumber(row.getCell(columns.unitMechanisms)),
        });
      });
    } else {
      // Falls back to the Dayworks Schedule shape (single Rate column, no
      // Salary/Materials/Mechanisms split) only once the standard 7-column
      // detection has already rejected this sheet - see dayworksImport.ts.
      const dayworksColumns = detectDayworksColumns(sheet);
      if (!dayworksColumns) {
        return;
      }
      items = parseDayworksItems(sheet, dayworksColumns);
    }

    if (items.length === 0) {
      return;
    }

    sections.push({ id: sheet.name, name: sheet.name, estimateNumber: "", items });
  });

  const state = createEmptyBoqState(projectId, projectName);
  state.sections = sections;
  return state;
}

/**
 * Takes ArrayBuffer rather than Node's Buffer so this module works unchanged
 * in a browser bundle - a Node Buffer (from fs.readFile) or a browser
 * ArrayBuffer (from File.arrayBuffer()) both work here, since Buffer is a
 * Uint8Array/ArrayBuffer-backed view either way.
 */
export async function importBoqFromBuffer(
  buffer: ArrayBuffer,
  projectId: string,
  projectName: string,
): Promise<BoqState> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return importBoqFromWorkbook(workbook, projectId, projectName);
}
