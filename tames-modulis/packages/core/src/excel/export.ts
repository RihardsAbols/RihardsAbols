import ExcelJS from "exceljs";
import { calculateItemCosts, summarizeBoq } from "../calculations/boq.js";
import type { BoqSection, BoqState } from "../models/boq.js";
import { colLetter } from "./cellValue.js";
import { TAME_COLUMNS } from "./columns.js";

const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true };
const MONEY_FORMAT = "#,##0.00";
const PERCENT_FORMAT = "0.0%";
const QUANTITY_FORMAT = "#,##0.###";

function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sadaļa";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 31 - String(suffix).length - 1)}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

const COST_COLUMNS = [
  TAME_COLUMNS.unitLabor,
  TAME_COLUMNS.unitMaterials,
  TAME_COLUMNS.unitMechanisms,
  TAME_COLUMNS.unitTotal,
  TAME_COLUMNS.totalLabor,
  TAME_COLUMNS.totalMaterials,
  TAME_COLUMNS.totalMechanisms,
  TAME_COLUMNS.totalAll,
];

/** Writes one section as a worksheet and returns the row holding its "Tiešās izmaksas" total. */
function writeSectionSheet(workbook: ExcelJS.Workbook, sheetName: string, section: BoqSection): number {
  const sheet = workbook.addWorksheet(sheetName);

  sheet.mergeCells(1, TAME_COLUMNS.unitLabor, 1, TAME_COLUMNS.unitTotal);
  sheet.getCell(1, TAME_COLUMNS.unitLabor).value = "Vienības izmaksa (EUR/vienība)";
  sheet.mergeCells(1, TAME_COLUMNS.totalLabor, 1, TAME_COLUMNS.totalAll);
  sheet.getCell(1, TAME_COLUMNS.totalLabor).value = "Kopējā izmaksa (EUR)";
  sheet.getCell(1, TAME_COLUMNS.unitLabor).font = HEADER_FONT;
  sheet.getCell(1, TAME_COLUMNS.totalLabor).font = HEADER_FONT;

  const headerRow = 2;
  const headers: Array<[number, string]> = [
    [TAME_COLUMNS.nrPk, "Nr.p.k."],
    [TAME_COLUMNS.name, "Būvdarbu nosaukums"],
    [TAME_COLUMNS.unit, "Mērvienība"],
    [TAME_COLUMNS.quantity, "Daudzums"],
    [TAME_COLUMNS.unitLabor, "Darba alga"],
    [TAME_COLUMNS.unitMaterials, "Materiāli"],
    [TAME_COLUMNS.unitMechanisms, "Mehānismi"],
    [TAME_COLUMNS.unitTotal, "Kopā"],
    [TAME_COLUMNS.totalLabor, "Darba alga"],
    [TAME_COLUMNS.totalMaterials, "Materiāli"],
    [TAME_COLUMNS.totalMechanisms, "Mehānismi"],
    [TAME_COLUMNS.totalAll, "Kopā"],
  ];
  for (const [col, label] of headers) {
    const cell = sheet.getCell(headerRow, col);
    cell.value = label;
    cell.font = HEADER_FONT;
  }

  const firstDataRow = headerRow + 1;
  const L = colLetter(TAME_COLUMNS.unitLabor);
  const M = colLetter(TAME_COLUMNS.unitMaterials);
  const K = colLetter(TAME_COLUMNS.unitMechanisms);
  const UT = colLetter(TAME_COLUMNS.unitTotal);
  const QTY = colLetter(TAME_COLUMNS.quantity);
  const TL = colLetter(TAME_COLUMNS.totalLabor);
  const TM = colLetter(TAME_COLUMNS.totalMaterials);
  const TK = colLetter(TAME_COLUMNS.totalMechanisms);
  const TA = colLetter(TAME_COLUMNS.totalAll);

  section.items.forEach((item, i) => {
    const row = firstDataRow + i;
    const costs = calculateItemCosts(item);

    sheet.getCell(row, TAME_COLUMNS.nrPk).value = item.code;
    sheet.getCell(row, TAME_COLUMNS.name).value = item.description;
    sheet.getCell(row, TAME_COLUMNS.unit).value = item.unit;
    const qtyCell = sheet.getCell(row, TAME_COLUMNS.quantity);
    qtyCell.value = item.quantity;
    qtyCell.numFmt = QUANTITY_FORMAT;

    sheet.getCell(row, TAME_COLUMNS.unitLabor).value = item.unitLaborCost;
    sheet.getCell(row, TAME_COLUMNS.unitMaterials).value = item.unitMaterialsCost;
    sheet.getCell(row, TAME_COLUMNS.unitMechanisms).value = item.unitMechanismsCost;
    sheet.getCell(row, TAME_COLUMNS.unitTotal).value = {
      formula: `${L}${row}+${M}${row}+${K}${row}`,
      result: item.unitLaborCost + item.unitMaterialsCost + item.unitMechanismsCost,
    };

    sheet.getCell(row, TAME_COLUMNS.totalLabor).value = {
      formula: `${QTY}${row}*${L}${row}`,
      result: costs.laborTotal,
    };
    sheet.getCell(row, TAME_COLUMNS.totalMaterials).value = {
      formula: `${QTY}${row}*${M}${row}`,
      result: costs.materialsTotal,
    };
    sheet.getCell(row, TAME_COLUMNS.totalMechanisms).value = {
      formula: `${QTY}${row}*${K}${row}`,
      result: costs.mechanismsTotal,
    };
    sheet.getCell(row, TAME_COLUMNS.totalAll).value = {
      formula: `${TL}${row}+${TM}${row}+${TK}${row}`,
      result: costs.directTotal,
    };

    for (const col of COST_COLUMNS) {
      sheet.getCell(row, col).numFmt = MONEY_FORMAT;
    }
  });

  const lastDataRow = firstDataRow + section.items.length - 1;
  const directTotalRow = firstDataRow + section.items.length;

  sheet.getCell(directTotalRow, TAME_COLUMNS.name).value = "Tiešās izmaksas";
  sheet.getCell(directTotalRow, TAME_COLUMNS.name).font = HEADER_FONT;

  const directCell = sheet.getCell(directTotalRow, TAME_COLUMNS.totalAll);
  if (section.items.length > 0) {
    const directTotal = section.items.reduce((sum, item) => sum + calculateItemCosts(item).directTotal, 0);
    directCell.value = { formula: `SUM(${TA}${firstDataRow}:${TA}${lastDataRow})`, result: directTotal };
  } else {
    directCell.value = 0;
  }
  directCell.numFmt = MONEY_FORMAT;
  directCell.font = HEADER_FONT;

  for (const row of sheet.getRows(1, directTotalRow) ?? []) {
    row?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }

  return directTotalRow;
}

export function exportBoqToWorkbook(state: BoqState): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "tames-modulis";
  workbook.created = new Date(state.updatedAt);

  const summary = workbook.addWorksheet("KOPSAVILKUMS");
  summary.getCell(1, 1).value = "Projekts:";
  summary.getCell(1, 1).font = HEADER_FONT;
  summary.getCell(1, 2).value = state.projectName;

  summary.getCell(2, 1).value = "Virsizdevumu likme:";
  summary.getCell(2, 2).value = state.overheadRate;
  summary.getCell(2, 2).numFmt = PERCENT_FORMAT;

  summary.getCell(3, 1).value = "Peļņas likme:";
  summary.getCell(3, 2).value = state.profitRate;
  summary.getCell(3, 2).numFmt = PERCENT_FORMAT;

  summary.getCell(4, 1).value = "PVN likme:";
  summary.getCell(4, 2).value = state.vatRate;
  summary.getCell(4, 2).numFmt = PERCENT_FORMAT;

  const tableHeaderRow = 6;
  ["Sadaļa", "Tiešās izmaksas", "Virsizdevumi", "Peļņa", "Pavisam (bez PVN)"].forEach((label, i) => {
    const cell = summary.getCell(tableHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });

  const usedSheetNames = new Set<string>(["KOPSAVILKUMS"]);
  const boqSummary = summarizeBoq(state);
  const firstSectionRow = tableHeaderRow + 1;

  state.sections.forEach((section, i) => {
    const sheetName = sanitizeSheetName(section.name, usedSheetNames);
    const directTotalRow = writeSectionSheet(workbook, sheetName, section);
    const row = firstSectionRow + i;
    const sectionSummary = boqSummary.sections[i];

    summary.getCell(row, 1).value = section.name;
    summary.getCell(row, 2).value = {
      formula: `${quoteSheetName(sheetName)}!${colLetter(TAME_COLUMNS.totalAll)}${directTotalRow}`,
      result: sectionSummary.directTotal,
    };
    summary.getCell(row, 3).value = { formula: `B${row}*$B$2`, result: sectionSummary.overhead };
    summary.getCell(row, 4).value = { formula: `B${row}*$B$3`, result: sectionSummary.profit };
    summary.getCell(row, 5).value = {
      formula: `B${row}+C${row}+D${row}`,
      result: sectionSummary.totalWithMarkup,
    };

    for (const col of [2, 3, 4, 5]) {
      summary.getCell(row, col).numFmt = MONEY_FORMAT;
    }
  });

  const lastSectionRow = firstSectionRow + state.sections.length - 1;
  const totalsRow = firstSectionRow + state.sections.length;
  summary.getCell(totalsRow, 1).value = "KOPĀ";
  summary.getCell(totalsRow, 1).font = HEADER_FONT;

  const totalsResults = [boqSummary.directTotal, boqSummary.overhead, boqSummary.profit, boqSummary.subtotal];
  for (const col of [2, 3, 4, 5]) {
    const cell = summary.getCell(totalsRow, col);
    if (state.sections.length > 0) {
      const letter = colLetter(col);
      cell.value = {
        formula: `SUM(${letter}${firstSectionRow}:${letter}${lastSectionRow})`,
        result: totalsResults[col - 2],
      };
    } else {
      cell.value = 0;
    }
    cell.numFmt = MONEY_FORMAT;
    cell.font = HEADER_FONT;
  }

  const vatRow = totalsRow + 1;
  summary.getCell(vatRow, 1).value = "PVN";
  const vatCell = summary.getCell(vatRow, 5);
  vatCell.value = { formula: `E${totalsRow}*$B$4`, result: boqSummary.vatAmount };
  vatCell.numFmt = MONEY_FORMAT;

  const grandTotalRow = vatRow + 1;
  summary.getCell(grandTotalRow, 1).value = "KOPĀ AR PVN";
  summary.getCell(grandTotalRow, 1).font = HEADER_FONT;
  const grandTotalCell = summary.getCell(grandTotalRow, 5);
  grandTotalCell.value = { formula: `E${totalsRow}+E${vatRow}`, result: boqSummary.total };
  grandTotalCell.numFmt = MONEY_FORMAT;
  grandTotalCell.font = HEADER_FONT;

  for (const row of summary.getRows(1, grandTotalRow) ?? []) {
    row?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }

  return workbook;
}

/**
 * Returns an ArrayBuffer rather than Node's Buffer, so this module has no
 * dependency on Node globals and works unchanged in a browser bundle (e.g.
 * packages/web). exceljs's .d.ts return type here is its own module-local
 * `Buffer extends ArrayBuffer` (see import.ts for the same quirk) - the real
 * runtime value is a Node Buffer in Node and a Uint8Array/ArrayBuffer in a
 * browser bundle; both work as ArrayBuffer-like data for callers (wrap in
 * Buffer.from() on the Node side, or new Blob([...]) in the browser).
 */
export async function exportBoqToBuffer(state: BoqState): Promise<ArrayBuffer> {
  const workbook = exportBoqToWorkbook(state);
  return workbook.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>;
}
