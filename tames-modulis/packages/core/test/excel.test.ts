import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { summarizeBoq } from "../src/calculations/boq.js";
import { exportBoqToBuffer, exportBoqToWorkbook } from "../src/excel/export.js";
import { importBoqFromBuffer, importBoqFromWorkbook } from "../src/excel/import.js";
import { createEmptyBoqState } from "../src/models/boq.js";
import type { BoqItem, BoqState } from "../src/models/boq.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1.1",
    description: "Augsnes noņemšana",
    unit: "m3",
    quantity: 120,
    unitLaborCost: 2,
    unitMaterialsCost: 1.5,
    unitMechanismsCost: 1,
    ...overrides,
  };
}

function sampleState(): BoqState {
  const state = createEmptyBoqState("proj-1", "Testa projekts");
  state.sections = [
    {
      id: "sec-1",
      name: "1.1_Dem.",
      items: [
        item({ id: "a", code: "1", quantity: 100, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 }),
        item({
          id: "b",
          code: "2",
          description: "Betona lējums",
          unit: "m2",
          quantity: 50,
          unitLaborCost: 2,
          unitMaterialsCost: 1.5,
          unitMechanismsCost: 0.5,
        }),
      ],
    },
    {
      id: "sec-2",
      name: "1.2_Jumts",
      items: [item({ id: "c", code: "1", unit: "m2", quantity: 30, unitLaborCost: 1, unitMaterialsCost: 1, unitMechanismsCost: 0 })],
    },
  ];
  return state;
}

describe("exportBoqToWorkbook / importBoqFromWorkbook round-trip", () => {
  it("recovers equivalent section/item data after export and re-import", () => {
    const state = sampleState();
    const workbook = exportBoqToWorkbook(state);
    const imported = importBoqFromWorkbook(workbook, state.projectId, state.projectName);

    expect(imported.sections).toHaveLength(state.sections.length);
    imported.sections.forEach((section, i) => {
      const original = state.sections[i];
      expect(section.name).toBe(original.name);
      expect(section.items).toHaveLength(original.items.length);
      section.items.forEach((importedItem, j) => {
        const originalItem = original.items[j];
        expect(importedItem.code).toBe(originalItem.code);
        expect(importedItem.description).toBe(originalItem.description);
        expect(importedItem.unit).toBe(originalItem.unit);
        expect(importedItem.quantity).toBe(originalItem.quantity);
        expect(importedItem.unitLaborCost).toBe(originalItem.unitLaborCost);
        expect(importedItem.unitMaterialsCost).toBe(originalItem.unitMaterialsCost);
        expect(importedItem.unitMechanismsCost).toBe(originalItem.unitMechanismsCost);
      });
    });
  });

  it("produces totals that match summarizeBoq", () => {
    const state = sampleState();
    const workbook = exportBoqToWorkbook(state);
    const imported = importBoqFromWorkbook(workbook, state.projectId, state.projectName);

    imported.vatRate = state.vatRate;
    imported.overheadRate = state.overheadRate;
    imported.profitRate = state.profitRate;

    // Section ids are expected to differ: import has no way to recover the
    // original id and uses the sheet name instead (documented in import.ts).
    const stripIds = (summary: ReturnType<typeof summarizeBoq>) => ({
      ...summary,
      sections: summary.sections.map(({ id: _id, ...rest }) => rest),
    });

    expect(stripIds(summarizeBoq(imported))).toEqual(stripIds(summarizeBoq(state)));
  });

  it("skips the KOPSAVILKUMS summary sheet since it has no data rows", () => {
    const state = sampleState();
    const workbook = exportBoqToWorkbook(state);
    const imported = importBoqFromWorkbook(workbook, state.projectId, state.projectName);

    expect(imported.sections.map((s) => s.name)).not.toContain("KOPSAVILKUMS");
  });

  it("round-trips through an actual xlsx buffer", async () => {
    const state = sampleState();
    const buffer = await exportBoqToBuffer(state);
    const imported = await importBoqFromBuffer(buffer, state.projectId, state.projectName);

    expect(imported.sections).toHaveLength(2);
    expect(imported.sections[0].items).toHaveLength(2);
    expect(imported.sections[0].items[0].description).toBe("Augsnes noņemšana");
  });
});

describe("importBoqFromWorkbook against a hand-built sheet", () => {
  it("detects data rows purely by the mērvienība column, regardless of row position", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("1.3_Ailas");

    // Deliberately unlike our own export layout: extra header rows, a Nr.p.k.
    // value of "1" that could be confused with a data marker, unit at col D.
    sheet.getCell(1, 1).value = "Objekts: Kaut kāda ēka";
    sheet.getCell(2, 1).value = "Nr.";
    sheet.getCell(2, 3).value = "Nosaukums";
    sheet.getCell(2, 4).value = "Mērv.";

    sheet.getCell(3, 1).value = 1;
    sheet.getCell(3, 3).value = "Loga montāža";
    sheet.getCell(3, 4).value = "gab";
    sheet.getCell(3, 5).value = 12;
    sheet.getCell(3, 8).value = 3;
    sheet.getCell(3, 9).value = 4;
    sheet.getCell(3, 10).value = 1;

    const state = importBoqFromWorkbook(workbook, "proj-x", "Ārējs fails");

    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].items).toEqual([
      expect.objectContaining({
        code: "1",
        description: "Loga montāža",
        unit: "gab",
        quantity: 12,
        unitLaborCost: 3,
        unitMaterialsCost: 4,
        unitMechanismsCost: 1,
      }),
    ]);
  });
});
