import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { summarizeBoq } from "../src/calculations/boq.js";
import { KNOWN_UNITS, normalizeUnit } from "../src/excel/columns.js";
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

describe("normalizeUnit", () => {
  it("strips trailing punctuation", () => {
    expect(normalizeUnit("kpl.")).toBe("kpl");
    expect(normalizeUnit("gb,")).toBe("gb");
    expect(normalizeUnit("gab.")).toBe("gab");
  });

  it("normalizes Unicode superscripts to plain digits", () => {
    expect(normalizeUnit("m²")).toBe("m2");
    expect(normalizeUnit("m³")).toBe("m3");
  });

  it("trims and lowercases", () => {
    expect(normalizeUnit("  M2 ")).toBe("m2");
  });

  it("every normalized variant is present in KNOWN_UNITS", () => {
    for (const raw of ["kpl.", "gb,", "gab.", "m²", "m³", "M2", "GB"]) {
      expect(KNOWN_UNITS.has(normalizeUnit(raw))).toBe(true);
    }
  });
});

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

describe("importBoqFromWorkbook against hand-built sheets (real-world structure)", () => {
  it("detects columns by header text, regardless of row/column position", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("1.3_Ailas");

    // Deliberately unlike our own export layout: extra header rows, a Nr.p.k.
    // value of "1" that could be confused with a data marker, unit at col D
    // (not the export's fixed column 4).
    sheet.getCell(1, 1).value = "Objekts: Kaut kāda ēka";
    sheet.getCell(2, 1).value = "Nr.p.k.";
    sheet.getCell(2, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(2, 4).value = "Mērvienība";
    sheet.getCell(2, 5).value = "Daudzums";
    sheet.getCell(2, 8).value = "Darba alga";
    sheet.getCell(2, 9).value = "Materiāli";
    sheet.getCell(2, 10).value = "Mehānismi";

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

  it("handles a real Līguma tāme layout where extra columns shift everything after Mērvienība", () => {
    // Mirrors a real 53-sheet VELVE-style construction budget: Nr.p.k=A,
    // Kods=B (unused by us), Būvdarbu nosaukums=C, Mērvienība=E (not D - a
    // spacer/drawing-ref column sits at D), then a per-building quantity
    // breakdown (F-N, unused by us) before Daudzums finally lands at O, then
    // "laika norma"/"darba samaksas likme" (unused) before darba
    // alga/būvizstrādājumi/mehānismi at R/S/T. A fixed TAME_COLUMNS-style map
    // cannot read this; header-text detection must.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("EL");

    sheet.getCell(15, 1).value = "Nr. p.k.";
    sheet.getCell(15, 2).value = "Kods";
    sheet.getCell(15, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(15, 5).value = "Mērvienība";
    sheet.getCell(15, 6).value = "KORPUSI";
    sheet.getCell(15, 15).value = "Daudzums";
    sheet.getCell(15, 16).value = "Vienības izmaksas";
    sheet.getCell(16, 16).value = "laika norma (c/h)";
    sheet.getCell(16, 17).value = "darba\nsamaksas\nlikme\n(euro /h)";
    sheet.getCell(16, 18).value = "darba alga\n";
    sheet.getCell(16, 19).value = "būvizstrādājumi";
    sheet.getCell(16, 20).value = "mehānismi\n";
    sheet.getCell(16, 21).value = "Kopā\n";

    sheet.getCell(19, 1).value = 1;
    sheet.getCell(19, 3).value = "Sausais transformators";
    sheet.getCell(19, 5).value = "gb";
    sheet.getCell(19, 15).value = 2;
    sheet.getCell(19, 18).value = 3620.22;
    sheet.getCell(19, 19).value = 26566.38;
    sheet.getCell(19, 20).value = 365.15;

    const state = importBoqFromWorkbook(workbook, "proj-velve", "VELVE projekts");

    expect(state.sections).toHaveLength(1);
    expect(state.sections[0].items).toEqual([
      expect.objectContaining({
        code: "1",
        description: "Sausais transformators",
        unit: "gb",
        quantity: 2,
        unitLaborCost: 3620.22,
        unitMaterialsCost: 26566.38,
        unitMechanismsCost: 365.15,
      }),
    ]);
  });

  it("ignores a wide merged instructional caption that happens to contain header-ish words out of order", () => {
    // Reproduces a real bug found against an actual 53-sheet tāme: a merged
    // caption row like "(būvdarbu veids vai konstruktīvā elementa
    // nosaukums)" contains both "būvdarbu" and "nosaukums" - just not
    // adjacent - and exceljs reports that same text for every column the
    // merge spans, not just the anchor. A looser "both words present
    // anywhere" name-matcher locked onto column 1 (the caption's left edge)
    // before ever reaching the real "Būvdarbu nosaukums" header, so every
    // item's description came back as its Nr.p.k. instead of its actual text.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("DEM");

    sheet.mergeCells(4, 1, 4, 20);
    sheet.getCell(4, 1).value = "(būvdarbu veids vai konstruktīvā elementa nosaukums)";

    sheet.getCell(15, 1).value = "Nr. p.k.";
    sheet.getCell(15, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(15, 5).value = "Mērvienība";
    sheet.getCell(15, 15).value = "Daudzums";
    sheet.getCell(16, 18).value = "darba alga";
    sheet.getCell(16, 19).value = "būvizstrādājumi";
    sheet.getCell(16, 20).value = "mehānismi";

    sheet.getCell(19, 1).value = 1;
    sheet.getCell(19, 3).value = "Esošas ēkas nojaukšana un būvgružu aizvešana";
    sheet.getCell(19, 5).value = "m3";
    sheet.getCell(19, 15).value = 590;
    sheet.getCell(19, 18).value = 10.14;
    sheet.getCell(19, 19).value = 0.75;
    sheet.getCell(19, 20).value = 10.98;

    const state = importBoqFromWorkbook(workbook, "proj-dem", "DEM projekts");

    expect(state.sections[0].items[0].description).toBe("Esošas ēkas nojaukšana un būvgružu aizvešana");
  });

  it("skips a sheet with no recognizable header at all (e.g. a table-of-contents/rollup tab)", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("saturs");
    sheet.getCell(1, 1).value = "Saturs";
    sheet.getCell(2, 1).value = "1-1";
    sheet.getCell(2, 2).value = "Demontāžas darbi";
    sheet.getCell(2, 3).value = 63491.88;

    const state = importBoqFromWorkbook(workbook, "proj-y", "Projekts");

    expect(state.sections).toHaveLength(0);
  });

  it("recognizes real-world unit variants via normalizeUnit (superscripts, trailing punctuation)", () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Variants");
    sheet.getCell(1, 1).value = "Nr.p.k.";
    sheet.getCell(1, 3).value = "Būvdarbu nosaukums";
    sheet.getCell(1, 4).value = "Mērvienība";
    sheet.getCell(1, 5).value = "Daudzums";
    sheet.getCell(1, 8).value = "Darba alga";
    sheet.getCell(1, 9).value = "Materiāli";
    sheet.getCell(1, 10).value = "Mehānismi";

    const unitVariants = ["m²", "m³", "kpl.", "gb,", "gab."];
    unitVariants.forEach((unit, i) => {
      const row = 2 + i;
      sheet.getCell(row, 1).value = i + 1;
      sheet.getCell(row, 3).value = `Pozīcija ${i + 1}`;
      sheet.getCell(row, 4).value = unit;
      sheet.getCell(row, 5).value = 1;
      sheet.getCell(row, 8).value = 1;
      sheet.getCell(row, 9).value = 1;
      sheet.getCell(row, 10).value = 1;
    });

    const state = importBoqFromWorkbook(workbook, "proj-z", "Projekts");

    expect(state.sections[0].items).toHaveLength(unitVariants.length);
  });
});
