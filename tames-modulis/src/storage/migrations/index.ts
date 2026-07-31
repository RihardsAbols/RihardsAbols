import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_OVERHEAD_RATE,
  DEFAULT_PROFIT_RATE,
  DEFAULT_VAT_RATE,
  type BoqState,
} from "../../models/boq.js";

export { CURRENT_SCHEMA_VERSION };

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

// Keyed by the version a migration upgrades FROM. Add v1->v2 etc. here as the
// schema evolves; each entry must produce data one version higher than its key.
const migrations: Record<number, Migration> = {
  // v1 had no vatRate field; default new BOQ calculations to the standard LV rate.
  1: (data) => ({
    ...data,
    vatRate: typeof data.vatRate === "number" ? data.vatRate : DEFAULT_VAT_RATE,
  }),
  // v2 items had a single `unitPrice` instead of a labor/materials/mechanisms
  // split. There is no way to recover that split from a single number, so we
  // fold the whole v2 unitPrice into unitMaterialsCost (an approximation, not
  // a correction) and zero the other two components. Also adds the new
  // project-level overheadRate/profitRate.
  2: (data) => ({
    ...data,
    overheadRate: typeof data.overheadRate === "number" ? data.overheadRate : DEFAULT_OVERHEAD_RATE,
    profitRate: typeof data.profitRate === "number" ? data.profitRate : DEFAULT_PROFIT_RATE,
    sections: Array.isArray(data.sections)
      ? data.sections.map((section) => migrateSectionV2ToV3(section as Record<string, unknown>))
      : data.sections,
  }),
};

function migrateSectionV2ToV3(section: Record<string, unknown>): Record<string, unknown> {
  return {
    ...section,
    items: Array.isArray(section.items)
      ? section.items.map((item) => migrateItemV2ToV3(item as Record<string, unknown>))
      : section.items,
  };
}

function migrateItemV2ToV3(item: Record<string, unknown>): Record<string, unknown> {
  const { unitPrice, ...rest } = item;
  return {
    ...rest,
    unitLaborCost: typeof item.unitLaborCost === "number" ? item.unitLaborCost : 0,
    unitMaterialsCost:
      typeof item.unitMaterialsCost === "number" ? item.unitMaterialsCost : typeof unitPrice === "number" ? unitPrice : 0,
    unitMechanismsCost: typeof item.unitMechanismsCost === "number" ? item.unitMechanismsCost : 0,
  };
}

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
