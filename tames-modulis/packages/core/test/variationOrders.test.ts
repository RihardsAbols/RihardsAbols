import { describe, expect, it } from "vitest";
import type { BoqItem, BoqSection } from "../src/models/boq.js";
import type { VariationOrder, VariationOrderChange } from "../src/models/variationOrder.js";
import {
  computeVariationOrderDirectTotalImpact,
  createVariationOrder,
  deriveCurrentSections,
  deriveCurrentState,
  diffAgainstBaseline,
  nextVariationOrderNumber,
  voidVariationOrder,
} from "../src/variationOrders/deriveCurrentState.js";
import { createEmptyBoqState } from "../src/models/boq.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1.1",
    description: "Pozīcija",
    unit: "m2",
    quantity: 10,
    unitLaborCost: 2,
    unitMaterialsCost: 3,
    unitMechanismsCost: 1,
    ...overrides,
  };
}

function section(items: BoqItem[], overrides: Partial<BoqSection> = {}): BoqSection {
  return { id: "sec-1", name: "Sadaļa", estimateNumber: "", items, ...overrides };
}

function change(overrides: Partial<VariationOrderChange> = {}): VariationOrderChange {
  return {
    id: "change-1",
    sectionId: "sec-1",
    itemId: "item-1",
    quantityDelta: 0,
    excluded: false,
    newItem: null,
    newSection: null,
    ...overrides,
  };
}

function vo(overrides: Partial<VariationOrder> = {}): VariationOrder {
  return {
    id: "vo-1",
    number: "VO-1",
    title: "Izmaiņa",
    justification: "Pamatojums",
    instructedBy: "Pasūtītājs",
    date: "2026-01-01",
    status: "approved",
    statusDate: "2026-01-02",
    voidedReason: null,
    changes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveCurrentSections", () => {
  it("returns the baseline unchanged when there are no variation orders", () => {
    const baseline = [section([item()])];
    const current = deriveCurrentSections(baseline, []);
    expect(current).toEqual(baseline);
    expect(current).not.toBe(baseline); // clona, ne tā pati atsauce
  });

  it("increases an item's quantity by quantityDelta", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const current = deriveCurrentSections(baseline, [vo({ changes: [change({ quantityDelta: 5 })] })]);
    expect(current[0].items[0].quantity).toBe(15);
  });

  it("decreases an item's quantity by a negative quantityDelta, clamped at 0", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const current = deriveCurrentSections(baseline, [vo({ changes: [change({ quantityDelta: -4 })] })]);
    expect(current[0].items[0].quantity).toBe(6);

    const overClamped = deriveCurrentSections(baseline, [vo({ changes: [change({ quantityDelta: -100 })] })]);
    expect(overClamped[0].items[0].quantity).toBe(0);
  });

  it("marks an item excluded without changing its quantity", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const current = deriveCurrentSections(baseline, [vo({ changes: [change({ excluded: true })] })]);
    expect(current[0].items[0].excluded).toBe(true);
    expect(current[0].items[0].quantity).toBe(10);
  });

  it("adds a brand-new item to an existing section, keyed by the change id", () => {
    const baseline = [section([item()])];
    const newItem = {
      code: "1.2",
      description: "Jauna pozīcija",
      unit: "gab",
      quantity: 3,
      unitLaborCost: 1,
      unitMaterialsCost: 1,
      unitMechanismsCost: 1,
    };
    const current = deriveCurrentSections(baseline, [
      vo({ changes: [change({ id: "new-change-1", itemId: null, newItem })] }),
    ]);
    expect(current[0].items).toHaveLength(2);
    expect(current[0].items[1]).toEqual({ ...newItem, id: "new-change-1", excluded: false });
  });

  it("lets a later variation order reference an item a prior VO added", () => {
    const baseline = [section([item()])];
    const newItem = {
      code: "1.2",
      description: "Jauna pozīcija",
      unit: "gab",
      quantity: 3,
      unitLaborCost: 1,
      unitMaterialsCost: 1,
      unitMechanismsCost: 1,
    };
    const voAdd = vo({ id: "vo-add", number: "VO-1", changes: [change({ id: "new-change-1", itemId: null, newItem })] });
    const voAdjust = vo({
      id: "vo-adjust",
      number: "VO-2",
      changes: [change({ id: "change-2", sectionId: "sec-1", itemId: "new-change-1", quantityDelta: 2, newItem: null })],
    });
    const current = deriveCurrentSections(baseline, [voAdd, voAdjust]);
    expect(current[0].items[1].quantity).toBe(5);
  });

  it("never mutates the baseline sections passed in", () => {
    const baseline = [section([item({ quantity: 10 })])];
    deriveCurrentSections(baseline, [vo({ changes: [change({ quantityDelta: 5 })] })]);
    expect(baseline[0].items[0].quantity).toBe(10);
  });

  it("adds a brand-new (empty) section, keyed by the change id", () => {
    const baseline = [section([item()], { id: "sec-1", name: "Zemes darbi" })];
    const current = deriveCurrentSections(baseline, [
      vo({
        changes: [
          change({
            id: "new-section-1",
            sectionId: "new-section-1",
            itemId: null,
            newItem: null,
            newSection: { name: "Jauns darbu bloks", estimateNumber: "2-1" },
          }),
        ],
      }),
    ]);
    expect(current).toHaveLength(2);
    expect(current[1]).toEqual({ id: "new-section-1", name: "Jauns darbu bloks", estimateNumber: "2-1", items: [] });
  });

  it("lets a change in the same VO add an item to a section that VO just created", () => {
    const baseline = [section([item()], { id: "sec-1", name: "Zemes darbi" })];
    const newItem = {
      code: "1.1",
      description: "Pirmā pozīcija jaunajā sadaļā",
      unit: "gab",
      quantity: 4,
      unitLaborCost: 1,
      unitMaterialsCost: 1,
      unitMechanismsCost: 1,
    };
    const current = deriveCurrentSections(baseline, [
      vo({
        changes: [
          change({
            id: "new-section-1",
            sectionId: "new-section-1",
            itemId: null,
            newItem: null,
            newSection: { name: "Jauns darbu bloks", estimateNumber: "2-1" },
          }),
          change({ id: "new-item-1", sectionId: "new-section-1", itemId: null, newItem }),
        ],
      }),
    ]);
    expect(current[1].items).toEqual([{ ...newItem, id: "new-item-1", excluded: false }]);
  });
});

describe("deriveCurrentState", () => {
  it("only applies approved variation orders, ignoring proposed/rejected ones", () => {
    const state = createEmptyBoqState("proj-1", "Projekts");
    state.baselineApprovedAt = "2026-01-01T00:00:00.000Z";
    state.sections = [section([item({ quantity: 10 })])];
    state.variationOrders = [
      vo({ id: "vo-approved", status: "approved", changes: [change({ id: "c1", quantityDelta: 5 })] }),
      vo({ id: "vo-proposed", status: "proposed", changes: [change({ id: "c2", quantityDelta: 100 })] }),
      vo({ id: "vo-rejected", status: "rejected", changes: [change({ id: "c3", quantityDelta: 100 })] }),
    ];

    const current = deriveCurrentState(state);
    expect(current.sections[0].items[0].quantity).toBe(15);
  });
});

describe("nextVariationOrderNumber / createVariationOrder", () => {
  it("generates sequential VO-N numbers", () => {
    expect(nextVariationOrderNumber([])).toBe("VO-1");
    expect(nextVariationOrderNumber([vo()])).toBe("VO-2");
    expect(nextVariationOrderNumber([vo(), vo({ id: "vo-2" })])).toBe("VO-3");
  });

  it("creates a new VO in 'proposed' status with no changes", () => {
    const created = createVariationOrder([], {
      title: "Papildu darbi",
      justification: "Pasūtītāja pieprasījums",
      instructedBy: "Pasūtītājs",
      date: "2026-02-01",
    });
    expect(created.number).toBe("VO-1");
    expect(created.status).toBe("proposed");
    expect(created.statusDate).toBeNull();
    expect(created.voidedReason).toBeNull();
    expect(created.changes).toEqual([]);
    expect(created.id).toBeTruthy();
  });
});

describe("voidVariationOrder", () => {
  it("moves an approved VO to status 'voided' with the given reason", () => {
    const orders = [vo({ id: "vo-1", status: "approved" })];
    const result = voidVariationOrder(orders, "vo-1", "Nepareizs daudzums");
    expect(result[0].status).toBe("voided");
    expect(result[0].voidedReason).toBe("Nepareizs daudzums");
    expect(result[0].statusDate).toBeTruthy();
  });

  it("excludes the voided VO from deriveCurrentState (no longer counted as approved)", () => {
    const state = createEmptyBoqState("proj-1", "Projekts");
    state.baselineApprovedAt = "2026-01-01T00:00:00.000Z";
    state.sections = [section([item({ quantity: 10 })])];
    state.variationOrders = [vo({ id: "vo-1", status: "approved", changes: [change({ id: "c1", quantityDelta: 5 })] })];

    const before = deriveCurrentState(state);
    expect(before.sections[0].items[0].quantity).toBe(15);

    state.variationOrders = voidVariationOrder(state.variationOrders, "vo-1", "Kļūda");
    const after = deriveCurrentState(state);
    expect(after.sections[0].items[0].quantity).toBe(10);
  });

  it("throws when the VO id is not found", () => {
    expect(() => voidVariationOrder([vo({ id: "vo-1" })], "missing", "iemesls")).toThrow();
  });

  it("throws when the VO is not currently approved (proposed/rejected/already voided)", () => {
    expect(() => voidVariationOrder([vo({ id: "vo-1", status: "proposed" })], "vo-1", "iemesls")).toThrow();
    expect(() => voidVariationOrder([vo({ id: "vo-1", status: "rejected" })], "vo-1", "iemesls")).toThrow();
    expect(() => voidVariationOrder([vo({ id: "vo-1", status: "voided" })], "vo-1", "iemesls")).toThrow();
  });
});

describe("computeVariationOrderDirectTotalImpact", () => {
  it("computes the direct-cost impact of a quantity increase", () => {
    const baseline = [section([item({ quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const target = vo({ id: "vo-1", changes: [change({ quantityDelta: 5 })] });
    // 5 extra units * (2+3+1) EUR/unit = 30
    expect(computeVariationOrderDirectTotalImpact(baseline, [target], "vo-1")).toBe(30);
  });

  it("computes the direct-cost impact of excluding an item as the negative of its baseline direct total", () => {
    const baseline = [section([item({ quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const target = vo({ id: "vo-1", changes: [change({ excluded: true })] });
    expect(computeVariationOrderDirectTotalImpact(baseline, [target], "vo-1")).toBe(-60);
  });

  it("accounts for prior approved VOs when computing a later VO's marginal impact", () => {
    const baseline = [section([item({ quantity: 10, unitLaborCost: 1, unitMaterialsCost: 0, unitMechanismsCost: 0 })])];
    const first = vo({ id: "vo-1", number: "VO-1", status: "approved", changes: [change({ id: "c1", quantityDelta: 10 })] });
    const second = vo({ id: "vo-2", number: "VO-2", status: "approved", changes: [change({ id: "c2", quantityDelta: 5 })] });
    // second VO's own marginal impact is 5 units * 1 EUR = 5, regardless of the first VO already having run.
    expect(computeVariationOrderDirectTotalImpact(baseline, [first, second], "vo-2")).toBe(5);
  });

  it("returns 0 for an unknown VO id", () => {
    const baseline = [section([item()])];
    expect(computeVariationOrderDirectTotalImpact(baseline, [], "missing")).toBe(0);
  });
});

describe("diffAgainstBaseline", () => {
  it("returns only items that changed quantity, exclusion, or are new", () => {
    const baseline = [
      section(
        [
          item({ id: "unchanged", quantity: 10 }),
          item({ id: "increased", quantity: 10 }),
          item({ id: "excluded", quantity: 10 }),
        ],
        { id: "sec-1", name: "Sadaļa" },
      ),
    ];
    const current = deriveCurrentSections(baseline, [
      vo({
        changes: [
          change({ id: "c1", itemId: "increased", quantityDelta: 5 }),
          change({ id: "c2", itemId: "excluded", excluded: true }),
          change({
            id: "c3",
            itemId: null,
            newItem: {
              code: "2.1",
              description: "Jauna pozīcija",
              unit: "gab",
              quantity: 2,
              unitLaborCost: 1,
              unitMaterialsCost: 1,
              unitMechanismsCost: 1,
            },
          }),
        ],
      }),
    ]);

    const diff = diffAgainstBaseline(baseline, current);
    const byId = Object.fromEntries(diff.map((row) => [row.itemId, row]));

    expect(diff).toHaveLength(3); // "unchanged" izlaista
    expect(byId["increased"]).toMatchObject({ baselineQuantity: 10, currentQuantity: 15, quantityDelta: 5, excluded: false });
    expect(byId["excluded"]).toMatchObject({ baselineQuantity: 10, currentQuantity: 10, excluded: true, currentDirectTotal: 0 });
    expect(byId["c3"]).toMatchObject({ baselineQuantity: null, currentQuantity: 2 });
  });

  it("surfaces items in a brand-new section (created by a VO) as new, with the new section's name", () => {
    const baseline = [section([item({ id: "unchanged" })], { id: "sec-1", name: "Zemes darbi" })];
    const current = deriveCurrentSections(baseline, [
      vo({
        changes: [
          change({ id: "new-section-1", sectionId: "new-section-1", itemId: null, newSection: { name: "Papildu darbi", estimateNumber: "2-1" } }),
          change({
            id: "new-item-1",
            sectionId: "new-section-1",
            itemId: null,
            newItem: {
              code: "1",
              description: "Jauns darbs",
              unit: "gab",
              quantity: 5,
              unitLaborCost: 1,
              unitMaterialsCost: 1,
              unitMechanismsCost: 1,
            },
          }),
        ],
      }),
    ]);

    const diff = diffAgainstBaseline(baseline, current);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toMatchObject({ sectionName: "Papildu darbi", itemId: "new-item-1", baselineQuantity: null, currentQuantity: 5 });
  });
});
