import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DISCOUNT_RATE,
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
  // v3 had no discountRate field; default to no discount.
  3: (data) => ({
    ...data,
    discountRate: typeof data.discountRate === "number" ? data.discountRate : DEFAULT_DISCOUNT_RATE,
  }),
  // v4 had no contractor/client rekvizīti, preparedBy/checkedBy (Excel
  // export header/signature fields), or per-section estimateNumber.
  4: (data) => ({
    ...data,
    contractor: migrateCompanyDetails(data.contractor),
    client: migrateCompanyDetails(data.client),
    preparedBy: typeof data.preparedBy === "string" ? data.preparedBy : "",
    checkedBy: typeof data.checkedBy === "string" ? data.checkedBy : "",
    sections: Array.isArray(data.sections)
      ? data.sections.map((section) => migrateSectionV4ToV5(section as Record<string, unknown>))
      : data.sections,
  }),
  // v5 had no baselineApprovedAt/variationOrders (Tāmes izmaiņu/Variation
  // Order vadība) - default to "no baseline frozen yet, no VOs", equivalent
  // to a project that never used the feature.
  5: (data) => ({
    ...data,
    baselineApprovedAt: typeof data.baselineApprovedAt === "string" ? data.baselineApprovedAt : null,
    variationOrders: Array.isArray(data.variationOrders) ? data.variationOrders : [],
  }),
  // v6 had no executionRecords (izpildes aktu vēsture) and its VO changes had
  // no newSection field (VO could only add items to existing sections, not
  // create new ones) - default executionRecords to empty, and backfill
  // newSection: null on every existing change so older VOs keep working
  // unchanged with the new (slightly larger) VariationOrderChange shape.
  6: (data) => ({
    ...data,
    executionRecords: Array.isArray(data.executionRecords) ? data.executionRecords : [],
    variationOrders: Array.isArray(data.variationOrders)
      ? data.variationOrders.map((vo) => migrateVariationOrderV6ToV7(vo as Record<string, unknown>))
      : data.variationOrders,
  }),
};

function migrateVariationOrderV6ToV7(vo: Record<string, unknown>): Record<string, unknown> {
  return {
    ...vo,
    changes: Array.isArray(vo.changes)
      ? vo.changes.map((change) => {
          const c = change as Record<string, unknown>;
          return { ...c, newSection: c.newSection ?? null };
        })
      : vo.changes,
  };
}

function migrateCompanyDetails(value: unknown): { name: string; regNr: string; address: string } {
  const v = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    name: typeof v.name === "string" ? v.name : "",
    regNr: typeof v.regNr === "string" ? v.regNr : "",
    address: typeof v.address === "string" ? v.address : "",
  };
}

function migrateSectionV4ToV5(section: Record<string, unknown>): Record<string, unknown> {
  return {
    ...section,
    estimateNumber: typeof section.estimateNumber === "string" ? section.estimateNumber : "",
  };
}

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
