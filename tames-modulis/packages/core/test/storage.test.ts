import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyBoqState,
  CURRENT_SCHEMA_VERSION,
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
