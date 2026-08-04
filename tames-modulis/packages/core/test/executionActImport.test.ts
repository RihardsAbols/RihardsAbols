import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { detectExecutionActColumns } from "../src/excel/headerDetection.js";
import { matchExecutionActToProject, parseExecutionActWorkbook, suggestSheetToSectionMapping } from "../src/excel/executionActImport.js";
import type { ParsedExecutionActSheet } from "../src/excel/executionActImport.js";
import type { BoqItem, BoqSection } from "../src/models/boq.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1",
    description: "Pozīcija",
    unit: "m3",
    quantity: 100,
    unitLaborCost: 5,
    unitMaterialsCost: 3,
    unitMechanismsCost: 2,
    ...overrides,
  };
}

/**
 * Builds a sheet mirroring the real Forma Nr.2/Nr.3 layout seen in a real
 * izpildes akts (PSKUS 2021-02): a multi-row merged header where "Izpildīts
 * atskaites periodā" spans two columns (Daudzums, Summa) starting at
 * `executedCol`, and the position of that header shifts between sheets
 * depending on whether the sheet's cost-breakdown includes an extra "laika
 * norma" sub-group (29 vs. 33 in the real file) - `executedCol` is
 * parameterized to reproduce exactly that.
 */
function buildAktsSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  executedCol: number,
  rows: Array<{ nrPk: number; name: string; unit: string; executedQuantity: number | null }>,
): void {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getCell(1, 1).value = `AKTS par izpildītajiem darbiem, ${sheetName}`;
  sheet.getCell(3, 1).value = "Nr. p.k.";
  sheet.getCell(3, 2).value = "Kods";
  sheet.getCell(3, 3).value = "Būvdarbu nosaukums";
  sheet.getCell(3, 5).value = "Mērvienība";
  sheet.getCell(3, 15).value = "Daudzums";
  sheet.getCell(3, executedCol - 2).value = "Izpildīts līdz atskaites periodam";
  sheet.getCell(3, executedCol).value = "Izpildīts atskaites periodā";
  sheet.getCell(3, executedCol + 2).value = "Izpildīts kopā";
  sheet.getCell(4, executedCol).value = "Daudzums";
  sheet.getCell(4, executedCol + 1).value = "Summa (EUR)";

  rows.forEach((row, i) => {
    const r = 5 + i;
    sheet.getCell(r, 1).value = row.nrPk;
    sheet.getCell(r, 2).value = `T:1-1, R:${row.nrPk}`;
    sheet.getCell(r, 3).value = row.name;
    sheet.getCell(r, 5).value = row.unit;
    sheet.getCell(r, 15).value = 100;
    if (row.executedQuantity !== null) {
      sheet.getCell(r, executedCol).value = row.executedQuantity;
    }
  });
}

describe("detectExecutionActColumns", () => {
  it("finds columns by header text, at whatever column the sheet happens to use", () => {
    const workbook = new ExcelJS.Workbook();
    buildAktsSheet(workbook, "DEM", 33, [{ nrPk: 1, name: "Darbs", unit: "m3", executedQuantity: 40 }]);
    buildAktsSheet(workbook, "KARK", 29, [{ nrPk: 1, name: "Darbs", unit: "m3", executedQuantity: 40 }]);

    const demColumns = detectExecutionActColumns(workbook.getWorksheet("DEM")!);
    expect(demColumns).toEqual({ nrPk: 1, name: 3, unit: 5, executedThisPeriod: 33 });

    const karkColumns = detectExecutionActColumns(workbook.getWorksheet("KARK")!);
    expect(karkColumns).toEqual({ nrPk: 1, name: 3, unit: 5, executedThisPeriod: 29 });
  });

  it("returns null for a sheet with no recognizable header (rollup/summary tab)", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("saturs");
    sheet.getCell(1, 1).value = "Satura rādītājs";
    expect(detectExecutionActColumns(sheet)).toBeNull();
  });

  it("finds the nrPk column when the header reads 'N.p.k./No' (bilingual LV/EN file, no 'r')", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("2-10");
    sheet.getCell(3, 1).value = "N.p.k./No";
    sheet.getCell(3, 3).value = "Būvdarbu nosaukums/Description of the construction work";
    sheet.getCell(3, 5).value = "Mērvienība/ Unit";
    sheet.getCell(3, 33).value = "Izpildīts atskaites periodā";

    expect(detectExecutionActColumns(sheet)).toEqual({ nrPk: 1, name: 3, unit: 5, executedThisPeriod: 33 });
  });
});

describe("parseExecutionActWorkbook", () => {
  it("reads only rows with non-zero executedQuantity, across sheets with differently-positioned columns", () => {
    const workbook = new ExcelJS.Workbook();
    buildAktsSheet(workbook, "DEM", 33, [
      { nrPk: 1, name: "Darbs A", unit: "m3", executedQuantity: 40 },
      { nrPk: 2, name: "Darbs B", unit: "m2", executedQuantity: 0 },
      { nrPk: 3, name: "Darbs C", unit: "m3", executedQuantity: null }, // blank cell, same as 0
    ]);
    buildAktsSheet(workbook, "KARK", 29, [{ nrPk: 1, name: "Darbs D", unit: "t", executedQuantity: 12.5 }]);
    const rollup = workbook.addWorksheet("saturs");
    rollup.getCell(1, 1).value = "Satura rādītājs";

    const sheets = parseExecutionActWorkbook(workbook);

    expect(sheets).toHaveLength(2); // "saturs" skipped - no recognizable header
    const dem = sheets.find((s) => s.sheetName === "DEM")!;
    expect(dem.rows).toEqual([{ code: "1", description: "Darbs A", unit: "m3", executedQuantity: 40 }]);
    const kark = sheets.find((s) => s.sheetName === "KARK")!;
    expect(kark.rows).toEqual([{ code: "1", description: "Darbs D", unit: "t", executedQuantity: 12.5 }]);
  });

  it("ignores rows whose mērvienība isn't a known unit, even with a non-zero value in the executed column", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DEM");
    sheet.getCell(3, 1).value = "Nr. p.k.";
    sheet.getCell(3, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(3, 5).value = "Mērvienība";
    sheet.getCell(3, 33).value = "Izpildīts atskaites periodā";
    // A subtotal/header row with a stray number in the "executed" column but no real unit.
    sheet.getCell(5, 1).value = "Kopā";
    sheet.getCell(5, 33).value = 999;

    const sheets = parseExecutionActWorkbook(workbook);
    expect(sheets).toHaveLength(0);
  });
});

describe("suggestSheetToSectionMapping", () => {
  const parsedSheets: ParsedExecutionActSheet[] = [
    { sheetName: "DEM", rows: [] },
    { sheetName: "Nezināma lapa", rows: [] },
  ];
  const sections: BoqSection[] = [
    { id: "sec-dem", name: "DEM", estimateNumber: "1-1", items: [] },
    { id: "sec-zd", name: "ZD", estimateNumber: "1-2", items: [] },
  ];

  it("maps a sheet to the section with the exact same name", () => {
    expect(suggestSheetToSectionMapping(parsedSheets, sections)).toEqual({ DEM: "sec-dem", "Nezināma lapa": null });
  });
});

describe("matchExecutionActToProject", () => {
  const section: BoqSection = {
    id: "sec-dem",
    name: "DEM",
    estimateNumber: "1-1",
    items: [item({ id: "item-a", code: "1" }), item({ id: "item-b", code: "2" })],
  };

  it("matches a row to an item by code within the mapped section", () => {
    const parsedSheets: ParsedExecutionActSheet[] = [
      { sheetName: "DEM", rows: [{ code: "1", description: "Darbs A", unit: "m3", executedQuantity: 40 }] },
    ];
    const matches = matchExecutionActToProject(parsedSheets, [section], { DEM: "sec-dem" });

    expect(matches).toHaveLength(1);
    expect(matches[0].sectionId).toBe("sec-dem");
    expect(matches[0].unmatchedRows).toEqual([]);
    expect(matches[0].entries).toEqual([
      expect.objectContaining({ sectionId: "sec-dem", itemId: "item-a", executedQuantity: 40 }),
    ]);
  });

  it("puts every row of a sheet into unmatchedRows when no section is mapped for it", () => {
    const parsedSheets: ParsedExecutionActSheet[] = [
      { sheetName: "Nezināma lapa", rows: [{ code: "1", description: "Darbs A", unit: "m3", executedQuantity: 40 }] },
    ];
    const matches = matchExecutionActToProject(parsedSheets, [section], { "Nezināma lapa": null });

    expect(matches[0].sectionId).toBeNull();
    expect(matches[0].entries).toEqual([]);
    expect(matches[0].unmatchedRows).toHaveLength(1);
  });

  it("puts a row into unmatchedRows when its code matches no item in the mapped section", () => {
    const parsedSheets: ParsedExecutionActSheet[] = [
      { sheetName: "DEM", rows: [{ code: "99", description: "Nezināma pozīcija", unit: "m3", executedQuantity: 40 }] },
    ];
    const matches = matchExecutionActToProject(parsedSheets, [section], { DEM: "sec-dem" });

    expect(matches[0].entries).toEqual([]);
    expect(matches[0].unmatchedRows).toHaveLength(1);
  });
});
