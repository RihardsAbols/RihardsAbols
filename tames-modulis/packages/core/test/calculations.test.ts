import { describe, expect, it } from "vitest";
import { calculateItemCosts, calculateSectionDirectTotal, round2, summarizeBoq } from "../src/calculations/boq.js";
import { createEmptyBoqState } from "../src/models/boq.js";
import type { BoqItem, BoqSection } from "../src/models/boq.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1.1",
    description: "Pozīcija",
    unit: "m2",
    quantity: 1,
    unitLaborCost: 0,
    unitMaterialsCost: 1,
    unitMechanismsCost: 0,
    ...overrides,
  };
}

function section(items: BoqItem[], overrides: Partial<BoqSection> = {}): BoqSection {
  return { id: "sec-1", name: "Sadaļa", items, ...overrides };
}

describe("round2", () => {
  it("fixes floating point artifacts", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe("calculateItemCosts", () => {
  it("multiplies quantity by each unit cost component and sums them", () => {
    const costs = calculateItemCosts(
      item({ quantity: 100, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 }),
    );
    expect(costs).toEqual({ laborTotal: 500, materialsTotal: 300, mechanismsTotal: 200, directTotal: 1000 });
  });
});

describe("calculateSectionDirectTotal", () => {
  it("sums item direct totals within a section", () => {
    const s = section([
      item({ id: "a", quantity: 2, unitLaborCost: 4, unitMaterialsCost: 3, unitMechanismsCost: 3 }),
      item({ id: "b", quantity: 3, unitLaborCost: 1, unitMaterialsCost: 1, unitMechanismsCost: 3 }),
    ]);
    expect(calculateSectionDirectTotal(s)).toBe(35);
  });

  it("returns 0 for a section with no items", () => {
    expect(calculateSectionDirectTotal(section([]))).toBe(0);
  });
});

describe("summarizeBoq", () => {
  it("computes direct costs, overhead, profit and VAT across sections", () => {
    const state = createEmptyBoqState("proj-1", "Testa projekts");
    state.overheadRate = 0.12;
    state.profitRate = 0.05;
    state.vatRate = 0.21;
    state.sections = [
      section([item({ id: "a", quantity: 100, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 })], {
        id: "sec-1",
        name: "Zemes darbi",
      }),
      section([item({ id: "b", quantity: 50, unitLaborCost: 2, unitMaterialsCost: 1.5, unitMechanismsCost: 0.5 })], {
        id: "sec-2",
        name: "Betonēšana",
      }),
    ];

    const summary = summarizeBoq(state);

    expect(summary.sections).toEqual([
      {
        id: "sec-1",
        name: "Zemes darbi",
        laborTotal: 500,
        materialsTotal: 300,
        mechanismsTotal: 200,
        directTotal: 1000,
        discountAmount: 0,
        directTotalAfterDiscount: 1000,
        overhead: 120,
        profit: 50,
        totalWithMarkup: 1170,
      },
      {
        id: "sec-2",
        name: "Betonēšana",
        laborTotal: 100,
        materialsTotal: 75,
        mechanismsTotal: 25,
        directTotal: 200,
        discountAmount: 0,
        directTotalAfterDiscount: 200,
        overhead: 24,
        profit: 10,
        totalWithMarkup: 234,
      },
    ]);
    expect(summary.directTotal).toBe(1200);
    expect(summary.discountRate).toBe(0);
    expect(summary.discountAmount).toBe(0);
    expect(summary.directTotalAfterDiscount).toBe(1200);
    expect(summary.overhead).toBe(144);
    expect(summary.profit).toBe(60);
    expect(summary.subtotal).toBe(1404);
    expect(summary.vatRate).toBe(0.21);
    expect(summary.vatAmount).toBe(294.84);
    expect(summary.total).toBe(1698.84);
  });

  it("subtracts the discount from direct costs before computing overhead/profit", () => {
    const state = createEmptyBoqState("proj-discount", "Atlaides tests");
    state.overheadRate = 0.12;
    state.profitRate = 0.05;
    state.vatRate = 0.21;
    state.discountRate = 0.1;
    state.sections = [
      section([item({ id: "a", quantity: 100, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 })], {
        id: "sec-1",
        name: "Zemes darbi",
      }),
    ];

    const summary = summarizeBoq(state);

    // directTotal 1000, discount 10% -> 100, base for markup 900.
    expect(summary.sections[0].directTotal).toBe(1000);
    expect(summary.sections[0].discountAmount).toBe(100);
    expect(summary.sections[0].directTotalAfterDiscount).toBe(900);
    expect(summary.sections[0].overhead).toBe(108); // 900 * 0.12
    expect(summary.sections[0].profit).toBe(45); // 900 * 0.05
    expect(summary.sections[0].totalWithMarkup).toBe(1053); // 900 + 108 + 45

    expect(summary.directTotal).toBe(1000);
    expect(summary.discountRate).toBe(0.1);
    expect(summary.discountAmount).toBe(100);
    expect(summary.directTotalAfterDiscount).toBe(900);
    expect(summary.overhead).toBe(108);
    expect(summary.profit).toBe(45);
    expect(summary.subtotal).toBe(1053);
    expect(summary.vatAmount).toBe(221.13); // 1053 * 0.21
    expect(summary.total).toBe(1274.13);
  });

  it("returns all zeros for a project with no sections", () => {
    const state = createEmptyBoqState("proj-2", "Tukšs projekts");
    const summary = summarizeBoq(state);
    expect(summary).toEqual({
      sections: [],
      directTotal: 0,
      discountRate: state.discountRate,
      discountAmount: 0,
      directTotalAfterDiscount: 0,
      overheadRate: state.overheadRate,
      overhead: 0,
      profitRate: state.profitRate,
      profit: 0,
      subtotal: 0,
      vatRate: state.vatRate,
      vatAmount: 0,
      total: 0,
    });
  });

  it("does not compound rounding error across many small items", () => {
    const state = createEmptyBoqState("proj-3", "Noapaļošanas tests");
    state.overheadRate = 0;
    state.profitRate = 0;
    state.vatRate = 0.21;
    state.sections = [
      section(
        Array.from({ length: 3 }, (_, i) =>
          item({ id: `i${i}`, quantity: 1, unitLaborCost: 0, unitMaterialsCost: 0.1, unitMechanismsCost: 0 }),
        ),
        { id: "sec-1", name: "Sīkas pozīcijas" },
      ),
    ];

    const summary = summarizeBoq(state);
    expect(summary.directTotal).toBe(0.3);
    expect(summary.subtotal).toBe(0.3);
  });
});
