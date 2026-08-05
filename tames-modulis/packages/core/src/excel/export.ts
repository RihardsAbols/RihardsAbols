import ExcelJS from "exceljs";
import { computeAuditLog } from "../audit/auditLog.js";
import type { AuditEvent, AuditEventType } from "../audit/auditLog.js";
import { calculateItemCosts, summarizeBoq } from "../calculations/boq.js";
import { computeExecutedToDate, computeExecutionOverview, computeExecutionRecordValue, computeRemainingQuantity } from "../executionRecords/executionRecords.js";
import type { BoqItem, BoqSection, BoqState } from "../models/boq.js";
import type { ExecutionRecord } from "../models/executionRecord.js";
import type { VariationOrder } from "../models/variationOrder.js";
import {
  computeItemCodesAndHistory,
  computeReserveBalance,
  computeVariationOrderDirectTotalImpact,
  deriveCurrentSections,
  diffAgainstBaseline,
} from "../variationOrders/deriveCurrentState.js";
import type { ItemDisplayInfo } from "../variationOrders/deriveCurrentState.js";
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

// Column widths (Excel "character" units) for a section sheet, so entered
// texts/numbers are actually readable instead of clipped at the ~8.43-char
// default - verified against a real 53-sheet/12876-item Līguma tāme where
// descriptions and multi-digit money values were unreadable at default
// width. "Nr.p.k." (col 1) is also reused as the label column for the
// project/rekvizīti header block above the table (see
// writeProjectHeaderBlock) - 7 is enough for item numbers ("1", "1.2"), and
// header labels there are merged across columns 1-3 so they aren't
// constrained by this narrow width.
const COLUMN_WIDTHS: Record<number, number> = {
  // 12 (not 7) so derived displayCode values (skat. "Pozīciju numerācija +
  // VO izmaiņu vēsture", piem. "21a (VO-2)") nav vizuāli apgriezti - tā pati
  // kļūdu klase, ko Sesija 24 jau izlaboja UI pusē (.code-input min-width).
  [TAME_COLUMNS.nrPk]: 12,
  2: 3,
  [TAME_COLUMNS.name]: 48,
  [TAME_COLUMNS.unit]: 10,
  [TAME_COLUMNS.quantity]: 11,
  6: 3,
  7: 3,
  [TAME_COLUMNS.unitLabor]: 11,
  [TAME_COLUMNS.unitMaterials]: 11,
  [TAME_COLUMNS.unitMechanisms]: 11,
  [TAME_COLUMNS.unitTotal]: 11,
  12: 3,
  [TAME_COLUMNS.totalLabor]: 13,
  [TAME_COLUMNS.totalMaterials]: 13,
  [TAME_COLUMNS.totalMechanisms]: 13,
  [TAME_COLUMNS.totalAll]: 14,
};

const SUMMARY_COLUMN_WIDTHS = [32, 16, 14, 18, 14, 14, 18];

// Extra columns appended AFTER the normal section-sheet columns (TAME_COLUMNS
// ends at 16), only written when the project has an approved baseline (see
// BoqState.baselineApprovedAt) - showing what a pozīcija's quantity was in
// the frozen bāze vs. the current (bāze + apstiprinātās VO) quantity being
// exported. Placed strictly after the fixed TAME_COLUMNS layout so
// re-importing an exported file (which locates columns by header text, see
// headerDetection.ts) is unaffected either way.
const VARIATION_COLUMNS = {
  spacer: TAME_COLUMNS.totalAll + 1,
  baselineQuantity: TAME_COLUMNS.totalAll + 2,
  quantityDelta: TAME_COLUMNS.totalAll + 3,
} as const;

const VARIATION_COLUMN_WIDTHS: Record<number, number> = {
  [VARIATION_COLUMNS.spacer]: 3,
  [VARIATION_COLUMNS.baselineQuantity]: 13,
  [VARIATION_COLUMNS.quantityDelta]: 11,
};

// Extra columns appended AFTER VARIATION_COLUMNS, only written when the
// project has at least one execution record (state.executionRecords.length >
// 0) - which in practice always implies a frozen baseline too, since the UI
// only exposes "Izpildes akti" after "Apstiprināt bāzes tāmi" (see
// ProjectEditor.tsx). Kept as its own column group (not merged into
// VARIATION_COLUMNS) so a project using VO but not yet execution tracking
// still gets the unchanged Bāzes daudzums/Delta-only layout.
const EXECUTION_COLUMNS = {
  spacer: VARIATION_COLUMNS.quantityDelta + 1,
  executedToDate: VARIATION_COLUMNS.quantityDelta + 2,
  remaining: VARIATION_COLUMNS.quantityDelta + 3,
} as const;

const EXECUTION_COLUMN_WIDTHS: Record<number, number> = {
  [EXECUTION_COLUMNS.spacer]: 3,
  [EXECUTION_COLUMNS.executedToDate]: 13,
  [EXECUTION_COLUMNS.remaining]: 11,
};

// Per-VO ΔDaudz./ΔEUR column widths (skat. VO_ITEM_COLUMNS zemāk) - vienādi
// katrai VO grupai, tāpēc konstantes, nevis VARIATION_COLUMN_WIDTHS/
// EXECUTION_COLUMN_WIDTHS stila fiksēta Record, jo šo kolonnu SKAITS un
// POZĪCIJA atšķiras katrai sadaļas lapai (atkarīgs no tā, cik VO relevanti
// tieši šai sadaļai) - platumi tiek pielietoti dinamiski writeSectionSheet.
const VO_QUANTITY_COLUMN_WIDTH = 11;
const VO_EUR_COLUMN_WIDTH = 13;

/**
 * Writes the project-level header block (Projekts, Būvuzņēmēja/Pasūtītāja
 * rekvizīti, and - for section sheets - the section's manual tāmes
 * numerācija) that appears at the top of every exported sheet, matching how
 * real Līguma tāme documents repeat this boilerplate on each lokālā tāme
 * page. Labels are merged across columns 1..labelEndCol and values across
 * (labelEndCol+1)..valueEndCol so long company names/addresses aren't
 * clipped by the narrow "Nr.p.k."/"Sadaļa" column width used elsewhere on
 * the same sheet - the merge is row-scoped, so it doesn't affect those
 * columns' width on other rows.
 *
 * Returns the number of rows written (the caller adds its own blank
 * separator row before the next block).
 */
function writeProjectHeaderBlock(
  sheet: ExcelJS.Worksheet,
  state: BoqState,
  labelEndCol: number,
  valueEndCol: number,
  estimateNumber?: string,
): number {
  const lines: Array<[string, string]> = [
    ["Projekts:", state.projectName],
    ["Būvuzņēmējs:", state.contractor.name],
    ["Būvuzņēmēja reģ. Nr.:", state.contractor.regNr],
    ["Būvuzņēmēja adrese:", state.contractor.address],
    ["Pasūtītājs:", state.client.name],
    ["Pasūtītāja reģ. Nr.:", state.client.regNr],
    ["Pasūtītāja adrese:", state.client.address],
  ];
  if (estimateNumber !== undefined) {
    lines.push(["Lokālā tāme Nr.:", estimateNumber]);
  }

  const valueStartCol = labelEndCol + 1;
  lines.forEach(([label, value], i) => {
    const row = i + 1;
    if (labelEndCol > 1) {
      sheet.mergeCells(row, 1, row, labelEndCol);
    }
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = HEADER_FONT;
    if (valueEndCol > valueStartCol) {
      sheet.mergeCells(row, valueStartCol, row, valueEndCol);
    }
    sheet.getCell(row, valueStartCol).value = value;
  });

  return lines.length;
}

/** Writes "Sastādīja:"/"Pārbaudīja:" signature lines below a sheet's table. Returns the last row written. */
function writeSignatureBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  state: BoqState,
  labelEndCol: number,
  valueEndCol: number,
): number {
  const lines: Array<[string, string]> = [
    ["Sastādīja:", state.preparedBy],
    ["Pārbaudīja:", state.checkedBy],
  ];

  const valueStartCol = labelEndCol + 1;
  lines.forEach(([label, value], i) => {
    const row = startRow + i;
    if (labelEndCol > 1) {
      sheet.mergeCells(row, 1, row, labelEndCol);
    }
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = HEADER_FONT;
    if (valueEndCol > valueStartCol) {
      sheet.mergeCells(row, valueStartCol, row, valueEndCol);
    }
    sheet.getCell(row, valueStartCol).value = value;
  });

  return startRow + lines.length - 1;
}

/**
 * Writes one section as a worksheet and returns the row holding its "Tiešās
 * izmaksas" total. `section` is the CURRENT (bāze + apstiprinātās VO, see
 * deriveCurrentSections) version being rendered; `baselineSection` is the
 * frozen bāze counterpart used ONLY for the "Bāzes daudzums"/"Delta" columns
 * - `null` when the project has no approved baseline yet (draft, no VO
 * feature in use), in which case those columns are omitted entirely and the
 * sheet looks exactly like before this feature existed.
 *
 * `itemDisplay`/`voColumns` mirror `ItemsTable.tsx`'s "Tāme" cilne (skat.
 * CLAUDE.md "Pozīciju numerācija + VO izmaiņu vēsture (Sesija 24)") - when
 * `itemDisplay` is non-null, the "Nr.p.k." column shows the derived
 * displayCode instead of the raw `item.code`, and `voColumns` (this
 * section's relevant approved VO, same filter as ProjectEditor.tsx) each add
 * a "VO-X ΔDaudz."/"VO-X ΔEUR" column pair appended after the
 * variation/execution column groups.
 */
function writeSectionSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  section: BoqSection,
  state: BoqState,
  baselineSection: BoqSection | null,
  itemDisplay: Map<string, ItemDisplayInfo> | null,
  voColumns: { voId: string; voNumber: string }[],
): number {
  const sheet = workbook.addWorksheet(sheetName);

  const showExecution = state.executionRecords.length > 0;

  for (const [col, width] of Object.entries(COLUMN_WIDTHS)) {
    sheet.getColumn(Number(col)).width = width;
  }
  if (baselineSection) {
    for (const [col, width] of Object.entries(VARIATION_COLUMN_WIDTHS)) {
      sheet.getColumn(Number(col)).width = width;
    }
  }
  if (showExecution) {
    for (const [col, width] of Object.entries(EXECUTION_COLUMN_WIDTHS)) {
      sheet.getColumn(Number(col)).width = width;
    }
  }

  // Appended AFTER the variation/execution column groups (whichever are
  // present) - one spacer column, then two columns per relevant VO, same
  // "spacer, then group" layout as VARIATION_COLUMNS/EXECUTION_COLUMNS
  // above. Position varies per sheet since `voColumns` (and whether
  // baseline/execution groups precede it) differ per section.
  const lastFixedCol = baselineSection ? VARIATION_COLUMNS.quantityDelta : TAME_COLUMNS.totalAll;
  const lastBeforeVoCols = showExecution ? EXECUTION_COLUMNS.remaining : lastFixedCol;
  const firstVoCol = lastBeforeVoCols + 2;
  voColumns.forEach((_, i) => {
    sheet.getColumn(firstVoCol + i * 2).width = VO_QUANTITY_COLUMN_WIDTH;
    sheet.getColumn(firstVoCol + i * 2 + 1).width = VO_EUR_COLUMN_WIDTH;
  });

  const headerLines = writeProjectHeaderBlock(
    sheet,
    state,
    TAME_COLUMNS.name,
    TAME_COLUMNS.totalLabor,
    section.estimateNumber,
  );
  const mergedHeaderRow = headerLines + 2; // one blank separator row in between

  sheet.mergeCells(mergedHeaderRow, TAME_COLUMNS.unitLabor, mergedHeaderRow, TAME_COLUMNS.unitTotal);
  sheet.getCell(mergedHeaderRow, TAME_COLUMNS.unitLabor).value = "Vienības izmaksa (EUR/vienība)";
  sheet.mergeCells(mergedHeaderRow, TAME_COLUMNS.totalLabor, mergedHeaderRow, TAME_COLUMNS.totalAll);
  sheet.getCell(mergedHeaderRow, TAME_COLUMNS.totalLabor).value = "Kopējā izmaksa (EUR)";
  sheet.getCell(mergedHeaderRow, TAME_COLUMNS.unitLabor).font = HEADER_FONT;
  sheet.getCell(mergedHeaderRow, TAME_COLUMNS.totalLabor).font = HEADER_FONT;

  const headerRow = mergedHeaderRow + 1;
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
  if (baselineSection) {
    sheet.getCell(headerRow, VARIATION_COLUMNS.baselineQuantity).value = "Bāzes daudzums";
    sheet.getCell(headerRow, VARIATION_COLUMNS.baselineQuantity).font = HEADER_FONT;
    sheet.getCell(headerRow, VARIATION_COLUMNS.quantityDelta).value = "Delta";
    sheet.getCell(headerRow, VARIATION_COLUMNS.quantityDelta).font = HEADER_FONT;
  }
  if (showExecution) {
    sheet.getCell(headerRow, EXECUTION_COLUMNS.executedToDate).value = "Izpildīts";
    sheet.getCell(headerRow, EXECUTION_COLUMNS.executedToDate).font = HEADER_FONT;
    sheet.getCell(headerRow, EXECUTION_COLUMNS.remaining).value = "Atlikums";
    sheet.getCell(headerRow, EXECUTION_COLUMNS.remaining).font = HEADER_FONT;
  }
  voColumns.forEach((col, i) => {
    const quantityCol = firstVoCol + i * 2;
    const eurCol = quantityCol + 1;
    sheet.getCell(headerRow, quantityCol).value = `${col.voNumber} ΔDaudz.`;
    sheet.getCell(headerRow, quantityCol).font = HEADER_FONT;
    sheet.getCell(headerRow, eurCol).value = `${col.voNumber} ΔEUR`;
    sheet.getCell(headerRow, eurCol).font = HEADER_FONT;
  });

  const baselineItemsById = baselineSection ? new Map(baselineSection.items.map((item) => [item.id, item])) : null;
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

    sheet.getCell(row, TAME_COLUMNS.nrPk).value = itemDisplay?.get(item.id)?.displayCode ?? item.code;
    const nameCell = sheet.getCell(row, TAME_COLUMNS.name);
    nameCell.value = item.description;
    nameCell.alignment = { wrapText: true, vertical: "top" };
    if (item.excluded) {
      // Izslēgta pozīcija (skat. BoqItem.excluded) - vizuāli marķēta ar
      // pārsvītrojumu, NEVIS teksta piedēkli aprakstā, lai atkārtots imports
      // (kas lasa "Būvdarbu nosaukums" burtiski, skat. headerDetection.ts)
      // nesabojātu aprakstu.
      nameCell.font = { ...nameCell.font, strike: true };
    }
    sheet.getCell(row, TAME_COLUMNS.unit).value = item.unit;
    const qtyCell = sheet.getCell(row, TAME_COLUMNS.quantity);
    qtyCell.value = item.quantity;
    qtyCell.numFmt = QUANTITY_FORMAT;
    if (item.excluded) {
      qtyCell.font = { ...qtyCell.font, strike: true };
    }

    if (baselineItemsById) {
      const baselineItem = baselineItemsById.get(item.id) ?? null;
      const baseQtyCell = sheet.getCell(row, VARIATION_COLUMNS.baselineQuantity);
      const deltaCell = sheet.getCell(row, VARIATION_COLUMNS.quantityDelta);
      if (baselineItem) {
        baseQtyCell.value = baselineItem.quantity;
        baseQtyCell.numFmt = QUANTITY_FORMAT;
        deltaCell.value = item.quantity - baselineItem.quantity;
        deltaCell.numFmt = QUANTITY_FORMAT;
      } else {
        baseQtyCell.value = "JAUNS";
        deltaCell.value = item.quantity;
        deltaCell.numFmt = QUANTITY_FORMAT;
      }
    }

    if (showExecution) {
      const executedToDate = computeExecutedToDate(state.executionRecords, item.id);
      const executedCell = sheet.getCell(row, EXECUTION_COLUMNS.executedToDate);
      executedCell.value = executedToDate;
      executedCell.numFmt = QUANTITY_FORMAT;
      const remainingCell = sheet.getCell(row, EXECUTION_COLUMNS.remaining);
      remainingCell.value = computeRemainingQuantity(item.quantity, executedToDate);
      remainingCell.numFmt = QUANTITY_FORMAT;
    }

    const impacts = itemDisplay?.get(item.id)?.impacts ?? [];
    voColumns.forEach((col, voColIndex) => {
      const impact = impacts.find((i) => i.voId === col.voId);
      const quantityCell = sheet.getCell(row, firstVoCol + voColIndex * 2);
      const eurCell = sheet.getCell(row, firstVoCol + voColIndex * 2 + 1);
      if (!impact) {
        quantityCell.value = "-";
        eurCell.value = "-";
      } else if (impact.isNew) {
        quantityCell.value = `JAUNS: ${impact.quantityDelta}`;
        eurCell.value = impact.directTotalDelta;
        eurCell.numFmt = MONEY_FORMAT;
      } else {
        quantityCell.value = impact.quantityDelta;
        quantityCell.numFmt = QUANTITY_FORMAT;
        eurCell.value = impact.directTotalDelta;
        eurCell.numFmt = MONEY_FORMAT;
      }
    });

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

  const signatureEndRow = writeSignatureBlock(sheet, directTotalRow + 2, state, TAME_COLUMNS.name, TAME_COLUMNS.totalLabor);

  for (const row of sheet.getRows(1, signatureEndRow) ?? []) {
    row?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }

  return directTotalRow;
}

const VO_STATUS_LABELS: Record<VariationOrder["status"], string> = {
  proposed: "Ierosināts",
  approved: "Apstiprināts",
  rejected: "Noraidīts",
  voided: "Anulēts",
};

// Two logical tables (VO reģistrs, mainīto pozīciju saraksts) are stacked in
// the same worksheet and therefore share columns 1-9 despite having
// different meanings per table (e.g. col. 1 is "Nr." (VO number) in the
// register but "Sadaļa" in the diff table) - widths below are picked wide
// enough for whichever table's content in that column is longer; a
// too-narrow value clips text, a too-wide one is only extra whitespace, so
// erring wide is the safe choice.
const VARIATION_ORDERS_SHEET_COLUMN_WIDTHS = [20, 12, 40, 28, 36, 16, 22, 10, 20];

/**
 * Writes the "IZMAIŅAS" worksheet - a VO reģistrs (one row per Variation
 * Order: number/date/status/title/justification/instructedBy and this VO's
 * own impact on tiešās izmaksas, see computeVariationOrderDirectTotalImpact)
 * followed by a table of every pozīcija that differs from the frozen bāze
 * (see diffAgainstBaseline) after applying all APPROVED VO - i.e. exactly
 * what's currently rendered in the section sheets, and OPTIONALLY (see
 * includeReserveRegister) a third "Pasūtītāja rezerve" table
 * (computeReserveBalance). Only called when the project has at least one VO
 * (see exportBoqToWorkbook) - a project that never used this feature gets no
 * extra sheet, keeping its export unchanged.
 */
function writeVariationOrdersSheet(
  workbook: ExcelJS.Workbook,
  state: BoqState,
  baselineSections: BoqSection[],
  currentSections: BoqSection[],
  includeReserveRegister: boolean,
): void {
  const sheet = workbook.addWorksheet("IZMAIŅAS");
  VARIATION_ORDERS_SHEET_COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  const headerLines = writeProjectHeaderBlock(sheet, state, 2, 7);
  let row = headerLines + 2; // viena tukša atdalītājrinda

  sheet.getCell(row, 1).value = "Izmaiņu reģistrs";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const registerHeaderRow = row;
  const registerHeaders = [
    "Nr.",
    "Datums",
    "Statuss",
    "Nosaukums",
    "Pamatojums",
    "Instruēja",
    "Ietekme uz tiešajām izmaksām (EUR)",
  ];
  registerHeaders.forEach((label, i) => {
    const cell = sheet.getCell(registerHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const firstVoRow = row;
  state.variationOrders.forEach((vo, i) => {
    const r = firstVoRow + i;
    sheet.getCell(r, 1).value = vo.number;
    sheet.getCell(r, 2).value = vo.date;
    sheet.getCell(r, 3).value = VO_STATUS_LABELS[vo.status];
    sheet.getCell(r, 4).value = vo.title;
    const justificationCell = sheet.getCell(r, 5);
    justificationCell.value = vo.justification;
    justificationCell.alignment = { wrapText: true, vertical: "top" };
    sheet.getCell(r, 6).value = vo.instructedBy;
    const impactCell = sheet.getCell(r, 7);
    impactCell.value = computeVariationOrderDirectTotalImpact(baselineSections, state.variationOrders, vo.id);
    impactCell.numFmt = MONEY_FORMAT;
  });
  row = firstVoRow + state.variationOrders.length + 1; // + viena tukša atdalītājrinda

  sheet.getCell(row, 1).value = "Mainītās pozīcijas (bāze -> pašreizējais)";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const diffHeaderRow = row;
  const diffHeaders = [
    "Sadaļa",
    "Nr.",
    "Nosaukums",
    "Mērv.",
    "Bāzes daudzums",
    "Pašreizējais daudzums",
    "Delta",
    "Izslēgts",
    "Tiešo izmaksu delta (EUR)",
  ];
  diffHeaders.forEach((label, i) => {
    const cell = sheet.getCell(diffHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const diffRows = diffAgainstBaseline(baselineSections, currentSections);
  diffRows.forEach((diffRow, i) => {
    const r = row + i;
    sheet.getCell(r, 1).value = diffRow.sectionName;
    sheet.getCell(r, 2).value = diffRow.code;
    const nameCell = sheet.getCell(r, 3);
    nameCell.value = diffRow.description;
    nameCell.alignment = { wrapText: true, vertical: "top" };

    const baseCell = sheet.getCell(r, 5);
    if (diffRow.baselineQuantity === null) {
      baseCell.value = "JAUNS";
    } else {
      baseCell.value = diffRow.baselineQuantity;
      baseCell.numFmt = QUANTITY_FORMAT;
    }
    sheet.getCell(r, 4).value = diffRow.unit;

    const currentCell = sheet.getCell(r, 6);
    currentCell.value = diffRow.currentQuantity;
    currentCell.numFmt = QUANTITY_FORMAT;

    const deltaCell = sheet.getCell(r, 7);
    deltaCell.value = diffRow.quantityDelta;
    deltaCell.numFmt = QUANTITY_FORMAT;

    sheet.getCell(r, 8).value = diffRow.excluded ? "Jā" : "Nē";

    const costDeltaCell = sheet.getCell(r, 9);
    costDeltaCell.value = diffRow.directTotalDelta;
    costDeltaCell.numFmt = MONEY_FORMAT;
  });
  row += diffRows.length;

  let lastRow = row - 1;
  if (includeReserveRegister) {
    lastRow = writeReserveRegisterTable(sheet, state, baselineSections, row + 1);
  }

  for (const sheetRow of sheet.getRows(1, lastRow) ?? []) {
    sheetRow?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }
}

/**
 * Writes the "Pasūtītāja rezerve" table (computeReserveBalance) with its
 * title at `titleRow`, as a third logical table stacked in the "IZMAIŅAS"
 * sheet - same columns-shared-between-tables tradeoff as the VO reģistrs/
 * diff table above (see VARIATION_ORDERS_SHEET_COLUMN_WIDTHS). Written ONLY
 * when the caller opts in (see writeVariationOrdersSheet
 * includeReserveRegister) - this is internal contractor-side tracking, not
 * something every export should carry by default. Returns the last row
 * written, for the caller's font-normalization pass.
 */
function writeReserveRegisterTable(sheet: ExcelJS.Worksheet, state: BoqState, baselineSections: BoqSection[], titleRow: number): number {
  let row = titleRow;

  sheet.getCell(row, 1).value = "Pasūtītāja rezerve";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const balance = computeReserveBalance(baselineSections, state.variationOrders);

  const summaryCell = sheet.getCell(row, 1);
  summaryCell.value = `Uzkrāts: ${balance.totalAccumulated.toFixed(2)} € · Izmantots: ${balance.totalDrawn.toFixed(2)} € · Atlikums: ${balance.available.toFixed(2)} €`;
  summaryCell.font = HEADER_FONT;
  row += 2;

  const registerHeaderRow = row;
  const registerHeaders = ["VO", "Nosaukums", "Ietekme (EUR)", "Papildina rezervi (EUR)", "Izmanto no rezerves (EUR)", "Atlikums pēc (EUR)"];
  registerHeaders.forEach((label, i) => {
    const cell = sheet.getCell(registerHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const firstEntryRow = row;
  balance.entries.forEach((entry, i) => {
    const r = firstEntryRow + i;
    sheet.getCell(r, 1).value = entry.voNumber;
    sheet.getCell(r, 2).value = entry.voTitle;
    for (const [col, value] of [
      [3, entry.directTotalImpact],
      [4, entry.contribution],
      [5, entry.drawdown],
      [6, entry.balanceAfter],
    ] as const) {
      const cell = sheet.getCell(r, col);
      cell.value = value;
      cell.numFmt = MONEY_FORMAT;
    }
  });

  return firstEntryRow + balance.entries.length - 1;
}

// Shares columns 1-5 between two logical tables (akta reģistrs, izpildes
// pārskats), same tradeoff as VARIATION_ORDERS_SHEET_COLUMN_WIDTHS - widths
// picked wide enough for whichever table's content in that column is longer.
const EXECUTION_RECORDS_SHEET_COLUMN_WIDTHS = [20, 12, 32, 18, 20, 16, 12, 20];

/**
 * Writes the "IZPILDES AKTI" worksheet - an akta reģistrs (one row per
 * ExecutionRecord: period/datums/apstiprināja/pozīciju skaits/šī akta EUR
 * vērtība, see computeExecutionRecordValue) followed by a pārskata table of
 * every pozīcija with at least some execution (see computeExecutionOverview).
 * Only called when the project has at least one execution record (see
 * exportBoqToWorkbook) - a project that never used this feature gets no
 * extra sheet, keeping its export unchanged.
 */
function writeExecutionRecordsSheet(workbook: ExcelJS.Workbook, state: BoqState, currentSections: BoqSection[]): void {
  const sheet = workbook.addWorksheet("IZPILDES AKTI");
  EXECUTION_RECORDS_SHEET_COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  const headerLines = writeProjectHeaderBlock(sheet, state, 2, 7);
  let row = headerLines + 2; // viena tukša atdalītājrinda

  sheet.getCell(row, 1).value = "Izpildes aktu reģistrs";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const registerHeaderRow = row;
  const registerHeaders = ["Periods", "Datums", "Apstiprināja", "Pozīciju skaits", "Akta vērtība (EUR)", "Statuss"];
  registerHeaders.forEach((label, i) => {
    const cell = sheet.getCell(registerHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const currentItemsById = new Map<string, BoqItem>(currentSections.flatMap((s) => s.items.map((item) => [item.id, item] as const)));

  const firstRecordRow = row;
  state.executionRecords.forEach((record: ExecutionRecord, i) => {
    const r = firstRecordRow + i;
    sheet.getCell(r, 1).value = record.period;
    sheet.getCell(r, 2).value = record.date;
    sheet.getCell(r, 3).value = record.approvedBy;
    sheet.getCell(r, 4).value = record.entries.length;
    const valueCell = sheet.getCell(r, 5);
    valueCell.value = computeExecutionRecordValue(record, currentItemsById);
    valueCell.numFmt = MONEY_FORMAT;
    // Anulēts akts paliek reģistrā (audit trail), bet nav ieskaitīts pārskata
    // tabulā zemāk (skat. computeExecutedToDate) - "Statuss" kolonna to padara
    // redzamu arī šeit, nevis tikai UI, skat. models/executionRecord.ts.
    sheet.getCell(r, 6).value = record.voidedAt ? "Anulēts" : "Aktīvs";
  });
  row = firstRecordRow + state.executionRecords.length + 1; // + viena tukša atdalītājrinda

  sheet.getCell(row, 1).value = "Izpildes pārskats (pozīcijas ar izpildi)";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const overviewHeaderRow = row;
  const overviewHeaders = [
    "Sadaļa",
    "Nr.",
    "Nosaukums",
    "Mērv.",
    "Pašreizējais daudzums",
    "Izpildīts līdz šim",
    "Atlikums",
    "Izpildītā vērtība (EUR)",
  ];
  overviewHeaders.forEach((label, i) => {
    const cell = sheet.getCell(overviewHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const overviewRows = computeExecutionOverview(currentSections, state.executionRecords);
  overviewRows.forEach((overviewRow, i) => {
    const r = row + i;
    sheet.getCell(r, 1).value = overviewRow.sectionName;
    sheet.getCell(r, 2).value = overviewRow.code;
    const nameCell = sheet.getCell(r, 3);
    nameCell.value = overviewRow.description;
    nameCell.alignment = { wrapText: true, vertical: "top" };
    sheet.getCell(r, 4).value = overviewRow.unit;

    const currentCell = sheet.getCell(r, 5);
    currentCell.value = overviewRow.currentQuantity;
    currentCell.numFmt = QUANTITY_FORMAT;

    const executedCell = sheet.getCell(r, 6);
    executedCell.value = overviewRow.executedToDate;
    executedCell.numFmt = QUANTITY_FORMAT;

    const remainingCell = sheet.getCell(r, 7);
    remainingCell.value = overviewRow.remainingQuantity;
    remainingCell.numFmt = QUANTITY_FORMAT;

    const valueCell = sheet.getCell(r, 8);
    valueCell.value = overviewRow.executedValue;
    valueCell.numFmt = MONEY_FORMAT;
  });

  const lastRow = row + overviewRows.length;
  for (const sheetRow of sheet.getRows(1, lastRow) ?? []) {
    sheetRow?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }
}

// Cilvēklasāms LV teksts katram AuditEventType - lieto gan UI (AuditLog.tsx),
// gan šī Excel lapa, lai abi rādītu identisku formulējumu (skat. CLAUDE.md
// "Audita žurnāls (Sesija 28)").
const AUDIT_EVENT_LABELS: Record<AuditEventType, string> = {
  baseline_approved: "Bāzes tāme iesaldēta",
  vo_proposed: "VO ierosināta",
  vo_approved: "VO apstiprināta",
  vo_rejected: "VO noraidīta",
  vo_voided: "VO anulēta",
  execution_record_created: "Izpildes akts izveidots",
  execution_record_voided: "Izpildes akts anulēts",
};

const AUDIT_LOG_SHEET_COLUMN_WIDTHS = [14, 26, 16, 20, 40];

/**
 * Writes the "VĒSTURE" worksheet - VIENA hronoloģiska tabula, kas apvieno
 * bāzes iesaldēšanu, katras VO statusa maiņu, un katra izpildes akta
 * izveidi/anulēšanu (skat. computeAuditLog un CLAUDE.md "Audita žurnāls
 * (Sesija 28)"). Only called when computeAuditLog returns at least one event
 * (see exportBoqToWorkbook) - praksē vienmēr, kad ir iesaldēta bāze.
 */
function writeAuditLogSheet(workbook: ExcelJS.Workbook, state: BoqState, events: AuditEvent[]): void {
  const sheet = workbook.addWorksheet("VĒSTURE");
  AUDIT_LOG_SHEET_COLUMN_WIDTHS.forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });

  const headerLines = writeProjectHeaderBlock(sheet, state, 2, 7);
  let row = headerLines + 2; // viena tukša atdalītājrinda

  sheet.getCell(row, 1).value = "Audita žurnāls";
  sheet.getCell(row, 1).font = { ...HEADER_FONT, size: 13 };
  row += 2;

  const tableHeaderRow = row;
  ["Datums", "Notikums", "Atsauce", "Persona", "Piezīme"].forEach((label, i) => {
    const cell = sheet.getCell(tableHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });
  row += 1;

  const firstEventRow = row;
  events.forEach((event, i) => {
    const r = firstEventRow + i;
    sheet.getCell(r, 1).value = event.date;
    sheet.getCell(r, 2).value = AUDIT_EVENT_LABELS[event.type];
    sheet.getCell(r, 3).value = event.refLabel;
    sheet.getCell(r, 4).value = event.actor ?? "-";
    sheet.getCell(r, 5).value = event.detail ?? "-";
  });

  const lastRow = firstEventRow + events.length - 1;
  for (const sheetRow of sheet.getRows(1, lastRow) ?? []) {
    sheetRow?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }
}

export interface ExportOptions {
  /**
   * Whether to include the "Pasūtītāja rezerve" register/summary table in
   * the "IZMAIŅAS" sheet (see writeReserveRegisterTable). Defaults to
   * `false` - the reserve is internal contractor-side tracking (skat.
   * CLAUDE.md "Pasūtītāja rezerve (Sesija 26)"), not something every export
   * should carry automatically; opt in explicitly (packages/web exposes
   * this as a checkbox next to the export button).
   */
  includeReserveRegister?: boolean;
}

export function exportBoqToWorkbook(state: BoqState, options: ExportOptions = {}): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "tames-modulis";
  workbook.created = new Date(state.updatedAt);

  const summary = workbook.addWorksheet("KOPSAVILKUMS");
  SUMMARY_COLUMN_WIDTHS.forEach((width, i) => {
    summary.getColumn(i + 1).width = width;
  });

  const headerLines = writeProjectHeaderBlock(summary, state, 2, 7);
  const ratesStartRow = headerLines + 2; // one blank separator row
  const discountRateRow = ratesStartRow;
  const overheadRateRow = ratesStartRow + 1;
  const profitRateRow = ratesStartRow + 2;
  const vatRateRow = ratesStartRow + 3;

  summary.getCell(discountRateRow, 1).value = "Atlaides likme:";
  summary.getCell(discountRateRow, 2).value = state.discountRate;
  summary.getCell(discountRateRow, 2).numFmt = PERCENT_FORMAT;

  summary.getCell(overheadRateRow, 1).value = "Virsizdevumu likme:";
  summary.getCell(overheadRateRow, 2).value = state.overheadRate;
  summary.getCell(overheadRateRow, 2).numFmt = PERCENT_FORMAT;

  summary.getCell(profitRateRow, 1).value = "Peļņas likme:";
  summary.getCell(profitRateRow, 2).value = state.profitRate;
  summary.getCell(profitRateRow, 2).numFmt = PERCENT_FORMAT;

  summary.getCell(vatRateRow, 1).value = "PVN likme:";
  summary.getCell(vatRateRow, 2).value = state.vatRate;
  summary.getCell(vatRateRow, 2).numFmt = PERCENT_FORMAT;

  // Rādīts TIKAI KOPSAVILKUMS lapā (nevis katrā sadaļu/IZMAIŅAS/IZPILDES
  // AKTI/VĒSTURE lapā, kur writeProjectHeaderBlock arī tiek izsaukts) -
  // simetriski ar to, kā pārējie "pieņēmumu" lauki (Atlaides/Virsizdevumu/
  // Peļņas/PVN likme) jau ir TIKAI šeit, nevis katrā lapā. Raw ISO datums
  // (ne toLocaleDateString), konsekventi ar to, kā šis fails jau raksta
  // citus datumus (VO/akta ieraksti "IZMAIŅAS"/"IZPILDES AKTI"/"VĒSTURE"
  // lapās) - skat. CLAUDE.md "Bāzes apstiprinātājs (Sesija 29)".
  // A frozen baseline (state.baselineApprovedAt !== null) means state.sections
  // IS the bāze (never mutated after freeze, see models/boq.ts) - declared
  // here (not further below, where it used to be) so both this block and the
  // per-sadaļa rendering below can use the same flag.
  const hasBaseline = state.baselineApprovedAt !== null;
  if (hasBaseline) {
    const baselineDateRow = vatRateRow + 1;
    const baselineByRow = vatRateRow + 2;
    summary.getCell(baselineDateRow, 1).value = "Bāzes tāme apstiprināta:";
    summary.getCell(baselineDateRow, 2).value = state.baselineApprovedAt as string;
    summary.getCell(baselineByRow, 1).value = "Apstiprināja:";
    summary.getCell(baselineByRow, 2).value = state.baselineApprovedBy ?? "-";
  }

  const tableHeaderRow = vatRateRow + (hasBaseline ? 4 : 2); // rate rows + optional baseline rows + one blank separator row
  [
    "Sadaļa",
    "Tiešās izmaksas",
    "Atlaide",
    "Tiešās izmaksas pēc atlaides",
    "Virsizdevumi",
    "Peļņa",
    "Pavisam (bez PVN)",
  ].forEach((label, i) => {
    const cell = summary.getCell(tableHeaderRow, i + 1);
    cell.value = label;
    cell.font = HEADER_FONT;
  });

  const usedSheetNames = new Set<string>(["KOPSAVILKUMS", "IZMAIŅAS", "IZPILDES AKTI", "VĒSTURE"]);
  // The sheets below render the CURRENT scope (bāze + apstiprinātās VO),
  // matching real FIDIC practice where the working tāme reflects approved
  // changes while a separate register documents them (see
  // writeVariationOrdersSheet). Without a frozen baseline, state.sections is
  // just the (draft) tāme as always. (hasBaseline itself is declared above,
  // next to the KOPSAVILKUMS rates block, where it's also needed.)
  const approvedVariationOrders = state.variationOrders.filter((vo) => vo.status === "approved");
  const currentSections = hasBaseline ? deriveCurrentSections(state.sections, approvedVariationOrders) : state.sections;
  const exportState: BoqState = hasBaseline ? { ...state, sections: currentSections } : state;
  // Looked up by id, NOT array index - a VO can add a brand-new section
  // (see models/variationOrder.ts VariationOrderChange.newSection), which
  // would misalign index-based lookup for that section and everything after
  // it. A section with no baseline counterpart (the new one itself) gets
  // `null` here, same as the whole no-baseline-yet case.
  const baselineSectionsById = new Map(state.sections.map((s) => [s.id, s]));
  // Same computation as ProjectEditor.tsx's `itemDisplay` - derived ONCE over
  // the whole bāze + approved VO list (skat. "Pozīciju numerācija + VO
  // izmaiņu vēsture (Sesija 24)"), so section sheets show the same displayCode/
  // VO-delta columns as the "Tāme" cilne. `null` (not just an empty Map)
  // when there's no baseline yet, matching the same `hasBaseline` gate used
  // everywhere else in this function.
  const itemDisplay = hasBaseline ? computeItemCodesAndHistory(state.sections, approvedVariationOrders) : null;

  const boqSummary = summarizeBoq(exportState);
  const firstSectionRow = tableHeaderRow + 1;

  currentSections.forEach((section, i) => {
    const sheetName = sanitizeSheetName(section.name, usedSheetNames);
    // A brand-new section (added by a VO, see VariationOrderChange.newSection)
    // has no baseline counterpart - use a synthetic empty one instead of
    // `null` so the "Bāzes daudzums"/"Delta" columns still render (every item
    // in it correctly shows as "JAUNS"), consistent with every other sheet in
    // this export rather than silently differing for this one sheet.
    const baselineSection = hasBaseline
      ? (baselineSectionsById.get(section.id) ?? { id: section.id, name: section.name, estimateNumber: section.estimateNumber, items: [] })
      : null;
    // This section's relevant approved VO (same filter as ProjectEditor.tsx
    // voColumns) - only VO that actually changed/added an item IN this
    // section get a column pair here, so an unaffected section's sheet
    // doesn't grow empty "-" columns for every VO in the whole project.
    const sectionVoColumns = itemDisplay
      ? approvedVariationOrders
          .filter((vo) => section.items.some((item) => itemDisplay.get(item.id)?.impacts.some((impact) => impact.voId === vo.id)))
          .map((vo) => ({ voId: vo.id, voNumber: vo.number }))
      : [];
    const directTotalRow = writeSectionSheet(workbook, sheetName, section, exportState, baselineSection, itemDisplay, sectionVoColumns);
    const row = firstSectionRow + i;
    const sectionSummary = boqSummary.sections[i];

    summary.getCell(row, 1).value = section.name;
    summary.getCell(row, 2).value = {
      formula: `${quoteSheetName(sheetName)}!${colLetter(TAME_COLUMNS.totalAll)}${directTotalRow}`,
      result: sectionSummary.directTotal,
    };
    summary.getCell(row, 3).value = {
      formula: `B${row}*$B$${discountRateRow}`,
      result: sectionSummary.discountAmount,
    };
    summary.getCell(row, 4).value = { formula: `B${row}-C${row}`, result: sectionSummary.directTotalAfterDiscount };
    summary.getCell(row, 5).value = { formula: `D${row}*$B$${overheadRateRow}`, result: sectionSummary.overhead };
    summary.getCell(row, 6).value = { formula: `D${row}*$B$${profitRateRow}`, result: sectionSummary.profit };
    summary.getCell(row, 7).value = {
      formula: `D${row}+E${row}+F${row}`,
      result: sectionSummary.totalWithMarkup,
    };

    for (const col of [2, 3, 4, 5, 6, 7]) {
      summary.getCell(row, col).numFmt = MONEY_FORMAT;
    }
  });

  const lastSectionRow = firstSectionRow + currentSections.length - 1;
  const totalsRow = firstSectionRow + currentSections.length;
  summary.getCell(totalsRow, 1).value = "KOPĀ";
  summary.getCell(totalsRow, 1).font = HEADER_FONT;

  const totalsResults = [
    boqSummary.directTotal,
    boqSummary.discountAmount,
    boqSummary.directTotalAfterDiscount,
    boqSummary.overhead,
    boqSummary.profit,
    boqSummary.subtotal,
  ];
  for (const col of [2, 3, 4, 5, 6, 7]) {
    const cell = summary.getCell(totalsRow, col);
    if (currentSections.length > 0) {
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
  const vatCell = summary.getCell(vatRow, 7);
  vatCell.value = { formula: `G${totalsRow}*$B$${vatRateRow}`, result: boqSummary.vatAmount };
  vatCell.numFmt = MONEY_FORMAT;

  const grandTotalRow = vatRow + 1;
  summary.getCell(grandTotalRow, 1).value = "KOPĀ AR PVN";
  summary.getCell(grandTotalRow, 1).font = HEADER_FONT;
  const grandTotalCell = summary.getCell(grandTotalRow, 7);
  grandTotalCell.value = { formula: `G${totalsRow}+G${vatRow}`, result: boqSummary.total };
  grandTotalCell.numFmt = MONEY_FORMAT;
  grandTotalCell.font = HEADER_FONT;

  const signatureEndRow = writeSignatureBlock(summary, grandTotalRow + 2, state, 2, 7);

  for (const row of summary.getRows(1, signatureEndRow) ?? []) {
    row?.eachCell({ includeEmpty: false }, (cell) => {
      cell.font = { ...cell.font, name: "Arial" };
    });
  }

  if (state.variationOrders.length > 0) {
    writeVariationOrdersSheet(workbook, state, state.sections, currentSections, options.includeReserveRegister ?? false);
  }

  if (state.executionRecords.length > 0) {
    writeExecutionRecordsSheet(workbook, state, currentSections);
  }

  const auditEvents = computeAuditLog(state);
  if (auditEvents.length > 0) {
    writeAuditLogSheet(workbook, state, auditEvents);
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
export async function exportBoqToBuffer(state: BoqState, options: ExportOptions = {}): Promise<ArrayBuffer> {
  const workbook = exportBoqToWorkbook(state, options);
  return workbook.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>;
}
