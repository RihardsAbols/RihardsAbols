import { describe, expect, it } from "vitest";
import type { BoqItem, BoqSection } from "../src/models/boq.js";
import type { ExecutionRecord } from "../src/models/executionRecord.js";
import {
  computeExecutedToDate,
  computeExecutionOverview,
  computeExecutionRecordValue,
  computeRemainingQuantity,
  createExecutionRecord,
  voidExecutionRecord,
} from "../src/executionRecords/executionRecords.js";

function item(overrides: Partial<BoqItem> = {}): BoqItem {
  return {
    id: "item-1",
    code: "1",
    description: "Pozīcija",
    unit: "gab",
    quantity: 100,
    unitLaborCost: 5,
    unitMaterialsCost: 3,
    unitMechanismsCost: 2,
    ...overrides,
  };
}

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: "rec-1",
    period: "2026-01",
    date: "2026-01-31",
    approvedBy: "Inženieris",
    entries: [],
    voidedAt: null,
    voidedReason: null,
    createdAt: "2026-01-31T00:00:00.000Z",
    updatedAt: "2026-01-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeExecutedToDate", () => {
  it("returns 0 when there are no execution records", () => {
    expect(computeExecutedToDate([], "item-1")).toBe(0);
  });

  it("sums a single item's executed quantity across multiple periods", () => {
    const records = [
      record({ id: "rec-1", entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 20 }] }),
      record({ id: "rec-2", entries: [{ id: "e2", sectionId: "sec-1", itemId: "item-1", executedQuantity: 15 }] }),
    ];
    expect(computeExecutedToDate(records, "item-1")).toBe(35);
  });

  it("ignores entries for other items", () => {
    const records = [
      record({
        entries: [
          { id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 20 },
          { id: "e2", sectionId: "sec-1", itemId: "item-2", executedQuantity: 99 },
        ],
      }),
    ];
    expect(computeExecutedToDate(records, "item-1")).toBe(20);
  });

  it("excludes voided records from the cumulative total", () => {
    const records = [
      record({ id: "rec-1", entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 20 }] }),
      record({
        id: "rec-2",
        entries: [{ id: "e2", sectionId: "sec-1", itemId: "item-1", executedQuantity: 15 }],
        voidedAt: "2026-02-01T00:00:00.000Z",
        voidedReason: "Nepareizi ievadīts skaitlis",
      }),
    ];
    expect(computeExecutedToDate(records, "item-1")).toBe(20);
  });
});

describe("computeRemainingQuantity", () => {
  it("subtracts executed from the current contracted quantity", () => {
    expect(computeRemainingQuantity(100, 30)).toBe(70);
  });

  it("can go negative when more was executed than currently contracted", () => {
    expect(computeRemainingQuantity(50, 80)).toBe(-30);
  });
});

describe("computeExecutionRecordValue", () => {
  it("sums executedQuantity times each item's unit cost, across items with different units", () => {
    const itemsById = new Map<string, BoqItem>([
      ["item-1", item({ id: "item-1", unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 })], // 10/unit
      ["item-2", item({ id: "item-2", unit: "m2", unitLaborCost: 2, unitMaterialsCost: 1, unitMechanismsCost: 0 })], // 3/unit
    ]);
    const rec = record({
      entries: [
        { id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 20 }, // 200
        { id: "e2", sectionId: "sec-1", itemId: "item-2", executedQuantity: 10 }, // 30
      ],
    });
    expect(computeExecutionRecordValue(rec, itemsById)).toBe(230);
  });

  it("ignores entries whose item is no longer found in currentItemsById", () => {
    const itemsById = new Map<string, BoqItem>([["item-1", item({ unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 })]]);
    const rec = record({
      entries: [
        { id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 10 }, // 100
        { id: "e2", sectionId: "sec-1", itemId: "missing", executedQuantity: 999 },
      ],
    });
    expect(computeExecutionRecordValue(rec, itemsById)).toBe(100);
  });

  it("treats an excluded item's unit cost as 0", () => {
    const itemsById = new Map<string, BoqItem>([["item-1", item({ excluded: true, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 })]]);
    const rec = record({ entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 10 }] });
    expect(computeExecutionRecordValue(rec, itemsById)).toBe(0);
  });
});

describe("computeExecutionOverview", () => {
  const sections: BoqSection[] = [
    {
      id: "sec-1",
      name: "Sadaļa 1",
      estimateNumber: "1-1",
      items: [
        item({ id: "item-1", code: "1", quantity: 100, unitLaborCost: 5, unitMaterialsCost: 3, unitMechanismsCost: 2 }),
        item({ id: "item-2", code: "2", quantity: 50, unitLaborCost: 1, unitMaterialsCost: 1, unitMechanismsCost: 0 }),
      ],
    },
  ];

  it("omits items with no execution at all", () => {
    const rows = computeExecutionOverview(sections, []);
    expect(rows).toEqual([]);
  });

  it("includes only items with executedToDate !== 0, with current/executed/remaining/value", () => {
    const records = [record({ entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 40 }] })];
    const rows = computeExecutionOverview(sections, records);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sectionName: "Sadaļa 1",
      code: "1",
      currentQuantity: 100,
      executedToDate: 40,
      remainingQuantity: 60,
      executedValue: 400, // 40 * (5+3+2)
    });
  });

  it("can report a negative remainingQuantity when more was executed than currently contracted", () => {
    const records = [record({ entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-2", executedQuantity: 70 }] })];
    const rows = computeExecutionOverview(sections, records);
    expect(rows[0].remainingQuantity).toBe(-20);
  });
});

describe("createExecutionRecord", () => {
  it("creates a record with no entries and the given period/date/approvedBy", () => {
    const created = createExecutionRecord({ period: "2026-02", date: "2026-02-28", approvedBy: "J. Bērziņš" });
    expect(created.period).toBe("2026-02");
    expect(created.date).toBe("2026-02-28");
    expect(created.approvedBy).toBe("J. Bērziņš");
    expect(created.entries).toEqual([]);
    expect(created.id).toBeTruthy();
    expect(created.voidedAt).toBeNull();
    expect(created.voidedReason).toBeNull();
  });
});

describe("voidExecutionRecord", () => {
  it("sets voidedAt/voidedReason on the matching record, leaving others untouched", () => {
    const records = [record({ id: "rec-1" }), record({ id: "rec-2" })];
    const result = voidExecutionRecord(records, "rec-1", "Nepareizi ievadīts skaitlis");
    expect(result[0].voidedAt).toBeTruthy();
    expect(result[0].voidedReason).toBe("Nepareizi ievadīts skaitlis");
    expect(result[1].voidedAt).toBeNull();
  });

  it("throws when the record id is not found", () => {
    expect(() => voidExecutionRecord([record({ id: "rec-1" })], "missing", "iemesls")).toThrow();
  });

  it("throws when the record is already voided", () => {
    const records = [record({ id: "rec-1", voidedAt: "2026-02-01T00:00:00.000Z", voidedReason: "jau anulēts" })];
    expect(() => voidExecutionRecord(records, "rec-1", "vēlreiz")).toThrow();
  });
});
