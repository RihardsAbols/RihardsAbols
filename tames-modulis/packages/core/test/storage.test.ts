import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyBoqState,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_OVERHEAD_RATE,
  DEFAULT_PROFIT_RATE,
  DEFAULT_VAT_RATE,
} from "../src/models/boq.js";
import { FileSystemStorageAdapter } from "../src/storage/adapters/FileSystemStorageAdapter.js";
import { migrateToCurrent, UnsupportedSchemaVersionError } from "../src/storage/migrations/index.js";

describe("FileSystemStorageAdapter", () => {
  let baseDir: string;
  let adapter: FileSystemStorageAdapter;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "boq-storage-"));
    adapter = new FileSystemStorageAdapter(baseDir);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("returns null when no state has been saved yet", async () => {
    const loaded = await adapter.load("project-does-not-exist");
    expect(loaded).toBeNull();
  });

  it("round-trips a BOQ state through save/load", async () => {
    const state = createEmptyBoqState("proj-1", "Testa projekts");
    state.sections.push({
      id: "sec-1",
      name: "Zemes darbi",
      estimateNumber: "1-1",
      items: [
        {
          id: "item-1",
          code: "1.1",
          description: "Augsnes noņemšana",
          unit: "m3",
          quantity: 120,
          unitLaborCost: 2,
          unitMaterialsCost: 1.5,
          unitMechanismsCost: 1,
        },
      ],
    });

    await adapter.save("proj-1", state);
    const loaded = await adapter.load("proj-1");

    expect(loaded).toEqual(state);
  });

  it("overwrites previous state on repeated saves", async () => {
    const first = createEmptyBoqState("proj-2", "Pirmā versija");
    await adapter.save("proj-2", first);

    const second = createEmptyBoqState("proj-2", "Otrā versija");
    await adapter.save("proj-2", second);

    const loaded = await adapter.load("proj-2");
    expect(loaded?.projectName).toBe("Otrā versija");
  });

  it("list() returns an empty array when no projects exist yet", async () => {
    expect(await adapter.list()).toEqual([]);
  });

  it("list() returns an entry per saved project", async () => {
    await adapter.save("proj-a", createEmptyBoqState("proj-a", "Projekts A"));
    await adapter.save("proj-b", createEmptyBoqState("proj-b", "Projekts B"));

    const listed = await adapter.list();
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.projectId).sort()).toEqual(["proj-a", "proj-b"]);
    expect(listed.find((p) => p.projectId === "proj-a")?.projectName).toBe("Projekts A");
  });

  it("delete() removes a saved project so it no longer loads or lists", async () => {
    await adapter.save("proj-c", createEmptyBoqState("proj-c", "Dzēšamais projekts"));

    await adapter.delete("proj-c");

    expect(await adapter.load("proj-c")).toBeNull();
    expect(await adapter.list()).toEqual([]);
  });

  it("delete() is idempotent for a project that never existed", async () => {
    await expect(adapter.delete("does-not-exist")).resolves.toBeUndefined();
  });
});

describe("migrateToCurrent", () => {
  it("passes through data already at the current schema version", () => {
    const state = createEmptyBoqState("proj-3", "Migrāciju tests");
    const migrated = migrateToCurrent(state);
    expect(migrated).toEqual(state);
  });

  it("treats missing schemaVersion as v1 and migrates it all the way up to current", () => {
    const legacy = { projectId: "proj-4", projectName: "Bez versijas", sections: [] };
    const migrated = migrateToCurrent(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.vatRate).toBe(DEFAULT_VAT_RATE);
    expect(migrated.overheadRate).toBe(DEFAULT_OVERHEAD_RATE);
    expect(migrated.profitRate).toBe(DEFAULT_PROFIT_RATE);
    expect(migrated.discountRate).toBe(DEFAULT_DISCOUNT_RATE);
    expect(migrated.contractor).toEqual({ name: "", regNr: "", address: "" });
    expect(migrated.client).toEqual({ name: "", regNr: "", address: "" });
    expect(migrated.preparedBy).toBe("");
    expect(migrated.checkedBy).toBe("");
    expect(migrated.baselineApprovedAt).toBeNull();
    expect(migrated.variationOrders).toEqual([]);
  });

  it("preserves an already-present discountRate instead of overwriting it during migration", () => {
    const v3 = {
      schemaVersion: 3,
      projectId: "proj-8",
      projectName: "v3 ar atlaidi",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0.07,
      sections: [],
    };
    const migrated = migrateToCurrent(v3);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.discountRate).toBe(0.07);
  });

  it("defaults contractor/client/preparedBy/checkedBy/estimateNumber when migrating v4 data that predates them", () => {
    const v4 = {
      schemaVersion: 4,
      projectId: "proj-9",
      projectName: "v4 bez rekvizītiem",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      sections: [{ id: "sec-1", name: "Sadaļa", items: [] }],
    };
    const migrated = migrateToCurrent(v4);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.contractor).toEqual({ name: "", regNr: "", address: "" });
    expect(migrated.client).toEqual({ name: "", regNr: "", address: "" });
    expect(migrated.preparedBy).toBe("");
    expect(migrated.checkedBy).toBe("");
    expect(migrated.sections[0].estimateNumber).toBe("");
  });

  it("preserves already-present contractor/client/preparedBy/checkedBy/estimateNumber during migration", () => {
    const v4 = {
      schemaVersion: 4,
      projectId: "proj-10",
      projectName: "v4 ar rekvizītiem",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "SIA Būvnieks", regNr: "40001234567", address: "Rīga" },
      client: { name: "SIA Pasūtītājs", regNr: "40007654321", address: "Rīga" },
      preparedBy: "Jānis Bērziņš",
      checkedBy: "Anna Kalniņa",
      sections: [{ id: "sec-1", name: "Sadaļa", estimateNumber: "1-1", items: [] }],
    };
    const migrated = migrateToCurrent(v4);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.contractor).toEqual({ name: "SIA Būvnieks", regNr: "40001234567", address: "Rīga" });
    expect(migrated.client).toEqual({ name: "SIA Pasūtītājs", regNr: "40007654321", address: "Rīga" });
    expect(migrated.preparedBy).toBe("Jānis Bērziņš");
    expect(migrated.checkedBy).toBe("Anna Kalniņa");
    expect(migrated.sections[0].estimateNumber).toBe("1-1");
  });

  it("defaults baselineApprovedAt/variationOrders when migrating v5 data that predates them", () => {
    const v5 = {
      schemaVersion: 5,
      projectId: "proj-11",
      projectName: "v5 bez VO",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
    };
    const migrated = migrateToCurrent(v5);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.baselineApprovedAt).toBeNull();
    expect(migrated.variationOrders).toEqual([]);
  });

  it("preserves already-present baselineApprovedAt/variationOrders during migration", () => {
    const vo = {
      id: "vo-1",
      number: "VO-1",
      title: "Papildu darbi",
      justification: "Pasūtītāja pieprasījums",
      instructedBy: "Pasūtītājs",
      date: "2026-01-01",
      status: "approved",
      statusDate: "2026-01-05",
      changes: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
    };
    const v5 = {
      schemaVersion: 5,
      projectId: "proj-12",
      projectName: "v5 ar VO",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
      baselineApprovedAt: "2025-12-01T00:00:00.000Z",
      variationOrders: [vo],
    };
    const migrated = migrateToCurrent(v5);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.baselineApprovedAt).toBe("2025-12-01T00:00:00.000Z");
    expect(migrated.variationOrders).toEqual([{ ...vo, voidedReason: null }]);
  });

  it("defaults executionRecords and backfills newSection: null on existing VO changes when migrating v6 data", () => {
    const v6 = {
      schemaVersion: 6,
      projectId: "proj-13",
      projectName: "v6 bez izpildes aktiem",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
      baselineApprovedAt: "2025-12-01T00:00:00.000Z",
      variationOrders: [
        {
          id: "vo-1",
          number: "VO-1",
          title: "Papildu darbi",
          justification: "",
          instructedBy: "",
          date: "2026-01-01",
          status: "approved",
          statusDate: "2026-01-05",
          changes: [
            { id: "c1", sectionId: "sec-1", itemId: "item-1", quantityDelta: 5, excluded: false, newItem: null },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
    };
    const migrated = migrateToCurrent(v6);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.executionRecords).toEqual([]);
    expect(migrated.variationOrders[0].changes[0]).toMatchObject({ id: "c1", newSection: null });
  });

  it("preserves already-present executionRecords/newSection during migration", () => {
    const executionRecord = {
      id: "rec-1",
      period: "2026-01",
      date: "2026-01-31",
      approvedBy: "Inženieris",
      entries: [{ id: "e1", sectionId: "sec-1", itemId: "item-1", executedQuantity: 10 }],
      createdAt: "2026-01-31T00:00:00.000Z",
      updatedAt: "2026-01-31T00:00:00.000Z",
    };
    const v6 = {
      schemaVersion: 6,
      projectId: "proj-14",
      projectName: "v6 ar izpildes aktiem",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
      baselineApprovedAt: "2025-12-01T00:00:00.000Z",
      variationOrders: [
        {
          id: "vo-1",
          number: "VO-1",
          title: "Jauna sadaļa",
          justification: "",
          instructedBy: "",
          date: "2026-01-01",
          status: "approved",
          statusDate: "2026-01-05",
          changes: [
            {
              id: "c1",
              sectionId: "c1",
              itemId: null,
              quantityDelta: 0,
              excluded: false,
              newItem: null,
              newSection: { name: "Papildu darbi", estimateNumber: "2-1" },
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
      executionRecords: [executionRecord],
    };
    const migrated = migrateToCurrent(v6);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.executionRecords).toEqual([{ ...executionRecord, voidedAt: null, voidedReason: null }]);
    expect(migrated.variationOrders[0].changes[0].newSection).toEqual({ name: "Papildu darbi", estimateNumber: "2-1" });
  });

  it("defaults voidedAt/voidedReason on execution records and voidedReason on VO when migrating v7 data", () => {
    const v7 = {
      schemaVersion: 7,
      projectId: "proj-15",
      projectName: "v7 bez anulēšanas laukiem",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
      baselineApprovedAt: "2025-12-01T00:00:00.000Z",
      variationOrders: [
        {
          id: "vo-1",
          number: "VO-1",
          title: "Papildu darbi",
          justification: "",
          instructedBy: "",
          date: "2026-01-01",
          status: "approved",
          statusDate: "2026-01-05",
          changes: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-05T00:00:00.000Z",
        },
      ],
      executionRecords: [
        {
          id: "rec-1",
          period: "2026-01",
          date: "2026-01-31",
          approvedBy: "Inženieris",
          entries: [],
          createdAt: "2026-01-31T00:00:00.000Z",
          updatedAt: "2026-01-31T00:00:00.000Z",
        },
      ],
    };
    const migrated = migrateToCurrent(v7);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.executionRecords[0]).toMatchObject({ voidedAt: null, voidedReason: null });
    expect(migrated.variationOrders[0]).toMatchObject({ voidedReason: null });
  });

  it("preserves already-present voidedAt/voidedReason during v7->v8 migration", () => {
    const v7 = {
      schemaVersion: 7,
      projectId: "proj-16",
      projectName: "v7 ar jau anulētu aktu/VO",
      vatRate: 0.21,
      overheadRate: 0.12,
      profitRate: 0.05,
      discountRate: 0,
      contractor: { name: "", regNr: "", address: "" },
      client: { name: "", regNr: "", address: "" },
      preparedBy: "",
      checkedBy: "",
      sections: [],
      baselineApprovedAt: "2025-12-01T00:00:00.000Z",
      variationOrders: [
        {
          id: "vo-1",
          number: "VO-1",
          title: "Papildu darbi",
          justification: "",
          instructedBy: "",
          date: "2026-01-01",
          status: "voided",
          statusDate: "2026-02-01",
          voidedReason: "Nepareizs daudzums",
          changes: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      executionRecords: [
        {
          id: "rec-1",
          period: "2026-01",
          date: "2026-01-31",
          approvedBy: "Inženieris",
          entries: [],
          voidedAt: "2026-02-01T00:00:00.000Z",
          voidedReason: "Kļūdains skaitlis",
          createdAt: "2026-01-31T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
      ],
    };
    const migrated = migrateToCurrent(v7);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.executionRecords[0].voidedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(migrated.executionRecords[0].voidedReason).toBe("Kļūdains skaitlis");
    expect(migrated.variationOrders[0].voidedReason).toBe("Nepareizs daudzums");
  });

  it("preserves an already-present vatRate instead of overwriting it during migration", () => {
    const v1 = { schemaVersion: 1, projectId: "proj-6", projectName: "v1 ar PVN", vatRate: 0.12, sections: [] };
    const migrated = migrateToCurrent(v1);
    expect(migrated.vatRate).toBe(0.12);
  });

  it("folds a v2 item's unitPrice into unitMaterialsCost, zeroing labor/mechanisms", () => {
    const v2 = {
      schemaVersion: 2,
      projectId: "proj-7",
      projectName: "v2 dati",
      vatRate: 0.21,
      sections: [
        {
          id: "sec-1",
          name: "Sadaļa",
          items: [{ id: "item-1", code: "1.1", description: "Pozīcija", unit: "m2", quantity: 10, unitPrice: 4.5 }],
        },
      ],
    };

    const migrated = migrateToCurrent(v2);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.overheadRate).toBe(DEFAULT_OVERHEAD_RATE);
    expect(migrated.profitRate).toBe(DEFAULT_PROFIT_RATE);
    expect(migrated.sections[0].items[0]).toEqual({
      id: "item-1",
      code: "1.1",
      description: "Pozīcija",
      unit: "m2",
      quantity: 10,
      unitLaborCost: 0,
      unitMaterialsCost: 4.5,
      unitMechanismsCost: 0,
    });
  });

  it("throws for a schema version newer than this code understands", () => {
    const fromTheFuture = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateToCurrent(fromTheFuture)).toThrow(UnsupportedSchemaVersionError);
  });
});
