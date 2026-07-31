import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyBoqState } from "../src/models/boq.js";
import { FileSystemStorageAdapter } from "../src/storage/adapters/FileSystemStorageAdapter.js";
import {
  CURRENT_SCHEMA_VERSION,
  migrateToCurrent,
  UnsupportedSchemaVersionError,
} from "../src/storage/migrations/index.js";

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
          unitPrice: 4.5,
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
});

describe("migrateToCurrent", () => {
  it("passes through data already at the current schema version", () => {
    const state = createEmptyBoqState("proj-3", "Migrāciju tests");
    const migrated = migrateToCurrent(state);
    expect(migrated).toEqual(state);
  });

  it("treats missing schemaVersion as v1", () => {
    const legacy = { projectId: "proj-4", projectName: "Bez versijas", sections: [] };
    const migrated = migrateToCurrent(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("throws for a schema version newer than this code understands", () => {
    const fromTheFuture = { schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateToCurrent(fromTheFuture)).toThrow(UnsupportedSchemaVersionError);
  });
});
