export interface BoqItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  /** Vienības izmaksa - darba alga (EUR/vienība). */
  unitLaborCost: number;
  /** Vienības izmaksa - materiāli (EUR/vienība). */
  unitMaterialsCost: number;
  /** Vienības izmaksa - mehānismi (EUR/vienība). */
  unitMechanismsCost: number;
}

export interface BoqSection {
  id: string;
  name: string;
  items: BoqItem[];
}

export interface BoqState {
  schemaVersion: number;
  projectId: string;
  projectName: string;
  /** PVN likme daļskaitlī, piem. 0.21 nozīmē 21%. */
  vatRate: number;
  /** Virsizdevumu likme no tiešajām izmaksām, piem. 0.12 nozīmē 12%. */
  overheadRate: number;
  /** Peļņas likme no tiešajām izmaksām, piem. 0.05 nozīmē 5%. */
  profitRate: number;
  sections: BoqSection[];
  createdAt: string;
  updatedAt: string;
}

// v3 replaced the single `unitPrice` with a darba alga/materiāli/mehānismi
// split and added overheadRate/profitRate, matching the Līguma tāme format
// used by the izpildes-akts-validacija skill (see storage/migrations).
export const CURRENT_SCHEMA_VERSION = 3;

/** Latvijas standarta PVN likme. */
export const DEFAULT_VAT_RATE = 0.21;

/** Standarta virsizdevumu likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_OVERHEAD_RATE = 0.12;

/** Standarta peļņas likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_PROFIT_RATE = 0.05;

export function createEmptyBoqState(projectId: string, projectName: string): BoqState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId,
    projectName,
    vatRate: DEFAULT_VAT_RATE,
    overheadRate: DEFAULT_OVERHEAD_RATE,
    profitRate: DEFAULT_PROFIT_RATE,
    sections: [],
    createdAt: now,
    updatedAt: now,
  };
}
