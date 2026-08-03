import { describe, expect, it } from "vitest";
import type { ExecutionRecord } from "../src/models/executionRecord.js";
import {
  computeExecutedToDate,
  computeRemainingQuantity,
  createExecutionRecord,
} from "../src/executionRecords/executionRecords.js";

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: "rec-1",
    period: "2026-01",
    date: "2026-01-31",
    approvedBy: "Inženieris",
    entries: [],
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
});

describe("computeRemainingQuantity", () => {
  it("subtracts executed from the current contracted quantity", () => {
    expect(computeRemainingQuantity(100, 30)).toBe(70);
  });

  it("can go negative when more was executed than currently contracted", () => {
    expect(computeRemainingQuantity(50, 80)).toBe(-30);
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
  });
});
