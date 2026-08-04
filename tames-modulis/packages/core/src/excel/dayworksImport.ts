import type ExcelJS from "exceljs";
import type { BoqItem } from "../models/boq.js";
import { cellNumber, cellText } from "./cellValue.js";
import { isKnownUnit } from "./columns.js";
import type { DetectedDayworksColumns } from "./headerDetection.js";

type DayworksCategory = "labor" | "materials" | "mechanisms";

/**
 * Which BoqItem cost field a row's single "Rate (euro/h)" value lands in,
 * tracked by scanning for the sheet's own free-text section headers
 * ("LABOUR ON SITE" / "MATERIAL DELIVERED TO SITE" / "PLANT HIRE" - a real
 * FIDIC Dayworks Schedule's own section titles, not something we invented) as
 * rows are scanned top to bottom. Defaults to "labor" until the first section
 * header is seen - never actually reached in the real file (its first rated
 * rows all sit under "LABOUR ON SITE"), but a row before any header landing
 * somewhere is safer than landing nowhere.
 */
function detectCategory(nameText: string, current: DayworksCategory): DayworksCategory {
  const upper = nameText.toUpperCase();
  if (upper.includes("LABOUR")) return "labor";
  if (upper.includes("MATERIAL")) return "materials";
  if (upper.includes("PLANT")) return "mechanisms";
  return current;
}

/**
 * Reads a FIDIC-style Dayworks Schedule sheet (columns, see
 * detectDayworksColumns) into BoqItems - a real bilingual Bill of Quantities
 * file's "B Day works" page, uploaded for reference rather than as priced
 * work: every row is a standing labour/material/plant RATE (e.g. "Semi-
 * skilled labourers, hr, 19"), with Quantity always blank - nothing has
 * actually been ordered against these rates yet, they exist so an agreed
 * unit price is already on record if dayworks are later instructed via a
 * Variation Order.
 *
 * quantity is always imported as 0 - this file has no real ordered quantity
 * to import (confirmed against the real file: its own page-collection rows
 * literally read "Rate Only", meaning it deliberately carries no priced
 * total) - so these items never contribute to any cost total, matching that
 * "informational, not priced work" semantics exactly. The rate itself is
 * still preserved, in whichever of unitLaborCost/unitMaterialsCost/
 * unitMechanismsCost matches the section it was quoted under (see
 * detectCategory), so it's visible for later reference in the UI/Excel
 * export - a Profit/Overhead percentage row (unit "%") isn't a real unit and
 * is correctly skipped by the same isKnownUnit gate every other sheet uses.
 */
export function parseDayworksItems(sheet: ExcelJS.Worksheet, columns: DetectedDayworksColumns): BoqItem[] {
  const items: BoqItem[] = [];
  let category: DayworksCategory = "labor";

  sheet.eachRow((row) => {
    const nameText = cellText(row.getCell(columns.name)).trim();
    category = detectCategory(nameText, category);

    const unitText = cellText(row.getCell(columns.unit)).trim();
    if (!isKnownUnit(unitText)) return;

    const rate = cellNumber(row.getCell(columns.rate));
    items.push({
      id: crypto.randomUUID(),
      code: cellText(row.getCell(columns.nrPk)).trim(),
      description: nameText,
      unit: unitText,
      quantity: 0,
      unitLaborCost: category === "labor" ? rate : 0,
      unitMaterialsCost: category === "materials" ? rate : 0,
      unitMechanismsCost: category === "mechanisms" ? rate : 0,
    });
  });

  return items;
}
