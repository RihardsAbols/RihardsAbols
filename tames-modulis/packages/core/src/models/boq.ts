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
  /**
   * Manuāli ievadāms tāmes numurs (piem. "1-1"), neatkarīgs no sadaļas
   * nosaukuma un no Excel eksporta lapas nosaukuma - reāli Līguma tāmju
   * faili bieži numurē lokālās tāmes citādi, nekā ir nosaukta pati lapa
   * (skat. excel/export.ts "Lokālā tāme Nr." Excel eksportā).
   */
  estimateNumber: string;
  items: BoqItem[];
}

/** Uzņēmuma rekvizīti (Būvuzņēmējam vai Pasūtītājam). */
export interface CompanyDetails {
  name: string;
  regNr: string;
  address: string;
}

export function createEmptyCompanyDetails(): CompanyDetails {
  return { name: "", regNr: "", address: "" };
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
  /**
   * Atlaides likme no tiešajām izmaksām, piem. 0.05 nozīmē 5%. Atskaitīta
   * PIRMS virsizdevumiem/peļņas (skat. calculations/boq.ts summarizeBoq).
   * Projekta līmenī, ne pa sadaļām/pozīcijām.
   */
  discountRate: number;
  /**
   * Būvuzņēmēja un Pasūtītāja rekvizīti, un tāmes sastādītāja/pārbaudītāja
   * vārds/uzvārds - projekta līmenī (vieni visam projektam), rādās katrā
   * Excel eksporta lapā (skat. excel/export.ts).
   */
  contractor: CompanyDetails;
  client: CompanyDetails;
  preparedBy: string;
  checkedBy: string;
  sections: BoqSection[];
  createdAt: string;
  updatedAt: string;
}

// v5 pievienoja projekta līmeņa contractor/client rekvizītus un
// preparedBy/checkedBy (Excel eksporta galvenes/paraksta lauki), kā arī
// sadaļas līmeņa estimateNumber (manuāla tāmes numerācija). v4 pievienoja
// projekta līmeņa discountRate (atskaitīta no tiešajām izmaksām pirms
// virsizdevumiem/peļņas). v3 replaced the single `unitPrice` with a darba
// alga/materiāli/mehānismi split and added overheadRate/profitRate,
// matching the Līguma tāme format used by the izpildes-akts-validacija skill
// (see storage/migrations).
export const CURRENT_SCHEMA_VERSION = 5;

/** Latvijas standarta PVN likme. */
export const DEFAULT_VAT_RATE = 0.21;

/** Standarta virsizdevumu likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_OVERHEAD_RATE = 0.12;

/** Standarta peļņas likme (skat. izpildes-akts-validacija skill). */
export const DEFAULT_PROFIT_RATE = 0.05;

/** Noklusējuma atlaides likme - bez atlaides. */
export const DEFAULT_DISCOUNT_RATE = 0;

export function createEmptyBoqState(projectId: string, projectName: string): BoqState {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projectId,
    projectName,
    vatRate: DEFAULT_VAT_RATE,
    overheadRate: DEFAULT_OVERHEAD_RATE,
    profitRate: DEFAULT_PROFIT_RATE,
    discountRate: DEFAULT_DISCOUNT_RATE,
    contractor: createEmptyCompanyDetails(),
    client: createEmptyCompanyDetails(),
    preparedBy: "",
    checkedBy: "",
    sections: [],
    createdAt: now,
    updatedAt: now,
  };
}
