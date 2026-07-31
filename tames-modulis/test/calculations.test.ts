import { describe, expect, it } from "vitest";
import {
  calculateItemTotal,
  calculateSectionSubtotal,
  round2,
  summarizeBoq,
} from "../src/calculations/boq.js";
import { createEmptyBoqState } from "../src/models/boq.js";
import type { BoqItem, BoqSection } from "../src/models/boq.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1.1",
    description: "Pozīcija",
    unit: "m2",
    quantity: 1,
    unitPrice: 1,
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

describe("calculateItemTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(calculateItemTotal(item({ quantity: 120, unitPrice: 4.5 }))).toBe(540);
  });
});

describe("calculateSectionSubtotal", () => {
  it("sums item totals within a section", () => {
    const s = section([
      item({ id: "a", quantity: 2, unitPrice: 10 }),
      item({ id: "b", quantity: 3, unitPrice: 5 }),
    ]);
    expect(calculateSectionSubtotal(s)).toBe(35);
  });

  it("returns 0 for a section with no items", () => {
    expect(calculateSectionSubtotal(section([]))).toBe(0);
  });
});

describe("summarizeBoq", () => {
  it("computes subtotal, VAT and total across sections", () => {
    const state = createEmptyBoqState("proj-1", "Testa projekts");
    state.vatRate = 0.21;
    state.sections = [
      section([item({ id: "a", quantity: 100, unitPrice: 10 })], { id: "sec-1", name: "Zemes darbi" }),
      section([item({ id: "b", quantity: 50, unitPrice: 4 })], { id: "sec-2", name: "Betonēšana" }),
    ];

    const summary = summarizeBoq(state);

    expect(summary.sections).toEqual([
      { id: "sec-1", name: "Zemes darbi", subtotal: 1000 },
      { id: "sec-2", name: "Betonēšana", subtotal: 200 },
    ]);
    expect(summary.subtotal).toBe(1200);
    expect(summary.vatRate).toBe(0.21);
    expect(summary.vatAmount).toBe(252);
    expect(summary.total).toBe(1452);
  });

  it("returns all zeros for a project with no sections", () => {
    const state = createEmptyBoqState("proj-2", "Tukšs projekts");
    const summary = summarizeBoq(state);
    expect(summary).toEqual({
      sections: [],
      subtotal: 0,
      vatRate: state.vatRate,
      vatAmount: 0,
      total: 0,
    });
  });

  it("does not compound rounding error across many small items", () => {
    const state = createEmptyBoqState("proj-3", "Noapaļošanas tests");
    state.vatRate = 0.21;
    state.sections = [
      section(
        Array.from({ length: 3 }, (_, i) => item({ id: `i${i}`, quantity: 1, unitPrice: 0.1 })),
        { id: "sec-1", name: "Sīkas pozīcijas" },
      ),
    ];

    const summary = summarizeBoq(state);
    expect(summary.subtotal).toBe(0.3);
  });
});
