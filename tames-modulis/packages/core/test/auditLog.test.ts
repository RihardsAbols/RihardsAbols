import { describe, expect, it } from "vitest";
import { computeAuditLog } from "../src/audit/auditLog.js";
import { createEmptyBoqState } from "../src/models/boq.js";
import type { BoqState } from "../src/models/boq.js";
import type { ExecutionRecord } from "../src/models/executionRecord.js";
import type { VariationOrder } from "../src/models/variationOrder.js";

function vo(overrides: Partial<VariationOrder> = {}): VariationOrder {
  return {
    id: "vo-1",
    number: "VO-1",
    title: "Izmaiņa",
    justification: "Pamatojums",
    instructedBy: "Pasūtītājs",
    date: "2026-01-01",
    status: "approved",
    statusDate: "2026-01-05",
    voidedReason: null,
    reserveDrawdown: 0,
    changes: [],
    statusHistory: [
      { status: "proposed", date: "2026-01-01" },
      { status: "approved", date: "2026-01-05" },
    ],
    precedents: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

function record(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: "rec-1",
    period: "2026-02",
    date: "2026-02-28",
    approvedBy: "Inženieris",
    entries: [],
    voidedAt: null,
    voidedReason: null,
    createdAt: "2026-02-28T00:00:00.000Z",
    updatedAt: "2026-02-28T00:00:00.000Z",
    ...overrides,
  };
}

function baseState(overrides: Partial<BoqState> = {}): BoqState {
  return { ...createEmptyBoqState("proj-1", "Projekts"), ...overrides };
}

describe("computeAuditLog", () => {
  it("returns an empty log for a project with no baseline yet", () => {
    expect(computeAuditLog(baseState())).toEqual([]);
  });

  it("emits a single baseline_approved event with actor: null for a baseline frozen before baselineApprovedBy existed", () => {
    const state = baseState({ baselineApprovedAt: "2026-01-01T00:00:00.000Z", baselineApprovedBy: null });
    const log = computeAuditLog(state);
    expect(log).toEqual([
      { type: "baseline_approved", date: "2026-01-01T00:00:00.000Z", refId: "baseline", refLabel: "Bāzes tāme", actor: null, detail: null },
    ]);
  });

  it("emits a baseline_approved event with the approver's name as actor when baselineApprovedBy is set", () => {
    const state = baseState({ baselineApprovedAt: "2026-01-01T00:00:00.000Z", baselineApprovedBy: "Jānis Bērziņš" });
    const log = computeAuditLog(state);
    expect(log).toEqual([
      { type: "baseline_approved", date: "2026-01-01T00:00:00.000Z", refId: "baseline", refLabel: "Bāzes tāme", actor: "Jānis Bērziņš", detail: null },
    ]);
  });

  it("emits one event per statusHistory entry for a VO that was approved then later voided", () => {
    const votedVo = vo({
      id: "vo-1",
      number: "VO-1",
      justification: "Papildu darbi",
      instructedBy: "Pasūtītājs",
      status: "voided",
      statusDate: "2026-03-10",
      voidedReason: "Nepareizs daudzums",
      statusHistory: [
        { status: "proposed", date: "2026-01-01" },
        { status: "approved", date: "2026-01-05" },
        { status: "voided", date: "2026-03-10" },
      ],
    });
    const state = baseState({ baselineApprovedAt: "2025-12-01T00:00:00.000Z", variationOrders: [votedVo] });
    const log = computeAuditLog(state);

    // Chronological (newest first): voided (2026-03-10) -> approved (2026-01-05) -> proposed (2026-01-01) -> baseline (2025-12-01).
    expect(log).toEqual([
      { type: "vo_voided", date: "2026-03-10", refId: "vo-1", refLabel: "VO-1", actor: "Pasūtītājs", detail: "Nepareizs daudzums" },
      { type: "vo_approved", date: "2026-01-05", refId: "vo-1", refLabel: "VO-1", actor: "Pasūtītājs", detail: "Papildu darbi" },
      { type: "vo_proposed", date: "2026-01-01", refId: "vo-1", refLabel: "VO-1", actor: "Pasūtītājs", detail: "Papildu darbi" },
      { type: "baseline_approved", date: "2025-12-01T00:00:00.000Z", refId: "baseline", refLabel: "Bāzes tāme", actor: null, detail: null },
    ]);
  });

  it("emits vo_rejected for a rejected VO's statusHistory entry", () => {
    const rejectedVo = vo({
      status: "rejected",
      statusDate: "2026-01-05",
      statusHistory: [
        { status: "proposed", date: "2026-01-01" },
        { status: "rejected", date: "2026-01-05" },
      ],
    });
    const log = computeAuditLog(baseState({ variationOrders: [rejectedVo] }));
    expect(log.map((e) => e.type)).toEqual(["vo_rejected", "vo_proposed"]);
  });

  it("emits execution_record_created (and execution_record_voided when applicable) for each execution record", () => {
    const active = record({ id: "rec-1", period: "2026-01", date: "2026-01-31", approvedBy: "Inženieris A" });
    const voided = record({
      id: "rec-2",
      period: "2026-02",
      date: "2026-02-28",
      approvedBy: "Inženieris B",
      voidedAt: "2026-03-01",
      voidedReason: "Kļūdains skaitlis",
    });
    const log = computeAuditLog(baseState({ executionRecords: [active, voided] }));

    expect(log).toEqual([
      { type: "execution_record_voided", date: "2026-03-01", refId: "rec-2", refLabel: "Akts: 2026-02", actor: null, detail: "Kļūdains skaitlis" },
      { type: "execution_record_created", date: "2026-02-28", refId: "rec-2", refLabel: "Akts: 2026-02", actor: "Inženieris B", detail: "2026-02" },
      { type: "execution_record_created", date: "2026-01-31", refId: "rec-1", refLabel: "Akts: 2026-01", actor: "Inženieris A", detail: "2026-01" },
    ]);
  });

  it("interleaves baseline/VO/execution-record events into one chronological (newest-first) list", () => {
    const state = baseState({
      baselineApprovedAt: "2026-01-01T00:00:00.000Z",
      variationOrders: [vo({ id: "vo-1", number: "VO-1", statusHistory: [{ status: "proposed", date: "2026-01-10" }, { status: "approved", date: "2026-01-15" }] })],
      executionRecords: [record({ id: "rec-1", period: "2026-01", date: "2026-01-20" })],
    });
    const log = computeAuditLog(state);
    const dates = log.map((e) => e.date);
    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
    expect(log.map((e) => e.type)).toEqual(["execution_record_created", "vo_approved", "vo_proposed", "baseline_approved"]);
  });
});
