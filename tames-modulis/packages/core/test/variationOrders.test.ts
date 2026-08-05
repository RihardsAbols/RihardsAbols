import { describe, expect, it } from "vitest";
import type { BoqItem, BoqSection } from "../src/models/boq.js";
import type { VariationOrder, VariationOrderChange } from "../src/models/variationOrder.js";
import {
  computeItemCodesAndHistory,
  computeReserveBalance,
  computeVariationOrderDirectTotalImpact,
  computeVariationOrderPrecedents,
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
    reserveDrawdown: 0,
    changes: [],
    statusHistory: [
      { status: "proposed", date: "2026-01-01" },
      { status: "approved", date: "2026-01-02" },
    ],
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

describe("computeVariationOrderPrecedents", () => {
  it("returns an empty list for the first VO (no prior VOs)", () => {
    const first = vo({ id: "vo-1", number: "VO-1" });
    expect(computeVariationOrderPrecedents([first], "vo-1")).toEqual([]);
  });

  it("returns an empty list for an unknown VO id", () => {
    expect(computeVariationOrderPrecedents([vo({ id: "vo-1" })], "missing")).toEqual([]);
  });

  it("lists all prior VOs by array position, each with its status at the target VO's creation moment", () => {
    const first = vo({
      id: "vo-1",
      number: "VO-1",
      status: "approved",
      statusHistory: [
        { status: "proposed", date: "2026-01-01T00:00:00.000Z" },
        { status: "approved", date: "2026-01-02T00:00:00.000Z" },
      ],
    });
    const second = vo({
      id: "vo-2",
      number: "VO-2",
      status: "rejected",
      statusHistory: [
        { status: "proposed", date: "2026-01-03T00:00:00.000Z" },
        { status: "rejected", date: "2026-01-04T00:00:00.000Z" },
      ],
    });
    const third = vo({
      id: "vo-3",
      number: "VO-3",
      status: "proposed",
      statusHistory: [{ status: "proposed", date: "2026-01-05T00:00:00.000Z" }],
    });

    expect(computeVariationOrderPrecedents([first, second, third], "vo-3")).toEqual([
      { voId: "vo-1", voNumber: "VO-1", statusAtReference: "approved" },
      { voId: "vo-2", voNumber: "VO-2", statusAtReference: "rejected" },
    ]);
  });

  it("shows a precedent's status AS OF the target VO's creation, even if that precedent VO changed status later", () => {
    // first VO: approved when "second" was created, but VOIDED afterwards - the precedent
    // for "second" must still show "approved" (that was true when "second" was created).
    const first = vo({
      id: "vo-1",
      number: "VO-1",
      status: "voided",
      statusHistory: [
        { status: "proposed", date: "2026-01-01T00:00:00.000Z" },
        { status: "approved", date: "2026-01-02T00:00:00.000Z" },
        { status: "voided", date: "2026-01-10T00:00:00.000Z" }, // AFTER "second" was created
      ],
    });
    const second = vo({
      id: "vo-2",
      number: "VO-2",
      statusHistory: [{ status: "proposed", date: "2026-01-05T00:00:00.000Z" }],
    });

    expect(computeVariationOrderPrecedents([first, second], "vo-2")).toEqual([
      { voId: "vo-1", voNumber: "VO-1", statusAtReference: "approved" },
    ]);
  });

  it("shows a precedent as still 'proposed' if it hadn't been decided yet when the target VO was created", () => {
    const first = vo({
      id: "vo-1",
      number: "VO-1",
      statusHistory: [{ status: "proposed", date: "2026-01-01T00:00:00.000Z" }],
    });
    const second = vo({
      id: "vo-2",
      number: "VO-2",
      statusHistory: [{ status: "proposed", date: "2026-01-02T00:00:00.000Z" }],
    });

    expect(computeVariationOrderPrecedents([first, second], "vo-2")).toEqual([
      { voId: "vo-1", voNumber: "VO-1", statusAtReference: "proposed" },
    ]);
  });
});

describe("computeReserveBalance", () => {
  it("accumulates the excluded item's baseline value as available reserve", () => {
    const baseline = [section([item({ quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const target = vo({ id: "vo-1", status: "approved", changes: [change({ excluded: true })] });

    const balance = computeReserveBalance(baseline, [target]);

    expect(balance.entries).toEqual([
      expect.objectContaining({ voId: "vo-1", directTotalImpact: -60, contribution: 60, drawdown: 0, balanceAfter: 60 }),
    ]);
    expect(balance.totalAccumulated).toBe(60);
    expect(balance.totalDrawn).toBe(0);
    expect(balance.available).toBe(60);
  });

  it("draws down the reserve via a later VO's reserveDrawdown, only up to what that VO explicitly requests", () => {
    const baseline = [section([item({ id: "item-1", quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const savings = vo({ id: "vo-1", number: "VO-1", status: "approved", changes: [change({ excluded: true })] });
    const addition = vo({
      id: "vo-2",
      number: "VO-2",
      status: "approved",
      reserveDrawdown: 20,
      changes: [
        change({
          id: "c2",
          itemId: null,
          newItem: { code: "2.1", description: "Papildu pozīcija", unit: "gab", quantity: 4, unitLaborCost: 2, unitMaterialsCost: 2, unitMechanismsCost: 1 },
        }),
      ],
    });

    const balance = computeReserveBalance(baseline, [savings, addition]);

    // savings: -60 impact -> +60 contribution. addition: +20 impact (4 * 5), reserveDrawdown 20 fully applied.
    expect(balance.entries).toEqual([
      expect.objectContaining({ voId: "vo-1", contribution: 60, drawdown: 0, balanceAfter: 60 }),
      expect.objectContaining({ voId: "vo-2", directTotalImpact: 20, contribution: 0, drawdown: 20, balanceAfter: 40 }),
    ]);
    expect(balance.totalAccumulated).toBe(60);
    expect(balance.totalDrawn).toBe(20);
    expect(balance.available).toBe(40);
  });

  it("does not clamp drawdown to the available balance - a VO can draw more than is available, available goes negative", () => {
    const baseline = [section([item({ id: "item-1", quantity: 10, unitLaborCost: 1, unitMaterialsCost: 0, unitMechanismsCost: 0 })])];
    const addition = vo({
      id: "vo-1",
      status: "approved",
      reserveDrawdown: 500,
      changes: [change({ quantityDelta: 5 })], // +5 impact
    });

    const balance = computeReserveBalance(baseline, [addition]);

    expect(balance.available).toBe(-500);
  });

  it("ignores reserveDrawdown on a VO whose own impact is negative (a savings VO), even if the field is set", () => {
    const baseline = [section([item({ id: "item-1", quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const savings = vo({ id: "vo-1", status: "approved", reserveDrawdown: 999, changes: [change({ excluded: true })] });

    const balance = computeReserveBalance(baseline, [savings]);

    expect(balance.entries[0]).toMatchObject({ drawdown: 0 });
    expect(balance.totalDrawn).toBe(0);
    expect(balance.available).toBe(60);
  });

  it("skips proposed/rejected/voided VOs, same filter as deriveCurrentState", () => {
    const baseline = [section([item({ id: "item-1", quantity: 10, unitLaborCost: 2, unitMaterialsCost: 3, unitMechanismsCost: 1 })])];
    const proposed = vo({ id: "vo-1", status: "proposed", changes: [change({ excluded: true })] });

    const balance = computeReserveBalance(baseline, [proposed]);

    expect(balance.entries).toEqual([]);
    expect(balance.available).toBe(0);
  });

  it("returns a zero balance for a project with no variation orders", () => {
    const baseline = [section([item()])];
    expect(computeReserveBalance(baseline, [])).toEqual({ entries: [], totalAccumulated: 0, totalDrawn: 0, available: 0 });
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

describe("computeItemCodesAndHistory", () => {
  it("keeps the raw code as displayCode for a baseline item no VO ever touched", () => {
    const baseline = [section([item()])];
    const history = computeItemCodesAndHistory(baseline, []);
    expect(history.get("item-1")).toEqual({ displayCode: "1.1", impacts: [] });
  });

  it("appends a revision letter (based on how many times this item was touched) after one VO changes its quantity", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const change1 = vo({ id: "vo-1", number: "VO-1", changes: [change({ quantityDelta: 5 })] });
    const history = computeItemCodesAndHistory(baseline, [change1]);
    const info = history.get("item-1")!;
    expect(info.displayCode).toBe("1.1a");
    expect(info.impacts).toEqual([
      { voId: "vo-1", voNumber: "VO-1", isNew: false, quantityDelta: 5, directTotalDelta: 30 }, // (15-10) * (2+3+1)
    ]);
  });

  it("advances the revision letter to 'b' when a second variation order later touches the same item", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const voA = vo({ id: "vo-1", number: "VO-1", changes: [change({ id: "c1", quantityDelta: 5 })] });
    const voB = vo({ id: "vo-2", number: "VO-2", changes: [change({ id: "c2", quantityDelta: 3 })] });
    const history = computeItemCodesAndHistory(baseline, [voA, voB]);
    const info = history.get("item-1")!;
    expect(info.displayCode).toBe("1.1b");
    expect(info.impacts).toHaveLength(2);
    expect(info.impacts[0]).toMatchObject({ voId: "vo-1", quantityDelta: 5 });
    expect(info.impacts[1]).toMatchObject({ voId: "vo-2", quantityDelta: 3 });
  });

  it("does not advance the revision letter for a no-op change (quantityDelta 0, not excluded)", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const noOp = vo({ id: "vo-1", number: "VO-1", changes: [change({ quantityDelta: 0, excluded: false })] });
    const history = computeItemCodesAndHistory(baseline, [noOp]);
    expect(history.get("item-1")).toEqual({ displayCode: "1.1", impacts: [] });
  });

  it("assigns a new unique number + VO tag to a brand-new item added to an existing (baseline) section", () => {
    const baseline = [section([item()])]; // 1 baseline item -> next auto number is 2
    const newItem = {
      code: "manuāli-ievadīts-kods", // apzināti ignorēts - jaunai pozīcijai esošā sadaļā displayCode ir auto-numurs, ne šis
      description: "Jauna pozīcija",
      unit: "gab",
      quantity: 3,
      unitLaborCost: 1,
      unitMaterialsCost: 1,
      unitMechanismsCost: 1,
    };
    const voAdd = vo({ id: "vo-1", number: "VO-1", changes: [change({ id: "new-change-1", itemId: null, newItem })] });
    const history = computeItemCodesAndHistory(baseline, [voAdd]);
    const info = history.get("new-change-1")!;
    expect(info.displayCode).toBe("2 (VO-1)");
    expect(info.impacts).toEqual([
      { voId: "vo-1", voNumber: "VO-1", isNew: true, quantityDelta: 3, directTotalDelta: 9 }, // 3 * (1+1+1)
    ]);
  });

  it("keeps the manually-entered code as displayCode for a new item in a brand-new (VO-created) section", () => {
    const baseline = [section([item()], { id: "sec-1", name: "Zemes darbi" })];
    const newItem = {
      code: "1",
      description: "Pirmā pozīcija jaunajā sadaļā",
      unit: "gab",
      quantity: 4,
      unitLaborCost: 1,
      unitMaterialsCost: 1,
      unitMechanismsCost: 1,
    };
    const voAdd = vo({
      id: "vo-1",
      number: "VO-1",
      changes: [
        change({
          id: "new-section-1",
          sectionId: "new-section-1",
          itemId: null,
          newSection: { name: "Papildu darbi", estimateNumber: "2-1" },
        }),
        change({ id: "new-item-1", sectionId: "new-section-1", itemId: null, newItem }),
      ],
    });
    const history = computeItemCodesAndHistory(baseline, [voAdd]);
    expect(history.get("new-item-1")).toEqual({
      displayCode: "1",
      impacts: [{ voId: "vo-1", voNumber: "VO-1", isNew: true, quantityDelta: 4, directTotalDelta: 12 }], // 4 * (1+1+1)
    });
  });

  it("ignores variation orders the caller does not include (e.g. a voided VO filtered out before calling)", () => {
    const baseline = [section([item({ quantity: 10 })])];
    const voided = vo({ id: "vo-1", number: "VO-1", status: "voided", changes: [change({ quantityDelta: 5 })] });
    const history = computeItemCodesAndHistory(baseline, []); // saucējs jau izfiltrējis "voided" VO
    expect(history.get("item-1")).toEqual({ displayCode: "1.1", impacts: [] });
    expect(voided.status).toBe("voided"); // sanity - konstruēts, bet tīši nav padots
  });
});
