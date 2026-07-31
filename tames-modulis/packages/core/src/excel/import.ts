import ExcelJS from "exceljs";
import { createEmptyBoqState, type BoqItem, type BoqSection, type BoqState } from "../models/boq.js";
import { cellNumber, cellText } from "./cellValue.js";
import { KNOWN_UNITS, TAME_COLUMNS } from "./columns.js";

/**
 * Reads BOQ sections out of an arbitrary Līguma tāme-shaped workbook — either
 * one produced by exportBoqToWorkbook, or a real-world file matching the
 * column layout documented in the izpildes-akts-validacija skill.
 *
 * Data rows are identified by the mērvienība column matching a known unit
 * (same heuristic as that skill's compare_acts.py), not by row position, so
 * this doesn't depend on a fixed header size. Sheets with no recognizable
 * data rows (e.g. a KOPSAVILKUMS summary tab) are skipped rather than
 * imported as empty sections. Derived columns (Vienības kopā, Kopā *) are
 * not read back — they're recomputed from the unit costs instead of trusted
 * as stored values, since this module is the source of truth for them.
 *
 * Sheet name becomes the section id/name and freshly generated ids are
 * assigned to items, since Excel carries no equivalent of our internal ids —
 * round-tripping JSON storage through Excel and back is lossy by nature.
 */
export function importBoqFromWorkbook(
  workbook: ExcelJS.Workbook,
  projectId: string,
  projectName: string,
): BoqState {
  const sections: BoqSection[] = [];

  workbook.eachSheet((sheet) => {
    const items: BoqItem[] = [];

    sheet.eachRow((row) => {
      const unitText = cellText(row.getCell(TAME_COLUMNS.unit)).trim();
      if (!KNOWN_UNITS.has(unitText.toLowerCase())) {
        return;
      }

      items.push({
        id: crypto.randomUUID(),
        code: cellText(row.getCell(TAME_COLUMNS.nrPk)).trim(),
        description: cellText(row.getCell(TAME_COLUMNS.name)).trim(),
        unit: unitText,
        quantity: cellNumber(row.getCell(TAME_COLUMNS.quantity)),
        unitLaborCost: cellNumber(row.getCell(TAME_COLUMNS.unitLabor)),
        unitMaterialsCost: cellNumber(row.getCell(TAME_COLUMNS.unitMaterials)),
        unitMechanismsCost: cellNumber(row.getCell(TAME_COLUMNS.unitMechanisms)),
      });
    });

    if (items.length === 0) {
      return;
    }

    sections.push({ id: sheet.name, name: sheet.name, items });
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
