import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseDayworksItems } from "../src/excel/dayworksImport.js";
import { detectDayworksColumns, detectImportColumns } from "../src/excel/headerDetection.js";

/**
 * Builds a sheet mirroring the real "B Day works" page of a bilingual (LV/EN)
 * Bill of Quantities file: No./Name of construction work/Unit/Quantity/Rate
 * (euro/h) headers, free-text section titles ("LABOUR ON SITE" etc.)
 * grouping the rated rows that follow, and Quantity always blank (a standing
 * reference rate, not an ordered quantity).
 */
function buildDayworksSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet("B Day works");
  sheet.getCell(11, 1).value = "No.";
  sheet.getCell(11, 2).value = "Name of construction work";
  sheet.getCell(11, 3).value = "Unit";
  sheet.getCell(11, 4).value = "Quantity";
  sheet.getCell(11, 5).value = "Rate (euro/h)";

  sheet.getCell(20, 2).value = "LABOUR ON SITE";
  sheet.getCell(21, 1).value = "A";
  sheet.getCell(21, 2).value = "Semi-skilled labourers";
  sheet.getCell(21, 3).value = "hr";
  sheet.getCell(21, 5).value = 19;
  sheet.getCell(22, 1).value = "P";
  sheet.getCell(22, 2).value = "Allow for Profit and Overhead on labour";
  sheet.getCell(22, 3).value = "%";
  sheet.getCell(22, 5).value = 15;

  sheet.getCell(30, 2).value = "MATERIAL DELIVERED TO SITE";
  sheet.getCell(31, 1).value = "A";
  sheet.getCell(31, 2).value = "Cement (Sulphate resistant)";
  sheet.getCell(31, 3).value = "bag";
  sheet.getCell(31, 5).value = 10;

  sheet.getCell(40, 2).value = "PLANT HIRE";
  sheet.getCell(41, 1).value = "A";
  sheet.getCell(41, 2).value = "Piling rig";
  sheet.getCell(41, 3).value = "hr";
  sheet.getCell(41, 5).value = 197;

  return sheet;
}

describe("detectDayworksColumns", () => {
  it("finds columns by header text on a Rate-only sheet", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildDayworksSheet(workbook);

    expect(detectDayworksColumns(sheet)).toEqual({ nrPk: 1, name: 2, unit: 3, quantity: 4, rate: 5 });
  });

  it("returns null for a sheet with no recognizable header", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("saturs");
    sheet.getCell(1, 1).value = "Saturs";
    expect(detectDayworksColumns(sheet)).toBeNull();
  });

  it("a sheet with the standard 7-column layout is NOT also picked up as Dayworks (no Rate column there)", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("2-10");
    sheet.getCell(1, 1).value = "Nr.p.k.";
    sheet.getCell(1, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(1, 4).value = "Mērvienība";
    sheet.getCell(1, 5).value = "Daudzums";
    sheet.getCell(1, 8).value = "Darba alga";
    sheet.getCell(1, 9).value = "Materiāli";
    sheet.getCell(1, 10).value = "Mehānismi";

    expect(detectImportColumns(sheet)).not.toBeNull();
    expect(detectDayworksColumns(sheet)).toBeNull();
  });
});

describe("parseDayworksItems", () => {
  it("imports every rated row at quantity 0, bucketing the single Rate into the section it was quoted under", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildDayworksSheet(workbook);
    const columns = detectDayworksColumns(sheet)!;

    const items = parseDayworksItems(sheet, columns);

    expect(items).toEqual([
      expect.objectContaining({
        code: "A",
        description: "Semi-skilled labourers",
        unit: "hr",
        quantity: 0,
        unitLaborCost: 19,
        unitMaterialsCost: 0,
        unitMechanismsCost: 0,
      }),
      expect.objectContaining({
        code: "A",
        description: "Cement (Sulphate resistant)",
        unit: "bag",
        quantity: 0,
        unitLaborCost: 0,
        unitMaterialsCost: 10,
        unitMechanismsCost: 0,
      }),
      expect.objectContaining({
        code: "A",
        description: "Piling rig",
        unit: "hr",
        quantity: 0,
        unitLaborCost: 0,
        unitMaterialsCost: 0,
        unitMechanismsCost: 197,
      }),
    ]);
  });

  it("skips a Profit/Overhead percentage row - '%' isn't a known unit, same gate every sheet uses", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = buildDayworksSheet(workbook);
    const columns = detectDayworksColumns(sheet)!;

    const items = parseDayworksItems(sheet, columns);

    expect(items.some((it) => it.unit === "%")).toBe(false);
    expect(items).toHaveLength(3);
  });
});
