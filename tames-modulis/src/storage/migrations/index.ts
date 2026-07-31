import type { BoqState } from "../../models/boq.js";

export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version a migration upgrades FROM. Add v1->v2 etc. here as the
// schema evolves; each entry must produce data one version higher than its key.
const migrations: Record<number, Migration> = {};

export class UnsupportedSchemaVersionError extends Error {
  constructor(version: unknown) {
    super(`Neatbalstīta boq-state.json shēmas versija: ${String(version)}`);
    this.name = "UnsupportedSchemaVersionError";
  }
}

export function migrateToCurrent(raw: unknown): BoqState {
  if (typeof raw !== "object" || raw === null) {
    throw new UnsupportedSchemaVersionError(raw);
  }

  let data = raw as Record<string, unknown>;
  let version = typeof data.schemaVersion === "number" ? data.schemaVersion : 1;

  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new UnsupportedSchemaVersionError(version);
    }
    data = migrate(data);
    version += 1;
    data.schemaVersion = version;
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version);
  }

  data.schemaVersion = version;
  return data as unknown as BoqState;
}
