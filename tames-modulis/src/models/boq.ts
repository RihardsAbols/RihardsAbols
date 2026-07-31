export interface BoqItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
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
  sections: BoqSection[];
  createdAt: string;
  updatedAt: string;
}

// v2 added `vatRate` (see storage/migrations/index.ts for the v1->v2 migration).
export const CURRENT_SCHEMA_VERSION = 2;

/** Latvijas standarta PVN likme. */
export const DEFAULT_VAT_RATE = 0.21;

export function createEmptyBoqState(projectId: string, projectName: string): BoqState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId,
    projectName,
    vatRate: DEFAULT_VAT_RATE,
    sections: [],
    createdAt: now,
    updatedAt: now,
  };
}
